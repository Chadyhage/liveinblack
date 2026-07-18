import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `event_order_log/{eventId}` (Firestore). SÉCURITÉ (audit H14) : le
// legacy laissait n'importe quel compte connecté écrire directement dans ce
// journal (`firestore.rules:718-728`), rendant la piste d'audit falsifiable
// en cas de litige. Dans cette migration il n'existe AUCUN SDK client vers la
// base : toute mutation passe par lib/server/eventOrders.ts, qui est seul à
// pouvoir pousser une entrée ici (via `appendLog`) — append-only et
// serveur-only par construction de l'architecture, pas seulement par une
// règle de sécurité contournable. Aucune route n'expose d'écriture directe
// sur ce document ; seule une lecture (rang 3 : propriétaire ou 'manager')
// existe, voir app/api/event-orders/[eventId]/log/route.ts.
const logEntrySchema = new Schema(
  {
    id: { type: String, required: true },
    ts: { type: Date, required: true },
    actorId: { type: String, required: true },
    actorName: { type: String, default: null },
    actorRole: { type: String, default: null },
    itemId: { type: String, default: null },
    ticketId: { type: String, default: null },
    itemName: { type: String, default: null },
    action: { type: String, required: true }, // 'add'|'edit'|'serve'|'pay'|'cancel'|'remove'|'materialize'
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    amountMinor: { type: Number, default: null },
    note: { type: String, default: null },
  },
  { _id: false }
)

const eventOrderLogSchema = new Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  entries: { type: [logEntrySchema], default: [] },
})

export type EventOrderLogDoc = InferSchemaType<typeof eventOrderLogSchema>
export type EventOrderLogModel = Model<EventOrderLogDoc>
export type EventOrderLogEntry = EventOrderLogDoc['entries'][number]

export default (models.EventOrderLog as EventOrderLogModel) || model<EventOrderLogDoc>('EventOrderLog', eventOrderLogSchema)
