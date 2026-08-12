import webpush from 'web-push'
import { getDb } from '../db/mongoose'
import User from '../models/User'

// Notifications push navigateur (Web Push API). Best-effort strict, comme
// lib/server/emails/notify.ts : jamais d'exception qui remonte à l'appelant,
// jamais de credential inventé si les clés VAPID sont absentes (dev local
// sans .env, ou avant configuration Vercel) — dans ce cas on no-op
// silencieusement plutôt que de planter l'envoi.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@liveinblack.com'

let configured = false
function ensureConfigured(): boolean {
  if (configured) return true
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  configured = true
  return true
}

export interface PushPayload {
  title: string
  body?: string
  url?: string
}

interface PushSubscriptionDoc {
  endpoint: string
  p256dh: string
  auth: string
}

async function deliverToSubscriptions(userId: string, subs: PushSubscriptionDoc[], payload: PushPayload): Promise<void> {
  const json = JSON.stringify(payload)
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, json)
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          // Abonnement expiré/révoqué côté navigateur — nettoyage silencieux,
          // jamais une erreur (fréquent et attendu, pas une panne).
          await User.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint: sub.endpoint } } }).catch(() => {})
        } else {
          console.error('[push] sendNotification failed:', err)
        }
      }
    })
  )
}

export async function sendPushToUser(userId: string | null | undefined, payload: PushPayload): Promise<void> {
  if (!userId || !ensureConfigured()) return
  try {
    await getDb()
    const user = await User.findById(userId).select('pushSubscriptions').lean<{ pushSubscriptions?: PushSubscriptionDoc[] } | null>()
    const subs = user?.pushSubscriptions || []
    if (!subs.length) return
    await deliverToSubscriptions(userId, subs, payload)
  } catch (err) {
    console.error('[push] sendPushToUser failed:', err)
  }
}

export async function sendPushToAgents(payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return
  try {
    await getDb()
    const agents = await User.find({ roles: 'agent', disabled: { $ne: true } })
      .select('pushSubscriptions')
      .lean<{ _id: unknown; pushSubscriptions?: PushSubscriptionDoc[] }[]>()
    await Promise.all(
      agents.filter((a) => a.pushSubscriptions?.length).map((a) => deliverToSubscriptions(String(a._id), a.pushSubscriptions!, payload))
    )
  } catch (err) {
    console.error('[push] sendPushToAgents failed:', err)
  }
}
