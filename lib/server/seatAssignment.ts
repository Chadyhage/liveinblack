import crypto from 'node:crypto'
import mongoose, { type HydratedDocument } from 'mongoose'
import { getDb } from '../db/mongoose'
import Ticket, { type TicketDoc } from '../models/Ticket'
import User from '../models/User'
import GroupMembership from '../models/GroupMembership'
import SeatInvitation, { type SeatInvitationDoc } from '../models/SeatInvitation'

// Modèle de consentement pour les sièges de table (#37) : un hôte ne peut
// plus lier directement le compte d'un invité à un siège ("bind" unilatéral).
// Il émet une INVITATION (inviteToSeat) ; seule la cible peut l'accepter
// (acceptSeatInvitation, qui lie réellement le siège) ou la décliner
// (declineSeatInvitation). L'hôte peut annuler une invitation encore en
// attente (cancelSeatInvitation) et révoquer un siège déjà accepté
// (revokeSeat, inchangé). La cible peut aussi quitter volontairement un
// siège qu'elle détient déjà (leaveSeat).
//
// Fuite corrigée : le check "1 place de groupe par compte et par événement"
// (GroupMembership, index unique {eventId,userId}) n'est plus jamais évalué
// dans le chemin de code déclenché par l'hôte — il ne l'est qu'à
// l'intérieur d'acceptSeatInvitation, déclenché par LA CIBLE. Un hôte qui
// invite une cible déjà attachée à une autre table du même événement reçoit
// exactement la même réponse de succès qu'un hôte invitant n'importe qui
// d'autre ; seule la cible, en essayant d'accepter, apprend le conflit — et
// uniquement à propos d'elle-même.
export interface SeatCaller {
  id: string
}

export interface InviteInput {
  ticketCode: string
  targetEmail?: string
}

export interface TicketCodeInput {
  ticketCode: string
}

export interface InvitationIdInput {
  invitationId: string
}

export interface SeatTicketView {
  ticketCode: string
  eventId: string
  eventName: string
  eventDate: string
  place: string
  totalPrice: number
  currency: string
  preorders: { name: string; price: number; qty: number }[]
  guestName: string | null
  assignedTo: string | null
  assignedName: string | null
  assignedAt: string | null
}

export interface SeatInvitationView {
  id: string
  ticketCode: string
  eventId: string
  eventName: string
  eventDate: string
  place: string
  hostName: string | null
  targetEmail: string
  status: SeatInvitationDoc['status']
  createdAt: string
  respondedAt: string | null
}

export type SeatResult = { ok: false; status: number; error: string } | { ok: true; ticket: SeatTicketView }
export type InvitationResult = { ok: false; status: number; error: string } | { ok: true; invitation: { id: string; ticketCode: string; targetEmail: string; status: string } }
export type InvitationListResult = { ok: false; status: number; error: string } | { ok: true; invitations: SeatInvitationView[] }

type SeatGuardResult = { ok: false; status: number; error: string } | { ok: true; ticket: HydratedDocument<TicketDoc> }

// Erreur typée levée À L'INTÉRIEUR d'une transaction Mongoose : `withTransaction`
// relance automatiquement sur certaines erreurs transitoires, donc on ne peut
// pas simplement renvoyer un résultat depuis le callback — on lève, puis on
// retraduit en dehors (même pattern que `OrderError` dans lib/server/orders.ts).
class SeatError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

function toSeatView(ticket: HydratedDocument<TicketDoc>): SeatTicketView {
  return {
    ticketCode: ticket.ticketCode,
    eventId: ticket.eventId,
    eventName: ticket.eventName,
    eventDate: ticket.eventDate,
    place: ticket.place,
    totalPrice: ticket.totalPrice,
    currency: ticket.currency,
    preorders: ticket.preorders.map((p) => ({ name: p.name, price: p.price ?? 0, qty: p.qty ?? 1 })),
    guestName: ticket.guestName ?? null,
    assignedTo: ticket.assignedTo ?? null,
    assignedName: ticket.assignedName ?? null,
    assignedAt: ticket.assignedAt ? new Date(ticket.assignedAt).toISOString() : null,
  }
}

// Préconditions PARTAGÉES par toutes les actions déclenchées par l'HÔTE
// (invite/cancel/revoke), dans cet ordre exact. Seul l'hôte (`hostUid`, figé
// au moment de l'émission des billets de la table) peut gérer les sièges de
// sa table — un invité ne peut jamais gérer son propre siège via ce garde :
// frontière de sécurité volontaire, pas un oubli.
async function loadHostOwnedTableSeat(caller: SeatCaller, ticketCode: string): Promise<SeatGuardResult> {
  const ticket = await Ticket.findOne({ ticketCode })
  if (!ticket) return { ok: false, status: 404, error: 'ticket_not_found' }
  if (ticket.revoked) return { ok: false, status: 409, error: 'revoked' }
  if (!ticket.tableId) return { ok: false, status: 400, error: 'not_a_table_ticket' }
  if (ticket.paid !== true) return { ok: false, status: 409, error: 'ticket_not_paid' }
  if (String(ticket.hostUid) !== caller.id) return { ok: false, status: 403, error: 'not_host' }
  if (ticket.checkedInAt) return { ok: false, status: 409, error: 'already_checked_in' }
  return { ok: true, ticket }
}

// Émission d'une invitation par l'hôte. NE LIE RIEN : ni Ticket.userId, ni
// GroupMembership. Ne fait AUCUN check de conflit de place de groupe (voir
// commentaire d'en-tête) — la seule garde ici est structurelle (siège déjà
// occupé par un invité ayant accepté, ou invitation déjà en attente).
export async function inviteToSeat(caller: SeatCaller, input: InviteInput): Promise<InvitationResult> {
  await getDb()

  const ticketCode = input.ticketCode?.trim().toUpperCase()
  if (!ticketCode) return { ok: false, status: 400, error: 'invalid_code' }

  const guard = await loadHostOwnedTableSeat(caller, ticketCode)
  if (!guard.ok) return guard
  const ticket = guard.ticket

  const targetEmail = input.targetEmail?.trim().toLowerCase()
  if (!targetEmail) return { ok: false, status: 400, error: 'target_email_required' }

  const target = await User.findOne({ email: targetEmail })
  if (!target) return { ok: false, status: 404, error: 'guest_not_found' }
  const targetId = target.id as string
  if (targetId === String(ticket.hostUid)) return { ok: false, status: 400, error: 'already_yours' }

  // Le siège est déjà détenu par un invité qui a accepté une invitation
  // précédente : l'hôte doit d'abord le révoquer (revokeSeat) avant d'en
  // inviter un autre — jamais de réattribution silencieuse sans passage par
  // un consentement explicite.
  if (String(ticket.userId) !== String(ticket.hostUid)) return { ok: false, status: 409, error: 'seat_already_assigned' }

  try {
    const invitation = await SeatInvitation.create({
      ticketCode: ticket.ticketCode,
      eventId: ticket.eventId,
      tableId: ticket.tableId as string,
      hostUid: caller.id,
      targetId,
      targetEmail,
      status: 'pending',
    })
    return { ok: true, invitation: { id: invitation.id as string, ticketCode: invitation.ticketCode, targetEmail: invitation.targetEmail, status: invitation.status } }
  } catch (err) {
    // Index unique partiel {ticketCode, status:'pending'} : une invitation en
    // attente existe déjà pour ce siège (double-clic hôte, ou hôte n'ayant
    // pas encore annulé une invitation précédente).
    if (isDuplicateKeyError(err)) return { ok: false, status: 409, error: 'invitation_already_pending' }
    throw err
  }
}

// Annulation par l'hôte d'une invitation encore en attente (avant que la
// cible n'ait répondu). Transition atomique conditionnée sur status:'pending'
// pour ne jamais écraser une réponse de la cible arrivée entre-temps.
export async function cancelSeatInvitation(caller: SeatCaller, input: TicketCodeInput): Promise<InvitationResult> {
  await getDb()

  const ticketCode = input.ticketCode?.trim().toUpperCase()
  if (!ticketCode) return { ok: false, status: 400, error: 'invalid_code' }

  const invitation = await SeatInvitation.findOne({ ticketCode, status: 'pending' })
  // 404 générique que l'invitation n'existe pas ou que l'appelant n'est pas
  // l'hôte : ne pas confirmer à un tiers qu'une invitation en attente existe
  // sur ce ticketCode.
  if (!invitation || invitation.hostUid !== caller.id) return { ok: false, status: 404, error: 'invitation_not_found' }

  const updated = await SeatInvitation.findOneAndUpdate(
    { _id: invitation._id, status: 'pending' },
    { $set: { status: 'cancelled', respondedAt: new Date() } },
    { new: true }
  )
  if (!updated) return { ok: false, status: 409, error: 'invitation_not_pending' }

  return { ok: true, invitation: { id: updated.id as string, ticketCode: updated.ticketCode, targetEmail: updated.targetEmail, status: updated.status } }
}

// Invitations en attente adressées à l'appelant (vue CIBLE).
export async function listMyPendingInvitations(caller: SeatCaller): Promise<InvitationListResult> {
  await getDb()

  const invitations = await SeatInvitation.find({ targetId: caller.id, status: 'pending' }).sort({ createdAt: -1 }).lean()
  if (invitations.length === 0) return { ok: true, invitations: [] }

  const ticketCodes = invitations.map((inv) => inv.ticketCode)
  const hostUids = [...new Set(invitations.map((inv) => inv.hostUid))]
  const [tickets, hosts] = await Promise.all([
    Ticket.find({ ticketCode: { $in: ticketCodes } }).lean(),
    User.find({ _id: { $in: hostUids } }).lean(),
  ])
  const ticketByCode = new Map(tickets.map((t) => [t.ticketCode, t]))
  const hostById = new Map(hosts.map((h) => [String(h._id), h]))

  const views: SeatInvitationView[] = invitations.map((inv) => {
    const ticket = ticketByCode.get(inv.ticketCode)
    const host = hostById.get(inv.hostUid)
    const hostName = host ? `${host.firstName ?? ''} ${host.lastName ?? ''}`.trim() || null : null
    return {
      id: String(inv._id),
      ticketCode: inv.ticketCode,
      eventId: inv.eventId,
      eventName: ticket?.eventName ?? '',
      eventDate: ticket?.eventDate ?? '',
      place: ticket?.place ?? '',
      hostName,
      targetEmail: inv.targetEmail,
      status: inv.status,
      createdAt: new Date(inv.createdAt as unknown as string).toISOString(),
      respondedAt: inv.respondedAt ? new Date(inv.respondedAt as unknown as string).toISOString() : null,
    }
  })

  return { ok: true, invitations: views }
}

// Acceptation par la CIBLE : seul endroit où le siège est réellement lié
// (Ticket.userId/assignedTo) et où le check de conflit de place de groupe
// (GroupMembership) est évalué — son résultat n'est visible que de la cible
// elle-même, jamais de l'hôte.
export async function acceptSeatInvitation(caller: SeatCaller, input: InvitationIdInput): Promise<SeatResult> {
  await getDb()

  const invitationId = input.invitationId?.trim()
  if (!invitationId || !mongoose.isValidObjectId(invitationId)) return { ok: false, status: 400, error: 'invalid_invitation_id' }

  const invitation = await SeatInvitation.findById(invitationId)
  // 404 générique si l'invitation n'existe pas ou n'appartient pas à
  // l'appelant : ne pas confirmer à un tiers qu'une invitation adressée à
  // quelqu'un d'autre existe.
  if (!invitation || invitation.targetId !== caller.id) return { ok: false, status: 404, error: 'invitation_not_found' }

  const assignedName = (async () => {
    const target = await User.findById(caller.id)
    return target ? `${target.firstName ?? ''} ${target.lastName ?? ''}`.trim() || target.email : caller.id
  })()

  const session = await mongoose.startSession()
  let ticketObjectId: mongoose.Types.ObjectId | null = null
  try {
    await session.withTransaction(async () => {
      // Transition atomique conditionnée sur status:'pending' : empêche une
      // course avec un cancel (hôte) ou un decline concurrent d'accepter
      // deux fois la même invitation, ou d'accepter une invitation déjà
      // résolue.
      const claimed = await SeatInvitation.findOneAndUpdate(
        { _id: invitation._id, status: 'pending' },
        { $set: { status: 'accepted', respondedAt: new Date() } },
        { session, new: true }
      )
      if (!claimed) throw new SeatError(409, 'invitation_not_pending')

      const fresh = await Ticket.findOne({ ticketCode: claimed.ticketCode }).session(session)
      if (!fresh) throw new SeatError(404, 'ticket_not_found')
      ticketObjectId = fresh._id as mongoose.Types.ObjectId
      if (fresh.revoked) throw new SeatError(409, 'revoked')
      if (fresh.paid !== true) throw new SeatError(409, 'ticket_not_paid')
      if (fresh.checkedInAt) throw new SeatError(409, 'already_checked_in')
      if (String(fresh.userId) !== String(fresh.hostUid)) throw new SeatError(409, 'seat_already_assigned')

      // Seul check de conflit de place de groupe du flux entier — exécuté ici,
      // dans le chemin de code déclenché par la CIBLE. Son échec (409) ne
      // remonte qu'à elle : l'hôte n'apprend jamais ce résultat.
      try {
        await GroupMembership.create(
          [{ eventId: fresh.eventId, userId: caller.id, tableId: fresh.tableId as string, role: 'member', ticketCode: fresh.ticketCode }],
          { session }
        )
      } catch (err) {
        if (isDuplicateKeyError(err)) throw new SeatError(409, 'guest_already_has_group_seat')
        throw err
      }

      fresh.userId = caller.id
      fresh.assignedTo = caller.id
      fresh.assignedName = await assignedName
      fresh.assignedAt = new Date()
      fresh.seatVersion = (fresh.seatVersion ?? 0) + 1
      fresh.entryNonce = crypto.randomBytes(12).toString('hex')
      await fresh.save({ session })
    })
  } catch (err) {
    if (err instanceof SeatError) return { ok: false, status: err.status, error: err.code }
    throw err
  } finally {
    await session.endSession()
  }

  const finalTicket = ticketObjectId ? await Ticket.findById(ticketObjectId) : null
  if (!finalTicket) return { ok: false, status: 404, error: 'ticket_not_found' }
  return { ok: true, ticket: toSeatView(finalTicket) }
}

// Refus par la CIBLE : ne touche jamais au Ticket, le siège reste détenu par
// l'hôte.
export async function declineSeatInvitation(caller: SeatCaller, input: InvitationIdInput): Promise<InvitationResult> {
  await getDb()

  const invitationId = input.invitationId?.trim()
  if (!invitationId || !mongoose.isValidObjectId(invitationId)) return { ok: false, status: 400, error: 'invalid_invitation_id' }

  const invitation = await SeatInvitation.findById(invitationId)
  if (!invitation || invitation.targetId !== caller.id) return { ok: false, status: 404, error: 'invitation_not_found' }

  const updated = await SeatInvitation.findOneAndUpdate(
    { _id: invitation._id, status: 'pending' },
    { $set: { status: 'declined', respondedAt: new Date() } },
    { new: true }
  )
  if (!updated) return { ok: false, status: 409, error: 'invitation_not_pending' }

  return { ok: true, invitation: { id: updated.id as string, ticketCode: updated.ticketCode, targetEmail: updated.targetEmail, status: updated.status } }
}

// Révocation par l'hôte d'un siège DÉJÀ ACCEPTÉ (inchangé fonctionnellement
// depuis l'ancien modèle direct-bind — seule la façon dont le siège a été
// acquis a changé, pas la façon dont l'hôte le reprend).
export async function revokeSeat(caller: SeatCaller, input: TicketCodeInput): Promise<SeatResult> {
  await getDb()

  const ticketCode = input.ticketCode?.trim().toUpperCase()
  if (!ticketCode) return { ok: false, status: 400, error: 'invalid_code' }

  const guard = await loadHostOwnedTableSeat(caller, ticketCode)
  if (!guard.ok) return guard
  const ticket = guard.ticket

  if (String(ticket.userId) === String(ticket.hostUid)) return { ok: false, status: 400, error: 'already_free' }

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const fresh = await Ticket.findById(ticket._id).session(session)
      if (!fresh) throw new SeatError(404, 'ticket_not_found')
      if (fresh.checkedInAt) throw new SeatError(409, 'already_checked_in')

      // Re-vérification DANS la transaction : la garde `already_free` plus haut
      // n'est qu'une pré-vérification non-transactionnelle (lue avant l'ouverture
      // de la session). Sur deux révocations concurrentes/dupliquées pour le
      // même ticket (y compris un revokeSeat qui course avec un leaveSeat du
      // même invité), le second à committer peut re-lire `fresh` après le
      // commit du premier et voir un siège DÉJÀ rendu à l'hôte. Sans ce
      // re-check, `currentHolderId` vaudrait alors `hostUid` et la ligne
      // ci-dessous supprimerait la sentinelle de L'HÔTE lui-même au lieu de
      // celle d'un invité.
      const currentHolderId = fresh.userId
      if (String(currentHolderId) === String(fresh.hostUid)) throw new SeatError(400, 'already_free')
      await GroupMembership.deleteOne({ eventId: fresh.eventId, userId: currentHolderId }, { session })

      fresh.userId = fresh.hostUid as string
      fresh.assignedTo = null
      fresh.assignedName = null
      fresh.assignedAt = null
      fresh.seatVersion = (fresh.seatVersion ?? 0) + 1
      // Rotation de l'entryNonce même en revoke : un QR périmé entre les mains
      // de l'invité qu'on vient de révoquer doit devenir invalide IMMÉDIATEMENT
      // (même raisonnement que la rotation à l'attribution, cf. #79) — on
      // tourne à chaque changement de titulaire, sans exception.
      fresh.entryNonce = crypto.randomBytes(12).toString('hex')
      await fresh.save({ session })
    })
  } catch (err) {
    if (err instanceof SeatError) return { ok: false, status: err.status, error: err.code }
    throw err
  } finally {
    await session.endSession()
  }

  const finalTicket = await Ticket.findById(ticket._id)
  if (!finalTicket) return { ok: false, status: 404, error: 'ticket_not_found' }
  return { ok: true, ticket: toSeatView(finalTicket) }
}

// Invitations EN ATTENTE émises par l'appelant en tant qu'HÔTE, pour un jeu
// de sièges donné — c'est ce qui permet à TableHostPanel (portefeuille de
// billets, #6 phase profil) d'afficher un 3ème état par siège ("invitation
// envoyée à X, en attente de réponse") qui n'existe pas côté legacy (le bind
// direct par e-mail y était instantané) mais que ce modèle de consentement
// (#37) introduit nécessairement.
export async function listOutgoingSeatInvitations(caller: SeatCaller, ticketCodes: string[]): Promise<InvitationListResult> {
  await getDb()
  if (ticketCodes.length === 0) return { ok: true, invitations: [] }

  const invitations = await SeatInvitation.find({ hostUid: caller.id, ticketCode: { $in: ticketCodes }, status: 'pending' }).lean()
  if (invitations.length === 0) return { ok: true, invitations: [] }

  const tickets = await Ticket.find({ ticketCode: { $in: invitations.map((inv) => inv.ticketCode) } }).lean()
  const ticketByCode = new Map(tickets.map((t) => [t.ticketCode, t]))

  const views: SeatInvitationView[] = invitations.map((inv) => {
    const ticket = ticketByCode.get(inv.ticketCode)
    return {
      id: String(inv._id),
      ticketCode: inv.ticketCode,
      eventId: inv.eventId,
      eventName: ticket?.eventName ?? '',
      eventDate: ticket?.eventDate ?? '',
      place: ticket?.place ?? '',
      hostName: null,
      targetEmail: inv.targetEmail,
      status: inv.status,
      createdAt: new Date(inv.createdAt as unknown as string).toISOString(),
      respondedAt: inv.respondedAt ? new Date(inv.respondedAt as unknown as string).toISOString() : null,
    }
  })

  return { ok: true, invitations: views }
}

// Départ volontaire par la CIBLE d'un siège qu'elle détient déjà (miroir de
// revokeSeat, mais déclenché par l'invité lui-même plutôt que par l'hôte).
export async function leaveSeat(caller: SeatCaller, input: TicketCodeInput): Promise<SeatResult> {
  await getDb()

  const ticketCode = input.ticketCode?.trim().toUpperCase()
  if (!ticketCode) return { ok: false, status: 400, error: 'invalid_code' }

  const ticket = await Ticket.findOne({ ticketCode })
  if (!ticket) return { ok: false, status: 404, error: 'ticket_not_found' }
  if (ticket.revoked) return { ok: false, status: 409, error: 'revoked' }
  if (String(ticket.assignedTo ?? '') !== caller.id) return { ok: false, status: 409, error: 'not_your_seat' }
  if (ticket.checkedInAt) return { ok: false, status: 409, error: 'already_checked_in' }

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      const fresh = await Ticket.findById(ticket._id).session(session)
      if (!fresh) throw new SeatError(404, 'ticket_not_found')
      if (fresh.checkedInAt) throw new SeatError(409, 'already_checked_in')

      // Re-vérification DANS la transaction, symétrique de celle de
      // revokeSeat : protège contre la course avec un revokeSeat concurrent
      // de l'hôte sur le MÊME siège (l'un des deux gagne, l'autre voit un
      // siège déjà rendu à l'hôte et échoue proprement au lieu de supprimer
      // la sentinelle GroupMembership de l'hôte).
      if (String(fresh.assignedTo ?? '') !== caller.id) throw new SeatError(409, 'not_your_seat')
      await GroupMembership.deleteOne({ eventId: fresh.eventId, userId: caller.id }, { session })

      fresh.userId = fresh.hostUid as string
      fresh.assignedTo = null
      fresh.assignedName = null
      fresh.assignedAt = null
      fresh.seatVersion = (fresh.seatVersion ?? 0) + 1
      fresh.entryNonce = crypto.randomBytes(12).toString('hex')
      await fresh.save({ session })
    })
  } catch (err) {
    if (err instanceof SeatError) return { ok: false, status: err.status, error: err.code }
    throw err
  } finally {
    await session.endSession()
  }

  const finalTicket = await Ticket.findById(ticket._id)
  if (!finalTicket) return { ok: false, status: 404, error: 'ticket_not_found' }
  return { ok: true, ticket: toSeatView(finalTicket) }
}
