import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getDb } from '../lib/db/mongoose'
import { getMongoClient } from '../lib/db/mongodb-client'
import User from '../lib/models/User'
import Event from '../lib/models/Event'
import ProviderProfile from '../lib/models/ProviderProfile'
import OrganizerProfile from '../lib/models/OrganizerProfile'
import Boost from '../lib/models/Boost'
import Ticket from '../lib/models/Ticket'
import Conversation from '../lib/models/Conversation'
import Message from '../lib/models/Message'
import Application from '../lib/models/Application'
import Report from '../lib/models/Report'
import ResaleListing from '../lib/models/ResaleListing'
import SeatInvitation from '../lib/models/SeatInvitation'
import GroupMembership from '../lib/models/GroupMembership'
import RateLimit from '../lib/models/RateLimit'
import Notification from '../lib/models/Notification'
import Order from '../lib/models/Order'
import SeatHold from '../lib/models/SeatHold'
import PromoCode from '../lib/models/PromoCode'
import Review from '../lib/models/Review'
import ReviewReport from '../lib/models/ReviewReport'
import DeletionRequest from '../lib/models/DeletionRequest'
import EventPayout from '../lib/models/EventPayout'
import PayoutRequest from '../lib/models/PayoutRequest'
import SellerBalance from '../lib/models/SellerBalance'
import PaymentAlert from '../lib/models/PaymentAlert'
import SubscriptionPayment from '../lib/models/SubscriptionPayment'
import { verificationTokenIdentifier } from '../lib/auth/token-identifier'

const PASSWORD = 'DevTest1234!'
const RESET_PASSWORD = 'ResetDev1234!'
const tokens = {
  verifyEmail: 'e2e-verify-email-token',
  verifyEmailUi: 'e2e-verify-email-ui-token',
  verifyEmailExpired: 'e2e-verify-email-expired-token',
  resetPassword: 'e2e-reset-password-token',
  resetPasswordUi: 'e2e-reset-password-ui-token',
  resetPasswordExpired: 'e2e-reset-password-expired-token',
  changeEmail: 'e2e-change-email-token',
  changeEmailUi: 'e2e-change-email-ui-token',
  changeEmailExpired: 'e2e-change-email-expired-token',
}
const ids = {
  client: '66e200000000000000000001',
  organizer: '66e200000000000000000002',
  provider: '66e200000000000000000003',
  agent: '66e200000000000000000004',
  orgCandidate: '66e200000000000000000005',
  prestCandidate: '66e200000000000000000006',
  invitee: '66e200000000000000000007',
  unverified: '66e200000000000000000008',
  resetUser: '66e200000000000000000009',
  emailChangeUser: '66e20000000000000000000a',
  unverifiedUi: '66e200000000000000000011',
  resetUserUi: '66e200000000000000000012',
  emailChangeUserUi: '66e200000000000000000013',
  unverifiedExpired: '66e200000000000000000014',
  resetUserExpired: '66e200000000000000000015',
  emailChangeUserExpired: '66e200000000000000000016',
  messagingPeer: '66e200000000000000000017',
  scannerStaff: '66e200000000000000000018',
  messagingPeer2: '66e200000000000000000019',
  paymentBuyer: '66e20000000000000000000b',
  checkoutBuyer: '66e20000000000000000000c',
  deleteRejectUser: '66e20000000000000000000d',
  deleteApproveUser: '66e20000000000000000000e',
  agentManagedUser: '66e20000000000000000000f',
  inactiveSubProvider: '66e200000000000000000010',
  event: '66e200000000000000000101',
  privateEvent: '66e200000000000000000102',
  scannerEvent: '66e200000000000000000103',
  providerProfile: '66e200000000000000000201',
  organizerProfile: '66e200000000000000000202',
  inactiveSubProviderProfile: '66e200000000000000000203',
  ticket: '66e200000000000000000301',
  tableTicket: '66e200000000000000000302',
  tableTicketAcceptRevoke: '66e200000000000000000303',
  tableTicketDecline: '66e200000000000000000304',
  tableTicketLeave: '66e200000000000000000305',
  conversation: '66e200000000000000000401',
  messagingConversation: '66e200000000000000000402',
  messagingConversationTarget: '66e200000000000000000403',
  messageClient: '66e200000000000000000501',
  messageOrganizer: '66e200000000000000000502',
  orgApplication: '66e200000000000000000601',
  prestApplication: '66e200000000000000000602',
  report: '66e200000000000000000603',
  boost: '66e200000000000000000701',
  notification: '66e200000000000000000801',
  stripeExpiringOrder: '66e200000000000000000901',
  fedapayCancellingOrder: '66e200000000000000000902',
  protectedRefundOrder: '66e200000000000000000903',
  protectedRefundTicket: '66e200000000000000000904',
  resaleTicket: '66e200000000000000000905',
  checkinTicket: '66e200000000000000000906',
  scannerTicket: '66e200000000000000000907',
  resaleListing: '66e200000000000000000908',
  promoCheckout: '66e200000000000000000a01',
  deletionRejectRequest: '66e200000000000000000b01',
  deletionApproveRequest: '66e200000000000000000b02',
  payoutRequest: '66e200000000000000000c01',
  paymentAlert: '66e200000000000000000c02',
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
}

function inDays(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

async function upsert(
  model: {
    replaceOne: (
      filter: Record<string, unknown>,
      replacement: Record<string, unknown>,
      options: Record<string, unknown>
    ) => Promise<unknown>
  },
  _id: string,
  doc: Record<string, unknown>
) {
  await model.replaceOne({ _id }, { _id, ...doc }, { upsert: true })
}

async function main() {
  await getDb()
  const mongo = await getMongoClient()
  const now = new Date()
  const passwordHash = await bcrypt.hash(PASSWORD, 12)
  const resetPasswordHash = await bcrypt.hash(RESET_PASSWORD, 12)

  await RateLimit.deleteMany({
    key: {
      $regex: /^(auth-register-ip|password-reset-ip|password-reset-email|reset-password|verification-resend-ip|verification-resend-email|verify-email|auth-login):/,
    },
  })

  await upsert(User, ids.client, {
    email: 'client@liveinblack.dev',
    passwordHash,
    firstName: 'Ama',
    lastName: 'Client',
    phone: '+228 90 11 22 33',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
    points: 30,
  })

  await upsert(User, ids.organizer, {
    email: 'organisateur@liveinblack.dev',
    passwordHash,
    firstName: 'Kwame',
    lastName: 'Organisateur',
    phone: '+228 90 00 00 00',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    status: 'active',
    orgStatus: 'active',
    emailVerifiedAt: now,
    payoutMomos: { tg: '+22890000000' },
  })

  await upsert(User, ids.provider, {
    email: 'prestataire@liveinblack.dev',
    passwordHash,
    firstName: 'Koffi',
    lastName: 'DJ',
    phone: '+228 91 23 45 67',
    roles: ['prestataire'],
    activeRole: 'prestataire',
    status: 'active',
    prestStatus: 'active',
    emailVerifiedAt: now,
    prestataireSubActive: true,
    prestataireSubStatus: 'active',
    prestataireSubRail: 'fedapay',
    providerBillingRegionId: 'togo',
  })

  await upsert(User, ids.agent, {
    email: 'agent@liveinblack.dev',
    passwordHash,
    firstName: 'Agent',
    lastName: 'LIB',
    roles: ['agent'],
    activeRole: 'agent',
    status: 'active',
    emailVerifiedAt: now,
  })

  await upsert(User, ids.invitee, {
    email: 'invitee@liveinblack.dev',
    passwordHash,
    firstName: 'Esi',
    lastName: 'Invitée',
    phone: '+228 92 44 55 66',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
  })

  await upsert(User, ids.unverified, {
    email: 'nonverifie@liveinblack.dev',
    passwordHash,
    firstName: 'Nia',
    lastName: 'Verification',
    phone: '+228 92 44 55 67',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: null,
  })

  await upsert(User, ids.resetUser, {
    email: 'reset@liveinblack.dev',
    passwordHash: resetPasswordHash,
    firstName: 'Remi',
    lastName: 'Reset',
    phone: '+228 92 44 55 68',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
    sessionVersion: 0,
  })

  await upsert(User, ids.emailChangeUser, {
    email: 'email-change@liveinblack.dev',
    passwordHash,
    firstName: 'Chloe',
    lastName: 'Email',
    phone: '+228 92 44 55 69',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
    pendingEmail: 'email-change-new@liveinblack.dev',
    sessionVersion: 0,
  })

  await upsert(User, ids.unverifiedUi, {
    email: 'nonverifie-ui@liveinblack.dev',
    passwordHash,
    firstName: 'Uma',
    lastName: 'Verification',
    phone: '+228 92 44 55 80',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: null,
  })

  await upsert(User, ids.resetUserUi, {
    email: 'reset-ui@liveinblack.dev',
    passwordHash: resetPasswordHash,
    firstName: 'Uri',
    lastName: 'Reset',
    phone: '+228 92 44 55 81',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
    sessionVersion: 0,
  })

  await upsert(User, ids.emailChangeUserUi, {
    email: 'email-change-ui@liveinblack.dev',
    passwordHash,
    firstName: 'Una',
    lastName: 'Email',
    phone: '+228 92 44 55 82',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
    pendingEmail: 'email-change-ui-new@liveinblack.dev',
    sessionVersion: 0,
  })

  await upsert(User, ids.unverifiedExpired, {
    email: 'nonverifie-expired@liveinblack.dev',
    passwordHash,
    firstName: 'Ena',
    lastName: 'Expired',
    phone: '+228 92 44 55 83',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: null,
  })

  await upsert(User, ids.resetUserExpired, {
    email: 'reset-expired@liveinblack.dev',
    passwordHash: resetPasswordHash,
    firstName: 'Ero',
    lastName: 'Expired',
    phone: '+228 92 44 55 84',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
    sessionVersion: 0,
  })

  await upsert(User, ids.emailChangeUserExpired, {
    email: 'email-change-expired@liveinblack.dev',
    passwordHash,
    firstName: 'Ela',
    lastName: 'Expired',
    phone: '+228 92 44 55 85',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
    pendingEmail: 'email-change-expired-new@liveinblack.dev',
    sessionVersion: 0,
  })

  await upsert(User, ids.messagingPeer, {
    email: 'messaging-peer@liveinblack.dev',
    passwordHash,
    firstName: 'Maya',
    lastName: 'Peer',
    phone: '+228 92 44 55 71',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
  })

  await upsert(User, ids.scannerStaff, {
    email: 'scanner-staff@liveinblack.dev',
    passwordHash,
    firstName: 'Sacha',
    lastName: 'Scanner',
    phone: '+228 92 44 55 79',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    status: 'active',
    orgStatus: 'active',
    emailVerifiedAt: now,
  })

  await upsert(User, ids.messagingPeer2, {
    email: 'messaging-peer-2@liveinblack.dev',
    passwordHash,
    firstName: 'Nina',
    lastName: 'Peer',
    phone: '+228 92 44 55 70',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
  })

  await User.deleteOne({ email: 'email-change-new@liveinblack.dev', _id: { $ne: ids.emailChangeUser } })
  await User.deleteOne({ email: 'email-change-ui-new@liveinblack.dev', _id: { $ne: ids.emailChangeUserUi } })
  await User.deleteOne({ email: 'email-change-expired-new@liveinblack.dev', _id: { $ne: ids.emailChangeUserExpired } })
  await User.deleteMany({ email: { $in: ['agent-managed-updated@liveinblack.dev'] }, _id: { $ne: ids.agentManagedUser } })

  await Ticket.deleteMany({ userId: { $in: [ids.paymentBuyer, ids.checkoutBuyer] } })
  await Order.deleteMany({ userId: { $in: [ids.paymentBuyer, ids.checkoutBuyer] } })
  await Order.deleteMany({ ticketCode: { $in: ['E2E-RESALE-001', 'E2E-TABLE-001', 'E2E-TABLE-ACCEPT-REVOKE', 'E2E-TABLE-DECLINE', 'E2E-TABLE-LEAVE'] } })
  await SeatHold.deleteMany({ userId: { $in: [ids.paymentBuyer, ids.checkoutBuyer] } })
  await ResaleListing.deleteMany({ ticketCode: { $in: ['E2E-RESALE-001', 'E2E-TABLE-001', 'E2E-TABLE-ACCEPT-REVOKE', 'E2E-TABLE-DECLINE', 'E2E-TABLE-LEAVE'] } })
  await PromoCode.deleteMany({ eventId: ids.event, code: { $in: ['E2EPROMO'] } })
  await DeletionRequest.deleteMany({ _id: { $in: [ids.deletionRejectRequest, ids.deletionApproveRequest] } })
  await EventPayout.deleteMany({ eventId: ids.privateEvent })
  await PayoutRequest.deleteMany({ _id: ids.payoutRequest })
  await PaymentAlert.deleteMany({ _id: ids.paymentAlert })
  await SubscriptionPayment.deleteMany({ userId: ids.inactiveSubProvider })
  await Notification.deleteMany({ userId: ids.client, title: 'Notification E2E' })
  const staleReviews = await Review.find({ providerId: ids.provider, authorId: ids.client }).select('_id').lean()
  await ReviewReport.deleteMany({ reviewId: { $in: staleReviews.map((review) => String(review._id)) } })
  await Review.deleteMany({ providerId: ids.provider, authorId: ids.client })

  await upsert(User, ids.paymentBuyer, {
    email: 'payment-buyer@liveinblack.dev',
    passwordHash,
    firstName: 'Payo',
    lastName: 'Buyer',
    phone: '+228 92 44 55 70',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
  })

  await upsert(User, ids.checkoutBuyer, {
    email: 'checkout-buyer@liveinblack.dev',
    passwordHash,
    firstName: 'Cheko',
    lastName: 'Buyer',
    phone: '+228 92 44 55 71',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
  })

  await upsert(User, ids.deleteRejectUser, {
    email: 'delete-reject@liveinblack.dev',
    passwordHash,
    firstName: 'Rejane',
    lastName: 'Suppression',
    phone: '+228 92 44 55 72',
    roles: ['prestataire'],
    activeRole: 'prestataire',
    status: 'active',
    prestStatus: 'active',
    orgStatus: 'none',
    emailVerifiedAt: now,
    prestataireSubActive: false,
    prestataireSubStatus: 'inactive',
  })

  await upsert(User, ids.deleteApproveUser, {
    email: 'delete-approve@liveinblack.dev',
    passwordHash,
    firstName: 'Apollon',
    lastName: 'Suppression',
    phone: '+228 92 44 55 73',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    status: 'active',
    orgStatus: 'active',
    prestStatus: 'none',
    emailVerifiedAt: now,
    prestataireSubActive: false,
    prestataireSubStatus: 'inactive',
  })

  await upsert(User, ids.agentManagedUser, {
    email: 'agent-managed@liveinblack.dev',
    passwordHash,
    firstName: 'Mina',
    lastName: 'Managed',
    phone: '+228 92 44 55 74',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    disabled: false,
    emailVerifiedAt: null,
    sessionVersion: 0,
  })

  await upsert(User, ids.inactiveSubProvider, {
    email: 'prestataire-subscription@liveinblack.dev',
    passwordHash,
    firstName: 'Sika',
    lastName: 'Subscription',
    phone: '+228 92 44 55 76',
    roles: ['prestataire'],
    activeRole: 'prestataire',
    status: 'active',
    prestStatus: 'active',
    emailVerifiedAt: now,
    prestataireSubActive: false,
    prestataireSubStatus: 'none',
    prestataireSubRail: null,
    prestataireSubEnd: null,
    pendingFedapaySubTxnId: null,
    providerBillingRegionId: 'togo',
  })

  await upsert(DeletionRequest, ids.deletionRejectRequest, {
    userId: ids.deleteRejectUser,
    reason: 'Demande de suppression E2E à refuser.',
    requestedAt: now,
    status: 'pending',
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: '',
  })

  await upsert(DeletionRequest, ids.deletionApproveRequest, {
    userId: ids.deleteApproveUser,
    reason: 'Demande de suppression E2E à approuver.',
    requestedAt: now,
    status: 'pending',
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: '',
  })

  await upsert(User, ids.orgCandidate, {
    email: 'candidat-organisateur@liveinblack.dev',
    passwordHash,
    firstName: 'Sena',
    lastName: 'Candidat',
    phone: '+228 90 55 66 77',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    status: 'active',
    orgStatus: 'pending',
    emailVerifiedAt: now,
  })

  await upsert(User, ids.prestCandidate, {
    email: 'candidat-prestataire@liveinblack.dev',
    passwordHash,
    firstName: 'Yawa',
    lastName: 'Traiteur',
    phone: '+228 91 77 88 99',
    roles: ['prestataire'],
    activeRole: 'prestataire',
    status: 'active',
    prestStatus: 'pending',
    emailVerifiedAt: now,
  })

  await upsert(OrganizerProfile, ids.organizerProfile, {
    userId: ids.organizer,
    publicName: 'Obsidian Nights',
    slug: 'obsidian-nights',
    shortDescription: 'Le collectif qui fait vibrer Lomé depuis 2022.',
    longDescription: 'Soirées afrobeat et amapiano premium à Lomé et Cotonou.',
    city: 'Lomé',
    country: 'Togo',
    regionId: 'togo',
    status: 'public',
    isVerified: true,
    zonesIntervention: ['togo', 'benin'],
    followersCount: 342,
    totalEventsCount: 1,
    proPhone: '+228 90 00 00 00',
  })

  await upsert(ProviderProfile, ids.providerProfile, {
    userId: ids.provider,
    name: 'DJ Koffi',
    headline: 'DJ Afrobeat / Amapiano — 10 ans d’expérience',
    description: "Résident de plusieurs clubs à Lomé, DJ Koffi mixe afrobeat, amapiano et hip-hop.",
    city: 'Lomé',
    country: 'Togo',
    regionId: 'togo',
    zonesIntervention: ['togo', 'benin'],
    prestataireType: 'artiste',
    prestataireTypes: ['artiste'],
    phone: '+228 91 23 45 67',
    catalogCurrency: 'XOF',
    subscriptionActive: true,
    catalog: [{ id: 'c1', name: 'Set DJ 3h', description: 'Set complet, matériel son inclus.', price: 150000, currency: 'XOF', unit: 'soirée', category: 'DJ', available: true }],
  })

  await upsert(ProviderProfile, ids.inactiveSubProviderProfile, {
    userId: ids.inactiveSubProvider,
    name: 'Sika Studio E2E',
    headline: 'Studio photo événementiel',
    description: 'Studio photo mobile pour mariages, concerts et soirées privées.',
    city: 'Lomé',
    country: 'Togo',
    regionId: 'togo',
    zonesIntervention: ['togo'],
    prestataireType: 'photo',
    prestataireTypes: ['photo'],
    phone: '+228 92 44 55 76',
    catalogCurrency: 'XOF',
    subscriptionActive: false,
    subscriptionStatus: 'none',
    subscriptionStartedAt: null,
    subscriptionExpiresAt: null,
    gracePeriodEndsAt: null,
    catalog: [{ id: 'photo1', name: 'Pack photos E2E', description: 'Captation photo complète.', price: 120000, currency: 'XOF', unit: 'événement', category: 'Photo', available: true }],
  })

  await upsert(Event, ids.event, {
    name: 'AFRO NATION LOMÉ',
    subtitle: 'La plus grosse soirée afrobeat du mois',
    description: "Une nuit entière dédiée à l'afrobeat et à l'amapiano.",
    category: 'Afrobeat',
    tags: ['Afrobeat', 'Premium'],
    date: inDays(30),
    dateDisplay: 'SAM 15 AOÛT 2026',
    time: '22:00',
    endTime: '05:00',
    location: 'Club Oxygène, Lomé',
    city: 'Lomé',
    region: 'Togo',
    currency: 'XOF',
    imageUrl: '/images/live-in-black/directory/directory-events-vip-entry.png',
    places: [
      { id: 'p1', type: 'Entrée standard', price: 5000, available: 117, total: 200, maxPerAccount: 4 },
      { id: 'p2', type: 'VIP', price: 15000, available: 3, total: 20, maxPerAccount: 2 },
    ],
    preorder: true,
    menu: [{ name: 'Cocktail signature', price: 5000, category: 'Boissons' }],
    artists: [{ name: 'DJ Koffi', role: 'DJ', providerId: ids.provider }],
    minAge: 18,
    userCreated: true,
    isPrivate: false,
    createdBy: ids.organizer,
    organizerId: ids.organizer,
    organizerName: 'Obsidian Nights',
    organizer: 'Obsidian Nights',
  })

  await upsert(PromoCode, ids.promoCheckout, {
    eventId: ids.event,
    code: 'E2EPROMO',
    type: 'fixed',
    value: 1000,
    maxUses: 20,
    usedCount: 0,
    active: true,
    expiresAt: null,
    createdBy: ids.organizer,
    placeIds: ['p1'],
  })

  await upsert(Event, ids.privateEvent, {
    name: 'SOIRÉE PRIVÉE — ANNIVERSAIRE',
    subtitle: 'Sur invitation uniquement',
    description: 'Événement privé.',
    category: 'House',
    date: inDays(20),
    dateDisplay: 'VEN 4 SEPT 2026',
    time: '21:00',
    endTime: '04:00',
    location: 'Villa Kodjoviakopé, Lomé',
    city: 'Lomé',
    region: 'Togo',
    currency: 'XOF',
    places: [{ id: 'p1', type: 'Entrée', price: 0, available: 40, total: 50 }],
    minAge: 18,
    userCreated: true,
    isPrivate: true,
    privateCodeHash: hashCode('SECRET2026'),
    createdBy: ids.organizer,
    organizerId: ids.organizer,
    organizerName: 'Obsidian Nights',
    organizer: 'Obsidian Nights',
  })

  await upsert(Event, ids.scannerEvent, {
    name: 'E2E SCANNER LOMÉ',
    subtitle: 'Événement dédié au parcours scanner',
    description: 'Événement technique réservé aux validations scanner E2E.',
    category: 'Technique',
    tags: ['E2E', 'Scanner'],
    date: inDays(30),
    dateDisplay: 'SAM 15 AOÛT 2026',
    time: '22:00',
    endTime: '05:00',
    location: 'Salle Test Scanner, Lomé',
    city: 'Lomé',
    region: 'Togo',
    currency: 'XOF',
    imageUrl: '/images/live-in-black/placeholders/placeholder-event-dancefloor.png',
    places: [{ id: 'p1', type: 'Entrée standard', price: 5000, available: 40, total: 40, maxPerAccount: 2 }],
    preorder: true,
    menu: [],
    artists: [],
    minAge: 18,
    userCreated: true,
    isPrivate: false,
    createdBy: ids.organizer,
    organizerId: ids.organizer,
    organizerName: 'Scanner E2E',
    organizer: 'Scanner E2E',
    publishedAt: now,
    status: 'published',
    createdAt: now,
    updatedAt: now,
  })

  await upsert(EventPayout, ids.privateEvent, {
    eventId: ids.privateEvent,
    sellerUid: ids.organizer,
    amountDueXOF: 7000,
    momoCountry: 'TG',
    status: 'failed',
    pendingPayoutId: null,
    claimedAmount: 7000,
    lastPayoutId: 'po_e2e_failed_private_event',
    lastPayoutStatus: 'failed',
    lastPayoutAt: now,
    lastReconciledAt: now,
    failReason: 'Compte mobile money indisponible pour E2E.',
    failCode: 'momo_unavailable',
  })

  await SellerBalance.updateOne(
    { sellerUid: ids.organizer },
    { $set: { sellerUid: ids.organizer, amountDueXOF: 7000 }, $setOnInsert: { amountDueCents: 0 } },
    { upsert: true }
  )

  await SellerBalance.updateOne(
    { sellerUid: ids.provider },
    { $set: { sellerUid: ids.provider, amountDueCents: 12000, amountDueXOF: 0 } },
    { upsert: true }
  )

  await upsert(PayoutRequest, ids.payoutRequest, {
    sellerUid: ids.provider,
    amountDueCents: 15000,
    amountDueXOF: 0,
    status: 'pending',
    paidAt: null,
    paidBy: null,
    paidAmount: null,
    paidCurrency: null,
  })

  await upsert(PaymentAlert, ids.paymentAlert, {
    key: 'e2e-payment-alert',
    reason: 'e2e_reconciliation_required',
    eventId: ids.event,
    sellerUid: ids.organizer,
    details: { source: 'seed-e2e', expectedMinor: 5000, receivedMinor: 4500 },
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
  })

  await upsert(Boost, ids.boost, {
    boostId: 'SEED_BOOST_1',
    eventId: ids.event,
    position: 1,
    region: 'togo',
    price: 9.99,
    days: 7,
    userId: ids.organizer,
    purchasedAt: now,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: 'active',
  })

  const pendingOrderBase = {
    userId: ids.paymentBuyer,
    eventId: ids.event,
    placeId: 'p1',
    placeType: 'Entrée standard',
    qty: 1,
    isTable: false,
    tableSeats: 0,
    unitPriceMinor: 5000,
    currency: 'XOF',
    feeMinor: 250,
    cancellationProtectionPurchased: false,
    cancellationProtectionFeeMinor: 0,
    promoCode: null,
    promoUses: 0,
    promoUnitDiscountMinor: 0,
    preorders: [],
    ticketPreorders: [],
    sellerUid: ids.organizer,
    connectMode: 'ledger',
    status: 'pending',
    kind: 'ticket',
    stockDecremented: true,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    fulfillStartedAt: null,
    paid: false,
    settled: false,
  }

  await upsert(Order, ids.stripeExpiringOrder, {
    ...pendingOrderBase,
    rail: 'stripe',
    stripeSessionId: 'cs_e2e_expire_stock',
    fedapayTxnId: null,
  })

  await upsert(Order, ids.fedapayCancellingOrder, {
    ...pendingOrderBase,
    rail: 'fedapay',
    stripeSessionId: null,
    fedapayTxnId: 'txn_e2e_cancel_stock',
  })

  await upsert(Order, ids.protectedRefundOrder, {
    userId: ids.paymentBuyer,
    eventId: ids.event,
    placeId: 'p1',
    placeType: 'Entrée standard',
    qty: 1,
    isTable: false,
    tableSeats: 0,
    unitPriceMinor: 5000,
    currency: 'XOF',
    feeMinor: 250,
    cancellationProtectionPurchased: true,
    cancellationProtectionFeeMinor: 500,
    promoCode: null,
    promoUses: 0,
    promoUnitDiscountMinor: 0,
    preorders: [],
    ticketPreorders: [],
    sellerUid: ids.organizer,
    connectMode: 'ledger',
    rail: 'fedapay',
    status: 'paid',
    kind: 'ticket',
    stockDecremented: true,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    fulfillStartedAt: null,
    paid: true,
    settled: true,
    fedapayTxnId: 'txn_e2e_refund_protected',
    stripeSessionId: null,
    clientRefundRequestedAt: null,
    clientRefundReason: null,
  })

  await upsert(Ticket, ids.protectedRefundTicket, {
    ticketCode: 'E2E-REFUND-001',
    orderId: ids.protectedRefundOrder,
    eventId: ids.event,
    eventName: 'AFRO NATION LOMÉ',
    eventDate: inDays(30),
    place: 'Entrée standard',
    placePrice: 5000,
    totalPrice: 5000,
    currency: 'XOF',
    userId: ids.paymentBuyer,
    paid: true,
    source: 'fedapay-webhook',
    fedapayTransactionId: 'txn_e2e_refund_protected',
    bookedAt: now,
  })

  await upsert(Ticket, ids.ticket, {
    ticketCode: 'E2E-AFRO-001',
    eventId: ids.event,
    eventName: 'AFRO NATION LOMÉ',
    eventDate: inDays(30),
    place: 'Entrée standard',
    placePrice: 5000,
    totalPrice: 5000,
    currency: 'XOF',
    userId: ids.client,
    paid: true,
    source: 'paid',
    bookedAt: now,
  })

  await upsert(Ticket, ids.resaleTicket, {
    ticketCode: 'E2E-RESALE-001',
    eventId: ids.event,
    eventName: 'AFRO NATION LOMÉ',
    eventDate: inDays(30),
    place: 'Entrée standard',
    placePrice: 5000,
    totalPrice: 5000,
    currency: 'XOF',
    userId: ids.client,
    paid: true,
    source: 'paid',
    bookedAt: now,
  })

  await upsert(Ticket, ids.checkinTicket, {
    ticketCode: 'E2E-CHECKIN-001',
    eventId: ids.event,
    eventName: 'AFRO NATION LOMÉ',
    eventDate: inDays(30),
    place: 'Entrée standard',
    placePrice: 5000,
    totalPrice: 5000,
    currency: 'XOF',
    userId: ids.client,
    paid: true,
    source: 'paid',
    bookedAt: now,
    checkedInAt: null,
    checkedInBy: null,
  })

  await upsert(Ticket, ids.scannerTicket, {
    ticketCode: 'E2E-SCANNER-001',
    eventId: ids.scannerEvent,
    eventName: 'E2E SCANNER LOMÉ',
    eventDate: inDays(30),
    place: 'Entrée standard',
    placePrice: 5000,
    totalPrice: 5000,
    currency: 'XOF',
    userId: ids.client,
    paid: true,
    source: 'paid',
    bookedAt: now,
    checkedInAt: null,
    checkedInBy: null,
  })

  const e2eTableCodes = ['E2E-TABLE-001', 'E2E-TABLE-ACCEPT-REVOKE', 'E2E-TABLE-DECLINE', 'E2E-TABLE-LEAVE']
  await ResaleListing.updateMany({ ticketCode: { $in: ['E2E-AFRO-001', ...e2eTableCodes] }, status: { $in: ['active', 'reserved'] } }, { $set: { status: 'withdrawn' } })
  await SeatInvitation.deleteMany({ ticketCode: { $in: e2eTableCodes } })
  await GroupMembership.deleteMany({ eventId: ids.event, userId: { $in: [ids.client, ids.invitee, ids.provider] } })

  await upsert(Ticket, ids.tableTicket, {
    ticketCode: 'E2E-TABLE-001',
    eventId: ids.event,
    eventName: 'AFRO NATION LOMÉ',
    eventDate: inDays(30),
    place: 'Table VIP',
    placePrice: 15000,
    totalPrice: 15000,
    currency: 'XOF',
    userId: ids.client,
    hostUid: ids.client,
    tableId: 'E2E-TABLE-A',
    seatIndex: 1,
    seatVersion: 0,
    entryNonce: 'seed-entry-nonce',
    assignedTo: null,
    assignedName: null,
    paid: true,
    source: 'paid',
    resaleListingId: null,
    resaleCount: 0,
    bookedAt: now,
    checkedInAt: null,
    checkedInBy: null,
  })

  const tableTicketBase = {
    eventId: ids.event,
    eventName: 'AFRO NATION LOMÉ',
    eventDate: inDays(30),
    place: 'Table VIP',
    placePrice: 15000,
    totalPrice: 15000,
    currency: 'XOF',
    userId: ids.client,
    hostUid: ids.client,
    paid: true,
    source: 'paid',
    resaleListingId: null,
    resaleCount: 0,
    bookedAt: now,
    checkedInAt: null,
    checkedInBy: null,
  }

  await upsert(Ticket, ids.tableTicketAcceptRevoke, {
    ...tableTicketBase,
    ticketCode: 'E2E-TABLE-ACCEPT-REVOKE',
    tableId: 'E2E-TABLE-B',
    seatIndex: 2,
    seatVersion: 0,
    entryNonce: 'seed-entry-nonce-accept-revoke',
    assignedTo: null,
    assignedName: null,
    assignedAt: null,
  })

  await upsert(Ticket, ids.tableTicketDecline, {
    ...tableTicketBase,
    ticketCode: 'E2E-TABLE-DECLINE',
    tableId: 'E2E-TABLE-C',
    seatIndex: 3,
    seatVersion: 0,
    entryNonce: 'seed-entry-nonce-decline',
    assignedTo: null,
    assignedName: null,
    assignedAt: null,
  })

  await upsert(Ticket, ids.tableTicketLeave, {
    ...tableTicketBase,
    ticketCode: 'E2E-TABLE-LEAVE',
    tableId: 'E2E-TABLE-D',
    seatIndex: 4,
    seatVersion: 0,
    entryNonce: 'seed-entry-nonce-leave',
    assignedTo: null,
    assignedName: null,
    assignedAt: null,
  })

  await upsert(Conversation, ids.conversation, {
    type: 'direct',
    participantIds: [ids.client, ids.organizer],
    lastMessage: 'Avec plaisir, à très vite !',
    lastMessageAt: now,
    lastSenderId: ids.organizer,
    lastReadAt: { [ids.organizer]: now },
  })

  await upsert(Conversation, ids.messagingConversation, {
    type: 'group',
    participantIds: [ids.client, ids.messagingPeer],
    members: [
      { userId: ids.client, name: 'Ama Client', role: 'admin' },
      { userId: ids.messagingPeer, name: 'Maya Peer', role: 'member' },
    ],
    name: 'Conversation E2E',
    mutedUserIds: [],
    lastMessage: 'Conversation E2E créée',
    lastMessageAt: now,
    lastSenderId: ids.client,
    lastReadAt: { [ids.client]: now },
  })

  await upsert(Conversation, ids.messagingConversationTarget, {
    type: 'group',
    participantIds: [ids.client, ids.messagingPeer2],
    members: [
      { userId: ids.client, name: 'Ama Client', role: 'admin' },
      { userId: ids.messagingPeer2, name: 'Nina Peer', role: 'member' },
    ],
    name: 'Conversation cible E2E',
    mutedUserIds: [],
    lastMessage: 'Conversation cible E2E créée',
    lastMessageAt: now,
    lastSenderId: ids.client,
    lastReadAt: { [ids.client]: now },
  })

  await upsert(Message, ids.messageClient, {
    conversationId: ids.conversation,
    senderId: ids.client,
    senderName: 'Ama Client',
    type: 'text',
    content: 'Salut ! Il reste des places VIP pour Afro Nation Lomé ?',
    createdAt: new Date(now.getTime() - 120000),
  })

  await upsert(Message, ids.messageOrganizer, {
    conversationId: ids.conversation,
    senderId: ids.organizer,
    senderName: 'Obsidian Nights',
    type: 'text',
    content: 'Avec plaisir, à très vite !',
    createdAt: now,
  })

  await upsert(Application, ids.orgApplication, {
    userId: ids.orgCandidate,
    type: 'organisateur',
    status: 'submitted',
    formData: { nomCommercial: 'Sena Events', ville: 'Lomé', pays: 'Togo', description: 'Collectif organisateur E2E.' },
    documents: {},
    auditLog: [{ action: 'submitted', by: ids.orgCandidate, byName: 'Sena Events', at: now, note: '' }],
    submittedAt: now,
  })

  await upsert(Application, ids.prestApplication, {
    userId: ids.prestCandidate,
    type: 'prestataire',
    status: 'submitted',
    formData: { prenom: 'Yawa', nom: 'Traiteur', ville: 'Lomé', pays: 'Togo', prestataireTypes: ['food'], description: 'Traiteur événementiel E2E.' },
    documents: {},
    auditLog: [{ action: 'submitted', by: ids.prestCandidate, byName: 'Yawa Traiteur', at: now, note: '' }],
    submittedAt: now,
  })

  await upsert(Report, ids.report, {
    fromId: ids.client,
    fromName: 'Ama Client',
    targetId: ids.provider,
    targetName: 'DJ Koffi',
    reason: 'Signalement E2E à traiter',
    handled: false,
    handledAt: null,
    handledBy: '',
    handledNote: '',
  })

  await upsert(Notification, ids.notification, {
    userId: ids.client,
    type: 'reminder',
    title: 'Notification E2E',
    body: 'Une alerte déterministe pour tester le centre de notifications.',
    link: '/events',
    read: false,
    meta: { conversationId: null },
  })

  const verificationTokens = mongo.db().collection('verification_tokens')
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const expired = new Date(Date.now() - 60 * 1000)
  const seededTokenIdentifiers = [
    verificationTokenIdentifier(ids.unverified, 'nonverifie@liveinblack.dev', 'verify-email'),
    verificationTokenIdentifier(ids.unverifiedUi, 'nonverifie-ui@liveinblack.dev', 'verify-email'),
    verificationTokenIdentifier(ids.unverifiedExpired, 'nonverifie-expired@liveinblack.dev', 'verify-email'),
    verificationTokenIdentifier(ids.resetUser, 'reset@liveinblack.dev', 'reset-password'),
    verificationTokenIdentifier(ids.resetUserUi, 'reset-ui@liveinblack.dev', 'reset-password'),
    verificationTokenIdentifier(ids.resetUserExpired, 'reset-expired@liveinblack.dev', 'reset-password'),
    verificationTokenIdentifier(ids.emailChangeUser, 'email-change-new@liveinblack.dev', 'change-email'),
    verificationTokenIdentifier(ids.emailChangeUserUi, 'email-change-ui-new@liveinblack.dev', 'change-email'),
    verificationTokenIdentifier(ids.emailChangeUserExpired, 'email-change-expired-new@liveinblack.dev', 'change-email'),
  ]
  await verificationTokens.deleteMany({ identifier: { $in: seededTokenIdentifiers } })
  await verificationTokens.insertMany([
    {
      identifier: seededTokenIdentifiers[0],
      token: tokens.verifyEmail,
      expires,
    },
    {
      identifier: seededTokenIdentifiers[1],
      token: tokens.verifyEmailUi,
      expires,
    },
    {
      identifier: seededTokenIdentifiers[2],
      token: tokens.verifyEmailExpired,
      expires: expired,
    },
    {
      identifier: seededTokenIdentifiers[3],
      token: tokens.resetPassword,
      expires,
    },
    {
      identifier: seededTokenIdentifiers[4],
      token: tokens.resetPasswordUi,
      expires,
    },
    {
      identifier: seededTokenIdentifiers[5],
      token: tokens.resetPasswordExpired,
      expires: expired,
    },
    {
      identifier: seededTokenIdentifiers[6],
      token: tokens.changeEmail,
      expires,
    },
    {
      identifier: seededTokenIdentifiers[7],
      token: tokens.changeEmailUi,
      expires,
    },
    {
      identifier: seededTokenIdentifiers[8],
      token: tokens.changeEmailExpired,
      expires: expired,
    },
  ])

  console.log('Seed E2E OK — mot de passe commun:', PASSWORD)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
