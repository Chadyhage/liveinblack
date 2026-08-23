// Tests d'INTÉGRATION (vraie base MongoDB) pour la composition exposée par
// GET /api/profile/recommendation-inputs (route ajoutée pour LIB_Mobile —
// voir app/api/profile/recommendation-inputs/route.ts). Route elle-même =
// pur Promise.all de 3 fonctions déjà en place ; cette suite couvre ce que la
// route assemble, aucune de ces 3 fonctions n'ayant de test dédié jusqu'ici.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { getMyProfile, updatePreferences } from '../users/profile'
import { listActiveInterestSignals, markEventInterested } from '../events/eventInterests'
import { getBoostedEventIds } from '../events/boosts'
import { createOrganizerEvent } from '../organizer/organizerEvents'
import Event from '@/lib/models/Event'
import EventInterest from '@/lib/models/EventInterest'
import Boost from '@/lib/models/Boost'
import User from '@/lib/models/User'

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
  await EventInterest.deleteMany({})
  await Boost.deleteMany({})
  await User.deleteMany({})
})

async function seedUser() {
  return User.create({ email: `user-${Math.random().toString(36).slice(2)}@test.com`, passwordHash: 'x', firstName: 'A', lastName: 'B', roles: ['client'], activeRole: 'client' })
}

async function seedEvent(overrides: Partial<Record<string, unknown>> = {}) {
  const inTenDays = new Date(Date.now() + 10 * 24 * 3600_000)
  const result = await createOrganizerEvent(
    { id: 'org-1' },
    'Organisateur Test',
    { name: 'Soirée Test', date: inTenDays.toISOString().slice(0, 10), city: 'Lomé', region: 'Togo', places: [{ id: 'p1', type: 'Standard', price: 20, total: 100 }], musicStyles: ['amapiano'] }
  )
  if (!result.ok) throw new Error('setup failed')
  if (Object.keys(overrides).length) await Event.updateOne({ _id: result.eventId }, { $set: overrides })
  return result.eventId
}

describeIntegration('recommendation-inputs (intégration, vraie base) — composition pour LIB_Mobile', () => {
  it('preferences=null par défaut, [] pour interestHistory/boostedEventIds sans données', async () => {
    const user = await seedUser()
    const profile = await getMyProfile({ id: String(user._id) })
    const interestHistory = await listActiveInterestSignals({ id: String(user._id) })
    const boostedIds = await getBoostedEventIds()

    expect(profile?.preferences).toBeNull()
    expect(interestHistory).toEqual([])
    expect(boostedIds.size).toBe(0)
  })

  it('remonte les préférences sauvegardées', async () => {
    const user = await seedUser()
    await updatePreferences({ id: String(user._id) }, { musicStyles: ['amapiano'], budget: '10-20' })
    const profile = await getMyProfile({ id: String(user._id) })
    expect(profile?.preferences).toEqual({ musicStyles: ['amapiano'], budget: '10-20' })
  })

  it("remonte l'historique d'intérêt actif avec les styles musicaux de l'event", async () => {
    const user = await seedUser()
    const eventId = await seedEvent()
    await markEventInterested({ id: String(user._id) }, { eventId })

    const interestHistory = await listActiveInterestSignals({ id: String(user._id) })
    expect(interestHistory).toEqual([{ eventId, musicStyles: ['amapiano'] }])
  })

  it('ne remonte que les boosts non expirés', async () => {
    const activeEventId = await seedEvent({ name: 'Actif' })
    const expiredEventId = await seedEvent({ name: 'Expiré' })

    await Boost.create({
      boostId: 'boost-active-1', eventId: activeEventId, position: 1, region: 'Togo', price: 10, days: 7,
      userId: 'org-1', purchasedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000),
    })
    await Boost.create({
      boostId: 'boost-expired-1', eventId: expiredEventId, position: 2, region: 'Togo', price: 10, days: 7,
      userId: 'org-1', purchasedAt: new Date(Date.now() - 8 * 24 * 3600_000), expiresAt: new Date(Date.now() - 3600_000),
    })

    const boostedIds = await getBoostedEventIds()
    expect(boostedIds.has(activeEventId)).toBe(true)
    expect(boostedIds.has(expiredEventId)).toBe(false)
  })
})
