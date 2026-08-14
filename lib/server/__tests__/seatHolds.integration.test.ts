// Tests d'INTÉGRATION (vraie base MongoDB) pour le blocage de place avec
// acompte (#B extension, lib/server/seatHolds.ts) — décision client transmise
// le 25/07/2026. Couvre : création du hold + acompte (décrémente le stock),
// activation (webhook acompte payé), paiement du solde (Order de complétion
// + fulfillOrder + clôture du hold), libération sur échec/expiration.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'

import { createSeatHold, activateSeatHold, completeSeatHold, completeSeatHoldOrder, releaseSeatHoldDepositOrder, releaseExpiredSeatHolds, listMySeatHolds } from '../seatHolds'
import { releaseOrder } from '../orders'
import { fulfillOrder } from '../fulfillOrder'
import Event from '../../models/Event'
import Order from '../../models/Order'
import Ticket from '../../models/Ticket'
import SeatHold from '../../models/SeatHold'
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
  await SeatHold.deleteMany({})
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
    places: [{ id: 'p1', type: 'Standard', price: 20, available: 3, total: 3, maxPerAccount: 0 }],
    ...overrides,
  })
}

describeIntegration('createSeatHold (intégration, transaction réelle)', () => {
  it('décrémente le stock et calcule le bon acompte (5%/24h)', async () => {
    const event = await seedEvent()
    const result = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'short' }, 'stripe')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 20€ = 2000 centimes, 5% = 100 centimes -> min 200 -> plafonné au min.
    expect(result.hold.depositMinor).toBe(200)
    expect(result.hold.unitPriceMinor).toBe(2000)
    expect(result.order.unitPriceMinor).toBe(200)
    expect(result.order.kind).toBe('seat_hold_deposit')
    expect(result.order.sellerUid).toBe('org-1')
    expect(result.order.connectMode).toBe('ledger')

    const fresh = await Event.findById(event.id).lean()
    expect(fresh?.places.find((p) => p.id === 'p1')?.available).toBe(2) // 3 - 1
  })

  it('plafonne le dépôt long (10%/72h) au plafond de 40€ sur un prix élevé', async () => {
    const event = await seedEvent({ places: [{ id: 'p1', type: 'VIP', price: 1000, available: 3, total: 3, maxPerAccount: 0 }] })
    const result = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'long' }, 'stripe')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.hold.depositMinor).toBe(4000) // 40€ plafond, pas 10% de 1000€
  })

  it('refuse une place de groupe (non blocable en v1)', async () => {
    const event = await seedEvent({ places: [{ id: 'grp', type: 'Table', price: 100, available: 2, total: 2, groupType: 'group', groupMax: 4, maxPerAccount: 0 }] })
    const result = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'grp', tier: 'short' }, 'stripe')
    expect(result).toEqual({ ok: false, status: 400, error: 'group_place_not_holdable' })
  })

  it('refuse une place gratuite', async () => {
    const event = await seedEvent({ places: [{ id: 'free', type: 'Gratuit', price: 0, available: 5, total: 5, maxPerAccount: 0 }] })
    const result = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'free', tier: 'short' }, 'stripe')
    expect(result).toEqual({ ok: false, status: 400, error: 'free_place_not_holdable' })
  })

  it('refuse si le stock est insuffisant', async () => {
    const event = await seedEvent({ places: [{ id: 'p1', type: 'Standard', price: 20, available: 0, total: 3, maxPerAccount: 0 }] })
    const result = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'short' }, 'stripe')
    expect(result).toEqual({ ok: false, status: 409, error: 'insufficient_stock' })
  })
})

describeIntegration('activateSeatHold (intégration — chemin heureux webhook acompte payé)', () => {
  it('active le hold et fixe expiresAt à +24h pour un tier short', async () => {
    const event = await seedEvent()
    const created = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'short' }, 'stripe')
    if (!created.ok) throw new Error('setup failed')

    const before = Date.now()
    const result = await activateSeatHold(created.order._id.toString())
    expect(result.ok).toBe(true)

    const hold = await SeatHold.findById(created.hold._id).lean()
    expect(hold?.status).toBe('active')
    expect(hold?.activatedAt).not.toBeNull()
    const expiresAtMs = hold?.expiresAt?.getTime() || 0
    expect(expiresAtMs).toBeGreaterThan(before + 23 * 3600_000)
    expect(expiresAtMs).toBeLessThan(before + 25 * 3600_000)

    const order = await Order.findById(created.order._id).lean()
    expect(order?.status).toBe('paid')
    expect(order?.settled).toBe(true)
    expect((await SellerBalance.findOne({ sellerUid: 'org-1' }).lean())?.amountDueCents).toBe(200)
  })

  it('est idempotent (rejouer le webhook ne réinitialise pas expiresAt)', async () => {
    const event = await seedEvent()
    const created = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'short' }, 'stripe')
    if (!created.ok) throw new Error('setup failed')

    await activateSeatHold(created.order._id.toString())
    const firstExpiry = (await SeatHold.findById(created.hold._id).lean())?.expiresAt?.getTime()

    await activateSeatHold(created.order._id.toString())
    const secondExpiry = (await SeatHold.findById(created.hold._id).lean())?.expiresAt?.getTime()

    expect(secondExpiry).toBe(firstExpiry)
  })
})

describeIntegration('completeSeatHoldOrder + fulfillOrder (paiement du solde)', () => {
  it('crée un Order de complétion au SOLDE (prix - acompte), mine le billet et clôture le hold', async () => {
    const event = await seedEvent()
    const created = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'short' }, 'stripe')
    if (!created.ok) throw new Error('setup failed')
    await activateSeatHold(created.order._id.toString())

    const completion = await completeSeatHoldOrder({ id: 'buyer-1' }, String(created.hold._id), 'stripe')
    expect(completion.ok).toBe(true)
    if (!completion.ok) return
    expect(completion.order.kind).toBe('seat_hold_completion')
    expect(completion.order.unitPriceMinor).toBe(1800) // 2000 - 200 (acompte)
    expect(completion.order.completesSeatHoldId).toBe(String(created.hold._id))

    const fulfillment = await fulfillOrder(completion.order._id.toString(), { rail: 'stripe' })
    expect(fulfillment.status).toBe('ok')
    if (fulfillment.status !== 'ok') return
    expect(fulfillment.ticketCodes).toHaveLength(1)
    const mintedTicket = await Ticket.findOne({ ticketCode: fulfillment.ticketCodes[0] }).lean()
    expect(mintedTicket?.placePrice).toBe(20)
    expect(mintedTicket?.totalPrice).toBe(20)
    expect((await SellerBalance.findOne({ sellerUid: 'org-1' }).lean())?.amountDueCents).toBe(2000)

    // Le stock n'a PAS été redécrémenté par cet Order (déjà réservé par le hold).
    const fresh = await Event.findById(event.id).lean()
    expect(fresh?.places.find((p) => p.id === 'p1')?.available).toBe(2)

    await completeSeatHold(String(created.hold._id), completion.order._id.toString())
    const hold = await SeatHold.findById(created.hold._id).lean()
    expect(hold?.status).toBe('completed')
    expect(hold?.completingOrderId).toBe(completion.order._id.toString())
  })

  it('refuse si le hold appartient à un autre utilisateur', async () => {
    const event = await seedEvent()
    const created = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'short' }, 'stripe')
    if (!created.ok) throw new Error('setup failed')
    await activateSeatHold(created.order._id.toString())

    const result = await completeSeatHoldOrder({ id: 'someone-else' }, String(created.hold._id), 'stripe')
    expect(result).toEqual({ ok: false, status: 403, error: 'forbidden' })
  })

  it("refuse si le hold n'est pas encore actif (acompte pas encore payé)", async () => {
    const event = await seedEvent()
    const created = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'short' }, 'stripe')
    if (!created.ok) throw new Error('setup failed')

    const result = await completeSeatHoldOrder({ id: 'buyer-1' }, String(created.hold._id), 'stripe')
    expect(result).toEqual({ ok: false, status: 409, error: 'seat_hold_not_active' })
  })

  it('refuse le mauvais rail pour la devise', async () => {
    const event = await seedEvent()
    const created = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'short' }, 'stripe')
    if (!created.ok) throw new Error('setup failed')
    await activateSeatHold(created.order._id.toString())

    const result = await completeSeatHoldOrder({ id: 'buyer-1' }, String(created.hold._id), 'fedapay')
    expect(result).toEqual({ ok: false, status: 400, error: 'wrong_rail_for_currency' })
  })
})

describeIntegration('releaseSeatHoldDepositOrder (échec/expiration de l\'acompte)', () => {
  it('restocke la place et marque le hold expiré si l\'acompte échoue', async () => {
    const event = await seedEvent()
    const created = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'short' }, 'stripe')
    if (!created.ok) throw new Error('setup failed')

    await releaseSeatHoldDepositOrder(created.order._id.toString(), releaseOrder)

    const fresh = await Event.findById(event.id).lean()
    expect(fresh?.places.find((p) => p.id === 'p1')?.available).toBe(3) // restocké

    const hold = await SeatHold.findById(created.hold._id).lean()
    expect(hold?.status).toBe('expired')

    const order = await Order.findById(created.order._id).lean()
    expect(order?.status).toBe('expired')
  })
})

describeIntegration('releaseExpiredSeatHolds (sweep cron)', () => {
  it("relâche un hold actif dont le solde n'a jamais été payé avant expiresAt", async () => {
    const event = await seedEvent()
    const created = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'short' }, 'stripe')
    if (!created.ok) throw new Error('setup failed')
    await activateSeatHold(created.order._id.toString())
    // Force l'expiration dans le passé pour isoler ce test du délai réel de 24h.
    await SeatHold.updateOne({ _id: created.hold._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })

    const swept = await releaseExpiredSeatHolds()
    expect(swept.released).toBe(1)

    const fresh = await Event.findById(event.id).lean()
    expect(fresh?.places.find((p) => p.id === 'p1')?.available).toBe(3) // restocké

    const hold = await SeatHold.findById(created.hold._id).lean()
    expect(hold?.status).toBe('expired')
  })

  it("n'affecte pas un hold encore dans sa fenêtre", async () => {
    const event = await seedEvent()
    const created = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'short' }, 'stripe')
    if (!created.ok) throw new Error('setup failed')
    await activateSeatHold(created.order._id.toString())

    const swept = await releaseExpiredSeatHolds()
    expect(swept.released).toBe(0)

    const hold = await SeatHold.findById(created.hold._id).lean()
    expect(hold?.status).toBe('active')
  })
})

describeIntegration('listMySeatHolds', () => {
  it("ne renvoie que les holds pending_payment/active de l'appelant", async () => {
    const event = await seedEvent()
    const created = await createSeatHold({ id: 'buyer-1' }, { eventId: event.id, placeId: 'p1', tier: 'short' }, 'stripe')
    if (!created.ok) throw new Error('setup failed')

    const holdsBeforeActivation = await listMySeatHolds('buyer-1')
    expect(holdsBeforeActivation).toHaveLength(1)
    expect(holdsBeforeActivation[0].balanceDueMinor).toBe(1800)

    const holdsForOther = await listMySeatHolds('someone-else')
    expect(holdsForOther).toHaveLength(0)
  })
})
