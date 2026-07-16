import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `organizer_follows/{uid}.items[]` + l'index inversé
// `organizer_subscribers/{organizerId}__{uid}` (Firestore — DEUX documents
// pour une seule relation, uniquement parce que Firestore ne sait interroger
// un tableau que dans un sens). Ici, un document PAR relation, interrogeable
// dans les deux sens nativement (par `userId` pour "mes abonnements", par
// `organizerId` pour le fan-out notifications/email d'un organisateur) —
// plus besoin du doc miroir. Fonctionnalité DISTINCTE des demandes d'ami
// (FriendRequest/Friendship) : abonnement asymétrique à un profil PUBLIC
// d'organisateur, pas une relation symétrique entre deux comptes.
const alertSettingsSchema = new Schema(
  {
    newEvent: { type: Boolean, default: true },
    cancelled: { type: Boolean, default: true },
    almostFull: { type: Boolean, default: true },
    newMedia: { type: Boolean, default: false },
  },
  { _id: false }
)

const organizerFollowSchema = new Schema(
  {
    userId: { type: String, required: true },
    organizerId: { type: String, required: true },
    alerts: { type: alertSettingsSchema, default: () => ({}) },
  },
  { timestamps: true }
)

organizerFollowSchema.index({ userId: 1, organizerId: 1 }, { unique: true })
organizerFollowSchema.index({ organizerId: 1 })

export type OrganizerFollowDoc = InferSchemaType<typeof organizerFollowSchema>
export type OrganizerFollowModel = Model<OrganizerFollowDoc>

export default (models.OrganizerFollow as OrganizerFollowModel) || model<OrganizerFollowDoc>('OrganizerFollow', organizerFollowSchema)
