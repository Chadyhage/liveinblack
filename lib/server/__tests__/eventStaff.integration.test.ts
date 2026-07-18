// Tests d'INTÉGRATION (vraie base MongoDB) pour l'équipe d'un événement (#7
// phase organisateur — lib/server/eventStaff.ts, port d'EventStaffModal.jsx).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { addEventStaff, removeEventStaff, listEventStaff } from '../eventStaff'
import { createOrganizerEvent } from '../organizerEvents'
import Event from '../../models/Event'
import EventStaff from '../../models/EventStaff'
import EventOrder from '../../models/EventOrder'
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
  await EventStaff.deleteMany({})
  await EventOrder.deleteMany({})
  await User.deleteMany({})
})

async function seedEvent(ownerId = 'org-1') {
  const result = await createOrganizerEvent(
    { id: ownerId },
    'Organisateur Test',
    { name: 'Soirée Test', date: '2026-12-31', city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'Standard', price: 20, total: 100 }] }
  )
  if (!result.ok) throw new Error('seed failed')
  return result.eventId
}

async function seedUser(overrides: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash('correct-password', 10)
  return User.create({ email: `staff-${Math.random().toString(36).slice(2)}@test.com`, passwordHash, firstName: 'Staff', lastName: 'Test', roles: ['client'], activeRole: 'client', ...overrides })
}

describeIntegration('eventStaff (intégration, vraie base) — équipe (#7)', () => {
  describe('addEventStaff', () => {
    it("refuse pour quelqu'un d'autre que le propriétaire", async () => {
      const eventId = await seedEvent()
      const target = await seedUser()
      const result = await addEventStaff({ id: 'intrus' }, eventId, { targetUserId: target.id, role: 'scan' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('forbidden')
    })

    it('refuse un rôle non invitable (manager)', async () => {
      const eventId = await seedEvent()
      const target = await seedUser()
      const result = await addEventStaff({ id: 'org-1' }, eventId, { targetUserId: target.id, role: 'manager' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('invalid_role')
    })

    it("refuse de s'auto-inviter", async () => {
      const eventId = await seedEvent()
      const result = await addEventStaff({ id: 'org-1' }, eventId, { targetUserId: 'org-1', role: 'scan' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('cannot_invite_self')
    })

    it('ajoute un membre au roster', async () => {
      const eventId = await seedEvent()
      const target = await seedUser({ firstName: 'Jean', lastName: 'Dupont' })
      const result = await addEventStaff({ id: 'org-1' }, eventId, { targetUserId: target.id, role: 'serveur' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.member.name).toBe('Jean Dupont')

      const list = await listEventStaff({ id: 'org-1' }, eventId)
      expect(list.ok).toBe(true)
      if (!list.ok) return
      expect(list.members).toHaveLength(1)
      expect(list.members[0].role).toBe('serveur')
    })

    it('refuse un double-ajout du même membre', async () => {
      const eventId = await seedEvent()
      const target = await seedUser()
      await addEventStaff({ id: 'org-1' }, eventId, { targetUserId: target.id, role: 'scan' })
      const result = await addEventStaff({ id: 'org-1' }, eventId, { targetUserId: target.id, role: 'serveur' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('already_staff')
    })

    it('inviter un DJ active la playlist si elle ne l’était pas déjà', async () => {
      const eventId = await seedEvent()
      const target = await seedUser()
      const before = await Event.findById(eventId).lean()
      expect(before?.playlist).toBe(false)

      await addEventStaff({ id: 'org-1' }, eventId, { targetUserId: target.id, role: 'dj' })

      const after = await Event.findById(eventId).lean()
      expect(after?.playlist).toBe(true)
    })
  })

  describe('removeEventStaff', () => {
    it('retire un membre sans commandes actives', async () => {
      // removeEventStaff résout le nom du manager via User.findById(caller.id)
      // (journal de réattribution) — l'appelant doit donc être un VRAI compte,
      // contrairement aux autres tests de ce fichier où l'id littéral 'org-1'
      // suffit (aucun lookup User n'y est fait).
      const owner = await seedUser({ firstName: 'Owner', lastName: 'Test' })
      const eventId = await seedEvent(owner.id)
      const target = await seedUser()
      await addEventStaff({ id: owner.id }, eventId, { targetUserId: target.id, role: 'serveur' })

      const result = await removeEventStaff({ id: owner.id }, eventId, target.id)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.reassignedCount).toBe(0)

      const list = await listEventStaff({ id: owner.id }, eventId)
      expect(list.ok && list.members).toHaveLength(0)
    })

    it('réattribue au propriétaire les lignes de commande actives du membre retiré', async () => {
      const owner = await seedUser({ firstName: 'Owner', lastName: 'Test' })
      const eventId = await seedEvent(owner.id)
      const target = await seedUser({ firstName: 'Serveur', lastName: 'Actif' })
      await addEventStaff({ id: owner.id }, eventId, { targetUserId: target.id, role: 'serveur' })

      await EventOrder.create({
        eventId,
        items: [
          { id: 'item-1', name: 'Bière', quantity: 2, unitPriceMinor: 500, ticketId: 'TCK1', addedBy: target.id, status: 'sent' },
          { id: 'item-2', name: 'Champagne', quantity: 1, unitPriceMinor: 5000, ticketId: 'TCK1', addedBy: target.id, status: 'served', servedAt: new Date() },
          { id: 'item-3', name: 'Vin', quantity: 1, unitPriceMinor: 2000, ticketId: 'TCK1', addedBy: target.id, status: 'cancelled', cancelledAt: new Date() },
        ],
      })

      const result = await removeEventStaff({ id: owner.id }, eventId, target.id)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.reassignedCount).toBe(1) // seul item-1 est actif (non servi, non payé, non annulé)

      const order = await EventOrder.findOne({ eventId }).lean()
      const item1 = order?.items.find((i) => i.id === 'item-1')
      const item2 = order?.items.find((i) => i.id === 'item-2')
      expect(item1?.addedBy).toBe(owner.id)
      expect(item2?.addedBy).toBe(target.id) // déjà servi, jamais touché
    })

    it("refuse pour quelqu'un d'autre que le propriétaire", async () => {
      const owner = await seedUser({ firstName: 'Owner', lastName: 'Test' })
      const eventId = await seedEvent(owner.id)
      const target = await seedUser()
      await addEventStaff({ id: owner.id }, eventId, { targetUserId: target.id, role: 'scan' })

      const result = await removeEventStaff({ id: 'intrus' }, eventId, target.id)
      expect(result.ok).toBe(false)
    })
  })
})
