// ─── Annulation d'événement : remboursements (#71) ────────────────────────────
// Rembourser les acheteurs d'un événement ANNULÉ, en séparant les deux rails :
//
//  • Stripe (EUR / carte)  → remboursement AUTOMATIQUE par API, UNE FOIS PAR
//    PAIEMENT. Une session Checkout = un payment_intent qui couvre TOUS les
//    billets du même panier : rembourser par billet re-rembourserait le même
//    paiement N fois. On regroupe donc par stripeSessionId.
//      - mode Connect 'auto' (destination charge) : l'argent est déjà parti au
//        compte du vendeur ; reverse_transfer récupère sa part, refund_application_fee
//        rend le frais plateforme → l'acheteur est intégralement remboursé sans
//        que la plateforme n'avance la part du vendeur.
//      - mode 'ledger'/'none' : la plateforme a tout encaissé → remboursement
//        simple, et on RENVERSE le crédit interne seller_balances (sinon le solde
//        vendeur afficherait un dû qu'il ne doit plus toucher).
//
//  • FedaPay (XOF / mobile money) → AUCUN endpoint de remboursement (dashboard
//    marchand uniquement, cf. mémoire fedapay-remboursement-dashboard-only). On
//    écrit une LISTE À TRAITER (worklist) : email + montant + transaction, à
//    exécuter à la main dans FedaPay. L'argent reste gardé : lib/eventPayouts.js
//    bloque déjà tout versement d'un event `cancelled` → rien n'est parti au
//    vendeur, tout est disponible pour rembourser.
//
// IDEMPOTENT : rejouer l'annulation ne rembourse jamais deux fois. Double garde :
//  1. clé d'idempotence Stripe (même clé → même remboursement, jamais un 2e) ;
//  2. doc event_refunds/{eventId}__{paymentRef} : audit + court-circuit (statut
//     'refunded' → on ne retente pas) + flag ledgerReversed (renversement unique).

// Regroupe les billets PAYÉS par référence de paiement.
// IMPORTANT (correctif audit #71) : on N'EXCLUT PAS `t.cancelled`. Un billet déjà
// marqué annulé par un run PRÉCÉDENT doit rester regroupé pour que le rejeu de
// cancel_event RETENTE son remboursement s'il avait échoué (Stripe 5xx, réseau,
// renversement ledger interrompu). L'anti-double-remboursement est porté par le
// doc event_refunds/{eventId}__{ref} (status 'refunded' → court-circuit) + la clé
// d'idempotence Stripe, JAMAIS par l'état `cancelled` du billet. Sinon un vrai
// payeur dont le remboursement a échoué une fois n'est jamais remboursé.
// `revoked` reste exclu : un siège repris par l'hôte n'est pas un paiement propre
// (l'hôte a payé la table entière — son billet porte déjà le stripeSessionId).
export function groupTicketsByPayment(tickets) {
  const stripe = new Map()
  const fedapay = new Map()
  const orphans = []
  for (const t of (tickets || [])) {
    if (!t || t.paid !== true) continue
    if (t.revoked === true) continue
    if (t.stripeSessionId) {
      const key = String(t.stripeSessionId)
      const g = stripe.get(key) || { paymentRef: key, provider: 'stripe', tickets: [] }
      g.tickets.push(t); stripe.set(key, g)
    } else if (t.fedapayTxnId) {
      const key = String(t.fedapayTxnId)
      const g = fedapay.get(key) || { paymentRef: key, provider: 'fedapay', tickets: [] }
      g.tickets.push(t); fedapay.set(key, g)
    } else {
      // Billet payé SANS référence de paiement (ne devrait pas arriver : le
      // webhook écrit toujours stripeSessionId ou fedapayTxnId). Jamais remboursé
      // à l'aveugle — on le remonte pour revue manuelle.
      orphans.push(t)
    }
  }
  return { stripe: [...stripe.values()], fedapay: [...fedapay.values()], orphans }
}

// Paramètres de remboursement Stripe selon le mode d'encaissement Connect.
export function stripeRefundParams(connectMode) {
  return String(connectMode) === 'auto'
    ? { reverse_transfer: true, refund_application_fee: true }
    : {}
}

export function refundDocId(eventId, paymentRef) {
  return `${String(eventId)}__${String(paymentRef)}`
}

// Clé d'idempotence Stripe : STABLE par (event, paiement) → un rejeu de
// l'annulation ne crée jamais un second remboursement du même paiement.
export function refundIdempotencyKey(eventId, paymentRef) {
  return `evcancel-${String(eventId)}-${String(paymentRef)}`.slice(0, 255)
}

// Montant remboursable d'un paiement Stripe = tout ce que l'acheteur a payé
// (billets + précommandes + frais de service). owedCents = part vendeur à
// renverser du ledger interne (total - frais plateforme).
export function stripeAmounts(amountTotalCents, feeCents) {
  const total = Math.max(0, Number(amountTotalCents) || 0)
  const fee = Math.max(0, Number(feeCents) || 0)
  return { amountCents: total, owedCents: Math.max(0, total - fee) }
}

// ── Orchestration (impure : Stripe API + Admin SDK Firestore) ─────────────────

// Rembourse UN paiement Stripe (idempotent). db = Admin SDK, FieldValue = Admin
// FieldValue. → { ok, refundId, amountCents, skipped } | { ok:false, reason }.
export async function refundStripePayment(stripe, db, FieldValue, { eventId, paymentRef }) {
  const docRef = db.collection('event_refunds').doc(refundDocId(eventId, paymentRef))
  const existing = await docRef.get()
  if (existing.exists && existing.data().status === 'refunded') {
    return { ok: true, refundId: existing.data().refundId || null, amountCents: Number(existing.data().amountCents) || 0, skipped: true }
  }

  // Session → payment_intent + métadonnées Connect (comme le webhook), puis
  // remboursement. Tout échec Stripe (5xx / rate-limit / réseau) laisse une trace
  // DURABLE (doc status 'failed') pour l'audit et la visibilité admin, puis relance
  // l'erreur pour qu'elle soit collectée dans stripeFailed. Un doc 'failed' ≠
  // 'refunded' → le rejeu de cancel_event RETENTE (la clé d'idempotence Stripe
  // garantit qu'un remboursement déjà passé n'est jamais dupliqué).
  let session, paymentIntent, connectMode, sellerUid, amountCents, owedCents, refund
  try {
    session = await stripe.checkout.sessions.retrieve(String(paymentRef))
    paymentIntent = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id
    connectMode = session.metadata?.connectMode || 'none'
    sellerUid = session.metadata?.sellerUid || ''
    ;({ amountCents, owedCents } = stripeAmounts(session.amount_total, session.metadata?.feeCents))

    if (!paymentIntent) {
      // Session sans paiement abouti → rien à rembourser (trace, non bloquant).
      await docRef.set({
        eventId: String(eventId), provider: 'stripe', paymentRef: String(paymentRef),
        status: 'no_payment', currency: session.currency || 'eur', updatedAt: Date.now(),
      }, { merge: true })
      return { ok: false, reason: 'no_payment_intent', amountCents: 0 }
    }

    refund = await stripe.refunds.create(
      { payment_intent: paymentIntent, ...stripeRefundParams(connectMode) },
      { idempotencyKey: refundIdempotencyKey(eventId, paymentRef) },
    )
  } catch (e) {
    // Trace durable de l'échec (best-effort) puis relance → collecté par l'appelant.
    try {
      await docRef.set({
        eventId: String(eventId), provider: 'stripe', paymentRef: String(paymentRef),
        status: 'failed', error: String(e && e.message || '').slice(0, 300), updatedAt: Date.now(),
      }, { merge: true })
    } catch { /* best-effort : ne masque pas l'erreur d'origine */ }
    throw e
  }

  // Renversement du crédit ledger vendeur (mode 'ledger') + écriture du doc de
  // remboursement, EN TRANSACTION : le flag ledgerReversed garantit un unique
  // renversement même si l'étape Stripe a été rejouée (clé d'idempotence).
  const bookingId = session.metadata?.bookingId
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef)
    // Cohérence crédit/renversement (audit #71) : ne renverser le ledger vendeur
    // QUE si le crédit a réellement eu lieu (bookings/{id}.settled === true, posé
    // dans la MÊME transaction que le crédit → settled ⟺ crédité). La garde
    // anti-course du webhook peut avoir SAUTÉ le crédit pour ce paiement : renverser
    // décrémenterait alors un solde jamais crédité (sous-paiement de l'organisateur
    // sur ses autres ventes). Sans booking identifiable, on ne renverse pas.
    let credited = false
    if (bookingId) {
      const bSnap = await tx.get(db.collection('bookings').doc(String(bookingId)))
      credited = bSnap.exists && bSnap.data().settled === true
    }
    const alreadyReversed = snap.exists && snap.data().ledgerReversed === true
    const doReverse = connectMode === 'ledger' && sellerUid && owedCents > 0 && !alreadyReversed && credited
    if (doReverse) {
      tx.set(db.collection('seller_balances').doc(String(sellerUid)), {
        sellerUid: String(sellerUid),
        amountDueCents: FieldValue.increment(-owedCents),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    tx.set(docRef, {
      eventId: String(eventId), provider: 'stripe', paymentRef: String(paymentRef),
      status: 'refunded', refundId: refund.id, amountCents,
      currency: session.currency || 'eur',
      buyerEmail: session.customer_details?.email || null,
      connectMode, sellerUid: sellerUid || null,
      ledgerReversed: alreadyReversed || doReverse,
      refundedAt: Date.now(), updatedAt: Date.now(),
    }, { merge: true })
  })

  return { ok: true, refundId: refund.id, amountCents, skipped: false }
}

// Remboursement d'un paiement Stripe confirmé APRÈS l'annulation de l'événement
// (course : la session Checkout était ouverte AVANT l'annulation, l'acheteur paie
// APRÈS). Le webhook rembourse au lieu d'émettre un billet → contrairement à
// refundStripePayment, on NE renverse PAS seller_balances : ce chemin n'a JAMAIS
// crédité le ledger interne. En mode 'auto' (destination charge), Stripe a déjà
// transféré au vendeur à l'encaissement → reverse_transfer récupère sa part.
// Idempotent (même clé + même doc event_refunds que le flux normal → jamais 2×).
export async function refundPostCancellationStripe(stripe, db, { eventId, session }) {
  const paymentRef = String(session.id)
  const docRef = db.collection('event_refunds').doc(refundDocId(eventId, paymentRef))
  const existing = await docRef.get()
  if (existing.exists && existing.data().status === 'refunded') return { ok: true, skipped: true }
  const paymentIntent = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id
  if (!paymentIntent) return { ok: false, reason: 'no_payment_intent' }
  const connectMode = session.metadata?.connectMode || 'none'
  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntent, ...stripeRefundParams(connectMode) },
    { idempotencyKey: refundIdempotencyKey(eventId, paymentRef) },
  )
  await docRef.set({
    eventId: String(eventId), provider: 'stripe', paymentRef,
    status: 'refunded', refundId: refund.id,
    amountCents: Number(session.amount_total) || 0,
    currency: session.currency || 'eur',
    buyerEmail: session.customer_details?.email || null,
    reason: 'paid_after_cancel', ledgerReversed: false,
    refundedAt: Date.now(), updatedAt: Date.now(),
  }, { merge: true })
  return { ok: true, refundId: refund.id }
}

// Inscrit UN paiement FedaPay dans la liste de remboursement manuel (idempotent).
// Pas d'appel API (FedaPay n'en a pas) : on prépare le travail pour le dashboard.
export async function recordFedapayRefund(db, { eventId, paymentRef, tickets }) {
  const docRef = db.collection('event_refunds').doc(refundDocId(eventId, paymentRef))
  const existing = await docRef.get()
  if (existing.exists && ['refunded', 'pending_manual'].includes(existing.data().status)) {
    return { ok: true, skipped: true, status: existing.data().status }
  }
  const txnSnap = await db.collection('fedapay_txns').doc(String(paymentRef)).get()
  const txn = txnSnap.exists ? txnSnap.data() : {}
  const amountXOF = Math.max(0, Number(txn.amountTotal ?? txn.amount) || 0)
  await docRef.set({
    eventId: String(eventId), provider: 'fedapay', paymentRef: String(paymentRef),
    status: 'pending_manual', // à rembourser à la main dans le dashboard FedaPay
    amountXOF, currency: 'XOF',
    buyerEmail: txn.userEmail || null,
    ticketCount: Array.isArray(tickets) ? tickets.length : 0,
    createdAt: Date.now(), updatedAt: Date.now(),
  }, { merge: true })
  return { ok: true, skipped: false, status: 'pending_manual' }
}

// Traite TOUS les remboursements d'un événement annulé. Ne jette jamais : un
// échec sur un paiement est collecté (stripeFailed) sans bloquer les autres.
export async function processEventRefunds(stripe, db, FieldValue, { eventId, tickets }) {
  const { stripe: stripeGroups, fedapay: fedapayGroups, orphans } = groupTicketsByPayment(tickets)
  const results = {
    stripeRefunded: [], stripeFailed: [], fedapayWorklist: [],
    orphans: orphans.map(t => t.ticketCode).filter(Boolean),
  }
  for (const g of stripeGroups) {
    try {
      const r = await refundStripePayment(stripe, db, FieldValue, { eventId, paymentRef: g.paymentRef })
      if (r.ok) results.stripeRefunded.push({ paymentRef: g.paymentRef, refundId: r.refundId, amountCents: r.amountCents, skipped: !!r.skipped })
      else results.stripeFailed.push({ paymentRef: g.paymentRef, reason: r.reason })
    } catch (e) {
      results.stripeFailed.push({ paymentRef: g.paymentRef, reason: e.message })
    }
  }
  for (const g of fedapayGroups) {
    try {
      const r = await recordFedapayRefund(db, { eventId, paymentRef: g.paymentRef, tickets: g.tickets })
      results.fedapayWorklist.push({ paymentRef: g.paymentRef, status: r.status })
    } catch (e) {
      results.fedapayWorklist.push({ paymentRef: g.paymentRef, status: 'error', error: e.message })
    }
  }
  return results
}
