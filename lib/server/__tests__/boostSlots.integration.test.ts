// Test d'INTÉGRATION (vraie base MongoDB) pour getEventBoostAvailability
// (#7 phase organisateur — vérification d'occupation avant achat, utilisée
// par le BoostModal côté tableau de bord organisateur).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { getEventBoostAvailability, reserveBoostSlot } from '../boostSlots'
import Event from '../../models/Event'
import BoostSlot from '../../models/BoostSlot'

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
  await BoostSlot.deleteMany({})
})

describeIntegration('getEventBoostAvailability (intégration, vraie base) — occupation des créneaux (#7)', () => {
  it('refuse un appelant qui ne possède pas l’événement', async () => {
    const event = await Event.create({ name: 'Soirée', date: '2030-01-01', city: 'Lomé', region: 'Togo', organizerId: 'org-1', createdBy: 'org-1', places: [] })
    const result = await getEventBoostAvailability('intrus', String(event._id))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })

  it('renvoie les 3 positions "available" quand rien n’est réservé', async () => {
    const event = await Event.create({ name: 'Soirée', date: '2030-01-01', city: 'Lomé', region: 'Togo', organizerId: 'org-1', createdBy: 'org-1', places: [] })
    const result = await getEventBoostAvailability('org-1', String(event._id))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.slots).toEqual([
      { position: 1, status: 'available' },
      { position: 2, status: 'available' },
      { position: 3, status: 'available' },
    ])
  })

  it('signale "held" une position réservée temporairement pour la même région', async () => {
    const event = await Event.create({ name: 'Soirée', date: '2030-01-01', city: 'Lomé', region: 'Togo', organizerId: 'org-1', createdBy: 'org-1', places: [] })
    const other = await Event.create({ name: 'Autre soirée', date: '2030-02-01', city: 'Lomé', region: 'Togo', organizerId: 'org-2', createdBy: 'org-2', places: [] })
    await reserveBoostSlot({ eventId: String(other._id), userId: 'org-2', position: 2, region: 'Togo', boostId: 'BOOST123' })

    const result = await getEventBoostAvailability('org-1', String(event._id))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.slots.find((s) => s.position === 2)?.status).toBe('held')
    expect(result.slots.find((s) => s.position === 1)?.status).toBe('available')
  })
})
