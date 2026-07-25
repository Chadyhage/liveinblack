// Tests d'INTÉGRATION (vraie base MongoDB) pour la demande de remboursement
// déclenchée par le CLIENT (#B, lib/server/clientRefunds.ts) — distincte de
// l'annulation totale organisateur (organizerEventLifecycle.integration.test.ts).
// Stripe est mocké (aucune clé de test dans cet environnement, même
// convention que organizerEventLifecycle.integration.test.ts) ; le chemin
// FedaPay (recordFedapayRefund) ne fait aucun appel réseau — testé pour de vrai.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'

vi.mock('../eventRefunds', () => ({
  refundStripeOrder: vi.fn(async () => ({ ok: true })),
}))

import { requestClientRefund } from '../clientRefunds'
import Event from '../../models/Event'
import Order from '../../models/Order'
import Ticket from '../../models/Ticket'
import EventRefund from '../../models/EventRefund'

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
  await EventRefund.deleteMany({})
  vi.clearAllMocks()
})

async function seedPostponedEvent(overrides: Partial<{ refundWindowClosesAt: Date | null }> = {}) {
  return Event.create({
    name: 'Soirée Test',
    date: '2026-09-01',
    createdBy: 'org-1',
    organizerId: 'org-1',
    currency: 'EUR',
    postponedFrom: { date: '2026-08-01', time: '22:00' },
    refundWindowClosesAt: overrides.refundWindowClosesAt !== undefined ? overrides.refundWindowClosesAt : new Date(Date.now() + 7 * 24 * 3600_000),
  })
}

async function seedPaidOrder(eventId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return Order.create({
    userId: 'buyer-1',
    eventId,
    placeId: 'p1',
    placeType: 'Standard',
    qty: 1,
    unitPriceMinor: 2000,
    currency: 'EUR',
    feeMinor: 149,
    rail: 'stripe',
    status: 'paid',
    paid: true,
    stripeSessionId: 'cs_test_1',
    expiresAt: new Date(Date.now() + 3600_000),
    ...overrides,
  })
}

describeIntegration('clientRefunds (intégration, vraie base) — demande de remboursement client (#B)', () => {
  it('rembourse un billet reporté, dans la fenêtre', async () => {
    const event = await seedPostponedEvent()
    const order = await seedPaidOrder(String(event._id))

    const result = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(result).toEqual({ ok: true, refunded: true })

    const updated = await Order.findById(order._id).lean()
    expect(updated?.clientRefundRequestedAt).not.toBeNull()
    expect(updated?.clientRefundReason).toBe('postponed_declined')
  })

  it('refuse si un événement annulé (déjà remboursé automatiquement ailleurs)', async () => {
    const event = await Event.create({ name: 'Soirée Annulée', date: '2026-09-01', createdBy: 'org-1', organizerId: 'org-1', currency: 'EUR', cancelled: true })
    const order = await seedPaidOrder(String(event._id))

    const result = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(result).toEqual({ ok: false, status: 409, error: 'event_cancelled_auto_refunded' })
  })

  it('refuse si l\'événement n\'est ni annulé ni reporté', async () => {
    const event = await Event.create({ name: 'Soirée Normale', date: '2026-09-01', createdBy: 'org-1', organizerId: 'org-1', currency: 'EUR' })
    const order = await seedPaidOrder(String(event._id))

    const result = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(result).toEqual({ ok: false, status: 409, error: 'not_eligible' })
  })

  it('refuse si la fenêtre de remboursement est dépassée', async () => {
    const event = await seedPostponedEvent({ refundWindowClosesAt: new Date(Date.now() - 3600_000) })
    const order = await seedPaidOrder(String(event._id))

    const result = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(result).toEqual({ ok: false, status: 409, error: 'refund_window_closed' })
  })

  it('refuse si au moins une place du groupe a déjà été scannée', async () => {
    const event = await seedPostponedEvent()
    const order = await seedPaidOrder(String(event._id), { isTable: true, qty: 1, tableSeats: 4 })
    await Ticket.create({ ticketCode: 'T1', orderId: String(order._id), eventId: String(event._id), userId: 'buyer-1', paid: true, checkedInAt: new Date() })

    const result = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(result).toEqual({ ok: false, status: 409, error: 'ticket_already_checked_in' })
  })

  it('rembourse tout le groupe en un seul appel du seul acheteur (order.userId)', async () => {
    const event = await seedPostponedEvent()
    const order = await seedPaidOrder(String(event._id), { isTable: true, qty: 1, tableSeats: 4 })
    await Ticket.create({ ticketCode: 'T1', orderId: String(order._id), eventId: String(event._id), userId: 'buyer-1', hostUid: 'buyer-1', paid: true })
    await Ticket.create({ ticketCode: 'T2', orderId: String(order._id), eventId: String(event._id), userId: 'guest-2', hostUid: 'buyer-1', paid: true })

    const otherGuestAttempt = await requestClientRefund({ id: 'guest-2' }, String(order._id))
    expect(otherGuestAttempt).toEqual({ ok: false, status: 403, error: 'forbidden' })

    const result = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(result).toEqual({ ok: true, refunded: true })
  })

  it('refuse une seconde demande sur le même order', async () => {
    const event = await seedPostponedEvent()
    const order = await seedPaidOrder(String(event._id))

    const first = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(first.ok).toBe(true)

    const second = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(second).toEqual({ ok: false, status: 409, error: 'already_requested' })
  })

  it('refuse si l\'order n\'est pas payé', async () => {
    const event = await seedPostponedEvent()
    const order = await seedPaidOrder(String(event._id), { status: 'pending', paid: false })

    const result = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(result).toEqual({ ok: false, status: 409, error: 'order_not_paid' })
  })

  it("rembourse un order NON reporté si l'assurance-annulation a été achetée (bypasse not_eligible/fenêtre)", async () => {
    const event = await Event.create({ name: 'Soirée Normale', date: '2026-09-01', createdBy: 'org-1', organizerId: 'org-1', currency: 'EUR' })
    const order = await seedPaidOrder(String(event._id), { cancellationProtectionPurchased: true, cancellationProtectionFeeMinor: 200 })

    const result = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(result).toEqual({ ok: true, refunded: true })

    const updated = await Order.findById(order._id).lean()
    expect(updated?.clientRefundReason).toBe('cancellation_protection')
  })

  it("l'assurance-annulation ne couvre PAS un billet déjà scanné", async () => {
    const event = await Event.create({ name: 'Soirée Normale', date: '2026-09-01', createdBy: 'org-1', organizerId: 'org-1', currency: 'EUR' })
    const order = await seedPaidOrder(String(event._id), { cancellationProtectionPurchased: true, cancellationProtectionFeeMinor: 200 })
    await Ticket.create({ ticketCode: 'T1', orderId: String(order._id), eventId: String(event._id), userId: 'buyer-1', paid: true, checkedInAt: new Date() })

    const result = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(result).toEqual({ ok: false, status: 409, error: 'ticket_already_checked_in' })
  })

  it("un order SANS assurance-annulation reste soumis aux conditions habituelles", async () => {
    const event = await Event.create({ name: 'Soirée Normale', date: '2026-09-01', createdBy: 'org-1', organizerId: 'org-1', currency: 'EUR' })
    const order = await seedPaidOrder(String(event._id))

    const result = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(result).toEqual({ ok: false, status: 409, error: 'not_eligible' })
  })

  it('traite réellement le rail FedaPay (recordFedapayRefund, sans mock réseau)', async () => {
    const event = await seedPostponedEvent()
    const order = await seedPaidOrder(String(event._id), { rail: 'fedapay', currency: 'XOF', stripeSessionId: null, fedapayTxnId: 'txn_test_1' })

    const result = await requestClientRefund({ id: 'buyer-1' }, String(order._id))
    expect(result).toEqual({ ok: true, refunded: true })

    const refund = await EventRefund.findOne({ eventId: String(event._id), paymentRef: 'txn_test_1' }).lean()
    expect(refund?.status).toBe('pending_manual')
  })
})
