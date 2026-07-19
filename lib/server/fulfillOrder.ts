import mongoose from 'mongoose'
import Order, { type OrderDoc } from '../models/Order'
import Event from '../models/Event'
import Ticket from '../models/Ticket'
import SellerBalance from '../models/SellerBalance'
import EventPayout from '../models/EventPayout'
import PaymentAlert from '../models/PaymentAlert'
import PromoCode from '../models/PromoCode'
import GroupMembership from '../models/GroupMembership'
import { registerPromoUse } from './promos'
import { generateUniqueTicketCode } from './ticketCode'
import { refundStripeOrder } from './eventRefunds'
import { recordFedapayRefund } from './fedapayRefunds'

// Cœur PARTAGÉ de la finalisation d'une commande payée — utilisé par le
// webhook Stripe ET le webhook FedaPay (le legacy dupliquait cette logique
// ligne à ligne entre api/stripe-webhook.js et api/fedapay.js ; ici factorisé
// une fois, ce qui élimine le risque de correctifs appliqués à un seul rail).
//
// FERME L'AUDIT C05 : ce module ne lit et n'écrit JAMAIS de billet écrit par
// le client. Le nombre de billets à émettre vient EXCLUSIVEMENT de l'Order
// (immuable, créé serveur avant paiement) — jamais d'un document "adopté".
const FULFILL_LOCK_MS = 90_000

export type FulfillResult =
  | { status: 'already_processed' }
  | { status: 'locked' } // un autre run est en cours (Stripe/FedaPay va réessayer)
  | { status: 'order_not_found' }
  | { status: 'amount_mismatch' }
  | { status: 'refunded_cancelled_event' }
  | { status: 'ok'; ticketCodes: string[] }

export async function fulfillOrder(
  orderId: string,
  // 'free' = appelé SYNCHRONE par lib/server/freeCheckout.ts (jamais par un
  // webhook) — total déjà vérifié à zéro par l'appelant, pas de vérification
  // de montant à faire ici (contrairement à 'fedapay').
  opts: { rail: 'stripe' | 'fedapay' | 'free'; paidAmountMinor?: number }
): Promise<FulfillResult> {
  const order = await Order.findById(orderId)
  if (!order) return { status: 'order_not_found' }
  if (order.paid) return { status: 'already_processed' }

  // ── Verrou de traitement (90s) — anti double-traitement concurrent ──
  const claimed = await claimFulfillment(order._id.toString())
  if (!claimed) return { status: 'locked' }

  // FedaPay uniquement : le montant réellement payé doit correspondre EXACTEMENT
  // à ce que l'Order attendait (pas d'équivalent Stripe — la session Stripe
  // n'est pas falsifiable après création).
  if (opts.rail === 'fedapay') {
    const expected = expectedTotalMinor(order)
    if (opts.paidAmountMinor == null || opts.paidAmountMinor !== expected) {
      await PaymentAlert.updateOne(
        { key: `amount_mismatch_${orderId}` },
        { $set: { reason: 'amount_mismatch', eventId: order.eventId, details: { expected, paid: opts.paidAmountMinor } } },
        { upsert: true }
      )
      return { status: 'amount_mismatch' }
    }
  }

  const event = await Event.findById(order.eventId)
  if (!event || event.cancelled) {
    // Le paiement est arrivé APRÈS suppression/annulation de l'événement —
    // jamais émettre de billet, rembourser plutôt (ferme H07 côté webhook).
    await PaymentAlert.updateOne(
      { key: `paid_after_cancel_${orderId}` },
      { $set: { reason: !event ? 'event_deleted_before_fulfillment' : 'paid_after_cancel', eventId: order.eventId, details: {} } },
      { upsert: true }
    )
    if (opts.rail === 'stripe') await refundStripeOrder(order as OrderDoc & { _id: mongoose.Types.ObjectId })
    else await recordFedapayRefund(order as OrderDoc & { _id: mongoose.Types.ObjectId })
    return { status: 'refunded_cancelled_event' }
  }

  const seatCount = order.isTable ? order.tableSeats : order.qty
  const tableId = order.isTable ? `tbl_${order._id.toString()}` : null
  const unitMajor = order.unitPriceMinor / (order.currency === 'XOF' ? 1 : 100)
  const isXof = order.currency === 'XOF'
  // Précommandes payées à la caisse, portées par le seul seatIndex 0 (voir
  // plus bas) — leur montant DOIT entrer dans `totalPrice` de ce billet-là,
  // exactement comme le legacy (src/pages/PaiementReussiPage.jsx :
  // `totalPrice: pending.unitPriceEUR + tPreorderTotal`) et comme le
  // documente déjà lib/server/organizerEvents.ts ("agrégé depuis Ticket...
  // y compris précommandes") pour le revenu affiché au tableau de bord
  // organisateur — `totalPrice` est la source canonique de cette somme, pas
  // seulement un doublon d'affichage de `placePrice`.
  const preorderTotalMajor = order.preorders.reduce((s, p) => s + (p.price / (isXof ? 1 : 100)) * p.qty, 0)

  const ticketCodes: string[] = []
  const ticketDocs = []
  for (let seatIndex = 0; seatIndex < seatCount; seatIndex++) {
    const code = await generateUniqueTicketCode()
    ticketCodes.push(code)
    ticketDocs.push({
      ticketCode: code,
      orderId: order._id.toString(),
      eventId: order.eventId,
      eventName: event.name,
      eventDate: event.date,
      place: order.placeType,
      placePrice: unitMajor,
      totalPrice: seatIndex === 0 ? unitMajor + preorderTotalMajor : unitMajor,
      currency: order.currency,
      preorders: seatIndex === 0 ? order.preorders.map((p) => ({ name: p.name, price: p.price / (isXof ? 1 : 100), qty: p.qty })) : [],
      userId: order.isTable ? order.userId : order.userId,
      hostUid: order.isTable ? order.userId : null,
      tableId,
      seatIndex: order.isTable ? seatIndex : null,
      revoked: false,
      paid: true,
      source: opts.rail === 'stripe' ? 'stripe-webhook' : opts.rail === 'fedapay' ? 'fedapay-webhook' : 'free',
      stripeSessionId: order.stripeSessionId || null,
      fedapayTransactionId: order.fedapayTxnId || null,
      promoCode: order.promoCode || null,
      bookedAt: new Date(),
    })
  }
  await Ticket.insertMany(ticketDocs)

  // ── Table achetée : l'hôte obtient sa sentinelle de groupe (garde-fou
  // "1 place de groupe par compte et par événement", cf. GroupMembership.ts).
  // Le paiement a DÉJÀ eu lieu — un conflit ici (l'acheteur tient déjà une
  // autre table sur cet événement, cas normalement bloqué en amont par
  // groupTicketGuard à la création de l'Order, mais l'Order peut avoir été
  // créé avant qu'une autre table ne soit rejointe entre-temps) ne doit
  // JAMAIS faire échouer l'émission des billets déjà payés : on mint quand
  // même et on journalise une alerte pour résolution manuelle. ──
  if (order.isTable) {
    try {
      await GroupMembership.create({
        eventId: order.eventId,
        userId: order.userId,
        tableId: tableId as string,
        role: 'host',
        ticketCode: ticketCodes[0],
      })
    } catch {
      await PaymentAlert.updateOne(
        { key: `group_membership_conflict_${orderId}` },
        { $set: { reason: 'group_membership_conflict', eventId: order.eventId, details: { userId: order.userId, tableId } } },
        { upsert: true }
      )
    }
  }

  // ── Re-vérification anti-course : l'événement a-t-il été annulé PENDANT
  // qu'on émettait les billets ? Si oui, on les révoque immédiatement et on
  // rembourse — jamais de billet valide pour un événement annulé. ──
  const recheck = await Event.findById(order.eventId).select('cancelled').lean()
  if (!recheck || recheck.cancelled) {
    await Ticket.updateMany({ ticketCode: { $in: ticketCodes } }, { $set: { revoked: true } })
    if (order.isTable) await GroupMembership.deleteOne({ eventId: order.eventId, userId: order.userId, tableId: tableId as string })
    order.status = 'cancelled'
    await order.save()
    if (opts.rail === 'stripe') await refundStripeOrder(order as OrderDoc & { _id: mongoose.Types.ObjectId })
    else await recordFedapayRefund(order as OrderDoc & { _id: mongoose.Types.ObjectId })
    return { status: 'refunded_cancelled_event' }
  }

  // ── Crédit vendeur (mode ledger uniquement — Connect 'auto' est déjà réglé
  // par Stripe au moment du paiement) + marquage payé/réglé, une seule fois. ──
  await settleOrder(order)

  return { status: 'ok', ticketCodes }
}

function expectedTotalMinor(order: OrderDoc): number {
  const seatCount = order.isTable ? 1 : order.qty
  const preorderTotal = order.preorders.reduce((s, p) => s + p.price * p.qty, 0)
  return order.unitPriceMinor * seatCount + preorderTotal + order.feeMinor
}

async function claimFulfillment(orderId: string): Promise<boolean> {
  const now = Date.now()
  const order = await Order.findById(orderId)
  if (!order) return false
  if (order.fulfillStartedAt && now - order.fulfillStartedAt.getTime() < FULFILL_LOCK_MS) return false
  order.fulfillStartedAt = new Date(now)
  await order.save()
  return true
}

async function settleOrder(order: OrderDoc & { _id: mongoose.Types.ObjectId }): Promise<void> {
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const fresh = await Order.findById(order._id).session(session)
      if (!fresh || fresh.settled) {
        if (fresh && !fresh.paid) {
          fresh.paid = true
          fresh.status = 'paid'
          await fresh.save({ session })
        }
        return
      }

      const seatCount = fresh.isTable ? 1 : fresh.qty
      const preorderTotal = fresh.preorders.reduce((s, p) => s + p.price * p.qty, 0)
      const grossMinor = fresh.unitPriceMinor * seatCount + preorderTotal
      const owedMinor = grossMinor - fresh.feeMinor

      if (fresh.connectMode === 'ledger' && fresh.sellerUid && owedMinor > 0) {
        const field = fresh.currency === 'XOF' ? 'amountDueXOF' : 'amountDueCents'
        await SellerBalance.updateOne({ sellerUid: fresh.sellerUid }, { $inc: { [field]: owedMinor } }, { session, upsert: true })

        if (fresh.currency === 'XOF') {
          const event = await Event.findById(fresh.eventId).session(session)
          await EventPayout.updateOne(
            { eventId: fresh.eventId },
            { $inc: { amountDueXOF: owedMinor }, $setOnInsert: { sellerUid: fresh.sellerUid, status: 'accumulating' }, $set: { momoCountry: momoCountryForEvent(event) } },
            { session, upsert: true }
          )
        }
      }

      if (fresh.promoCode) {
        await registerPromoUse(PromoCode, fresh.eventId, fresh.promoCode, fresh.promoUses)
      }

      fresh.paid = true
      fresh.status = 'paid'
      fresh.settled = true
      await fresh.save({ session })
    })
  } finally {
    await session.endSession()
  }
}

function momoCountryForEvent(event: { region?: string } | null): string | null {
  // Résolution simple région → code pays FedaPay (mêmes régions que
  // lib/shared/regions.ts). Tenue volontairement locale et minimale : le
  // mapping complet vit dans regions.ts, ici on a juste besoin d'un indice
  // pour lib/server/eventPayouts.ts (construit dans une tâche ultérieure).
  if (!event?.region) return null
  const key = event.region.trim().toLowerCase()
  const map: Record<string, string> = { togo: 'tg', 'bénin': 'bj', benin: 'bj', 'côte d’ivoire': 'ci', senegal: 'sn', 'sénégal': 'sn' }
  return map[key] || null
}
