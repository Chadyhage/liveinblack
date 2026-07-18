// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/agentPayments.ts —
// panneau agent de réconciliation paiements/versements/remboursements (#9
// phase agent/admin, tâche #102). Couvre la garde anti double-versement de
// markPayoutPaid (pendant de api/admin-accounts.js:mark_payout_paid) et le
// plafonnement de markSellerBalancePaid au solde réel du ledger.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import {
  listPendingPayoutsForAgent,
  markPayoutPaid,
  markSellerBalancePaid,
  listRefundAlertsForAgent,
  completeManualRefund,
  listPaymentAlertsForAgent,
  resolvePaymentAlert,
  type AgentCaller,
} from '../agentPayments'
import User from '../../models/User'
import Event from '../../models/Event'
import Order from '../../models/Order'
import EventPayout from '../../models/EventPayout'
import EventRefund from '../../models/EventRefund'
import PayoutRequest from '../../models/PayoutRequest'
import SellerBalance from '../../models/SellerBalance'
import PaymentAlert from '../../models/PaymentAlert'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

const AGENT: AgentCaller = { id: 'agent-1', name: 'Agent Test' }

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
  await User.deleteMany({})
  await Event.deleteMany({})
  await Order.deleteMany({})
  await EventPayout.deleteMany({})
  await EventRefund.deleteMany({})
  await PayoutRequest.deleteMany({})
  await SellerBalance.deleteMany({})
  await PaymentAlert.deleteMany({})
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId().toString()}@test.com`,
    passwordHash: 'x',
    firstName: 'Ada',
    lastName: 'Lovelace',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    ...overrides,
  })
  return String(user._id)
}

async function seedEvent(overrides: Record<string, unknown> = {}) {
  return Event.create({ name: 'Soirée Neon', date: '2020-01-01', city: 'Lomé', region: 'Togo', organizerId: 'x', createdBy: 'x', places: [], ...overrides })
}

describeIntegration('agentPayments (intégration, vraie base) — #9 phase agent/admin', () => {
  describe('listPendingPayoutsForAgent', () => {
    it('sépare versements XOF en échec, demandes de virement EUR et soldes sans demande', async () => {
      const seller1 = await seedUser()
      const seller2 = await seedUser()
      const event = await seedEvent()

      await EventPayout.create({ eventId: String(event._id), sellerUid: seller1, amountDueXOF: 15000, status: 'failed', failReason: 'numéro manquant' })
      await SellerBalance.create({ sellerUid: seller1, amountDueCents: 5000 })
      await PayoutRequest.create({ sellerUid: seller1, amountDueCents: 5000, status: 'pending' })
      await SellerBalance.create({ sellerUid: seller2, amountDueCents: 2000 })

      const queue = await listPendingPayoutsForAgent()
      expect(queue.failedPayouts).toHaveLength(1)
      expect(queue.failedPayouts[0].eventCancelled).toBe(false)
      expect(queue.payoutRequests).toHaveLength(1)
      expect(queue.payoutRequests[0].payCents).toBe(5000)
      expect(queue.balancesNoReq).toHaveLength(1)
      expect(queue.balancesNoReq[0].sellerUid).toBe(seller2)
    })

    it('marque eventCancelled quand l’événement est annulé ou supprimé', async () => {
      const seller = await seedUser()
      const cancelledEvent = await seedEvent({ cancelled: true })
      await EventPayout.create({ eventId: String(cancelledEvent._id), sellerUid: seller, amountDueXOF: 1000, status: 'failed' })
      await EventPayout.create({ eventId: 'deleted-event-id', sellerUid: seller, amountDueXOF: 2000, status: 'failed' })

      const queue = await listPendingPayoutsForAgent()
      expect(queue.failedPayouts.every((p) => p.eventCancelled)).toBe(true)
    })

    it('plafonne payCents au solde réel quand le montant demandé le dépasse', async () => {
      const seller = await seedUser()
      await SellerBalance.create({ sellerUid: seller, amountDueCents: 1000 })
      await PayoutRequest.create({ sellerUid: seller, amountDueCents: 9999, status: 'pending' })

      const queue = await listPendingPayoutsForAgent()
      expect(queue.payoutRequests[0].payCents).toBe(1000)
      expect(queue.payoutRequests[0].mismatch).toBe(true)
    })
  })

  describe('markPayoutPaid', () => {
    it('solde une enveloppe failed : EventPayout → paid, SellerBalance décrémenté', async () => {
      const seller = await seedUser()
      const event = await seedEvent()
      await EventPayout.create({ eventId: String(event._id), sellerUid: seller, amountDueXOF: 15000, status: 'failed' })
      await SellerBalance.create({ sellerUid: seller, amountDueXOF: 15000 })

      const result = await markPayoutPaid(AGENT, String(event._id))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.paid).toBe(15000)

      const ep = await EventPayout.findOne({ eventId: String(event._id) }).lean()
      expect(ep?.status).toBe('paid')
      expect(ep?.amountDueXOF).toBe(0)

      const balance = await SellerBalance.findOne({ sellerUid: seller }).lean()
      expect(balance?.amountDueXOF).toBe(0)
    })

    it('refuse un second règlement (déjà payé) — anti double-versement', async () => {
      const seller = await seedUser()
      const event = await seedEvent()
      await EventPayout.create({ eventId: String(event._id), sellerUid: seller, amountDueXOF: 15000, status: 'failed' })
      await SellerBalance.create({ sellerUid: seller, amountDueXOF: 15000 })

      const first = await markPayoutPaid(AGENT, String(event._id))
      expect(first.ok).toBe(true)

      const second = await markPayoutPaid(AGENT, String(event._id))
      expect(second.ok).toBe(false)
      if (second.ok) return
      expect(second.error).toBe('not_failed')

      const balance = await SellerBalance.findOne({ sellerUid: seller }).lean()
      expect(balance?.amountDueXOF).toBe(0) // pas décrémenté une deuxième fois
    })

    it('ne solde jamais un événement annulé (recette réservée aux remboursements)', async () => {
      const seller = await seedUser()
      const event = await seedEvent({ cancelled: true })
      await EventPayout.create({ eventId: String(event._id), sellerUid: seller, amountDueXOF: 15000, status: 'failed' })

      const result = await markPayoutPaid(AGENT, String(event._id))
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('event_cancelled')
    })

    it('refuse un événement supprimé', async () => {
      const result = await markPayoutPaid(AGENT, new mongoose.Types.ObjectId().toString())
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('event_gone')
    })

    it('ne solde pas une enveloppe encore en versement automatique (accumulating)', async () => {
      const seller = await seedUser()
      const event = await seedEvent()
      await EventPayout.create({ eventId: String(event._id), sellerUid: seller, amountDueXOF: 15000, status: 'accumulating' })

      const result = await markPayoutPaid(AGENT, String(event._id))
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('not_failed')
    })
  })

  describe('markSellerBalancePaid', () => {
    it('plafonne le règlement au solde réel du ledger et clôture la demande', async () => {
      const seller = await seedUser()
      await SellerBalance.create({ sellerUid: seller, amountDueCents: 1000 })
      const request = await PayoutRequest.create({ sellerUid: seller, amountDueCents: 9999, status: 'pending' })

      const result = await markSellerBalancePaid(AGENT, { sellerUid: seller, amount: 9999, currency: 'EUR', requestId: String(request._id) })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.paid).toBe(1000)

      const balance = await SellerBalance.findOne({ sellerUid: seller }).lean()
      expect(balance?.amountDueCents).toBe(0)

      const freshRequest = await PayoutRequest.findById(request._id).lean()
      expect(freshRequest?.status).toBe('paid')
      expect(freshRequest?.paidAmount).toBe(1000)
    })

    it('clôture une demande à solde déjà nul sans toucher au ledger', async () => {
      const seller = await seedUser()
      const request = await PayoutRequest.create({ sellerUid: seller, amountDueCents: 500, status: 'pending' })

      const result = await markSellerBalancePaid(AGENT, { sellerUid: seller, amount: 0, currency: 'EUR', requestId: String(request._id) })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.paid).toBe(0)

      const freshRequest = await PayoutRequest.findById(request._id).lean()
      expect(freshRequest?.status).toBe('paid')
    })
  })

  describe('listRefundAlertsForAgent / completeManualRefund', () => {
    it('liste les remboursements FedaPay en attente avec email acheteur et nom événement', async () => {
      const buyer = await seedUser({ roles: ['client'], activeRole: 'client' })
      const event = await seedEvent()
      await Order.create({
        userId: buyer,
        eventId: String(event._id),
        placeId: 'p1',
        placeType: 'Standard',
        qty: 1,
        unitPriceMinor: 5000,
        currency: 'XOF',
        rail: 'fedapay',
        fedapayTxnId: 'txn_123',
        status: 'cancelled',
        expiresAt: new Date(),
      })
      await EventRefund.create({ eventId: String(event._id), paymentRef: 'txn_123', rail: 'fedapay', status: 'pending_manual', amountMinor: 5000, currency: 'XOF' })

      const refunds = await listRefundAlertsForAgent()
      expect(refunds).toHaveLength(1)
      expect(refunds[0].amountXOF).toBe(5000)
      expect(refunds[0].eventName).toBe('Soirée Neon')

      const complete = await completeManualRefund(AGENT, refunds[0].id)
      expect(complete.ok).toBe(true)

      const fresh = await EventRefund.findOne({ paymentRef: 'txn_123' }).lean()
      expect(fresh?.status).toBe('refunded')
      expect(fresh?.completedBy).toBe(AGENT.id)

      expect(await listRefundAlertsForAgent()).toHaveLength(0)
    })

    it('refuse de compléter un remboursement déjà traité', async () => {
      const event = await seedEvent()
      const refund = await EventRefund.create({ eventId: String(event._id), paymentRef: 'txn_x', rail: 'fedapay', status: 'refunded', amountMinor: 1000, currency: 'XOF' })

      const result = await completeManualRefund(AGENT, String(refund._id))
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('not_pending')
    })

    it('ignore les remboursements Stripe (déjà automatiques)', async () => {
      const event = await seedEvent()
      await EventRefund.create({ eventId: String(event._id), paymentRef: 'cs_123', rail: 'stripe', status: 'refunded', amountMinor: 1000, currency: 'EUR' })

      expect(await listRefundAlertsForAgent()).toHaveLength(0)
    })
  })

  describe('listPaymentAlertsForAgent / resolvePaymentAlert', () => {
    it('liste les alertes non résolues et les enrichit (événement, vendeur)', async () => {
      const seller = await seedUser()
      const event = await seedEvent()
      await PaymentAlert.create({ key: 'k1', reason: 'auto_payout_failed', eventId: String(event._id), sellerUid: seller, details: { code: 'payout_rejected' } })
      await PaymentAlert.create({ key: 'k2', reason: 'amount_mismatch', resolved: true })

      const alerts = await listPaymentAlertsForAgent()
      expect(alerts).toHaveLength(1)
      expect(alerts[0].reason).toBe('auto_payout_failed')
      expect(alerts[0].eventName).toBe('Soirée Neon')
      expect(alerts[0].sellerEmail).not.toBe('')
    })

    it('clôture une alerte et la retire de la liste', async () => {
      const alert = await PaymentAlert.create({ key: 'k3', reason: 'amount_mismatch' })

      const result = await resolvePaymentAlert(AGENT, String(alert._id))
      expect(result.ok).toBe(true)

      const fresh = await PaymentAlert.findById(alert._id).lean()
      expect(fresh?.resolved).toBe(true)
      expect(fresh?.resolvedBy).toBe(AGENT.id)
      expect(await listPaymentAlertsForAgent()).toHaveLength(0)
    })

    it('404 si l’alerte est introuvable ou déjà résolue', async () => {
      const result = await resolvePaymentAlert(AGENT, new mongoose.Types.ObjectId().toString())
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('not_found_or_resolved')
    })
  })
})
