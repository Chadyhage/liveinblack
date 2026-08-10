import type Stripe from 'stripe'
import Boost from '../models/Boost'
import BoostSlot from '../models/BoostSlot'
import PaymentAlert from '../models/PaymentAlert'
import Event from '../models/Event'
import stripe from './stripeClient'
import { getBoostPlan } from '../shared/boosts'
import { notifyUserById } from './emails/notify'
import { boostConflictEmail } from './emails'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

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
  const now = Date.now()

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
    let refundOk = false
    try {
      const paymentIntent = session.payment_intent
      if (paymentIntent) {
        await stripe.refunds.create({ payment_intent: String(paymentIntent) }, { idempotencyKey: `boost-conflict-refund-${meta.boostId}` })
        refundOk = true
      }
    } catch (err) {
      console.error('[finalizeBoost] conflict refund failed:', err)
    }
    // Sans ce Boost.create, aucune trace du conflit n'existait en base :
    // Boost.conflict/status:'refunded_conflict' ne sont écrits nulle part
    // ailleurs dans le repo, donc AgentBoostsClient (qui lit exactement ces
    // champs) ne pouvait jamais afficher un conflit, et un remboursement
    // Stripe en échec (réseau, charge déjà remboursée, solde insuffisant)
    // était indiscernable d'un succès — l'acheteur voyait "remboursé
    // automatiquement" en pure croyance, pas en fait constaté (bug confirmé
    // par audit). status:'refund_failed' existe dans le schéma depuis le
    // début mais n'était jamais écrit.
    await Boost.create({
      boostId: meta.boostId,
      eventId: meta.eventId,
      position,
      region: meta.region,
      price: paidAmountEUR,
      days,
      userId: meta.userId,
      purchasedAt: new Date(now),
      expiresAt: new Date(now),
      stripeSessionId: session.id,
      finalizedBy: 'webhook',
      status: refundOk ? 'refunded_conflict' : 'refund_failed',
      conflict: true,
    })
    await PaymentAlert.updateOne(
      { key: `boost_slot_lost_${meta.boostId}` },
      { $set: { reason: refundOk ? 'boost_slot_lost' : 'boost_refund_failed', eventId: meta.eventId, details: { paymentIntent: session.payment_intent ? String(session.payment_intent) : null } } },
      { upsert: true }
    )
    const ev = await Event.findById(meta.eventId).select('name').lean()
    await notifyUserById(meta.userId, () =>
      boostConflictEmail(
        ev?.name || 'ton événement',
        refundOk ? 'ce créneau vient d’être pris par une autre réservation, tu as été remboursé' : 'ce créneau vient d’être pris par une autre réservation',
        `${SITE}/spaces/organizer/${encodeURIComponent(meta.eventId)}/boost`,
        SITE
      )
    )
    return
  }

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
