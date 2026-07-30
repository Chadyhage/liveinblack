import mongoose from 'mongoose'
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

// Liste publique : jamais annulé, triée par date. Les événements marqués
// `isPrivate` (legacy, plus jamais écrit — voir lib/models/Event.ts) sont
// désormais traités comme des événements publics ordinaires.
export async function listPublicEvents(): Promise<PublicEvent[]> {
  await getDb()
  const docs = await Event.find({ cancelled: { $ne: true } })
    .sort({ date: 1, time: 1 })
    .limit(PUBLIC_LIST_CAP)
    .lean()
  return docs.map(toPublicEvent).filter((e) => isClientDiscoverableEvent(e))
}

export async function searchPublicEvents(query: string): Promise<PublicEvent[]> {
  if (!query.trim()) return []
  await getDb()
  const docs = await Event.find(
    { cancelled: { $ne: true }, $text: { $search: query } },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(20)
    .lean()
  return docs.map(toPublicEvent)
}

export type EventAccessResult =
  | { status: 'not_found' }
  | { status: 'ok'; event: PublicEvent }

export async function getEventById(id: string): Promise<EventAccessResult> {
  if (!mongoose.isValidObjectId(id)) return { status: 'not_found' }
  await getDb()
  const doc = await Event.findById(id).lean()
  if (!doc) return { status: 'not_found' }
  return { status: 'ok', event: toPublicEvent(doc) }
}
