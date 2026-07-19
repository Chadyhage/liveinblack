import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace le duo vulnérable `bookings/{bookingId}` (Firestore, mutable côté
// client) + billets `client-postpay` adoptés par le webhook (audit C05).
// Un Order est créé UNE FOIS, côté serveur, avant tout paiement — il fige la
// quantité, le prix, la devise, les préco résolues serveur, et c'est la SEULE
// source de vérité que le webhook consulte pour savoir combien de billets
// émettre. Aucune route ne permet au client de modifier un Order après
// création (pas de PATCH exposé) — seul le webhook (paid/settled) et le
// mécanisme d'expiration (status) le font évoluer.
const preorderRequestSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true }, // résolu depuis event.menu au moment de la commande
    qty: { type: Number, required: true },
  },
  { _id: false }
)

const orderSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    eventId: { type: String, required: true, index: true },
    placeId: { type: String, required: true },
    placeType: { type: String, required: true }, // libellé (event.places[].type), pour affichage/reçu
    qty: { type: Number, required: true }, // nombre de billets (1 pour une table = 1 unité payée)
    isTable: { type: Boolean, default: false },
    tableSeats: { type: Number, default: 0 },

    unitPriceMinor: { type: Number, required: true }, // prix unitaire figé serveur (cents EUR ou unités XOF)
    currency: { type: String, enum: ['EUR', 'XOF'], required: true },
    feeMinor: { type: Number, default: 0 },

    promoCode: { type: String, default: null },
    promoUses: { type: Number, default: 0 },
    promoUnitDiscountMinor: { type: Number, default: 0 },

    preorders: { type: [preorderRequestSchema], default: [] },

    sellerUid: { type: String, default: null },
    connectMode: { type: String, enum: ['auto', 'ledger', 'none'], default: 'none' },

    rail: { type: String, enum: ['stripe', 'fedapay', 'free'], required: true },
    stripeSessionId: { type: String, default: null, index: true },
    fedapayTxnId: { type: String, default: null, index: true },

    status: { type: String, enum: ['pending', 'paid', 'expired', 'cancelled'], default: 'pending', index: true },
    stockDecremented: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },

    // Anti double-traitement du webhook (verrou 90s) + drapeaux finaux, même
    // pattern que le legacy bookings/{id}.fulfillStartedAt / paid / settled.
    fulfillStartedAt: { type: Date, default: null },
    paid: { type: Boolean, default: false },
    settled: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export type OrderDoc = InferSchemaType<typeof orderSchema>
export type OrderModel = Model<OrderDoc>

export default (models.Order as OrderModel) || model<OrderDoc>('Order', orderSchema)
