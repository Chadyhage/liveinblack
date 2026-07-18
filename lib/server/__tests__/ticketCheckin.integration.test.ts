// Tests d'INTÉGRATION (vraie base MongoDB, transactions réelles) pour le
// check-in de billet (fixe l'audit #75 anti-farming de points, ferme #79
// nonce d'entrée, et hérite d'une nouvelle règle server-side : événement
// terminé → check-in refusé, plus seulement une garde côté client legacy).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { checkinTicket } from '../ticketCheckin'
import { signTicketToken } from '../ticketToken'
import Event from '../../models/Event'
import Ticket from '../../models/Ticket'
import EventStaff from '../../models/EventStaff'
import User from '../../models/User'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

beforeAll(async () => {
  if (!RUN_INTEGRATION) return
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-checkin-integration'
  await mongoose.connect(TEST_URI)
}, 20000)

afterAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

beforeEach(async () => {
  if (!RUN_INTEGRATION) return
  await Promise.all([Event.deleteMany({}), Ticket.deleteMany({}), EventStaff.deleteMany({}), User.deleteMany({})])
})

async function seedEvent(overrides: Record<string, unknown> = {}) {
  return Event.create({
    name: 'Test Event',
    date: '2099-01-01',
    time: '22:00',
    endTime: '05:00',
    currency: 'EUR',
    createdBy: 'organizer-1',
    organizerId: 'organizer-1',
    places: [
      { id: 'p1', type: 'Standard', price: 20, available: 3, total: 3 },
      { id: 'free', type: 'Gratuit', price: 0, available: 3, total: 3 },
    ],
    ...overrides,
  })
}

async function seedHolder(overrides: Record<string, unknown> = {}) {
  return User.create({
    email: `holder-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: 'x',
    roles: ['client'],
    activeRole: 'client',
    points: 0,
    ...overrides,
  })
}

// userId doit être un ObjectId Mongo valide (comme en production, où il vient
// toujours de session.user.id = String(user._id)) — on seed un titulaire réel
// par défaut plutôt qu'une chaîne arbitraire, sauf si le test fournit le sien.
async function seedTicket(eventId: string, overrides: Record<string, unknown> = {}) {
  const userId = (overrides.userId as string | undefined) ?? (await seedHolder()).id
  return Ticket.create({
    ticketCode: 'TICK0001',
    eventId,
    eventName: 'Test Event',
    eventDate: '1 janvier 2099',
    place: 'Standard',
    placePrice: 20,
    totalPrice: 20,
    currency: 'EUR',
    paid: true,
    ...overrides,
    userId,
  })
}

describeIntegration('checkinTicket (intégration, transaction réelle)', () => {
  it('accorde le point de fidélité au titulaire courant pour un billet payé', async () => {
    const event = await seedEvent()
    const holder = await seedHolder()
    await seedTicket(event.id, { userId: holder.id })

    const result = await checkinTicket({ id: 'organizer-1', roles: ['organisateur'] }, { ticketCode: 'TICK0001' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.alreadyCheckedIn).toBe(false)
    expect(result.pointAwarded).toBe(true)

    const freshHolder = await User.findById(holder.id).lean()
    expect(freshHolder?.points).toBe(1)
    const freshTicket = await Ticket.findOne({ ticketCode: 'TICK0001' }).lean()
    expect(freshTicket?.checkedInAt).toBeTruthy()
    expect(freshTicket?.checkedInBy).toBe('organizer-1')
  })

  it('est idempotent : un second check-in ne recrédite jamais de point', async () => {
    const event = await seedEvent()
    const holder = await seedHolder()
    await seedTicket(event.id, { userId: holder.id })

    await checkinTicket({ id: 'organizer-1', roles: ['organisateur'] }, { ticketCode: 'TICK0001' })
    const second = await checkinTicket({ id: 'organizer-1', roles: ['organisateur'] }, { ticketCode: 'TICK0001' })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.alreadyCheckedIn).toBe(true)
    expect(second.pointAwarded).toBe(false)

    const freshHolder = await User.findById(holder.id).lean()
    expect(freshHolder?.points).toBe(1)
  })

  it("refuse un billet gratuit (place à 0) sans crediter de point (anti-farming #75)", async () => {
    const event = await seedEvent()
    const holder = await seedHolder()
    await seedTicket(event.id, { userId: holder.id, place: 'Gratuit', placePrice: 0, totalPrice: 0, paid: false })

    const result = await checkinTicket({ id: 'organizer-1', roles: ['organisateur'] }, { ticketCode: 'TICK0001' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pointAwarded).toBe(false)

    const freshHolder = await User.findById(holder.id).lean()
    expect(freshHolder?.points).toBe(0)
  })

  it('refuse un billet non payé pour une place payante (not_entitled)', async () => {
    const event = await seedEvent()
    await seedTicket(event.id, { paid: false })

    const result = await checkinTicket({ id: 'organizer-1', roles: ['organisateur'] }, { ticketCode: 'TICK0001' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
    expect(result.error).toBe('not_entitled')
  })

  it('signale un paiement en attente distinctement (payment_pending)', async () => {
    const event = await seedEvent()
    await seedTicket(event.id, { paid: false, stripeSessionId: 'cs_test_123' })

    const result = await checkinTicket({ id: 'organizer-1', roles: ['organisateur'] }, { ticketCode: 'TICK0001' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('payment_pending')
  })

  it('refuse un billet révoqué', async () => {
    const event = await seedEvent()
    await seedTicket(event.id, { revoked: true })

    const result = await checkinTicket({ id: 'organizer-1', roles: ['organisateur'] }, { ticketCode: 'TICK0001' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
    expect(result.error).toBe('revoked')
  })

  it("refuse un scan par quelqu'un qui n'est ni agent, ni organisateur de l'event, ni staff", async () => {
    const event = await seedEvent()
    await seedTicket(event.id)

    const result = await checkinTicket({ id: 'random-user', roles: ['client'] }, { ticketCode: 'TICK0001' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(403)
    expect(result.error).toBe('forbidden')
  })

  it('autorise un membre du staff (serveur) mais refuse un DJ (#75)', async () => {
    const event = await seedEvent()
    await seedTicket(event.id)
    await EventStaff.create({
      eventId: event.id,
      roster: { 'staff-server': { role: 'serveur', addedBy: 'organizer-1' }, 'staff-dj': { role: 'dj', addedBy: 'organizer-1' } },
    })

    const asServer = await checkinTicket({ id: 'staff-server', roles: ['client'] }, { ticketCode: 'TICK0001' })
    expect(asServer.ok).toBe(true)

    await Ticket.updateOne({ ticketCode: 'TICK0001' }, { $set: { checkedInAt: null, checkedInBy: null } })
    const asDj = await checkinTicket({ id: 'staff-dj', roles: ['client'] }, { ticketCode: 'TICK0001' })
    expect(asDj.ok).toBe(false)
    if (asDj.ok) return
    expect(asDj.error).toBe('forbidden')
  })

  it("un agent peut toujours scanner, quel que soit l'événement", async () => {
    const event = await seedEvent()
    await seedTicket(event.id)

    const result = await checkinTicket({ id: 'some-agent', roles: ['agent'] }, { ticketCode: 'TICK0001' })
    expect(result.ok).toBe(true)
  })

  it('refuse le check-in pour un événement déjà terminé', async () => {
    const event = await seedEvent({ date: '2020-01-01', time: '22:00', endTime: '05:00' })
    await seedTicket(event.id)

    const result = await checkinTicket({ id: 'organizer-1', roles: ['organisateur'] }, { ticketCode: 'TICK0001' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('event_ended')
  })

  it('accepte un jeton QR à jour et le rejette une fois périmé (siège réattribué, #79)', async () => {
    const event = await seedEvent()
    await seedTicket(event.id, { tableId: 'tbl_1', seatVersion: 1, entryNonce: 'nonce-v1' })

    const staleToken = signTicketToken({ ticketCode: 'TICK0001', seatVersion: 1, entryNonce: 'nonce-v1' })

    // Le siège est réattribué : seatVersion et entryNonce tournent en base.
    await Ticket.updateOne({ ticketCode: 'TICK0001' }, { $set: { seatVersion: 2, entryNonce: 'nonce-v2' } })

    const withStale = await checkinTicket({ id: 'organizer-1', roles: ['organisateur'] }, { token: staleToken })
    expect(withStale.ok).toBe(false)
    if (withStale.ok) return
    expect(withStale.error).toBe('stale_or_invalid_token')

    const freshToken = signTicketToken({ ticketCode: 'TICK0001', seatVersion: 2, entryNonce: 'nonce-v2' })
    const withFresh = await checkinTicket({ id: 'organizer-1', roles: ['organisateur'] }, { token: freshToken })
    expect(withFresh.ok).toBe(true)
  })

  it("refuse une saisie manuelle (sans jeton) pour un siège déjà réattribué", async () => {
    const event = await seedEvent()
    await seedTicket(event.id, { tableId: 'tbl_1', seatVersion: 2, entryNonce: 'nonce-v2' })

    const result = await checkinTicket({ id: 'organizer-1', roles: ['organisateur'] }, { ticketCode: 'TICK0001' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('manual_entry_not_allowed_for_reassigned_seat')
  })

  it("accepte une saisie manuelle pour un billet solo jamais réattribué", async () => {
    const event = await seedEvent()
    await seedTicket(event.id)

    const result = await checkinTicket({ id: 'organizer-1', roles: ['organisateur'] }, { ticketCode: 'TICK0001' })
    expect(result.ok).toBe(true)
  })
})
