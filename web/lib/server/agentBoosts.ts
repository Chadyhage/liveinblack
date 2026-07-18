import { getDb } from '../db/mongoose'
import Boost from '../models/Boost'
import Event from '../models/Event'

// Port en LECTURE SEULE de la section « Boosts » de src/pages/AgentPage.jsx
// (tab === 'boosts', #9 phase agent/admin). Le legacy n'a AUCUNE action de
// mutation ici — l'agent surveille seulement les créneaux Top 1/2/3 vendus et
// les conflits (remboursés automatiquement par le webhook, voir
// lib/server/finalizeBoost.ts) ; ce panneau reste donc read-only à l'identique.

export interface AgentBoostView {
  id: string
  eventId: string
  eventName: string
  organizerName: string
  position: number
  region: string
  price: number
  days: number
  purchasedAt: string
  expiresAt: string
  status: string
  conflict: boolean
  active: boolean
}

export interface AgentBoostsResult {
  active: AgentBoostView[]
  conflicts: AgentBoostView[]
  expired: AgentBoostView[]
  totalRevenue: number
}

// Alignée sur le commentaire legacy (tab === 'boosts') : le revenu affiché
// est le montant NET encaissé — les boosts remboursés (conflit de créneau)
// ou annulés ne sont pas de l'argent que la plateforme possède.
function isRefunded(status: string): boolean {
  return status === 'refunded_conflict' || status === 'cancelled'
}

// Sciemment PAS `isBoostActive` de lib/shared/boosts.ts : cette variante
// exclut aussi `conflict === true` (correct pour l'affichage public d'un
// créneau Top 3 occupé) mais PAS pour ce panneau agent — legacy AgentPage.jsx
// (tab === 'boosts') définit son propre `isActive` local, qui ne regarde QUE
// le remboursement/l'expiration. Un boost en conflit mais pas encore
// remboursé doit rester « actif » pour alimenter le bucket `conflicts`
// (= active.filter(conflict)) — réutiliser isBoostActive le ferait tomber
// silencieusement dans `expired` et viderait `conflicts` en permanence.
function isActiveForAgent(status: string, expiresAt: Date | string, now: number): boolean {
  return !isRefunded(status) && new Date(expiresAt).getTime() > now
}

export async function listActiveBoostsForAgent(): Promise<AgentBoostsResult> {
  await getDb()

  const now = Date.now()
  const boosts = await Boost.find({}).sort({ purchasedAt: -1 }).lean()

  const eventIds = [...new Set(boosts.map((b) => String(b.eventId)))]
  const events = await Event.find({ _id: { $in: eventIds } })
    .select('name organizerName organizer')
    .lean()
  const eventById = new Map(events.map((e) => [String(e._id), e]))

  const views: AgentBoostView[] = boosts.map((b) => {
    const event = eventById.get(String(b.eventId))
    return {
      id: b.boostId,
      eventId: String(b.eventId),
      eventName: event?.name || `Événement ${b.eventId}`,
      organizerName: event?.organizerName || event?.organizer || '',
      position: b.position,
      region: b.region,
      price: Number(b.price) || 0,
      days: b.days,
      purchasedAt: new Date(b.purchasedAt).toISOString(),
      expiresAt: new Date(b.expiresAt).toISOString(),
      status: b.status,
      conflict: Boolean(b.conflict),
      active: isActiveForAgent(b.status, b.expiresAt, now),
    }
  })

  const active = views.filter((v) => v.active)
  const expired = views.filter((v) => !v.active)
  const conflicts = active.filter((v) => v.conflict)
  const totalRevenue = views.filter((v) => !isRefunded(v.status)).reduce((sum, v) => sum + v.price, 0)

  return { active, conflicts, expired, totalRevenue }
}
