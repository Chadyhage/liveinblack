import type { HydratedDocument } from 'mongoose'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import Order, { type OrderDoc } from '@/lib/models/Order'
import Ticket from '@/lib/models/Ticket'
import { refundStripeOrder } from '../events/eventRefunds'
import { recordFedapayRefund } from './fedapayRefunds'
import { notifyUserById } from '@/lib/server/emails/notify'
import { sendEmail } from '@/lib/server/email'
import { refundConfirmedEmail, refundFailedEmail } from '@/lib/server/emails'
import type { Email } from '@/lib/server/emails/types'
import { fmtMoney } from '@/lib/shared/money'
import { extractTicketCode, verifyTicketToken } from '../events/ticketToken'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

// Même formule que refundStripeOrder/recordFedapayRefund (montant HORS frais
// de service, jamais remboursés) — dupliquée uniquement pour l'affichage
// dans l'email, ces fonctions ne retournent pas le montant.
function grossRefundMajor(order: { isTable: boolean; qty: number; unitPriceMinor: number; preorders: { price: number; qty: number }[]; currency: string }): number {
  const seatCount = order.isTable ? 1 : order.qty
  const preorderTotal = order.preorders.reduce((s, p) => s + p.price * p.qty, 0)
  const grossMinor = Math.max(0, order.unitPriceMinor * seatCount + preorderTotal)
  return grossMinor / (order.currency === 'XOF' ? 1 : 100)
}

// Demande de remboursement déclenchée par le CLIENT (politique
// d'annulation/remboursement §2 — "modification importante" non traitée ici,
// aucun champ Event ne la distingue encore d'un report, voir plan). Contexte :
// une annulation d'événement rembourse déjà tout le monde automatiquement
// (organizerEventLifecycle.ts::cancelOrganizerEvent) — le SEUL cas qui
// nécessite une action du client est un REPORT qu'il refuse de suivre. On ne
// réimplémente jamais la logique Stripe/FedaPay : refundStripeOrder /
// recordFedapayRefund (déjà idempotentes via EventRefund) sont réutilisées
// telles quelles.

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
  // Un billet gratuit (rail 'free') n'a aucun paiement Stripe/FedaPay à
  // rembourser — sans ce garde, le ternaire ci-dessous retomberait sur
  // recordFedapayRefund() faute de rail 'stripe', renvoyant une erreur
  // technique opaque au lieu d'un refus métier clair.
  if (order.rail === 'free') return { ok: false, status: 409, error: 'free_ticket_not_refundable' }

  const event = await Event.findById(order.eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }

  // L'annulation totale rembourse déjà tout automatiquement — rien à faire ici.
  if (event.cancelled) return { ok: false, status: 409, error: 'event_cancelled_auto_refunded' }

  // Assurance-annulation (lib/shared/fees.ts::CANCELLATION_PROTECTION) : le
  // client a payé un supplément à l'achat pour un droit de remboursement
  // SANS condition de report/fenêtre — bypasse les deux vérifications
  // suivantes, mais jamais le garde-fou "billet déjà scanné" ci-dessous (le
  // service a déjà été rendu, l'assurance ne couvre pas un simple regret
  // après coup une fois entré).
  const coveredByProtection = order.cancellationProtectionPurchased

  if (!coveredByProtection) {
    if (!event.postponedFrom) return { ok: false, status: 409, error: 'not_eligible' }
    if (!event.refundWindowClosesAt || Date.now() > event.refundWindowClosesAt.getTime()) {
      return { ok: false, status: 409, error: 'refund_window_closed' }
    }
  }

  // Un seul billet déjà scanné bloque le remboursement de tout le groupe —
  // le service (l'entrée) a déjà été rendu pour au moins un participant.
  const anyCheckedIn = await Ticket.exists({ orderId: String(order._id), checkedInAt: { $ne: null } })
  if (anyCheckedIn) return { ok: false, status: 409, error: 'ticket_already_checked_in' }

  const anyListedForResale = await Ticket.exists({ orderId: String(order._id), resaleListingId: { $ne: null } })
  if (anyListedForResale) return { ok: false, status: 409, error: 'ticket_listed_for_resale' }

  const result = order.rail === 'stripe' ? await refundStripeOrder(order) : await recordFedapayRefund(order)
  // Ne marque la demande comme traitée qu'en cas de succès — un échec (ex.
  // erreur Stripe transitoire) doit laisser le client réessayer, jamais le
  // bloquer derrière `already_requested` sans qu'aucun remboursement ait eu lieu.
  if (!result.ok) {
    await notifyEmail(refundFailedEmail(event.name, null, `${SITE}/help`, SITE))
    return { ok: false, status: 502, error: 'refund_failed' }
  }

  order.clientRefundRequestedAt = new Date()
  order.clientRefundReason = coveredByProtection ? 'cancellation_protection' : 'postponed_declined'
  await order.save()

  await notifyEmail(refundConfirmedEmail(event.name, fmtMoney(grossRefundMajor(order), order.currency), 'quelques jours ouvrés', SITE))

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
