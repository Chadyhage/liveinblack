import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import Ticket from '../models/Ticket'
import User from '../models/User'
import { listValidBuyerIds, toBookingView, type EventBookingsView } from './organizerBookingsUtils'

// Port de BookingsPanel (MesEvenementsPage.jsx lignes 3727-3884) — détail des
// réservations d'un événement pour l'organisateur. Contrairement au legacy
// (lecture du registre Firestore de billets, déjà corrigé une fois pour ne
// plus manquer les achats cross-device), ce port lit directement `Ticket`
// (source canonique unique dans cette migration), jamais un cache local.

export interface BookingCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

export type GetEventBookingsResult = ErrResult | { ok: true; view: EventBookingsView }

export async function getEventBookings(caller: BookingCaller, eventId: string): Promise<GetEventBookingsResult> {
  await getDb()

  const event = await Event.findById(eventId).lean()
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  if (event.organizerId !== caller.id && event.createdBy !== caller.id) return { ok: false, status: 403, error: 'forbidden' }

  const tickets = await Ticket.find({ eventId, revoked: { $ne: true } }).sort({ bookedAt: -1 }).lean()

  // Filtre défensif sur les ObjectId valides (même précaution que
  // eventStaff.ts) : un `userId` non conforme ne doit jamais faire échouer
  // tout le panneau avec un CastError, juste laisser ce billet sans nom de
  // buyerNameById.
  const buyerIds = listValidBuyerIds(tickets)
  const buyers = buyerIds.length ? await User.find({ _id: { $in: buyerIds } }).select('firstName lastName email').lean() : []
  const buyerNameById = new Map(buyers.map((u) => [String(u._id), [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email]))
  const view = toBookingView(tickets, buyerNameById)

  return {
    ok: true,
    view,
  }
}
