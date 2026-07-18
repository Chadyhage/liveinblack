import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `payout_requests/{id}` — demande de reversement MANUEL, créée par
// un vendeur (organisateur/prestataire) en mode 'ledger'/FedaPay quand un
// solde `SellerBalance` est dû. Contrairement au legacy (écriture Firestore
// CLIENTE, montant simplement recopié depuis ce que le navigateur voyait dans
// `seller_balances`), la création ici relit le solde AUTORITATIF côté serveur
// (lib/server/organizerPayouts.ts:requestManualPayout) — un client ne peut
// plus se déclarer un montant dû arbitraire.
//
// Le RÈGLEMENT (passage à 'paid', écriture de paidAt/paidBy/paidAmount) reste
// entièrement manuel, fait par un agent/admin depuis un panneau dédié — hors
// périmètre de cette phase (#7), reporté à la phase 9 (outils agent/admin),
// exactement comme côté legacy (AgentPage.jsx est seul à écrire ces champs).
const payoutRequestSchema = new Schema(
  {
    sellerUid: { type: String, required: true, index: true },
    amountDueCents: { type: Number, default: 0 },
    amountDueXOF: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'paid', 'rejected'], default: 'pending', index: true },
    paidAt: { type: Date, default: null },
    paidBy: { type: String, default: null },
    paidAmount: { type: Number, default: null },
    paidCurrency: { type: String, default: null },
  },
  { timestamps: true }
)

export type PayoutRequestDoc = InferSchemaType<typeof payoutRequestSchema>
export type PayoutRequestModel = Model<PayoutRequestDoc>

export default (models.PayoutRequest as PayoutRequestModel) || model<PayoutRequestDoc>('PayoutRequest', payoutRequestSchema)
