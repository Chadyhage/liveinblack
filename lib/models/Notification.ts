import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Notifications in-app — n'existait pas du tout dans ce port avant l'ajout
// du dashboard par rôle avec sidebar. Le legacy (old/src/utils/notifications.js)
// avait un système complet (localStorage + sync Firestore, plafond 50/utilisateur,
// anti-spam par conversation) ; ce modèle reprend l'esprit (plafond 50, anti-spam
// messages via `meta.conversationId`) sans porter le mécanisme localStorage/sync,
// qui n'a plus lieu d'être avec une session serveur + polling léger (voir
// lib/server/notifications.ts).
export const NOTIFICATION_TYPES = [
  'application_status',
  'new_message',
  'organizer_activity',
  // Ajoutés pour la parité avec le système d'email (lib/server/emails/) —
  // mêmes domaines, voir le champ `inApp` optionnel sur chaque template dans
  // lib/server/emails/types.ts.
  'payment',
  'refund',
  'payout',
  'boost',
  'resale',
  'staff',
  'group',
  'report',
  'account',
  'agent_queue',
] as const

const notificationSchema = new Schema(
  {
    userId: { type: String, required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: null },
    read: { type: Boolean, default: false },
    // Clé d'upsert anti-spam pour type:'new_message' — une seule notification
    // par conversation, rafraîchie à chaque nouveau message plutôt qu'un
    // insert par message (même esprit que upsertMessageNotification du legacy).
    meta: {
      conversationId: { type: String, default: null },
    },
  },
  { timestamps: true }
)

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 })
notificationSchema.index({ userId: 1, type: 1, 'meta.conversationId': 1 })

export type NotificationDoc = InferSchemaType<typeof notificationSchema>
export type NotificationModel = Model<NotificationDoc>

export default (models.Notification as NotificationModel) || model<NotificationDoc>('Notification', notificationSchema)
