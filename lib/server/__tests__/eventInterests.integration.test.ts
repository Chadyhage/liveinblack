// Tests d'INTÉGRATION (vraie base MongoDB) pour "mes événements intéressés"
// (#6 phase profil — port de src/utils/eventInterests.js). Couvre :
//  - marquer/retirer un intérêt (upsert idempotent, jamais d'erreur sur un
//    double-clic ou un retrait déjà effectif) ;
//  - la liste résolue depuis de VRAIS documents Event (jamais un instantané
//    périmé, contrairement au legacy) ;
//  - un événement supprimé après coup renvoie event:null, ne fait jamais
//    planter la liste.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { markEventInterested, unmarkEventInterested, isEventInterested, listMyEventInterests } from '../eventInterests'
import EventInterest from '../../models/EventInterest'
import Event from '../../models/Event'
import User from '../../models/User'

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
  await Promise.all([EventInterest.deleteMany({}), Event.deleteMany({}), User.deleteMany({})])
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  return User.create({
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: 'x',
    firstName: 'Prenom',
    lastName: 'Nom',
    roles: ['client'],
    activeRole: 'client',
    ...overrides,
  })
}

async function seedEvent(overrides: Record<string, unknown> = {}) {
  return Event.create({
    name: 'Soirée Test XYZ',
    date: '2099-06-15',
    currency: 'EUR',
    createdBy: 'organizer-1',
    organizerId: 'organizer-1',
    imageUrl: 'https://example.com/event.jpg',
    places: [
      { id: 'std', type: 'Standard', price: 1000, available: 20, total: 20 },
      { id: 'vip', type: 'VIP', price: 3000, available: 5, total: 5 },
    ],
    ...overrides,
  })
}

describeIntegration('eventInterests (intégration, vraie base) — événements intéressés (#6)', () => {
  describe('markEventInterested / unmarkEventInterested', () => {
    it('marque un événement intéressé, puis le retire', async () => {
      const alice = await seedUser()
      const event = await seedEvent()

      const marked = await markEventInterested({ id: alice.id }, { eventId: event.id })
      expect(marked.ok).toBe(true)
      if (!marked.ok) return
      expect(marked.interested).toBe(true)

      const check = await isEventInterested({ id: alice.id }, { eventId: event.id })
      expect(check.interested).toBe(true)

      const unmarked = await unmarkEventInterested({ id: alice.id }, { eventId: event.id })
      expect(unmarked.ok).toBe(true)
      if (!unmarked.ok) return
      expect(unmarked.interested).toBe(false)

      const checkAfter = await isEventInterested({ id: alice.id }, { eventId: event.id })
      expect(checkAfter.interested).toBe(false)
    })

    it('marquer deux fois de suite le même événement est un no-op idempotent (pas de doublon, pas d’erreur)', async () => {
      const alice = await seedUser()
      const event = await seedEvent()

      await markEventInterested({ id: alice.id }, { eventId: event.id })
      const second = await markEventInterested({ id: alice.id }, { eventId: event.id })
      expect(second.ok).toBe(true)

      const count = await EventInterest.countDocuments({ userId: alice.id, eventId: event.id })
      expect(count).toBe(1)
    })

    it('retirer un événement jamais marqué intéressé est un no-op idempotent (pas d’erreur)', async () => {
      const alice = await seedUser()
      const event = await seedEvent()

      const result = await unmarkEventInterested({ id: alice.id }, { eventId: event.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.interested).toBe(false)
    })

    it('remarquer un événement retiré conserve le même document (createdAt inchangé), juste le statut', async () => {
      const alice = await seedUser()
      const event = await seedEvent()

      await markEventInterested({ id: alice.id }, { eventId: event.id })
      const first = await EventInterest.findOne({ userId: alice.id, eventId: event.id }).lean()

      await unmarkEventInterested({ id: alice.id }, { eventId: event.id })
      await markEventInterested({ id: alice.id }, { eventId: event.id })
      const second = await EventInterest.findOne({ userId: alice.id, eventId: event.id }).lean()

      expect(String(second?._id)).toBe(String(first?._id))
      expect(new Date(second!.createdAt as unknown as string).getTime()).toBe(new Date(first!.createdAt as unknown as string).getTime())
    })
  })

  describe('listMyEventInterests', () => {
    it('résout la liste depuis de VRAIS documents Event, triée par ajout décroissant', async () => {
      const alice = await seedUser()
      const eventA = await seedEvent({ name: 'Premier événement' })
      const eventB = await seedEvent({ name: 'Second événement' })

      await markEventInterested({ id: alice.id }, { eventId: eventA.id })
      await markEventInterested({ id: alice.id }, { eventId: eventB.id })

      const result = await listMyEventInterests({ id: alice.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.items).toHaveLength(2)
      // Le plus récemment ajouté (eventB) en premier.
      expect(result.items[0].eventId).toBe(eventB.id)
      expect(result.items[0].event?.name).toBe('Second événement')
      expect(result.items[1].event?.name).toBe('Premier événement')
    })

    it('calcule minPrice comme le prix de la place la moins chère', async () => {
      const alice = await seedUser()
      const event = await seedEvent()
      await markEventInterested({ id: alice.id }, { eventId: event.id })

      const result = await listMyEventInterests({ id: alice.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.items[0].event?.minPrice).toBe(1000)
    })

    it('un événement supprimé après coup renvoie event:null sans planter la liste', async () => {
      const alice = await seedUser()
      const event = await seedEvent()
      await markEventInterested({ id: alice.id }, { eventId: event.id })
      await Event.deleteOne({ _id: event.id })

      const result = await listMyEventInterests({ id: alice.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.items).toHaveLength(1)
      expect(result.items[0].event).toBeNull()
    })

    it('ne renvoie jamais les intérêts retirés (status:removed)', async () => {
      const alice = await seedUser()
      const event = await seedEvent()
      await markEventInterested({ id: alice.id }, { eventId: event.id })
      await unmarkEventInterested({ id: alice.id }, { eventId: event.id })

      const result = await listMyEventInterests({ id: alice.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.items).toHaveLength(0)
    })

    it("ne renvoie jamais les intérêts d'un AUTRE utilisateur", async () => {
      const alice = await seedUser()
      const bob = await seedUser()
      const event = await seedEvent()
      await markEventInterested({ id: bob.id }, { eventId: event.id })

      const result = await listMyEventInterests({ id: alice.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.items).toHaveLength(0)
    })
  })
})
