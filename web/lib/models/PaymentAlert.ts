import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `payment_alerts/{key}` — file de réconciliation manuelle générique
// pour tout cas limite qui ne doit jamais échouer silencieusement (compte
// supprimé, event annulé/supprimé pendant le paiement, écart de montant,
// échec de remboursement/versement...). Un admin la consulte (phase agent,
// ultérieure) ; ici on se contente d'écrire dedans de façon fiable.
const paymentAlertSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    reason: { type: String, required: true },
    eventId: { type: String, default: null },
    sellerUid: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: {} },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export type PaymentAlertDoc = InferSchemaType<typeof paymentAlertSchema>
export type PaymentAlertModel = Model<PaymentAlertDoc>

export default (models.PaymentAlert as PaymentAlertModel) || model<PaymentAlertDoc>('PaymentAlert', paymentAlertSchema)
