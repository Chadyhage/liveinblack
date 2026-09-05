import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

const vercelPlatformEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true, index: true },
    teamId: { type: String, default: null, index: true },
    projectId: { type: String, default: null, index: true },
    deploymentId: { type: String, default: null },
    region: { type: String, default: null },
    createdAtMs: { type: Number, default: null },
    bodySample: { type: String, default: '' },
    receivedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
)

vercelPlatformEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
vercelPlatformEventSchema.index({ receivedAt: -1 })

export type VercelPlatformEventDoc = InferSchemaType<typeof vercelPlatformEventSchema>
export type VercelPlatformEventModel = Model<VercelPlatformEventDoc>

export default (models.VercelPlatformEvent as VercelPlatformEventModel) ||
  model<VercelPlatformEventDoc>('VercelPlatformEvent', vercelPlatformEventSchema)
