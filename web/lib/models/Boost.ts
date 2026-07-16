import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace la collection Firestore `boosts` (écrite par le futur webhook
// Stripe porté en phase 3 — ici uniquement consommée en LECTURE pour calculer
// le podium Top 1/2/3 public via buildRegionalTopThree, lib/shared/boosts.ts).
const boostSchema = new Schema(
  {
    // Id client (format vérifié en amont) utilisé comme clé d'idempotence
    // webhook — un Mongo _id auto-généré ne peut pas jouer ce rôle puisque le
    // client le choisit AVANT que le document n'existe (voir boost_slots).
    boostId: { type: String, required: true, unique: true },
    eventId: { type: String, required: true, index: true },
    position: { type: Number, required: true }, // 1 | 2 | 3
    region: { type: String, required: true, index: true },
    price: { type: Number, required: true },
    days: { type: Number, required: true },
    userId: { type: String, required: true },
    purchasedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true }, // index TTL déclaré plus bas (pas de `index:true` ici, sinon doublon)
    stripeSessionId: { type: String, default: null },
    finalizedBy: { type: String, default: 'webhook' },
    status: { type: String, enum: ['active', 'refunded_conflict', 'refund_failed', 'cancelled'], default: 'active' },
    conflict: { type: Boolean, default: false },
  },
  { timestamps: true }
)

// TTL informatif (les boosts expirés sont de toute façon filtrés en lecture
// par activeBoostsForRegion) — évite l'accumulation indéfinie de vieux docs.
boostSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 })

export type BoostDoc = InferSchemaType<typeof boostSchema>
export type BoostModel = Model<BoostDoc>

export default (models.Boost as BoostModel) || model<BoostDoc>('Boost', boostSchema)
