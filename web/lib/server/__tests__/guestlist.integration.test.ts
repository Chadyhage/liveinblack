// Tests d'INTÉGRATION (vraie base MongoDB) pour la guestlist organisateur
// (#7 phase organisateur — lib/server/guestlist.ts). Vérifie surtout que le
// stock partagé (Event.places[].available) est décrémenté/recrédité
// atomiquement, exactement comme une réservation payante.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { addGuestlistEntry, removeGuestlistEntry, listGuestlistEntries } from '../guestlist'
import { createOrganizerEvent } from '../organizerEvents'
import { checkinTicket } from '../ticketCheckin'
import Event from '../../models/Event'
import Ticket from '../../models/Ticket'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

beforeAll(async () => {
  if (!RUN_INTEGRATION) return
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-for-guestlist-integration'
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

async function seedEvent(ownerId = 'org-1', total = 5) {
  const result = await createOrganizerEvent(
    { id: ownerId },
    'Organisateur Test',
    { name: 'Soirée Test', date: '2026-12-31', city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'VIP', price: 50, total }] }
  )
  if (!result.ok) throw new Error('seed failed')
  const doc = await Event.findById(result.eventId).lean()
  return { eventId: result.eventId, placeId: doc!.places[0].id }
}

describeIntegration('guestlist (intégration, vraie base) — invitations gratuites (#7)', () => {
  describe('addGuestlistEntry', () => {
    it("refuse pour quelqu'un d'autre que le propriétaire", async () => {
      const { eventId, placeId } = await seedEvent()
      const result = await addGuestlistEntry({ id: 'intrus' }, { eventId, placeId, guestName: 'Ami Test' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('forbidden')
    })

    it('émet un billet gratuit et décrémente le stock partagé', async () => {
      const { eventId, placeId } = await seedEvent()
      const result = await addGuestlistEntry({ id: 'org-1' }, { eventId, placeId, guestName: 'Ami Test' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.entry.guestName).toBe('Ami Test')
      expect(result.entry.place).toBe('VIP')
      expect(result.entry.ticketUrl).toContain(`/ticket/${result.entry.ticketCode}.`)

      const ticket = await Ticket.findOne({ ticketCode: result.entry.ticketCode }).lean()
      expect(ticket?.source).toBe('guestlist')
      expect(ticket?.paid).toBe(false)
      expect(ticket?.placePrice).toBe(0)

      const doc = await Event.findById(eventId).lean()
      expect(doc?.places[0].available).toBe(4) // 5 - 1
    })

    it('refuse quand la place est épuisée', async () => {
      const { eventId, placeId } = await seedEvent('org-1', 1)
      await addGuestlistEntry({ id: 'org-1' }, { eventId, placeId, guestName: 'Premier' })
      const result = await addGuestlistEntry({ id: 'org-1' }, { eventId, placeId, guestName: 'Second' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('sold_out')
    })

    it('un billet guestlist permet le check-in même sur une place payante (source, pas prix)', async () => {
      const { eventId, placeId } = await seedEvent()
      const added = await addGuestlistEntry({ id: 'org-1' }, { eventId, placeId, guestName: 'Ami Test' })
      expect(added.ok).toBe(true)
      if (!added.ok) return

      const checkin = await checkinTicket({ id: 'org-1', roles: ['organisateur'] }, { ticketCode: added.entry.ticketCode })
      expect(checkin.ok).toBe(true)
    })
  })

  describe('removeGuestlistEntry', () => {
    it('recrédite le stock et révoque le billet', async () => {
      const { eventId, placeId } = await seedEvent()
      const added = await addGuestlistEntry({ id: 'org-1' }, { eventId, placeId, guestName: 'Ami Test' })
      if (!added.ok) throw new Error('setup failed')

      const result = await removeGuestlistEntry({ id: 'org-1' }, { eventId, ticketCode: added.entry.ticketCode })
      expect(result.ok).toBe(true)

      const ticket = await Ticket.findOne({ ticketCode: added.entry.ticketCode }).lean()
      expect(ticket?.revoked).toBe(true)

      const doc = await Event.findById(eventId).lean()
      expect(doc?.places[0].available).toBe(5) // recrédité
    })

    it("refuse de retirer un invité déjà entré (checkedInAt posé)", async () => {
      const { eventId, placeId } = await seedEvent()
      const added = await addGuestlistEntry({ id: 'org-1' }, { eventId, placeId, guestName: 'Ami Test' })
      if (!added.ok) throw new Error('setup failed')
      await checkinTicket({ id: 'org-1', roles: ['organisateur'] }, { ticketCode: added.entry.ticketCode })

      const result = await removeGuestlistEntry({ id: 'org-1' }, { eventId, ticketCode: added.entry.ticketCode })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('already_checked_in')
    })
  })

  describe('listGuestlistEntries', () => {
    it('liste uniquement les invités actifs (pas les retirés)', async () => {
      const { eventId, placeId } = await seedEvent()
      const a = await addGuestlistEntry({ id: 'org-1' }, { eventId, placeId, guestName: 'A' })
      const b = await addGuestlistEntry({ id: 'org-1' }, { eventId, placeId, guestName: 'B' })
      if (!a.ok || !b.ok) throw new Error('setup failed')
      await removeGuestlistEntry({ id: 'org-1' }, { eventId, ticketCode: a.entry.ticketCode })

      const result = await listGuestlistEntries({ id: 'org-1' }, eventId)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.entries).toHaveLength(1)
      expect(result.entries[0].guestName).toBe('B')
    })
  })
})
