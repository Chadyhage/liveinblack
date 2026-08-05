import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `seller_balances/{sellerUid}` — ledger interne pour les vendeurs
// non éligibles Stripe Connect (mode 'ledger') et pour le rail FedaPay (XOF,
// jamais éligible Connect). Crédité par les webhooks au premier settle,
// débité par le cron de versement (lib/server/eventPayouts.ts) ou par un
// remboursement (lib/server/eventRefunds.ts).
const sellerBalanceSchema = new Schema(
  {
    sellerUid: { type: String, required: true, unique: true, index: true },
    amountDueCents: { type: Number, default: 0 }, // EUR, ledger Stripe non-Connect
    amountDueXOF: { type: Number, default: 0 }, // FedaPay
  },
  { timestamps: true }
)

export type SellerBalanceDoc = InferSchemaType<typeof sellerBalanceSchema>
export type SellerBalanceModel = Model<SellerBalanceDoc>

export default (models.SellerBalance as SellerBalanceModel) || model<SellerBalanceDoc>('SellerBalance', sellerBalanceSchema)
