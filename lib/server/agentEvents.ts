import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import { getEventEndTimestamp } from '../shared/eventUrgency'
import { cancelOrganizerEvent, type CancelEventResult } from './organizerEventLifecycle'

// Port de la vue admin « Événements » de src/pages/AgentPage.jsx
// (tab === 'events', #9 phase agent/admin) — liste TOUS les événements
// publiés (tous organisateurs confondus) avec recherche + filtre de statut,
// et une annulation admin qui RÉUTILISE le même flux autoritaire que
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
}

// « Passé » = même définition que le compteur du dashboard organisateur et
// que legacy (getEventEndTimestamp, gère l'heure de fin manquante ET les
// soirées après minuit) — jamais une comparaison naïve sur `date` seule.
function computeStatus(event: { date?: string; time?: string; endTime?: string; cancelled?: boolean }, now: number): AgentEventStatus {
  if (event.cancelled) return 'cancelled'
  const end = getEventEndTimestamp(event)
  return end > 0 && end < now ? 'past' : 'upcoming'
}

// Ajouté suite à l'audit de scalabilité du 12/08/2026 — cette fonction
// chargeait TOUS les événements de la plateforme sans aucune limite
// (Event.find({})), la requête la plus dangereuse identifiée dans tout
// l'audit : à 10x/100x le nombre d'événements créés depuis le lancement,
// le dashboard agent finirait par timeout/OOM. Le statut (upcoming/past/
// cancelled) reste calculé côté serveur à partir de `date`/`endTime`, pas
// stocké — un vrai filtre serveur nécessiterait de dénormaliser ce statut
// en base (chantier à part). En attendant, on borne la fenêtre : les
// événements les plus RÉCENTS d'abord, jusqu'à ce plafond — cohérent avec
// l'usage réel (l'agent modère l'actualité, pas l'historique complet).
const AGENT_EVENT_LIST_CAP = 2000

export async function listEventsForAgent(filter: ListEventsFilter = {}): Promise<AgentEventView[]> {
  await getDb()

  const events = await Event.find({}).sort({ createdAt: -1 }).limit(AGENT_EVENT_LIST_CAP).lean()
  const now = Date.now()

  let views: AgentEventView[] = events.map((e) => {
    const status = computeStatus(e, now)
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

  if (filter.status && filter.status !== 'all') {
    views = views.filter((v) => v.status === filter.status)
  }

  if (filter.search?.trim()) {
    const q = filter.search.trim().toLowerCase()
    views = views.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.organizerName.toLowerCase().includes(q) ||
        v.organizer.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q)
    )
  }

  // Annulés à la fin, puis par date proche — même tri que legacy.
  views.sort((a, b) => {
    if (a.cancelled !== b.cancelled) return a.cancelled ? 1 : -1
    return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
  })

  return views
}

export async function adminCancelEvent(agent: AgentCaller, eventId: string, message: string): Promise<CancelEventResult> {
  return cancelOrganizerEvent({ id: agent.id }, eventId, message, { bypassOwnership: true })
}
