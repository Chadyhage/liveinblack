import stripe from './stripeClient'
import EventRefund from '../models/EventRefund'
import SellerBalance from '../models/SellerBalance'
import PaymentAlert from '../models/PaymentAlert'
import type { OrderDoc } from '../models/Order'
import mongoose from 'mongoose'

// Remboursement Stripe — idempotent via EventRefund (clé eventId+paymentRef).
// Utilisé (a) par le webhook quand un paiement arrive après l'annulation/
// suppression de l'événement, et (b) par le flux d'annulation complet côté
// organisateur (à construire) qui parcourt tous les billets payés.
export async function refundStripeOrder(order: OrderDoc & { _id: mongoose.Types.ObjectId }): Promise<{ ok: boolean; error?: string }> {
  if (!order.stripeSessionId) return { ok: false, error: 'no_stripe_session' }

  const existing = await EventRefund.findOne({ eventId: order.eventId, paymentRef: order.stripeSessionId }).lean()
  if (existing?.status === 'refunded') return { ok: true }

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(order.stripeSessionId)
    const paymentIntent = checkoutSession.payment_intent
    if (!paymentIntent) return { ok: false, error: 'no_payment_intent' }

    const refundParams =
      order.connectMode === 'auto' ? { reverse_transfer: true, refund_application_fee: true } : {}

    await stripe.refunds.create(
      { payment_intent: String(paymentIntent), ...refundParams },
      { idempotencyKey: `evcancel-${order.eventId}-${order.stripeSessionId}` }
    )

    const amountMinor = checkoutSession.amount_total || 0
    await EventRefund.updateOne(
      { eventId: order.eventId, paymentRef: order.stripeSessionId },
      { $set: { rail: 'stripe', status: 'refunded', amountMinor, currency: order.currency } },
      { upsert: true }
    )

    // Si le vendeur avait déjà été crédité (settled), on reprend le crédit —
    // mais seulement dans ce cas, sinon le ledger deviendrait négatif à tort.
    if (order.settled && order.sellerUid && order.connectMode === 'ledger') {
      await SellerBalance.updateOne(
        { sellerUid: order.sellerUid },
        { $inc: { amountDueCents: -(order.unitPriceMinor * (order.isTable ? 1 : order.qty) - order.feeMinor) } }
      )
    }

    return { ok: true }
  } catch (err) {
    console.error('[eventRefunds] refundStripeOrder failed:', err)
    await PaymentAlert.updateOne(
      { key: `refund_failed_${order.eventId}_${order.stripeSessionId}` },
      { $set: { reason: 'stripe_refund_failed', eventId: order.eventId, details: { error: String(err) } } },
      { upsert: true }
    )
    return { ok: false, error: 'stripe_refund_failed' }
  }
}
