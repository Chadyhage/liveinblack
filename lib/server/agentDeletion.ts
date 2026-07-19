import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { getDb } from '../db/mongoose'
import DeletionRequest from '../models/DeletionRequest'
import User from '../models/User'
import Event from '../models/Event'
import Ticket from '../models/Ticket'
import EventPayout from '../models/EventPayout'
import SellerBalance from '../models/SellerBalance'
import PayoutRequest from '../models/PayoutRequest'
import EventOrder from '../models/EventOrder'
import EventOrderLog from '../models/EventOrderLog'
import EventPlaylist from '../models/EventPlaylist'
import EventStaff from '../models/EventStaff'
import PromoCode from '../models/PromoCode'
import EventAccessCode from '../models/EventAccessCode'
import { cancelProviderSubscriptionForDeletion } from './providerSubscriptions'
import { scrubAccountPII } from './accountPurge'
import { eventEffectiveEndMs } from '../shared/event-time'
import type { EventLike } from '../shared/event-types'

// Port de la section « Suppressions » de src/pages/AgentPage.jsx (#9 phase
// agent/admin, tâche #104) + de la purge api/admin-delete-account.js.
// Contrairement au legacy (énumération Firestore collection par collection,
// une transaction Admin SDK ad hoc pour le registre `tickets`, des lots de
// 450 écritures), cette version est une REFONTE Mongo-native : requêtes
// ciblées par index (userId/organizerId/participantIds/...) plutôt qu'une
// liste figée de noms de collections, et une VRAIE transaction Mongo
// (mongoose.startSession) pour toute la purge — jamais un `Promise.allSettled`
// qui masque des échecs partiels comme le faisait le legacy.
//
// Décision structurante, alignée sur lib/server/profile.ts:deleteAccount
// (auto-suppression client) : le document `User` n'est JAMAIS supprimé en
// dur, seulement ANONYMISÉ + verrouillé (`disabled:true`, hash de mot de
// passe irrécupérable). Toute collection qui référence uid comme simple
// clé étrangère (Order, Ticket, Boost, EventPayout, SellerBalance,
// PayoutRequest, Review, ReviewReport...) n'a donc PAS besoin d'être purgée
// pour rester intègre — elle continue de pointer vers un User valide, déjà
// vidé de son identité. Seules deux catégories de données sont réellement
// touchées ci-dessous : (1) les DOUBLONS DÉNORMALISÉS d'identité (senderName,
// authorName, organizerName...) qui ne se refléteraient jamais automatiquement
// depuis le User anonymisé, et (2) les registres purement personnels/sociaux
// sans valeur financière ni valeur pour un tiers (amitiés, follows, intérêts,
// candidature). Les enregistrements financiers/d'audit (Order, EventPayout,
// SellerBalance, PayoutRequest, Boost, Review, Report, ReviewReport) ne sont
// JAMAIS supprimés — seule leur identité affichée est anonymisée quand elle
// est dénormalisée.

export interface AgentCaller {
  id: string
  name: string
}

type ErrResult = { ok: false; status: number; error: string }

// ─────────────────────────── Audit (blockers/warnings) ──────────────────────
// Recalculé À LA DEMANDE (liste, détail, et juste avant la purge) depuis
// l'état Mongo courant — jamais un snapshot figé au moment de la demande
// (contrairement à `audit` dans accountDeletion.js légataire, qui pouvait
// être périmé de plusieurs jours au moment où un agent statue).

export interface AuditItem {
  type: string
  label: string
}

export interface DeletionAudit {
  blockers: AuditItem[]
  warnings: AuditItem[]
}

// 'upcoming' = à venir et non annulé → soit bloque (billets vendus), soit
// sera supprimé à l'approbation (aucune vente). 'archived' = passé OU
// annulé → conservé tel quel pour l'historique des acheteurs, seule
// l'identité affichée de l'organisateur est anonymisée.
function eventDisposition(ev: { cancelled?: boolean; date?: string; time?: string; endTime?: string; closingDate?: string | Date | null }): 'upcoming' | 'archived' {
  if (ev.cancelled) return 'archived'
  const endMs = eventEffectiveEndMs(ev as EventLike)
  const isPast = endMs > 0 && Date.now() >= endMs
  return isPast ? 'archived' : 'upcoming'
}

async function computeDeletionAudit(uid: string): Promise<DeletionAudit> {
  await getDb()
  const blockers: AuditItem[] = []
  const warnings: AuditItem[] = []

  const user = await User.findById(uid).lean()
  if (!user) return { blockers, warnings }

  if (user.prestataireSubActive) {
    warnings.push({
      type: 'active_subscription',
      label: `Abonnement prestataire actif (${user.prestataireSubRail === 'stripe' ? 'Stripe' : 'FedaPay'}) — sera résilié automatiquement à l'approbation.`,
    })
  }

  const events = await Event.find({ $or: [{ createdBy: uid }, { organizerId: uid }] }).lean()
  if (events.length > 0) {
    const eventIds = events.map((e) => String(e._id))
    const soldTickets = await Ticket.find({ eventId: { $in: eventIds }, paid: true, revoked: { $ne: true } })
      .select('eventId userId')
      .lean()
    const soldByEvent = new Map<string, number>()
    for (const t of soldTickets) {
      if (t.userId === uid) continue // billet du compte supprimé lui-même — jamais bloquant
      soldByEvent.set(t.eventId, (soldByEvent.get(t.eventId) ?? 0) + 1)
    }

    for (const ev of events) {
      const id = String(ev._id)
      const disposition = eventDisposition(ev)
      const sold = soldByEvent.get(id) ?? 0
      if (disposition === 'upcoming' && sold > 0) {
        blockers.push({
          type: 'future_event_with_bookings',
          label: `Événement à venir « ${ev.name} » (${ev.date}) — ${sold} billet(s) vendu(s). Fais annuler l'événement (remboursement des acheteurs) avant d'approuver.`,
        })
      } else if (disposition === 'upcoming') {
        warnings.push({ type: 'future_event_no_bookings', label: `Événement à venir « ${ev.name} » sans réservation — sera supprimé à l'approbation.` })
      } else {
        warnings.push({ type: 'past_event_archived', label: `Événement « ${ev.name} » (${ev.cancelled ? 'annulé' : 'passé'}) — conservé pour l'historique des acheteurs, organisateur anonymisé.` })
      }
    }
  }

  const [balance, payouts, pendingPayoutRequests] = await Promise.all([
    SellerBalance.findOne({ sellerUid: uid }).lean(),
    EventPayout.find({ sellerUid: uid, status: { $in: ['accumulating', 'paying'] } }).lean(),
    PayoutRequest.countDocuments({ sellerUid: uid, status: 'pending' }),
  ])
  const owedCents = balance?.amountDueCents ?? 0
  const owedXOF = (balance?.amountDueXOF ?? 0) + payouts.reduce((sum, p) => sum + Math.max(0, p.amountDueXOF || 0), 0)
  if (owedCents > 0 || owedXOF > 0) {
    const parts: string[] = []
    if (owedCents > 0) parts.push(`${(owedCents / 100).toFixed(2)} €`)
    if (owedXOF > 0) parts.push(`${owedXOF.toLocaleString('fr-FR')} FCFA`)
    blockers.push({ type: 'pending_settlement', label: `Recette non versée (${parts.join(' + ')}) — à régler avant d'approuver.` })
  }
  if (pendingPayoutRequests > 0) {
    blockers.push({ type: 'pending_payout_request', label: `${pendingPayoutRequests} demande(s) de versement en attente — à traiter avant d'approuver.` })
  }

  return { blockers, warnings }
}

// ────────────────────────────── Revue agent — liste ─────────────────────────

export interface DeletionRequestSummary {
  id: string
  userId: string
  userName: string
  userEmail: string
  userRole: string
  reason: string
  requestedAt: string
  status: 'pending' | 'approved' | 'rejected'
}

function toSummary(r: { _id: unknown; userId: string; reason: string; requestedAt: Date; status: 'pending' | 'approved' | 'rejected' }, user: { email?: string; firstName?: string; lastName?: string; activeRole?: string } | undefined): DeletionRequestSummary {
  return {
    id: String(r._id),
    userId: r.userId,
    userName: user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : '',
    userEmail: user?.email ?? '',
    userRole: user?.activeRole ?? '',
    reason: r.reason,
    requestedAt: new Date(r.requestedAt).toISOString(),
    status: r.status,
  }
}

export async function listDeletionRequestsForAgent(): Promise<DeletionRequestSummary[]> {
  await getDb()

  const requests = await DeletionRequest.find({ status: 'pending' }).sort({ requestedAt: -1 }).lean()
  const userIds = [...new Set(requests.map((r) => r.userId))]
  const users = await User.find({ _id: { $in: userIds } }).select('email firstName lastName activeRole').lean()
  const userById = new Map(users.map((u) => [String(u._id), u]))

  return requests.map((r) => toSummary(r, userById.get(r.userId)))
}

export interface DeletionRequestDetail extends DeletionRequestSummary {
  audit: DeletionAudit
}

export async function getDeletionRequestForAgent(requestId: string): Promise<ErrResult | { ok: true; request: DeletionRequestDetail }> {
  await getDb()

  const r = await DeletionRequest.findById(requestId).lean()
  if (!r) return { ok: false, status: 404, error: 'request_not_found' }

  const user = await User.findById(r.userId).select('email firstName lastName activeRole').lean()
  const audit = await computeDeletionAudit(r.userId)

  return { ok: true, request: { ...toSummary(r, user ?? undefined), audit } }
}

// ─────────────────────────────── rejectDeletion ─────────────────────────────

export type RejectDeletionResult = ErrResult | { ok: true }

export async function rejectDeletion(agent: AgentCaller, requestId: string, note?: string): Promise<RejectDeletionResult> {
  await getDb()

  const request = await DeletionRequest.findById(requestId)
  if (!request) return { ok: false, status: 404, error: 'request_not_found' }
  if (request.status !== 'pending') return { ok: false, status: 409, error: 'invalid_status' }

  request.status = 'rejected'
  request.reviewedAt = new Date()
  request.reviewedBy = agent.id
  request.reviewNote = note?.trim() ?? ''
  await request.save()

  return { ok: true }
}

// ─────────────────────────────── approveDeletion ────────────────────────────
// Irréversible. Fail-closed à chaque étape sensible : si l'audit trouve un
// blocage (recalculé ici, jamais celui affiché il y a potentiellement
// plusieurs minutes) ou si la résiliation Stripe échoue, AUCUNE mutation
// n'a lieu. La purge elle-même est une seule transaction Mongo : soit tout
// s'applique, soit rien (jamais de compte à moitié anonymisé).

export type ApproveDeletionResult = ErrResult | { ok: true }

export async function approveDeletion(agent: AgentCaller, requestId: string, note?: string): Promise<ApproveDeletionResult> {
  await getDb()

  const request = await DeletionRequest.findById(requestId)
  if (!request) return { ok: false, status: 404, error: 'request_not_found' }
  if (request.status !== 'pending') return { ok: false, status: 409, error: 'invalid_status' }

  const uid = request.userId
  const user = await User.findById(uid)
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  const audit = await computeDeletionAudit(uid)
  if (audit.blockers.length > 0) return { ok: false, status: 409, error: 'deletion_blocked' }

  if (user.prestataireSubActive) {
    const cancelResult = await cancelProviderSubscriptionForDeletion(uid)
    if (!cancelResult.ok) return { ok: false, status: cancelResult.status, error: cancelResult.error }
  }

  const trimmedNote = note?.trim() ?? ''
  const now = new Date()

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      // 1. Cascade PII partagée avec lib/server/profile.ts:deleteAccount (voir
      //    lib/server/accountPurge.ts) : vitrines publiques (OrganizerProfile/
      //    ProviderProfile), dossier de candidature (Application), registre
      //    anti-hoarding de groupe, sièges de table détenus dans un événement
      //    d'un AUTRE organisateur, invitations de siège en attente, relations
      //    sociales, messagerie, identité dénormalisée sur signalements/avis.
      await scrubAccountPII(uid, session)

      // 2. Événements DE l'organisateur supprimé — spécifique à ce chemin
      //    (dépend de l'audit de blocage ci-dessus, propre à la revue agent) ;
      //    un compte pas encore actif ne peut de toute façon pas avoir créé
      //    d'événement. ATTENTION : les événements listés ici sont relus une
      //    seconde fois, DANS la transaction, pour rester cohérents avec le
      //    reste de la purge même si l'audit a été calculé quelques
      //    millisecondes plus tôt.
      const events = await Event.find({ $or: [{ createdBy: uid }, { organizerId: uid }] })
        .session(session)
        .lean()
      for (const ev of events) {
        const id = String(ev._id)
        if (eventDisposition(ev) === 'upcoming') {
          // À venir, sans vente confirmée par l'audit : orphelin, nettoyé en
          // entier (comme `cleanupEventRefs` côté legacy).
          await Promise.all([
            Ticket.deleteMany({ eventId: id }, { session }),
            EventOrder.deleteOne({ eventId: id }, { session }),
            EventOrderLog.deleteOne({ eventId: id }, { session }),
            EventPlaylist.deleteOne({ eventId: id }, { session }),
            EventStaff.deleteOne({ eventId: id }, { session }),
            PromoCode.deleteMany({ eventId: id }, { session }),
            EventAccessCode.deleteMany({ eventId: id }, { session }),
          ])
          await Event.deleteOne({ _id: id }, { session })
        } else {
          // Passé ou annulé : conservé pour l'historique des acheteurs, seule
          // l'identité affichée (dénormalisée sur l'event) est anonymisée.
          await Event.updateOne({ _id: id }, { $set: { organizerName: 'Organisateur supprimé', organizer: 'Organisateur supprimé' } }, { session })
        }
      }

      // 3. Le compte — ANONYMISÉ, jamais supprimé en dur (voir l'en-tête de
      //     fichier). Mêmes champs que lib/server/profile.ts:deleteAccount,
      //     étendus aux champs spécifiques organisateur/prestataire de ce port.
      const unusableHash = await bcrypt.hash(`deleted:${crypto.randomUUID()}`, 12)
      user.email = `deleted-${String(user._id)}@liveinblack.invalid`
      user.passwordHash = unusableHash
      user.firstName = ''
      user.lastName = ''
      user.phone = ''
      user.avatarUrl = null
      user.pendingEmail = null
      user.birthYear = null
      user.gender = null
      user.disabled = true
      user.sessionVersion = (user.sessionVersion || 0) + 1
      user.roles = ['client']
      user.activeRole = 'client'
      user.orgStatus = 'none'
      user.prestStatus = 'none'
      user.blockedUserIds = []
      user.stripeAccountId = null
      user.stripeChargesEnabled = false
      user.providerBillingRegionId = null
      await user.save({ session })

      request.status = 'approved'
      request.reviewedAt = now
      request.reviewedBy = agent.id
      request.reviewNote = trimmedNote
      await request.save({ session })
    })
  } finally {
    await session.endSession()
  }

  return { ok: true }
}

// ────────────────────────── createDeletionRequest ───────────────────────────
// Ajout hors périmètre strict de la tâche #104 (qui ne demandait que la revue
// agent), mais nécessaire pour que cette file ait un producteur : porte la
// gate exacte de MonDossierPage.jsx (bouton « Demander la suppression du
// compte », visible uniquement quand `app.status === 'approved'`) — un
// organisateur/prestataire dont le dossier N'EST PAS encore approuvé n'a rien
// à faire passer par une revue agent, voir la note de fidélité dans le
// rapport final. Aucune route/UI de ce port n'appelle encore cette fonction ;
// c'est un suivi signalé, pas cette tâche-ci.

export interface CreateDeletionRequestCaller {
  id: string
}

export type CreateDeletionRequestResult = ErrResult | { ok: true; request: { id: string; status: 'pending' } }

export async function createDeletionRequest(caller: CreateDeletionRequestCaller, reason: string): Promise<CreateDeletionRequestResult> {
  await getDb()

  const trimmed = reason?.trim() ?? ''
  if (!trimmed) return { ok: false, status: 400, error: 'reason_required' }

  const user = await User.findById(caller.id).lean()
  if (!user) return { ok: false, status: 404, error: 'user_not_found' }

  const role = user.activeRole
  const approved = role === 'organisateur' ? user.orgStatus === 'active' : role === 'prestataire' ? user.prestStatus === 'active' : false
  if (!approved) return { ok: false, status: 409, error: 'approval_not_required' }

  const existing = await DeletionRequest.findOne({ userId: caller.id, status: 'pending' }).lean()
  if (existing) return { ok: true, request: { id: String(existing._id), status: 'pending' } }

  const created = await DeletionRequest.create({ userId: caller.id, reason: trimmed, requestedAt: new Date(), status: 'pending' })
  return { ok: true, request: { id: String(created._id), status: 'pending' } }
}
