import mongoose from 'mongoose'
import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import Order, { type OrderDoc } from '../models/Order'
import Ticket from '../models/Ticket'
import User from '../models/User'
import PromoCode from '../models/PromoCode'
import { resolvePromo, promoUnitDiscount } from './promos'
import { findGroupTieForEvent, groupTieBuyMessage } from './groupTicketGuard'
import { computeTicketFeeCents, computeTicketFeeXOF, isStripeConnectCountry } from '../shared/fees'
import { isEventEnded } from '../shared/event-time'

// Réservation de stock SERVEUR-AUTORITAIRE (ferme l'audit C03). Contrairement
// au legacy `api/event-stock.js` (mutation directe de `available`, sans lien
// avec une commande, sans propriétaire, sans expiration), ici :
//   - la décrémentation de stock et la création de l'Order sont ATOMIQUES
//     (une seule transaction Mongo — nécessite un replica set, garanti par
//     Atlas) ;
//   - l'Order a un propriétaire (`userId`) et une expiration (`expiresAt`) ;
//   - relâcher un stock exige d'être propriétaire de l'Order, jamais une clé
//     libre fournie par le client ;
//   - le webhook (jamais le client) est seul à pouvoir marquer un Order `paid`.

const ORDER_TTL_MS = 30 * 60 * 1000 // 30 min pour aller au bout du paiement
const MAX_QTY = 20

export type CreateOrderInput = {
  userId: string
  eventId: string
  placeId: string
  qty: number
  isTable: boolean
  promoCode?: string | null
  preorders?: Array<{ name: string; qty: number }>
  /** 'free' = lib/server/freeCheckout.ts — place gratuite, aucun rail de paiement à choisir (H07/H08 restent appliqués identiquement). */
  rail: 'stripe' | 'fedapay' | 'free'
  /** Le caller (route API) a déjà vérifié le cookie de déverrouillage si l'event est privé. */
  privateAccessVerified?: boolean
}

export type CreateOrderResult =
  | { ok: true; order: OrderDoc & { _id: mongoose.Types.ObjectId } }
  | { ok: false; status: number; error: string }

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  await getDb()

  const event = await Event.findById(input.eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  if (event.cancelled) return { ok: false, status: 409, error: 'event_cancelled' } // H07
  if (isEventEnded(event)) return { ok: false, status: 409, error: 'event_ended' } // H07
  if (event.publishAt && event.publishAt.getTime() > Date.now()) return { ok: false, status: 409, error: 'event_not_published' } // H07
  if (event.isPrivate && !input.privateAccessVerified) return { ok: false, status: 403, error: 'private_event_locked' } // H07

  const place = event.places?.find((p) => p.id === input.placeId)
  if (!place) return { ok: false, status: 404, error: 'place_not_found' }

  const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(Number(input.qty) || 1)))
  const isTable = Boolean(input.isTable)
  if (isTable && !(place.groupType === 'group' && (place.groupMax || 0) >= 2)) {
    return { ok: false, status: 400, error: 'not_a_group_place' }
  }

  // Garde-fou "1 place de groupe par compte et par événement" — AVANT toute
  // décrémentation de stock (même point d'application que le legacy).
  if (isTable) {
    const tie = await findGroupTieForEvent(Ticket, input.eventId, input.userId)
    if (tie) return { ok: false, status: 409, error: groupTieBuyMessage(tie) }
  }

  // maxPerAccount (audit H08 — non appliqué côté serveur dans le legacy).
  // Compte les billets déjà émis ET les commandes en attente non expirées,
  // pour empêcher de contourner la limite avec plusieurs paiements concurrents.
  if (place.maxPerAccount && place.maxPerAccount > 0) {
    const [ticketCount, pendingOrders] = await Promise.all([
      Ticket.countDocuments({ eventId: input.eventId, userId: input.userId, place: place.type, revoked: { $ne: true } }),
      Order.countDocuments({ eventId: input.eventId, userId: input.userId, placeId: input.placeId, status: 'pending', expiresAt: { $gt: new Date() } }),
    ])
    const requestedSeats = isTable ? 1 : qty
    if (ticketCount + pendingOrders + requestedSeats > place.maxPerAccount) {
      return { ok: false, status: 409, error: 'max_per_account_exceeded' }
    }
  }

  const currency = event.currency === 'XOF' ? 'XOF' : 'EUR'
  if (input.rail === 'fedapay' && currency !== 'XOF') return { ok: false, status: 400, error: 'wrong_rail_for_currency' }
  if (input.rail === 'stripe' && currency !== 'EUR') return { ok: false, status: 400, error: 'wrong_rail_for_currency' }
  const minorPerMajor = currency === 'XOF' ? 1 : 100
  let unitPriceMinor = Math.round(Number(place.price) * minorPerMajor)

  // Codes promo — résolus serveur (jamais un montant reçu du client).
  let promoCode: string | null = null
  let promoUses = 0
  let promoUnitDiscountMinor = 0
  if (input.promoCode) {
    const requestedUses = isTable ? 1 : qty
    const promoResult = await resolvePromo(PromoCode, input.eventId, input.promoCode, requestedUses)
    if (!promoResult.ok) return { ok: false, status: 400, error: promoResult.message }
    const discount = promoUnitDiscount(promoResult.promo, unitPriceMinor, minorPerMajor)
    if (discount >= unitPriceMinor) return { ok: false, status: 400, error: 'promo_makes_ticket_free' }
    promoCode = promoResult.promo.code
    promoUses = requestedUses
    promoUnitDiscountMinor = discount
    unitPriceMinor -= discount
  }

  // Précommandes — UNIQUEMENT {name, qty} venant du client ; prix résolu ICI
  // depuis le menu serveur de l'événement (ferme C06/C07).
  const preorders: Array<{ name: string; price: number; qty: number }> = []
  for (const req of input.preorders || []) {
    const menuItem = event.menu?.find((m) => m.name === req.name)
    if (!menuItem) return { ok: false, status: 400, error: `unknown_menu_item:${req.name}` }
    const reqQty = Math.max(0, Math.min(50, Math.floor(Number(req.qty) || 0)))
    if (reqQty > 0) preorders.push({ name: menuItem.name, price: Math.round(Number(menuItem.price) * minorPerMajor), qty: reqQty })
  }

  const feeMinor =
    currency === 'XOF' ? computeTicketFeeXOF(unitPriceMinor, isTable ? 1 : qty) : computeTicketFeeCents(unitPriceMinor, isTable ? 1 : qty)

  // Vendeur / mode de répartition (Stripe Connect vs ledger interne). Le
  // rail FedaPay est toujours 'ledger' (Connect ne couvre pas la zone XOF).
  const sellerUid = event.organizerId || event.createdBy || null
  let connectMode: 'auto' | 'ledger' | 'none' = 'none'
  if (sellerUid && sellerUid !== input.userId) {
    if (input.rail === 'stripe') {
      const seller = await User.findById(sellerUid).select('stripeAccountId stripeChargesEnabled stripeCountry').lean().catch(() => null)
      const eligible = Boolean(seller?.stripeAccountId) && seller?.stripeChargesEnabled === true && isStripeConnectCountry(seller?.stripeCountry)
      connectMode = eligible ? 'auto' : 'ledger'
    } else {
      connectMode = 'ledger'
    }
  }

  const totalRequestedStock = isTable ? 1 : qty

  // Décrémentation de stock + création de l'Order : UNE transaction. Soit les
  // deux réussissent, soit aucune (pas de stock "orphelin" décrémenté sans
  // commande correspondante, pas de commande sans stock réellement retenu).
  const session = await mongoose.startSession()
  try {
    let created: (OrderDoc & { _id: mongoose.Types.ObjectId }) | null = null
    await session.withTransaction(async () => {
      const freshEvent = await Event.findById(input.eventId).session(session)
      if (!freshEvent) throw new OrderError(404, 'event_not_found')
      const freshPlace = freshEvent.places?.find((p) => p.id === input.placeId)
      if (!freshPlace) throw new OrderError(404, 'place_not_found')
      if ((freshPlace.available || 0) < totalRequestedStock) throw new OrderError(409, 'insufficient_stock')

      freshPlace.available = (freshPlace.available || 0) - totalRequestedStock
      await freshEvent.save({ session })

      const [doc] = await Order.create(
        [
          {
            userId: input.userId,
            eventId: input.eventId,
            placeId: input.placeId,
            placeType: freshPlace.type,
            qty,
            isTable,
            tableSeats: isTable ? freshPlace.groupMax : 0,
            unitPriceMinor,
            currency,
            feeMinor,
            promoCode,
            promoUses,
            promoUnitDiscountMinor,
            preorders,
            sellerUid,
            connectMode,
            rail: input.rail,
            status: 'pending',
            stockDecremented: true,
            expiresAt: new Date(Date.now() + ORDER_TTL_MS),
          },
        ],
        { session }
      )
      created = doc as OrderDoc & { _id: mongoose.Types.ObjectId }
    })
    if (!created) throw new OrderError(500, 'order_creation_failed')
    return { ok: true, order: created }
  } catch (err) {
    if (err instanceof OrderError) return { ok: false, status: err.status, error: err.code }
    console.error('[orders] createOrder transaction failed:', err)
    return { ok: false, status: 500, error: 'internal_error' }
  } finally {
    await session.endSession()
  }
}

class OrderError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

// Relâche le stock d'une commande NON payée — réservé au propriétaire (ou au
// mécanisme d'expiration), jamais à une clé libre fournie par le client
// (ferme la partie `release` de l'audit C03).
export async function releaseOrder(orderId: string, byUserId: string | null): Promise<{ ok: boolean; error?: string }> {
  await getDb()
  const session = await mongoose.startSession()
  try {
    let result: { ok: boolean; error?: string } = { ok: true }
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session)
      if (!order) {
        result = { ok: false, error: 'order_not_found' }
        return
      }
      if (byUserId && order.userId !== byUserId) {
        result = { ok: false, error: 'not_owner' }
        return
      }
      if (order.status !== 'pending') {
        result = { ok: true } // déjà payée/expirée/annulée — idempotent, rien à faire
        return
      }
      if (order.stockDecremented) {
        const event = await Event.findById(order.eventId).session(session)
        const place = event?.places?.find((p) => p.id === order.placeId)
        if (event && place) {
          const restock = order.isTable ? 1 : order.qty
          place.available = Math.min(place.total || 0, (place.available || 0) + restock)
          await event.save({ session })
        }
      }
      order.status = 'expired'
      await order.save({ session })
    })
    return result
  } finally {
    await session.endSession()
  }
}

// Marque une commande payée — appelé UNIQUEMENT par les webhooks (jamais par
// une route accessible au client). Idempotent : si déjà payée, no-op.
export async function markOrderPaid(orderId: string): Promise<OrderDoc | null> {
  await getDb()
  const order = await Order.findById(orderId)
  if (!order) return null
  if (order.paid) return order
  order.paid = true
  order.status = 'paid'
  await order.save()
  return order
}
