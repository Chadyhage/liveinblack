// Tests d'INTÉGRATION (vraie base MongoDB) pour annuler/reporter/supprimer un
// événement organisateur (#7 phase organisateur —
// lib/server/organizerEventLifecycle.ts). Le remboursement Stripe réel est
// mocké (aucune clé de test configurée dans cet environnement — voir
// applications.integration.test.ts pour la même convention avec Cloudinary) ;
// le chemin FedaPay (recordFedapayRefund) ne fait, lui, AUCUN appel réseau —
// testé pour de vrai contre la base.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'

vi.mock('../eventRefunds', () => ({
  refundStripeOrder: vi.fn(async () => ({ ok: true })),
}))

import { cancelOrganizerEvent, postponeOrganizerEvent, deleteOrganizerEvent } from '../organizerEventLifecycle'
import { createOrganizerEvent } from '../organizerEvents'
import Event from '../../models/Event'
import Order from '../../models/Order'
import EventStaff from '../../models/EventStaff'
import PromoCode from '../../models/PromoCode'
import EventAccessCode from '../../models/EventAccessCode'
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
  await EventStaff.deleteMany({})
  await PromoCode.deleteMany({})
  await EventAccessCode.deleteMany({})
  await EventRefund.deleteMany({})
})

async function seedEvent(ownerId = 'org-1') {
  const result = await createOrganizerEvent(
    { id: ownerId },
    'Organisateur Test',
    { name: 'Soirée Test', date: '2026-12-31', city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'Standard', price: 20, total: 100 }] }
  )
  if (!result.ok) throw new Error('seed failed')
  return result.eventId
}

describeIntegration('organizerEventLifecycle (intégration, vraie base) — cancel/postpone/delete (#7)', () => {
  describe('cancelOrganizerEvent', () => {
    it("refuse l'annulation par quelqu'un d'autre que le propriétaire", async () => {
      const eventId = await seedEvent()
      const result = await cancelOrganizerEvent({ id: 'intrus' }, eventId, 'Annulé')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('forbidden')
    })

    it('marque cancelled + message + cancelledAt', async () => {
      const eventId = await seedEvent()
      const result = await cancelOrganizerEvent({ id: 'org-1' }, eventId, 'Force majeure — reporté en 2027.')
      expect(result.ok).toBe(true)

      const doc = await Event.findById(eventId).lean()
      expect(doc?.cancelled).toBe(true)
      expect(doc?.cancellationMessage).toBe('Force majeure — reporté en 2027.')
      expect(doc?.cancelledAt).toBeTruthy()
    })

    it('est idempotent (ré-annuler ne change pas le message déjà posé)', async () => {
      const eventId = await seedEvent()
      await cancelOrganizerEvent({ id: 'org-1' }, eventId, 'Premier message')
      const result = await cancelOrganizerEvent({ id: 'org-1' }, eventId, 'Second message')
      expect(result.ok).toBe(true)

      const doc = await Event.findById(eventId).lean()
      expect(doc?.cancellationMessage).toBe('Premier message')
    })

    it('rembourse chaque commande payée (Stripe mocké, FedaPay réel) et compte succès/échecs', async () => {
      const eventId = await seedEvent()
      const doc = await Event.findById(eventId).lean()
      const placeId = doc!.places[0].id

      await Order.create([
        {
          userId: 'buyer-1', eventId, placeId, placeType: 'Standard', qty: 1, unitPriceMinor: 2000, currency: 'XOF',
          rail: 'fedapay', status: 'paid', fedapayTxnId: 'txn-1', expiresAt: new Date(Date.now() + 3600_000),
        },
        {
          userId: 'buyer-2', eventId, placeId, placeType: 'Standard', qty: 1, unitPriceMinor: 2500, currency: 'EUR',
          rail: 'stripe', status: 'paid', stripeSessionId: 'cs_test_1', expiresAt: new Date(Date.now() + 3600_000),
        },
        // Commande non payée : ne doit PAS être remboursée.
        {
          userId: 'buyer-3', eventId, placeId, placeType: 'Standard', qty: 1, unitPriceMinor: 2000, currency: 'XOF',
          rail: 'fedapay', status: 'pending', expiresAt: new Date(Date.now() + 3600_000),
        },
      ])

      const result = await cancelOrganizerEvent({ id: 'org-1' }, eventId, 'Annulé')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.refundedCount).toBe(2)
      expect(result.refundFailedCount).toBe(0)

      const fedapayRefund = await EventRefund.findOne({ eventId, paymentRef: 'txn-1' }).lean()
      expect(fedapayRefund?.status).toBe('pending_manual')
    })
  })

  describe('postponeOrganizerEvent', () => {
    it('refuse pour un non-propriétaire', async () => {
      const eventId = await seedEvent()
      const result = await postponeOrganizerEvent({ id: 'intrus' }, eventId, { date: '2027-01-01' })
      expect(result.ok).toBe(false)
    })

    it('refuse de reporter un événement déjà annulé', async () => {
      const eventId = await seedEvent()
      await Event.updateOne({ _id: eventId }, { $set: { cancelled: true } })
      const result = await postponeOrganizerEvent({ id: 'org-1' }, eventId, { date: '2027-01-01' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('event_cancelled')
    })

    it('met à jour date/heure et conserve la date d’origine au premier report', async () => {
      const eventId = await seedEvent()
      const result = await postponeOrganizerEvent({ id: 'org-1' }, eventId, { date: '2027-03-15', time: '23:00' })
      expect(result.ok).toBe(true)

      const doc = await Event.findById(eventId).lean()
      expect(doc?.date).toBe('2027-03-15')
      expect(doc?.time).toBe('23:00')
      expect(doc?.postponedFrom?.date).toBe('2026-12-31')
    })

    it('ne réécrit jamais la date d’origine sur un second report', async () => {
      const eventId = await seedEvent()
      await postponeOrganizerEvent({ id: 'org-1' }, eventId, { date: '2027-03-15' })
      await postponeOrganizerEvent({ id: 'org-1' }, eventId, { date: '2027-06-01' })

      const doc = await Event.findById(eventId).lean()
      expect(doc?.date).toBe('2027-06-01')
      expect(doc?.postponedFrom?.date).toBe('2026-12-31') // toujours la toute première date
    })
  })

  describe('deleteOrganizerEvent', () => {
    it('refuse pour un non-propriétaire', async () => {
      const eventId = await seedEvent()
      const result = await deleteOrganizerEvent({ id: 'intrus' }, eventId)
      expect(result.ok).toBe(false)
    })

    it("refuse la suppression si des réservations payées existent, renvoie le compte", async () => {
      const eventId = await seedEvent()
      const doc = await Event.findById(eventId).lean()
      await Order.create({
        userId: 'buyer-1', eventId, placeId: doc!.places[0].id, placeType: 'Standard', qty: 2, unitPriceMinor: 2000, currency: 'XOF',
        rail: 'fedapay', status: 'paid', expiresAt: new Date(Date.now() + 3600_000),
      })

      const result = await deleteOrganizerEvent({ id: 'org-1' }, eventId)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect('bookingCount' in result && result.bookingCount).toBe(2)

      const stillExists = await Event.findById(eventId).lean()
      expect(stillExists).toBeTruthy()
    })

    it('supprime réellement l’événement (et ses artefacts liés) sans réservation', async () => {
      const eventId = await seedEvent()
      await EventStaff.create({ eventId, roster: {} })
      await PromoCode.create({ eventId, code: 'TEST10', type: 'percent', value: 10, createdBy: 'org-1' })

      const result = await deleteOrganizerEvent({ id: 'org-1' }, eventId)
      expect(result.ok).toBe(true)

      expect(await Event.findById(eventId).lean()).toBeNull()
      expect(await EventStaff.findOne({ eventId }).lean()).toBeNull()
      expect(await PromoCode.findOne({ eventId }).lean()).toBeNull()
    })
  })
})
