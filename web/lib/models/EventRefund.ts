import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `event_refunds/{eventId}__{paymentRef}` — registre idempotent des
// remboursements suite à annulation d'événement. Stripe : remboursement
// automatique (voir lib/server/eventRefunds.ts). FedaPay : aucune API de
// remboursement n'existe → liste manuelle ('pending_manual') qu'un admin
// exécute lui-même dans le dashboard FedaPay.
const eventRefundSchema = new Schema(
  {
    eventId: { type: String, required: true, index: true },
    paymentRef: { type: String, required: true }, // stripeSessionId ou fedapayTxnId
    rail: { type: String, enum: ['stripe', 'fedapay'], required: true },
    status: { type: String, enum: ['refunded', 'pending_manual', 'failed'], required: true },
    amountMinor: { type: Number, default: 0 },
    currency: { type: String, enum: ['EUR', 'XOF'], required: true },
    ledgerReversed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

eventRefundSchema.index({ eventId: 1, paymentRef: 1 }, { unique: true })

export type EventRefundDoc = InferSchemaType<typeof eventRefundSchema>
export type EventRefundModel = Model<EventRefundDoc>

export default (models.EventRefund as EventRefundModel) || model<EventRefundDoc>('EventRefund', eventRefundSchema)
