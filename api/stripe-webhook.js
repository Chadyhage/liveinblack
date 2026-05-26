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
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

// Vercel doit nous laisser lire le RAW body pour vérifier la signature Stripe
export const config = {
  api: { bodyParser: false },
}

// ── Init Firebase Admin (singleton — réutilisé entre invocations chaudes) ────
function getDb() {
  if (!getApps().length) {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('Firebase Admin credentials missing — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY')
    }
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Les private keys ont des "\n" littéraux dans les env vars Vercel — on les rétablit
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    })
  }
  return getFirestore()
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
    if (meta.intent === 'boost') {
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

// ── Booking ──────────────────────────────────────────────────────────────────
async function finalizeBooking(db, session, meta) {
  const bookingId = meta.bookingId
  if (!bookingId) return

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

  // Génère un billet par qty — codes 6 chars alphanum compatibles `LIB-XXX-XXXXXX`
  const tickets = []
  for (let i = 0; i < qty; i++) {
    const code = generateTicketCode()
    const ticketCode = `LIB-${String(eventId).padStart(3, '0')}-${code}`
    tickets.push({
      id: code,
      ticketCode,
      eventId,
      eventName,
      place: placeType,
      bookedAt: new Date().toISOString(),
      paid: true,
      paymentMethod: 'stripe',
      stripeSessionId: session.id,
      userId,
      // Note : pas de `token` signé ici — la page /paiement-reussi génère le token côté
      // client à partir de la signature actuelle. Quand le fix #10 (signature serveur)
      // sera en place, le token sera généré ici directement.
    })
  }

  await ref.set({
    bookingId,
    eventId,
    eventName,
    userId,
    qty,
    placeType,
    tickets,
    paid: true,
    amountTotalCents: session.amount_total || 0,
    currency: session.currency || 'eur',
    customerEmail: session.customer_details?.email || null,
    customerName: session.customer_details?.name || null,
    stripeSessionId: session.id,
    finalizedAt: FieldValue.serverTimestamp(),
    finalizedBy: 'webhook',
  }, { merge: true })

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

  console.log('[webhook] booking finalized:', bookingId, '— tickets:', tickets.length)
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

  await ref.set(boost)

  if (userId) {
    await db.collection('user_boosts').doc(userId).set({
      items: FieldValue.arrayUnion(boost),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }

  console.log('[webhook] boost finalized:', boostId)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateTicketCode() {
  // 6 caractères alphanumériques (sans I/O/0/1 pour éviter les confusions au scan manuel)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}
