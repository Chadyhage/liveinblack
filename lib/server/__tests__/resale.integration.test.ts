// Tests d'INTÉGRATION (vraie base MongoDB) pour la bourse de revente
// officielle (#A, lib/server/resale.ts) — couvre la mise en vente, le retrait,
// et surtout la FINALISATION webhook (fulfillResaleOrder), le cœur de
// l'intégration demandée : rotation QR, réattribution, crédit vendeur,
// commande d'origine passée en 'superseded'.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'

import { listTicketForResale, withdrawResaleListing, initiateResaleOrder, fulfillResaleOrder, releaseResaleOrder } from '../resale'
import Event from '../../models/Event'
import Order from '../../models/Order'
import Ticket from '../../models/Ticket'
import ResaleListing from '../../models/ResaleListing'
import SellerBalance from '../../models/SellerBalance'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

beforeAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connect(TEST_URI)
}, 20000)

afterAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

beforeEach(async () => {
  if (!RUN_INTEGRATION) return
  await Event.deleteMany({})
  await Order.deleteMany({})
  await Ticket.deleteMany({})
  await ResaleListing.deleteMany({})
  await SellerBalance.deleteMany({})
})

async function seedEvent(overrides: Partial<Record<string, unknown>> = {}) {
  const inTenDays = new Date(Date.now() + 10 * 24 * 3600_000)
  return Event.create({
    name: 'Soirée Test',
    date: inTenDays.toISOString().slice(0, 10),
    time: '23:00',
    createdBy: 'org-1',
    organizerId: 'org-1',
    currency: 'EUR',
    ...overrides,
  })
}

async function seedOriginalOrder(eventId: string, sellerUid = 'org-1') {
  return Order.create({
    userId: 'seller-1',
    eventId,
    placeId: 'p1',
    placeType: 'Standard',
    qty: 1,
    unitPriceMinor: 2000,
    currency: 'EUR',
    feeMinor: 149,
    sellerUid,
    connectMode: 'ledger',
    rail: 'stripe',
    status: 'paid',
    paid: true,
    settled: true,
    stripeSessionId: 'cs_original_1',
    expiresAt: new Date(Date.now() + 3600_000),
  })
}

async function seedTicket(eventId: string, orderId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return Ticket.create({
    ticketCode: 'RESALE01',
    orderId,
    eventId,
    place: 'Standard',
    placePrice: 20, // majeur (EUR) — prix initial du billet
    totalPrice: 20,
    currency: 'EUR',
    userId: 'seller-1',
    paid: true,
    source: 'paid',
    ...overrides,
  })
}

describeIntegration('resale (intégration, vraie base) — bourse de revente officielle (#A)', () => {
  describe('listTicketForResale', () => {
    it('met en vente un billet éligible, tue son QR (rotation)', async () => {
      const event = await seedEvent()
      const order = await seedOriginalOrder(String(event._id))
      const ticket = await seedTicket(String(event._id), String(order._id))
      const before = { seatVersion: ticket.seatVersion, entryNonce: ticket.entryNonce }

      const result = await listTicketForResale({ id: 'seller-1' }, 'RESALE01', 15)
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.listing.resalePriceMinor).toBe(1500)
      expect(result.listing.feeMinor).toBeGreaterThan(0)
      expect(result.listing.sellerNetMinor).toBe(1500 - result.listing.feeMinor)

      const updatedTicket = await Ticket.findOne({ ticketCode: 'RESALE01' }).lean()
      expect(updatedTicket?.resaleListingId).toBe(String(result.listing._id))
      expect(updatedTicket?.seatVersion).not.toBe(before.seatVersion)
      expect(updatedTicket?.entryNonce).not.toBe(before.entryNonce)
    })

    it('refuse un prix de revente supérieur au prix initial', async () => {
      const event = await seedEvent()
      const order = await seedOriginalOrder(String(event._id))
      await seedTicket(String(event._id), String(order._id))

      const result = await listTicketForResale({ id: 'seller-1' }, 'RESALE01', 25)
      expect(result).toEqual({ ok: false, status: 400, error: 'price_above_original' })
    })

    it('refuse un billet gratuit/invitation (source guestlist)', async () => {
      const event = await seedEvent()
      const order = await seedOriginalOrder(String(event._id))
      await seedTicket(String(event._id), String(order._id), { source: 'guestlist', paid: false })

      const result = await listTicketForResale({ id: 'seller-1' }, 'RESALE01', 10)
      expect(result).toEqual({ ok: false, status: 409, error: 'not_resellable_source' })
    })

    it('refuse un billet déjà scanné', async () => {
      const event = await seedEvent()
      const order = await seedOriginalOrder(String(event._id))
      await seedTicket(String(event._id), String(order._id), { checkedInAt: new Date() })

      const result = await listTicketForResale({ id: 'seller-1' }, 'RESALE01', 10)
      expect(result).toEqual({ ok: false, status: 409, error: 'ticket_already_checked_in' })
    })
  })

  describe('withdrawResaleListing', () => {
    it('retire une mise en vente et émet un nouveau QR (jamais l\'ancien)', async () => {
      const event = await seedEvent()
      const order = await seedOriginalOrder(String(event._id))
      await seedTicket(String(event._id), String(order._id))
      const listResult = await listTicketForResale({ id: 'seller-1' }, 'RESALE01', 15)
      if (!listResult.ok) throw new Error('setup failed')
      const afterListing = await Ticket.findOne({ ticketCode: 'RESALE01' }).lean()

      const result = await withdrawResaleListing({ id: 'seller-1' }, String(listResult.listing._id))
      expect(result).toEqual({ ok: true })

      const finalTicket = await Ticket.findOne({ ticketCode: 'RESALE01' }).lean()
      expect(finalTicket?.resaleListingId).toBeNull()
      expect(finalTicket?.seatVersion).not.toBe(afterListing?.seatVersion)
      expect(finalTicket?.entryNonce).not.toBe(afterListing?.entryNonce)

      const listing = await ResaleListing.findById(listResult.listing._id).lean()
      expect(listing?.status).toBe('withdrawn')
    })

    it('refuse si l\'appelant n\'est pas le vendeur', async () => {
      const event = await seedEvent()
      const order = await seedOriginalOrder(String(event._id))
      await seedTicket(String(event._id), String(order._id))
      const listResult = await listTicketForResale({ id: 'seller-1' }, 'RESALE01', 15)
      if (!listResult.ok) throw new Error('setup failed')

      const result = await withdrawResaleListing({ id: 'someone-else' }, String(listResult.listing._id))
      expect(result).toEqual({ ok: false, status: 403, error: 'forbidden' })
    })
  })

  describe('initiateResaleOrder + fulfillResaleOrder (finalisation webhook)', () => {
    it('finalise un achat de revente : réattribue le billet, crédite le vendeur, marque la commande d\'origine superseded', async () => {
      const event = await seedEvent()
      const originalOrder = await seedOriginalOrder(String(event._id))
      await seedTicket(String(event._id), String(originalOrder._id))
      const listResult = await listTicketForResale({ id: 'seller-1' }, 'RESALE01', 15)
      if (!listResult.ok) throw new Error('setup failed')
      const listingId = String(listResult.listing._id)

      const initResult = await initiateResaleOrder({ id: 'buyer-1' }, listingId, 'stripe')
      expect(initResult.ok).toBe(true)
      if (!initResult.ok) return
      const resaleOrderId = String(initResult.order._id)

      const listingAfterInit = await ResaleListing.findById(listingId).lean()
      expect(listingAfterInit?.status).toBe('reserved')

      const fulfillResult = await fulfillResaleOrder(resaleOrderId)
      expect(fulfillResult).toEqual({ status: 'ok', ticketCodes: ['RESALE01'] })

      const ticket = await Ticket.findOne({ ticketCode: 'RESALE01' }).lean()
      expect(ticket?.userId).toBe('buyer-1')
      expect(ticket?.resaleListingId).toBeNull()
      expect(ticket?.resaleCount).toBe(1)
      expect(ticket?.orderId).toBe(resaleOrderId)

      const listing = await ResaleListing.findById(listingId).lean()
      expect(listing?.status).toBe('sold')
      expect(listing?.buyerUid).toBe('buyer-1')

      const balance = await SellerBalance.findOne({ sellerUid: 'seller-1' }).lean()
      expect(balance?.amountDueCents).toBe(listResult.listing.sellerNetMinor)

      const updatedOriginalOrder = await Order.findById(originalOrder._id).lean()
      expect(updatedOriginalOrder?.status).toBe('superseded')

      const resaleOrder = await Order.findById(resaleOrderId).lean()
      expect(resaleOrder?.status).toBe('paid')
      expect(resaleOrder?.paid).toBe(true)
    })

    it('refuse d\'acheter sa propre mise en vente', async () => {
      const event = await seedEvent()
      const order = await seedOriginalOrder(String(event._id))
      await seedTicket(String(event._id), String(order._id))
      const listResult = await listTicketForResale({ id: 'seller-1' }, 'RESALE01', 15)
      if (!listResult.ok) throw new Error('setup failed')

      const result = await initiateResaleOrder({ id: 'seller-1' }, String(listResult.listing._id), 'stripe')
      expect(result).toEqual({ ok: false, status: 409, error: 'cannot_buy_own_listing' })
    })

    it('rejette un second achat concurrent une fois le listing réservé', async () => {
      const event = await seedEvent()
      const order = await seedOriginalOrder(String(event._id))
      await seedTicket(String(event._id), String(order._id))
      const listResult = await listTicketForResale({ id: 'seller-1' }, 'RESALE01', 15)
      if (!listResult.ok) throw new Error('setup failed')
      const listingId = String(listResult.listing._id)

      await initiateResaleOrder({ id: 'buyer-1' }, listingId, 'stripe')
      const second = await initiateResaleOrder({ id: 'buyer-2' }, listingId, 'stripe')
      expect(second).toEqual({ ok: false, status: 409, error: 'not_active' })
    })

    it('libère le listing si la commande de revente expire/échoue (releaseResaleOrder)', async () => {
      const event = await seedEvent()
      const order = await seedOriginalOrder(String(event._id))
      await seedTicket(String(event._id), String(order._id))
      const listResult = await listTicketForResale({ id: 'seller-1' }, 'RESALE01', 15)
      if (!listResult.ok) throw new Error('setup failed')
      const listingId = String(listResult.listing._id)

      const initResult = await initiateResaleOrder({ id: 'buyer-1' }, listingId, 'stripe')
      if (!initResult.ok) throw new Error('setup failed')

      await releaseResaleOrder(String(initResult.order._id))

      const listing = await ResaleListing.findById(listingId).lean()
      expect(listing?.status).toBe('active')
      expect(listing?.resaleOrderId).toBeNull()

      // Un nouvel acheteur peut désormais initier un achat.
      const retry = await initiateResaleOrder({ id: 'buyer-2' }, listingId, 'stripe')
      expect(retry.ok).toBe(true)
    })

    it('rejette un montant FedaPay qui ne correspond pas au prix de revente + commission', async () => {
      const event = await seedEvent({ currency: 'XOF' })
      const order = await seedOriginalOrder(String(event._id), 'org-1')
      await Order.updateOne({ _id: order._id }, { $set: { currency: 'XOF', rail: 'fedapay', fedapayTxnId: 'txn_original_1', stripeSessionId: null } })
      await seedTicket(String(event._id), String(order._id), { currency: 'XOF', placePrice: 5000, totalPrice: 5000 })
      const listResult = await listTicketForResale({ id: 'seller-1' }, 'RESALE01', 3000)
      if (!listResult.ok) throw new Error('setup failed')

      const initResult = await initiateResaleOrder({ id: 'buyer-1' }, String(listResult.listing._id), 'fedapay')
      if (!initResult.ok) throw new Error('setup failed')

      const wrongAmount = await fulfillResaleOrder(String(initResult.order._id), { paidAmountMinor: 1 })
      expect(wrongAmount).toEqual({ status: 'amount_mismatch' })
    })
  })

  describe('place de groupe', () => {
    it('revend toutes les admissions du groupe ensemble', async () => {
      const event = await seedEvent()
      const order = await seedOriginalOrder(String(event._id))
      await Ticket.create([
        { ticketCode: 'GRP01', orderId: String(order._id), eventId: String(event._id), place: 'Table', placePrice: 100, totalPrice: 100, currency: 'EUR', userId: 'seller-1', hostUid: 'seller-1', tableId: 'tbl-1', paid: true, source: 'paid' },
        { ticketCode: 'GRP02', orderId: String(order._id), eventId: String(event._id), place: 'Table', placePrice: 100, totalPrice: 100, currency: 'EUR', userId: 'seller-1', hostUid: 'seller-1', tableId: 'tbl-1', paid: true, source: 'paid' },
      ])

      const listResult = await listTicketForResale({ id: 'seller-1' }, 'GRP01', 80)
      expect(listResult.ok).toBe(true)
      if (!listResult.ok) return
      expect(listResult.listing.isGroupListing).toBe(true)

      const initResult = await initiateResaleOrder({ id: 'buyer-1' }, String(listResult.listing._id), 'stripe')
      if (!initResult.ok) throw new Error('setup failed')
      const fulfillResult = await fulfillResaleOrder(String(initResult.order._id))
      expect(fulfillResult.status).toBe('ok')
      if (fulfillResult.status !== 'ok') return
      expect(fulfillResult.ticketCodes.sort()).toEqual(['GRP01', 'GRP02'])

      const seats = await Ticket.find({ tableId: 'tbl-1' }).lean()
      expect(seats.every((s) => s.userId === 'buyer-1' && s.hostUid === 'buyer-1')).toBe(true)
    })

    it('refuse si un siège du groupe est déjà attribué à quelqu\'un d\'autre', async () => {
      const event = await seedEvent()
      const order = await seedOriginalOrder(String(event._id))
      await Ticket.create([
        { ticketCode: 'GRP01', orderId: String(order._id), eventId: String(event._id), place: 'Table', placePrice: 100, totalPrice: 100, currency: 'EUR', userId: 'seller-1', hostUid: 'seller-1', tableId: 'tbl-1', paid: true, source: 'paid' },
        { ticketCode: 'GRP02', orderId: String(order._id), eventId: String(event._id), place: 'Table', placePrice: 100, totalPrice: 100, currency: 'EUR', userId: 'friend-1', hostUid: 'seller-1', tableId: 'tbl-1', paid: true, source: 'paid' },
      ])

      const result = await listTicketForResale({ id: 'seller-1' }, 'GRP01', 80)
      expect(result).toEqual({ ok: false, status: 409, error: 'group_not_fully_held_by_host' })
    })
  })
})
