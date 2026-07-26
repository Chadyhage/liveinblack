// Test d'INTÉGRATION (vraie base MongoDB) pour getEventBoostAvailability
// (#7 phase organisateur — vérification d'occupation avant achat, utilisée
// par le BoostModal côté tableau de bord organisateur).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { getEventBoostAvailability, reserveBoostSlot, releaseBoostSlotIfPending } from '../boostSlots'
import Event from '../../models/Event'
import BoostSlot from '../../models/BoostSlot'
import { boostSlotId, normalizeBoostRegion } from '../../shared/boosts'

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

describeIntegration('releaseBoostSlotIfPending (intégration, vraie base) — libération après échec de paiement', () => {
  it("supprime un créneau 'pending' correspondant exactement au boostId fourni", async () => {
    const event = await Event.create({ name: 'Soirée', date: '2030-01-01', city: 'Lomé', region: 'Togo', organizerId: 'org-1', createdBy: 'org-1', places: [] })
    await reserveBoostSlot({ eventId: String(event._id), userId: 'org-1', position: 1, region: 'Togo', boostId: 'BOOST-A' })
    const slotId = boostSlotId(normalizeBoostRegion('Togo'), 1)
    expect(await BoostSlot.findOne({ slotId }).lean()).toBeTruthy()

    await releaseBoostSlotIfPending(slotId, 'BOOST-A')

    expect(await BoostSlot.findOne({ slotId }).lean()).toBeNull()
  })

  it("ne touche PAS un créneau déjà passé 'active' entre-temps, même avec le bon boostId", async () => {
    const event = await Event.create({ name: 'Soirée', date: '2030-01-01', city: 'Lomé', region: 'Togo', organizerId: 'org-1', createdBy: 'org-1', places: [] })
    await reserveBoostSlot({ eventId: String(event._id), userId: 'org-1', position: 1, region: 'Togo', boostId: 'BOOST-B' })
    const slotId = boostSlotId(normalizeBoostRegion('Togo'), 1)
    // Simule la confirmation webhook qui fait passer le créneau en 'active'
    // pendant qu'un appel de libération tardif (ex. retry réseau) arrive.
    await BoostSlot.updateOne({ slotId }, { $set: { status: 'active', activeUntil: new Date(Date.now() + 7 * 24 * 3600_000) } })

    await releaseBoostSlotIfPending(slotId, 'BOOST-B')

    const stillActive = await BoostSlot.findOne({ slotId }).lean()
    expect(stillActive).toBeTruthy()
    expect(stillActive?.status).toBe('active')
  })

  it("ne touche pas un créneau 'pending' d'un AUTRE boostId (ex. réservé entre-temps par quelqu'un d'autre)", async () => {
    const event = await Event.create({ name: 'Soirée', date: '2030-01-01', city: 'Lomé', region: 'Togo', organizerId: 'org-1', createdBy: 'org-1', places: [] })
    await reserveBoostSlot({ eventId: String(event._id), userId: 'org-1', position: 1, region: 'Togo', boostId: 'BOOST-REAL' })
    const slotId = boostSlotId(normalizeBoostRegion('Togo'), 1)

    // Un appel de libération portant un boostId périmé/différent ne doit
    // jamais supprimer la réservation réelle en cours.
    await releaseBoostSlotIfPending(slotId, 'BOOST-STALE')

    const stillPending = await BoostSlot.findOne({ slotId }).lean()
    expect(stillPending).toBeTruthy()
    expect(stillPending?.boostId).toBe('BOOST-REAL')
  })

  it("ne plante pas si le créneau n'existe pas du tout (no-op silencieux)", async () => {
    await expect(releaseBoostSlotIfPending('togo__top_3', 'BOOST-INCONNU')).resolves.toBeUndefined()
  })
})
