// Vercel Serverless Function — Paiements FedaPay (mobile money Togo/Bénin).
// Endpoint unifié (plan Hobby, 12 fonctions max) :
//   POST /api/fedapay { action:'checkout', ... }  → crée la transaction + lien de paiement
//   POST /api/fedapay { action:'release', transactionId } → restock après annulation (retour client)
//   GET  /api/fedapay?id=<txnId>                  → vérifie une transaction (retour paiement)
//   POST /api/fedapay (header x-fedapay-signature) → webhook FedaPay (source de vérité)
//
// Miroir du tunnel Stripe (api/checkout.js + api/stripe-webhook.js) pour la zone
// FCFA : mêmes protections (auth, frais serveur, décrément atomique du stock,
// idempotence, registre anti-fraude tickets/), devise XOF (montants ENTIERS).
//
// Différence clé vs Stripe : pas de « split » à la volée (pas d'équivalent
// Connect) → la plateforme encaisse 100 % et crédite seller_balances (champ
// amountDueXOF, jamais mélangé aux centimes EUR) ; reversement via Payout
// FedaPay vers le mobile money de l'organisateur.
//
// Env Vercel requis : FEDAPAY_SECRET_KEY, FEDAPAY_WEBHOOK_SECRET (+ Firebase Admin).
// Webhook à configurer côté FedaPay : https://liveinblack.com/api/fedapay
// (événements transaction.approved / canceled / declined / updated).

import { getDb, FieldValue } from '../lib/firebaseAdmin.js'
import { computeTicketFeeXOF } from '../lib/fees.js'
import {
  createTransaction, createToken, getTransaction,
  verifyWebhookSignature, isFedapayConfigured,
} from '../lib/fedapay.js'
import { requireAuth } from '../lib/verifyAuth.js'

// Raw body indispensable pour vérifier la signature du webhook.
export const config = {
  api: { bodyParser: false },
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  // ── Webhook FedaPay (signé — pas de token Firebase, c'est FedaPay qui parle) ──
  if (req.method === 'POST' && req.headers['x-fedapay-signature']) {
    return webhook(req, res)
  }

  if (req.method === 'GET') return verify(req, res)

  if (req.method === 'POST') {
    if (!isFedapayConfigured()) {
      return res.status(500).json({ error: "Le paiement mobile money n'est pas encore activé. Réessaie bientôt." })
    }
    let body = {}
    try {
      const raw = await readRawBody(req)
      body = raw.length ? JSON.parse(raw.toString('utf8')) : {}
    } catch {
      return res.status(400).json({ error: 'Corps JSON invalide' })
    }
    if (body.action === 'checkout') return checkout(req, res, body)
    if (body.action === 'release') return release(req, res, body)
    return res.status(400).json({ error: "action doit être 'checkout' ou 'release'" })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

// ─── Checkout billets (miroir XOF de api/checkout.js) ────────────────────────
async function checkout(req, res, body) {
  const caller = await requireAuth(req, res)
  if (!caller) return

  try {
    const {
      eventId, eventName, placeType, qty = 1,
      preorderItems = [], userEmail, userName,
      bookingId, groupBookingId, isGroupShare,
      isTable, // achat d'une TABLE entière (place de groupe) — modèle « hôte »
    } = body
    // Identité du payeur = TOUJOURS le token vérifié (jamais le body) : le
    // webhook s'en sert pour user_bookings, les points ET payments[uid] des
    // groupes — un userId client permettrait de marquer la part d'autrui payée.
    const userId = caller.uid

    if (!eventId || !eventName || !placeType || !bookingId) {
      return res.status(400).json({ error: 'Missing required fields' })
    }
    const nQty = Math.max(1, Math.min(20, Math.floor(Number(qty)) || 1))

    const db = getDb()

    // ── Prix SERVEUR (jamais celui du client — faille corrigée vs ancien tunnel).
    // Les events FCFA sont tous des docs Firestore réels → on exige le doc.
    const evSnap = await db.collection('events').doc(String(eventId)).get()
    if (!evSnap.exists) return res.status(404).json({ error: 'Événement introuvable' })
    const ev = evSnap.data()
    // Devise EXPLICITE uniquement : les events créés avant le multi-devise ont
    // des prix saisis en euros même avec region=Togo → ils restent sur Stripe.
    if (String(ev.currency || '').toUpperCase() !== 'XOF') {
      return res.status(400).json({ error: 'Cet événement se paie en euros (tunnel Stripe).' })
    }
    const sellerUid = ev.organizerId || ev.createdBy || ''
    const places = ev.places || []
    const place = places.find(p => p.type === placeType) || null

    // Mutuellement exclusifs : une part de groupe n'est pas une table entière.
    if (isTable && isGroupShare) {
      return res.status(400).json({ error: 'Requête invalide (table et part de groupe simultanées).' })
    }

    let unitPrice = 0 // FCFA entiers
    if (isGroupShare) {
      // Part de résa de groupe : le montant est une PART du total, pas un tarif
      // de place. Validation STRICTE — un doc group_bookings peut être forgé par
      // n'importe quel utilisateur (règles Firestore), donc le plancher de prix
      // vient de l'ÉVÉNEMENT, jamais du doc de groupe seul.
      if (!groupBookingId) return res.status(400).json({ error: 'groupBookingId requis pour une part de groupe' })
      const gbSnap = await db.collection('group_bookings').doc(String(groupBookingId)).get()
      if (!gbSnap.exists) return res.status(404).json({ error: 'Réservation de groupe introuvable' })
      const gb = gbSnap.data()
      if (String(gb.eventId) !== String(eventId)) {
        return res.status(400).json({ error: 'Cette réservation de groupe concerne un autre événement.' })
      }
      const members = Array.isArray(gb.participantIds) ? gb.participantIds : []
      if (!members.includes(caller.uid)) {
        return res.status(403).json({ error: 'Tu ne fais pas partie de cette réservation de groupe.' })
      }
      // ── Plancher par part = tarif réel de la place ÷ nombre MAX de partageurs
      // (groupMax), dérivé de l'ÉVÉNEMENT (fiable). Ex. table à 60 000 FCFA
      // partageable par 6 → part minimale légitime = 10 000. Descendre sous ce
      // plancher est impossible même en gonflant le nombre de participants avec
      // de faux comptes (le plancher ne dépend PAS du total du doc, forgeable).
      const withdrawn = new Set(Array.isArray(gb.withdrawnMembers) ? gb.withdrawnMembers : [])
      const activeCount = Math.max(1, members.filter(m => !withdrawn.has(m)).length)
      let floor
      if (place) {
        const P = Math.round(Number(place.price) || 0)
        const G = Math.max(1, Number(place.groupMax) || 1)
        floor = Math.floor(P / G)
      } else {
        // Place absente (booking legacy) : plancher = billet payant le moins cher
        // de l'event ÷ nombre de participants actifs.
        const paidPrices = places.map(p => Math.round(Number(p.price) || 0)).filter(p => p > 0)
        const minPaid = paidPrices.length ? Math.min(...paidPrices) : 0
        floor = Math.floor(minPaid / activeCount)
      }
      const share = Math.round(Number(body.unitPrice) || 0)
      if (share <= 0 || share < floor - 1) { // -1 : tolérance d'arrondi
        return res.status(400).json({ error: 'Part de groupe invalide' })
      }
      unitPrice = share
    } else if (isTable) {
      // ── Table entière : achat de TOUTE une place de groupe au prix plein.
      // La place doit vraiment être une place de groupe (validé serveur).
      if (!place) return res.status(404).json({ error: 'Table introuvable sur cet événement' })
      if (String(place.groupType) !== 'group' || (Number(place.groupMax) || 0) < 2) {
        return res.status(400).json({ error: "Cette place n'est pas une table de groupe." })
      }
      unitPrice = Math.round(Number(place.price) || 0) // prix PLEIN de la table
    } else {
      if (!place) return res.status(404).json({ error: 'Type de place introuvable sur cet événement' })
      unitPrice = Math.round(Number(place.price) || 0)
    }
    // Nombre de sièges de la table (0 si ce n'est pas un achat de table).
    const tableSeats = isTable ? Math.min(50, Math.max(2, Number(place.groupMax) || 2)) : 0

    // ── Précommandes (consos) : montants entiers bornés. Comme sur le tunnel
    // Stripe v1 les prix consos viennent du client ; le montant réellement payé
    // est figé dans fedapay_txns puis sur les billets par le webhook.
    const preorders = (Array.isArray(preorderItems) ? preorderItems : [])
      .map(it => ({
        name: String(it.name || '').slice(0, 120),
        qty: Math.max(0, Math.min(50, Math.floor(Number(it.qty)) || 0)),
        price: Math.max(0, Math.min(1_000_000, Math.round(Number(it.price ?? it.priceEUR) || 0))),
      }))
      .filter(p => p.qty > 0 && p.price > 0 && p.name)
    const preorderTotal = preorders.reduce((s, p) => s + p.price * p.qty, 0)

    // ── Frais de service LIVEINBLACK (payé par l'acheteur, calcul SERVEUR) ──
    // Table : frais PAR SIÈGE (prix table ÷ sièges × nombre de sièges).
    const feeAmount = isTable
      ? computeTicketFeeXOF(Math.round(unitPrice / tableSeats), tableSeats)
      : isGroupShare
        ? computeTicketFeeXOF(unitPrice, 1)
        : computeTicketFeeXOF(unitPrice, nQty)

    // La table se paie une fois au prix plein (unitPrice) ; part de groupe = 1 part.
    const amountTotal = ((isGroupShare || isTable) ? unitPrice : unitPrice * nQty) + preorderTotal + feeAmount
    if (amountTotal <= 0) {
      return res.status(400).json({ error: 'Aucun montant à payer (place gratuite ?)' })
    }

    // ── Décrément atomique du stock AVANT de créer la transaction (survente) ──
    // Même logique que api/checkout.js : accepter de payer = réserver la place.
    let stockDecremented = false
    try {
      const eventRef = db.collection('events').doc(String(eventId))
      const decremented = await db.runTransaction(async (tx) => {
        const snap = await tx.get(eventRef)
        if (!snap.exists) return false
        const places = snap.data().places || []
        const idx = places.findIndex(p => p.type === placeType)
        if (idx === -1) return false
        const available = Number(places[idx].available) || 0
        const q = (isGroupShare || isTable) ? 1 : nQty
        if (available < q) {
          const err = new Error('insufficient_stock')
          err.code = 'insufficient_stock'
          throw err
        }
        const total = Number(places[idx].total) || 0
        const nextAvailable = Math.max(0, Math.min(total || Infinity, available - q))
        const nextPlaces = places.map((p, i) => i === idx ? { ...p, available: nextAvailable } : p)
        tx.update(eventRef, { places: nextPlaces })
        return true
      })
      stockDecremented = decremented === true
    } catch (e) {
      if (e.code === 'insufficient_stock') {
        return res.status(409).json({ error: 'Il ne reste plus assez de places disponibles pour cette quantité.' })
      }
      console.warn('[/api/fedapay checkout] stock check skipped:', e.message)
    }

    async function restockOnFailure() {
      if (!stockDecremented) return
      try {
        const eventRef = db.collection('events').doc(String(eventId))
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(eventRef)
          if (!snap.exists) return
          const places = snap.data().places || []
          const idx = places.findIndex(p => p.type === placeType)
          if (idx === -1) return
          const total = Number(places[idx].total) || 0
          const available = Number(places[idx].available) || 0
          const q = (isGroupShare || isTable) ? 1 : nQty
          const nextAvailable = Math.max(0, Math.min(total || Infinity, available + q))
          const nextPlaces = places.map((p, i) => i === idx ? { ...p, available: nextAvailable } : p)
          tx.update(eventRef, { places: nextPlaces })
        })
        console.warn('[/api/fedapay checkout] stock restocké après échec en aval')
      } catch (restockErr) {
        console.error('[/api/fedapay checkout] restock après échec ÉCHOUÉ:', restockErr.message)
      }
    }

    // ── Transaction FedaPay + lien de paiement hébergé ──
    // callback_url SANS query : FedaPay y appose ?id=<txn>&status=<statut> —
    // la page /paiement-reussi retrouve le bookingId via GET /api/fedapay?id=.
    const origin = req.headers.origin || `https://${req.headers.host}`
    let txn = null
    let payUrl = null
    try {
      txn = await createTransaction({
        description: `${eventName} — ${placeType}`.slice(0, 200),
        amount: amountTotal,
        callbackUrl: `${origin}/paiement-reussi`,
        customer: userEmail ? {
          email: String(userEmail),
          ...(userName ? { firstname: String(userName).split(' ')[0].slice(0, 60) } : {}),
        } : null,
        metadata: { bookingId: String(bookingId), userId },
        reference: String(bookingId),
      })
      const tok = await createToken(txn.id)
      payUrl = tok.url
      if (!payUrl) throw new Error('Lien de paiement FedaPay manquant')
    } catch (fpErr) {
      await restockOnFailure()
      throw fpErr
    }

    // ── fedapay_txns/{id} : source de vérité des métadonnées pour le webhook
    // (l'équivalent des metadata Stripe). Écriture OBLIGATOIRE : sans ce doc le
    // webhook ne peut pas émettre les billets → on restocke et on échoue.
    try {
      await db.collection('fedapay_txns').doc(String(txn.id)).set({
        txnId: String(txn.id),
        reference: txn.reference || null,
        bookingId: String(bookingId),
        eventId: String(eventId),
        eventName: String(eventName).slice(0, 200),
        placeType: String(placeType),
        qty: (isGroupShare || isTable) ? 1 : nQty,
        unitPrice,
        preorders,
        feeAmount,
        amountTotal,
        currency: 'XOF',
        userId,
        userEmail: userEmail ? String(userEmail) : null,
        sellerUid: String(sellerUid || ''),
        connectMode: 'ledger',
        ...(groupBookingId ? { groupBookingId: String(groupBookingId) } : {}),
        ...(isGroupShare ? { isGroupShare: true } : {}),
        // Table entière : le webhook émet `tableSeats` sièges détenus par l'hôte.
        ...(isTable ? { isTable: true, tableSeats } : {}),
        status: 'pending',
        stockDecremented,
        createdAt: FieldValue.serverTimestamp(),
      })
    } catch (dbErr) {
      await restockOnFailure()
      throw dbErr
    }

    return res.status(200).json({
      url: payUrl, transactionId: String(txn.id),
      feeAmount, amountTotal, currency: 'XOF', connectMode: 'ledger',
    })
  } catch (err) {
    console.error('[/api/fedapay checkout] error:', err)
    return res.status(500).json({ error: err.message || 'FedaPay error' })
  }
}

// ─── Vérification d'une transaction (retour /paiement-reussi) ────────────────
async function verify(req, res) {
  const caller = await requireAuth(req, res)
  if (!caller) return

  const txnId = req.query?.id
  if (!txnId) return res.status(400).json({ error: 'id requis' })

  try {
    const db = getDb()
    const metaSnap = await db.collection('fedapay_txns').doc(String(txnId)).get()
    const meta = metaSnap.exists ? metaSnap.data() : null
    // Les métadonnées (email, booking…) ne sont pas publiques : propriétaire only.
    if (meta && meta.userId && meta.userId !== caller.uid) {
      return res.status(403).json({ error: 'forbidden', message: 'Cette transaction ne t’appartient pas.' })
    }

    const txn = await getTransaction(txnId)
    const status = txn?.status || 'pending'
    return res.status(200).json({
      paid: status === 'approved',
      paymentStatus: status,
      amountTotal: Number(txn?.amount) || (meta?.amountTotal ?? 0),
      currency: 'xof',
      transactionId: String(txnId),
      metadata: meta ? {
        bookingId: meta.bookingId,
        eventId: meta.eventId,
        eventName: meta.eventName,
        placeType: meta.placeType,
        qty: String(meta.qty),
        userId: meta.userId,
        unitPrice: meta.unitPrice,
        feeAmount: meta.feeAmount,
        preorders: meta.preorders || [],
        ...(meta.groupBookingId ? { groupBookingId: meta.groupBookingId } : {}),
        ...(meta.isGroupShare ? { isGroupShare: '1' } : {}),
      } : {},
    })
  } catch (err) {
    console.error('[/api/fedapay verify] error:', err)
    return res.status(500).json({ error: err.message || 'FedaPay error' })
  }
}

// ─── Restock après annulation (appelé par le retour client) ──────────────────
// Un seul registre d'idempotence (stock_releases/fedapay_{txnId}) partagé avec
// le webhook → jamais de double restock quel que soit l'ordre d'arrivée.
async function release(req, res, body) {
  const caller = await requireAuth(req, res)
  if (!caller) return

  const txnId = body.transactionId
  if (!txnId) return res.status(400).json({ error: 'transactionId requis' })

  try {
    const db = getDb()
    const metaSnap = await db.collection('fedapay_txns').doc(String(txnId)).get()
    if (!metaSnap.exists) return res.status(404).json({ error: 'Transaction inconnue' })
    const meta = metaSnap.data()
    if (meta.userId && meta.userId !== caller.uid) {
      return res.status(403).json({ error: 'forbidden' })
    }

    // On ne restocke JAMAIS sur la foi du client : statut relu chez FedaPay.
    const txn = await getTransaction(txnId)
    const status = txn?.status || 'pending'
    if (!['canceled', 'declined', 'expired'].includes(status)) {
      return res.status(200).json({ ok: true, skipped: `status_${status}` })
    }

    const released = await restockFedapayTxn(db, meta, status)
    return res.status(200).json({ ok: true, released })
  } catch (err) {
    console.error('[/api/fedapay release] error:', err)
    return res.status(500).json({ error: err.message || 'FedaPay error' })
  }
}

// ─── Webhook FedaPay ─────────────────────────────────────────────────────────
async function webhook(req, res) {
  const secret = process.env.FEDAPAY_WEBHOOK_SECRET
  if (!secret) {
    console.error('[fedapay-webhook] FEDAPAY_WEBHOOK_SECRET not set')
    return res.status(500).json({ error: 'Webhook not configured' })
  }

  let rawBody
  try {
    rawBody = await readRawBody(req)
  } catch {
    return res.status(400).json({ error: 'Cannot read body' })
  }

  if (!verifyWebhookSignature(rawBody, req.headers['x-fedapay-signature'], secret)) {
    console.error('[fedapay-webhook] signature verification failed')
    return res.status(400).json({ error: 'Invalid signature' })
  }

  let event
  try {
    event = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const name = event?.name || ''
  const entity = event?.entity || {}

  try {
    const db = getDb()

    if (name === 'transaction.approved') {
      await finalizeFedapayBooking(db, entity)
      return res.status(200).json({ received: true })
    }

    // Annulé / refusé / expiré (24 h) → restock idempotent.
    const entStatus = entity?.status || ''
    if (name === 'transaction.canceled' || name === 'transaction.declined'
      || (name === 'transaction.updated' && ['canceled', 'declined', 'expired'].includes(entStatus))) {
      const metaSnap = await db.collection('fedapay_txns').doc(String(entity.id || '')).get()
      if (metaSnap.exists) await restockFedapayTxn(db, metaSnap.data(), entStatus || name.split('.')[1])
      return res.status(200).json({ received: true })
    }

    return res.status(200).json({ received: true, ignored: name })
  } catch (err) {
    console.error('[fedapay-webhook] handler error:', err)
    // 500 → FedaPay ré-essaiera l'envoi.
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

// ── Émission des billets (miroir XOF de finalizeBooking du webhook Stripe) ───
async function finalizeFedapayBooking(db, entity) {
  const txnId = String(entity?.id || '')
  if (!txnId) return

  const metaSnap = await db.collection('fedapay_txns').doc(txnId).get()
  const meta = metaSnap.exists
    ? metaSnap.data()
    : (entity.custom_metadata && entity.custom_metadata.bookingId
      ? { bookingId: String(entity.custom_metadata.bookingId), userId: String(entity.custom_metadata.userId || ''), qty: 1, preorders: [], unitPrice: 0, feeAmount: 0, sellerUid: '', eventId: '', eventName: '', placeType: '' }
      : null)
  if (!meta || !meta.bookingId) {
    console.warn('[fedapay-webhook] transaction sans métadonnées — ignorée:', txnId)
    return
  }

  const bookingId = meta.bookingId
  const ref = db.collection('bookings').doc(bookingId)
  const metaRef = db.collection('fedapay_txns').doc(txnId)

  // ── CLAIM transactionnel anti-concurrence : FedaPay peut livrer le même
  // événement deux fois EN PARALLÈLE (timeout + retry). Un simple read-then-act
  // laisserait passer les deux runs → doubles billets + double crédit vendeur.
  // Verrou à bail : run concurrent < 90 s → 500 (FedaPay retentera) ; run mort
  // en cours de route → le bail expire et le retry reprend le travail.
  const FULFILL_LOCK_MS = 90 * 1000
  let claimed = false
  await db.runTransaction(async (tx) => {
    const bSnap = await tx.get(ref)
    if (bSnap.exists && bSnap.data().paid === true) { claimed = false; return }
    const mSnap = await tx.get(metaRef)
    const startedAt = mSnap.exists ? Number(mSnap.data().fulfillStartedAt || 0) : 0
    if (startedAt && Date.now() - startedAt < FULFILL_LOCK_MS) {
      const err = new Error('fulfillment déjà en cours (livraison webhook concurrente) — retry')
      err.code = 'fulfillment_in_progress'
      throw err
    }
    tx.set(metaRef, { fulfillStartedAt: Date.now() }, { merge: true })
    claimed = true
  })
  if (!claimed) {
    console.log('[fedapay-webhook] booking already finalized:', bookingId)
    return
  }

  // Intégrité : le montant payé doit être celui calculé au checkout.
  const paidAmount = Math.round(Number(entity.amount) || 0)
  if (meta.amountTotal && paidAmount !== meta.amountTotal) {
    console.warn('[fedapay-webhook] montant payé ≠ montant attendu:', paidAmount, 'vs', meta.amountTotal, '— txn', txnId)
  }

  const eventId = meta.eventId || ''
  const userId = meta.userId || ''
  const qty = Math.max(1, Number(meta.qty || 1))
  const eventName = meta.eventName || ''
  const placeType = meta.placeType || ''
  const unitPrice = Math.round(Number(meta.unitPrice) || 0)
  const preorders = Array.isArray(meta.preorders) ? meta.preorders : []

  // ── Table entière (modèle « hôte ») : on émet `tableSeats` billets (sièges)
  // tous détenus par l'hôte, prêts à être attribués via /api/tickets. Chaque
  // siège vaut prix_table ÷ sièges (les stats de l'organisateur restent justes).
  const isTable = meta.isTable === true && Number(meta.tableSeats) > 1
  const tableSeats = isTable ? Math.min(50, Math.max(2, Number(meta.tableSeats) || 2)) : 0
  const seatCount = isTable ? tableSeats : qty
  const perSeatPrice = isTable ? Math.round(unitPrice / tableSeats) : unitPrice
  const tableId = isTable ? bookingId : null

  // ── Paiement APRÈS restock : FedaPay autorise de réessayer une transaction
  // canceled/declined. Si le stock de cette résa a déjà été rendu (annulation
  // puis nouveau paiement réussi), on le re-décrémente — sinon survente.
  try {
    const releaseRef = db.collection('stock_releases').doc(`fedapay_${txnId}`)
    const relSnap = await releaseRef.get()
    if (relSnap.exists && relSnap.data().resold !== true && eventId && placeType) {
      const eventRef = db.collection('events').doc(String(eventId))
      await db.runTransaction(async (tx) => {
        const rel = await tx.get(releaseRef)
        if (!rel.exists || rel.data().resold === true) return
        const snap = await tx.get(eventRef)
        if (snap.exists) {
          const places = snap.data().places || []
          const idx = places.findIndex(p => p.type === placeType)
          if (idx !== -1) {
            const available = Number(places[idx].available) || 0
            const nextAvailable = Math.max(0, available - qty)
            const nextPlaces = places.map((p, i) => i === idx ? { ...p, available: nextAvailable } : p)
            tx.update(eventRef, { places: nextPlaces })
          }
        }
        tx.set(releaseRef, { resold: true, resoldAt: FieldValue.serverTimestamp() }, { merge: true })
      })
      console.log('[fedapay-webhook] stock re-décrémenté (paiement après annulation):', txnId)
    }
  } catch (e) {
    console.warn('[fedapay-webhook] re-décrément post-restock échoué (non bloquant):', e.message)
  }

  // ── ANTI-DUPLICATION : billets déjà créés par /paiement-reussi (client) →
  // on les adopte au lieu d'en minter d'autres (même logique que Stripe).
  const existingQ = await db.collection('tickets')
    .where('fedapayTxnId', '==', txnId)
    .get()
  const priorTickets = existingQ.docs.map(d => d.data())
  const clientTickets = priorTickets.filter(t => t.source === 'client-postpay')
  // Retry après échec partiel : réutiliser les codes déjà mintés par un run
  // précédent (mêmes objets → batch idempotent + arrayUnion dédoublonné).
  const mintedTickets = priorTickets.filter(t => t.source === 'fedapay-webhook')

  let tickets
  let clientAlreadyFinalized = false

  if (clientTickets.length) {
    clientAlreadyFinalized = true
    tickets = clientTickets.map(t => ({
      id: t.ticketCode.split('-').pop(),
      ticketCode: t.ticketCode,
      eventId,
      eventName,
      place: t.place || placeType,
      placePrice: t.placePrice != null ? Number(t.placePrice) : unitPrice,
      currency: 'XOF',
      bookedAt: t.bookedAt || new Date().toISOString(),
      paid: true,
      paymentMethod: 'fedapay',
      fedapayTxnId: txnId,
      userId,
    }))
    const confirmBatch = db.batch()
    for (const t of clientTickets) {
      confirmBatch.set(db.collection('tickets').doc(t.ticketCode), {
        paid: true,
        source: 'fedapay-webhook',
        confirmedAt: new Date().toISOString(),
        ...(t.placePrice == null ? { placePrice: unitPrice } : {}),
        currency: 'XOF',
        preorders,
        bookingId,
      }, { merge: true })
    }
    await confirmBatch.commit()
    console.log('[fedapay-webhook] billets client adoptés et confirmés:', tickets.map(t => t.ticketCode))
  } else if (mintedTickets.length) {
    tickets = mintedTickets.map(t => ({
      id: t.ticketCode.split('-').pop(),
      ticketCode: t.ticketCode,
      eventId,
      eventName,
      place: t.place || placeType,
      placePrice: t.placePrice != null ? Number(t.placePrice) : perSeatPrice,
      currency: 'XOF',
      bookedAt: t.bookedAt || new Date().toISOString(),
      paid: true,
      paymentMethod: 'fedapay',
      fedapayTxnId: txnId,
      // Le titulaire courant du siège est celui déjà en base (peut avoir été
      // attribué entre deux tentatives) ; à défaut, l'hôte.
      userId: t.userId || userId,
      // Champs table préservés au retry.
      ...(t.tableId ? { tableId: t.tableId, seatIndex: t.seatIndex, hostUid: t.hostUid, tableSeats: t.tableSeats } : {}),
    }))
    console.log('[fedapay-webhook] retry — billets déjà mintés réutilisés:', tickets.map(t => t.ticketCode))
  } else {
    tickets = []
    for (let i = 0; i < seatCount; i++) {
      const code = generateTicketCode()
      const ticketCode = `LIB-${String(eventId).padStart(3, '0')}-${code}`
      tickets.push({
        id: code,
        ticketCode,
        eventId,
        eventName,
        place: placeType,
        placePrice: perSeatPrice,
        currency: 'XOF',
        bookedAt: new Date().toISOString(),
        paid: true,
        paymentMethod: 'fedapay',
        fedapayTxnId: txnId,
        userId, // l'hôte détient tous les sièges au départ
        // Sièges de table : liés par tableId, attribuables via /api/tickets.
        ...(isTable ? { tableId, seatIndex: i, hostUid: userId, tableSeats } : {}),
        // Pas de token QR signé ici — même modèle que Stripe : la validation au
        // scan passe par le registre tickets/{code}, « Mes billets » régénère le QR.
      })
    }
  }

  // NB : bookings/{id}.paid=true (le marqueur d'idempotence) est posé EN
  // DERNIER — toutes les étapes ci-dessous sont idempotentes, donc un échec
  // partiel + retry FedaPay refait le travail au lieu de le perdre.

  if (!clientAlreadyFinalized) {
    // Registre plat tickets/{ticketCode} — source de vérité anti-fraude du scanner.
    const batch = db.batch()
    for (const t of tickets) {
      batch.set(db.collection('tickets').doc(t.ticketCode), {
        ticketCode: t.ticketCode,
        eventId,
        eventName,
        place: placeType,
        placePrice: t.placePrice != null ? Number(t.placePrice) : perSeatPrice,
        currency: 'XOF',
        userId: t.userId || userId,
        paid: true,
        source: 'fedapay-webhook',
        bookedAt: t.bookedAt,
        fedapayTxnId: txnId,
        // Précommandes uniquement sur le 1er siège d'une table (elles appartiennent
        // à l'hôte, pas dupliquées sur chaque siège).
        preorders: (!isTable || t.seatIndex === 0) ? preorders : [],
        bookingId,
        // Champs table pour l'attribution + l'affichage « Ma table ».
        ...(t.tableId ? { tableId: t.tableId, seatIndex: t.seatIndex, hostUid: t.hostUid, tableSeats: t.tableSeats } : {}),
      })
    }
    await batch.commit()

    if (userId) {
      await db.collection('user_bookings').doc(userId).set({
        items: FieldValue.arrayUnion(...tickets),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
  }

  // ── Crédit vendeur + points fidélité : EXACTEMENT UNE FOIS ──
  // Les FieldValue.increment ne sont pas idempotents → flag `settled` posé dans
  // la MÊME transaction : un retry après échec partiel ne peut ni doubler ni
  // sauter le crédit. Ledger amountDueXOF SÉPARÉ des centimes EUR.
  const feeAmount = Math.max(0, Number(meta.feeAmount || 0))
  const sellerUid = meta.sellerUid || ''
  const owed = Math.max(0, paidAmount - feeAmount)
  let firstSettle = false
  await db.runTransaction(async (tx) => {
    const mSnap = await tx.get(metaRef)
    if (mSnap.exists && mSnap.data().settled === true) return
    if (sellerUid && sellerUid !== userId && owed > 0) {
      tx.set(db.collection('seller_balances').doc(String(sellerUid)), {
        sellerUid: String(sellerUid),
        amountDueXOF: FieldValue.increment(owed),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    // Points : 1/billet — sauf si le client a déjà finalisé (il se les est
    // attribués lui-même via syncIncrement, comme sur le tunnel Stripe).
    if (userId && !clientAlreadyFinalized) {
      tx.set(db.collection('users').doc(userId), {
        points: FieldValue.increment(qty),
      }, { merge: true })
    }
    tx.set(metaRef, { settled: true }, { merge: true })
    firstSettle = true
  })
  if (firstSettle && sellerUid && sellerUid !== userId && owed > 0) {
    console.log('[fedapay-webhook] ledger vendeur crédité:', sellerUid, '+', owed, 'FCFA')
  }

  // ── Part de réservation de groupe ──
  if (meta.groupBookingId && userId) {
    try {
      await db.collection('group_bookings').doc(String(meta.groupBookingId)).set({
        payments: { [userId]: true },
      }, { merge: true })
      console.log('[fedapay-webhook] part de groupe marquée payée:', meta.groupBookingId, '/', userId)
    } catch (e) {
      console.warn('[fedapay-webhook] échec maj group_booking:', e.message)
    }
  }

  // ── Notification de vente à l'organisateur (in-app) — seulement au premier
  // settle : un retry ne renotifie pas.
  try {
    if (eventId && firstSettle) {
      const evSnap = await db.collection('events').doc(String(eventId)).get()
      const organizerUid = evSnap.exists ? (evSnap.data().organizerId || evSnap.data().createdBy) : null
      if (organizerUid && organizerUid !== userId) {
        const notif = {
          id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
          type: 'new_order',
          title: '🎫 Nouvelle vente',
          body: `${qty} × ${placeType} — ${eventName}`,
          data: { eventId: String(eventId) },
          read: false,
          createdAt: Date.now(),
        }
        const nref = db.collection('notifications').doc(String(organizerUid))
        const cur = await nref.get()
        const items = cur.exists ? (cur.data().items || []) : []
        await nref.set({ items: [notif, ...items].slice(0, 50), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      }
    }
  } catch (e) {
    console.warn('[fedapay-webhook] échec notif organisateur:', e.message)
  }

  // ── Marqueur final d'idempotence (posé en DERNIER, cf. note en tête) ──
  await ref.set({
    bookingId,
    eventId,
    eventName,
    userId,
    qty,
    placeType,
    tickets,
    preorders,
    paid: true,
    amountTotal: paidAmount,
    currency: 'xof',
    customerEmail: meta.userEmail || entity.customer?.email || null,
    fedapayTxnId: txnId,
    finalizedAt: FieldValue.serverTimestamp(),
    finalizedBy: 'fedapay-webhook',
  }, { merge: true })

  await metaRef.set({
    status: 'approved', finalizedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  console.log('[fedapay-webhook] booking finalized:', bookingId, '— tickets:', tickets.length, clientAlreadyFinalized ? '(codes client adoptés)' : '(codes mintés)')
}

// ── Restock idempotent (annulation / refus / expiration) ─────────────────────
// Registre stock_releases/fedapay_{txnId} PARTAGÉ entre le retour client
// (action release) et le webhook — le premier arrivé restocke, l'autre skip.
async function restockFedapayTxn(db, meta, finalStatus) {
  const { txnId, eventId, placeType, qty, bookingId } = meta || {}
  if (!txnId || !eventId || !placeType || !bookingId) return false

  // Le décrément du checkout a pu être SAUTÉ (hoquet Firestore avalé) — le flag
  // est persisté dans fedapay_txns. Restocker une place jamais retirée
  // gonflerait le stock → survente.
  if (meta.stockDecremented === false) {
    console.log('[fedapay] stock jamais décrémenté pour', txnId, '— pas de restock')
    return false
  }

  const bookingSnap = await db.collection('bookings').doc(String(bookingId)).get()
  if (bookingSnap.exists && bookingSnap.data().paid === true) {
    console.log('[fedapay] annulation mais booking déjà payé — pas de restock:', bookingId)
    return false
  }

  // Registre d'idempotence + restock dans UNE SEULE transaction : atomique —
  // impossible de marquer « restocké » sans l'avoir fait (ou l'inverse).
  const releaseRef = db.collection('stock_releases').doc(`fedapay_${txnId}`)
  const eventRef = db.collection('events').doc(String(eventId))
  let released = false
  await db.runTransaction(async (tx) => {
    const relSnap = await tx.get(releaseRef)
    if (relSnap.exists) { released = false; return }
    const snap = await tx.get(eventRef)
    if (snap.exists) {
      const places = snap.data().places || []
      const idx = places.findIndex(p => p.type === placeType)
      if (idx !== -1) {
        const available = Number(places[idx].available) || 0
        const total = Number(places[idx].total) || 0
        const q = Math.max(0, Number(qty) || 0)
        const nextAvailable = Math.max(0, Math.min(total || Infinity, available + q))
        const nextPlaces = places.map((p, i) => i === idx ? { ...p, available: nextAvailable } : p)
        tx.update(eventRef, { places: nextPlaces })
      }
    }
    tx.set(releaseRef, {
      txnId: String(txnId), eventId: String(eventId), placeType: String(placeType),
      qty: Number(qty) || 1, status: String(finalStatus || ''), releasedAt: FieldValue.serverTimestamp(),
    })
    released = true
  })
  if (!released) return false

  await db.collection('fedapay_txns').doc(String(txnId)).set({
    status: String(finalStatus || 'canceled'), releasedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  console.log('[fedapay] stock restocké:', txnId, eventId, placeType, qty)
  return true
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateTicketCode() {
  // 6 caractères alphanumériques (sans I/O/0/1 — mêmes règles que Stripe)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}
