// Tests d'INTÉGRATION (vraie base MongoDB) pour le portefeuille de billets
// (#6 phase profil — listMyTickets, lib/server/tickets.ts). Couvre :
//  - un billet solo détenu par l'appelant (isMine, pas isHostSeat) ;
//  - une place de groupe : l'hôte voit tous les sièges (hostedSeats), y
//    compris ceux déjà attribués à quelqu'un d'autre (isMine:false pour
//    l'hôte, mais toujours isHostSeat:true) ;
//  - un billet révoqué n'apparaît jamais ;
//  - le groupement par événement et la résolution depuis un VRAI document
//    Event (jamais un instantané périmé) ;
//  - un événement supprimé après coup renvoie event:null sans planter.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { listMyTickets } from '../tickets'
import Ticket from '../../models/Ticket'
import Event from '../../models/Event'
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
  await Promise.all([Ticket.deleteMany({}), Event.deleteMany({}), User.deleteMany({})])
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  return User.create({
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: 'x',
    firstName: 'Prenom',
    lastName: 'Nom',
    roles: ['client'],
    activeRole: 'client',
    ...overrides,
  })
}

async function seedEvent(overrides: Record<string, unknown> = {}) {
  return Event.create({
    name: 'Soirée Test XYZ',
    date: '2099-06-15',
    currency: 'EUR',
    createdBy: 'organizer-1',
    organizerId: 'organizer-1',
    ...overrides,
  })
}

let ticketSeq = 0
async function seedTicket(overrides: Record<string, unknown> = {}) {
  ticketSeq += 1
  return Ticket.create({
    ticketCode: `TEST-${ticketSeq}-${Math.random().toString(36).slice(2)}`,
    eventId: 'event-1',
    place: 'Standard',
    placePrice: 1000,
    totalPrice: 1000,
    currency: 'EUR',
    userId: 'user-1',
    ...overrides,
  })
}

describeIntegration('tickets (intégration, vraie base) — portefeuille (#6)', () => {
  describe('listMyTickets', () => {
    it('un billet solo détenu par l’appelant : isMine=true, isHostSeat=false', async () => {
      const alice = await seedUser()
      const event = await seedEvent()
      await seedTicket({ eventId: event.id, userId: alice.id })

      const result = await listMyTickets(alice.id)
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].eventId).toBe(event.id)
      expect(result.groups[0].myTickets).toHaveLength(1)
      expect(result.groups[0].myTickets[0].isMine).toBe(true)
      expect(result.groups[0].myTickets[0].isHostSeat).toBe(false)
      expect(result.groups[0].hostedSeats).toHaveLength(0)
    })

    it("l'hôte d'une place de groupe voit TOUS les sièges de sa table dans hostedSeats, y compris ceux déjà attribués à un autre compte", async () => {
      const host = await seedUser()
      const guest = await seedUser()
      const event = await seedEvent()

      // Siège de l'hôte lui-même (jamais réattribué).
      await seedTicket({ eventId: event.id, userId: host.id, hostUid: host.id, tableId: 'table-1', seatIndex: 0 })
      // Siège attribué à un invité : userId a changé, hostUid reste l'hôte.
      await seedTicket({
        eventId: event.id,
        userId: guest.id,
        hostUid: host.id,
        tableId: 'table-1',
        seatIndex: 1,
        assignedTo: guest.id,
        assignedName: 'Invité Test',
      })

      const hostResult = await listMyTickets(host.id)
      expect(hostResult.groups).toHaveLength(1)
      expect(hostResult.groups[0].hostedSeats).toHaveLength(2)
      // L'hôte ne détient plus lui-même le siège attribué à l'invité.
      expect(hostResult.groups[0].myTickets).toHaveLength(1)
      const assignedSeatForHost = hostResult.groups[0].hostedSeats.find((s) => s.assignedTo === guest.id)
      expect(assignedSeatForHost?.isMine).toBe(false)
      expect(assignedSeatForHost?.isHostSeat).toBe(true)
      expect(assignedSeatForHost?.assignedName).toBe('Invité Test')

      // L'invité, lui, voit son propre siège comme "mine" mais n'a aucune
      // vue d'hôte sur la table (il n'a pas acheté la place de groupe).
      const guestResult = await listMyTickets(guest.id)
      expect(guestResult.groups).toHaveLength(1)
      expect(guestResult.groups[0].myTickets).toHaveLength(1)
      expect(guestResult.groups[0].myTickets[0].isMine).toBe(true)
      expect(guestResult.groups[0].hostedSeats).toHaveLength(0)
    })

    it('un billet révoqué n’apparaît jamais', async () => {
      const alice = await seedUser()
      const event = await seedEvent()
      await seedTicket({ eventId: event.id, userId: alice.id, revoked: true })

      const result = await listMyTickets(alice.id)
      expect(result.groups).toHaveLength(0)
    })

    it('groupe correctement plusieurs billets pour des événements différents', async () => {
      const alice = await seedUser()
      const eventA = await seedEvent({ name: 'Event A' })
      const eventB = await seedEvent({ name: 'Event B' })
      await seedTicket({ eventId: eventA.id, userId: alice.id })
      await seedTicket({ eventId: eventB.id, userId: alice.id })

      const result = await listMyTickets(alice.id)
      expect(result.groups).toHaveLength(2)
      const names = result.groups.map((g) => g.event?.name).sort()
      expect(names).toEqual(['Event A', 'Event B'])
    })

    it('un événement supprimé après coup renvoie event:null sans planter', async () => {
      const alice = await seedUser()
      const event = await seedEvent()
      await seedTicket({ eventId: event.id, userId: alice.id })
      await Event.deleteOne({ _id: event.id })

      const result = await listMyTickets(alice.id)
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].event).toBeNull()
    })

    it("ne renvoie jamais les billets d'un AUTRE utilisateur", async () => {
      const alice = await seedUser()
      const bob = await seedUser()
      const event = await seedEvent()
      await seedTicket({ eventId: event.id, userId: bob.id })

      const result = await listMyTickets(alice.id)
      expect(result.groups).toHaveLength(0)
    })
  })
})
