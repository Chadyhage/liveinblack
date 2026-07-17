import mongoose from 'mongoose'
import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import Ticket from '../models/Ticket'
import { generateUniqueTicketCode } from './ticketCode'
import { signTicketToken } from './ticketToken'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

// Port de src/utils/guestlist.js (#7 phase organisateur) — invitations
// gratuites émises par l'organisateur, en dehors de tout paiement. Contraire-
// ment au legacy (persistance localStorage + Firestore array-doc SÉPARÉE du
// registre `tickets/{code}`, avec un risque de désynchronisation entre les
// deux), ce port réutilise EXACTEMENT le même pool de stock que les
// réservations payantes (`Event.places[].available`, décrémenté/recrédité de
// façon transactionnelle — même primitive que lib/server/orders.ts) et émet
// un VRAI `Ticket` (`source:'guestlist'`, `paid:false`, `placePrice:0`) —
// aucun registre séparé à maintenir en cohérence.

export interface GuestlistCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

export interface GuestlistEntryView {
  ticketCode: string
  place: string
  guestName: string | null
  bookedAt: string | null
  checkedInAt: string | null
  ticketUrl: string
}

export type AddGuestResult = ErrResult | { ok: true; entry: GuestlistEntryView }
export type RemoveGuestResult = ErrResult | { ok: true }
export type ListGuestlistResult = ErrResult | { ok: true; entries: GuestlistEntryView[] }

async function assertOwner(eventId: string, callerId: string) {
  const event = await Event.findById(eventId)
  if (!event) return { ok: false as const, status: 404, error: 'event_not_found' }
  if (event.organizerId !== callerId && event.createdBy !== callerId) return { ok: false as const, status: 403, error: 'forbidden' }
  return { ok: true as const, event }
}

function toView(t: {
  ticketCode: string
  place?: string | null
  guestName?: string | null
  bookedAt?: Date | string | null
  checkedInAt?: Date | string | null
  seatVersion?: number | null
  entryNonce?: string | null
}): GuestlistEntryView {
  const token = signTicketToken({ ticketCode: t.ticketCode, seatVersion: t.seatVersion ?? 0, entryNonce: t.entryNonce ?? null })
  return {
    ticketCode: t.ticketCode,
    place: t.place ?? '',
    guestName: t.guestName ?? null,
    bookedAt: t.bookedAt ? new Date(t.bookedAt).toISOString() : null,
    checkedInAt: t.checkedInAt ? new Date(t.checkedInAt).toISOString() : null,
    ticketUrl: `${SITE}/ticket/${token}`,
  }
}

// ──────────────────────────────── addGuestlistEntry ──────────────────────────

export async function addGuestlistEntry(caller: GuestlistCaller, input: { eventId: string; placeId: string; guestName: string }): Promise<AddGuestResult> {
  await getDb()

  const guard = await assertOwner(input.eventId, caller.id)
  if (!guard.ok) return guard
  if (guard.event.cancelled) return { ok: false, status: 409, error: 'event_cancelled' }

  if (!input.guestName?.trim()) return { ok: false, status: 400, error: 'guest_name_required' }

  const ticketCode = await generateUniqueTicketCode()

  const session = await mongoose.startSession()
  try {
    const outcome = await session.withTransaction(async () => {
      const fresh = await Event.findById(input.eventId).session(session)
      if (!fresh) return { ok: false as const, status: 404, error: 'event_not_found' }
      const place = fresh.places?.find((p) => p.id === input.placeId)
      if (!place) return { ok: false as const, status: 404, error: 'place_not_found' }
      if ((place.available || 0) <= 0) return { ok: false as const, status: 409, error: 'sold_out' }

      place.available = (place.available || 0) - 1
      await fresh.save({ session })

      const [ticket] = await Ticket.create(
        [
          {
            ticketCode,
            eventId: input.eventId,
            eventName: fresh.name,
            eventDate: fresh.date,
            place: place.type,
            placePrice: 0,
            totalPrice: 0,
            currency: fresh.currency,
            userId: caller.id,
            guestName: input.guestName.trim(),
            revoked: false,
            paid: false,
            source: 'guestlist',
            bookedAt: new Date(),
          },
        ],
        { session }
      )
      return { ok: true as const, ticket: ticket.toObject() }
    })
    if (!outcome.ok) return outcome
    return { ok: true, entry: toView(outcome.ticket) }
  } finally {
    await session.endSession()
  }
}

// ───────────────────────────── removeGuestlistEntry ──────────────────────────

// Ne retire QUE si le guest n'est pas déjà entré — un billet scanné a déjà
// servi, le retirer effacerait la preuve d'entrée sans rendre de place à
// personne d'autre (la soirée a déjà eu lieu pour ce siège).
export async function removeGuestlistEntry(caller: GuestlistCaller, input: { eventId: string; ticketCode: string }): Promise<RemoveGuestResult> {
  await getDb()

  const guard = await assertOwner(input.eventId, caller.id)
  if (!guard.ok) return guard

  const ticketCode = input.ticketCode.trim().toUpperCase()

  const session = await mongoose.startSession()
  try {
    const outcome = await session.withTransaction(async () => {
      const ticket = await Ticket.findOne({ ticketCode, eventId: input.eventId, source: 'guestlist' }).session(session)
      if (!ticket) return { ok: false as const, status: 404, error: 'ticket_not_found' }
      if (ticket.revoked) return { ok: true as const } // déjà retiré — idempotent
      if (ticket.checkedInAt) return { ok: false as const, status: 409, error: 'already_checked_in' }

      ticket.revoked = true
      await ticket.save({ session })

      const fresh = await Event.findById(input.eventId).session(session)
      const place = fresh?.places?.find((p) => p.type === ticket.place)
      if (fresh && place) {
        place.available = Math.min(place.total || 0, (place.available || 0) + 1)
        await fresh.save({ session })
      }
      return { ok: true as const }
    })
    return outcome
  } finally {
    await session.endSession()
  }
}

// ──────────────────────────────── listGuestlistEntries ──────────────────────

export async function listGuestlistEntries(caller: GuestlistCaller, eventId: string): Promise<ListGuestlistResult> {
  await getDb()

  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard

  const entries = await Ticket.find({ eventId, source: 'guestlist', revoked: { $ne: true } })
    .sort({ bookedAt: -1 })
    .lean()
  return { ok: true, entries: entries.map(toView) }
}
