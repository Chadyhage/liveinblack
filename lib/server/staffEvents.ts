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
const OWNED_EVENTS_CAP = 100

export async function listMyStaffedEvents(caller: StaffCaller): Promise<StaffedEventView[]> {
  await getDb()

  const staffDocs = await EventStaff.find({ [`roster.${caller.id}`]: { $exists: true } }).lean()

  // Additif : les événements que l'utilisateur ORGANISE lui-même
  // (organizerId/createdBy), même sans ligne roster dédiée — fusionné ici
  // depuis l'ancien /scanner (index), qui listait ces deux ensembles
  // séparément pour arriver au même besoin ("quel événement dois-je ouvrir
  // ce soir ?"). Rôle synthétique 'owner', jamais une valeur réelle de
  // EventStaff.roster[].role.
  const ownedEvents = await Event.find({ $or: [{ organizerId: caller.id }, { createdBy: caller.id }] })
    .select('name date dateDisplay time endTime closingDate city cancelled')
    .limit(OWNED_EVENTS_CAP)
    .lean()

  const staffEventIds = staffDocs.map((d) => d.eventId).filter(Boolean)
  const missingIds = staffEventIds.filter((id) => !ownedEvents.some((e) => String(e._id) === id))
  const staffOnlyEvents = missingIds.length > 0
    ? await Event.find({ _id: { $in: missingIds } }).select('name date dateDisplay time endTime closingDate city cancelled').lean()
    : []
  const eventsById = new Map([...ownedEvents, ...staffOnlyEvents].map((e) => [String(e._id), e]))

  const now = Date.now()
  type Ranked = StaffedEventView & { sortDate: string }
  const results: Ranked[] = []
  const seenEventIds = new Set<string>()

  for (const doc of staffDocs) {
    const roster = (doc.roster ?? {}) as unknown as Record<string, { role: string; addedAt?: Date | string }>
    const entry = roster[caller.id]
    if (!entry) continue

    const event = eventsById.get(doc.eventId)
    seenEventIds.add(doc.eventId)

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
      sortDate: event?.date ?? '',
    })
  }

  for (const event of ownedEvents) {
    const eventId = String(event._id)
    if (seenEventIds.has(eventId)) continue
    seenEventIds.add(eventId)

    results.push({
      eventId,
      eventName: event.name ?? '',
      role: 'owner',
      addedAt: '',
      dateDisplay: event.dateDisplay || event.date || '',
      city: event.city ?? '',
      live: isEventLive(event, now, LIVE_GRACE_MS),
      started: isEventStarted(event, now),
      sortDate: event.date ?? '',
    })
  }

  // En cours d'abord, puis à venir (le plus proche en premier), puis
  // terminées (le plus récent en premier) — remplace l'ancien tri par seule
  // date d'affectation roster, qui n'avait plus de sens une fois les
  // événements possédés (sans affectation) mélangés dans la même liste.
  results.sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1
    if (a.started !== b.started) return a.started ? 1 : -1
    return a.started ? b.sortDate.localeCompare(a.sortDate) : a.sortDate.localeCompare(b.sortDate)
  })

  return results.map(({ sortDate: _sortDate, ...view }) => view)
}
