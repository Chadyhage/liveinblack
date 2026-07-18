import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `boost_slots/{region}__top_{position}` (Firestore) — verrou
// transactionnel empêchant deux organisateurs d'acheter le même
// région+position simultanément (voir api/checkout-boost.js legacy).
const boostSlotSchema = new Schema(
  {
    slotId: { type: String, required: true, unique: true }, // `${region}__top_${position}`
    boostId: { type: String, required: true },
    eventId: { type: String, required: true },
    userId: { type: String, required: true },
    position: { type: Number, required: true },
    region: { type: String, required: true },
    status: { type: String, enum: ['pending', 'active'], default: 'pending' },
    holdUntil: { type: Date, required: true }, // 24h — volontairement long, voir commentaire legacy
    activeUntil: { type: Date, default: null },
    stripeSessionId: { type: String, default: null },
  },
  { timestamps: true }
)

export type BoostSlotDoc = InferSchemaType<typeof boostSlotSchema>
export type BoostSlotModel = Model<BoostSlotDoc>

export default (models.BoostSlot as BoostSlotModel) || model<BoostSlotDoc>('BoostSlot', boostSlotSchema)
