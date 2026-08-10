import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Suivi des ventes hors-application via agent (#C —
// LIVE_IN_BLACK_Achat_Tickets_Hors_Application_Version_Finale.docx). Un
// document par vente CASH (jamais pour du Mobile Money, qui est réglé
// immédiatement via FedaPay comme un achat normal — voir
// lib/server/agentSales.ts). Le billet ne peut être généré/validé tant que
// la part LIVE IN BLACK n'a pas été réglée : `status` fait foi.
const cashSaleSettlementSchema = new Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    eventId: { type: String, required: true, index: true },
    agentUid: { type: String, required: true, index: true },
    organizerId: { type: String, required: true, index: true },

    amountTotalMinor: { type: Number, required: true },
    currency: { type: String, enum: ['EUR', 'XOF'], required: true },
    libShareMinor: { type: Number, required: true },
    organizerShareMinor: { type: Number, required: true },

    // 'instant_debit' : la part LIB est prélevée immédiatement sur le moyen
    // de paiement de l'organisateur. 'agent_settles' : l'agent règle lui-même
    // le montant total numériquement, réparti ensuite comme un achat normal.
    settlementMode: { type: String, enum: ['instant_debit', 'agent_settles'], required: true },
    status: { type: String, enum: ['pending', 'settled', 'failed', 'cancelled'], default: 'pending', index: true },
    settledAt: { type: Date, default: null },
    settledVia: { type: String, default: null },
    failReason: { type: String, default: null },
    // Anti-doublon du rappel "règlement en attente" (voir
    // lib/server/agentSales.ts::sendPendingCashSaleReminders) — jamais
    // réinitialisé, une vente ne reçoit qu'un seul rappel sur toute sa durée
    // en attente.
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
)

export type CashSaleSettlementDoc = InferSchemaType<typeof cashSaleSettlementSchema>
export type CashSaleSettlementModel = Model<CashSaleSettlementDoc>

export default (models.CashSaleSettlement as CashSaleSettlementModel) || model<CashSaleSettlementDoc>('CashSaleSettlement', cashSaleSettlementSchema)
