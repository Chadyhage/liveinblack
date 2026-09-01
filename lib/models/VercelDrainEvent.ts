import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

const vercelDrainEventSchema = new Schema(
  {
    source: { type: String, default: null },
    level: { type: String, default: null },
    projectId: { type: String, default: null },
    deploymentId: { type: String, default: null },
    requestId: { type: String, default: null },
    message: { type: String, default: '' },
    eventCount: { type: Number, default: 1 },
    bodySample: { type: String, default: '' },
    signatureHash: { type: String, required: true, unique: true },
    receivedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
)

vercelDrainEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
vercelDrainEventSchema.index({ receivedAt: -1 })
vercelDrainEventSchema.index({ level: 1, receivedAt: -1 })

export type VercelDrainEventDoc = InferSchemaType<typeof vercelDrainEventSchema>
export type VercelDrainEventModel = Model<VercelDrainEventDoc>

export default (models.VercelDrainEvent as VercelDrainEventModel) ||
  model<VercelDrainEventDoc>('VercelDrainEvent', vercelDrainEventSchema)
