// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/organizerBookings.ts
// (#7 phase organisateur — port de BookingsPanel, détail des réservations).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { getEventBookings } from '../organizerBookings'
import { createOrganizerEvent } from '../organizerEvents'
import Event from '../../models/Event'
import Ticket from '../../models/Ticket'
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
  await Event.deleteMany({})
  await Ticket.deleteMany({})
  await User.deleteMany({})
})

describeIntegration('organizerBookings (intégration, vraie base) — détail des réservations (#7)', () => {
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
    expect(paidTicket?.preorders).toEqual([{ name: 'Bière', price: 5, qty: 1 }])

    const guestTicket = result.view.tickets.find((t) => t.ticketCode === 'TCK002')
    expect(guestTicket?.buyerName).toBe('Ami Invité')
  })
})
