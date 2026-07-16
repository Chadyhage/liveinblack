import { getDb } from '../db/mongoose'
import Ticket from '../models/Ticket'
import { verifyTicketToken, extractTicketCode } from './ticketToken'

// Contrairement au legacy (payload d'affichage embarqué dans le jeton, pensé
// pour fonctionner hors-ligne avec Firestore), l'affichage vient ici
// TOUJOURS d'une lecture Mongo fraîche : un billet révoqué après émission du
// jeton ne s'affiche plus jamais comme valide.
export interface TicketDisplay {
  ticketCode: string
  eventId: string
  eventName: string
  eventDate: string
  place: string
  placePrice: number
  totalPrice: number
  currency: string
  preorders: { name: string; price: number; qty: number }[]
  guestName: string | null
  bookedAt: string | null
}

export async function getTicketDisplay(token: string): Promise<TicketDisplay | null> {
  const ticketCode = extractTicketCode(token)
  if (!ticketCode) return null

  await getDb()
  const ticket = await Ticket.findOne({ ticketCode }).lean()
  if (!ticket) return null

  const valid = verifyTicketToken(token, {
    ticketCode: ticket.ticketCode,
    seatVersion: ticket.seatVersion ?? 0,
    entryNonce: ticket.entryNonce ?? null,
  })
  if (!valid) return null
  // Un billet révoqué (siège réattribué à quelqu'un d'autre, remboursement,
  // événement annulé...) ne doit plus jamais s'afficher comme "valide" — la
  // fraîcheur du jeton ne suffit pas à elle seule, on vérifie aussi l'état.
  if (ticket.revoked) return null

  return {
    ticketCode: ticket.ticketCode,
    eventId: ticket.eventId,
    eventName: ticket.eventName,
    eventDate: ticket.eventDate,
    place: ticket.place,
    placePrice: ticket.placePrice,
    totalPrice: ticket.totalPrice,
    currency: ticket.currency,
    preorders: ticket.preorders.map((p) => ({ name: p.name, price: p.price ?? 0, qty: p.qty ?? 1 })),
    guestName: ticket.guestName ?? null,
    bookedAt: ticket.bookedAt ? new Date(ticket.bookedAt).toISOString() : null,
  }
}
