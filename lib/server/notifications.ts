import { getDb } from '../db/mongoose'
import Notification, { type NotificationDoc } from '../models/Notification'

// Système de notifications in-app — voir lib/models/Notification.ts pour le
// contexte (aucun système équivalent n'existait dans ce port, le legacy en
// avait un jamais porté). Branché depuis 3 points d'envoi d'email déjà
// existants (candidatures, messages, activité des organisateurs suivis) —
// jamais de nouvelle règle métier ici, uniquement de la traçabilité en plus.

const MAX_PER_USER = 50

export interface CreateNotificationInput {
  userId: string
  type: NotificationDoc['type']
  title: string
  body?: string
  link?: string | null
}

// Purge les plus anciennes au-delà du plafond — même esprit que le plafond
// 50/utilisateur du legacy (old/src/utils/notifications.js), sans porter son
// mécanisme localStorage/sync Firestore.
async function trimToLimit(userId: string) {
  const overflow = await Notification.find({ userId }).sort({ createdAt: -1 }).skip(MAX_PER_USER).select('_id').lean()
  if (overflow.length === 0) return
  await Notification.deleteMany({ _id: { $in: overflow.map((d) => d._id) } })
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await getDb()
  await Notification.create({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body || '',
    link: input.link ?? null,
  })
  await trimToLimit(input.userId)
}

// Anti-spam pour les messages : UNE notification par conversation, rafraîchie
// à chaque nouveau message plutôt qu'un insert par message — sans quoi une
// conversation active noierait le reste des notifications de l'utilisateur.
export async function upsertMessageNotification(userId: string, conversationId: string, preview: string, link: string): Promise<void> {
  await getDb()
  await Notification.updateOne(
    { userId, type: 'new_message', 'meta.conversationId': conversationId },
    {
      $set: {
        title: 'Nouveau message',
        body: preview,
        link,
        read: false,
      },
    },
    { upsert: true }
  )
  await trimToLimit(userId)
}

export async function listNotifications(userId: string, { limit = 20 }: { limit?: number } = {}) {
  await getDb()
  // Trié sur `updatedAt`, pas `createdAt` : upsertMessageNotification()
  // rafraîchit (jamais ne recrée) la notification d'une conversation active,
  // donc `createdAt` reste figé à sa toute première apparition — un nouveau
  // message dans une conversation vieille de plusieurs semaines restait
  // enterré loin dans la liste malgré le badge non-lu (bug confirmé par
  // audit). `updatedAt` est géré automatiquement par { timestamps: true }
  // sur CHAQUE écriture (création ET $set), donc toujours à jour ici.
  const notifications = await Notification.find({ userId }).sort({ updatedAt: -1 }).limit(limit).lean()
  return notifications.map((n) => ({
    id: String(n._id),
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt,
  }))
}

export async function unreadCount(userId: string): Promise<number> {
  await getDb()
  return Notification.countDocuments({ userId, read: false })
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  await getDb()
  await Notification.updateOne({ _id: notificationId, userId }, { $set: { read: true } })
}

export async function markAllRead(userId: string): Promise<void> {
  await getDb()
  await Notification.updateMany({ userId, read: false }, { $set: { read: true } })
}
