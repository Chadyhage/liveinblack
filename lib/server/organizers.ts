import { getDb } from '../db/mongoose'
import OrganizerProfile, { type OrganizerProfileDoc } from '../models/OrganizerProfile'
import Event from '../models/Event'
import { isPlaceholderEvent } from '../shared/eventDiscovery'
import { isEventEnded } from '../shared/event-time'
import type { PublicEvent } from './events'

export type PublicOrganizer = OrganizerProfileDoc & { userId: string; slug: string }

export type OrganizerDirectoryEvent = {
  id: string
  name: string
  date: string
  dateDisplay: string
  city: string
  region: string
}

export type PublicOrganizerDirectoryEntry = PublicOrganizer & {
  nextEvent: OrganizerDirectoryEvent | null
  eventRegions: Pick<OrganizerDirectoryEvent, 'city' | 'region'>[]
}

export async function listPublicOrganizers(): Promise<PublicOrganizer[]> {
  await getDb()
  const docs = await OrganizerProfile.find({ status: 'public' }).sort({ followersCount: -1 }).lean()
  return docs as PublicOrganizer[]
}

export async function listPublicOrganizersWithNextEvent(): Promise<PublicOrganizerDirectoryEntry[]> {
  await getDb()
  const profiles = (await OrganizerProfile.find({ status: 'public' }).sort({ followersCount: -1 }).lean()) as PublicOrganizer[]
  if (profiles.length === 0) return []

  // Une seule requête pour tout l'annuaire, jamais une requête par carte.
  const organizerIds = profiles.map((profile) => profile.userId)
  const docs = await Event.find({
    organizerId: { $in: organizerIds },
    isPrivate: { $ne: true },
    cancelled: { $ne: true },
  })
    .select('organizerId name date dateDisplay time endTime closingDate city region publishAt cancelled')
    .sort({ date: 1, time: 1 })
    .lean()

  const now = Date.now()
  const eventsByOrganizer = new Map<string, OrganizerDirectoryEvent[]>()
  for (const event of docs) {
    if (isPlaceholderEvent(event) || isEventEnded(event, now)) continue
    if (event.publishAt && new Date(event.publishAt).getTime() > now) continue
    const organizerId = String(event.organizerId || '')
    if (!organizerId) continue
    const item: OrganizerDirectoryEvent = {
      id: String(event._id),
      name: event.name,
      date: event.date,
      dateDisplay: event.dateDisplay || event.date,
      city: event.city || '',
      region: event.region || '',
    }
    const list = eventsByOrganizer.get(organizerId) || []
    list.push(item)
    eventsByOrganizer.set(organizerId, list)
  }

  return profiles.map((profile) => {
    const events = eventsByOrganizer.get(profile.userId) || []
    return {
      ...profile,
      nextEvent: events[0] || null,
      eventRegions: events.map(({ city, region }) => ({ city, region })),
    }
  })
}

// Pas de bypass "isSelf" ici (contrairement aux prestataires) : fidèle au
// comportement legacy où seul un profil status:'public' est servi publiquement,
// le propriétaire devant passer par son studio pour prévisualiser.
export async function getOrganizerBySlug(slug: string): Promise<PublicOrganizer | null> {
  await getDb()
  const doc = await OrganizerProfile.findOne({ slug, status: 'public' }).lean()
  return (doc as PublicOrganizer) || null
}

// Utilisé par le bloc "organisateur" de la page détail événement — ne renvoie
// que si le profil est public (sinon la page détail retombe sur le texte brut
// event.organizerName, comme le faisait déjà le legacy).
export async function getPublicOrganizerByUserId(userId: string): Promise<PublicOrganizer | null> {
  await getDb()
  const doc = await OrganizerProfile.findOne({ userId, status: 'public' }).lean()
  return (doc as PublicOrganizer) || null
}

export async function getOrganizerEvents(organizerId: string): Promise<{ upcoming: PublicEvent[]; past: PublicEvent[] }> {
  await getDb()
  const docs = await Event.find({
    organizerId,
    isPrivate: { $ne: true },
    cancelled: { $ne: true },
  })
    .sort({ date: -1 })
    .lean()

  const now = Date.now()
  // Filtre non-privé/non-annulé déjà fait en requête ; ici juste filler + date
  // de publication future — PAS de filtre "pas terminé" : on veut aussi bien
  // les événements à venir que les passés, triés ensuite séparément.
  const events = docs
    .filter((e) => !isPlaceholderEvent(e) && !(e.publishAt && new Date(e.publishAt).getTime() > now))
    .map((e) => ({ ...e, id: String(e._id) })) as PublicEvent[]

  const upcoming = events.filter((e) => !isEventEnded(e, now)).sort((a, b) => a.date.localeCompare(b.date))
  const past = events.filter((e) => isEventEnded(e, now)).slice(0, 6)

  return { upcoming, past }
}
