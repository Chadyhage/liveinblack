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

    // Montant remboursé = prix du billet + précommandes, HORS frais de service
    // LIVEINBLACK (politique : les frais de service ne sont jamais remboursés,
    // cf. CGU §05). Même formule que settleOrder (lib/server/fulfillOrder.ts)
    // et recordFedapayRefund (lib/server/fedapayRefunds.ts) pour la partie
    // "brut hors frais" — seatCount géré comme partout ailleurs (une table
    // payée = 1 unité payée, quel que soit tableSeats).
    const seatCount = order.isTable ? 1 : order.qty
    const preorderTotal = order.preorders.reduce((s, p) => s + p.price * p.qty, 0)
    const grossMinor = order.unitPriceMinor * seatCount + preorderTotal
    const refundAmountMinor = Math.max(0, grossMinor)

    // reverse_transfer (mode Connect 'auto') récupère uniquement la part déjà
    // transférée au vendeur (= grossMinor, puisque le frais de service était
    // retenu à la source via application_fee_amount, cf. app/api/checkout/route.ts)
    // — on ne demande PAS refund_application_fee : ce frais reste acquis à la
    // plateforme, il n'est jamais remboursé.
    const refundParams = order.connectMode === 'auto' ? { reverse_transfer: true } : {}

    await stripe.refunds.create(
      { payment_intent: String(paymentIntent), amount: refundAmountMinor, ...refundParams },
      { idempotencyKey: `evcancel-${order.eventId}-${order.stripeSessionId}` }
    )

    await EventRefund.updateOne(
      { eventId: order.eventId, paymentRef: order.stripeSessionId },
      { $set: { rail: 'stripe', status: 'refunded', amountMinor: refundAmountMinor, currency: order.currency } },
      { upsert: true }
    )

    // Si le vendeur avait déjà été crédité (settled), on reprend le crédit —
    // mais seulement dans ce cas, sinon le ledger deviendrait négatif à tort.
    // (grossMinor - feeMinor) = exactement le montant crédité par settleOrder,
    // précommandes incluses.
    if (order.settled && order.sellerUid && order.connectMode === 'ledger') {
      await SellerBalance.updateOne(
        { sellerUid: order.sellerUid },
        { $inc: { amountDueCents: -(grossMinor - order.feeMinor) } }
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
