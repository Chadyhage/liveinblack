import type { HydratedDocument } from 'mongoose'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import Order, { type OrderDoc } from '@/lib/models/Order'
import Ticket from '@/lib/models/Ticket'
import { notifyUserById } from '@/lib/server/emails/notify'
import { sendEmail } from '@/lib/server/email'
import { refundConfirmedEmail } from '@/lib/server/emails'
import type { Email } from '@/lib/server/emails/types'
import { fmtMoney } from '@/lib/shared/money'
import { extractTicketCode, verifyTicketToken } from '../events/ticketToken'
import { createClientInitiatedRefundCase } from '@/lib/server/refunds/refundCases'
import { computeRefundableMinor, isBeforeCancellationOptionDeadline } from '@/lib/shared/refundPolicy'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

export interface RefundCaller {
  id: string
}

export type RefundRequestResult =
  | { ok: false; status: number; error: string }
  | { ok: true; refunded: boolean }

// Cœur partagé des deux points d'entrée ci-dessous (compte authentifié / lien
// sécurisé sans compte) — l'AUTORISATION (qui a le droit d'appeler ceci pour
// CET order) est vérifiée par l'appelant AVANT, jamais ici : cette fonction
// suppose déjà l'identité établie et n'applique que les règles métier de la
// politique de remboursement elle-même.
async function processOrderRefund(order: HydratedDocument<OrderDoc>, notifyEmail: (email: Email) => Promise<void>): Promise<RefundRequestResult> {
  if (order.status !== 'paid') return { ok: false, status: 409, error: 'order_not_paid' }
  if (order.clientRefundRequestedAt) return { ok: false, status: 409, error: 'already_requested' }
  if (order.rail === 'free') return { ok: false, status: 409, error: 'free_ticket_not_refundable' }
  if (order.currency !== 'XOF') return { ok: false, status: 409, error: 'xof_required' }

  const event = await Event.findById(order.eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }

  const coveredByProtection = order.cancellationProtectionPurchased && isBeforeCancellationOptionDeadline(event.closingDate)
  const cause = coveredByProtection ? 'cancellation_option' : 'postponed_declined'

  if (!coveredByProtection) {
    if (event.cancelled) return { ok: false, status: 409, error: 'event_cancelled_cash_pickup_created' }
    if (!event.postponedFrom) return { ok: false, status: 409, error: 'not_eligible' }
    if (!event.refundWindowClosesAt || Date.now() >= event.refundWindowClosesAt.getTime()) {
      return { ok: false, status: 409, error: 'refund_window_closed' }
    }
  }

  // Un seul billet déjà scanné bloque le remboursement de tout le groupe —
  // le service (l'entrée) a déjà été rendu pour au moins un participant.
  const anyCheckedIn = await Ticket.exists({ orderId: String(order._id), checkedInAt: { $ne: null } })
  if (anyCheckedIn) return { ok: false, status: 409, error: 'ticket_already_checked_in' }

  const anyListedForResale = await Ticket.exists({ orderId: String(order._id), resaleListingId: { $ne: null } })
  if (anyListedForResale) return { ok: false, status: 409, error: 'ticket_listed_for_resale' }

  const result = await createClientInitiatedRefundCase(order, cause, order.userId)
  if (!result.ok) return result

  const amount = computeRefundableMinor(order, cause) / (order.currency === 'XOF' ? 1 : 100)
  await notifyEmail(refundConfirmedEmail(event.name, fmtMoney(amount, order.currency), 'dans les meilleurs délais', SITE))

  return { ok: true, refunded: true }
}

export async function requestClientRefund(caller: RefundCaller, orderId: string): Promise<RefundRequestResult> {
  await getDb()

  const order = await Order.findById(orderId)
  if (!order) return { ok: false, status: 404, error: 'order_not_found' }
  if (order.userId !== caller.id) return { ok: false, status: 403, error: 'forbidden' }

  return processOrderRefund(order, (email) => notifyUserById(caller.id, () => email))
}

// Demande sans compte, via le "lien sécurisé reçu avec son billet"
// (LIVE_IN_BLACK_Politique_Annulation_Remboursement.docx §2 — utilisé par
// les billets émis par un agent quand l'email saisi ne correspond à aucun
// compte, voir lib/server/agentSales.ts::mintAgentSaleTickets ; un billet
// guestlist n'a de toute façon aucun paiement à rembourser, `rail:'free'`
// l'exclut déjà plus haut). Le lien EST déjà l'équivalent d'un mot de passe
// ici : la même signature HMAC serveur qui protège le QR d'entrée
// (lib/server/ticketToken.ts) sert de preuve de possession — pas besoin
// d'un système de jeton séparé.
export async function requestClientRefundByTicketToken(token: string): Promise<RefundRequestResult> {
  await getDb()

  const ticketCode = extractTicketCode(token)
  if (!ticketCode) return { ok: false, status: 400, error: 'invalid_token' }

  const ticket = await Ticket.findOne({ ticketCode })
  if (!ticket) return { ok: false, status: 404, error: 'ticket_not_found' }
  if (ticket.revoked) return { ok: false, status: 409, error: 'revoked' }
  if (!verifyTicketToken(token, { ticketCode: ticket.ticketCode, seatVersion: ticket.seatVersion, entryNonce: ticket.entryNonce ?? null })) {
    return { ok: false, status: 403, error: 'invalid_token' }
  }
  if (!ticket.orderId) return { ok: false, status: 409, error: 'no_order' }

  const order = await Order.findById(ticket.orderId)
  if (!order) return { ok: false, status: 404, error: 'order_not_found' }

  const contactEmail = order.contactEmail
  return processOrderRefund(order, async (email) => {
    if (!contactEmail) return
    await sendEmail(contactEmail, email)
  })
}
