// Tests d'INTÉGRATION (vraie base MongoDB, transactions réelles) pour la
// réservation de stock serveur-autoritaire (fixe l'audit C03) et la
// finalisation de commande (fixe C05). Nécessite un MongoDB en replica set
// (les transactions multi-documents l'exigent) — voir MONGODB_URI ci-dessous.
//
// Ces tests ne touchent JAMAIS Stripe/FedaPay : fulfillOrder() ne fait
// d'appel réseau externe QUE dans la branche "événement annulé" (remboursement),
// qu'on n'exerce pas ici — le chemin heureux est donc 100% testable sans clé
// de paiement réelle.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { createOrder, releaseOrder } from '../orders'
import { fulfillOrder } from '../fulfillOrder'
import { reserveBoostSlot } from '../boostSlots'
import Event from '../../models/Event'
import Ticket from '../../models/Ticket'
import Order from '../../models/Order'
import PromoCode from '../../models/PromoCode'
import SellerBalance from '../../models/SellerBalance'
import BoostSlot from '../../models/BoostSlot'
import User from '../../models/User'

// Ce fichier exige un MongoDB réel (replica set, pour les transactions) — il
// ne tourne que si MONGODB_URI est explicitement fourni à `vitest`, pour ne
// pas casser `npm test` chez un contributeur/CI sans Mongo local configuré.
// Voir web/README (à écrire) pour la commande de lancement d'un replica set
// à un seul nœud en local.
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
  await Promise.all([
    Event.deleteMany({}),
    Ticket.deleteMany({}),
    Order.deleteMany({}),
    PromoCode.deleteMany({}),
    SellerBalance.deleteMany({}),
    BoostSlot.deleteMany({}),
    User.deleteMany({}),
  ])
})

async function seedEvent(overrides: Record<string, unknown> = {}) {
  return Event.create({
    name: 'Test Event',
    date: '2099-01-01',
    time: '22:00',
    endTime: '05:00',
    currency: 'EUR',
    createdBy: 'organizer-1',
    organizerId: 'organizer-1',
    places: [
      { id: 'p1', type: 'Standard', price: 20, available: 3, total: 3, maxPerAccount: 2 },
      { id: 'p2', type: 'Table VIP', price: 100, available: 2, total: 2, groupType: 'group', groupMin: 4, groupMax: 4, maxPerAccount: 0 },
    ],
    menu: [{ name: 'Champagne', price: 50, category: 'Boissons' }],
    ...overrides,
  })
}

describeIntegration('createOrder (intégration, transaction réelle)', () => {
  it('décrémente le stock et crée un Order en une transaction', async () => {
    const event = await seedEvent()
    const result = await createOrder({ userId: 'user-1', eventId: event.id, placeId: 'p1', qty: 2, isTable: false, rail: 'stripe' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.order.unitPriceMinor).toBe(2000) // 20€ → 2000 centimes
    expect(result.order.status).toBe('pending')

    const fresh = await Event.findById(event.id).lean()
    expect(fresh?.places.find((p) => p.id === 'p1')?.available).toBe(1) // 3 - 2
  })

  it('refuse si le stock est insuffisant (409)', async () => {
    // maxPerAccount:0 = illimité sur cette place dédiée, pour isoler le test
    // du garde-fou maxPerAccount (couvert séparément ci-dessous).
    const event = await seedEvent({ places: [{ id: 'p3', type: 'Illimité', price: 20, available: 3, total: 3, maxPerAccount: 0 }] })
    const result = await createOrder({ userId: 'user-1', eventId: event.id, placeId: 'p3', qty: 10, isTable: false, rail: 'stripe' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
    expect(result.error).toBe('insufficient_stock')
  })

  it("empêche une deuxième place de groupe pour le même compte et le même événement", async () => {
    const event = await seedEvent()
    const first = await createOrder({ userId: 'host-1', eventId: event.id, placeId: 'p2', qty: 1, isTable: true, rail: 'stripe' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    // Simule la finalisation (billet host émis) pour que le garde-fou détecte le lien.
    await Ticket.create({ ticketCode: 'T1', eventId: event.id, userId: 'host-1', hostUid: 'host-1', tableId: 'tbl_x', place: 'Table VIP', paid: true })

    const second = await createOrder({ userId: 'host-1', eventId: event.id, placeId: 'p2', qty: 1, isTable: true, rail: 'stripe' })
    expect(second.ok).toBe(false)
  })

  it('applique la limite maxPerAccount côté serveur (audit H08)', async () => {
    const event = await seedEvent()
    await Ticket.create({ ticketCode: 'T1', eventId: event.id, userId: 'user-1', place: 'Standard', paid: true })
    await Ticket.create({ ticketCode: 'T2', eventId: event.id, userId: 'user-1', place: 'Standard', paid: true })
    // maxPerAccount = 2, déjà 2 billets → toute nouvelle demande doit être refusée.
    const result = await createOrder({ userId: 'user-1', eventId: event.id, placeId: 'p1', qty: 1, isTable: false, rail: 'stripe' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('max_per_account_exceeded')
  })

  it('applique un code promo résolu serveur (jamais un montant du client)', async () => {
    const event = await seedEvent()
    await PromoCode.create({ eventId: event.id, code: 'WELCOME', type: 'percent', value: 50, maxUses: 10, usedCount: 0, active: true })
    const result = await createOrder({ userId: 'user-1', eventId: event.id, placeId: 'p1', qty: 1, isTable: false, promoCode: 'welcome', rail: 'stripe' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.order.unitPriceMinor).toBe(1000) // 50% de 2000
    expect(result.order.promoUnitDiscountMinor).toBe(1000)
  })

  it('résout le prix des précommandes depuis le menu serveur, jamais du client (ferme C06/C07)', async () => {
    const event = await seedEvent()
    const result = await createOrder({
      userId: 'user-1',
      eventId: event.id,
      placeId: 'p1',
      qty: 1,
      isTable: false,
      preorders: [{ name: 'Champagne', qty: 2 }],
      rail: 'stripe',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const preorders = result.order.preorders.map((p) => ({ name: p.name, price: p.price, qty: p.qty }))
    expect(preorders).toEqual([{ name: 'Champagne', price: 5000, qty: 2 }]) // 50€ → 5000 centimes
  })

  it('refuse un article de précommande inconnu du menu', async () => {
    const event = await seedEvent()
    const result = await createOrder({
      userId: 'user-1',
      eventId: event.id,
      placeId: 'p1',
      qty: 1,
      isTable: false,
      preorders: [{ name: 'Article inexistant', qty: 1 }],
      rail: 'stripe',
    })
    expect(result.ok).toBe(false)
  })

  it('bloque un événement privé sans déverrouillage prouvé (ferme H07/C01)', async () => {
    const event = await seedEvent({ isPrivate: true })
    const result = await createOrder({ userId: 'user-1', eventId: event.id, placeId: 'p1', qty: 1, isTable: false, rail: 'stripe' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
  })

  it('bloque un événement annulé (ferme H07)', async () => {
    const event = await seedEvent({ cancelled: true })
    const result = await createOrder({ userId: 'user-1', eventId: event.id, placeId: 'p1', qty: 1, isTable: false, rail: 'stripe' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('event_cancelled')
  })
})

describeIntegration('releaseOrder (intégration)', () => {
  it('restocke et exige la propriété (jamais une clé libre du client — ferme C03)', async () => {
    const event = await seedEvent()
    const result = await createOrder({ userId: 'user-1', eventId: event.id, placeId: 'p1', qty: 1, isTable: false, rail: 'stripe' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const orderId = result.order._id.toString()

    const wrongOwner = await releaseOrder(orderId, 'someone-else')
    expect(wrongOwner.ok).toBe(false)

    const released = await releaseOrder(orderId, 'user-1')
    expect(released.ok).toBe(true)

    const fresh = await Event.findById(event.id).lean()
    expect(fresh?.places.find((p) => p.id === 'p1')?.available).toBe(3) // restocké intégralement
  })
})

describeIntegration('fulfillOrder (intégration — chemin heureux sans appel réseau externe)', () => {
  it('émet exactement le nombre de billets attendu et marque la commande payée', async () => {
    const event = await seedEvent()
    const result = await createOrder({ userId: 'user-1', eventId: event.id, placeId: 'p1', qty: 2, isTable: false, rail: 'stripe' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const orderId = result.order._id.toString()

    const fulfillment = await fulfillOrder(orderId, { rail: 'stripe' })
    expect(fulfillment.status).toBe('ok')
    if (fulfillment.status !== 'ok') return
    expect(fulfillment.ticketCodes).toHaveLength(2)

    const tickets = await Ticket.find({ orderId }).lean()
    expect(tickets).toHaveLength(2)
    expect(tickets.every((t) => t.paid === true)).toBe(true)

    const order = await Order.findById(orderId).lean()
    expect(order?.paid).toBe(true)
    expect(order?.status).toBe('paid')
  })

  it('émet un billet par siège pour une table, seat 0 porte les précommandes', async () => {
    const event = await seedEvent()
    const result = await createOrder({ userId: 'host-1', eventId: event.id, placeId: 'p2', qty: 1, isTable: true, preorders: [{ name: 'Champagne', qty: 1 }], rail: 'stripe' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const fulfillment = await fulfillOrder(result.order._id.toString(), { rail: 'stripe' })
    expect(fulfillment.status).toBe('ok')
    if (fulfillment.status !== 'ok') return
    expect(fulfillment.ticketCodes).toHaveLength(4) // groupMax = 4 sièges

    const tickets = await Ticket.find({ orderId: result.order._id.toString() }).sort({ seatIndex: 1 }).lean()
    expect(tickets[0].preorders).toHaveLength(1)
    expect(tickets[1].preorders).toHaveLength(0)
    expect(tickets.every((t) => t.hostUid === 'host-1')).toBe(true)
    expect(new Set(tickets.map((t) => t.tableId)).size).toBe(1) // même table pour tous les sièges
  })

  it('est idempotent : un deuxième appel ne remet pas de billets', async () => {
    const event = await seedEvent()
    const result = await createOrder({ userId: 'user-1', eventId: event.id, placeId: 'p1', qty: 1, isTable: false, rail: 'stripe' })
    if (!result.ok) throw new Error('setup failed')
    const orderId = result.order._id.toString()

    await fulfillOrder(orderId, { rail: 'stripe' })
    const second = await fulfillOrder(orderId, { rail: 'stripe' })
    expect(second.status).toBe('already_processed')

    const tickets = await Ticket.find({ orderId }).lean()
    expect(tickets).toHaveLength(1) // pas de doublon
  })

  it("ne émet jamais de billet si l'événement a été annulé entre le paiement et le webhook", async () => {
    const event = await seedEvent()
    const result = await createOrder({ userId: 'user-1', eventId: event.id, placeId: 'p1', qty: 1, isTable: false, rail: 'stripe' })
    if (!result.ok) throw new Error('setup failed')
    const orderId = result.order._id.toString()

    await Event.updateOne({ _id: event.id }, { $set: { cancelled: true } })

    const fulfillment = await fulfillOrder(orderId, { rail: 'stripe' })
    expect(fulfillment.status).toBe('refunded_cancelled_event')
    const tickets = await Ticket.find({ orderId }).lean()
    expect(tickets).toHaveLength(0)
  })

  it('crédite le solde vendeur en mode ledger, une seule fois (ferme le double-crédit)', async () => {
    const event = await seedEvent()
    const result = await createOrder({ userId: 'buyer-1', eventId: event.id, placeId: 'p1', qty: 1, isTable: false, rail: 'stripe' })
    if (!result.ok) throw new Error('setup failed')
    expect(result.order.connectMode).toBe('ledger') // pas de compte Stripe Connect pour organizer-1

    await fulfillOrder(result.order._id.toString(), { rail: 'stripe' })
    const balance = await SellerBalance.findOne({ sellerUid: 'organizer-1' }).lean()
    expect(balance?.amountDueCents).toBeGreaterThan(0)
    const expectedOwed = result.order.unitPriceMinor - result.order.feeMinor
    expect(balance?.amountDueCents).toBe(expectedOwed)
  })

  it("rejette une commande FedaPay si le montant payé ne correspond pas exactement (pas d'équivalent Stripe)", async () => {
    const event = await seedEvent({ currency: 'XOF' })
    const result = await createOrder({ userId: 'user-1', eventId: event.id, placeId: 'p1', qty: 1, isTable: false, rail: 'fedapay' })
    if (!result.ok) throw new Error('setup failed')

    const wrongAmount = await fulfillOrder(result.order._id.toString(), { rail: 'fedapay', paidAmountMinor: 1 })
    expect(wrongAmount.status).toBe('amount_mismatch')
    const tickets = await Ticket.find({ orderId: result.order._id.toString() }).lean()
    expect(tickets).toHaveLength(0)
  })
})

describeIntegration('reserveBoostSlot (intégration)', () => {
  it('bloque une deuxième réservation concurrente sur le même créneau', async () => {
    const first = await reserveBoostSlot({ eventId: 'evt-a', userId: 'org-a', position: 1, region: 'togo', boostId: 'BOOST_A' })
    expect(first.ok).toBe(true)

    const second = await reserveBoostSlot({ eventId: 'evt-b', userId: 'org-b', position: 1, region: 'togo', boostId: 'BOOST_B' })
    expect(second.ok).toBe(false)
  })

  it('autorise un nouvel appel avec le même boostId (retry idempotent)', async () => {
    const first = await reserveBoostSlot({ eventId: 'evt-a', userId: 'org-a', position: 2, region: 'france', boostId: 'BOOST_C' })
    expect(first.ok).toBe(true)
    const retry = await reserveBoostSlot({ eventId: 'evt-a', userId: 'org-a', position: 2, region: 'france', boostId: 'BOOST_C' })
    expect(retry.ok).toBe(true)
  })
})
