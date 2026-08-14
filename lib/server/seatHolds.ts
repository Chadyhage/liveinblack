import mongoose from 'mongoose'
import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import Order, { type OrderDoc } from '../models/Order'
import SeatHold, { type SeatHoldDoc } from '../models/SeatHold'
import { computeSeatHoldDepositMinor, computeTicketFeeCents, computeTicketFeeXOF, seatHoldDurationMs, type SeatHoldTier } from '../shared/fees'
import { isEventEnded } from '../shared/event-time'
import { notifyUserById } from './emails/notify'
import { seatHoldExpiredEmail, seatHoldExpiringEmail } from './emails'
import { settleOrder } from './fulfillOrder'
import { resolveSellerSettlementMode } from './sellerSettlementMode'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

// Blocage temporaire de place avec acompte — voir lib/models/SeatHold.ts pour
// le cycle de vie complet. Deux Order distincts financent un hold : l'acompte
// (kind:'seat_hold_deposit', créé ici) puis le solde (kind:'seat_hold_completion',
// créé par lib/server/orders.ts::createOrder quand `seatHoldId` est fourni —
// jamais réimplémenté ici, un seul chemin de paiement/mint de billet).

const DEPOSIT_ORDER_TTL_MS = 30 * 60 * 1000 // même fenêtre que le panier normal

export interface SeatHoldCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

class SeatHoldError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

export type CreateSeatHoldResult = ErrResult | { ok: true; hold: SeatHoldDoc & { _id: mongoose.Types.ObjectId }; order: OrderDoc & { _id: mongoose.Types.ObjectId } }

export async function createSeatHold(
  caller: SeatHoldCaller,
  input: { eventId: string; placeId: string; tier: SeatHoldTier },
  rail: 'stripe' | 'fedapay'
): Promise<CreateSeatHoldResult> {
  await getDb()

  const event = await Event.findById(input.eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  if (event.cancelled) return { ok: false, status: 409, error: 'event_cancelled' }
  if (isEventEnded(event)) return { ok: false, status: 409, error: 'event_ended' }

  const place = event.places?.find((p) => p.id === input.placeId)
  if (!place) return { ok: false, status: 404, error: 'place_not_found' }
  if (place.groupType === 'group') return { ok: false, status: 400, error: 'group_place_not_holdable' }
  if (!place.price || place.price <= 0) return { ok: false, status: 400, error: 'free_place_not_holdable' }

  const currency = (event.currency || 'EUR') as 'EUR' | 'XOF'
  const minorPerMajor = currency === 'XOF' ? 1 : 100
  const unitPriceMinor = Math.round(Number(place.price) * minorPerMajor)
  const depositMinor = computeSeatHoldDepositMinor(unitPriceMinor, currency, input.tier)
  const { sellerUid, connectMode } = await resolveSellerSettlementMode({
    sellerUid: event.organizerId || event.createdBy,
    buyerUid: caller.id,
    rail,
  })

  const session = await mongoose.startSession()
  try {
    let createdHold: (SeatHoldDoc & { _id: mongoose.Types.ObjectId }) | null = null
    let createdOrder: (OrderDoc & { _id: mongoose.Types.ObjectId }) | null = null
    await session.withTransaction(async () => {
      const freshEvent = await Event.findById(input.eventId).session(session)
      if (!freshEvent) throw new SeatHoldError(404, 'event_not_found')
      const freshPlace = freshEvent.places?.find((p) => p.id === input.placeId)
      if (!freshPlace) throw new SeatHoldError(404, 'place_not_found')
      if ((freshPlace.available || 0) < 1) throw new SeatHoldError(409, 'insufficient_stock')

      freshPlace.available = (freshPlace.available || 0) - 1
      await freshEvent.save({ session })

      const [holdDoc] = await SeatHold.create(
        [
          {
            eventId: input.eventId,
            placeId: input.placeId,
            placeType: freshPlace.type,
            userId: caller.id,
            tier: input.tier,
            currency,
            unitPriceMinor,
            depositMinor,
            status: 'pending_payment',
          },
        ],
        { session }
      )
      createdHold = holdDoc as SeatHoldDoc & { _id: mongoose.Types.ObjectId }

      const [orderDoc] = await Order.create(
        [
          {
            userId: caller.id,
            eventId: input.eventId,
            placeId: input.placeId,
            placeType: `${freshPlace.type} — Acompte de blocage`,
            qty: 1,
            isTable: false,
            unitPriceMinor: depositMinor,
            currency,
            feeMinor: 0,
            sellerUid,
            connectMode,
            rail,
            status: 'pending',
            kind: 'seat_hold_deposit',
            seatHoldId: String(createdHold._id),
            stockDecremented: true, // le hold a déjà décrémenté — releaseOrder() restockera 1 unité si l'acompte échoue
            expiresAt: new Date(Date.now() + DEPOSIT_ORDER_TTL_MS),
          },
        ],
        { session }
      )
      createdOrder = orderDoc as OrderDoc & { _id: mongoose.Types.ObjectId }

      await SeatHold.updateOne({ _id: createdHold._id }, { $set: { depositOrderId: String(createdOrder._id) } }, { session })
      createdHold.depositOrderId = String(createdOrder._id)
    })
    if (!createdHold || !createdOrder) throw new SeatHoldError(500, 'creation_failed')
    return { ok: true, hold: createdHold, order: createdOrder }
  } catch (err) {
    if (err instanceof SeatHoldError) return { ok: false, status: err.status, error: err.code }
    console.error('[seatHolds] createSeatHold transaction failed:', err)
    return { ok: false, status: 500, error: 'internal_error' }
  } finally {
    await session.endSession()
  }
}

// Appelée depuis le webhook (checkout.session.expired / transaction.canceled)
// quand un Order kind:'seat_hold_deposit' échoue/expire — réutilise le
// releaseOrder générique (restock identique, kind-agnostique) puis marque le
// hold 'expired' (jamais 'pending_payment' indéfiniment).
export async function releaseSeatHoldDepositOrder(orderId: string, releaseOrderFn: (orderId: string, byUserId: string | null) => Promise<{ ok: boolean }>): Promise<{ ok: boolean }> {
  await getDb()
  const order = await Order.findById(orderId).lean()
  if (!order || order.kind !== 'seat_hold_deposit') return { ok: true }

  await releaseOrderFn(orderId, null)

  if (order.seatHoldId) {
    await SeatHold.updateOne({ _id: order.seatHoldId, status: 'pending_payment' }, { $set: { status: 'expired' } })
  }
  return { ok: true }
}

// Appelée depuis le webhook quand un Order kind:'seat_hold_deposit' est payé
// — active le hold (fenêtre de 24h/72h démarre MAINTENANT), aucun stock à
// toucher (déjà décrémenté à la création du hold).
export async function activateSeatHold(orderId: string): Promise<{ ok: boolean; error?: string }> {
  await getDb()
  const order = await Order.findById(orderId)
  if (!order || order.kind !== 'seat_hold_deposit') return { ok: false, error: 'not_a_deposit_order' }
  if (order.status === 'paid' && order.settled) return { ok: true } // idempotent (retry webhook)

  const hold = order.seatHoldId ? await SeatHold.findById(order.seatHoldId) : null
  if (!hold) return { ok: false, error: 'hold_not_found' }

  order.status = 'paid'
  order.paid = true
  await order.save()

  if (hold.status === 'pending_payment') {
    hold.status = 'active'
    hold.activatedAt = new Date()
    hold.expiresAt = new Date(Date.now() + seatHoldDurationMs(hold.tier as SeatHoldTier))
    await hold.save()
  }

  // L'acompte est une partie du prix acquise à l'organisateur. Il doit donc
  // être réglé comme toute commande payée, sans billet à émettre à ce stade.
  await settleOrder(order as OrderDoc & { _id: mongoose.Types.ObjectId })

  return { ok: true }
}

// Appelée depuis le webhook quand l'Order kind:'seat_hold_completion' (solde)
// est payé avec succès (fulfillOrder a déjà miné le billet) — clôture le
// hold, plus rien à faire dessus.
export async function completeSeatHold(seatHoldId: string, completingOrderId: string): Promise<void> {
  await getDb()
  await SeatHold.updateOne({ _id: seatHoldId, status: 'active' }, { $set: { status: 'completed', completingOrderId } })
}

// ─────────────────────── completeSeatHoldOrder (solde) ──────────────────────
// Mirroir de initiateResaleOrder : crée un Order dédié (kind:'seat_hold_completion')
// plutôt que de brancher lib/server/orders.ts::createOrder — le hold n'est PAS
// un achat neuf (aucun stock à décrémenter, prix déjà figé), donc un chemin
// séparé évite d'intriquer cette logique dans createOrder (promo/preorders/
// group-ties/maxPerAccount ne s'appliquent pas ici). fulfillOrder() reste
// néanmoins entièrement réutilisé pour le paiement/mint du billet — seul le
// point d'ENTRÉE (création de l'Order) est spécifique.
//
// unitPriceMinor de l'Order de complétion = prix figé - acompte déjà payé.
// L'acompte reste non remboursable si le client laisse expirer la réservation,
// mais il fait bien partie du prix du billet lorsqu'il finalise son achat.
// C'est la définition du « solde » documentée dans docs/QA_TEST_PLAN.md.
export type CompleteSeatHoldResult = ErrResult | { ok: true; order: OrderDoc & { _id: mongoose.Types.ObjectId } }

export async function completeSeatHoldOrder(caller: SeatHoldCaller, seatHoldId: string, rail: 'stripe' | 'fedapay'): Promise<CompleteSeatHoldResult> {
  await getDb()

  const hold = await SeatHold.findById(seatHoldId)
  if (!hold) return { ok: false, status: 404, error: 'seat_hold_not_found' }
  if (hold.userId !== caller.id) return { ok: false, status: 403, error: 'forbidden' }
  if (hold.status !== 'active') return { ok: false, status: 409, error: 'seat_hold_not_active' }
  if (!hold.expiresAt || Date.now() > hold.expiresAt.getTime()) return { ok: false, status: 409, error: 'seat_hold_expired' }
  if (rail === 'stripe' && hold.currency !== 'EUR') return { ok: false, status: 400, error: 'wrong_rail_for_currency' }
  if (rail === 'fedapay' && hold.currency !== 'XOF') return { ok: false, status: 400, error: 'wrong_rail_for_currency' }

  const balanceMinor = Math.max(0, hold.unitPriceMinor - hold.depositMinor)
  const feeMinor = hold.currency === 'XOF' ? computeTicketFeeXOF(hold.unitPriceMinor, 1) : computeTicketFeeCents(hold.unitPriceMinor, 1)
  const depositOrder = hold.depositOrderId
    ? await Order.findById(hold.depositOrderId).select('sellerUid connectMode').lean()
    : null
  const settlement = depositOrder?.sellerUid
    ? { sellerUid: depositOrder.sellerUid, connectMode: depositOrder.connectMode as 'auto' | 'ledger' | 'none' }
    : await (async () => {
        const event = await Event.findById(hold.eventId).select('organizerId createdBy').lean()
        return resolveSellerSettlementMode({
          sellerUid: event?.organizerId || event?.createdBy,
          buyerUid: caller.id,
          rail,
        })
      })()

  const session = await mongoose.startSession()
  try {
    let created: (OrderDoc & { _id: mongoose.Types.ObjectId }) | null = null
    await session.withTransaction(async () => {
      const freshHold = await SeatHold.findById(seatHoldId).session(session)
      if (!freshHold || freshHold.status !== 'active') throw new SeatHoldError(409, 'seat_hold_not_active')

      const [doc] = await Order.create(
        [
          {
            userId: caller.id,
            eventId: hold.eventId,
            placeId: hold.placeId,
            placeType: hold.placeType,
            qty: 1,
            isTable: false,
            unitPriceMinor: balanceMinor,
            currency: hold.currency,
            feeMinor,
            sellerUid: settlement.sellerUid,
            connectMode: settlement.connectMode,
            rail,
            status: 'pending',
            kind: 'seat_hold_completion',
            completesSeatHoldId: seatHoldId,
            stockDecremented: false, // déjà réservé par le hold lui-même, jamais redécrémenté
            expiresAt: new Date(Date.now() + DEPOSIT_ORDER_TTL_MS),
          },
        ],
        { session }
      )
      created = doc as OrderDoc & { _id: mongoose.Types.ObjectId }
    })
    if (!created) throw new SeatHoldError(500, 'creation_failed')
    return { ok: true, order: created }
  } catch (err) {
    if (err instanceof SeatHoldError) return { ok: false, status: err.status, error: err.code }
    console.error('[seatHolds] completeSeatHoldOrder transaction failed:', err)
    return { ok: false, status: 500, error: 'internal_error' }
  } finally {
    await session.endSession()
  }
}

export interface SeatHoldView {
  id: string
  eventId: string
  placeId: string
  placeType: string
  tier: SeatHoldTier
  currency: string
  unitPriceMinor: number
  depositMinor: number
  balanceDueMinor: number
  status: string
  createdAt: string
  activatedAt: string | null
  expiresAt: string | null
}

function toSeatHoldView(hold: SeatHoldDoc & { _id: mongoose.Types.ObjectId }): SeatHoldView {
  return {
    id: String(hold._id),
    eventId: hold.eventId,
    placeId: hold.placeId,
    placeType: hold.placeType,
    tier: hold.tier as SeatHoldTier,
    currency: hold.currency,
    unitPriceMinor: hold.unitPriceMinor,
    depositMinor: hold.depositMinor,
    balanceDueMinor: Math.max(0, hold.unitPriceMinor - hold.depositMinor),
    status: hold.status,
    createdAt: hold.createdAt.toISOString(),
    activatedAt: hold.activatedAt ? hold.activatedAt.toISOString() : null,
    expiresAt: hold.expiresAt ? hold.expiresAt.toISOString() : null,
  }
}

export async function listMySeatHolds(callerId: string): Promise<SeatHoldView[]> {
  await getDb()
  const holds = await SeatHold.find({ userId: callerId, status: { $in: ['pending_payment', 'active'] } })
    .sort({ createdAt: -1 })
    .lean()
  return holds.map((h) => toSeatHoldView(h as SeatHoldDoc & { _id: mongoose.Types.ObjectId }))
}

// Sweep cron (voir app/api/cron/seat-holds/route.ts) — un hold 'active' dont
// le solde n'a jamais été payé avant expiresAt relâche la place (acompte
// jamais remboursé, décision produit) et ne repasse JAMAIS 'active' ensuite.
export async function releaseExpiredSeatHolds(): Promise<{ released: number }> {
  await getDb()
  const expired = await SeatHold.find({ status: 'active', expiresAt: { $lte: new Date() } }).lean()
  let released = 0
  for (const hold of expired) {
    const session = await mongoose.startSession()
    let releasedThisHold = false
    try {
      await session.withTransaction(async () => {
        const fresh = await SeatHold.findById(hold._id).session(session)
        if (!fresh || fresh.status !== 'active') return
        const event = await Event.findById(fresh.eventId).session(session)
        const place = event?.places?.find((p) => p.id === fresh.placeId)
        if (event && place) {
          place.available = Math.min(place.total || 0, (place.available || 0) + 1)
          await event.save({ session })
        }
        fresh.status = 'expired'
        await fresh.save({ session })
        releasedThisHold = true
      })
      if (releasedThisHold) {
        released += 1
        // Hors transaction (jamais bloquant) — voir lib/server/emails/notify.ts.
        const event = await Event.findById(hold.eventId).select('name').lean()
        await notifyUserById(hold.userId, () => seatHoldExpiredEmail(event?.name || 'cet événement', `${SITE}/events/${encodeURIComponent(hold.eventId)}`, SITE))
      }
    } catch (err) {
      console.error('[seatHolds] releaseExpiredSeatHolds failed for hold', String(hold._id), err)
    } finally {
      await session.endSession()
    }
  }
  return { released }
}

// Rappel "ta place expire bientôt" — fenêtre J-2h (voir
// app/api/cron/seat-hold-reminders/route.ts, tourne plus fréquemment que le
// sweep d'expiration ci-dessus). `reminderSentAt` garantit un seul rappel par
// hold sur toute sa durée de vie, jamais réinitialisé.
const REMINDER_WINDOW_START_MS = 1 * 60 * 60 * 1000 // 1h
const REMINDER_WINDOW_END_MS = 2 * 60 * 60 * 1000 // 2h

export async function sendSeatHoldExpiryReminders(): Promise<{ reminded: number }> {
  await getDb()
  const now = Date.now()
  const holds = await SeatHold.find({
    status: 'active',
    reminderSentAt: null,
    expiresAt: { $gte: new Date(now + REMINDER_WINDOW_START_MS), $lte: new Date(now + REMINDER_WINDOW_END_MS) },
  }).lean()

  let reminded = 0
  for (const hold of holds) {
    const claimed = await SeatHold.updateOne({ _id: hold._id, reminderSentAt: null }, { $set: { reminderSentAt: new Date() } })
    if (claimed.modifiedCount !== 1) continue // déjà réclamé par un autre run concurrent
    const event = await Event.findById(hold.eventId).select('name').lean()
    const hoursLeft = Math.max(1, Math.round((hold.expiresAt!.getTime() - now) / (60 * 60 * 1000)))
    await notifyUserById(hold.userId, () =>
      seatHoldExpiringEmail(event?.name || 'cet événement', `${SITE}/checkout/seat-hold-balance/${String(hold._id)}`, `${hoursLeft}h`, SITE)
    )
    reminded += 1
  }
  return { reminded }
}
