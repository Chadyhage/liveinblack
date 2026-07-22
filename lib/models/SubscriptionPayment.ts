import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Registre comptable minimal des abonnements confirmés par les webhooks.
// Aucune donnée de carte, aucun nom ni email n'est conservé ici.
const subscriptionPaymentSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    rail: { type: String, enum: ['stripe', 'fedapay'], required: true },
    externalId: { type: String, required: true },
    amountMinor: { type: Number, required: true },
    currency: { type: String, enum: ['EUR', 'XOF'], required: true },
    paidAt: { type: Date, required: true },
    receiptUrl: { type: String, default: null },
  },
  { timestamps: true }
)

subscriptionPaymentSchema.index({ userId: 1, paidAt: -1 })

export type SubscriptionPaymentDoc = InferSchemaType<typeof subscriptionPaymentSchema>
export type SubscriptionPaymentModel = Model<SubscriptionPaymentDoc>

export default (models.SubscriptionPayment as SubscriptionPaymentModel) || model<SubscriptionPaymentDoc>('SubscriptionPayment', subscriptionPaymentSchema)
