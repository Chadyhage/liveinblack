// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/organizerBookings.ts
// (#7 phase organisateur — port de BookingsPanel, détail des réservations).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { getEventBookings } from '../organizer/organizerBookings'
import { createOrganizerEvent } from '../organizer/organizerEvents'
import Event from '@/lib/models/Event'
import Ticket from '@/lib/models/Ticket'
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
  await Ticket.deleteMany({})
  await User.deleteMany({})
})

describeIntegration('organizerBookings (intégration, vraie base) — détail des réservations (#7)', () => {
  it('retourne event_not_found si l’événement demandé n’existe pas', async () => {
    const result = await getEventBookings({ id: 'org-1' }, new mongoose.Types.ObjectId().toString())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('event_not_found')
  })

  it('refuse un appelant qui ne possède pas l’événement', async () => {
    const mine = await createOrganizerEvent(
      { id: 'org-1' },
      'Organisateur Test',
      { name: 'Soirée', date: '2030-01-01', city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'Standard', price: 20, total: 100 }] }
    )
    if (!mine.ok) throw new Error('seed failed')

    const result = await getEventBookings({ id: 'intrus' }, mine.eventId)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })

  it('autorise aussi le créateur technique de l’événement quand il diffère de organizerId', async () => {
    const mine = await createOrganizerEvent(
      { id: 'org-1' },
      'Organisateur Test',
      { name: 'Soirée', date: '2030-01-01', city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'Standard', price: 20, total: 100 }] }
    )
    if (!mine.ok) throw new Error('seed failed')
    await Event.updateOne({ _id: mine.eventId }, { $set: { createdBy: 'staff-creator' } })

    const buyer = await User.create({ email: `${new mongoose.Types.ObjectId().toString()}@test.com`, passwordHash: 'x', firstName: 'Ada', lastName: 'Lovelace' })
    await Ticket.create({
      ticketCode: 'CRBY001',
      eventId: mine.eventId,
      place: 'Standard',
      placePrice: 20,
      totalPrice: 20,
      currency: 'XOF',
      userId: String(buyer._id),
      paid: true,
      bookedAt: new Date(),
    })

    const result = await getEventBookings({ id: 'staff-creator' }, mine.eventId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.view.ticketCount).toBe(1)
    expect(result.view.tickets[0].buyerName).toBe('Ada Lovelace')
  })

  it('agrège le détail par billet, le résumé par place et les précommandes, en excluant les révoqués', async () => {
    const mine = await createOrganizerEvent(
      { id: 'org-1' },
      'Organisateur Test',
      { name: 'Soirée', date: '2030-01-01', city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'VIP', price: 20, total: 100 }] }
    )
    if (!mine.ok) throw new Error('seed failed')

    const buyer = await User.create({ email: `${new mongoose.Types.ObjectId().toString()}@test.com`, passwordHash: 'x', firstName: 'Ada', lastName: 'Lovelace' })
    // guestName ne co-existe qu'avec un billet 'guestlist' — son userId est
    // TOUJOURS celui de l'organisateur lui-même (voir lib/server/guestlist.ts:
    // addGuestlistEntry, userId: caller.id), donc toujours un ObjectId réel en
    // production — jamais une chaîne arbitraire.
    const organizerUser = await User.create({ email: `${new mongoose.Types.ObjectId().toString()}@test.com`, passwordHash: 'x', firstName: 'Org', lastName: 'Anisateur' })

    await Ticket.create([
      {
        ticketCode: 'TCK001',
        eventId: mine.eventId,
        place: 'VIP',
        placePrice: 20,
        totalPrice: 25,
        currency: 'XOF',
        userId: String(buyer._id),
        paid: true,
        bookedAt: new Date(),
        preorders: [{ name: 'Bière', price: 5, qty: 1 }],
      },
      {
        ticketCode: 'TCK002',
        eventId: mine.eventId,
        place: 'VIP',
        placePrice: 0,
        totalPrice: 0,
        currency: 'XOF',
        userId: String(organizerUser._id),
        guestName: 'Ami Invité',
        paid: false,
        source: 'guestlist',
        bookedAt: new Date(),
      },
      {
        ticketCode: 'TCK003',
        eventId: mine.eventId,
        place: 'VIP',
        placePrice: 20,
        totalPrice: 20,
        currency: 'XOF',
        userId: String(buyer._id),
        paid: true,
        revoked: true,
        bookedAt: new Date(),
      },
    ])

    const result = await getEventBookings({ id: 'org-1' }, mine.eventId)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.view.ticketCount).toBe(2)
    expect(result.view.summaryByPlace).toEqual([{ place: 'VIP', count: 2 }])
    expect(result.view.preorderSummary).toEqual([{ name: 'Bière', qty: 1 }])

    const paidTicket = result.view.tickets.find((t) => t.ticketCode === 'TCK001')
    expect(paidTicket?.buyerName).toBe('Ada Lovelace')
    expect(paidTicket?.preorders).toEqual([{ name: 'Bière', price: 5, qty: 1, showLabel: null, showInfo: null }])

    const guestTicket = result.view.tickets.find((t) => t.ticketCode === 'TCK002')
    expect(guestTicket?.buyerName).toBe('Ami Invité')
  })

  it('ne casse pas si un billet porte un userId invalide et retombe sur buyerName null', async () => {
    const mine = await createOrganizerEvent(
      { id: 'org-1' },
      'Organisateur Test',
      { name: 'Soirée', date: '2030-01-01', city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'VIP', price: 20, total: 100 }] }
    )
    if (!mine.ok) throw new Error('seed failed')

    await Ticket.create({
      ticketCode: 'BROKEN01',
      eventId: mine.eventId,
      place: 'VIP',
      placePrice: 20,
      totalPrice: 20,
      currency: 'XOF',
      userId: 'not-a-valid-object-id',
      paid: true,
      bookedAt: new Date(),
    })

    const result = await getEventBookings({ id: 'org-1' }, mine.eventId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.view.ticketCount).toBe(1)
    expect(result.view.tickets[0].buyerName).toBeNull()
  })

  it('applique les fallbacks métier sur la place Standard et les précommandes incomplètes', async () => {
    const mine = await createOrganizerEvent(
      { id: 'org-1' },
      'Organisateur Test',
      { name: 'Soirée', date: '2030-01-01', city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'VIP', price: 20, total: 100 }] }
    )
    if (!mine.ok) throw new Error('seed failed')

    const buyer = await User.create({ email: `${new mongoose.Types.ObjectId().toString()}@test.com`, passwordHash: 'x', firstName: 'Grace', lastName: 'Hopper' })
    await Ticket.create({
      ticketCode: 'STD001',
      eventId: mine.eventId,
      place: '',
      placePrice: undefined,
      totalPrice: undefined,
      currency: 'XOF',
      userId: String(buyer._id),
      paid: true,
      bookedAt: new Date(),
      preorders: [{ name: 'Soft', qty: undefined, price: undefined }],
    })

    const result = await getEventBookings({ id: 'org-1' }, mine.eventId)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.view.summaryByPlace).toEqual([{ place: 'Standard', count: 1 }])
    expect(result.view.preorderSummary).toEqual([{ name: 'Soft', qty: 1 }])
    expect(result.view.tickets[0]).toMatchObject({
      ticketCode: 'STD001',
      place: 'Standard',
      placePrice: 0,
      totalPrice: 0,
      buyerName: 'Grace Hopper',
      preorders: [{ name: 'Soft', qty: 1, price: 0, showLabel: null, showInfo: null }],
    })
  })
})
