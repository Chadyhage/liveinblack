// Tests d'INTÉGRATION (vraie base MongoDB) pour le CRUD événement organisateur
// (#7 phase organisateur — lib/server/organizerEvents.ts). Priorité donnée
// aux règles de verrouillage post-vente RE-VÉRIFIÉES SERVEUR (jamais
// seulement côté UI, cf. Gap #3/#4 du research) et à la propriété.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { createOrganizerEvent, updateOrganizerEvent, listMyOrganizerEvents, getMyOrganizerEventDetail, type EventFormInput, type PlaceInput } from '../organizerEvents'
import Event from '../../models/Event'
import Order from '../../models/Order'
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
  await Order.deleteMany({})
  await Ticket.deleteMany({})
})

// Simule une VRAIE vente : crée l'Order ET décrémente `available` sur la
// place, exactement ce que lib/server/orders.ts ferait en production — les
// tests de verrouillage post-vente doivent refléter le VRAI mécanisme de
// consommation (place.total - place.available), pas seulement un Order isolé.
async function seedPaidOrder(eventId: string, placeId: string, qty: number, overrides: Record<string, unknown> = {}) {
  await Order.create({
    userId: 'buyer-1',
    eventId,
    placeId,
    placeType: 'Standard',
    qty,
    unitPriceMinor: 2000,
    currency: 'XOF',
    rail: 'fedapay',
    status: 'paid',
    expiresAt: new Date(Date.now() + 3600_000),
    ...overrides,
  })
  await Event.updateOne({ _id: eventId, 'places.id': placeId }, { $inc: { 'places.$.available': -qty } })
}

function baseForm(overrides: Partial<EventFormInput> = {}): EventFormInput {
  return {
    name: 'Soirée Test',
    date: '2026-12-31',
    city: 'Lomé',
    region: 'Togo',
    places: [{ id: '', type: 'Standard', price: 20, total: 100 }],
    ...overrides,
  }
}

describeIntegration('organizerEvents (intégration, vraie base) — CRUD événement (#7)', () => {
  describe('createOrganizerEvent', () => {
    it('crée un événement et dérive la devise depuis la région', async () => {
      const result = await createOrganizerEvent({ id: 'org-1' }, 'Organisateur Test', baseForm())
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const doc = await Event.findById(result.eventId).lean()
      expect(doc?.currency).toBe('XOF')
      expect(doc?.organizerId).toBe('org-1')
      expect(doc?.createdBy).toBe('org-1')
      expect(doc?.places[0].id).toBeTruthy()
    })

    it('dérive EUR pour la France', async () => {
      const result = await createOrganizerEvent({ id: 'org-1' }, 'Organisateur Test', baseForm({ city: 'Paris', region: 'France' }))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const doc = await Event.findById(result.eventId).lean()
      expect(doc?.currency).toBe('EUR')
    })

    it('refuse une place de groupe sans prix', async () => {
      const places: PlaceInput[] = [{ id: '', type: 'Table VIP', price: 0, total: 4, groupType: 'group', groupMin: 2, groupMax: 6 }]
      const result = await createOrganizerEvent({ id: 'org-1' }, 'Organisateur Test', baseForm({ places }))
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('group_place_requires_price')
    })

    it('hache le code privé, ne stocke jamais le code en clair', async () => {
      const result = await createOrganizerEvent({ id: 'org-1' }, 'Organisateur Test', baseForm({ isPrivate: true, privateCode: 'SECRET123' }))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const doc = await Event.findById(result.eventId).select('+privateCodeHash').lean()
      expect(doc?.privateCodeHash).toBeTruthy()
      expect(doc?.privateCodeHash).not.toBe('SECRET123')
    })
  })

  describe('updateOrganizerEvent — propriété et verrouillage post-vente', () => {
    async function seedEvent(overrides: Partial<EventFormInput> = {}) {
      const result = await createOrganizerEvent({ id: 'org-1' }, 'Organisateur Test', baseForm(overrides))
      if (!result.ok) throw new Error('seed failed')
      return result.eventId
    }

    it("refuse la modification par quelqu'un d'autre que le propriétaire", async () => {
      const eventId = await seedEvent()
      const result = await updateOrganizerEvent({ id: 'intrus' }, eventId, { name: 'Piraté' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('forbidden')

      const doc = await Event.findById(eventId).lean()
      expect(doc?.name).toBe('Soirée Test')
    })

    it('permet au propriétaire de modifier un champ non verrouillé (aucune vente)', async () => {
      const eventId = await seedEvent()
      const result = await updateOrganizerEvent({ id: 'org-1' }, eventId, { name: 'Soirée Renommée', date: '2027-01-15' })
      expect(result.ok).toBe(true)

      const doc = await Event.findById(eventId).lean()
      expect(doc?.name).toBe('Soirée Renommée')
      expect(doc?.date).toBe('2027-01-15')
    })

    it('refuse toute modification sur un événement annulé', async () => {
      const eventId = await seedEvent()
      await Event.updateOne({ _id: eventId }, { $set: { cancelled: true } })
      const result = await updateOrganizerEvent({ id: 'org-1' }, eventId, { name: 'Tentative' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('event_cancelled')
    })

    it('verrouille date/type/région/minAge dès qu’une vente existe, mais garde description/affiche/artistes éditables', async () => {
      const eventId = await seedEvent()
      const doc = await Event.findById(eventId).lean()
      const placeId = doc!.places[0].id

      await seedPaidOrder(eventId, placeId, 1)

      const result = await updateOrganizerEvent(
        { id: 'org-1' },
        eventId,
        {
          ...baseForm(),
          date: '2027-06-01', // tentative de changement verrouillé
          minAge: 21, // verrouillé
          description: 'Nouvelle description', // toujours éditable
          artists: [{ name: 'DJ Test', role: 'DJ' }], // toujours éditable
        }
      )
      expect(result.ok).toBe(true)

      const fresh = await Event.findById(eventId).lean()
      expect(fresh?.date).toBe('2026-12-31') // inchangé malgré la tentative
      expect(fresh?.minAge).toBe(18) // inchangé
      expect(fresh?.description).toBe('Nouvelle description') // appliqué
      expect(fresh?.artists?.[0]?.name).toBe('DJ Test') // appliqué
    })

    it('empêche de faire descendre `total` sous le nombre déjà vendu pour une place vendue', async () => {
      const eventId = await seedEvent()
      const doc = await Event.findById(eventId).lean()
      const placeId = doc!.places[0].id

      await seedPaidOrder(eventId, placeId, 30)

      const result = await updateOrganizerEvent({ id: 'org-1' }, eventId, {
        ...baseForm(),
        places: [{ id: placeId, type: 'Standard', price: 999, total: 5 }], // tente total < vendu, ET prix différent
      })
      expect(result.ok).toBe(true)

      const fresh = await Event.findById(eventId).lean()
      expect(fresh?.places[0].total).toBeGreaterThanOrEqual(30)
      expect(fresh?.places[0].price).toBe(20) // prix verrouillé, inchangé
    })

    it('conserve une place vendue même si absente du payload de mise à jour (jamais perdue)', async () => {
      const eventId = await seedEvent({
        places: [
          { id: '', type: 'Standard', price: 20, total: 100 },
          { id: '', type: 'VIP', price: 50, total: 20 },
        ],
      })
      const doc = await Event.findById(eventId).lean()
      const vipPlaceId = doc!.places.find((p) => p.type === 'VIP')!.id

      await seedPaidOrder(eventId, vipPlaceId, 2, { placeType: 'VIP', unitPriceMinor: 5000 })

      // Le client renvoie seulement "Standard" (VIP supprimée côté UI).
      const result = await updateOrganizerEvent({ id: 'org-1' }, eventId, {
        ...baseForm(),
        places: [{ id: doc!.places.find((p) => p.type === 'Standard')!.id, type: 'Standard', price: 20, total: 100 }],
      })
      expect(result.ok).toBe(true)

      const fresh = await Event.findById(eventId).lean()
      expect(fresh?.places.some((p) => p.type === 'VIP')).toBe(true)
    })

    it('ne recalcule jamais la devise à l’édition (figée à la création)', async () => {
      const eventId = await seedEvent() // Togo → XOF
      const result = await updateOrganizerEvent({ id: 'org-1' }, eventId, { ...baseForm({ city: 'Paris', region: 'France' }) })
      expect(result.ok).toBe(true)
      const fresh = await Event.findById(eventId).lean()
      expect(fresh?.currency).toBe('XOF') // toujours XOF malgré la région envoyée
    })
  })

  describe('listMyOrganizerEvents', () => {
    it('ne renvoie que les événements de l’appelant, avec le total vendu', async () => {
      const mine = await createOrganizerEvent({ id: 'org-1' }, 'Moi', baseForm())
      await createOrganizerEvent({ id: 'org-2' }, 'Un autre', baseForm({ name: 'Pas à moi' }))
      if (!mine.ok) throw new Error('seed failed')

      const doc = await Event.findById(mine.eventId).lean()
      await Order.create({
        userId: 'buyer-1',
        eventId: mine.eventId,
        placeId: doc!.places[0].id,
        placeType: 'Standard',
        qty: 3,
        unitPriceMinor: 2000,
        currency: 'XOF',
        rail: 'fedapay',
        status: 'paid',
        expiresAt: new Date(Date.now() + 3600_000),
      })

      const result = await listMyOrganizerEvents({ id: 'org-1' })
      expect(result.events).toHaveLength(1)
      expect(result.events[0].name).toBe('Soirée Test')
      expect(result.events[0].soldCount).toBe(3)
      expect(result.events[0].currency).toBe('XOF')
    })

    it('agrège le nombre de billets et le revenu réel depuis Ticket, en excluant les révoqués', async () => {
      const mine = await createOrganizerEvent({ id: 'org-1' }, 'Moi', baseForm())
      if (!mine.ok) throw new Error('seed failed')

      await Ticket.create([
        { ticketCode: 'TCK001', eventId: mine.eventId, place: 'Standard', placePrice: 20, totalPrice: 20, currency: 'XOF', userId: 'buyer-1', paid: true, bookedAt: new Date() },
        { ticketCode: 'TCK002', eventId: mine.eventId, place: 'Standard', placePrice: 20, totalPrice: 20, currency: 'XOF', userId: 'buyer-2', paid: true, bookedAt: new Date() },
        { ticketCode: 'TCK003', eventId: mine.eventId, place: 'Standard', placePrice: 20, totalPrice: 20, currency: 'XOF', userId: 'buyer-3', paid: true, revoked: true, bookedAt: new Date() },
      ])

      const result = await listMyOrganizerEvents({ id: 'org-1' })
      expect(result.events[0].ticketCount).toBe(2)
      expect(result.events[0].revenue).toBe(40)
    })

    it('signale postponed=true uniquement quand l’événement a déjà été reporté', async () => {
      const mine = await createOrganizerEvent({ id: 'org-1' }, 'Moi', baseForm())
      if (!mine.ok) throw new Error('seed failed')

      const before = await listMyOrganizerEvents({ id: 'org-1' })
      expect(before.events[0].postponed).toBe(false)

      await Event.updateOne({ _id: mine.eventId }, { $set: { postponedFrom: { date: '2026-12-31', time: '22:00' } } })
      const after = await listMyOrganizerEvents({ id: 'org-1' })
      expect(after.events[0].postponed).toBe(true)
    })
  })

  describe('getMyOrganizerEventDetail', () => {
    it('refuse un appelant qui ne possède pas l’événement', async () => {
      const mine = await createOrganizerEvent({ id: 'org-1' }, 'Moi', baseForm())
      if (!mine.ok) throw new Error('seed failed')

      const result = await getMyOrganizerEventDetail({ id: 'intrus' }, mine.eventId)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('forbidden')
    })

    it('renvoie locked=false et sold=0 par place tant que rien n’est vendu, jamais le hash du code privé', async () => {
      const mine = await createOrganizerEvent({ id: 'org-1' }, 'Moi', baseForm({ isPrivate: true, privateCode: 'SECRET1' }))
      if (!mine.ok) throw new Error('seed failed')

      const result = await getMyOrganizerEventDetail({ id: 'org-1' }, mine.eventId)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.event.locked).toBe(false)
      expect(result.event.totalSold).toBe(0)
      expect(result.event.places[0].sold).toBe(0)
      expect(result.event.isPrivate).toBe(true)
      expect(result.event.hasPrivateCode).toBe(true)
      expect(result.event).not.toHaveProperty('privateCodeHash')
    })

    it('renvoie locked=true et le sold réel par place dès qu’une vente existe', async () => {
      const mine = await createOrganizerEvent({ id: 'org-1' }, 'Moi', baseForm())
      if (!mine.ok) throw new Error('seed failed')
      const doc = await Event.findById(mine.eventId).lean()
      await seedPaidOrder(mine.eventId, doc!.places[0].id, 4)

      const result = await getMyOrganizerEventDetail({ id: 'org-1' }, mine.eventId)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.event.locked).toBe(true)
      expect(result.event.totalSold).toBe(4)
      expect(result.event.places[0].sold).toBe(4)
      expect(result.event.places[0].available).toBe(96)
    })
  })
})
