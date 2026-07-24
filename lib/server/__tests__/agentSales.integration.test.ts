// Tests d'INTÉGRATION (vraie base MongoDB) pour la vente sur place via agent
// (#C — lib/server/agentSales.ts). FedaPay (createTransaction/createToken/
// sendPaymentToUser) est mocké (aucune clé de test réelle dans cet
// environnement, même convention que les autres suites de paiement).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'

vi.mock('../fedapayClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../fedapayClient')>()
  return {
    ...actual,
    createTransaction: vi.fn(async () => ({ id: 'txn_test_1', status: 'pending', amount: 0 })),
    createToken: vi.fn(async () => ({ token: 'tok_test_1', url: null })),
    sendPaymentToUser: vi.fn(async () => ({ status: 'pending' })),
  }
})

import { sellTicketOnSite, sellTicketAtDoor, settleCashSale, fulfillAgentSaleOrder, releaseAgentSaleOrder, getAgentSalesDashboard } from '../agentSales'
import { addEventStaff } from '../eventStaff'
import Event from '../../models/Event'
import Order from '../../models/Order'
import Ticket from '../../models/Ticket'
import EventStaff from '../../models/EventStaff'
import CashSaleSettlement from '../../models/CashSaleSettlement'
import SellerBalance from '../../models/SellerBalance'
import User from '../../models/User'
import bcrypt from 'bcryptjs'

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
  await EventStaff.deleteMany({})
  await CashSaleSettlement.deleteMany({})
  await SellerBalance.deleteMany({})
  await User.deleteMany({})
  vi.clearAllMocks()
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
    places: [
      { id: 'p1', type: 'Standard', price: 20, available: 100, total: 100 },
      { id: 'grp', type: 'Table', price: 100, available: 5, total: 5, groupType: 'group', groupMin: 4, groupMax: 8 },
    ],
    ...overrides,
  })
}

async function seedAgentUser() {
  const passwordHash = await bcrypt.hash('correct-password', 10)
  return User.create({ email: `agent-${Math.random().toString(36).slice(2)}@test.com`, passwordHash, firstName: 'Agent', lastName: 'Vente', roles: ['client'], activeRole: 'client' })
}

describeIntegration('agentSales (intégration, vraie base) — vente sur place via agent (#C)', () => {
  describe('autorisation', () => {
    it("refuse un appelant qui n'est ni propriétaire ni agent de vente désigné", async () => {
      const event = await seedEvent()
      const result = await sellTicketOnSite({ id: 'intrus' }, String(event._id), { placeId: 'p1', qty: 1, isTable: false, contactEmail: 'client@test.com', method: 'cash' })
      expect(result).toEqual({ ok: false, status: 403, error: 'forbidden' })
    })

    it("autorise un membre du staff avec le rôle 'vendeur'", async () => {
      const event = await seedEvent()
      const agentUser = await seedAgentUser()
      await addEventStaff({ id: 'org-1' }, String(event._id), { targetUserId: String(agentUser._id), role: 'vendeur' })

      const result = await sellTicketOnSite({ id: String(agentUser._id) }, String(event._id), { placeId: 'p1', qty: 1, isTable: false, contactEmail: 'client@test.com', method: 'cash', settlementMode: 'agent_settles' })
      expect(result.ok).toBe(true)
    })

    it("un rôle 'scan' seul ne suffit pas à vendre", async () => {
      const event = await seedEvent()
      const agentUser = await seedAgentUser()
      await addEventStaff({ id: 'org-1' }, String(event._id), { targetUserId: String(agentUser._id), role: 'scan' })

      const result = await sellTicketOnSite({ id: String(agentUser._id) }, String(event._id), { placeId: 'p1', qty: 1, isTable: false, contactEmail: 'client@test.com', method: 'cash' })
      expect(result).toEqual({ ok: false, status: 403, error: 'forbidden' })
    })
  })

  describe('vente espèces', () => {
    it("mode 'agent_settles' : génère le billet immédiatement (aucun prélèvement requis)", async () => {
      const event = await seedEvent()
      const result = await sellTicketOnSite({ id: 'org-1' }, String(event._id), { placeId: 'p1', qty: 1, isTable: false, contactEmail: 'client@test.com', method: 'cash', settlementMode: 'agent_settles' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.status).toBe('paid')
      expect(result.ticketCodes).toHaveLength(1)

      const ticket = await Ticket.findOne({ ticketCode: result.ticketCodes[0] }).lean()
      expect(ticket?.source).toBe('agent_cash')
      expect(ticket?.paid).toBe(true)

      const settlement = await CashSaleSettlement.findOne({ orderId: result.orderId }).lean()
      expect(settlement?.status).toBe('settled')

      // Frais de service LIB jamais contournés — même formule qu'un achat in-app.
      const order = await Order.findById(result.orderId).lean()
      expect(order?.feeMinor).toBeGreaterThan(0)
    })

    it("mode 'instant_debit' : reste en attente si le solde organisateur est insuffisant", async () => {
      const event = await seedEvent()
      const result = await sellTicketOnSite({ id: 'org-1' }, String(event._id), { placeId: 'p1', qty: 1, isTable: false, contactEmail: 'client@test.com', method: 'cash', settlementMode: 'instant_debit' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.status).toBe('pending_cash_settlement')
      expect(result.ticketCodes).toHaveLength(0)

      const tickets = await Ticket.find({ orderId: result.orderId }).lean()
      expect(tickets).toHaveLength(0)
    })

    it("mode 'instant_debit' : règle et génère le billet dès que le solde organisateur est suffisant", async () => {
      const event = await seedEvent()
      await SellerBalance.create({ sellerUid: 'org-1', amountDueCents: 100000 })

      const result = await sellTicketOnSite({ id: 'org-1' }, String(event._id), { placeId: 'p1', qty: 1, isTable: false, contactEmail: 'client@test.com', method: 'cash', settlementMode: 'instant_debit' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.status).toBe('paid')
      expect(result.ticketCodes).toHaveLength(1)

      const balance = await SellerBalance.findOne({ sellerUid: 'org-1' }).lean()
      const order = await Order.findById(result.orderId).lean()
      // Solde net : -libShare (débité au prélèvement) + organizerShare (crédité,
      // = prix plein du billet — l'organisateur reçoit le prix intégral, LIB ne
      // prélève QUE sa commission, jamais deux fois — cf. exemple Option 1 de la spec).
      expect(balance?.amountDueCents).toBe(100000 - (order?.feeMinor || 0) + (order?.unitPriceMinor || 0))
    })

    it('settleCashSale confirme une vente en attente (agent_settles) et génère le billet', async () => {
      const event = await seedEvent()
      const first = await sellTicketOnSite({ id: 'org-1' }, String(event._id), { placeId: 'p1', qty: 1, isTable: false, contactEmail: 'client@test.com', method: 'cash', settlementMode: 'instant_debit' })
      if (!first.ok) throw new Error('setup failed')
      expect(first.status).toBe('pending_cash_settlement')

      const settlement = await CashSaleSettlement.findOne({ orderId: first.orderId }).lean()
      const result = await settleCashSale({ id: 'org-1' }, String(settlement!._id))
      expect(result).toEqual({ ok: true, settled: false, ticketCodes: [] }) // solde toujours insuffisant

      await SellerBalance.create({ sellerUid: 'org-1', amountDueCents: 100000 })
      const retry = await settleCashSale({ id: 'org-1' }, String(settlement!._id))
      expect(retry.ok).toBe(true)
      if (!retry.ok) return
      expect(retry.settled).toBe(true)
      expect(retry.ticketCodes).toHaveLength(1)
    })

    it("le stock est décrémenté à la création, jamais deux fois pour la même vente", async () => {
      const event = await seedEvent()
      await sellTicketOnSite({ id: 'org-1' }, String(event._id), { placeId: 'p1', qty: 3, isTable: false, contactEmail: 'client@test.com', method: 'cash', settlementMode: 'agent_settles' })
      const updated = await Event.findById(event._id).lean()
      expect(updated?.places.find((p) => p.id === 'p1')?.available).toBe(97)
    })
  })

  describe('vente de groupe (forfait à prix fixe)', () => {
    it('vend la table entière à prix fixe et mint un billet par participant', async () => {
      const event = await seedEvent()
      const result = await sellTicketOnSite({ id: 'org-1' }, String(event._id), { placeId: 'grp', qty: 1, isTable: true, contactEmail: 'client@test.com', method: 'cash', settlementMode: 'agent_settles' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.ticketCodes).toHaveLength(8) // groupMax

      const tickets = await Ticket.find({ orderId: result.orderId }).lean()
      expect(tickets.every((t) => t.tableId)).toBe(true)
      expect(tickets.every((t) => t.source === 'agent_cash')).toBe(true)

      const updatedEvent = await Event.findById(event._id).lean()
      expect(updatedEvent?.places.find((p) => p.id === 'grp')?.available).toBe(4) // une seule "unité de stock" consommée pour toute la table
    })
  })

  describe('vente à l’entrée (fast-path)', () => {
    it('force qty=1, aucune précommande, et check-in immédiat', async () => {
      const event = await seedEvent()
      const result = await sellTicketAtDoor({ id: 'org-1' }, String(event._id), { placeId: 'p1', contactPhone: '+22890000000', method: 'cash', settlementMode: 'agent_settles' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.ticketCodes).toHaveLength(1)

      const ticket = await Ticket.findOne({ ticketCode: result.ticketCodes[0] }).lean()
      expect(ticket?.checkedInAt).toBeTruthy()
    })
  })

  describe('vente Mobile Money (async, webhook)', () => {
    it('reste en attente tant que la confirmation FedaPay n’est pas reçue, puis génère le billet', async () => {
      const event = await seedEvent({ currency: 'XOF', places: [{ id: 'p1', type: 'Standard', price: 5000, available: 50, total: 50 }] })
      const result = await sellTicketOnSite(
        { id: 'org-1' },
        String(event._id),
        { placeId: 'p1', qty: 1, isTable: false, contactPhone: '+22890000000', method: 'momo', momoMode: 'moov_tg', momoPhone: { number: '90000000', country: 'TG' } }
      )
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.status).toBe('pending_momo_confirmation')
      expect(await Ticket.countDocuments({})).toBe(0)

      const order = await Order.findById(result.orderId).lean()
      const expectedAmount = (order!.unitPriceMinor + order!.feeMinor)
      const fulfillResult = await fulfillAgentSaleOrder(result.orderId, { paidAmountMinor: expectedAmount })
      expect(fulfillResult.status).toBe('ok')
      if (fulfillResult.status !== 'ok') return
      expect(fulfillResult.ticketCodes).toHaveLength(1)

      const ticket = await Ticket.findOne({ ticketCode: fulfillResult.ticketCodes[0] }).lean()
      expect(ticket?.source).toBe('agent_momo')

      const balance = await SellerBalance.findOne({ sellerUid: 'org-1' }).lean()
      expect(balance?.amountDueXOF).toBe(order!.unitPriceMinor)
    })

    it('rejette un montant qui ne correspond pas au total attendu', async () => {
      const event = await seedEvent({ currency: 'XOF', places: [{ id: 'p1', type: 'Standard', price: 5000, available: 50, total: 50 }] })
      const result = await sellTicketOnSite(
        { id: 'org-1' },
        String(event._id),
        { placeId: 'p1', qty: 1, isTable: false, contactPhone: '+22890000000', method: 'momo', momoMode: 'moov_tg', momoPhone: { number: '90000000', country: 'TG' } }
      )
      if (!result.ok) throw new Error('setup failed')

      const fulfillResult = await fulfillAgentSaleOrder(result.orderId, { paidAmountMinor: 1 })
      expect(fulfillResult).toEqual({ status: 'amount_mismatch' })
    })

    it('releaseAgentSaleOrder restitue le stock si le paiement échoue/expire', async () => {
      const event = await seedEvent({ currency: 'XOF', places: [{ id: 'p1', type: 'Standard', price: 5000, available: 50, total: 50 }] })
      const result = await sellTicketOnSite(
        { id: 'org-1' },
        String(event._id),
        { placeId: 'p1', qty: 1, isTable: false, contactPhone: '+22890000000', method: 'momo', momoMode: 'moov_tg', momoPhone: { number: '90000000', country: 'TG' } }
      )
      if (!result.ok) throw new Error('setup failed')

      await releaseAgentSaleOrder(result.orderId)
      const updatedEvent = await Event.findById(event._id).lean()
      expect(updatedEvent?.places.find((p) => p.id === 'p1')?.available).toBe(50)

      const order = await Order.findById(result.orderId).lean()
      expect(order?.status).toBe('cancelled')
    })
  })

  describe('getAgentSalesDashboard', () => {
    it('agrège les ventes de l’agent appelant', async () => {
      const event = await seedEvent()
      // instant_debit D'ABORD (aucun solde organisateur pré-existant → reste en
      // attente) — sinon le crédit du premier agent_settles financerait le
      // second prélèvement et fausserait le test.
      await sellTicketOnSite({ id: 'org-1' }, String(event._id), { placeId: 'p1', qty: 1, isTable: false, contactEmail: 'b@test.com', method: 'cash', settlementMode: 'instant_debit' })
      await sellTicketOnSite({ id: 'org-1' }, String(event._id), { placeId: 'p1', qty: 1, isTable: false, contactEmail: 'a@test.com', method: 'cash', settlementMode: 'agent_settles' })

      const result = await getAgentSalesDashboard({ id: 'org-1' }, String(event._id))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.view.totalSales).toBe(1) // une seule réellement 'paid' (agent_settles)
      expect(result.view.cashPending).toBe(1) // instant_debit resté en attente (pas de solde)
      expect(result.view.cashSettled).toBe(1)
    })
  })
})
