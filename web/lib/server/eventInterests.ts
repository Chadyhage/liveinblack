import { getDb } from '../db/mongoose'
import EventInterest from '../models/EventInterest'
import Event from '../models/Event'

// Port de src/utils/eventInterests.js ("Événements intéressés" — bouton
// coeur sur une fiche événement + liste dédiée /profil/evenements-interesses,
// #6 phase profil). Le legacy stockait un instantané (`event: {...}`) de
// l'événement AU MOMENT du clic dans le même document que la relation, pour
// fonctionner hors-ligne/sans re-fetch. Ici, cet instantané est inutile :
// une vraie requête Mongo relit toujours l'Event à jour au moment de
// l'affichage (listMyEventInterests), donc jamais de nom/prix/date obsolète
// affiché dans "ma liste" — contrairement au legacy qui pouvait montrer un
// prix ou un statut d'annulation périmé tant qu'aucun listener Firestore
// n'avait rafraîchi l'instantané local.

export interface EventInterestCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

export type MarkInterestedResult = ErrResult | { ok: true; interested: true }
export type UnmarkInterestedResult = ErrResult | { ok: true; interested: false }

export interface InterestedEventView {
  id: string
  name: string
  subtitle: string
  date: string
  dateDisplay: string
  time: string
  endTime: string
  city: string
  category: string
  imageUrl: string | null
  color: string
  cancelled: boolean
  currency: 'EUR' | 'XOF'
  minPrice: number | null
}

export interface EventInterestItemView {
  eventId: string
  createdAt: string
  // null si l'événement a depuis été supprimé — le client affiche alors une
  // carte "Indisponible" plutôt que de faire planter le rendu (même esprit
  // que le fallback `inactive` du legacy pour un événement annulé/terminé).
  event: InterestedEventView | null
}

export type ListMyEventInterestsResult = ErrResult | { ok: true; items: EventInterestItemView[] }
export type IsEventInterestedResult = { ok: true; interested: boolean }

function toInterestedEventView(ev: {
  _id: unknown
  name: string
  subtitle?: string | null
  date: string
  dateDisplay?: string | null
  time?: string | null
  endTime?: string | null
  city?: string | null
  category?: string | null
  imageUrl?: string | null
  color?: string | null
  cancelled?: boolean
  currency?: 'EUR' | 'XOF'
  places?: { price?: number | null }[]
}): InterestedEventView {
  const prices = (ev.places ?? []).map((p) => Number(p?.price)).filter((n) => Number.isFinite(n))
  return {
    id: String(ev._id),
    name: ev.name,
    subtitle: ev.subtitle ?? '',
    date: ev.date,
    dateDisplay: ev.dateDisplay ?? '',
    time: ev.time ?? '',
    endTime: ev.endTime ?? '',
    city: ev.city ?? '',
    category: ev.category ?? '',
    imageUrl: ev.imageUrl ?? null,
    color: ev.color ?? '#c8a96e',
    cancelled: Boolean(ev.cancelled),
    currency: ev.currency ?? 'EUR',
    minPrice: prices.length ? Math.min(...prices) : null,
  }
}

// ─────────────────────────── markEventInterested ────────────────────────────

export async function markEventInterested(caller: EventInterestCaller, input: { eventId: string }): Promise<MarkInterestedResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  if (!eventId) return { ok: false, status: 400, error: 'invalid_input' }

  // Upsert idempotent : ré-appuyer sur un événement déjà marqué intéressé
  // (double-clic, deux onglets) ne doit jamais lever d'erreur — juste
  // reconfirmer status:'active'. L'index unique {userId,eventId} rend ceci
  // atomique même sous appels concurrents.
  await EventInterest.findOneAndUpdate(
    { userId: caller.id, eventId },
    { $set: { status: 'active' }, $setOnInsert: { userId: caller.id, eventId } },
    { upsert: true }
  )

  return { ok: true, interested: true }
}

// ──────────────────────────── unmarkEventInterested ─────────────────────────

export async function unmarkEventInterested(caller: EventInterestCaller, input: { eventId: string }): Promise<UnmarkInterestedResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  if (!eventId) return { ok: false, status: 400, error: 'invalid_input' }

  // status:'removed' plutôt qu'une suppression du document — voir le
  // commentaire d'en-tête du modèle : préserve `createdAt` si l'utilisateur
  // remarque l'événement plus tard. Idempotent si déjà retiré / jamais ajouté
  // (upsert), pour la même raison que markEventInterested ci-dessus.
  await EventInterest.findOneAndUpdate(
    { userId: caller.id, eventId },
    { $set: { status: 'removed' }, $setOnInsert: { userId: caller.id, eventId } },
    { upsert: true }
  )

  return { ok: true, interested: false }
}

// ───────────────────────────── isEventInterested ────────────────────────────

// Utilisée par la page détail événement (Server Component, lecture
// privilégiée directe) pour connaître l'état initial du bouton coeur, sans
// aller-retour HTTP supplémentaire au premier rendu.
export async function isEventInterested(caller: EventInterestCaller, input: { eventId: string }): Promise<IsEventInterestedResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  if (!eventId) return { ok: true, interested: false }

  const exists = await EventInterest.exists({ userId: caller.id, eventId, status: 'active' })
  return { ok: true, interested: Boolean(exists) }
}

// ─────────────────────────── listMyEventInterests ───────────────────────────

// Renvoie une liste PLATE triée par date d'ajout décroissante — le partage
// "à venir" / "passés ou indisponibles" reste une dérivation CLIENT (via
// lib/shared/event-time.ts, déjà utilisé ailleurs dans ce port), exactement
// comme le legacy le calcule dans InterestedEventsPage.jsx plutôt que de le
// précalculer serveur.
export async function listMyEventInterests(caller: EventInterestCaller): Promise<ListMyEventInterestsResult> {
  await getDb()

  const interests = await EventInterest.find({ userId: caller.id, status: 'active' }).sort({ createdAt: -1 }).lean()
  if (interests.length === 0) return { ok: true, items: [] }

  const eventIds = interests.map((i) => i.eventId)
  const events = await Event.find({ _id: { $in: eventIds } }).lean()
  const eventById = new Map(events.map((e) => [String(e._id), e]))

  const items: EventInterestItemView[] = interests.map((interest) => {
    const ev = eventById.get(interest.eventId)
    return {
      eventId: interest.eventId,
      createdAt: new Date(interest.createdAt as unknown as string).toISOString(),
      event: ev ? toInterestedEventView(ev) : null,
    }
  })

  return { ok: true, items }
}
