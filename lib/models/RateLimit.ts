import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

const rateLimitSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
)

rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type RateLimitDoc = InferSchemaType<typeof rateLimitSchema>
export type RateLimitModel = Model<RateLimitDoc>

export default (models.RateLimit as RateLimitModel) || model<RateLimitDoc>('RateLimit', rateLimitSchema)
