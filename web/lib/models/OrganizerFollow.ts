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
// Les 6 types d'alerte ET leurs valeurs par défaut (toutes à true) miroitent
// exactement DEFAULT_NOTIFICATION_SETTINGS de src/utils/organizers.js (le
// legacy) — un premier port de ce modèle n'en avait que 4, sous des noms
// différents (`cancelled` au lieu de `scheduleChanges`, ni `ticketing` ni
// `importantAnnouncements`), écart corrigé ici après audit de fidélité.
const alertSettingsSchema = new Schema(
  {
    newEvent: { type: Boolean, default: true },
    ticketing: { type: Boolean, default: true },
    almostFull: { type: Boolean, default: true },
    scheduleChanges: { type: Boolean, default: true },
    newMedia: { type: Boolean, default: true },
    importantAnnouncements: { type: Boolean, default: true },
  },
  { _id: false }
)

const organizerFollowSchema = new Schema(
  {
    userId: { type: String, required: true },
    organizerId: { type: String, required: true },
    // Bascule maîtresse (legacy : `follow.notificationsEnabled`) — coupe
    // TOUTES les alertes de cet organisateur sans toucher aux préférences
    // fines ci-dessus, pour qu'elles soient conservées si l'utilisateur
    // réactive les notifications plus tard.
    notificationsEnabled: { type: Boolean, default: true },
    alerts: { type: alertSettingsSchema, default: () => ({}) },
  },
  { timestamps: true }
)

organizerFollowSchema.index({ userId: 1, organizerId: 1 }, { unique: true })
organizerFollowSchema.index({ organizerId: 1 })

export type OrganizerFollowDoc = InferSchemaType<typeof organizerFollowSchema>
export type OrganizerFollowModel = Model<OrganizerFollowDoc>

export default (models.OrganizerFollow as OrganizerFollowModel) || model<OrganizerFollowDoc>('OrganizerFollow', organizerFollowSchema)
