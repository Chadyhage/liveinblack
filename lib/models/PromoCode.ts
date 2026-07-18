import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `event_promos/{eventId} = { items: [...] }` (Firestore, array-doc).
// Un document par code : permet un `$inc` atomique sur `usedCount` au lieu
// d'une transaction lisant/réécrivant tout le tableau. Unicité (eventId, code)
// plutôt qu'un id global — le même code peut exister sur deux événements.
const promoCodeSchema = new Schema(
  {
    eventId: { type: String, required: true, index: true },
    code: { type: String, required: true },
    type: { type: String, enum: ['percent', 'fixed'], required: true },
    value: { type: Number, required: true },
    maxUses: { type: Number, default: 0 }, // 0 = illimité
    usedCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
    createdBy: { type: String, default: null },
  },
  { timestamps: true }
)

promoCodeSchema.index({ eventId: 1, code: 1 }, { unique: true })

export type PromoCodeDoc = InferSchemaType<typeof promoCodeSchema>
export type PromoCodeModel = Model<PromoCodeDoc>

export default (models.PromoCode as PromoCodeModel) || model<PromoCodeDoc>('PromoCode', promoCodeSchema)
