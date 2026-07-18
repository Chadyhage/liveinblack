import mongoose from 'mongoose'
import { getDb } from '../db/mongoose'
import User from '../models/User'
import Conversation from '../models/Conversation'

// Présence en ligne/hors ligne — dérivée de `users.lastSeenAt` (déjà présent
// sur lib/models/User.ts, jusque-là jamais mis à jour ni exposé). Pas de
// canal temps réel (cette migration n'utilise QUE du polling, jamais de
// websocket) : le client "heartbeat" cette route toutes les ~20s tant que
// l'app est active, et interroge la présence des interlocuteurs pertinents
// au même rythme — fidèle à isOnline()/setOnline() du legacy (src/utils/
// messaging.js), qui reposait déjà sur un simple timestamp comparé à une
// fenêtre glissante, jamais sur un canal "présence" dédié.
export interface PresenceCaller {
  id: string
}

export async function heartbeat(caller: PresenceCaller): Promise<{ ok: true }> {
  await getDb()
  await User.updateOne({ _id: caller.id }, { $set: { lastSeenAt: new Date() } })
  return { ok: true }
}

const ONLINE_WINDOW_MS = 45_000
const MAX_PRESENCE_IDS = 100

export type PresenceResult =
  | { ok: false; status: number; error: string }
  | { ok: true; presence: Record<string, { online: boolean; lastSeenAt: string | null }> }

// Ne renvoie la présence QUE pour des comptes qui partagent déjà une
// conversation avec l'appelant — jamais un oracle "untel est-il en ligne ?"
// ouvert à n'importe quel id (même limite délibérée que app/api/users/lookup :
// pas de capacité de navigation/liste de comptes hors de ce que l'appelant
// connaît déjà).
export async function getPresence(caller: PresenceCaller, input: { userIds: string[] }): Promise<PresenceResult> {
  await getDb()

  const requested = Array.from(
    new Set((input.userIds ?? []).filter((id) => typeof id === 'string' && mongoose.isValidObjectId(id) && id !== caller.id))
  )
  if (requested.length === 0) return { ok: true, presence: {} }
  if (requested.length > MAX_PRESENCE_IDS) return { ok: false, status: 400, error: 'too_many_ids' }

  const myConversations = await Conversation.find({ participantIds: caller.id }).select('participantIds').lean()
  const allowed = new Set<string>()
  for (const c of myConversations) for (const id of c.participantIds ?? []) allowed.add(id)

  const ids = requested.filter((id) => allowed.has(id))
  if (ids.length === 0) return { ok: true, presence: {} }

  const users = await User.find({ _id: { $in: ids } }).select('lastSeenAt privacy.showOnline').lean()
  const now = Date.now()
  const presence: Record<string, { online: boolean; lastSeenAt: string | null }> = {}
  for (const u of users) {
    // Réglage "Statut en ligne" (ProfilePage.jsx, section Confidentialité) :
    // un compte qui l'a désactivé apparaît TOUJOURS hors ligne aux autres,
    // quelle que soit sa présence réelle — jamais un simple masquage visuel
    // côté client, qui laisserait fuiter le vrai statut via l'API.
    if (u.privacy?.showOnline === false) {
      presence[String(u._id)] = { online: false, lastSeenAt: null }
      continue
    }
    const lastSeenAt = u.lastSeenAt ? new Date(u.lastSeenAt) : null
    presence[String(u._id)] = {
      online: lastSeenAt !== null && now - lastSeenAt.getTime() < ONLINE_WINDOW_MS,
      lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
    }
  }
  return { ok: true, presence }
}
