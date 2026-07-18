import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import Ticket from '../models/Ticket'
import User from '../models/User'
import { computeEventStats, computeDemographics, buildEventInsights, type StatsFilters, type StatsTicket } from '../shared/eventStats'
import { eventCurrency } from '../shared/money'

// Port de la partie DONNÉES de src/pages/EventStatsPage.jsx (#7 phase
// organisateur) — les fonctions PURES de calcul vivent dans
// lib/shared/eventStats.ts (partagées avec un futur test unitaire côté
// client si besoin) ; ce fichier ne fait que charger Event+Ticket+User et
// appliquer le contrôle d'accès. Contrairement au legacy (listener Firestore
// temps réel), cette vue est un instantané au moment de l'appel — le
// "live" se traduit ici par un rafraîchissement explicite côté client
// (pas de WebSocket dans cette migration, cf. CLAUDE.md).

export interface StatsCaller {
  id: string
  roles: string[]
}

type ErrResult = { ok: false; status: number; error: string }

async function assertAccess(eventId: string, caller: StatsCaller) {
  const event = await Event.findById(eventId).lean()
  if (!event) return { ok: false as const, status: 404, error: 'event_not_found' }
  const allowed = caller.roles.includes('agent') || event.organizerId === caller.id || event.createdBy === caller.id
  if (!allowed) return { ok: false as const, status: 403, error: 'forbidden' }
  return { ok: true as const, event }
}

export interface EventStatsView {
  event: { id: string; name: string; date: string; dateDisplay: string; city: string; cancelled: boolean; currency: 'EUR' | 'XOF' }
  stats: ReturnType<typeof computeEventStats>
  insights: ReturnType<typeof buildEventInsights>
  demographics: ReturnType<typeof computeDemographics>
  placeOptions: string[]
  updatedAt: string
}

export type GetEventStatsResult = ErrResult | { ok: true; view: EventStatsView }

export async function getEventStats(caller: StatsCaller, eventId: string, filters: StatsFilters = {}): Promise<GetEventStatsResult> {
  await getDb()

  const guard = await assertAccess(eventId, caller)
  if (!guard.ok) return guard
  const { event } = guard

  // Reconstruit des objets STRICTEMENT simples (pas le lean doc brut) : le
  // `_id` d'un document `.lean()` reste une vraie instance ObjectId (avec un
  // toJSON custom) — la faire transiter jusqu'à un composant client via ce
  // `view` fait planter la sérialisation React Server Components ("Maximum
  // call stack size exceeded"). `StatsTicket` n'a de toute façon pas besoin
  // de `_id`.
  const rawTickets = await Ticket.find({ eventId }).lean()
  const tickets: StatsTicket[] = rawTickets.map((t) => ({
    ticketCode: t.ticketCode,
    place: t.place ?? null,
    placePrice: t.placePrice ?? null,
    paid: t.paid ?? null,
    checkedInAt: t.checkedInAt ? new Date(t.checkedInAt).toISOString() : null,
    bookedAt: t.bookedAt ? new Date(t.bookedAt).toISOString() : null,
    userId: t.userId ?? null,
    revoked: t.revoked ?? null,
    preorders: (t.preorders ?? []).map((p) => ({ name: p.name, price: p.price ?? null, qty: p.qty ?? null })),
  }))
  const stats = computeEventStats(event, tickets, { filters })
  const insights = buildEventInsights(stats)

  const holderIds = [...new Set(tickets.map((t) => t.userId).filter(Boolean))] as string[]
  const holders = holderIds.length ? await User.find({ _id: { $in: holderIds } }).select('birthYear gender').lean() : []
  const usersById: Record<string, { birthYear?: number | null; gender?: string | null }> = {}
  for (const h of holders) usersById[String(h._id)] = { birthYear: h.birthYear, gender: h.gender }
  const demographics = computeDemographics(tickets, usersById, event.minAge ?? 0)

  // Union des catégories DÉFINIES sur l'événement et de celles vues sur des
  // billets (une place retirée après-coup doit rester filtrable si des
  // billets existent encore dessus) — fidèle au legacy.
  const placeOptions = [...new Set([...(event.places || []).map((p) => p.type), ...tickets.map((t) => t.place || 'Standard')])].filter(Boolean)

  return {
    ok: true,
    view: {
      event: { id: String(event._id), name: event.name, date: event.date, dateDisplay: event.dateDisplay ?? '', city: event.city ?? '', cancelled: Boolean(event.cancelled), currency: eventCurrency(event) },
      stats,
      insights,
      demographics,
      placeOptions,
      updatedAt: new Date().toISOString(),
    },
  }
}
