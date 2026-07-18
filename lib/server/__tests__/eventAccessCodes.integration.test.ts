// Tests d'INTÉGRATION (vraie base MongoDB) pour les codes d'accès individuels
// d'un événement privé (#7 phase organisateur — lib/server/eventAccessCodes.ts).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { generateAccessCodes, listAccessCodes, consumeEventAccessCode } from '../eventAccessCodes'
import { createOrganizerEvent } from '../organizerEvents'
import Event from '../../models/Event'
import EventAccessCode from '../../models/EventAccessCode'

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
  await EventAccessCode.deleteMany({})
})

async function seedPrivateEvent(ownerId = 'org-1') {
  const result = await createOrganizerEvent(
    { id: ownerId },
    'Organisateur Test',
    { name: 'Soirée Privée', date: '2026-12-31', city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'Standard', price: 20, total: 100 }], isPrivate: true }
  )
  if (!result.ok) throw new Error('seed failed')
  return result.eventId
}

async function seedPublicEvent(ownerId = 'org-1') {
  const result = await createOrganizerEvent(
    { id: ownerId },
    'Organisateur Test',
    { name: 'Soirée Publique', date: '2026-12-31', city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'Standard', price: 20, total: 100 }] }
  )
  if (!result.ok) throw new Error('seed failed')
  return result.eventId
}

describeIntegration('eventAccessCodes (intégration, vraie base) — codes individuels (#7)', () => {
  describe('generateAccessCodes', () => {
    it("refuse pour quelqu'un d'autre que le propriétaire", async () => {
      const eventId = await seedPrivateEvent()
      const result = await generateAccessCodes({ id: 'intrus' }, eventId, 5)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('forbidden')
    })

    it('refuse pour un événement public', async () => {
      const eventId = await seedPublicEvent()
      const result = await generateAccessCodes({ id: 'org-1' }, eventId, 5)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('event_not_private')
    })

    it('génère N codes uniques, plafonné à 100', async () => {
      const eventId = await seedPrivateEvent()
      const result = await generateAccessCodes({ id: 'org-1' }, eventId, 10)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.codes).toHaveLength(10)
      expect(new Set(result.codes).size).toBe(10)

      const overResult = await generateAccessCodes({ id: 'org-1' }, eventId, 500)
      expect(overResult.ok).toBe(true)
      if (!overResult.ok) return
      expect(overResult.codes).toHaveLength(100)
    })
  })

  describe('consumeEventAccessCode', () => {
    it('accepte un code valide, une seule fois', async () => {
      const eventId = await seedPrivateEvent()
      const gen = await generateAccessCodes({ id: 'org-1' }, eventId, 1)
      if (!gen.ok) throw new Error('setup failed')
      const [code] = gen.codes

      const first = await consumeEventAccessCode(eventId, code, 'guest-1')
      expect(first).toBe(true)

      const second = await consumeEventAccessCode(eventId, code, 'guest-2')
      expect(second).toBe(false) // déjà utilisé
    })

    it('refuse un code inconnu', async () => {
      const eventId = await seedPrivateEvent()
      const result = await consumeEventAccessCode(eventId, 'INCONNU1')
      expect(result).toBe(false)
    })

    it('accepte un appelant anonyme (usedBy=null)', async () => {
      const eventId = await seedPrivateEvent()
      const gen = await generateAccessCodes({ id: 'org-1' }, eventId, 1)
      if (!gen.ok) throw new Error('setup failed')

      const result = await consumeEventAccessCode(eventId, gen.codes[0])
      expect(result).toBe(true)
    })
  })

  describe('listAccessCodes', () => {
    it('reflète le statut used/unused', async () => {
      const eventId = await seedPrivateEvent()
      const gen = await generateAccessCodes({ id: 'org-1' }, eventId, 2)
      if (!gen.ok) throw new Error('setup failed')
      await consumeEventAccessCode(eventId, gen.codes[0], 'guest-1')

      const result = await listAccessCodes({ id: 'org-1' }, eventId)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const used = result.codes.find((c) => c.code === gen.codes[0])
      const unused = result.codes.find((c) => c.code === gen.codes[1])
      expect(used?.usedBy).toBe('guest-1')
      expect(unused?.usedBy).toBeNull()
    })
  })
})
