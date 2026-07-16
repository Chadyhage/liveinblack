import mongoose, { type HydratedDocument } from 'mongoose'
import { getDb } from '../db/mongoose'
import User, { type UserDoc } from '../models/User'
import FriendRequest from '../models/FriendRequest'
import Friendship from '../models/Friendship'

// Remplace le cycle de demande d'ami de src/utils/messaging.js (Firestore,
// `user_social/{uid}.friendRequests` — un tableau dupliqué des deux côtés).
// Ici, cf. lib/models/FriendRequest.ts et lib/models/Friendship.ts : une
// demande = un document (avec historique, pas une suppression comme le
// legacy), une amitié = un document unique normalisé. Cycle calqué très
// directement sur lib/server/seatAssignment.ts (#37) : mêmes patterns de
// réclamation atomique (`findOneAndUpdate` conditionné sur `status:'pending'`)
// et de 404 générique pour ne jamais confirmer à un tiers qu'une demande qui
// ne lui est pas adressée existe.
//
// Deux améliorations DÉLIBÉRÉES par rapport au legacy (voir en-tête de
// FriendRequest.ts) :
//  1. `cancelFriendRequest` — le legacy ne permettait qu'au DESTINATAIRE de
//     supprimer une demande en attente (refus) ; l'EXPÉDITEUR n'avait aucun
//     moyen de retirer sa propre demande sortante.
//  2. Auto-acceptation en cas de demande mutuelle — si X envoie à Y alors que
//     Y a déjà une demande en attente vers X (les deux ont essayé de
//     s'ajouter à peu près en même temps), on accepte les deux immédiatement
//     au lieu de laisser deux demandes en attente se regarder en chiens de
//     faïence dans des sens opposés (le legacy ne dédoublonnait que sur la
//     paire (fromId,toId) exacte, jamais sur la paire inverse).
export interface FriendCaller {
  id: string
}

export interface SendFriendRequestInput {
  toUserId: string
}

export interface RequestIdInput {
  requestId: string
}

export interface FriendUserIdInput {
  friendUserId: string
}

export interface FriendView {
  userId: string
  name: string
  email: string
}

export interface FriendRequestView {
  id: string
  fromId: string
  fromName: string
  toId: string
  status: string
  createdAt: string
  respondedAt: string | null
}

export interface SentFriendRequestView extends FriendRequestView {
  toName: string
}

export type SendFriendRequestResult =
  | { ok: false; status: number; error: string }
  | { ok: true; status: 'pending' | 'friends'; requestId?: string }

export type FriendActionResult = { ok: false; status: number; error: string } | { ok: true }

export type FriendListResult = { ok: false; status: number; error: string } | { ok: true; friends: FriendView[] }

export type FriendRequestListResult =
  | { ok: false; status: number; error: string }
  | { ok: true; received: FriendRequestView[]; sent: SentFriendRequestView[] }

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

// `userAId`/`userBId` sont TOUJOURS stockés triés (ordre lexicographique de
// la string) — cf. en-tête de Friendship.ts — pour qu'une paire (X,Y) ne
// puisse jamais exister deux fois dans des sens opposés. Le modèle
// lui-même ne l'impose pas : c'est ce module, seul point d'écriture de
// Friendship, qui en est responsable.
function normalizePair(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA]
}

function displayName(user: { firstName?: string | null; lastName?: string | null; email: string }): string {
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
}

// `blockedUserIds` est en cours d'ajout à lib/models/User.ts par un autre
// chantier au moment où ce fichier est écrit (cf. instructions de la tâche).
// Plutôt que de dépendre d'un champ absent (ou de l'ajouter nous-mêmes et
// risquer un conflit d'édition sur User.ts), on introspecte le schéma à
// l'exécution : tant que le champ n'existe pas, ce garde est un no-op ; dès
// qu'il atterrit, il s'active tout seul, sans qu'il soit nécessaire de
// retoucher ce fichier.
type UserWithBlockList = { blockedUserIds?: string[] }

function hasBlockList(): boolean {
  return Boolean(User.schema.path('blockedUserIds'))
}

function isBlockedEitherWay(me: HydratedDocument<UserDoc>, target: HydratedDocument<UserDoc>, callerId: string, toUserId: string): boolean {
  if (!hasBlockList()) return false
  const blockedByMe = (me as unknown as UserWithBlockList).blockedUserIds ?? []
  const blockedByTarget = (target as unknown as UserWithBlockList).blockedUserIds ?? []
  return blockedByMe.includes(toUserId) || blockedByTarget.includes(callerId)
}

// Si l'appelant a déjà une demande en attente venant de la cible (dans le
// sens INVERSE), on accepte les deux d'un coup et on crée l'amitié — sans
// jamais créer de nouvelle demande "forward", inutile puisqu'ils sont déjà
// amis à l'issue de cette fonction. Retourne `null` si aucune demande
// inverse n'est en attente, OU si elle a été résolue par ailleurs (course
// concurrente perdue) — dans les deux cas l'appelant retombe sur le chemin
// normal de création d'une nouvelle demande.
async function tryMutualAutoAccept(callerId: string, toUserId: string, a: string, b: string): Promise<SendFriendRequestResult | null> {
  const reverse = await FriendRequest.findOne({ fromId: toUserId, toId: callerId, status: 'pending' })
  if (!reverse) return null

  const claimed = await FriendRequest.findOneAndUpdate(
    { _id: reverse._id, status: 'pending' },
    { $set: { status: 'accepted', respondedAt: new Date() } },
    { new: true }
  )
  // Perdu la course (la cible a annulé/décliné entre-temps) : chemin normal.
  if (!claimed) return null

  try {
    await Friendship.create({ userAId: a, userBId: b })
  } catch (err) {
    // Course avec un autre chemin ayant déjà créé cette même paire — l'état
    // final voulu (amis) est déjà atteint, rien à faire de plus.
    if (!isDuplicateKeyError(err)) throw err
  }
  return { ok: true, status: 'friends' }
}

export async function sendFriendRequest(caller: FriendCaller, input: SendFriendRequestInput): Promise<SendFriendRequestResult> {
  await getDb()

  const toUserId = input.toUserId?.trim()
  if (!toUserId) return { ok: false, status: 404, error: 'user_not_found' }
  if (toUserId === caller.id) return { ok: false, status: 400, error: 'cannot_friend_self' }

  const [me, target] = await Promise.all([User.findById(caller.id), User.findById(toUserId)])
  if (!target) return { ok: false, status: 404, error: 'user_not_found' }
  if (!me) return { ok: false, status: 404, error: 'user_not_found' }

  if (isBlockedEitherWay(me, target, caller.id, toUserId)) return { ok: false, status: 403, error: 'blocked' }

  const [a, b] = normalizePair(caller.id, toUserId)
  const alreadyFriends = await Friendship.exists({ userAId: a, userBId: b })
  if (alreadyFriends) return { ok: false, status: 400, error: 'already_friends' }

  const mutual = await tryMutualAutoAccept(caller.id, toUserId, a, b)
  if (mutual) return mutual

  // `tryMutualAutoAccept` peut renvoyer `null` alors qu'une Friendship a
  // ENTRE-TEMPS été créée par un autre chemin : la vérification `alreadyFriends`
  // ci-dessus a pu s'exécuter avant qu'un accept concurrent (direct, sur la
  // demande inverse) ne crée la Friendship, puis la réclamation atomique de
  // `tryMutualAutoAccept` a perdu sa course contre ce même accept (la demande
  // inverse n'est déjà plus 'pending' quand on tente de la réclamer). Sans
  // cette seconde vérification, on créerait ici une demande "forward" fantôme,
  // en attente indéfiniment, entre deux utilisateurs déjà amis.
  const stillAlreadyFriends = await Friendship.exists({ userAId: a, userBId: b })
  if (stillAlreadyFriends) return { ok: false, status: 400, error: 'already_friends' }

  try {
    const created = await FriendRequest.create({ fromId: caller.id, fromName: displayName(me), toId: toUserId, status: 'pending' })
    return { ok: true, status: 'pending', requestId: created.id as string }
  } catch (err) {
    // Index unique partiel {fromId, toId, status:'pending'} : une demande
    // dans ce sens précis est déjà en attente (double-clic, ou double appel
    // concurrent — cf. test d'intégration).
    if (isDuplicateKeyError(err)) return { ok: false, status: 409, error: 'request_already_pending' }
    throw err
  }
}

export async function acceptFriendRequest(caller: FriendCaller, input: RequestIdInput): Promise<FriendActionResult> {
  await getDb()

  const requestId = input.requestId?.trim()
  if (!requestId || !mongoose.isValidObjectId(requestId)) return { ok: false, status: 400, error: 'invalid_request_id' }

  const request = await FriendRequest.findById(requestId)
  // 404 générique si la demande n'existe pas ou n'est pas adressée à
  // l'appelant : ne jamais confirmer à un tiers qu'une demande adressée à
  // quelqu'un d'autre existe (même pattern que acceptSeatInvitation).
  if (!request || request.toId !== caller.id) return { ok: false, status: 404, error: 'request_not_found' }
  if (request.status !== 'pending') return { ok: false, status: 409, error: 'request_not_pending' }

  // Réclamation atomique : protège contre une course avec un decline/cancel
  // concurrent sur la même demande (ou un double accept).
  const claimed = await FriendRequest.findOneAndUpdate(
    { _id: request._id, status: 'pending' },
    { $set: { status: 'accepted', respondedAt: new Date() } },
    { new: true }
  )
  if (!claimed) return { ok: false, status: 409, error: 'request_not_pending' }

  const [a, b] = normalizePair(claimed.fromId, claimed.toId)
  try {
    await Friendship.create({ userAId: a, userBId: b })
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err
  }
  return { ok: true }
}

export async function declineFriendRequest(caller: FriendCaller, input: RequestIdInput): Promise<FriendActionResult> {
  await getDb()

  const requestId = input.requestId?.trim()
  if (!requestId || !mongoose.isValidObjectId(requestId)) return { ok: false, status: 400, error: 'invalid_request_id' }

  const request = await FriendRequest.findById(requestId)
  if (!request || request.toId !== caller.id) return { ok: false, status: 404, error: 'request_not_found' }

  const updated = await FriendRequest.findOneAndUpdate(
    { _id: request._id, status: 'pending' },
    { $set: { status: 'declined', respondedAt: new Date() } },
    { new: true }
  )
  if (!updated) return { ok: false, status: 409, error: 'request_not_pending' }
  return { ok: true }
}

// Annulation par l'EXPÉDITEUR de sa propre demande sortante — la capacité
// absente du legacy (cf. en-tête de fichier). Même pattern de 404 générique
// que decline/accept, mais côté `fromId` cette fois : un tiers (y compris le
// destinataire, qui doit passer par decline) ne peut pas annuler la demande
// de quelqu'un d'autre.
export async function cancelFriendRequest(caller: FriendCaller, input: RequestIdInput): Promise<FriendActionResult> {
  await getDb()

  const requestId = input.requestId?.trim()
  if (!requestId || !mongoose.isValidObjectId(requestId)) return { ok: false, status: 400, error: 'invalid_request_id' }

  const request = await FriendRequest.findById(requestId)
  if (!request || request.fromId !== caller.id) return { ok: false, status: 404, error: 'request_not_found' }

  const updated = await FriendRequest.findOneAndUpdate(
    { _id: request._id, status: 'pending' },
    { $set: { status: 'cancelled', respondedAt: new Date() } },
    { new: true }
  )
  if (!updated) return { ok: false, status: 409, error: 'request_not_pending' }
  return { ok: true }
}

export async function removeFriend(caller: FriendCaller, input: FriendUserIdInput): Promise<FriendActionResult> {
  await getDb()

  const friendUserId = input.friendUserId?.trim()
  if (!friendUserId) return { ok: false, status: 404, error: 'user_not_found' }

  const target = await User.findById(friendUserId)
  if (!target) return { ok: false, status: 404, error: 'user_not_found' }

  const [a, b] = normalizePair(caller.id, friendUserId)
  const deleted = await Friendship.findOneAndDelete({ userAId: a, userBId: b })
  if (!deleted) return { ok: false, status: 400, error: 'not_friends' }
  return { ok: true }
}

export async function listFriends(caller: FriendCaller): Promise<FriendListResult> {
  await getDb()

  const friendships = await Friendship.find({ $or: [{ userAId: caller.id }, { userBId: caller.id }] }).lean()
  if (friendships.length === 0) return { ok: true, friends: [] }

  const otherIds = friendships.map((f) => (f.userAId === caller.id ? f.userBId : f.userAId))
  const users = await User.find({ _id: { $in: otherIds } }).lean()
  const friends: FriendView[] = users.map((u) => ({
    userId: String(u._id),
    name: displayName(u),
    email: u.email,
  }))
  return { ok: true, friends }
}

export async function listMyFriendRequests(caller: FriendCaller): Promise<FriendRequestListResult> {
  await getDb()

  const [received, sent] = await Promise.all([
    FriendRequest.find({ toId: caller.id, status: 'pending' }).sort({ createdAt: -1 }).lean(),
    FriendRequest.find({ fromId: caller.id, status: 'pending' }).sort({ createdAt: -1 }).lean(),
  ])

  // Batch unique pour résoudre le nom du destinataire de chaque demande
  // envoyée — la vue "reçues" a déjà `fromName` stocké sur le document.
  const toIds = [...new Set(sent.map((r) => r.toId))]
  const toUsers = toIds.length > 0 ? await User.find({ _id: { $in: toIds } }).lean() : []
  const toNameById = new Map(toUsers.map((u) => [String(u._id), displayName(u)]))

  const received_: FriendRequestView[] = received.map((r) => ({
    id: String(r._id),
    fromId: r.fromId,
    fromName: r.fromName,
    toId: r.toId,
    status: r.status,
    createdAt: new Date(r.createdAt as unknown as string).toISOString(),
    respondedAt: r.respondedAt ? new Date(r.respondedAt as unknown as string).toISOString() : null,
  }))

  const sent_: SentFriendRequestView[] = sent.map((r) => ({
    id: String(r._id),
    fromId: r.fromId,
    fromName: r.fromName,
    toId: r.toId,
    toName: toNameById.get(r.toId) ?? '',
    status: r.status,
    createdAt: new Date(r.createdAt as unknown as string).toISOString(),
    respondedAt: r.respondedAt ? new Date(r.respondedAt as unknown as string).toISOString() : null,
  }))

  return { ok: true, received: received_, sent: sent_ }
}
