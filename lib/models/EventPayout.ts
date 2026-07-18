import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `event_payouts/{eventId}` — enveloppe de versement FedaPay (XOF).
// L'argent ne part JAMAIS avant la fin de l'événement (+ marge) ; voir
// lib/server/eventPayouts.ts. Stripe Connect ('auto') n'a pas besoin de cette
// enveloppe (le versement est géré par Stripe lui-même au moment du paiement).
const eventPayoutSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    sellerUid: { type: String, required: true },
    amountDueXOF: { type: Number, default: 0 },
    momoCountry: { type: String, default: null },
    status: { type: String, enum: ['accumulating', 'paying', 'paid', 'failed'], default: 'accumulating', index: true },
    pendingPayoutId: { type: String, default: null },
    claimedAmount: { type: Number, default: 0 },
    failReason: { type: String, default: null },
    failCode: { type: String, default: null },
  },
  { timestamps: true }
)

export type EventPayoutDoc = InferSchemaType<typeof eventPayoutSchema>
export type EventPayoutModel = Model<EventPayoutDoc>

export default (models.EventPayout as EventPayoutModel) || model<EventPayoutDoc>('EventPayout', eventPayoutSchema)
