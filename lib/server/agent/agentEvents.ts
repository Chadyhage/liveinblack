import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import { getEventEndTimestamp } from '@/lib/shared/eventUrgency'
import { cancelOrganizerEvent, type CancelEventResult } from '../organizer/organizerEventLifecycle'

// Port de la vue admin « Événements » de src/pages/AgentPage.jsx
// (tab === 'events', #9 phase agent/admin) — liste TOUS les événements
// publiés (tous organisateurs confondus) avec recherche + filtre de statut,
// et l'annulation admin qui RÉUTILISE le même flux autoritaire que
// l'organisateur (cancelOrganizerEvent, avec bypassOwnership) : jamais de
// logique de remboursement dupliquée ici.

export interface AgentCaller {
  id: string
}

export type AgentEventStatus = 'upcoming' | 'past' | 'cancelled'

export interface AgentEventView {
  id: string
  name: string
  date: string
  dateDisplay: string
  city: string
  organizerName: string
  organizer: string
  imageUrl: string | null
  cancelled: boolean
  cancelledAt: string | null
  cancellationMessage: string
  status: AgentEventStatus
}

export interface ListEventsFilter {
  status?: 'all' | AgentEventStatus
  search?: string
  page?: number
  pageSize?: number
}

export interface AgentEventsPageResult {
  events: AgentEventView[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  stats: {
    upcoming: number
    past: number
    cancelled: number
  }
}

// « Passé » = même définition que le compteur du dashboard organisateur et
// que legacy (getEventEndTimestamp, gère l'heure de fin manquante ET les
// soirées après minuit) — jamais une comparaison naïve sur `date` seule.
function computeStatus(event: { date?: string; time?: string; endTime?: string; cancelled?: boolean }, now: number): AgentEventStatus {
  if (event.cancelled) return 'cancelled'
  const end = getEventEndTimestamp(event)
  return end > 0 && end < now ? 'past' : 'upcoming'
}

function buildStatusConstraint(status: 'all' | AgentEventStatus | undefined, now: Date) {
  if (!status || status === 'all') return {}
  if (status === 'cancelled') return { cancelled: true }

  const nowIsoDate = now.toISOString().slice(0, 10)

  if (status === 'upcoming') {
    return {
      cancelled: { $ne: true },
      $or: [
        { closingDate: { $exists: true, $gte: now } },
        { closingDate: { $exists: false }, date: { $gte: nowIsoDate } },
        { closingDate: null, date: { $gte: nowIsoDate } },
      ],
    }
  }

  return {
    cancelled: { $ne: true },
    $or: [
      { closingDate: { $exists: true, $lt: now } },
      { closingDate: { $exists: false }, date: { $lt: nowIsoDate } },
      { closingDate: null, date: { $lt: nowIsoDate } },
    ],
  }
}

function buildSearchConstraint(search?: string) {
  if (!search?.trim()) return {}
  const term = search.trim()
  return {
    $or: [
      { name: { $regex: term, $options: 'i' } },
      { organizerName: { $regex: term, $options: 'i' } },
      { organizer: { $regex: term, $options: 'i' } },
      { city: { $regex: term, $options: 'i' } },
    ],
  }
}

const DEFAULT_PAGE_SIZE = 15
const MAX_PAGE = 4_000

export async function listEventsForAgent(filter: ListEventsFilter = {}): Promise<AgentEventsPageResult> {
  await getDb()

  const page = Math.max(1, filter.page || 1)
  const pageSize = Math.min(50, Math.max(8, filter.pageSize || DEFAULT_PAGE_SIZE))
  const safePage = Math.min(page, MAX_PAGE)

  const now = new Date()
  const statusConstraint = buildStatusConstraint(filter.status, now)
  const searchConstraint = buildSearchConstraint(filter.search)

  const baseQuery = {
    ...statusConstraint,
    ...searchConstraint,
  }

  const total = await Event.countDocuments(baseQuery)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const docs = await Event.find(baseQuery)
    .sort({ cancelled: 1, date: 1 })
    .skip((safePage - 1) * pageSize)
    .limit(pageSize)
    .lean()

  const nowMs = now.getTime()
  const events: AgentEventView[] = docs.map((e) => {
    const status = computeStatus(e, nowMs)
    return {
      id: String(e._id),
      name: e.name,
      date: e.date,
      dateDisplay: e.dateDisplay ?? '',
      city: e.city ?? '',
      organizerName: e.organizerName ?? '',
      organizer: e.organizer ?? '',
      imageUrl: e.imageUrl ?? null,
      cancelled: Boolean(e.cancelled),
      cancelledAt: e.cancelledAt ? new Date(e.cancelledAt).toISOString() : null,
      cancellationMessage: e.cancellationMessage ?? '',
      status,
    }
  })

  const upcomingBase = buildStatusConstraint('upcoming', now)
  const pastBase = buildStatusConstraint('past', now)
  const cancelledBase = buildStatusConstraint('cancelled', now)

  const [upcoming, past, cancelled] = await Promise.all([
    Event.countDocuments({ ...searchConstraint, ...upcomingBase }),
    Event.countDocuments({ ...searchConstraint, ...pastBase }),
    Event.countDocuments({ ...searchConstraint, ...cancelledBase }),
  ])

  return {
    events,
    total,
    page: safePage,
    pageSize,
    totalPages,
    stats: {
      upcoming,
      past,
      cancelled,
    },
  }
}

export async function adminCancelEvent(agent: AgentCaller, eventId: string, message: string): Promise<CancelEventResult> {
  return cancelOrganizerEvent({ id: agent.id }, eventId, message, { bypassOwnership: true })
}
