// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/staffEvents.ts —
// fusion de l'ancien /scanner (index, événements possédés) dans /my-shifts
// (événements où l'utilisateur est staffé), voir le commentaire en tête de
// listMyStaffedEvents.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { listMyStaffedEvents } from '../organizer/staffEvents'
import { addEventStaff } from '../events/eventStaff'
import { createOrganizerEvent } from '../organizer/organizerEvents'
import Event from '@/lib/models/Event'
import EventStaff from '@/lib/models/EventStaff'
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
  await EventStaff.deleteMany({})
  await User.deleteMany({})
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash('correct-password', 10)
  const user = await User.create({ email: `staff-${Math.random().toString(36).slice(2)}@test.com`, passwordHash, firstName: 'Staff', lastName: 'Test', roles: ['client'], activeRole: 'client', ...overrides })
  return String(user._id)
}

async function seedEvent(ownerId: string, date = '2026-12-31') {
  const result = await createOrganizerEvent(
    { id: ownerId },
    'Organisateur Test',
    { name: `Soirée ${ownerId}-${date}`, date, city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'Standard', price: 20, total: 100 }] }
  )
  if (!result.ok) throw new Error('seed failed')
  return result.eventId
}

describeIntegration('staffEvents (intégration, vraie base) — fusion /scanner index → /my-shifts', () => {
  it("liste un événement possédé même sans ligne roster (rôle synthétique 'owner')", async () => {
    const eventId = await seedEvent('owner-1')
    const events = await listMyStaffedEvents({ id: 'owner-1' })
    expect(events).toHaveLength(1)
    expect(events[0].eventId).toBe(eventId)
    expect(events[0].role).toBe('owner')
  })

  it('liste aussi un événement où l’utilisateur est staffé (roster), pas seulement possédé', async () => {
    const staffUserId = await seedUser()
    const eventId = await seedEvent('owner-2')
    await addEventStaff({ id: 'owner-2' }, eventId, { targetUserId: staffUserId, role: 'scan' })
    const events = await listMyStaffedEvents({ id: staffUserId })
    expect(events).toHaveLength(1)
    expect(events[0].eventId).toBe(eventId)
    expect(events[0].role).toBe('scan')
  })

  it("ne duplique pas un événement où l'utilisateur est À LA FOIS propriétaire et staffé (rôle roster prioritaire)", async () => {
    // addEventStaff refuse explicitement le self-staffing (lib/server/eventStaff.ts) —
    // ce cas n'est donc pas atteignable via l'API réelle. On insère la ligne
    // roster directement au niveau modèle pour vérifier que listMyStaffedEvents
    // reste correct (pas de doublon, rôle roster prioritaire) si cette donnée
    // existait quand même (défensif, pas un chemin API).
    const ownerUserId = await seedUser()
    const eventId = await seedEvent(ownerUserId)
    await EventStaff.create({ eventId, roster: { [ownerUserId]: { role: 'manager', addedBy: ownerUserId } } })
    const events = await listMyStaffedEvents({ id: ownerUserId })
    expect(events).toHaveLength(1)
    expect(events[0].role).toBe('manager')
  })

  it('fusionne les deux ensembles (possédé + staffé sur un événement différent) sans doublon', async () => {
    const userId = await seedUser()
    const otherOrganizerId = await seedUser()
    const ownedEventId = await seedEvent(userId)
    const staffedEventId = await seedEvent(otherOrganizerId)
    await addEventStaff({ id: otherOrganizerId }, staffedEventId, { targetUserId: userId, role: 'serveur' })

    const events = await listMyStaffedEvents({ id: userId })
    const ids = events.map((e) => e.eventId).sort()
    expect(ids).toEqual([ownedEventId, staffedEventId].sort())
    const owned = events.find((e) => e.eventId === ownedEventId)
    const staffed = events.find((e) => e.eventId === staffedEventId)
    expect(owned?.role).toBe('owner')
    expect(staffed?.role).toBe('serveur')
  })

  it('ne renvoie rien pour un utilisateur sans événement possédé ni staffé', async () => {
    const events = await listMyStaffedEvents({ id: 'nobody' })
    expect(events).toEqual([])
  })
})
