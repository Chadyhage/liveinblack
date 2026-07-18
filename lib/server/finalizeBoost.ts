import type Stripe from 'stripe'
import Boost from '../models/Boost'
import BoostSlot from '../models/BoostSlot'
import PaymentAlert from '../models/PaymentAlert'
import stripe from './stripeClient'
import { getBoostPlan } from '../shared/boosts'

// Finalisation d'un achat de boost (Stripe uniquement — 100% plateforme, pas
// de FedaPay pour les boosts dans le legacy). Port de finalizeBoost() dans
// api/stripe-webhook.js : idempotent sur boostId, honore le prix RÉELLEMENT
// payé même si l'offre a changé depuis, rembourse si le créneau a été perdu
// entre-temps (conflit de réservation concurrente).
export async function finalizeBoost(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata
  if (!meta?.boostId || !meta.eventId || !meta.slotId) return

  const existing = await Boost.findOne({ boostId: meta.boostId }).lean()
  if (existing) return // déjà finalisé (retry webhook)

  const position = Number(meta.position)
  const days = Number(meta.days)
  const offer = getBoostPlan(position, days)
  const paidAmountEUR = (session.amount_total || 0) / 100

  if (!offer) {
    await PaymentAlert.updateOne(
      { key: `boost_plan_${meta.boostId}` },
      { $set: { reason: 'boost_plan_missing', eventId: meta.eventId, details: { position, days } } },
      { upsert: true }
    )
  } else if (Math.abs(offer.tier.price - paidAmountEUR) > 0.01) {
    await PaymentAlert.updateOne(
      { key: `boost_price_${meta.boostId}` },
      { $set: { reason: 'boost_price_mismatch', eventId: meta.eventId, details: { expected: offer.tier.price, paid: paidAmountEUR } } },
      { upsert: true }
    )
  }

  const slot = await BoostSlot.findOne({ slotId: meta.slotId })
  const slotStillOurs = slot && slot.boostId === meta.boostId && slot.eventId === meta.eventId && slot.userId === meta.userId

  if (!slotStillOurs) {
    // Le créneau a été perdu au profit d'une autre réservation concurrente —
    // ne JAMAIS garder l'argent sans livrer le boost : remboursement.
    try {
      const paymentIntent = session.payment_intent
      if (paymentIntent) {
        await stripe.refunds.create({ payment_intent: String(paymentIntent) }, { idempotencyKey: `boost-conflict-refund-${meta.boostId}` })
      }
    } catch (err) {
      console.error('[finalizeBoost] conflict refund failed:', err)
    }
    await PaymentAlert.updateOne(
      { key: `boost_slot_lost_${meta.boostId}` },
      { $set: { reason: 'boost_slot_lost', eventId: meta.eventId, details: {} } },
      { upsert: true }
    )
    return
  }

  const now = Date.now()
  const expiresAt = new Date(now + days * 86400000)

  await Boost.create({
    boostId: meta.boostId,
    eventId: meta.eventId,
    position,
    region: meta.region,
    price: paidAmountEUR,
    days,
    userId: meta.userId,
    purchasedAt: new Date(now),
    expiresAt,
    stripeSessionId: session.id,
    finalizedBy: 'webhook',
    status: 'active',
  })

  await BoostSlot.updateOne({ slotId: meta.slotId }, { $set: { status: 'active', activeUntil: expiresAt } })
}
