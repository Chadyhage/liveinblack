import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

const vercelSpendEventSchema = new Schema(
  {
    teamId: { type: String, required: true, index: true },
    type: { type: String, default: null },
    budgetAmount: { type: Number, default: null },
    currentSpend: { type: Number, default: null },
    thresholdPercent: { type: Number, default: null },
    autoMaintenanceTriggered: { type: Boolean, default: false },
    bodySample: { type: String, default: '' },
    signatureHash: { type: String, required: true, unique: true },
    receivedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
)

vercelSpendEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
vercelSpendEventSchema.index({ thresholdPercent: -1, receivedAt: -1 })

export type VercelSpendEventDoc = InferSchemaType<typeof vercelSpendEventSchema>
export type VercelSpendEventModel = Model<VercelSpendEventDoc>

export default (models.VercelSpendEvent as VercelSpendEventModel) ||
  model<VercelSpendEventDoc>('VercelSpendEvent', vercelSpendEventSchema)
