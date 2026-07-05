// Vercel Serverless Function — Webhook Stripe
// Endpoint : POST /api/stripe-webhook
//
// Reçoit les événements `checkout.session.completed` de Stripe et finalise
// les billets/boosts en Firestore. Filet de sécurité au cas où le client
// ferme l'onglet entre Stripe et /paiement-reussi.
//
// Prérequis env Vercel :
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET            (Stripe Dashboard → Webhooks → endpoint → Signing secret)
//   FIREBASE_PROJECT_ID              (= "liveinblack-15d30")
//   FIREBASE_CLIENT_EMAIL            (du service account JSON)
//   FIREBASE_PRIVATE_KEY             (du service account JSON, avec \n literaux)
//
// Configuration côté Stripe :
//   Dashboard → Developers → Webhooks → Add endpoint
//   URL: https://liveinblack.com/api/stripe-webhook
//   Events: checkout.session.completed

import Stripe from 'stripe'
import { getDb, FieldValue } from '../lib/firebaseAdmin.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

// Vercel doit nous laisser lire le RAW body pour vérifier la signature Stripe
export const config = {
  api: { bodyParser: false },
}

// ── Lecture du raw body (nécessaire pour la vérif de signature) ──────────────
async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sig = req.headers['stripe-signature']
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' })
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not set')
    return res.status(500).json({ error: 'Webhook not configured' })
  }

  let rawBody
  try {
    rawBody = await readRawBody(req)
  } catch (err) {
    return res.status(400).json({ error: 'Cannot read body' })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('[webhook] signature verification failed:', err.message)
    return res.status(400).json({ error: 'Invalid signature' })
  }

  // ── Compte Connect mis à jour : on suit l'éligibilité du vendeur (charges/payouts) ──
  if (event.type === 'account.updated') {
    try {
      const db = getDb()
      await finalizeAccountUpdate(db, event.data.object)
    } catch (err) {
      console.error('[webhook] account.updated error:', err)
      return res.status(500).json({ error: err.message || 'Internal error' })
    }
    return res.status(200).json({ received: true })
  }

  // ── Session expirée sans paiement (acheteur qui ferme l'onglet sans annuler
  // explicitement) : Stripe expire les sessions impayées automatiquement — c'est
  // le filet de sécurité qui restocke la place réservée à la création de la session
  // (api/checkout.js) quand /paiement-annule n'a jamais été visité. ──
  if (event.type === 'checkout.session.expired') {
    try {
      const db = getDb()
      await releaseExpiredSessionStock(db, event.data.object)
    } catch (err) {
      console.error('[webhook] checkout.session.expired error:', err)
      return res.status(500).json({ error: err.message || 'Internal error' })
    }
    return res.status(200).json({ received: true })
  }

  // ── Abonnement prestataire (Stripe Billing) : création / renouvellement /
  // résiliation / échec de paiement → statut mis à jour (SOURCE DE VÉRITÉ serveur). ──
  if (event.type === 'customer.subscription.created'
   || event.type === 'customer.subscription.updated'
   || event.type === 'customer.subscription.deleted') {
    try {
      const db = getDb()
      await finalizePrestataireSub(db, event.data.object, event.type === 'customer.subscription.deleted')
    } catch (err) {
      console.error('[webhook] subscription event error:', err)
      return res.status(500).json({ error: err.message || 'Internal error' })
    }
    return res.status(200).json({ received: true })
  }

  // On ne traite que les sessions complétées
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: event.type })
  }

  const session = event.data.object
  // Sécurité : on n'enregistre que si le paiement est vraiment réussi
  if (session.payment_status !== 'paid') {
    return res.status(200).json({ received: true, skipped: 'unpaid' })
  }

  const meta = session.metadata || {}

  try {
    const db = getDb()
    if (meta.type === 'prestataire_subscription' || session.mode === 'subscription') {
      // Activation immédiate au retour du checkout ; les events customer.subscription.*
      // affineront ensuite le statut/la période.
      await activatePrestataireSubFromSession(db, session, meta)
    } else if (meta.intent === 'boost') {
      await finalizeBoost(db, session, meta)
    } else if (meta.bookingId) {
      await finalizeBooking(db, session, meta)
    } else {
      console.warn('[webhook] no bookingId or boost intent — skipping', meta)
    }
    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('[webhook] handler error:', err)
    // Renvoyer 500 pour que Stripe ré-essaie (jusqu'à 3 jours de retries)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

// ── Abonnement prestataire ────────────────────────────────────────────────────
// Écrit le statut sur users/{uid} (source de vérité, toujours présent → gate
// onboarding + dashboard) et le MIROIR sur providers/{uid} UNIQUEMENT si le profil
// existe déjà (ne pas créer de profil fantôme pour un abonné pas encore validé).
async function writeSubStatus(db, uid, { active, status, periodEndIso, subId, customerId }) {
  if (!uid) return
  await db.collection('users').doc(String(uid)).set({
    prestataireSubActive: active,
    prestataireSubStatus: status,
    prestataireSubEnd: periodEndIso || null,
    stripeSubscriptionId: subId || null,
    stripeCustomerId: customerId || null,
    _syncedAt: Date.now(),
  }, { merge: true })
  const provRef = db.collection('providers').doc(String(uid))
  const prov = await provRef.get()
  if (prov.exists) {
    await provRef.set({ subscriptionActive: active, subscriptionStatus: status, _syncedAt: Date.now() }, { merge: true })
  }
}

// Events customer.subscription.created/updated/deleted → statut fin.
async function finalizePrestataireSub(db, sub, deleted = false) {
  const uid = sub?.metadata?.uid
  if (!uid) { console.warn('[webhook] subscription sans uid metadata', sub?.id); return }
  const status = deleted ? 'canceled' : (sub.status || 'active')
  const active = !deleted && (status === 'active' || status === 'trialing')
  await writeSubStatus(db, uid, {
    active, status,
    periodEndIso: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    subId: sub.id || null,
    customerId: (typeof sub.customer === 'string' ? sub.customer : sub.customer?.id) || null,
  })
}

// checkout.session.completed (mode subscription) → activation immédiate au retour.
async function activatePrestataireSubFromSession(db, session, meta) {
  const uid = meta.uid || session.client_reference_id
  if (!uid) { console.warn('[webhook] sub session sans uid', session.id); return }
  await writeSubStatus(db, uid, {
    active: true, status: 'active', periodEndIso: null,
    subId: (typeof session.subscription === 'string' ? session.subscription : session.subscription?.id) || null,
    customerId: (typeof session.customer === 'string' ? session.customer : session.customer?.id) || null,
  })
}

// ── Booking ──────────────────────────────────────────────────────────────────
async function finalizeBooking(db, session, meta) {
  const bookingId = meta.bookingId
  if (!bookingId) return

  // Prix unitaire payé (en €), figé au moment du checkout. Les stats organisateur
  // lisent ticket.placePrice en priorité — sans ce snapshot, un changement de
  // tarif réécrirait rétroactivement le CA des ventes passées (risque fiscal).
  const unitPriceEUR = Math.max(0, Number(meta.unitPriceCents || 0)) / 100

  // Idempotence : si on a déjà traité ce bookingId on ne refait rien
  const ref = db.collection('bookings').doc(bookingId)
  const existing = await ref.get()
  if (existing.exists && existing.data().paid === true) {
    console.log('[webhook] booking already finalized:', bookingId)
    return
  }

  const eventId = meta.eventId || ''
  const userId = meta.userId || ''
  const qty = Math.max(1, Number(meta.qty || 1))
  const eventName = meta.eventName || ''
  const placeType = meta.placeType || ''

  // ── PRÉCOMMANDES : source de vérité SERVEUR (faille B-préco de l'audit) ──
  // Le récap conso affiché au bar venait du token signé côté client (clé
  // publique → falsifiable : champagne gratuit). Ici on relit les line_items
  // RÉELLEMENT PAYÉS de la session Stripe (suffixe « (précommande) » posé par
  // /api/checkout) et on les fige dans le registre tickets/ + bookings/.
  // Best-effort : un échec ici ne doit jamais bloquer l'émission des billets.
  let preorders = []
  try {
    const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 })
    preorders = (li.data || [])
      .filter(l => / \(précommande\)$/.test(l.description || ''))
      .map(l => ({
        name: (l.description || '').replace(/ \(précommande\)$/, ''),
        qty: Number(l.quantity) || 0,
        priceEUR: (Number(l.price?.unit_amount) || (l.quantity ? Math.round((l.amount_total || 0) / l.quantity) : 0)) / 100,
      }))
      .filter(p => p.qty > 0)
    if (preorders.length) console.log('[webhook] précommandes figées depuis Stripe:', JSON.stringify(preorders))
  } catch (e) {
    console.warn('[webhook] lecture line_items précommandes échouée:', e.message)
  }

  // ── ANTI-DUPLICATION : si le client (page /paiement-reussi) a déjà créé ses
  // billets pour cette session Stripe, on ADOPTE ses codes : on les confirme
  // (paid:true) au lieu d'en minter d'autres. Sinon 1 achat = 2 jeux de billets.
  const existing_q = await db.collection('tickets')
    .where('stripeSessionId', '==', session.id)
    .get()
  const clientTickets = existing_q.docs
    .map(d => d.data())
    .filter(t => t.source === 'client-postpay')

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
      placePrice: t.placePrice != null ? Number(t.placePrice) : unitPriceEUR,
      bookedAt: t.bookedAt || new Date().toISOString(),
      paid: true,
      paymentMethod: 'stripe',
      stripeSessionId: session.id,
      userId,
    }))
    // Confirmer les billets client dans le registre anti-fraude
    const confirmBatch = db.batch()
    for (const t of clientTickets) {
      confirmBatch.set(db.collection('tickets').doc(t.ticketCode), {
        paid: true,
        source: 'stripe-webhook',
        confirmedAt: new Date().toISOString(),
        // Fige le prix payé si le billet client ne l'avait pas
        ...(t.placePrice == null ? { placePrice: unitPriceEUR } : {}),
        // Précommandes certifiées (agrégat de la réservation — le scanner les
        // lit ici en priorité, plus depuis le token falsifiable)
        preorders,
        bookingId,
      }, { merge: true })
    }
    await confirmBatch.commit()
    console.log('[webhook] billets client adoptés et confirmés:', tickets.map(t => t.ticketCode))
  } else {
    // Client jamais revenu (onglet fermé) — on mint les billets nous-mêmes
    tickets = []
    for (let i = 0; i < qty; i++) {
      const code = generateTicketCode()
      const ticketCode = `LIB-${String(eventId).padStart(3, '0')}-${code}`
      tickets.push({
        id: code,
        ticketCode,
        eventId,
        eventName,
        place: placeType,
        placePrice: unitPriceEUR,
        bookedAt: new Date().toISOString(),
        paid: true,
        paymentMethod: 'stripe',
        stripeSessionId: session.id,
        userId,
        // Note : pas de `token` signé ici — la page /paiement-reussi génère le token côté
        // client à partir de la signature actuelle. La vraie validation au scan passe par
        // ce registre tickets/{code}, pas par le token.
      })
    }
  }

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
    amountTotalCents: session.amount_total || 0,
    currency: session.currency || 'eur',
    customerEmail: session.customer_details?.email || null,
    customerName: session.customer_details?.name || null,
    stripeSessionId: session.id,
    finalizedAt: FieldValue.serverTimestamp(),
    finalizedBy: 'webhook',
  }, { merge: true })

  // ── Ledger de reversement vendeur ──
  // Si le paiement n'a PAS été reversé automatiquement (vendeur sans Connect éligible,
  // ex. Afrique), la plateforme a encaissé 100% → on enregistre la dette envers le
  // vendeur (montant net = total - frais de service), à reverser manuellement.
  // Idempotent : on est dans la garde anti-duplication (booking.paid déjà vérifié en tête),
  // donc ce crédit ne s'exécute qu'UNE fois par booking.
  const feeCents = Math.max(0, Number(meta.feeCents || 0))
  const sellerUid = meta.sellerUid || ''
  if (meta.connectMode === 'ledger' && sellerUid) {
    const owedCents = Math.max(0, (session.amount_total || 0) - feeCents)
    if (owedCents > 0) {
      await db.collection('seller_balances').doc(String(sellerUid)).set({
        sellerUid: String(sellerUid),
        amountDueCents: FieldValue.increment(owedCents),
        currency: session.currency || 'eur',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      console.log('[webhook] ledger vendeur crédité:', sellerUid, '+', owedCents, 'centimes')
    }
  }

  // Les étapes suivantes ne concernent que le cas « client jamais revenu » :
  // si le client a déjà finalisé, il a déjà créé le registre (confirmé plus
  // haut), syncé user_bookings et attribué les points — refaire = doublons.
  if (!clientAlreadyFinalized) {
    // Registre plat tickets/{ticketCode} — source de vérité anti-fraude pour le scanner.
    // Seul le webhook (Admin SDK) peut écrire paid:true — les règles Firestore
    // interdisent aux clients de créer un billet "payé". Un QR falsifié ne
    // correspondra à aucune entrée de ce registre → rejeté au scan.
    const batch = db.batch()
    for (const t of tickets) {
      batch.set(db.collection('tickets').doc(t.ticketCode), {
        ticketCode: t.ticketCode,
        eventId,
        eventName,
        place: placeType,
        placePrice: unitPriceEUR,
        userId,
        paid: true,
        source: 'stripe-webhook',
        bookedAt: t.bookedAt,
        stripeSessionId: session.id,
        // Précommandes certifiées depuis les line_items Stripe (agrégat de la
        // réservation) — source de vérité du bar, cf. faille B-préco
        preorders,
        bookingId,
      })
    }
    await batch.commit()

    // Mirror dans user_bookings/{userId}.items pour que syncOnLogin les pousse en local
    if (userId) {
      // arrayUnion sur des objets : ne dédoublonne que sur égalité stricte.
      // Comme on n'écrit qu'une fois (idempotence ci-dessus), pas de doublon possible.
      await db.collection('user_bookings').doc(userId).set({
        items: FieldValue.arrayUnion(...tickets),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })

      // Points fidélité : 1 point par billet
      await db.collection('users').doc(userId).set({
        points: FieldValue.increment(qty),
      }, { merge: true })
    }
  }

  // ── Part de réservation de groupe ──
  // Marque la part de l'utilisateur comme payée dans group_bookings/{id}.
  // Filet serveur : si le payeur ferme l'onglet avant de revenir sur
  // /paiement-reussi, la part est quand même créditée. Idempotent (merge).
  if (meta.groupBookingId && userId) {
    try {
      await db.collection('group_bookings').doc(String(meta.groupBookingId)).set({
        payments: { [userId]: true },
      }, { merge: true })
      console.log('[webhook] part de groupe marquée payée:', meta.groupBookingId, '/', userId)
    } catch (e) {
      console.warn('[webhook] échec maj group_booking:', e.message)
    }
  }

  // ── Notification de vente à l'organisateur (engagement) ──
  // On lit l'event pour trouver son organisateur, puis on ajoute une notif.
  // Read-merge-write pour ne pas écraser les notifs existantes de l'orga.
  try {
    if (eventId) {
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
        const ref = db.collection('notifications').doc(String(organizerUid))
        const cur = await ref.get()
        const items = cur.exists ? (cur.data().items || []) : []
        await ref.set({ items: [notif, ...items].slice(0, 50), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        console.log('[webhook] organisateur notifié de la vente:', organizerUid)
      }
    }
  } catch (e) {
    console.warn('[webhook] échec notif organisateur:', e.message)
  }

  console.log('[webhook] booking finalized:', bookingId, '— tickets:', tickets.length, clientAlreadyFinalized ? '(codes client adoptés)' : '(codes mintés)')
}

// ── Restock après expiration de session (filet de sécurité) ──────────────────
async function releaseExpiredSessionStock(db, session) {
  const meta = session.metadata || {}
  const { eventId, placeType, qty, bookingId } = meta
  if (!eventId || !placeType || !qty || !bookingId) return

  // Si le booking a malgré tout été finalisé (paid) entre l'expiration Stripe et
  // notre traitement, ne pas restocker une vente réelle.
  const bookingSnap = await db.collection('bookings').doc(bookingId).get()
  if (bookingSnap.exists && bookingSnap.data().paid === true) {
    console.log('[webhook] session expirée mais booking déjà payé — pas de restock:', bookingId)
    return
  }

  // Idempotence : Stripe peut renvoyer le même événement plusieurs fois.
  const releaseRef = db.collection('stock_releases').doc(session.id)
  const releaseSnap = await releaseRef.get()
  if (releaseSnap.exists) return

  const eventRef = db.collection('events').doc(String(eventId))
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef)
    if (!snap.exists) return
    const places = snap.data().places || []
    const idx = places.findIndex(p => p.type === placeType)
    if (idx === -1) return
    const available = Number(places[idx].available) || 0
    const total = Number(places[idx].total) || 0
    const q = Math.max(0, Number(qty) || 0)
    const nextAvailable = Math.max(0, Math.min(total || Infinity, available + q))
    const nextPlaces = places.map((p, i) => i === idx ? { ...p, available: nextAvailable } : p)
    tx.update(eventRef, { places: nextPlaces })
  })
  await releaseRef.set({ sessionId: session.id, eventId, placeType, qty, releasedAt: FieldValue.serverTimestamp() })
  console.log('[webhook] stock restocké après expiration de session:', session.id, eventId, placeType, qty)
}

// ── Boost ────────────────────────────────────────────────────────────────────
async function finalizeBoost(db, session, meta) {
  const boostId = meta.boostId
  if (!boostId) return

  const ref = db.collection('boosts').doc(boostId)
  const existing = await ref.get()
  if (existing.exists) {
    console.log('[webhook] boost already finalized:', boostId)
    return
  }

  const userId = meta.userId || ''
  const eventId = meta.eventId || ''
  const position = Number(meta.position) || 0
  const days = Math.max(1, Number(meta.days || 1))
  const region = meta.region || ''
  const priceEUR = (session.amount_total || 0) / 100

  const boost = {
    id: boostId,
    eventId,
    position,
    region,
    price: priceEUR,
    days,
    userId,
    purchasedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    stripeSessionId: session.id,
    finalizedBy: 'webhook',
  }

  // Garde-fou résiduel anti double-vente : checkout-boost refuse déjà un créneau
  // occupé AVANT paiement, mais deux checkouts strictement simultanés peuvent
  // passer. Si un boost actif occupe déjà (région, position), on marque le
  // conflit — à traiter manuellement (remboursement ou re-slot), jamais silencieux.
  try {
    const dupSnap = await db.collection('boosts')
      .where('region', '==', String(region))
      .where('position', '==', position)
      .get()
    const now = Date.now()
    const clash = dupSnap.docs.map(d => d.data())
      .find(b => b.id !== boostId && (() => { try { return new Date(b.expiresAt).getTime() > now } catch { return false } })())
    if (clash) {
      boost.conflict = true
      boost.conflictWith = clash.id
      console.error('[webhook] ⚠ CONFLIT BOOST — deux ventes sur le même créneau:', boostId, 'vs', clash.id, `(Top ${position}, ${region}) — rembourser ou re-sloter manuellement`)
    }
  } catch {}

  await ref.set(boost)

  if (userId) {
    await db.collection('user_boosts').doc(userId).set({
      items: FieldValue.arrayUnion(boost),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }

  console.log('[webhook] boost finalized:', boostId)
}

// ── Compte Connect (account.updated) ─────────────────────────────────────────
// Met à jour l'éligibilité reversement du vendeur dans users/{uid}. La source de
// vérité de chargesEnabled vient d'ICI (webhook), jamais d'une écriture client —
// pour qu'un vendeur ne puisse pas se déclarer "éligible" et détourner un transfert.
async function finalizeAccountUpdate(db, account) {
  const uid = account?.metadata?.uid
  if (!uid) {
    console.warn('[webhook] account.updated sans metadata.uid — ignoré:', account?.id)
    return
  }
  await db.collection('users').doc(String(uid)).set({
    stripeAccountId: account.id,
    stripeChargesEnabled: account.charges_enabled === true,
    stripePayoutsEnabled: account.payouts_enabled === true,
    stripeDetailsSubmitted: account.details_submitted === true,
    stripeAccountUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })
  console.log('[webhook] account.updated → users/' + uid, 'charges:', account.charges_enabled, 'payouts:', account.payouts_enabled)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateTicketCode() {
  // 6 caractères alphanumériques (sans I/O/0/1 pour éviter les confusions au scan manuel)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}
