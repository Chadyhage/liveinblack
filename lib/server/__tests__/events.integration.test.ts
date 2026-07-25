// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/events.ts — logique
// derrière les nouvelles routes JSON publiques app/api/events/route.ts et
// app/api/events/[eventId]/route.ts (ajoutées pour LIB_Mobile, qui n'a pas
// accès aux composants serveur Next.js utilisés par le web pour ces mêmes
// écrans). Les routes elles-mêmes sont de purs pass-through — cette suite
// couvre le comportement réel (visibilité publique, verrouillage privé).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { listPublicEvents, searchPublicEvents, getEventById, verifyPrivateEventCode, hashCode } from '../events'
import { signEventUnlock, verifyEventUnlockToken } from '../eventUnlock'
import { createOrganizerEvent } from '../organizerEvents'
import Event from '../../models/Event'
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
  await EventOrder.deleteMany({})
  await User.deleteMany({})
})

async function seedEvent(overrides: Partial<Record<string, unknown>> = {}) {
  const inTenDays = new Date(Date.now() + 10 * 24 * 3600_000)
  const result = await createOrganizerEvent(
    { id: 'org-1' },
    'Organisateur Test',
    {
      name: 'Soirée Test',
      date: inTenDays.toISOString().slice(0, 10),
      city: 'Lomé',
      region: 'Togo',
      places: [{ id: '', type: 'Standard', price: 20, total: 100 }],
    }
  )
  if (!result.ok) throw new Error('setup failed')
  if (Object.keys(overrides).length) {
    await Event.updateOne({ _id: result.eventId }, { $set: overrides })
  }
  return result.eventId
}

describeIntegration('events (intégration, vraie base) — routes JSON publiques (#mobile)', () => {
  describe('listPublicEvents', () => {
    it('exclut les événements privés et annulés', async () => {
      await seedEvent({ name: 'Public' })
      await seedEvent({ name: 'Privé', isPrivate: true })
      await seedEvent({ name: 'Annulé', cancelled: true })

      const events = await listPublicEvents()
      expect(events.map((e) => e.name)).toEqual(['Public'])
    })
  })

  describe('searchPublicEvents', () => {
    it('renvoie une liste vide pour une requête vide', async () => {
      await seedEvent()
      expect(await searchPublicEvents('')).toEqual([])
    })
  })

  describe('getEventById + verrouillage', () => {
    it("un événement privé n'est visible qu'avec unlocked=true", async () => {
      const id = await seedEvent({ isPrivate: true })

      const locked = await getEventById(id)
      expect(locked).toEqual({ status: 'locked', id })

      const unlocked = await getEventById(id, { unlocked: true })
      expect(unlocked.status).toBe('ok')
    })

    it('renvoie not_found pour un id invalide ou inexistant', async () => {
      expect(await getEventById('not-an-object-id')).toEqual({ status: 'not_found' })
      expect(await getEventById(new mongoose.Types.ObjectId().toString())).toEqual({ status: 'not_found' })
    })
  })

  describe('déverrouillage : code + cookie signé (miroir POST /api/events/[eventId]/unlock)', () => {
    it('un code correct valide, un jeton de cookie signé pour cet event est ensuite vérifiable', async () => {
      const id = await seedEvent({ isPrivate: true, privateCodeHash: hashCode('SECRET1') })

      expect(await verifyPrivateEventCode(id, 'wrong')).toBe(false)
      expect(await verifyPrivateEventCode(id, 'secret1')).toBe(true) // insensible à la casse (hashCode normalise)

      const token = signEventUnlock(id)
      expect(verifyEventUnlockToken(id, token)).toBe(true)
      expect(verifyEventUnlockToken(id, 'faux-token')).toBe(false)
      // Le jeton d'un event ne doit jamais déverrouiller un autre event.
      expect(verifyEventUnlockToken('un-autre-id', token)).toBe(false)
    })
  })
})
