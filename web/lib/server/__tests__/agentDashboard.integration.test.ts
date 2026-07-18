// Tests d'INTÉGRATION (vraie base MongoDB) pour l'agrégation du tableau de
// bord agent (#101 phase agent/admin — lib/server/agentDashboard.ts). Même
// convention que applicationsAgent.integration.test.ts : skip automatique
// sans MONGODB_URI (RUN_INTEGRATION), pas de mock réseau nécessaire ici
// (aucun email, aucun rail de paiement externe appelé par cette fonction).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

import { getAgentDashboardStats } from '../agentDashboard'
import User from '../../models/User'
import Application from '../../models/Application'
import Event from '../../models/Event'
import Order from '../../models/Order'
import Ticket from '../../models/Ticket'
import Boost from '../../models/Boost'

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
    User.deleteMany({}),
    Application.deleteMany({}),
    Event.deleteMany({}),
    Order.deleteMany({}),
    Ticket.deleteMany({}),
    Boost.deleteMany({}),
  ])
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash('correct-password', 10)
  return User.create({
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash,
    firstName: 'Prenom',
    lastName: 'Nom',
    roles: ['client'],
    activeRole: 'client',
    ...overrides,
  })
}

describeIntegration('getAgentDashboardStats (intégration, vraie base) — #101 phase agent/admin', () => {
  it('compte les comptes, rôles et dossiers en attente', async () => {
    await seedUser({ activeRole: 'client' })
    const org1 = await seedUser({ activeRole: 'organisateur' })
    const prest1 = await seedUser({ activeRole: 'prestataire' })
    const prest2 = await seedUser({ activeRole: 'prestataire' })
    await seedUser({ activeRole: 'agent' })
    const otherUser = await seedUser({ activeRole: 'organisateur' })

    // Application est unique par (userId, type) — une candidature évolue par
    // transitions d'état, elle n'est jamais dupliquée pour le même user+type
    // (voir applications.ts). D'où 4 users distincts ici, pas 2.
    await Application.create({ userId: prest1.id, type: 'prestataire', status: 'submitted' })
    await Application.create({ userId: prest2.id, type: 'prestataire', status: 'draft' })
    await Application.create({ userId: otherUser.id, type: 'organisateur', status: 'under_review' })
    await Application.create({ userId: org1.id, type: 'organisateur', status: 'approved' })

    const stats = await getAgentDashboardStats()

    expect(stats.community.totalUsers).toBe(6)
    expect(stats.community.totalPrestataires).toBe(2)
    expect(stats.community.totalOrganisateurs).toBe(2)
    expect(stats.community.pendingDossiers).toBe(2) // submitted + under_review, pas draft ni approved
    expect(stats.roleBreakdown.find((r) => r.role === 'client')?.count).toBe(1)
    expect(stats.roleBreakdown.find((r) => r.role === 'prestataire')?.count).toBe(2)
    expect(stats.roleBreakdown.find((r) => r.role === 'organisateur')?.count).toBe(2)
    // 'agent' n'apparaît jamais dans la répartition (exclu, comme le legacy)
    expect(stats.roleBreakdown.map((r) => r.role)).not.toContain('agent')
  })

  it('compte "connectés" seulement pour lastSeenAt récent (fenêtre 45s)', async () => {
    await seedUser({ lastSeenAt: new Date() })
    await seedUser({ lastSeenAt: new Date(Date.now() - 5 * 60 * 1000) }) // vu il y a 5 min — hors fenêtre
    await seedUser({ lastSeenAt: null })

    const stats = await getAgentDashboardStats()
    expect(stats.community.totalOnline).toBe(1)
  })

  it('agrège les revenus/GMV par devise depuis les Order payés (billet + précommandes + frais)', async () => {
    const organizer = await seedUser({ activeRole: 'organisateur' })
    const buyer = await seedUser()
    const event = await Event.create({ name: 'Soirée Test', date: '2026-08-01', createdBy: organizer.id, organizerId: organizer.id, currency: 'EUR' })

    // Order EUR payé : billet 20,00€ (2000c) + précommande 5,00€ (500c) + frais 1,49€ (149c) = 26,49 GMV
    await Order.create({
      userId: buyer.id,
      eventId: String(event._id),
      placeId: 'p1',
      placeType: 'Standard',
      qty: 1,
      unitPriceMinor: 2000,
      currency: 'EUR',
      feeMinor: 149,
      preorders: [{ name: 'Cocktail', price: 500, qty: 1 }],
      rail: 'stripe',
      status: 'paid',
      paid: true,
      expiresAt: new Date(Date.now() + 3600_000),
    })
    // Order EUR non payé — ignoré
    await Order.create({
      userId: buyer.id,
      eventId: String(event._id),
      placeId: 'p1',
      placeType: 'Standard',
      qty: 1,
      unitPriceMinor: 2000,
      currency: 'EUR',
      feeMinor: 149,
      rail: 'stripe',
      status: 'pending',
      paid: false,
      expiresAt: new Date(Date.now() + 3600_000),
    })
    // Order XOF payé : billet 3000 + frais 450 = 3450 GMV
    await Order.create({
      userId: buyer.id,
      eventId: String(event._id),
      placeId: 'p2',
      placeType: 'VIP',
      qty: 1,
      unitPriceMinor: 3000,
      currency: 'XOF',
      feeMinor: 450,
      rail: 'fedapay',
      status: 'paid',
      paid: true,
      expiresAt: new Date(Date.now() + 3600_000),
    })

    await Boost.create({
      boostId: 'boost-1',
      eventId: String(event._id),
      position: 1,
      region: 'togo',
      price: 15,
      days: 3,
      userId: organizer.id,
      purchasedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
      status: 'active',
    })
    // Boost remboursé — exclu du GMV/revenu comme le legacy
    await Boost.create({
      boostId: 'boost-2',
      eventId: String(event._id),
      position: 2,
      region: 'togo',
      price: 15,
      days: 3,
      userId: organizer.id,
      purchasedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600_000),
      status: 'refunded_conflict',
    })

    const stats = await getAgentDashboardStats()

    expect(stats.revenue.ticketFeeRevenueEUR).toBeCloseTo(1.49, 2)
    expect(stats.revenue.gmvTicketsEUR).toBeCloseTo(26.49, 2)
    expect(stats.revenue.ticketFeeRevenueXOF).toBe(450)
    expect(stats.revenue.gmvTicketsXOF).toBe(3450)
    expect(stats.revenue.gmvBoosts).toBe(15)
    expect(stats.revenue.platformRevenueEUR).toBeCloseTo(1.49 + 15, 2)
  })

  it('compte les billets réellement émis (paid:true), exclut les billets gratuits/guestlist', async () => {
    const organizer = await seedUser({ activeRole: 'organisateur' })
    const event = await Event.create({ name: 'Soirée Test', date: '2026-08-01', createdBy: organizer.id, organizerId: organizer.id })

    await Ticket.create({ ticketCode: 'T1', eventId: String(event._id), userId: organizer.id, paid: true, bookedAt: new Date() })
    await Ticket.create({ ticketCode: 'T2', eventId: String(event._id), userId: organizer.id, paid: true, bookedAt: new Date() })
    await Ticket.create({ ticketCode: 'T3', eventId: String(event._id), userId: organizer.id, paid: false, source: 'guestlist' })

    const stats = await getAgentDashboardStats()
    expect(stats.tickets.totalSold).toBe(2)
    expect(stats.tickets.recentSold30d).toBe(2)
  })

  it('compte les events publiés et ceux à venir (fin > maintenant, non annulés)', async () => {
    const organizer = await seedUser({ activeRole: 'organisateur' })
    const past = new Date(Date.now() - 30 * 24 * 3600_000).toISOString().slice(0, 10)
    const future = new Date(Date.now() + 30 * 24 * 3600_000).toISOString().slice(0, 10)

    await Event.create({ name: 'Passé', date: past, time: '22:00', endTime: '05:00', createdBy: organizer.id, organizerId: organizer.id })
    await Event.create({ name: 'Futur', date: future, time: '22:00', endTime: '05:00', createdBy: organizer.id, organizerId: organizer.id })
    await Event.create({ name: 'Futur annulé', date: future, time: '22:00', endTime: '05:00', createdBy: organizer.id, organizerId: organizer.id, cancelled: true })

    const stats = await getAgentDashboardStats()
    expect(stats.events.totalPublished).toBe(3)
    expect(stats.events.upcoming).toBe(1)
  })

  it('regroupe les inscriptions des 30 derniers jours par jour, total = 30 entrées', async () => {
    await seedUser()
    await seedUser()

    const stats = await getAgentDashboardStats()
    expect(stats.signupsLast30Days).toHaveLength(30)
    expect(stats.signupsLast30Days.reduce((s, d) => s + d.count, 0)).toBe(2)
    expect(stats.signupsLast30Days[29].count).toBe(2) // aujourd'hui
  })
})
