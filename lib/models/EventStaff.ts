import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `event_staff/{eventId} -> { roster: { [uid]: {...} } }`. Consulté
// (lecture seule) par le check-in et la commande sur place dès la phase 4 ;
// l'UI d'invitation d'équipe (EventStaffModal côté legacy) arrive en phase 7
// (MesEvenementsPage). Un roster vide dégrade proprement vers "propriétaire
// ou agent uniquement" — aucune des deux autorisations ne dépend de ce
// modèle étant peuplé.
const ROLES = ['scan', 'serveur', 'manager', 'dj'] as const

const rosterEntrySchema = new Schema(
  {
    role: { type: String, enum: ROLES, required: true },
    name: { type: String, default: '' },
    addedBy: { type: String, required: true },
    addedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
)

const eventStaffSchema = new Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  roster: { type: Map, of: rosterEntrySchema, default: {} },
})

export type EventStaffDoc = InferSchemaType<typeof eventStaffSchema>
export type EventStaffModel = Model<EventStaffDoc>

export default (models.EventStaff as EventStaffModel) || model<EventStaffDoc>('EventStaff', eventStaffSchema)
