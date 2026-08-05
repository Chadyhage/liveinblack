import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import Order from '../models/Order'
import Ticket from '../models/Ticket'
import { refundStripeOrder } from './eventRefunds'
import { recordFedapayRefund } from './fedapayRefunds'

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

export async function requestClientRefund(caller: RefundCaller, orderId: string): Promise<RefundRequestResult> {
  await getDb()

  const order = await Order.findById(orderId)
  if (!order) return { ok: false, status: 404, error: 'order_not_found' }
  if (order.userId !== caller.id) return { ok: false, status: 403, error: 'forbidden' }

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

  const result = order.rail === 'stripe' ? await refundStripeOrder(order) : await recordFedapayRefund(order)
  // Ne marque la demande comme traitée qu'en cas de succès — un échec (ex.
  // erreur Stripe transitoire) doit laisser le client réessayer, jamais le
  // bloquer derrière `already_requested` sans qu'aucun remboursement ait eu lieu.
  if (!result.ok) return { ok: false, status: 502, error: 'refund_failed' }

  order.clientRefundRequestedAt = new Date()
  order.clientRefundReason = coveredByProtection ? 'cancellation_protection' : 'postponed_declined'
  await order.save()

  return { ok: true, refunded: true }
}
