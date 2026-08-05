// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/agentDeletion.ts —
// revue agent des demandes de suppression de compte + purge complète (#9
// phase agent/admin, tâche #104). Stripe est mocké (même convention que
// providerSubscriptions.integration.test.ts) ; c'est la cascade elle-même
// qui est le cœur de ce fichier — irréversible, donc testée branche par
// branche plutôt que juste le "chemin heureux".
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const subscriptionsCancel = vi.fn()
vi.mock('../stripeClient', () => ({
  default: { subscriptions: { cancel: (...a: unknown[]) => subscriptionsCancel(...a) } },
}))

import {
  listDeletionRequestsForAgent,
  getDeletionRequestForAgent,
  approveDeletion,
  rejectDeletion,
  createDeletionRequest,
  type AgentCaller,
} from '../agentDeletion'
import User from '../../models/User'
import Application from '../../models/Application'
import DeletionRequest from '../../models/DeletionRequest'
import Event from '../../models/Event'
import Ticket from '../../models/Ticket'
import OrganizerProfile from '../../models/OrganizerProfile'
import ProviderProfile from '../../models/ProviderProfile'
import GroupMembership from '../../models/GroupMembership'
import Friendship from '../../models/Friendship'
import FriendRequest from '../../models/FriendRequest'
import OrganizerFollow from '../../models/OrganizerFollow'
import EventInterest from '../../models/EventInterest'
import SeatInvitation from '../../models/SeatInvitation'
import Conversation from '../../models/Conversation'
import Message from '../../models/Message'
import Report from '../../models/Report'
import Review from '../../models/Review'
import ReviewReport from '../../models/ReviewReport'
import EventOrder from '../../models/EventOrder'
import SellerBalance from '../../models/SellerBalance'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''
const DAY = 24 * 60 * 60 * 1000

const AGENT: AgentCaller = { id: 'agent-1', name: 'Agent Test' }

const ALL_MODELS: mongoose.Model<unknown>[] = [
  User,
  Application,
  DeletionRequest,
  Event,
  Ticket,
  OrganizerProfile,
  ProviderProfile,
  GroupMembership,
  Friendship,
  FriendRequest,
  OrganizerFollow,
  EventInterest,
  SeatInvitation,
  Conversation,
  Message,
  Report,
  Review,
  ReviewReport,
  EventOrder,
  SellerBalance,
]

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
  vi.clearAllMocks()
  if (!RUN_INTEGRATION) return
  await Promise.all(ALL_MODELS.map((m) => m.deleteMany({})))
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash('correct-password', 10)
  return User.create({
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash,
    firstName: 'Prenom',
    lastName: 'Nom',
    phone: '+22890000000',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    orgStatus: 'active',
    ...overrides,
  })
}

async function seedRequest(userId: string, overrides: Record<string, unknown> = {}) {
  return DeletionRequest.create({ userId, reason: 'Je cesse mon activité', requestedAt: new Date(), status: 'pending', ...overrides })
}

describeIntegration('agentDeletion (intégration, vraie base) — #9 phase agent/admin', () => {
  describe('createDeletionRequest', () => {
    it("refuse un compte sans dossier approuvé (approval_not_required)", async () => {
      const alice = await seedUser({ orgStatus: 'pending' })
      const result = await createDeletionRequest({ id: alice.id }, 'Je change de projet')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('approval_not_required')
    })

    it('crée une demande pour un organisateur approuvé, dédupliquée si déjà en attente', async () => {
      const alice = await seedUser({ orgStatus: 'active' })
      const first = await createDeletionRequest({ id: alice.id }, 'Je cesse mon activité')
      expect(first.ok).toBe(true)
      const second = await createDeletionRequest({ id: alice.id }, 'Autre raison')
      expect(second.ok).toBe(true)
      if (!first.ok || !second.ok) return
      expect(second.request.id).toBe(first.request.id)

      const count = await DeletionRequest.countDocuments({ userId: alice.id })
      expect(count).toBe(1)
    })
  })

  describe('listDeletionRequestsForAgent / getDeletionRequestForAgent', () => {
    it('liste les demandes en attente avec identité utilisateur', async () => {
      const alice = await seedUser()
      await seedRequest(alice.id)

      const results = await listDeletionRequestsForAgent()
      expect(results).toHaveLength(1)
      expect(results[0].userEmail).toBe(alice.email)
      expect(results[0].userRole).toBe('organisateur')
      expect(results[0].status).toBe('pending')
    })

    it("calcule un blocage pour un événement à venir avec des billets vendus par d'autres", async () => {
      const alice = await seedUser()
      const req = await seedRequest(alice.id)
      const ev = await Event.create({
        name: 'Soirée Neon',
        date: new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10),
        createdBy: alice.id,
        organizerId: alice.id,
      })
      await Ticket.create({ ticketCode: 'T1', eventId: String(ev._id), userId: 'buyer-1', paid: true })

      const result = await getDeletionRequestForAgent(String(req._id))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.request.audit.blockers.some((b) => b.type === 'future_event_with_bookings')).toBe(true)
    })

    it('signale simplement un avertissement pour un événement à venir sans réservation', async () => {
      const alice = await seedUser()
      const req = await seedRequest(alice.id)
      await Event.create({
        name: 'Soirée vide',
        date: new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10),
        createdBy: alice.id,
        organizerId: alice.id,
      })

      const result = await getDeletionRequestForAgent(String(req._id))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.request.audit.blockers).toHaveLength(0)
      expect(result.request.audit.warnings.some((w) => w.type === 'future_event_no_bookings')).toBe(true)
    })

    it('bloque si une recette organisateur reste due', async () => {
      const alice = await seedUser()
      const req = await seedRequest(alice.id)
      await SellerBalance.create({ sellerUid: alice.id, amountDueCents: 5000 })

      const result = await getDeletionRequestForAgent(String(req._id))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.request.audit.blockers.some((b) => b.type === 'pending_settlement')).toBe(true)
    })
  })

  describe('rejectDeletion', () => {
    it('refuse la demande sans toucher au compte', async () => {
      const alice = await seedUser()
      const req = await seedRequest(alice.id)

      const result = await rejectDeletion(AGENT, String(req._id), 'Dossier encore actif')
      expect(result.ok).toBe(true)

      const fresh = await DeletionRequest.findById(req._id).lean()
      expect(fresh?.status).toBe('rejected')
      expect(fresh?.reviewedBy).toBe(AGENT.id)
      expect(fresh?.reviewNote).toBe('Dossier encore actif')

      const freshUser = await User.findById(alice.id).lean()
      expect(freshUser?.email).toBe(alice.email)
      expect(freshUser?.disabled).not.toBe(true)
    })

    it('404 si la demande n’existe pas ; 409 si déjà traitée', async () => {
      const missing = await rejectDeletion(AGENT, new mongoose.Types.ObjectId().toString())
      expect(missing.ok).toBe(false)
      if (!missing.ok) expect(missing.status).toBe(404)

      const alice = await seedUser()
      const req = await seedRequest(alice.id, { status: 'approved' })
      const already = await rejectDeletion(AGENT, String(req._id))
      expect(already.ok).toBe(false)
      if (!already.ok) expect(already.status).toBe(409)
    })
  })

  describe('approveDeletion — garde de blocage', () => {
    it('refuse la purge si un blocage subsiste (aucune mutation)', async () => {
      const alice = await seedUser()
      const req = await seedRequest(alice.id)
      const ev = await Event.create({
        name: 'Soirée Neon',
        date: new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10),
        createdBy: alice.id,
        organizerId: alice.id,
      })
      await Ticket.create({ ticketCode: 'T1', eventId: String(ev._id), userId: 'buyer-1', paid: true })

      const result = await approveDeletion(AGENT, String(req._id))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('deletion_blocked')

      const freshUser = await User.findById(alice.id).lean()
      expect(freshUser?.disabled).not.toBe(true)
      const freshReq = await DeletionRequest.findById(req._id).lean()
      expect(freshReq?.status).toBe('pending')
      const freshEvent = await Event.findById(ev._id).lean()
      expect(freshEvent).not.toBeNull()
    })

    it('404/409 sur demande introuvable ou déjà traitée', async () => {
      const missing = await approveDeletion(AGENT, new mongoose.Types.ObjectId().toString())
      expect(missing.ok).toBe(false)
      if (!missing.ok) expect(missing.status).toBe(404)

      const alice = await seedUser()
      const req = await seedRequest(alice.id, { status: 'rejected' })
      const result = await approveDeletion(AGENT, String(req._id))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.status).toBe(409)
    })
  })

  describe('approveDeletion — cascade complète', () => {
    it('résilie un abonnement Stripe actif AVANT toute purge', async () => {
      subscriptionsCancel.mockResolvedValue({ id: 'sub_1', status: 'canceled' })
      const alice = await seedUser({
        activeRole: 'prestataire',
        prestStatus: 'active',
        prestataireSubActive: true,
        prestataireSubRail: 'stripe',
        stripeSubscriptionId: 'sub_1',
      })
      const req = await seedRequest(alice.id)

      const result = await approveDeletion(AGENT, String(req._id))
      expect(result.ok).toBe(true)
      expect(subscriptionsCancel).toHaveBeenCalledWith('sub_1')

      const freshUser = await User.findById(alice.id).lean()
      expect(freshUser?.prestataireSubActive).toBe(false)
    })

    it("n'effectue AUCUNE mutation si la résiliation Stripe échoue", async () => {
      subscriptionsCancel.mockRejectedValue(Object.assign(new Error('stripe down'), { code: 'api_error' }))
      const alice = await seedUser({
        activeRole: 'prestataire',
        prestStatus: 'active',
        prestataireSubActive: true,
        prestataireSubRail: 'stripe',
        stripeSubscriptionId: 'sub_1',
      })
      const req = await seedRequest(alice.id)

      const result = await approveDeletion(AGENT, String(req._id))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('stripe_cancel_failed')

      const freshUser = await User.findById(alice.id).lean()
      expect(freshUser?.disabled).not.toBe(true)
      expect(freshUser?.email).toBe(alice.email)
      const freshReq = await DeletionRequest.findById(req._id).lean()
      expect(freshReq?.status).toBe('pending')
    })

    it('anonymise le compte, retire les vitrines publiques et le dossier', async () => {
      const alice = await seedUser()
      await OrganizerProfile.create({ userId: alice.id, publicName: 'Club Neon', slug: `club-neon-${alice.id}` })
      await Application.create({ userId: alice.id, type: 'organisateur', status: 'approved', formData: { nomCommercial: 'Club Neon' } })
      const req = await seedRequest(alice.id, { reason: 'Je ferme mon activité' })

      const result = await approveDeletion(AGENT, String(req._id), 'Vérifié, rien à signaler')
      expect(result.ok).toBe(true)

      const freshUser = await User.findById(alice.id).lean()
      expect(freshUser?.email).toContain('deleted-')
      expect(freshUser?.email).toContain('@liveinblack.invalid')
      expect(freshUser?.disabled).toBe(true)
      expect(freshUser?.firstName).toBe('')
      expect(freshUser?.orgStatus).toBe('none')
      expect(await bcrypt.compare('correct-password', freshUser!.passwordHash)).toBe(false)

      expect(await OrganizerProfile.findOne({ userId: alice.id }).lean()).toBeNull()
      expect(await Application.findOne({ userId: alice.id }).lean()).toBeNull()

      const freshReq = await DeletionRequest.findById(req._id).lean()
      expect(freshReq?.status).toBe('approved')
      expect(freshReq?.reviewedBy).toBe(AGENT.id)
      expect(freshReq?.reviewNote).toBe('Vérifié, rien à signaler')
    })

    it('supprime un événement futur sans réservation et ses documents liés ; anonymise un événement passé sans le supprimer', async () => {
      const alice = await seedUser()
      const req = await seedRequest(alice.id)

      const futureEmpty = await Event.create({
        name: 'Future vide',
        date: new Date(Date.now() + 10 * DAY).toISOString().slice(0, 10),
        createdBy: alice.id,
        organizerId: alice.id,
      })
      await EventOrder.create({ eventId: String(futureEmpty._id), items: [] })
      await Ticket.create({ ticketCode: 'FREE1', eventId: String(futureEmpty._id), userId: 'buyer-guestlist', paid: false, source: 'guestlist' })

      const past = await Event.create({
        name: 'Soirée passée',
        date: new Date(Date.now() - 10 * DAY).toISOString().slice(0, 10),
        createdBy: alice.id,
        organizerId: alice.id,
        organizerName: 'Club Neon',
        organizer: 'Club Neon',
      })
      await Ticket.create({ ticketCode: 'PAST1', eventId: String(past._id), userId: 'buyer-past', paid: true })

      const result = await approveDeletion(AGENT, String(req._id))
      expect(result.ok).toBe(true)

      expect(await Event.findById(futureEmpty._id).lean()).toBeNull()
      expect(await EventOrder.findOne({ eventId: String(futureEmpty._id) }).lean()).toBeNull()
      expect(await Ticket.findOne({ eventId: String(futureEmpty._id) }).lean()).toBeNull()

      const freshPast = await Event.findById(past._id).lean()
      expect(freshPast).not.toBeNull()
      expect(freshPast?.organizerName).toBe('Organisateur supprimé')
      // Le billet de l'acheteur de l'événement passé reste intact — archive financière.
      const pastTicket = await Ticket.findOne({ eventId: String(past._id) }).lean()
      expect(pastTicket).not.toBeNull()
      expect(pastTicket?.userId).toBe('buyer-past')
    })

    it('révoque les sièges hébergés et rend à l’hôte les sièges détenus par le compte supprimé, en roulant seatVersion/entryNonce', async () => {
      const alice = await seedUser()
      const req = await seedRequest(alice.id)

      // Alice hôte une table sur l'événement d'un AUTRE organisateur.
      const hostedTicket = await Ticket.create({ ticketCode: 'HOST1', eventId: 'ev-other', userId: alice.id, hostUid: alice.id, tableId: 'table-1', paid: true })
      // Alice tient un siège invité sur la table d'un AUTRE hôte.
      const heldSeat = await Ticket.create({
        ticketCode: 'GUEST1',
        eventId: 'ev-other-2',
        userId: alice.id,
        hostUid: 'host-2',
        tableId: 'table-2',
        assignedTo: alice.id,
        assignedName: 'Prenom Nom',
        seatVersion: 1,
        entryNonce: 'old-nonce',
        paid: true,
      })
      // Un tiers tient actuellement un siège dont Alice reste juste `assignedName` affiché (cas rare mais couvert par le modèle).
      const displayedTo = await Ticket.create({
        ticketCode: 'DISPLAY1',
        eventId: 'ev-other-3',
        userId: 'host-3',
        hostUid: 'host-3',
        tableId: 'table-3',
        assignedTo: alice.id,
        assignedName: 'Prenom Nom',
        paid: true,
      })

      const result = await approveDeletion(AGENT, String(req._id))
      expect(result.ok).toBe(true)

      const freshHosted = await Ticket.findById(hostedTicket._id).lean()
      expect(freshHosted?.revoked).toBe(true)

      const freshHeld = await Ticket.findById(heldSeat._id).lean()
      expect(freshHeld?.userId).toBe('host-2')
      expect(freshHeld?.assignedTo).toBeNull()
      expect(freshHeld?.assignedName).toBeNull()
      expect(freshHeld?.seatVersion).toBe(2)
      expect(freshHeld?.entryNonce).not.toBe('old-nonce')

      const freshDisplayed = await Ticket.findById(displayedTo._id).lean()
      expect(freshDisplayed?.assignedName).toBe('Compte supprimé')
    })

    it('annule les invitations de siège en attente émises comme hôte', async () => {
      const alice = await seedUser()
      const req = await seedRequest(alice.id)
      const invite = await SeatInvitation.create({
        ticketCode: 'INV1',
        eventId: 'ev-x',
        tableId: 'table-x',
        hostUid: alice.id,
        targetId: 'target-1',
        targetEmail: 'target@test.com',
        status: 'pending',
      })

      const result = await approveDeletion(AGENT, String(req._id))
      expect(result.ok).toBe(true)

      const fresh = await SeatInvitation.findById(invite._id).lean()
      expect(fresh?.status).toBe('cancelled')
    })

    it('supprime les relations sociales (amitiés, demandes, follows, intérêts)', async () => {
      const alice = await seedUser()
      const bob = await seedUser({ activeRole: 'client', roles: ['client'], orgStatus: 'none' })
      const req = await seedRequest(alice.id)

      await Friendship.create({ userAId: alice.id, userBId: bob.id })
      await FriendRequest.create({ fromId: bob.id, toId: alice.id, status: 'pending' })
      await OrganizerFollow.create({ userId: bob.id, organizerId: alice.id })
      await EventInterest.create({ userId: alice.id, eventId: 'ev-y' })

      const result = await approveDeletion(AGENT, String(req._id))
      expect(result.ok).toBe(true)

      expect(await Friendship.countDocuments({ $or: [{ userAId: alice.id }, { userBId: alice.id }] })).toBe(0)
      expect(await FriendRequest.countDocuments({ $or: [{ fromId: alice.id }, { toId: alice.id }] })).toBe(0)
      expect(await OrganizerFollow.countDocuments({ organizerId: alice.id })).toBe(0)
      expect(await EventInterest.countDocuments({ userId: alice.id })).toBe(0)
    })

    it('retire le membre supprimé d’une conversation de groupe et promeut un nouvel admin ; scrube le nom des messages envoyés', async () => {
      const alice = await seedUser()
      const bob = await seedUser({ activeRole: 'client', roles: ['client'], orgStatus: 'none' })
      const req = await seedRequest(alice.id)

      const conv = await Conversation.create({
        type: 'group',
        participantIds: [alice.id, bob.id],
        members: [
          { userId: alice.id, name: 'Prenom Nom', role: 'admin' },
          { userId: bob.id, name: 'Bob', role: 'member' },
        ],
        name: 'Groupe Neon',
      })
      await Message.create({ conversationId: String(conv._id), senderId: alice.id, senderName: 'Prenom Nom', type: 'text', content: 'Salut' })

      const directConv = await Conversation.create({ type: 'direct', participantIds: [alice.id, bob.id] })

      const result = await approveDeletion(AGENT, String(req._id))
      expect(result.ok).toBe(true)

      const freshConv = await Conversation.findById(conv._id).lean()
      expect(freshConv?.participantIds).toEqual([bob.id])
      expect(freshConv?.members?.map((m) => m.userId)).toEqual([bob.id])
      expect(freshConv?.members?.[0].role).toBe('admin')

      const freshMessage = await Message.findOne({ conversationId: String(conv._id) }).lean()
      expect(freshMessage?.senderName).toBe('Compte supprimé')

      // Conversation directe : Alice retirée, Bob seul reste → conversation
      // conservée (jamais supprimée tant qu'il reste au moins un participant,
      // l'historique appartenant aussi aux AUTRES membres — même règle que le
      // legacy admin-delete-account.js:8, qui ne supprime jamais la conv).
      const freshDirect = await Conversation.findById(directConv._id).lean()
      expect(freshDirect).not.toBeNull()
      expect(freshDirect?.participantIds).toEqual([bob.id])
    })

    it('conserve avis et signalements (audit) mais scrube l’identité affichée', async () => {
      const alice = await seedUser()
      const req = await seedRequest(alice.id)

      const report = await Report.create({ fromId: alice.id, fromName: 'Prenom Nom', targetId: 'target-1', targetName: 'Cible', reason: 'spam' })
      const review = await Review.create({ providerId: 'prov-1', providerName: 'Prov', authorId: alice.id, authorName: 'Prenom Nom', rating: 5, comment: 'Top' })
      const reviewReport = await ReviewReport.create({ reviewId: String(review._id), reporterId: alice.id, reporterName: 'Prenom Nom', reason: 'inapproprié' })

      const result = await approveDeletion(AGENT, String(req._id))
      expect(result.ok).toBe(true)

      const freshReport = await Report.findById(report._id).lean()
      expect(freshReport).not.toBeNull()
      expect(freshReport?.fromName).toBe('Compte supprimé')

      const freshReview = await Review.findById(review._id).lean()
      expect(freshReview).not.toBeNull()
      expect(freshReview?.rating).toBe(5)
      expect(freshReview?.authorName).toBe('Utilisateur supprimé')

      const freshReviewReport = await ReviewReport.findById(reviewReport._id).lean()
      expect(freshReviewReport).not.toBeNull()
      expect(freshReviewReport?.reporterName).toBe('')
    })
  })
})
