// Crée un Checkout Stripe pour un emplacement Top 1/2/3.
// Le prix, la région, le propriétaire et la date limite sont déterminés côté
// serveur. Un verrou Firestore temporaire empêche deux paiements concurrents.
import Stripe from 'stripe'
import { getDb } from '../lib/firebaseAdmin.js'
import { requireAuth } from '../lib/verifyAuth.js'
import { boostSlotId, getBoostPlan, normalizeBoostRegion } from '../lib/boosts.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
const CHECKOUT_MINUTES = 31
// Le webhook libère normalement le verrou après 31 minutes si le paiement n'a
// pas lieu. La marge de 24 h privilégie l'absence de double-vente en cas de
// panne temporaire du webhook plutôt qu'une remise en vente trop agressive.
const HOLD_MINUTES = 24 * 60

function eventEndTimestamp(event) {
  if (!event?.date) return 0
  const start = new Date(`${event.date}T${event.time || '00:00'}:00`)
  const end = new Date(`${event.date}T${event.endTime || event.time || '23:59'}:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 0
  if (end <= start) end.setDate(end.getDate() + 1)
  return end.getTime()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await requireAuth(req, res)
  if (!caller) return

  let slotRef = null
  let reservedBoostId = ''
  try {
    const { eventId, position, days, boostId } = req.body || {}
    const offer = getBoostPlan(position, days)
    if (!eventId || !boostId || !/^[A-Z0-9_-]{8,64}$/i.test(String(boostId)) || !offer) {
      return res.status(400).json({ error: 'Offre de boost invalide.' })
    }

    const db = getDb()
    const eventSnap = await db.collection('events').doc(String(eventId)).get()
    if (!eventSnap.exists) return res.status(404).json({ error: "Cet événement n'existe pas sur le serveur." })
    const event = { ...eventSnap.data(), id: eventSnap.id }
    const ownerId = String(event.organizerId || event.createdBy || '')
    if (!ownerId || ownerId !== caller.uid) {
      return res.status(403).json({ error: "Tu ne peux booster que l'un de tes événements." })
    }
    if (event.cancelled) return res.status(409).json({ error: 'Un événement annulé ne peut pas être boosté.' })

    const now = Date.now()
    const eventEnd = eventEndTimestamp(event)
    const requestedEnd = now + offer.tier.days * 86400000
    if (!eventEnd || eventEnd <= now) return res.status(409).json({ error: "L'événement est déjà terminé." })
    if (requestedEnd > eventEnd) {
      return res.status(409).json({ error: "Cette durée dépasse la date de fin de l'événement. Choisis une durée plus courte." })
    }

    const region = normalizeBoostRegion(event.regionId || event.country || event.region)
    if (!region) return res.status(409).json({ error: "Renseigne d'abord la région de l'événement." })

    // Compatibilité avec les boosts créés avant l'introduction des verrous :
    // on refuse de vendre par-dessus un ancien boost encore actif.
    const legacyBoosts = await db.collection('boosts').where('position', '==', offer.plan.position).get()
    const legacyConflict = legacyBoosts.docs.map(doc => doc.data()).find(boost =>
      normalizeBoostRegion(boost.regionId || boost.region) === region
      && new Date(boost.expiresAt || 0).getTime() > now
      && boost.conflict !== true
      && !['refunded_conflict', 'cancelled'].includes(boost.status)
    )
    if (legacyConflict) {
      return res.status(409).json({
        error: `Cet emplacement est déjà réservé jusqu'au ${new Date(legacyConflict.expiresAt).toLocaleString('fr-FR')}. Choisis une autre position.`,
        conflictUntil: legacyConflict.expiresAt,
      })
    }

    const slotId = boostSlotId(region, offer.plan.position)
    slotRef = db.collection('boost_slots').doc(slotId)
    reservedBoostId = String(boostId)
    const holdUntil = now + HOLD_MINUTES * 60 * 1000

    await db.runTransaction(async tx => {
      const slotSnap = await tx.get(slotRef)
      const slot = slotSnap.exists ? slotSnap.data() : null
      const occupiedUntil = Math.max(
        new Date(slot?.activeUntil || 0).getTime() || 0,
        new Date(slot?.holdUntil || 0).getTime() || 0,
      )
      const sameReservation = slot?.boostId === reservedBoostId
        && slot?.eventId === String(eventId)
        && slot?.userId === caller.uid
        && Number(slot?.position) === offer.plan.position
      if (slot && occupiedUntil > now && !sameReservation) {
        const err = new Error('BOOST_SLOT_TAKEN')
        err.code = 'BOOST_SLOT_TAKEN'
        err.until = new Date(occupiedUntil).toISOString()
        throw err
      }
      tx.set(slotRef, {
        slotId, boostId: reservedBoostId, eventId: String(eventId), userId: caller.uid,
        position: offer.plan.position, region, status: 'pending', holdUntil: new Date(holdUntil).toISOString(),
        activeUntil: null, updatedAt: new Date(now).toISOString(),
      })
    })

    const origin = req.headers.origin || `https://${req.headers.host}`
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      expires_at: Math.floor((now + CHECKOUT_MINUTES * 60 * 1000) / 1000),
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Boost ${offer.plan.label} — ${offer.tier.label}`,
            description: `Mise en avant de « ${String(event.name || 'Événement').slice(0, 160)} » (${region})`,
          },
          unit_amount: Math.round(offer.tier.price * 100),
        },
        quantity: 1,
      }],
      ...(caller.email ? { customer_email: caller.email } : {}),
      success_url: `${origin}/boost-active?session_id={CHECKOUT_SESSION_ID}&boost_id=${encodeURIComponent(reservedBoostId)}`,
      cancel_url: `${origin}/evenements/${encodeURIComponent(eventId)}?boost_cancelled=1`,
      metadata: {
        intent: 'boost', eventId: String(eventId), eventName: String(event.name || '').slice(0, 200),
        position: String(offer.plan.position), days: String(offer.tier.days), region,
        userId: caller.uid, boostId: reservedBoostId, slotId,
      },
      locale: 'fr',
    }, { idempotencyKey: `boost-checkout-${reservedBoostId}` })

    await slotRef.set({ stripeSessionId: session.id, updatedAt: new Date().toISOString() }, { merge: true })
    return res.status(200).json({ url: session.url, sessionId: session.id })
  } catch (err) {
    if (err?.code === 'BOOST_SLOT_TAKEN' || err?.message === 'BOOST_SLOT_TAKEN') {
      return res.status(409).json({
        error: `Cet emplacement est déjà réservé${err.until ? ` jusqu'au ${new Date(err.until).toLocaleString('fr-FR')}` : ''}. Choisis une autre position.`,
        conflictUntil: err.until || null,
      })
    }
    if (slotRef && reservedBoostId) {
      try {
        const db = getDb()
        await db.runTransaction(async tx => {
          const snap = await tx.get(slotRef)
          if (snap.exists && snap.data().boostId === reservedBoostId && snap.data().status === 'pending') tx.delete(slotRef)
        })
      } catch {}
    }
    console.error('[/api/checkout-boost] error:', err)
    return res.status(500).json({ error: 'Impossible de préparer le paiement du boost.' })
  }
}
