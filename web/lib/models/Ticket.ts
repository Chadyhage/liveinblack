import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace la collection Firestore `tickets` (déjà un doc par billet côté
// serveur — voir groupTicketGuard.js / ScannerPage). Une "place de groupe"
// n'est PAS une collection séparée : plusieurs billets partagent le même
// `tableId` (un `hostUid` = l'acheteur, les autres = titulaires de sièges
// attribués). Champs fidèles à src/utils/ticket.js (generateTicketToken) et
// api/tickets.js (check-in, attribution de sièges).
const preorderLineSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, default: 0 }, // résolu serveur au moment de la commande, jamais depuis le client
    qty: { type: Number, default: 1 },
  },
  { _id: false }
)

const ticketSchema = new Schema(
  {
    ticketCode: { type: String, required: true, unique: true, index: true },
    // Lien vers l'Order serveur qui a autorisé l'émission de ce billet (phase 3
    // — jamais le webhook n'émet un billet sans Order payé correspondant).
    orderId: { type: String, default: null, index: true },
    eventId: { type: String, required: true, index: true },
    eventName: { type: String, default: '' },
    eventDate: { type: String, default: '' },
    place: { type: String, default: '' },
    placePrice: { type: Number, default: 0 },
    totalPrice: { type: Number, default: 0 },
    currency: { type: String, default: 'EUR' },
    preorders: { type: [preorderLineSchema], default: [] },
    userId: { type: String, required: true, index: true },
    // hostUid : acheteur d'une place de groupe (table). Absent sur un billet solo.
    hostUid: { type: String, default: null, index: true },
    tableId: { type: String, default: null, index: true },
    seatIndex: { type: Number, default: null },
    // seatVersion / entryNonce : anti-fraude sur réattribution de siège (#79).
    seatVersion: { type: Number, default: 0 },
    entryNonce: { type: String, default: null },
    // assignedTo / assignedName / assignedAt : qui tient ce siège actuellement
    // (affichage côté hôte) — null quand le siège est détenu par l'hôte lui-même.
    assignedTo: { type: String, default: null },
    assignedName: { type: String, default: null },
    assignedAt: { type: Date, default: null },
    guestName: { type: String, default: null },
    revoked: { type: Boolean, default: false },
    paid: { type: Boolean, default: false },
    source: { type: String, default: 'paid' }, // 'paid' | 'free' | 'guestlist'
    stripeSessionId: { type: String, default: null, index: true },
    fedapayTransactionId: { type: String, default: null },
    promoCode: { type: String, default: null },
    bookedAt: { type: Date, default: null },
    checkedInAt: { type: Date, default: null },
    checkedInBy: { type: String, default: null },
  },
  { timestamps: true }
)

export type TicketDoc = InferSchemaType<typeof ticketSchema>
export type TicketModel = Model<TicketDoc>

export default (models.Ticket as TicketModel) || model<TicketDoc>('Ticket', ticketSchema)
