// Tests d'INTÉGRATION (vraie base MongoDB) pour la vue admin « Événements »
// (#9 phase agent/admin — lib/server/agentEvents.ts : listEventsForAgent /
// adminCancelEvent). Le remboursement Stripe réel est mocké — même convention
// que organizerEventLifecycle.integration.test.ts ; adminCancelEvent délègue
// à cancelOrganizerEvent (bypassOwnership) donc on vérifie ici surtout le
// bypass + la liste/recherche/filtre, pas la mécanique de remboursement
// elle-même (déjà couverte par ce fichier).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'

vi.mock('../eventRefunds', () => ({
  refundStripeOrder: vi.fn(async () => ({ ok: true })),
}))

import { listEventsForAgent, adminCancelEvent } from '../agentEvents'
import { createOrganizerEvent } from '../organizerEvents'
import Event from '../../models/Event'
import Order from '../../models/Order'
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
  await EventRefund.deleteMany({})
})

async function seedEvent(overrides: { name?: string; date?: string; city?: string; ownerId?: string; organizerName?: string } = {}) {
  const { name = 'Soirée Test', date = '2099-12-31', city = 'Lomé', ownerId = 'org-1', organizerName = 'Le Club' } = overrides
  const result = await createOrganizerEvent({ id: ownerId }, organizerName, {
    name,
    date,
    time: '22:00',
    endTime: '05:00',
    city,
    region: 'Togo',
    places: [{ id: '', type: 'Standard', price: 20, total: 100 }],
  })
  if (!result.ok) throw new Error('seed failed')
  return result.eventId
}

describeIntegration('agentEvents (intégration, vraie base) — vue admin événements (#9)', () => {
  describe('listEventsForAgent', () => {
    it('liste tous les événements, tous organisateurs confondus, avec le statut calculé', async () => {
      await seedEvent({ name: 'Futur', date: '2099-06-01', ownerId: 'org-1' })
      await seedEvent({ name: 'Passé', date: '2000-01-01', ownerId: 'org-2' })

      const results = await listEventsForAgent()
      expect(results).toHaveLength(2)
      const byName = new Map(results.map((r) => [r.name, r]))
      expect(byName.get('Futur')?.status).toBe('upcoming')
      expect(byName.get('Passé')?.status).toBe('past')
    })

    it('un événement annulé est toujours « cancelled », même si sa date est future', async () => {
      const eventId = await seedEvent({ name: 'Annulé Futur', date: '2099-06-01' })
      await Event.updateOne({ _id: eventId }, { $set: { cancelled: true, cancellationMessage: 'Force majeure', cancelledAt: new Date() } })

      const results = await listEventsForAgent()
      expect(results).toHaveLength(1)
      expect(results[0].status).toBe('cancelled')
      expect(results[0].cancellationMessage).toBe('Force majeure')
    })

    it('filtre par statut', async () => {
      await seedEvent({ name: 'Futur', date: '2099-06-01' })
      await seedEvent({ name: 'Passé', date: '2000-01-01' })

      expect(await listEventsForAgent({ status: 'upcoming' })).toHaveLength(1)
      expect(await listEventsForAgent({ status: 'past' })).toHaveLength(1)
      expect(await listEventsForAgent({ status: 'cancelled' })).toHaveLength(0)
    })

    it('filtre par recherche sur nom/organisateur/ville', async () => {
      await seedEvent({ name: 'Neon Night', city: 'Lomé', organizerName: 'Le Club' })
      await seedEvent({ name: 'Autre Soirée', city: 'Cotonou', organizerName: 'Neon Crew' })

      expect(await listEventsForAgent({ search: 'Neon' })).toHaveLength(2) // nom + organizerName matchent chacun un event différent
      expect(await listEventsForAgent({ search: 'Cotonou' })).toHaveLength(1)
      expect(await listEventsForAgent({ search: 'introuvable' })).toHaveLength(0)
    })

    it('trie les annulés à la fin, puis par date croissante', async () => {
      await seedEvent({ name: 'Loin', date: '2099-12-31' })
      await seedEvent({ name: 'Proche', date: '2099-01-01' })
      const cancelledId = await seedEvent({ name: 'Annulé', date: '2099-06-01' })
      await Event.updateOne({ _id: cancelledId }, { $set: { cancelled: true } })

      const results = await listEventsForAgent()
      expect(results.map((r) => r.name)).toEqual(['Proche', 'Loin', 'Annulé'])
    })
  })

  describe('adminCancelEvent', () => {
    it("annule l'événement d'un AUTRE organisateur (bypass ownership) — un appel organisateur direct serait refusé", async () => {
      const eventId = await seedEvent({ ownerId: 'org-1' })

      const result = await adminCancelEvent({ id: 'agent-1' }, eventId, 'Annulé par un agent')
      expect(result.ok).toBe(true)

      const doc = await Event.findById(eventId).lean()
      expect(doc?.cancelled).toBe(true)
      expect(doc?.cancellationMessage).toBe('Annulé par un agent')
    })

    it('rembourse les commandes payées comme le flux organisateur (Stripe mocké, FedaPay réel)', async () => {
      const eventId = await seedEvent({ ownerId: 'org-1' })
      const doc = await Event.findById(eventId).lean()
      const placeId = doc!.places[0].id

      await Order.create({
        userId: 'buyer-1', eventId, placeId, placeType: 'Standard', qty: 1, unitPriceMinor: 2000, currency: 'XOF',
        rail: 'fedapay', status: 'paid', fedapayTxnId: 'txn-agent-1', expiresAt: new Date(Date.now() + 3600_000),
      })

      const result = await adminCancelEvent({ id: 'agent-1' }, eventId, 'Annulé')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.refundedCount).toBe(1)

      const refund = await EventRefund.findOne({ eventId, paymentRef: 'txn-agent-1' }).lean()
      expect(refund?.status).toBe('pending_manual')
    })

    it('404 si l’événement n’existe pas', async () => {
      const result = await adminCancelEvent({ id: 'agent-1' }, new mongoose.Types.ObjectId().toString(), '')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
    })
  })
})
