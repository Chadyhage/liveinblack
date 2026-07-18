// Tests d'INTÉGRATION (vraie base MongoDB) pour le contrôle d'accès et le
// câblage serveur des statistiques événement (#7 phase organisateur —
// lib/server/eventStats.ts). Le calcul lui-même est déjà couvert par les
// tests unitaires purs de lib/shared/eventStats.ts.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { getEventStats } from '../eventStats'
import { createOrganizerEvent } from '../organizerEvents'
import Event from '../../models/Event'
import Ticket from '../../models/Ticket'

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
})

async function seedEvent(ownerId = 'org-1') {
  const result = await createOrganizerEvent(
    { id: ownerId },
    'Organisateur Test',
    { name: 'Soirée Test', date: '2020-01-01', city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'Standard', price: 20, total: 100 }] }
  )
  if (!result.ok) throw new Error('seed failed')
  return result.eventId
}

describeIntegration('eventStats (intégration, vraie base) — accès et câblage (#7)', () => {
  it("refuse l'accès à quelqu'un d'autre que le propriétaire ou un agent", async () => {
    const eventId = await seedEvent()
    const result = await getEventStats({ id: 'intrus', roles: ['client'] }, eventId)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('forbidden')
  })

  it('autorise un agent quel que soit le propriétaire', async () => {
    const eventId = await seedEvent()
    const result = await getEventStats({ id: 'agent-1', roles: ['agent'] }, eventId)
    expect(result.ok).toBe(true)
  })

  it('autorise le propriétaire et renvoie des stats cohérentes avec les vrais billets', async () => {
    const eventId = await seedEvent()
    const buyer1 = new mongoose.Types.ObjectId().toString()
    const buyer2 = new mongoose.Types.ObjectId().toString()
    await Ticket.create([
      { ticketCode: 'TCK001', eventId, place: 'Standard', placePrice: 20, totalPrice: 20, currency: 'XOF', userId: buyer1, paid: true, bookedAt: new Date() },
      { ticketCode: 'TCK002', eventId, place: 'Standard', placePrice: 20, totalPrice: 20, currency: 'XOF', userId: buyer2, paid: true, checkedInAt: new Date(), bookedAt: new Date() },
    ])

    const result = await getEventStats({ id: 'org-1', roles: ['organisateur'] }, eventId)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.view.stats.assignedTickets).toBe(2)
    expect(result.view.stats.estimatedRevenue).toBe(40)
    expect(result.view.stats.present).toBe(1)
    expect(result.view.placeOptions).toContain('Standard')
  })

  it('applique le filtre de catégorie transmis en paramètre', async () => {
    const eventId = await seedEvent()
    const buyer1 = new mongoose.Types.ObjectId().toString()
    const buyer2 = new mongoose.Types.ObjectId().toString()
    await Ticket.create([
      { ticketCode: 'TCK001', eventId, place: 'Standard', placePrice: 20, totalPrice: 20, currency: 'XOF', userId: buyer1, paid: true, bookedAt: new Date() },
      { ticketCode: 'TCK002', eventId, place: 'VIP', placePrice: 50, totalPrice: 50, currency: 'XOF', userId: buyer2, paid: true, bookedAt: new Date() },
    ])

    const result = await getEventStats({ id: 'org-1', roles: ['organisateur'] }, eventId, { place: 'VIP' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.view.stats.assignedTickets).toBe(1)
  })
})
