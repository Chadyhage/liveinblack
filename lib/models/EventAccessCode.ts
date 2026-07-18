import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Codes d'accès INDIVIDUELS à usage unique pour un événement privé (#7 phase
// organisateur) — DISTINCT du code maître partagé `Event.privateCodeHash`
// (un seul code, partagé par tous, vérifié par POST /api/events/[id]/unlock).
// Ici : l'organisateur génère un lot de codes (1 à 100), chacun utilisable
// UNE SEULE FOIS par un invité différent — remplace
// `localStorage.lib_event_codes` + `event_access_codes/{code}` (Firestore)
// côté legacy, qui dupliquait la même info par appareil ET par doc plat.
const eventAccessCodeSchema = new Schema(
  {
    eventId: { type: String, required: true, index: true },
    code: { type: String, required: true },
    createdBy: { type: String, required: true },
    usedBy: { type: String, default: null },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Un code est unique GLOBALEMENT (pas seulement par événement) — c'est ce
// qui compose l'URL/le code que l'invité saisit, il doit être imprévisible
// et non ambigu même si deux organisateurs génèrent "par coïncidence" la
// même chaîne (la génération elle-même vise déjà l'unicité, cet index est
// le filet de sécurité atomique).
eventAccessCodeSchema.index({ code: 1 }, { unique: true })

export type EventAccessCodeDoc = InferSchemaType<typeof eventAccessCodeSchema>
export type EventAccessCodeModel = Model<EventAccessCodeDoc>

export default (models.EventAccessCode as EventAccessCodeModel) || model<EventAccessCodeDoc>('EventAccessCode', eventAccessCodeSchema)
