import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Bourse de revente officielle (LIVE_IN_BLACK_Systeme_de_revente.docx) — un
// listing par billet (ou par table entière — `isGroupListing`) mis en vente
// par son détenteur. Le paiement acheteur passe par le MÊME flux Order que
// n'importe quel achat (lib/server/orders.ts crée un Order `kind:'resale'`
// référençant ce listing) : ce modèle ne porte que l'état de la MISE EN VENTE
// elle-même, jamais l'argent — voir lib/server/resale.ts pour la finalisation.
const resaleListingSchema = new Schema(
  {
    // ticketCode plutôt qu'un ObjectId Ticket — même convention que le reste
    // du schéma Ticket (référencé par code, jamais par _id Mongo).
    // Pas de `index: true` ici — l'index partiel unique déclaré plus bas
    // (schema.index) couvre déjà les recherches par ticketCode.
    ticketCode: { type: String, required: true },
    eventId: { type: String, required: true, index: true },
    sellerUid: { type: String, required: true, index: true },

    resalePriceMinor: { type: Number, required: true },
    currency: { type: String, enum: ['EUR', 'XOF'], required: true },
    // Figés au moment de la mise en vente — recalculés seulement si le
    // vendeur modifie son prix avant toute vente (jamais après).
    feeMinor: { type: Number, required: true },
    sellerNetMinor: { type: Number, required: true },

    // 'reserved' : un acheteur a initié un paiement (Order kind:'resale' en
    // attente) — verrouille le listing pendant la fenêtre de paiement pour
    // qu'il ne soit jamais vendu deux fois ; retombe à 'active' si l'Order
    // expire/échoue (voir lib/server/resale.ts::releaseResaleOrder).
    status: { type: String, enum: ['active', 'reserved', 'sold', 'withdrawn', 'expired', 'suspended'], default: 'active', index: true },
    listedAt: { type: Date, default: () => new Date() },
    closesAt: { type: Date, required: true }, // défaut : portes de l'event - 2h

    buyerUid: { type: String, default: null },
    soldAt: { type: Date, default: null },
    resaleOrderId: { type: String, default: null }, // Order kind:'resale' (pending puis paid) qui finance/a financé la vente

    // Place de groupe (table) : toutes les admissions du tableId sont
    // transférées ensemble, jamais séparément (règle non négociable).
    isGroupListing: { type: Boolean, default: false },
    tableId: { type: String, default: null },
  },
  { timestamps: true }
)

// Un seul listing ACTIF ou EN RÉSERVATION à la fois par billet — index
// partiel (comme SeatInvitation.ticketCode pour les invitations 'pending').
resaleListingSchema.index({ ticketCode: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['active', 'reserved'] } } })

export type ResaleListingDoc = InferSchemaType<typeof resaleListingSchema>
export type ResaleListingModel = Model<ResaleListingDoc>

export default (models.ResaleListing as ResaleListingModel) || model<ResaleListingDoc>('ResaleListing', resaleListingSchema)
