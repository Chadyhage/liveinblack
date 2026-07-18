import crypto from 'node:crypto'
import { getDb } from '../db/mongoose'
import Event, { type EventDoc } from '../models/Event'
import { isClientDiscoverableEvent } from '../shared/eventDiscovery'

// Plafond de sécurité sur la liste publique — l'UI legacy affichait "tout"
// sans pagination, mais un scan Mongo réellement illimité serait un risque de
// performance à l'échelle. Ce plafond ne change rien pour l'utilisateur tant
// que le nombre d'événements réels reste sous ce seuil.
const PUBLIC_LIST_CAP = 300

export type PublicEvent = Omit<EventDoc, never> & { id: string }

function toPublicEvent(doc: Record<string, unknown>): PublicEvent {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude it from `rest`
  const { _id, __v, ...rest } = doc as { _id: unknown; __v?: number } & Record<string, unknown>
  return { ...(rest as EventDoc), id: String(_id) }
}

// Liste publique : jamais d'événement privé, jamais annulé, triée par date.
// privateCodeHash est de toute façon exclu par défaut (select:false).
export async function listPublicEvents(): Promise<PublicEvent[]> {
  await getDb()
  const docs = await Event.find({ isPrivate: { $ne: true }, cancelled: { $ne: true } })
    .sort({ date: 1, time: 1 })
    .limit(PUBLIC_LIST_CAP)
    .lean()
  return docs.map(toPublicEvent).filter((e) => isClientDiscoverableEvent(e))
}

export async function searchPublicEvents(query: string): Promise<PublicEvent[]> {
  if (!query.trim()) return []
  await getDb()
  const docs = await Event.find(
    { isPrivate: { $ne: true }, cancelled: { $ne: true }, $text: { $search: query } },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(20)
    .lean()
  return docs.map(toPublicEvent)
}

export type EventAccessResult =
  | { status: 'not_found' }
  | { status: 'locked'; id: string }
  | { status: 'ok'; event: PublicEvent }

// Frontière de sécurité (ferme l'audit C01) : un événement privé ne renvoie
// JAMAIS ses données tant que `unlocked` n'est pas vrai (cookie posé par
// POST /api/events/[id]/unlock après vérification du code). Contrairement au
// legacy, ceci est appliqué ICI (server), pas seulement caché côté UI.
export async function getEventById(id: string, opts: { unlocked?: boolean } = {}): Promise<EventAccessResult> {
  await getDb()
  const doc = await Event.findById(id).lean()
  if (!doc) return { status: 'not_found' }
  if (doc.isPrivate && !opts.unlocked) return { status: 'locked', id }
  return { status: 'ok', event: toPublicEvent(doc) }
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
}

// Compare le code fourni au hash stocké. Ne renvoie jamais le code/hash au
// client — seulement un booléen. Le hash n'est chargé qu'ici via
// .select('+privateCodeHash'), jamais dans les requêtes de lecture publiques.
export async function verifyPrivateEventCode(id: string, code: string): Promise<boolean> {
  if (!code?.trim()) return false
  await getDb()
  const doc = await Event.findById(id).select('+privateCodeHash isPrivate').lean()
  if (!doc || !doc.isPrivate || !doc.privateCodeHash) return false
  return doc.privateCodeHash === hashCode(code)
}

export { hashCode }
