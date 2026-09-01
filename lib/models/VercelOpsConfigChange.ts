import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

const vercelOpsConfigChangeSchema = new Schema(
  {
    actorUserId: { type: String, required: true, index: true },
    actorEmail: { type: String, default: null },
    key: { type: String, required: true, index: true },
    edgeConfigKey: { type: String, required: true },
    previousValue: { type: Schema.Types.Mixed, default: null },
    nextValue: { type: Schema.Types.Mixed, required: true },
    changedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
)

vercelOpsConfigChangeSchema.index({ changedAt: -1 })

export type VercelOpsConfigChangeDoc = InferSchemaType<typeof vercelOpsConfigChangeSchema>
export type VercelOpsConfigChangeModel = Model<VercelOpsConfigChangeDoc>

export default (models.VercelOpsConfigChange as VercelOpsConfigChangeModel) ||
  model<VercelOpsConfigChangeDoc>('VercelOpsConfigChange', vercelOpsConfigChangeSchema)
