import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Blocage temporaire de place avec acompte (décision client transmise le
// 25/07/2026, extension de la Phase B) : un client bloque une place à son
// prix COURANT en payant un acompte partiel (5%/24h ou 10%/72h, voir
// lib/shared/fees.ts::SEAT_HOLD_SHORT/LONG), puis règle le solde via un
// checkout NORMAL avant expiration — sinon la place est remise en vente
// automatiquement et l'acompte n'est pas remboursé. L'argent transite
// TOUJOURS par un Order (jamais un montant géré ici directement) : ce modèle
// ne porte que l'état du blocage lui-même — voir lib/server/seatHolds.ts.
const seatHoldSchema = new Schema(
  {
    eventId: { type: String, required: true, index: true },
    placeId: { type: String, required: true },
    placeType: { type: String, required: true }, // libellé figé pour affichage (event.places[].type)
    userId: { type: String, required: true, index: true },

    tier: { type: String, enum: ['short', 'long'], required: true },
    currency: { type: String, enum: ['EUR', 'XOF'], required: true },
    // Prix TOTAL du billet figé au moment du hold (jamais recalculé même si
    // l'organisateur change le prix de la place ensuite) — le solde à payer
    // = unitPriceMinor - depositMinor.
    unitPriceMinor: { type: Number, required: true },
    depositMinor: { type: Number, required: true },

    // 'pending_payment' : Order de l'acompte créé, en attente du
    // webhook Stripe/FedaPay (voir depositOrderId). 'active' : acompte payé,
    // stock réservé, en attente du solde avant expiresAt. 'completed' :
    // solde payé (Order kind:'seat_hold_completion' payé), billet miné
    // normalement. 'expired' : solde jamais payé avant expiresAt (ou acompte
    // jamais payé avant l'expiration de son propre Order) — stock relâché,
    // acompte non remboursé.
    status: { type: String, enum: ['pending_payment', 'active', 'completed', 'expired'], default: 'pending_payment', index: true },

    depositOrderId: { type: String, default: null },
    completingOrderId: { type: String, default: null },

    createdAt: { type: Date, default: () => new Date() },
    activatedAt: { type: Date, default: null },
    // Renseigné UNIQUEMENT une fois `active` (activatedAt + durée du tier) —
    // null tant que l'acompte n'est pas confirmé payé.
    expiresAt: { type: Date, default: null },
    // Anti-doublon du rappel "ta place expire bientôt" (voir
    // lib/server/seatHolds.ts::sendSeatHoldExpiryReminders) — jamais réinitialisé,
    // un hold ne reçoit qu'un seul rappel sur toute sa durée de vie.
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: false }
)

seatHoldSchema.index({ status: 1, expiresAt: 1 })

export type SeatHoldDoc = InferSchemaType<typeof seatHoldSchema>

export default (models.SeatHold as Model<SeatHoldDoc>) || model<SeatHoldDoc>('SeatHold', seatHoldSchema)
