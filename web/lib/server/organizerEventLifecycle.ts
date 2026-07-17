import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import Order from '../models/Order'
import EventStaff from '../models/EventStaff'
import PromoCode from '../models/PromoCode'
import EventAccessCode from '../models/EventAccessCode'
import { refundStripeOrder } from './eventRefunds'
import { recordFedapayRefund } from './fedapayRefunds'

// Port des flux "annuler" / "reporter" / "supprimer" de
// src/pages/MesEvenementsPage.jsx (#7 phase organisateur). Seul le
// PROPRIÉTAIRE (organizerId/createdBy — jamais un simple manager d'équipe
// EventStaff, qui n'a d'autorité que SUR PLACE le soir de l'événement) peut
// déclencher ces trois actions.

export interface LifecycleCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

async function assertOwner(eventId: string, callerId: string) {
  const event = await Event.findById(eventId)
  if (!event) return { ok: false as const, status: 404, error: 'event_not_found' }
  if (event.organizerId !== callerId && event.createdBy !== callerId) return { ok: false as const, status: 403, error: 'forbidden' }
  return { ok: true as const, event }
}

// ────────────────────────────────── cancelEvent ──────────────────────────────

export type CancelEventResult = ErrResult | { ok: true; refundedCount: number; refundFailedCount: number }

// Annule l'événement et déclenche le remboursement de CHAQUE commande payée
// (Stripe : remboursement réel immédiat ; FedaPay : aucune API de
// remboursement n'existe, une entrée `pending_manual` est consignée pour un
// traitement humain — voir lib/server/fedapayRefunds.ts). Un échec de
// remboursement individuel n'annule jamais la décision d'annulation de
// l'événement elle-même (déjà actée avant la boucle) — il est seulement
// consigné (PaymentAlert, dans refundStripeOrder) pour intervention manuelle.
export async function cancelOrganizerEvent(caller: LifecycleCaller, eventId: string, message: string): Promise<CancelEventResult> {
  await getDb()

  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard
  const { event } = guard

  if (!event.cancelled) {
    event.cancelled = true
    event.cancellationMessage = message?.trim().slice(0, 500) || ''
    event.cancelledAt = new Date()
    await event.save()
  }

  const paidOrders = await Order.find({ eventId, status: 'paid' })
  let refundedCount = 0
  let refundFailedCount = 0
  for (const order of paidOrders) {
    const result = order.rail === 'stripe' ? await refundStripeOrder(order) : await recordFedapayRefund(order)
    if (result.ok) refundedCount++
    else refundFailedCount++
  }

  return { ok: true, refundedCount, refundFailedCount }
}

// ────────────────────────────────── postponeEvent ────────────────────────────

export interface PostponeInput {
  date: string
  time?: string
}

export type PostponeEventResult = ErrResult | { ok: true }

// Les billets/QR déjà émis restent valables tels quels — aucun remboursement,
// aucune modification de billet : le contrôle d'entrée (isEventEnded) relit
// `Event.date`/`time` en direct, donc reporter prolonge naturellement la
// fenêtre de check-in sans rien toucher côté Ticket.
export async function postponeOrganizerEvent(caller: LifecycleCaller, eventId: string, input: PostponeInput): Promise<PostponeEventResult> {
  await getDb()

  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard
  const { event } = guard
  if (event.cancelled) return { ok: false, status: 409, error: 'event_cancelled' }
  if (!input.date?.trim()) return { ok: false, status: 400, error: 'date_required' }

  // Ne garde que la date/heure D'ORIGINE (premier report) — un second report
  // ne doit jamais écraser "depuis quand" l'événement a réellement bougé.
  if (!event.postponedFrom) {
    event.postponedFrom = { date: event.date, time: event.time }
  }
  event.date = input.date
  if (input.time?.trim()) event.time = input.time

  await event.save()
  return { ok: true }
}

// ────────────────────────────────── deleteEvent ──────────────────────────────

export type DeleteEventResult = ErrResult | { ok: true; deleted: true } | { ok: false; status: 409; error: 'has_bookings'; bookingCount: number }

// Suppression FERMÉE dès qu'une réservation existe (même logique que legacy :
// un événement avec des billets vendus ne se supprime plus jamais — il doit
// être ANNULÉ à la place, pour que les acheteurs soient remboursés et
// prévenus). Le client reçoit `bookingCount` pour basculer automatiquement
// vers le flux d'annulation, exactement comme MesEvenementsPage.jsx.
export async function deleteOrganizerEvent(caller: LifecycleCaller, eventId: string): Promise<DeleteEventResult> {
  await getDb()

  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard

  // Somme de `qty` (billets réellement vendus), pas un simple compte de
  // commandes — une commande de groupe peut représenter plusieurs billets en
  // une seule ligne, et c'est ce nombre-là que legacy affiche ("N
  // réservation(s) ont/a déjà eu lieu").
  const [{ bookingCount = 0 } = {}] = await Order.aggregate([
    { $match: { eventId, status: 'paid' } },
    { $group: { _id: null, bookingCount: { $sum: '$qty' } } },
  ])
  if (bookingCount > 0) return { ok: false, status: 409, error: 'has_bookings', bookingCount }

  await Promise.all([
    Event.deleteOne({ _id: eventId }),
    EventStaff.deleteOne({ eventId }),
    PromoCode.deleteMany({ eventId }),
    EventAccessCode.deleteMany({ eventId }),
  ])

  return { ok: true, deleted: true }
}
