import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `user_social/{uid}.interestedEvents[]` (Firestore, tableau unique
// par utilisateur — src/utils/eventInterests.js). Un document PAR relation
// (userId, eventId), même raisonnement que OrganizerFollow/Friendship dans
// cette migration : requêtable nativement dans les deux sens (par userId
// pour "ma liste", par eventId si un futur besoin de fan-out apparaît),
// jamais de doc-tableau à réécrire en entier à chaque toggle.
//
// `status` (au lieu d'une suppression du document au retrait) mirrore le
// comportement legacy : `markEventInterested`/`unmarkEventInterested`
// posent `status:'active'`/`'removed'` sur le MÊME item plutôt que de le
// faire disparaître, pour préserver `createdAt` si l'utilisateur remet
// l'événement en intérêt plus tard (l'ordre "ajouté le" reste fidèle à la
// toute première fois, pas au dernier aller-retour).
const eventInterestSchema = new Schema(
  {
    userId: { type: String, required: true },
    eventId: { type: String, required: true },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
  },
  { timestamps: true }
)

eventInterestSchema.index({ userId: 1, eventId: 1 }, { unique: true })

export type EventInterestDoc = InferSchemaType<typeof eventInterestSchema>
export type EventInterestModel = Model<EventInterestDoc>

export default (models.EventInterest as EventInterestModel) || model<EventInterestDoc>('EventInterest', eventInterestSchema)
