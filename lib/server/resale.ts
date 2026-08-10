import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import Order, { type OrderDoc } from '../models/Order'
import Ticket from '../models/Ticket'
import ResaleListing, { type ResaleListingDoc } from '../models/ResaleListing'
import SellerBalance from '../models/SellerBalance'
import EventPayout from '../models/EventPayout'
import { computeResaleFeeCents, computeResaleFeeXOF } from '../shared/fees'
import { eventStartMs, isEventEnded } from '../shared/event-time'
import { notifyUserById } from './emails/notify'
import { resaleListingSoldEmail, ticketInvalidatedByResaleEmail, ticketPurchaseConfirmedEmail } from './emails'
import { fmtMoney } from '../shared/money'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

// Bourse de revente officielle (LIVE_IN_BLACK_Systeme_de_revente.docx).
// Principe : le paiement acheteur passe par le MÊME flux à deux temps que
// n'importe quel achat (créer un Order en attente -> rediriger vers
// Stripe/FedaPay -> le webhook finalise), jamais une fonction synchrone —
// voir fulfillResaleOrder, appelée depuis app/api/webhooks/{stripe,fedapay}
// à la place de fulfillOrder quand order.kind === 'resale'.
//
// v1 volontairement restreint (à faire évoluer avec le client) :
//  - une place de groupe n'est revendable que si l'hôte détient encore TOUTES
//    les places lui-même (aucun siège déjà attribué à un ami) — évite le cas
//    ambigu "un ami perd son siège suite à la revente déclenchée par l'hôte".
//  - pas de liste d'attente (hors périmètre v1, cf. plan).
//  - anti-fraude minimal : vendeur != acheteur, max 2 reventes par admission.

const MAX_RESALES_PER_ADMISSION = 2
const CLOSES_BEFORE_DOORS_MS = 2 * 60 * 60 * 1000
const RESALE_ORDER_TTL_MS = 30 * 60 * 1000

export interface ResaleCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

class ResaleError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

function minorPerMajor(currency: string): number {
  return currency === 'XOF' ? 1 : 100
}

function rotateQr(ticket: { seatVersion?: number | null; entryNonce?: string | null }) {
  ticket.seatVersion = (ticket.seatVersion ?? 0) + 1
  ticket.entryNonce = crypto.randomBytes(12).toString('hex')
}

// ─────────────────────────── listTicketForResale ───────────────────────────

export type ListResaleResult = ErrResult | { ok: true; listing: ResaleListingDoc & { _id: mongoose.Types.ObjectId } }

export async function listTicketForResale(caller: ResaleCaller, ticketCode: string, resalePriceMajor: number): Promise<ListResaleResult> {
  await getDb()

  const code = ticketCode?.trim().toUpperCase()
  if (!code) return { ok: false, status: 400, error: 'invalid_ticket_code' }

  const ticket = await Ticket.findOne({ ticketCode: code })
  if (!ticket) return { ok: false, status: 404, error: 'ticket_not_found' }
  if (ticket.userId !== caller.id) return { ok: false, status: 403, error: 'forbidden' }
  if (ticket.revoked) return { ok: false, status: 409, error: 'ticket_revoked' }
  if (ticket.checkedInAt) return { ok: false, status: 409, error: 'ticket_already_checked_in' }
  if (ticket.resaleListingId) return { ok: false, status: 409, error: 'already_listed' }
  if (ticket.source !== 'paid' && !ticket.source?.startsWith('stripe') && !ticket.source?.startsWith('fedapay')) {
    // Exclut explicitement 'guestlist'/'agent_*'/'free' — jamais revendables.
    return { ok: false, status: 409, error: 'not_resellable_source' }
  }
  if ((ticket.resaleCount ?? 0) >= MAX_RESALES_PER_ADMISSION) return { ok: false, status: 409, error: 'resale_limit_reached' }

  const event = await Event.findById(ticket.eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  if (event.cancelled) return { ok: false, status: 409, error: 'event_cancelled' }
  if (isEventEnded(event)) return { ok: false, status: 409, error: 'event_ended' }

  const closesAt = new Date(eventStartMs(event) - CLOSES_BEFORE_DOORS_MS)
  if (Date.now() >= closesAt.getTime()) return { ok: false, status: 409, error: 'resale_window_closed' }

  const currency = (ticket.currency || event.currency || 'EUR') as 'EUR' | 'XOF'
  const mpm = minorPerMajor(currency)
  const resalePriceMinor = Math.round(Number(resalePriceMajor) * mpm)
  const originalPriceMinor = Math.round(Number(ticket.placePrice || 0) * mpm)
  if (resalePriceMinor <= 0) return { ok: false, status: 400, error: 'invalid_price' }
  if (resalePriceMinor > originalPriceMinor) return { ok: false, status: 400, error: 'price_above_original' }

  const feeMinor = currency === 'XOF' ? computeResaleFeeXOF(resalePriceMinor) : computeResaleFeeCents(resalePriceMinor)
  const sellerNetMinor = resalePriceMinor - feeMinor

  const isGroup = Boolean(ticket.tableId)
  let groupTicketCodes: string[] = [code]
  if (isGroup) {
    if (ticket.hostUid !== caller.id) return { ok: false, status: 403, error: 'not_group_host' }
    const seats = await Ticket.find({ tableId: ticket.tableId, revoked: { $ne: true } }).lean()
    if (seats.some((s) => s.userId !== caller.id || s.checkedInAt || s.resaleListingId)) {
      return { ok: false, status: 409, error: 'group_not_fully_held_by_host' }
    }
    groupTicketCodes = seats.map((s) => s.ticketCode)
  }

  const session = await mongoose.startSession()
  try {
    let listing: (ResaleListingDoc & { _id: mongoose.Types.ObjectId }) | null = null
    await session.withTransaction(async () => {
      const [created] = await ResaleListing.create(
        [
          {
            ticketCode: code,
            eventId: ticket.eventId,
            sellerUid: caller.id,
            resalePriceMinor,
            currency,
            feeMinor,
            sellerNetMinor,
            closesAt,
            isGroupListing: isGroup,
            tableId: isGroup ? ticket.tableId : null,
          },
        ],
        { session }
      )
      listing = created as ResaleListingDoc & { _id: mongoose.Types.ObjectId }

      const tickets = await Ticket.find({ ticketCode: { $in: groupTicketCodes } }).session(session)
      for (const t of tickets) {
        rotateQr(t)
        t.resaleListingId = String(listing!._id)
        await t.save({ session })
      }
    })
    if (!listing) throw new ResaleError(500, 'listing_creation_failed')
    return { ok: true, listing }
  } catch (err) {
    if (err instanceof ResaleError) return { ok: false, status: err.status, error: err.code }
    console.error('[resale] listTicketForResale transaction failed:', err)
    return { ok: false, status: 500, error: 'internal_error' }
  } finally {
    await session.endSession()
  }
}

// ─────────────────────────── withdrawResaleListing ──────────────────────────

export type WithdrawResaleResult = ErrResult | { ok: true }

export async function withdrawResaleListing(caller: ResaleCaller, listingId: string): Promise<WithdrawResaleResult> {
  await getDb()

  const listing = await ResaleListing.findById(listingId)
  if (!listing) return { ok: false, status: 404, error: 'listing_not_found' }
  if (listing.sellerUid !== caller.id) return { ok: false, status: 403, error: 'forbidden' }
  if (listing.status !== 'active') return { ok: false, status: 409, error: 'not_active' }

  const groupTicketCodes = listing.isGroupListing
    ? (await Ticket.find({ tableId: listing.tableId }).select('ticketCode').lean()).map((t) => t.ticketCode)
    : [listing.ticketCode]

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const fresh = await ResaleListing.findById(listingId).session(session)
      if (!fresh || fresh.status !== 'active') throw new ResaleError(409, 'not_active')
      fresh.status = 'withdrawn'
      await fresh.save({ session })

      // Nouveau QR pour le vendeur — jamais réactiver l'ancien (règle non
      // négociable de la spec), même mécanique qu'à la mise en vente.
      const tickets = await Ticket.find({ ticketCode: { $in: groupTicketCodes } }).session(session)
      for (const t of tickets) {
        rotateQr(t)
        t.resaleListingId = null
        await t.save({ session })
      }
    })
    return { ok: true }
  } catch (err) {
    if (err instanceof ResaleError) return { ok: false, status: err.status, error: err.code }
    console.error('[resale] withdrawResaleListing transaction failed:', err)
    return { ok: false, status: 500, error: 'internal_error' }
  } finally {
    await session.endSession()
  }
}

// ─────────────────────────── initiateResaleOrder ────────────────────────────
// Appelée par les routes de checkout dédiées (app/api/checkout/resale,
// app/api/checkout/resale/fedapay — à construire) au lieu de
// lib/server/orders.ts::createOrder (aucun stock à décrémenter ici).

export type InitiateResaleResult = ErrResult | { ok: true; order: OrderDoc & { _id: mongoose.Types.ObjectId } }

export async function initiateResaleOrder(
  buyerCaller: ResaleCaller,
  listingId: string,
  rail: 'stripe' | 'fedapay'
): Promise<InitiateResaleResult> {
  await getDb()

  const listing = await ResaleListing.findById(listingId)
  if (!listing) return { ok: false, status: 404, error: 'listing_not_found' }
  if (listing.status !== 'active') return { ok: false, status: 409, error: 'not_active' }
  if (listing.sellerUid === buyerCaller.id) return { ok: false, status: 409, error: 'cannot_buy_own_listing' }
  if (Date.now() >= listing.closesAt.getTime()) return { ok: false, status: 409, error: 'resale_window_closed' }
  if (rail === 'stripe' && listing.currency !== 'EUR') return { ok: false, status: 400, error: 'wrong_rail_for_currency' }
  if (rail === 'fedapay' && listing.currency !== 'XOF') return { ok: false, status: 400, error: 'wrong_rail_for_currency' }

  const ticket = await Ticket.findOne({ ticketCode: listing.ticketCode }).lean()
  if (!ticket) return { ok: false, status: 404, error: 'ticket_not_found' }

  const session = await mongoose.startSession()
  try {
    let created: (OrderDoc & { _id: mongoose.Types.ObjectId }) | null = null
    await session.withTransaction(async () => {
      const freshListing = await ResaleListing.findById(listingId).session(session)
      if (!freshListing || freshListing.status !== 'active') throw new ResaleError(409, 'not_active')

      const [doc] = await Order.create(
        [
          {
            userId: buyerCaller.id,
            eventId: listing.eventId,
            placeId: 'resale',
            placeType: ticket.place || 'Revente',
            qty: 1,
            isTable: listing.isGroupListing,
            tableSeats: 0,
            unitPriceMinor: listing.resalePriceMinor,
            currency: listing.currency,
            feeMinor: listing.feeMinor,
            sellerUid: listing.sellerUid,
            connectMode: 'ledger', // vendeur = un client, jamais éligible Stripe Connect ici
            rail,
            status: 'pending',
            kind: 'resale',
            resaleListingId: listingId,
            stockDecremented: false,
            expiresAt: new Date(Date.now() + RESALE_ORDER_TTL_MS),
          },
        ],
        { session }
      )
      created = doc as OrderDoc & { _id: mongoose.Types.ObjectId }

      freshListing.status = 'reserved'
      freshListing.resaleOrderId = String(created._id)
      await freshListing.save({ session })
    })
    if (!created) throw new ResaleError(500, 'order_creation_failed')
    return { ok: true, order: created }
  } catch (err) {
    if (err instanceof ResaleError) return { ok: false, status: err.status, error: err.code }
    console.error('[resale] initiateResaleOrder transaction failed:', err)
    return { ok: false, status: 500, error: 'internal_error' }
  } finally {
    await session.endSession()
  }
}

// ─────────────────────────── releaseResaleOrder ─────────────────────────────
// Miroir de lib/server/orders.ts::releaseOrder — appelée sur expiration/échec
// du paiement (checkout.session.expired, transaction.canceled/declined) pour
// rendre le listing disponible à nouveau.

export async function releaseResaleOrder(orderId: string): Promise<{ ok: boolean }> {
  await getDb()
  const order = await Order.findById(orderId)
  if (!order || order.kind !== 'resale' || order.status !== 'pending') return { ok: true }

  order.status = 'expired'
  await order.save()

  if (order.resaleListingId) {
    await ResaleListing.updateOne(
      { _id: order.resaleListingId, status: 'reserved', resaleOrderId: orderId },
      { $set: { status: 'active', resaleOrderId: null } }
    )
  }
  return { ok: true }
}

// ─────────────────────────── fulfillResaleOrder ─────────────────────────────
// Appelée depuis les webhooks Stripe/FedaPay à la place de fulfillOrder quand
// order.kind === 'resale'. Ne mint AUCUN nouveau billet (contrairement à
// fulfillOrder) : mute le(s) billet(s) existant(s) — rotation QR + nouveau
// titulaire — et crédite le vendeur (SellerBalance, même ledger que tout le
// monde, cf. lib/server/organizerPayouts.ts qui est déjà générique par uid).

export type FulfillResaleResult =
  | { status: 'already_processed' }
  | { status: 'order_not_found' }
  | { status: 'listing_not_found' }
  | { status: 'not_reserved' }
  | { status: 'amount_mismatch' }
  | { status: 'ok'; ticketCodes: string[] }

export async function fulfillResaleOrder(orderId: string, opts: { paidAmountMinor?: number } = {}): Promise<FulfillResaleResult> {
  await getDb()

  const order = await Order.findById(orderId)
  if (!order || order.kind !== 'resale') return { status: 'order_not_found' }
  if (order.paid) return { status: 'already_processed' }
  if (!order.resaleListingId) return { status: 'listing_not_found' }

  // FedaPay uniquement (pas d'équivalent Stripe — la session n'est pas
  // falsifiable après création) : le montant réellement payé doit
  // correspondre EXACTEMENT au prix de revente + commission attendus.
  if (opts.paidAmountMinor !== undefined && opts.paidAmountMinor !== order.unitPriceMinor + order.feeMinor) {
    return { status: 'amount_mismatch' }
  }

  const listing = await ResaleListing.findById(order.resaleListingId)
  if (!listing) return { status: 'listing_not_found' }
  if (listing.status === 'sold') return { status: 'already_processed' }
  if (listing.status !== 'reserved') return { status: 'not_reserved' }

  const groupTicketCodes = listing.isGroupListing
    ? (await Ticket.find({ tableId: listing.tableId }).select('ticketCode').lean()).map((t) => t.ticketCode)
    : [listing.ticketCode]

  const session = await mongoose.startSession()
  const ticketCodes: string[] = []
  try {
    // Anciens titulaires capturés AVANT rotation (t.userId est écrasé dans la
    // boucle ci-dessous) — pour l'email E11 (ticketInvalidatedByResaleEmail),
    // envoyé une fois par ancien titulaire distinct après la transaction.
    const previousHolderUserIds = new Set<string>()
    await session.withTransaction(async () => {
      const tickets = await Ticket.find({ ticketCode: { $in: groupTicketCodes } }).session(session)
      const previousOrderIds = new Set(tickets.map((t) => t.orderId).filter((id): id is string => Boolean(id)))
      for (const t of tickets) {
        if (t.userId && t.userId !== order.userId) previousHolderUserIds.add(t.userId)
      }

      for (const t of tickets) {
        rotateQr(t) // tue le QR de l'ancien détenteur — même billet, jamais un nouveau ticketCode
        t.userId = order.userId
        t.hostUid = listing.isGroupListing ? order.userId : t.hostUid
        t.assignedTo = null
        t.assignedName = null
        t.assignedAt = null
        t.resaleListingId = null
        t.resaleCount = (t.resaleCount ?? 0) + 1
        t.orderId = String(order._id)
        await t.save({ session })
        ticketCodes.push(t.ticketCode)
      }

      // Les commandes d'origine (achat initial ou revente précédente) de ces
      // billets ne doivent plus jamais être remboursées en cas d'annulation —
      // seule CETTE commande (le dernier payeur réel) doit l'être.
      if (previousOrderIds.size) {
        await Order.updateMany({ _id: { $in: [...previousOrderIds] }, status: 'paid' }, { $set: { status: 'superseded' } }, { session })
      }

      if (listing.sellerNetMinor > 0) {
        const field = listing.currency === 'XOF' ? 'amountDueXOF' : 'amountDueCents'
        await SellerBalance.updateOne({ sellerUid: listing.sellerUid }, { $inc: { [field]: listing.sellerNetMinor } }, { session, upsert: true })
        if (listing.currency === 'XOF') {
          const event = await Event.findById(listing.eventId).session(session)
          await EventPayout.updateOne(
            { eventId: listing.eventId },
            { $inc: { amountDueXOF: listing.sellerNetMinor }, $setOnInsert: { sellerUid: listing.sellerUid, status: 'accumulating' }, $set: { momoCountry: event?.region ? momoCountryForRegion(event.region) : null } },
            { session, upsert: true }
          )
        }
      }

      listing.status = 'sold'
      listing.buyerUid = order.userId
      listing.soldAt = new Date()
      await listing.save({ session })

      order.paid = true
      order.status = 'paid'
      order.settled = true
      await order.save({ session })
    })

    // Emails best-effort, hors transaction (jamais bloquants) — voir
    // lib/server/emails/notify.ts.
    const event = await Event.findById(listing.eventId).select('name').lean()
    const eventName = event?.name || 'ton événement'
    if (listing.sellerNetMinor > 0) {
      await notifyUserById(listing.sellerUid, () =>
        resaleListingSoldEmail(eventName, fmtMoney(listing.sellerNetMinor / (listing.currency === 'XOF' ? 1 : 100), listing.currency), 'quelques jours après l’événement', SITE)
      )
    }
    for (const previousUserId of previousHolderUserIds) {
      await notifyUserById(previousUserId, () => ticketInvalidatedByResaleEmail(eventName, SITE))
    }
    // E14 (proposition) : l'achat d'un billet de revente reçoit la même
    // confirmation qu'un achat normal (E1), ce parcours ne passant jamais par
    // fulfillOrder.ts.
    await notifyUserById(order.userId, () =>
      ticketPurchaseConfirmedEmail(
        { eventId: listing.eventId, eventName, eventWhen: null, eventWhere: null, placeLabel: 'Revente officielle', quantity: ticketCodes.length, totalLabel: fmtMoney((order.unitPriceMinor + order.feeMinor) / (order.currency === 'XOF' ? 1 : 100), order.currency), ticketUrl: `${SITE}/profile/billets` },
        SITE
      )
    )

    return { status: 'ok', ticketCodes }
  } finally {
    await session.endSession()
  }
}

// ─────────────────────── getActiveResaleListingsForEvent ────────────────────
// Lecture PUBLIQUE (page événement) — jamais l'identité du vendeur (spec :
// "l'identité du vendeur n'est jamais communiquée à l'acheteur").

export interface PublicResaleListingView {
  id: string
  place: string
  resalePriceMinor: number
  currency: string
  isGroupListing: boolean
  seatCount: number
}

export async function getActiveResaleListingsForEvent(eventId: string): Promise<PublicResaleListingView[]> {
  await getDb()
  const listings = await ResaleListing.find({ eventId, status: 'active' }).sort({ listedAt: 1 }).lean()
  if (listings.length === 0) return []

  const ticketCodes = listings.map((l) => l.ticketCode)
  const tickets = await Ticket.find({ ticketCode: { $in: ticketCodes } }).select('ticketCode place tableId').lean()
  const ticketByCode = new Map(tickets.map((t) => [t.ticketCode, t]))

  const groupSizes = new Map<string, number>()
  for (const l of listings) {
    if (!l.isGroupListing || !l.tableId) continue
    if (!groupSizes.has(l.tableId)) {
      const count = await Ticket.countDocuments({ tableId: l.tableId })
      groupSizes.set(l.tableId, count)
    }
  }

  return listings.map((l) => ({
    id: String(l._id),
    place: ticketByCode.get(l.ticketCode)?.place || '',
    resalePriceMinor: l.resalePriceMinor,
    currency: l.currency,
    isGroupListing: l.isGroupListing,
    seatCount: l.isGroupListing && l.tableId ? groupSizes.get(l.tableId) || 1 : 1,
  }))
}

// Mapping minimal région -> code pays FedaPay, même logique que
// lib/server/fulfillOrder.ts::momoCountryForEvent (dupliqué ici car non
// exporté depuis ce fichier — à factoriser si un 3e appelant apparaît).
function momoCountryForRegion(region: string): string | null {
  const key = region.trim().toLowerCase()
  const map: Record<string, string> = { togo: 'tg', 'bénin': 'bj', benin: 'bj', 'côte d’ivoire': 'ci', senegal: 'sn', 'sénégal': 'sn' }
  return map[key] || null
}
