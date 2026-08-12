import EventRefund from '../models/EventRefund'
import SellerBalance from '../models/SellerBalance'
import type { OrderDoc } from '../models/Order'
import mongoose from 'mongoose'

// FedaPay n'expose AUCUNE API de remboursement — contrairement à Stripe, on
// ne peut jamais rendre l'argent automatiquement. On enregistre une entrée
// `pending_manual` qu'un humain doit exécuter dans le dashboard FedaPay, et on
// reprend le crédit vendeur interne s'il avait déjà été accordé (pour ne pas
// laisser croire qu'une somme reste due alors que l'événement est annulé).
export async function recordFedapayRefund(order: OrderDoc & { _id: mongoose.Types.ObjectId }): Promise<{ ok: boolean }> {
  if (!order.fedapayTxnId) return { ok: false }

  const existing = await EventRefund.findOne({ eventId: order.eventId, paymentRef: order.fedapayTxnId }).lean()
  if (existing) return { ok: true } // déjà consigné (refunded ou pending_manual) — idempotent

  const seatCount = order.isTable ? 1 : order.qty
  const preorderTotal = order.preorders.reduce((s, p) => s + p.price * p.qty, 0)
  const amountMinor = order.unitPriceMinor * seatCount + preorderTotal

  // Tout est local à Mongo ici (contrairement au rail Stripe, qui appelle une
  // API externe) — les 3 écritures ci-dessous (création de l'EventRefund,
  // reprise du solde vendeur, marquage ledgerReversed) doivent donc TOUJOURS
  // réussir ou échouer ensemble. Avant ce correctif (audit du 12/08/2026), un
  // crash entre le décrément du solde et le marquage `ledgerReversed:true`
  // laissait un état incohérent : un retry ultérieur qui se fierait
  // uniquement à `ledgerReversed` pouvait redécrémenter le solde une seconde
  // fois. Re-vérifie `existing` DANS la transaction (pas seulement au-dessus)
  // pour rester correct sous concurrence — la première vérification n'est
  // qu'un fast-path qui évite d'ouvrir une transaction pour rien.
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const alreadyRecorded = await EventRefund.findOne({ eventId: order.eventId, paymentRef: order.fedapayTxnId }).session(session)
      if (alreadyRecorded) return

      await new EventRefund({
        eventId: order.eventId,
        paymentRef: order.fedapayTxnId,
        rail: 'fedapay',
        status: 'pending_manual',
        amountMinor,
        currency: order.currency,
        ledgerReversed: false,
      }).save({ session })

      if (order.settled && order.sellerUid) {
        const owedMinor = amountMinor - order.feeMinor
        // Clampé à 0 : si le solde avait déjà été versé par le cron de
        // paiement avant l'annulation, un décrément aveugle créerait une
        // dette fantôme.
        const balance = await SellerBalance.findOne({ sellerUid: order.sellerUid }).session(session)
        const decrement = Math.min(owedMinor, balance?.amountDueXOF || 0)
        if (decrement > 0) {
          await SellerBalance.updateOne({ sellerUid: order.sellerUid }, { $inc: { amountDueXOF: -decrement } }, { session })
        }
        await EventRefund.updateOne({ eventId: order.eventId, paymentRef: order.fedapayTxnId }, { $set: { ledgerReversed: true } }, { session })
      }
    })
  } finally {
    await session.endSession()
  }

  return { ok: true }
}
