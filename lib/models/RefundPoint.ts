import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

const refundPointSchema = new Schema(
  {
    name: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, default: '' },
    country: { type: String, enum: ['BJ'], default: 'BJ' },
    active: { type: Boolean, default: true, index: true },
    agentIds: { type: [String], default: [], index: true },
    cashDisbursedMinor: { type: Number, default: 0 },
    cashDisbursementCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

refundPointSchema.index({ country: 1, active: 1, city: 1 })

export type RefundPointDoc = InferSchemaType<typeof refundPointSchema>
export type RefundPointModel = Model<RefundPointDoc>

export default (models.RefundPoint as RefundPointModel) || model<RefundPointDoc>('RefundPoint', refundPointSchema)
