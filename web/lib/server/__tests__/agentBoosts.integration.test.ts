// Test d'INTÉGRATION (vraie base MongoDB) pour le panneau agent « Boosts »
// LECTURE SEULE (#106 phase agent/admin — lib/server/agentBoosts.ts,
// listActiveBoostsForAgent). Port fidèle de la section tab === 'boosts' de
// src/pages/AgentPage.jsx : actifs/conflits/expirés + revenu net.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { listActiveBoostsForAgent } from '../agentBoosts'
import Boost from '../../models/Boost'
import Event from '../../models/Event'

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
  await Boost.deleteMany({})
  await Event.deleteMany({})
})

async function seedEvent(overrides: Record<string, unknown> = {}) {
  return Event.create({
    name: 'Soirée Neon',
    date: '2030-01-01',
    city: 'Paris',
    region: 'france',
    organizerId: 'org-1',
    organizerName: 'Club Neon',
    createdBy: 'org-1',
    places: [],
    ...overrides,
  })
}

describeIntegration('listActiveBoostsForAgent (intégration, vraie base) — panneau agent Boosts (#106)', () => {
  it('classe un boost non expiré comme actif et calcule le revenu', async () => {
    const event = await seedEvent()
    await Boost.create({
      boostId: 'BOOST-ACTIVE-1',
      eventId: String(event._id),
      position: 1,
      region: 'france',
      price: 9.99,
      days: 1,
      userId: 'org-1',
      purchasedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      status: 'active',
    })

    const result = await listActiveBoostsForAgent()
    expect(result.active).toHaveLength(1)
    expect(result.active[0].eventName).toBe('Soirée Neon')
    expect(result.active[0].organizerName).toBe('Club Neon')
    expect(result.expired).toHaveLength(0)
    expect(result.totalRevenue).toBe(9.99)
  })

  it('classe un boost dont expiresAt est passé comme expiré, pas actif', async () => {
    const event = await seedEvent()
    await Boost.create({
      boostId: 'BOOST-EXPIRED-1',
      eventId: String(event._id),
      position: 2,
      region: 'togo',
      price: 6.99,
      days: 1,
      userId: 'org-1',
      purchasedAt: new Date(Date.now() - 2 * 86400000),
      expiresAt: new Date(Date.now() - 86400000),
      status: 'active',
    })

    const result = await listActiveBoostsForAgent()
    expect(result.active).toHaveLength(0)
    expect(result.expired).toHaveLength(1)
    // Le revenu reste compté : un boost simplement expiré (pas remboursé)
    // reste de l'argent encaissé par la plateforme.
    expect(result.totalRevenue).toBe(6.99)
  })

  it('isole les boosts en conflit dans le bucket conflicts et exclut le remboursé du revenu', async () => {
    const event = await seedEvent()
    await Boost.create({
      boostId: 'BOOST-CONFLICT-1',
      eventId: String(event._id),
      position: 1,
      region: 'france',
      price: 24.99,
      days: 3,
      userId: 'org-1',
      purchasedAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * 86400000),
      status: 'active',
      conflict: true,
    })
    await Boost.create({
      boostId: 'BOOST-REFUNDED-1',
      eventId: String(event._id),
      position: 1,
      region: 'france',
      price: 24.99,
      days: 3,
      userId: 'org-2',
      purchasedAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * 86400000),
      status: 'refunded_conflict',
      conflict: true,
    })

    const result = await listActiveBoostsForAgent()
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0].id).toBe('BOOST-CONFLICT-1')
    // Le remboursé n'est pas "actif" (isBoostActive exclut conflict===true).
    expect(result.expired.map((b) => b.id)).toContain('BOOST-REFUNDED-1')
    // Revenu net : seul le boost non remboursé/annulé compte, une seule fois.
    expect(result.totalRevenue).toBe(24.99)
  })

  it('retombe sur un libellé générique si l’événement n’existe plus', async () => {
    await Boost.create({
      boostId: 'BOOST-ORPHAN-1',
      eventId: '000000000000000000000000',
      position: 3,
      region: 'benin',
      price: 3.99,
      days: 1,
      userId: 'org-3',
      purchasedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      status: 'active',
    })

    const result = await listActiveBoostsForAgent()
    expect(result.active).toHaveLength(1)
    expect(result.active[0].eventName).toBe('Événement 000000000000000000000000')
    expect(result.active[0].organizerName).toBe('')
  })
})
