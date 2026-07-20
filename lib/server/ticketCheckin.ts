import mongoose from 'mongoose'
import { getDb } from '../db/mongoose'
import Ticket from '../models/Ticket'
import Event from '../models/Event'
import EventStaff from '../models/EventStaff'
import User from '../models/User'
import { verifyTicketToken, extractTicketCode } from './ticketToken'
import { isEventEnded } from '../shared/event-time'

// Port de api/tickets.js (checkinTicket) + de la partie serveur de
// ScannerPage.jsx (processCode). Dans le legacy, l'essentiel de la
// vérification vivait CÔTÉ CLIENT (lookupTicketRegistry, entryDisplayVerdict,
// eventScanGuard...) car le SDK Firestore client pouvait lire tickets/ et
// events/ directement — le serveur (api/tickets.js) restait l'autorité finale
// mais le client devait déjà se débrouiller pour afficher un verdict fiable
// hors-ligne. Ici, le client Mongo n'a JAMAIS d'accès direct à la base : tout
// passe par cette fonction, donc toute la logique de verdict vit UNIQUEMENT
// ici, une seule fois, sans duplication client/serveur.
export interface CheckinCaller {
  id: string
  roles: string[]
}

export type CheckinInput = { token: string; ticketCode?: never } | { ticketCode: string; token?: never }

export interface CheckinTicketView {
  ticketCode: string
  eventId: string
  eventName: string
  eventDate: string
  place: string
  totalPrice: number
  currency: string
  preorders: { name: string; price: number; qty: number }[]
  guestName: string | null
  // Nom du titulaire du COMPTE (jamais l'invité nommé) — permet au staff de
  // recouper visuellement avec une pièce d'identité à l'entrée même quand
  // `guestName` est absent (billet non transféré à un invité).
  holderName: string | null
}

export type CheckinResult =
  | { ok: false; status: number; error: string }
  | { ok: true; alreadyCheckedIn: boolean; pointAwarded: boolean; ticket: CheckinTicketView }

export async function checkinTicket(caller: CheckinCaller, input: CheckinInput): Promise<CheckinResult> {
  await getDb()

  const ticketCode = 'token' in input && input.token ? extractTicketCode(input.token) : input.ticketCode?.trim().toUpperCase()
  if (!ticketCode) return { ok: false, status: 400, error: 'invalid_code' }

  const ticket = await Ticket.findOne({ ticketCode })
  if (!ticket) return { ok: false, status: 404, error: 'ticket_not_found' }
  if (ticket.revoked) return { ok: false, status: 409, error: 'revoked' }

  // ── Autorisation : agent (n'importe quelle interface active), propriétaire/
  // organisateur de CET événement, ou membre du staff (hors rôle 'dj' — son
  // outil est la playlist, pas le contrôle d'entrée, cf. #75). ──
  const event = await Event.findById(ticket.eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }

  let allowed = caller.roles.includes('agent')
  if (!allowed && (event.organizerId === caller.id || event.createdBy === caller.id)) allowed = true
  if (!allowed) {
    const staff = await EventStaff.findOne({ eventId: ticket.eventId }).lean()
    // .lean() renvoie un objet JS brut pour un champ Map (pas un vrai Map) —
    // le type inféré par Mongoose ne le reflète pas, d'où le cast.
    const roster = staff?.roster as Record<string, { role: string }> | undefined
    const entry = roster?.[caller.id]
    if (entry && entry.role !== 'dj') allowed = true
  }
  if (!allowed) return { ok: false, status: 403, error: 'forbidden' }

  // ── Fraîcheur / anti-falsification. Un jeton QR est vérifié contre l'état
  // COURANT du billet (seatVersion + entryNonce) : périmé dès qu'un siège est
  // réattribué (#79), pas besoin de comparaison séparée. Une saisie manuelle
  // (pas de jeton) est refusée pour un siège déjà (ré)attribué — seul le QR à
  // jour du titulaire ACTUEL prouve la possession de l'entryNonce courant. ──
  if ('token' in input && input.token) {
    const validToken = verifyTicketToken(input.token, {
      ticketCode: ticket.ticketCode,
      seatVersion: ticket.seatVersion ?? 0,
      entryNonce: ticket.entryNonce ?? null,
    })
    if (!validToken) return { ok: false, status: 403, error: 'stale_or_invalid_token' }
  } else if (ticket.tableId && ticket.entryNonce) {
    return { ok: false, status: 403, error: 'manual_entry_not_allowed_for_reassigned_seat' }
  }

  // ── Événement : doit exister, ne pas être annulé, ne pas être terminé.
  // (Le legacy ne bloquait l'événement terminé que côté client — fermeture
  // volontaire du trou : le serveur devient l'autorité complète.) ──
  if (isEventEnded(event)) return { ok: false, status: 409, error: 'event_ended' }

  // ── Droit à l'entrée : payé, place réellement gratuite, ou invitation
  // guestlist (#7 phase organisateur — lib/server/guestlist.ts). Une place de
  // guestlist peut être n'importe quel type de place (y compris payante :
  // l'organisateur offre délibérément une table VIP) — seul `source` fait foi
  // ici, jamais le prix de la place. ──
  if (ticket.paid !== true && ticket.source !== 'guestlist') {
    if (ticket.stripeSessionId || ticket.fedapayTransactionId) {
      return { ok: false, status: 403, error: 'payment_pending' }
    }
    const place = event.places?.find((p) => p.type === ticket.place)
    const isFreePlace = place && Number(place.price) === 0
    if (!isFreePlace) return { ok: false, status: 403, error: 'not_entitled' }
  }

  // ── Check-in idempotent + point de fidélité (transaction : lecture avant
  // écriture, jamais deux fois pour un même billet, jamais si le titulaire a
  // supprimé son compte — cf. #10/#22). Le point va au TITULAIRE COURANT
  // (ticket.userId), pas forcément l'acheteur d'origine. ──
  let alreadyCheckedIn = false
  let pointAwarded = false
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const fresh = await Ticket.findById(ticket._id).session(session)
      if (!fresh) return
      if (fresh.checkedInAt) {
        alreadyCheckedIn = true
        return
      }
      fresh.checkedInAt = new Date()
      fresh.checkedInBy = caller.id
      await fresh.save({ session })

      // Billet gratuit ou invitation : entrée accordée, AUCUN point (anti-farming
      // #75 — un organisateur d'event gratuit ne doit pas pouvoir se scanner à
      // volonté pour accumuler des points).
      if (fresh.paid === true && fresh.userId) {
        const holder = await User.findById(fresh.userId).session(session)
        if (holder) {
          holder.points = (holder.points || 0) + 1
          await holder.save({ session })
          pointAwarded = true
        }
      }
    })
  } finally {
    await session.endSession()
  }

  // Nom du titulaire du compte, indépendamment du crédit de point ci-dessus
  // (lu même pour un billet gratuit/invitation, jamais seulement quand
  // `pointAwarded`) — best-effort : un titulaire supprimé entre-temps ne doit
  // jamais faire échouer un check-in déjà accordé.
  let holderName: string | null = null
  if (ticket.userId) {
    const holderUser = await User.findById(ticket.userId).select('firstName lastName').lean()
    if (holderUser) {
      const fullName = `${holderUser.firstName ?? ''} ${holderUser.lastName ?? ''}`.trim()
      holderName = fullName || null
    }
  }

  return {
    ok: true,
    alreadyCheckedIn,
    pointAwarded,
    ticket: {
      ticketCode: ticket.ticketCode,
      eventId: ticket.eventId,
      eventName: ticket.eventName,
      eventDate: ticket.eventDate,
      place: ticket.place,
      totalPrice: ticket.totalPrice,
      currency: ticket.currency,
      preorders: ticket.preorders.map((p) => ({ name: p.name, price: p.price ?? 0, qty: p.qty ?? 1 })),
      guestName: ticket.guestName ?? null,
      holderName,
    },
  }
}
