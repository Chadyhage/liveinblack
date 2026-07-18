import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import EventStaff from '../models/EventStaff'
import { isEventLive, isEventStarted } from '../shared/event-time'

// Port de src/pages/MesSoireesPage.jsx (getMyStaffEvents/listenMyStaffAssignments,
// src/utils/eventOrders.js:147-175) — legacy tenait un index Firestore inversé
// (staff_assignments/{eventId__uid}) dédié UNIQUEMENT parce que Firestore ne peut
// pas requêter une clé arbitraire imbriquée dans une map. Un Mongoose Map se
// stocke comme un objet Mongo brut (voir lib/models/EventStaff.ts et le même
// pattern dans app/(app)/scanner/page.tsx) : `roster.${uid}` est directement
// requêtable, donc aucun index inversé séparé n'est nécessaire côté Mongo — ceci
// est la source de vérité unique (le roster event_staff lui-même), pas une copie.

export interface StaffCaller {
  id: string
}

export interface StaffedEventView {
  eventId: string
  eventName: string
  role: string
  addedAt: string
  dateDisplay: string
  city: string
  live: boolean
  started: boolean
}

// Même marge de grâce que MesSoireesPage.jsx (isEventLive(ev, Date.now(), 12h)).
const LIVE_GRACE_MS = 12 * 60 * 60 * 1000

export async function listMyStaffedEvents(caller: StaffCaller): Promise<StaffedEventView[]> {
  await getDb()

  const staffDocs = await EventStaff.find({ [`roster.${caller.id}`]: { $exists: true } }).lean()
  if (staffDocs.length === 0) return []

  const eventIds = staffDocs.map((d) => d.eventId).filter(Boolean)
  const events = await Event.find({ _id: { $in: eventIds } })
    .select('name date dateDisplay time endTime closingDate city cancelled')
    .lean()
  const eventsById = new Map(events.map((e) => [String(e._id), e]))

  const now = Date.now()
  const results: StaffedEventView[] = []

  for (const doc of staffDocs) {
    const roster = (doc.roster ?? {}) as unknown as Record<string, { role: string; addedAt?: Date | string }>
    const entry = roster[caller.id]
    if (!entry) continue

    const event = eventsById.get(doc.eventId)

    results.push({
      eventId: doc.eventId,
      // Legacy privilégiait le nom capturé sur l'affectation elle-même
      // (assignment.eventName), best-effort en secours du nom live de
      // l'event ; ici l'event live EST la source de vérité (pas de copie
      // figée à invalider) — le composant page applique le même repli
      // « Événement » si l'event a depuis été supprimé.
      eventName: event?.name ?? '',
      role: entry.role,
      addedAt: entry.addedAt ? new Date(entry.addedAt).toISOString() : '',
      dateDisplay: (event?.dateDisplay || event?.date) ?? '',
      city: event?.city ?? '',
      live: event ? isEventLive(event, now, LIVE_GRACE_MS) : false,
      started: event ? isEventStarted(event, now) : false,
    })
  }

  results.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  return results
}
