import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `event_orders/{eventId} -> { items: OrderItem[] }` — commande sur
// place (précommandes affichées + ajouts en temps réel pendant la soirée).
// Un seul document par événement (comme le legacy) : les mutations passent
// TOUJOURS par lib/server/eventOrders.ts (jamais d'écriture client directe),
// qui applique les autorisations par rang (voir ce fichier).
const orderItemSchema = new Schema(
  {
    id: { type: String, required: true },
    menuItemId: { type: String, default: null }, // référence event.menu[].name (pas d'id stable côté menu)
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceMinor: { type: Number, required: true }, // résolu serveur depuis event.menu, jamais du client
    showOptionId: { type: String, default: null },
    showLabel: { type: String, default: null },
    showInfo: { type: String, default: null },
    ticketId: { type: String, required: true }, // ticketCode propriétaire de la ligne
    addedBy: { type: String, required: true },
    addedByName: { type: String, default: null }, // symétrie affichage avec servedByName/paidByName
    status: { type: String, enum: ['sent', 'served', 'cancelled'], default: 'sent' },
    kind: { type: String, enum: ['order', 'preorder', 'included'], default: 'order' },
    servedAt: { type: Date, default: null },
    servedBy: { type: String, default: null },
    servedByName: { type: String, default: null },
    paidAt: { type: Date, default: null },
    paidBy: { type: String, default: null },
    paidByName: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, default: null },
    cancellationReason: { type: String, default: null },
  },
  { timestamps: true }
)

const eventOrderSchema = new Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  items: { type: [orderItemSchema], default: [] },
})

export type EventOrderDoc = InferSchemaType<typeof eventOrderSchema>
export type EventOrderModel = Model<EventOrderDoc>
export type OrderItem = EventOrderDoc['items'][number]

export default (models.EventOrder as EventOrderModel) || model<EventOrderDoc>('EventOrder', eventOrderSchema)
