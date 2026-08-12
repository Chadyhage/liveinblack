// Types de notification in-app — doit rester synchronisé avec
// lib/models/Notification.ts::NOTIFICATION_TYPES.
export type InAppNotificationType =
  | 'application_status'
  | 'new_message'
  | 'organizer_activity'
  | 'payment'
  | 'refund'
  | 'payout'
  | 'boost'
  | 'resale'
  | 'staff'
  | 'group'
  | 'report'
  | 'account'
  | 'agent_queue'
  | 'reminder'
  | 'review'

// Métadonnée optionnelle attachée à un email pour aussi déclencher une
// notification in-app (lib/server/notifications.ts) et, si `push:true`, une
// notification push navigateur (lib/server/push.ts) — un seul point d'appel
// (notifyUserById/notifyAllAgents dans lib/server/emails/notify.ts) déclenche
// les trois canaux, sans dupliquer chaque site d'appel métier.
export interface InAppNotification {
  type: InAppNotificationType
  title: string
  body?: string
  link?: string
  push?: boolean
}

export type Email = { subject: string; html: string; inApp?: InAppNotification }
