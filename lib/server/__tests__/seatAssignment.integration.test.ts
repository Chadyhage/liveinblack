// Tests d'INTÉGRATION (vraie base MongoDB, transactions réelles) pour le
// cycle de consentement des sièges de table (#37) : invite → accept/decline,
// cancel (hôte), leave (invité), revoke (hôte, inchangé depuis l'ancien
// modèle direct-bind). Couvre en particulier :
//  - le fait que l'invitation ne lie JAMAIS le siège tant qu'elle n'est pas
//    acceptée ;
//  - que le check "1 place de groupe par compte et par événement"
//    (GroupMembership, index unique {eventId,userId}) n'est évalué qu'à
//    l'acceptation, déclenchée par la CIBLE — jamais visible de l'hôte ;
//  - la garde-fou atomique contre l'invitation double (index unique partiel
//    SeatInvitation {ticketCode, status:'pending'}) ;
//  - la rotation systématique de seatVersion/entryNonce (#79) ;
//  - les races leave/revoke et invite/invite concurrents.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { inviteToSeat, acceptSeatInvitation, declineSeatInvitation, cancelSeatInvitation, leaveSeat, revokeSeat, listMyPendingInvitations } from '../seatAssignment'
import Event from '../../models/Event'
import Ticket from '../../models/Ticket'
import User from '../../models/User'
import GroupMembership from '../../models/GroupMembership'
import SeatInvitation from '../../models/SeatInvitation'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

beforeAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connect(TEST_URI)
  // SeatInvitation est un modèle NEUF : son index unique partiel
  // {ticketCode, status:'pending'} se construit en arrière-plan après le
  // premier accès au modèle (autoIndex), sans bloquer les écritures qui
  // suivent immédiatement — sans ce `.init()`, les tests de double
  // invitation concurrente/dupliquée peuvent s'exécuter AVANT que l'index
  // n'existe et passer à tort.
  await SeatInvitation.init()
}, 20000)

afterAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

beforeEach(async () => {
  if (!RUN_INTEGRATION) return
  await Promise.all([Event.deleteMany({}), Ticket.deleteMany({}), User.deleteMany({}), GroupMembership.deleteMany({}), SeatInvitation.deleteMany({})])
})

async function seedEvent(overrides: Record<string, unknown> = {}) {
  return Event.create({
    name: 'Test Event',
    date: '2099-01-01',
    time: '22:00',
    endTime: '05:00',
    currency: 'EUR',
    createdBy: 'organizer-1',
    organizerId: 'organizer-1',
    places: [{ id: 'tbl', type: 'Table 8', price: 200, available: 3, total: 3, groupType: 'group', groupMax: 4 }],
    ...overrides,
  })
}

// userId/hostUid doivent être de vrais ObjectId Mongo (comme en prod, où ils
// viennent toujours de session.user.id = String(user._id)) — Mongoose lève un
// CastError sur User.findById avec une chaîne arbitraire non-ObjectId.
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

async function seedSeat(eventId: string, hostId: string, overrides: Record<string, unknown> = {}) {
  return Ticket.create({
    ticketCode: 'SEAT0001',
    eventId,
    eventName: 'Test Event',
    eventDate: '1 janvier 2099',
    place: 'Table 8',
    placePrice: 200,
    totalPrice: 200,
    currency: 'EUR',
    paid: true,
    hostUid: hostId,
    tableId: 'tbl_1',
    userId: hostId,
    ...overrides,
  })
}

// Raccourci pour les tests qui n'exercent que le chemin heureux
// invite → accept, très fréquent dans cette suite.
async function inviteAndAccept(hostId: string, ticketCode: string, guest: { id: string; email: string }) {
  const invite = await inviteToSeat({ id: hostId }, { ticketCode, targetEmail: guest.email })
  if (!invite.ok) throw new Error(`invite failed: ${invite.error}`)
  return acceptSeatInvitation({ id: guest.id }, { invitationId: invite.invitation.id })
}

describeIntegration('seatAssignment (intégration, transaction réelle) — modèle invite/accept (#37)', () => {
  describe('inviteToSeat', () => {
    it("crée une invitation en attente SANS lier le siège", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const result = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.invitation.status).toBe('pending')
      expect(result.invitation.targetEmail).toBe(guest.email)

      // Le siège n'est PAS lié : il reste détenu par l'hôte tant que la
      // cible n'a pas accepté.
      const fresh = await Ticket.findOne({ ticketCode: ticket.ticketCode }).lean()
      expect(fresh?.userId).toBe(host.id)
      expect(fresh?.assignedTo).toBeNull()
      expect(fresh?.seatVersion).toBe(0)

      const membership = await GroupMembership.findOne({ eventId: event.id, userId: guest.id }).lean()
      expect(membership).toBeNull()
    })

    it("ne divulgue JAMAIS à l'hôte que la cible tient déjà un siège de groupe ailleurs sur le même événement — seule la cible l'apprend, à l'acceptation", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      // La cible tient déjà une place de groupe (hôte d'une AUTRE table du
      // même événement).
      await GroupMembership.create({ eventId: event.id, userId: guest.id, tableId: 'tbl_other', role: 'host', ticketCode: 'OTHER0001' })

      // L'invitation elle-même réussit — la réponse HTTP à l'hôte est
      // strictement identique à celle d'une invitation à quelqu'un de libre :
      // aucune fuite de statut.
      const invite = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(invite.ok).toBe(true)
      if (!invite.ok) return

      // Le conflit ne se révèle QUE lorsque la cible elle-même essaie
      // d'accepter — jamais dans une réponse adressée à l'hôte.
      const accept = await acceptSeatInvitation({ id: guest.id }, { invitationId: invite.invitation.id })
      expect(accept.ok).toBe(false)
      if (accept.ok) return
      expect(accept.status).toBe(409)
      expect(accept.error).toBe('guest_already_has_group_seat')

      // Le siège reste chez l'hôte : l'échec de l'acceptation n'a rien lié.
      const fresh = await Ticket.findOne({ ticketCode: ticket.ticketCode }).lean()
      expect(fresh?.userId).toBe(host.id)
      expect(fresh?.assignedTo).toBeNull()
    })

    it('refuse une seconde invitation en attente sur le même siège (invitation_already_pending)', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest1 = await seedUser()
      const guest2 = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const first = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest1.email })
      expect(first.ok).toBe(true)

      const second = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest2.email })
      expect(second.ok).toBe(false)
      if (second.ok) return
      expect(second.status).toBe(409)
      expect(second.error).toBe('invitation_already_pending')
    })

    it('deux invitations concurrentes sur le même siège : une seule réussit (garde atomique index unique partiel)', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest1 = await seedUser()
      const guest2 = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const [first, second] = await Promise.all([
        inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest1.email }),
        inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest2.email }),
      ])

      const results = [first, second]
      const oks = results.filter((r) => r.ok)
      const fails = results.filter((r) => !r.ok)
      expect(oks).toHaveLength(1)
      expect(fails).toHaveLength(1)
      const failure = fails[0]
      if (failure.ok) throw new Error('unreachable')
      expect(failure.status).toBe(409)
      expect(failure.error).toBe('invitation_already_pending')

      const pendingCount = await SeatInvitation.countDocuments({ ticketCode: ticket.ticketCode, status: 'pending' })
      expect(pendingCount).toBe(1)
    })

    it("refuse d'inviter sur un siège déjà occupé par un invité ayant accepté (seat_already_assigned)", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest1 = await seedUser()
      const guest2 = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const first = await inviteAndAccept(host.id, ticket.ticketCode, guest1)
      expect(first.ok).toBe(true)

      const second = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest2.email })
      expect(second.ok).toBe(false)
      if (second.ok) return
      expect(second.status).toBe(409)
      expect(second.error).toBe('seat_already_assigned')
    })

    it("refuse à quelqu'un qui n'est pas l'hôte de la table (not_host)", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const intruder = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const result = await inviteToSeat({ id: intruder.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('not_host')
    })

    it('refuse une fois le siège déjà scanné à l’entrée (already_checked_in)', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id, { checkedInAt: new Date() })

      const result = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(409)
      expect(result.error).toBe('already_checked_in')
    })

    it('refuse pour un billet solo (not_a_table_ticket)', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const soloTicket = await Ticket.create({
        ticketCode: 'SOLO0001',
        eventId: event.id,
        eventName: 'Test Event',
        eventDate: '1 janvier 2099',
        place: 'Standard',
        placePrice: 20,
        totalPrice: 20,
        currency: 'EUR',
        paid: true,
        userId: host.id,
        hostUid: null,
        tableId: null,
      })

      const result = await inviteToSeat({ id: host.id }, { ticketCode: soloTicket.ticketCode, targetEmail: guest.email })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('not_a_table_ticket')
    })

    it('refuse un email invité inconnu (guest_not_found)', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const result = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: 'inconnu@test.com' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('guest_not_found')
    })

    it('refuse de s’auto-inviter (already_yours)', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const result = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: host.email })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('already_yours')
    })

    it('refuse pour un ticketCode inconnu (ticket_not_found)', async () => {
      const result = await inviteToSeat({ id: 'someone' }, { ticketCode: 'NOPE0000', targetEmail: 'x@test.com' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('ticket_not_found')
    })

    it('refuse pour un billet de table non payé (ticket_not_paid)', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id, { paid: false })

      const result = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(409)
      expect(result.error).toBe('ticket_not_paid')
    })
  })

  describe('acceptSeatInvitation', () => {
    it('lie le siège, crée la sentinelle GroupMembership et fait tourner seatVersion/entryNonce', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const result = await inviteAndAccept(host.id, ticket.ticketCode, guest)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.ticket.assignedTo).toBe(guest.id)
      expect(result.ticket.assignedAt).toBeTruthy()

      const fresh = await Ticket.findOne({ ticketCode: ticket.ticketCode }).lean()
      expect(fresh?.userId).toBe(guest.id)
      expect(fresh?.seatVersion).toBe(1)
      expect(fresh?.entryNonce).toBeTruthy()

      const membership = await GroupMembership.findOne({ eventId: event.id, userId: guest.id }).lean()
      expect(membership?.role).toBe('member')
      expect(membership?.tableId).toBe('tbl_1')

      const invitation = await SeatInvitation.findOne({ ticketCode: ticket.ticketCode }).lean()
      expect(invitation?.status).toBe('accepted')
      expect(invitation?.respondedAt).toBeTruthy()
    })

    it("refuse qu'un tiers (ni la cible) accepte l'invitation (invitation_not_found)", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const outsider = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const invite = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(invite.ok).toBe(true)
      if (!invite.ok) return

      const result = await acceptSeatInvitation({ id: outsider.id }, { invitationId: invite.invitation.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('invitation_not_found')

      // Le siège n'a pas bougé.
      const fresh = await Ticket.findOne({ ticketCode: ticket.ticketCode }).lean()
      expect(fresh?.userId).toBe(host.id)
    })

    it('refuse d’accepter une invitation déjà déclinée (invitation_not_pending)', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const invite = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(invite.ok).toBe(true)
      if (!invite.ok) return

      const decline = await declineSeatInvitation({ id: guest.id }, { invitationId: invite.invitation.id })
      expect(decline.ok).toBe(true)

      const accept = await acceptSeatInvitation({ id: guest.id }, { invitationId: invite.invitation.id })
      expect(accept.ok).toBe(false)
      if (accept.ok) return
      expect(accept.status).toBe(409)
      expect(accept.error).toBe('invitation_not_pending')
    })

    it('refuse d’accepter une invitation déjà annulée par l’hôte (invitation_not_pending)', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const invite = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(invite.ok).toBe(true)
      if (!invite.ok) return

      const cancel = await cancelSeatInvitation({ id: host.id }, { ticketCode: ticket.ticketCode })
      expect(cancel.ok).toBe(true)

      const accept = await acceptSeatInvitation({ id: guest.id }, { invitationId: invite.invitation.id })
      expect(accept.ok).toBe(false)
      if (accept.ok) return
      expect(accept.status).toBe(409)
      expect(accept.error).toBe('invitation_not_pending')
    })
  })

  describe('declineSeatInvitation', () => {
    it('décline sans jamais toucher au siège', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const invite = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(invite.ok).toBe(true)
      if (!invite.ok) return

      const result = await declineSeatInvitation({ id: guest.id }, { invitationId: invite.invitation.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.invitation.status).toBe('declined')

      const fresh = await Ticket.findOne({ ticketCode: ticket.ticketCode }).lean()
      expect(fresh?.userId).toBe(host.id)
      expect(fresh?.assignedTo).toBeNull()
      expect(fresh?.seatVersion).toBe(0)
    })

    it("refuse qu'un tiers (ni la cible) décline l'invitation (invitation_not_found)", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const outsider = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const invite = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(invite.ok).toBe(true)
      if (!invite.ok) return

      const result = await declineSeatInvitation({ id: outsider.id }, { invitationId: invite.invitation.id })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('invitation_not_found')
    })
  })

  describe('cancelSeatInvitation', () => {
    it("l'hôte annule une invitation en attente ; l'hôte peut ensuite en émettre une nouvelle", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest1 = await seedUser()
      const guest2 = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const invite1 = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest1.email })
      expect(invite1.ok).toBe(true)

      const cancel = await cancelSeatInvitation({ id: host.id }, { ticketCode: ticket.ticketCode })
      expect(cancel.ok).toBe(true)
      if (!cancel.ok) return
      expect(cancel.invitation.status).toBe('cancelled')

      const invite2 = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest2.email })
      expect(invite2.ok).toBe(true)
    })

    it("refuse qu'un non-hôte annule (invitation_not_found)", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const intruder = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const invite = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(invite.ok).toBe(true)

      const result = await cancelSeatInvitation({ id: intruder.id }, { ticketCode: ticket.ticketCode })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('invitation_not_found')
    })

    it("refuse d'annuler quand aucune invitation n'est en attente (invitation_not_found)", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const result = await cancelSeatInvitation({ id: host.id }, { ticketCode: ticket.ticketCode })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
      expect(result.error).toBe('invitation_not_found')
    })
  })

  describe('leaveSeat', () => {
    it("l'invité quitte volontairement un siège accepté ; le siège revient à l'hôte et le nonce tourne", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const accepted = await inviteAndAccept(host.id, ticket.ticketCode, guest)
      expect(accepted.ok).toBe(true)
      const afterAccept = await Ticket.findOne({ ticketCode: ticket.ticketCode }).lean()
      const nonceAfterAccept = afterAccept?.entryNonce

      const result = await leaveSeat({ id: guest.id }, { ticketCode: ticket.ticketCode })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.ticket.assignedTo).toBeNull()

      const fresh = await Ticket.findOne({ ticketCode: ticket.ticketCode }).lean()
      expect(fresh?.userId).toBe(host.id)
      expect(fresh?.seatVersion).toBe(2)
      expect(fresh?.entryNonce).toBeTruthy()
      expect(fresh?.entryNonce).not.toBe(nonceAfterAccept)

      const membership = await GroupMembership.findOne({ eventId: event.id, userId: guest.id }).lean()
      expect(membership).toBeNull()

      // Le siège redevenu libre peut être ré-invité.
      const guest2 = await seedUser()
      const reinvite = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest2.email })
      expect(reinvite.ok).toBe(true)
    })

    it("refuse qu'un utilisateur qui ne détient pas ce siège le quitte (not_your_seat)", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const outsider = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      await inviteAndAccept(host.id, ticket.ticketCode, guest)

      const result = await leaveSeat({ id: outsider.id }, { ticketCode: ticket.ticketCode })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(409)
      expect(result.error).toBe('not_your_seat')
    })

    it("refuse à l'hôte de « quitter » son propre siège non attribué (not_your_seat)", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const result = await leaveSeat({ id: host.id }, { ticketCode: ticket.ticketCode })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(409)
      expect(result.error).toBe('not_your_seat')
    })

    it('leaveSeat (invité) et revokeSeat (hôte) concurrents sur le même siège : un seul gagne, la sentinelle hôte n’est jamais supprimée', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      // Sentinelle "host" telle que créée par fulfillOrder.ts à l'achat de la
      // table — jamais recréée par ce module, donc si elle disparaît ici
      // c'est forcément un effet de bord de la course leave/revoke.
      await GroupMembership.create({ eventId: event.id, userId: host.id, tableId: 'tbl_1', role: 'host', ticketCode: ticket.ticketCode })

      const accepted = await inviteAndAccept(host.id, ticket.ticketCode, guest)
      expect(accepted.ok).toBe(true)

      const [leaveResult, revokeResult] = await Promise.all([
        leaveSeat({ id: guest.id }, { ticketCode: ticket.ticketCode }),
        revokeSeat({ id: host.id }, { ticketCode: ticket.ticketCode }),
      ])

      const results = [leaveResult, revokeResult]
      const oks = results.filter((r) => r.ok)
      const fails = results.filter((r) => !r.ok)
      expect(oks).toHaveLength(1)
      expect(fails).toHaveLength(1)
      const failure = fails[0]
      if (failure.ok) throw new Error('unreachable')
      expect(['already_free', 'not_your_seat']).toContain(failure.error)

      const afterRace = await Ticket.findOne({ ticketCode: ticket.ticketCode }).lean()
      expect(afterRace?.userId).toBe(host.id)
      expect(afterRace?.assignedTo).toBeNull()

      const guestMembership = await GroupMembership.findOne({ eventId: event.id, userId: guest.id }).lean()
      expect(guestMembership).toBeNull()

      // La régression : sans le re-check transactionnel des deux côtés, le
      // perdant de la course supprimerait la ligne {eventId, userId: host.id}
      // au lieu de celle de l'invité.
      const hostMembership = await GroupMembership.findOne({ eventId: event.id, userId: host.id }).lean()
      expect(hostMembership).not.toBeNull()
      expect(hostMembership?.role).toBe('host')
    })
  })

  describe('revokeSeat (inchangé — révocation par l’hôte d’un siège déjà accepté)', () => {
    it('révoque un siège accepté et le rend à l’hôte, en faisant tourner le nonce', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const accepted = await inviteAndAccept(host.id, ticket.ticketCode, guest)
      expect(accepted.ok).toBe(true)
      const afterAccept = await Ticket.findOne({ ticketCode: ticket.ticketCode }).lean()
      const nonceAfterAccept = afterAccept?.entryNonce

      const revokeResult = await revokeSeat({ id: host.id }, { ticketCode: ticket.ticketCode })
      expect(revokeResult.ok).toBe(true)
      if (!revokeResult.ok) return
      expect(revokeResult.ticket.assignedTo).toBeNull()
      expect(revokeResult.ticket.assignedName).toBeNull()
      expect(revokeResult.ticket.assignedAt).toBeNull()

      const afterRevoke = await Ticket.findOne({ ticketCode: ticket.ticketCode }).lean()
      expect(afterRevoke?.userId).toBe(host.id)
      expect(afterRevoke?.seatVersion).toBe(2)
      expect(afterRevoke?.entryNonce).toBeTruthy()
      expect(afterRevoke?.entryNonce).not.toBe(nonceAfterAccept)

      const membership = await GroupMembership.findOne({ eventId: event.id, userId: guest.id }).lean()
      expect(membership).toBeNull()
    })

    it("refuse à quelqu'un qui n'est pas l'hôte de la table (not_host)", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const intruder = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const revokeRes = await revokeSeat({ id: intruder.id }, { ticketCode: ticket.ticketCode })
      expect(revokeRes.ok).toBe(false)
      if (revokeRes.ok) return
      expect(revokeRes.status).toBe(403)
      expect(revokeRes.error).toBe('not_host')
    })

    it('deux revoke concurrents sur le même siège ne suppriment jamais la sentinelle GroupMembership de l’hôte', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      await GroupMembership.create({ eventId: event.id, userId: host.id, tableId: 'tbl_1', role: 'host', ticketCode: ticket.ticketCode })

      const accepted = await inviteAndAccept(host.id, ticket.ticketCode, guest)
      expect(accepted.ok).toBe(true)

      const [first, second] = await Promise.all([
        revokeSeat({ id: host.id }, { ticketCode: ticket.ticketCode }),
        revokeSeat({ id: host.id }, { ticketCode: ticket.ticketCode }),
      ])

      const results = [first, second]
      const oks = results.filter((r) => r.ok)
      const fails = results.filter((r) => !r.ok)
      expect(oks).toHaveLength(1)
      expect(fails).toHaveLength(1)
      const failure = fails[0]
      if (failure.ok) throw new Error('unreachable')
      expect(failure.status).toBe(400)
      expect(failure.error).toBe('already_free')

      const afterRevoke = await Ticket.findOne({ ticketCode: ticket.ticketCode }).lean()
      expect(afterRevoke?.userId).toBe(host.id)
      expect(afterRevoke?.assignedTo).toBeNull()

      const guestMembership = await GroupMembership.findOne({ eventId: event.id, userId: guest.id }).lean()
      expect(guestMembership).toBeNull()

      const hostMembership = await GroupMembership.findOne({ eventId: event.id, userId: host.id }).lean()
      expect(hostMembership).not.toBeNull()
      expect(hostMembership?.role).toBe('host')
    })

    it('refuse de révoquer un siège déjà libre (already_free)', async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const result = await revokeSeat({ id: host.id }, { ticketCode: ticket.ticketCode })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(400)
      expect(result.error).toBe('already_free')
    })

    it('refuse pour un ticketCode inconnu (ticket_not_found)', async () => {
      const revokeRes = await revokeSeat({ id: 'someone' }, { ticketCode: 'NOPE0000' })
      expect(revokeRes.ok).toBe(false)
      if (revokeRes.ok) return
      expect(revokeRes.status).toBe(404)
      expect(revokeRes.error).toBe('ticket_not_found')
    })
  })

  describe('listMyPendingInvitations', () => {
    it("liste les invitations en attente adressées à l'appelant, avec le contexte événement/siège", async () => {
      const event = await seedEvent()
      const host = await seedUser({ firstName: 'Hote', lastName: 'Test' })
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const invite = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(invite.ok).toBe(true)

      const result = await listMyPendingInvitations({ id: guest.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.invitations).toHaveLength(1)
      expect(result.invitations[0].ticketCode).toBe(ticket.ticketCode)
      expect(result.invitations[0].place).toBe('Table 8')
      expect(result.invitations[0].hostName).toBe('Hote Test')
      expect(result.invitations[0].status).toBe('pending')
    })

    it("n'inclut pas les invitations déjà résolues (acceptées/déclinées/annulées)", async () => {
      const event = await seedEvent()
      const host = await seedUser()
      const guest = await seedUser()
      const ticket = await seedSeat(event.id, host.id)

      const invite = await inviteToSeat({ id: host.id }, { ticketCode: ticket.ticketCode, targetEmail: guest.email })
      expect(invite.ok).toBe(true)
      if (!invite.ok) return
      await declineSeatInvitation({ id: guest.id }, { invitationId: invite.invitation.id })

      const result = await listMyPendingInvitations({ id: guest.id })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.invitations).toHaveLength(0)
    })
  })
})
