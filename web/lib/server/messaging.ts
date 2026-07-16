import mongoose, { type HydratedDocument } from 'mongoose'
import { getDb } from '../db/mongoose'
import Conversation, { type ConversationDoc } from '../models/Conversation'
import Message from '../models/Message'
import User from '../models/User'
import Report from '../models/Report'

// Port de src/utils/messaging.js vers un modèle Mongo un-document-par-message
// (voir lib/models/Message.ts). Ferme l'audit C10 : le legacy stockait TOUS
// les messages d'une conversation dans un unique document Firestore
// (`conv_messages/{convId}.items[]`), avec des ids dérivés de `Date.now()`
// (prévisibles, jamais garantis uniques), et ses règles de sécurité
// autorisaient la lecture/écriture de ce document même quand
// `conversations/{convId}` n'existait pas encore — un attaquant pouvait donc
// écrire un historique de messages "orphelin", sans conversation/appartenance
// réelle derrière, ou forger un message avec un senderId arbitraire.
//
// Ici, il n'existe AUCUN SDK base de données côté client : toute mutation
// passe par une fonction serveur de ce fichier, qui (a) charge le VRAI
// document Conversation par son id, (b) vérifie qu'il existe réellement, et
// (c) vérifie que l'appelant figure bien dans son `participantIds`, AVANT
// toute lecture/écriture des messages de cette conversation — jamais de
// confiance en un conversationId seul. `senderId` sur chaque message créé
// vient toujours de l'appelant authentifié (`caller.id`), jamais du corps de
// la requête.
//
// Deuxième amélioration délibérée : une vraie validation à l'envoi (le
// legacy n'en avait aucune, pas même un check de chaîne vide).
//
// Troisième amélioration délibérée : le blocage est désormais RÉELLEMENT
// appliqué côté serveur (le legacy ne l'appliquait que dans l'UI —
// `canSendInConversation` ne vérifiait jamais le statut de blocage, un compte
// bloqué pouvait donc toujours envoyer en appelant l'API directement).
// L'historique existant et la présence de la conversation dans la liste d'un
// utilisateur ne sont PAS affectés par un blocage (fidèle à l'UX legacy) — on
// ne ferme que la lacune d'application au moment de l'ENVOI.

export interface MessagingCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

// ─────────────────────────────── vues (DTO) ──────────────────────────────

export interface ConversationMemberView {
  userId: string
  name: string
  role: 'admin' | 'member'
}

export interface ConversationView {
  id: string
  type: 'direct' | 'group'
  participantIds: string[]
  members: ConversationMemberView[]
  name: string | null
  avatar: string | null
  mutedUserIds: string[]
  lastMessage: string
  lastMessageAt: string | null
  lastSenderId: string | null
  pinnedMessageId: string | null
  createdAt: string
}

export interface ConversationListView extends ConversationView {
  unreadCount: number
}

export interface MessageView {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  type: 'text' | 'image' | 'voice' | 'poll' | 'event_poll' | 'system'
  content: string | null
  reactions: Record<string, string[]>
  readBy: Record<string, string>
  deletedForAll: boolean
  pinned: boolean
  replyToMessageId: string | null
  createdAt: string
}

// Formes minimales attendues en lecture, distinctes des types
// `InferSchemaType` de Mongoose : les champs `Map` (`lastReadAt`,
// `reactions`, `readBy`) redeviennent des objets JS bruts une fois passés par
// `.lean()`/`.toObject({flattenMaps:true})` (même constat, et même
// convention de cast, que `StaffRoster` dans lib/server/eventOrders.ts et
// `payoutMomos` dans lib/server/eventPayouts.ts) — Mongoose ne retype pas ça
// automatiquement pour TypeScript.
interface ConversationSource {
  _id: unknown
  type: 'direct' | 'group'
  participantIds: string[]
  members?: { userId: string; name?: string | null; role?: 'admin' | 'member' }[]
  name?: string | null
  avatar?: string | null
  mutedUserIds?: string[]
  lastMessage?: string
  lastMessageAt?: Date | string | null
  lastSenderId?: string | null
  pinnedMessageId?: string | null
  lastReadAt?: Record<string, Date | string>
  createdAt: Date | string
}

interface MessageSource {
  _id: unknown
  conversationId: string
  senderId: string
  senderName?: string | null
  type: MessageView['type']
  content?: string | null
  reactions?: Record<string, string[]>
  readBy?: Record<string, Date | string>
  deletedForAll?: boolean
  pinned?: boolean
  replyToMessageId?: string | null
  createdAt: Date | string
}

// Exportée : réutilisée telle quelle par lib/server/groups.ts (gestion du
// cycle de vie des groupes) plutôt que dupliquée — un DTO de conversation ne
// doit avoir qu'une seule définition dans tout le module de messagerie.
export function toConversationView(conv: ConversationSource): ConversationView {
  return {
    id: String(conv._id),
    type: conv.type,
    participantIds: conv.participantIds ?? [],
    members: (conv.members ?? []).map((m) => ({ userId: m.userId, name: m.name ?? '', role: m.role ?? 'member' })),
    name: conv.name ?? null,
    avatar: conv.avatar ?? null,
    mutedUserIds: conv.mutedUserIds ?? [],
    lastMessage: conv.lastMessage ?? '',
    lastMessageAt: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : null,
    lastSenderId: conv.lastSenderId ?? null,
    pinnedMessageId: conv.pinnedMessageId ?? null,
    createdAt: new Date(conv.createdAt).toISOString(),
  }
}

function toMessageView(msg: MessageSource): MessageView {
  const reactions = msg.reactions ?? {}
  const readByRaw = msg.readBy ?? {}
  const readBy: Record<string, string> = {}
  for (const [userId, at] of Object.entries(readByRaw)) readBy[userId] = new Date(at).toISOString()

  return {
    id: String(msg._id),
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    senderName: msg.senderName ?? '',
    type: msg.type,
    // Jamais le vrai contenu d'un message supprimé pour tout le monde — voir
    // l'en-tête de fichier (ferme la fuite potentielle "l'historique reste
    // lisible même après suppression").
    content: msg.deletedForAll ? null : (msg.content ?? null),
    reactions,
    readBy,
    deletedForAll: Boolean(msg.deletedForAll),
    pinned: Boolean(msg.pinned),
    replyToMessageId: msg.replyToMessageId ?? null,
    createdAt: new Date(msg.createdAt).toISOString(),
  }
}

// BSON ObjectId parsing est insensible à la casse (`"507f..."` et `"507F..."`
// désignent le MÊME document), mais un `===` sur la chaîne brute fournie par
// le client ne l'est PAS. Sans cette normalisation, un appelant peut soumettre
// son propre id avec une casse différente pour contourner un garde-fou
// "self" écrit en comparaison de chaînes (`cannot_message_self`,
// `cannot_block_self`, `cannot_report_self`), puisque `User.findById` résout
// quand même vers son propre document. Appelée UNIQUEMENT après
// `mongoose.isValidObjectId(...)` (peut lever sinon).
// Exportée : lib/server/groups.ts en a besoin pour les mêmes raisons (dédoublonnage
// insensible à la casse des ids de membres, self-check sur le créateur d'un
// groupe) — voir groups.ts pour le détail des sites d'appel.
export function normalizeObjectId(id: string): string {
  return new mongoose.Types.ObjectId(id).toString()
}

// Exportée : lib/server/groups.ts résout les noms d'affichage des membres
// d'un groupe (créateur ET membres invités) de la même façon, toujours depuis
// un vrai document User, jamais depuis une valeur fournie par le client.
export async function resolveDisplayName(userId: string): Promise<string> {
  const user = await User.findById(userId).lean()
  if (!user) return ''
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
}

// Garde PARTAGÉE par toutes les fonctions ci-dessous qui opèrent sur une
// conversation existante : charge le VRAI document Conversation et vérifie
// que l'appelant en est bien participant. 404 générique dans LES DEUX cas
// (conversation inexistante OU appelant non participant) — un tiers ne peut
// jamais distinguer "cette conversation n'existe pas" de "elle existe mais je
// n'y suis pas", même logique que les 404 génériques de
// lib/server/seatAssignment.ts (`invitation_not_found`).
type ConversationGuardResult = ErrResult | { ok: true; conversation: HydratedDocument<ConversationDoc> }

// Exportée : lib/server/groups.ts (gestion de groupe) réutilise EXACTEMENT
// cette même garde comme brique de base de son propre garde "conversation de
// groupe + appelant participant" (voir loadGroupConversation dans groups.ts),
// plutôt que de dupliquer la logique existence+appartenance.
export async function loadParticipantConversation(conversationId: string, callerId: string): Promise<ConversationGuardResult> {
  if (!mongoose.isValidObjectId(conversationId)) return { ok: false, status: 404, error: 'conversation_not_found' }
  const conversation = await Conversation.findById(conversationId)
  if (!conversation || !conversation.participantIds.includes(callerId)) {
    return { ok: false, status: 404, error: 'conversation_not_found' }
  }
  return { ok: true, conversation }
}

// ────────────────────────── createDirectConversation ─────────────────────

export interface CreateDirectConversationInput {
  otherUserId: string
}

export type ConversationResult = ErrResult | { ok: true; conversation: ConversationView }

export async function createDirectConversation(caller: MessagingCaller, input: CreateDirectConversationInput): Promise<ConversationResult> {
  await getDb()

  const otherUserIdRaw = input.otherUserId?.trim()
  if (!otherUserIdRaw) return { ok: false, status: 400, error: 'invalid_input' }

  if (!mongoose.isValidObjectId(otherUserIdRaw)) return { ok: false, status: 404, error: 'user_not_found' }
  // Normalisé AVANT le self-check et le find-or-create ci-dessous — voir
  // normalizeObjectId.
  const otherUserId = normalizeObjectId(otherUserIdRaw)
  const other = await User.findById(otherUserId).lean()
  if (!other) return { ok: false, status: 404, error: 'user_not_found' }
  if (otherUserId === caller.id) return { ok: false, status: 400, error: 'cannot_message_self' }

  // Find-or-create : {type:'direct', participantIds: exactement ces deux
  // comptes} — jamais de doublon. Un blocage existant ne fait PAS disparaître
  // une conversation déjà là, il empêche seulement d'en CRÉER une nouvelle
  // (voir plus bas) : on cherche donc l'existante avant tout check de blocage.
  const existing = await Conversation.findOne({
    type: 'direct',
    participantIds: { $all: [caller.id, otherUserId], $size: 2 },
  }).lean()
  if (existing) return { ok: true, conversation: toConversationView(existing as unknown as ConversationSource) }

  const callerUser = await User.findById(caller.id).lean()
  const blocked =
    Boolean(callerUser?.blockedUserIds?.includes(otherUserId)) || Boolean(other.blockedUserIds?.includes(caller.id))
  if (blocked) return { ok: false, status: 403, error: 'blocked' }

  const created = await Conversation.create({ type: 'direct', participantIds: [caller.id, otherUserId] })
  return { ok: true, conversation: toConversationView(created.toObject({ flattenMaps: true }) as unknown as ConversationSource) }
}

// ─────────────────────────── listMyConversations ──────────────────────────

export type ConversationListResult = ErrResult | { ok: true; conversations: ConversationListView[] }

export async function listMyConversations(caller: MessagingCaller): Promise<ConversationListResult> {
  await getDb()

  const conversations = (await Conversation.find({ participantIds: caller.id }).lean()) as unknown as ConversationSource[]

  // Tri par lastMessageAt décroissant, jamais-messagé en dernier (traité
  // comme "-Infinity" pour le tri, jamais comme "maintenant").
  const sorted = [...conversations].sort((a, b) => {
    const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : -Infinity
    const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : -Infinity
    return bt - at
  })

  const views = await Promise.all(
    sorted.map(async (conv) => {
      const lastReadAt = conv.lastReadAt ?? {}
      // Aucune lecture connue pour l'appelant → tout message d'un AUTRE
      // participant compte comme non lu (createdAt de la conversation comme
      // plancher), jamais 0 par défaut.
      const lastReadForCaller = lastReadAt[caller.id] ?? conv.createdAt
      const unreadCount = await Message.countDocuments({
        conversationId: String(conv._id),
        senderId: { $ne: caller.id },
        createdAt: { $gt: new Date(lastReadForCaller) },
      })
      return { ...toConversationView(conv), unreadCount }
    })
  )

  return { ok: true, conversations: views }
}

// ────────────────────────────── getMessages ───────────────────────────────

export interface GetMessagesInput {
  conversationId: string
  // Curseur = id (ObjectId) du message le plus ANCIEN déjà reçu par
  // l'appelant. On pagine sur `_id` plutôt que `createdAt` : `_id` encode
  // l'ordre de création de façon strictement monotone et unique, alors que
  // deux messages peuvent partager le même `createdAt` à la milliseconde
  // près — une pagination sur `createdAt` seul risquerait de sauter ou de
  // dupliquer un message en cas d'égalité.
  before?: string
  limit?: number
}

export type MessagesResult = ErrResult | { ok: true; messages: MessageView[]; hasMore: boolean }

const DEFAULT_MESSAGES_LIMIT = 30
const MAX_MESSAGES_LIMIT = 100

export async function getMessages(caller: MessagingCaller, input: GetMessagesInput): Promise<MessagesResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard

  let limit = Math.floor(input.limit ?? DEFAULT_MESSAGES_LIMIT)
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_MESSAGES_LIMIT
  if (limit > MAX_MESSAGES_LIMIT) limit = MAX_MESSAGES_LIMIT

  const query: Record<string, unknown> = { conversationId }
  if (input.before) {
    if (!mongoose.isValidObjectId(input.before)) return { ok: false, status: 400, error: 'invalid_cursor' }
    query._id = { $lt: new mongoose.Types.ObjectId(input.before) }
  }

  // On lit `limit + 1` en ordre décroissant (plus récent d'abord) pour
  // détecter `hasMore` sans requête de comptage séparée, puis on renverse
  // pour livrer le tableau du plus ancien au plus récent (ordre "prêt à
  // afficher" pour un fil de discussion).
  const docs = (await Message.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean()) as unknown as MessageSource[]

  const hasMore = docs.length > limit
  const page = docs.slice(0, limit).reverse()

  return { ok: true, messages: page.map(toMessageView), hasMore }
}

// ────────────────────────────── sendMessage ───────────────────────────────

const SENDABLE_TYPES = ['text', 'image', 'voice'] as const
type SendableType = (typeof SENDABLE_TYPES)[number]

export interface SendMessageInput {
  conversationId: string
  type: string
  content: string
  replyToMessageId?: string | null
}

export type SendMessageResult = ErrResult | { ok: true; message: MessageView }

export async function sendMessage(caller: MessagingCaller, input: SendMessageInput): Promise<SendMessageResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard
  const conversation = guard.conversation

  if (!SENDABLE_TYPES.includes(input.type as SendableType)) return { ok: false, status: 400, error: 'invalid_type' }
  const type = input.type as SendableType

  const content = (input.content ?? '').trim()
  if (!content) return { ok: false, status: 400, error: 'empty_message' }
  // 'text' : contenu affiché tel quel, plafond généreux pour un message de
  // chat. 'image'/'voice' : `content` est documenté (lib/models/Message.ts)
  // comme une URL Cloudinary, jamais le média lui-même — un plafond plus
  // court suffit largement et empêche un appelant de faire passer un blob de
  // plusieurs méga-octets pour une "URL" (ce champ n'avait, avant ce
  // correctif, AUCUNE limite de taille pour ces deux types).
  if (type === 'text' && content.length > 4000) return { ok: false, status: 400, error: 'message_too_long' }
  if (type !== 'text' && content.length > 2000) return { ok: false, status: 400, error: 'message_too_long' }

  if (conversation.type === 'group' && conversation.mutedUserIds.includes(caller.id)) {
    return { ok: false, status: 403, error: 'muted' }
  }

  if (conversation.type === 'direct') {
    // Re-vérifié À L'ENVOI même si createDirectConversation l'a déjà vérifié
    // à la création : un blocage peut survenir à tout moment APRÈS que la
    // conversation existe déjà (voir en-tête de fichier, amélioration #3).
    const otherId = conversation.participantIds.find((id) => id !== caller.id)
    if (otherId) {
      const [callerUser, otherUser] = await Promise.all([User.findById(caller.id).lean(), User.findById(otherId).lean()])
      const blocked =
        Boolean(callerUser?.blockedUserIds?.includes(otherId)) || Boolean(otherUser?.blockedUserIds?.includes(caller.id))
      if (blocked) return { ok: false, status: 403, error: 'blocked' }
    }
  }

  const senderName = await resolveDisplayName(caller.id)
  const replyToMessageId = input.replyToMessageId?.trim() || null

  const created = await Message.create({
    conversationId: String(conversation._id),
    senderId: caller.id,
    senderName,
    type,
    content,
    replyToMessageId,
  })

  // Libellé dérivé du type pour image/voice, fidèle au legacy
  // (messaging.js:702-714) : la conversation liste un aperçu, pas une URL.
  const lastMessageLabel = type === 'text' ? content : type === 'image' ? 'Photo' : 'Message vocal'
  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { lastMessage: lastMessageLabel, lastMessageAt: created.createdAt, lastSenderId: caller.id } }
  )

  return { ok: true, message: toMessageView(created.toObject({ flattenMaps: true }) as unknown as MessageSource) }
}

// ───────────────────────────── reactToMessage ─────────────────────────────

export interface ReactToMessageInput {
  messageId: string
  emoji: string
}

export type ReactToMessageResult = ErrResult | { ok: true; reactions: Record<string, string[]> }

// Construit le pipeline d'agrégation utilisé par `updateOne(..., pipeline,
// {updatePipeline:true})` pour appliquer atomiquement la sémantique
// "single-select toggle" (une seule réaction par utilisateur, ré-émettre la
// même bascule off, en émettre une différente déplace) sur un champ Map
// (`reactions: Map<string, string[]>`) — l'équivalent du toggle déjà en
// place pour les votes de sondage dans cette même migration, mais adapté ici
// avec $objectToArray/$map/$filter/$arrayToObject puisqu'une Map (pas un
// tableau de sous-documents) ne peut pas être manipulée par un simple
// `$push`/`$pull` positionnel.
function buildReactionTogglePipeline(callerId: string, emoji: string): Record<string, unknown>[] {
  return [
    // 1) L'utilisateur avait-il DÉJÀ réagi avec CET emoji précis ? (décide
    // toggle-off vs toggle-on/switch plus bas)
    {
      $set: {
        __targetV: {
          $ifNull: [
            {
              $arrayElemAt: [
                {
                  $map: {
                    input: {
                      $filter: {
                        input: { $objectToArray: { $ifNull: ['$reactions', {}] } },
                        as: 'e',
                        cond: { $eq: ['$$e.k', emoji] },
                      },
                    },
                    as: 'e',
                    in: '$$e.v',
                  },
                },
                0,
              ],
            },
            [],
          ],
        },
      },
    },
    { $set: { __hadTarget: { $in: [callerId, '$__targetV'] } } },
    // 2) Retire l'utilisateur de TOUS les emoji (une seule réaction possible
    // à la fois, comme un sondage single-select).
    {
      $set: {
        __cleaned: {
          $map: {
            input: { $objectToArray: { $ifNull: ['$reactions', {}] } },
            as: 'e',
            in: { k: '$$e.k', v: { $filter: { input: '$$e.v', as: 'uid', cond: { $ne: ['$$uid', callerId] } } } },
          },
        },
      },
    },
    // 3) Si ce n'était PAS déjà l'emoji cible, on le rajoute — à l'entrée
    // existante si elle survit encore après le nettoyage, sinon en créant une
    // toute nouvelle entrée (premier·ère à réagir avec cet emoji).
    {
      $set: {
        __hasTargetEntry: {
          $gt: [{ $size: { $filter: { input: '$__cleaned', as: 'e', cond: { $eq: ['$$e.k', emoji] } } } }, 0],
        },
      },
    },
    {
      $set: {
        __withTarget: {
          $cond: [
            '$__hadTarget',
            '$__cleaned',
            {
              $cond: [
                '$__hasTargetEntry',
                {
                  $map: {
                    input: '$__cleaned',
                    as: 'e',
                    in: {
                      k: '$$e.k',
                      v: { $cond: [{ $eq: ['$$e.k', emoji] }, { $concatArrays: ['$$e.v', [callerId]] }, '$$e.v'] },
                    },
                  },
                },
                { $concatArrays: ['$__cleaned', [{ k: emoji, v: [callerId] }]] },
              ],
            },
          ],
        },
      },
    },
    // 4) Toute entrée dont le tableau est devenu vide disparaît de la Map —
    // pas de clé emoji fantôme à `[]`.
    {
      $set: {
        reactions: {
          $arrayToObject: { $filter: { input: '$__withTarget', as: 'e', cond: { $gt: [{ $size: '$$e.v' }, 0] } } },
        },
      },
    },
    { $unset: ['__targetV', '__hadTarget', '__cleaned', '__hasTargetEntry', '__withTarget'] },
  ]
}

export async function reactToMessage(caller: MessagingCaller, input: ReactToMessageInput): Promise<ReactToMessageResult> {
  await getDb()

  const messageId = input.messageId?.trim()
  const emoji = input.emoji?.trim()
  if (!messageId || !emoji) return { ok: false, status: 400, error: 'invalid_input' }
  // Défense en profondeur : borne indépendamment du zod de la route
  // (app/api/messages/[messageId]/react/route.ts) — cette fonction ne doit
  // jamais faire confiance à ce que SEULE la route ait validé la taille,
  // sinon une chaîne de taille arbitraire devient une clé Map permanente sur
  // un message partagé (voir en-tête de reactToMessage/buildReactionTogglePipeline).
  if (emoji.length > 32) return { ok: false, status: 400, error: 'invalid_emoji' }
  if (!mongoose.isValidObjectId(messageId)) return { ok: false, status: 404, error: 'message_not_found' }

  const message = await Message.findById(messageId).lean()
  if (!message) return { ok: false, status: 404, error: 'message_not_found' }

  // 404 générique (pas 403) si l'appelant n'est pas participant de la
  // conversation du message — même raisonnement que loadParticipantConversation.
  const conversation = await Conversation.findById(message.conversationId).lean()
  if (!conversation || !conversation.participantIds.includes(caller.id)) {
    return { ok: false, status: 404, error: 'message_not_found' }
  }

  await Message.updateOne({ _id: message._id }, buildReactionTogglePipeline(caller.id, emoji), { updatePipeline: true })

  const updated = await Message.findById(message._id).lean()
  const reactions = ((updated?.reactions as unknown as Record<string, string[]>) ?? {}) as Record<string, string[]>
  return { ok: true, reactions }
}

// ────────────────────────── markConversationRead ──────────────────────────

export type MarkReadResult = ErrResult | { ok: true }

export async function markConversationRead(caller: MessagingCaller, input: { conversationId: string }): Promise<MarkReadResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard

  await Conversation.updateOne({ _id: guard.conversation._id }, { $set: { [`lastReadAt.${caller.id}`]: new Date() } })
  return { ok: true }
}

// ─────────────────────── blockUser / unblockUser ──────────────────────────

export type BlockResult = ErrResult | { ok: true }

export async function blockUser(caller: MessagingCaller, input: { targetUserId: string }): Promise<BlockResult> {
  await getDb()

  const targetUserIdRaw = input.targetUserId?.trim()
  if (!targetUserIdRaw) return { ok: false, status: 400, error: 'invalid_input' }
  if (!mongoose.isValidObjectId(targetUserIdRaw)) return { ok: false, status: 404, error: 'user_not_found' }
  // Normalisé AVANT le self-check et l'écriture dans blockedUserIds ci-dessous
  // — voir normalizeObjectId.
  const targetUserId = normalizeObjectId(targetUserIdRaw)

  const target = await User.findById(targetUserId).lean()
  if (!target) return { ok: false, status: 404, error: 'user_not_found' }
  if (targetUserId === caller.id) return { ok: false, status: 400, error: 'cannot_block_self' }

  // $addToSet : idempotent, un second blocage du même compte est un no-op
  // silencieux plutôt qu'une erreur ou un doublon.
  await User.updateOne({ _id: caller.id }, { $addToSet: { blockedUserIds: targetUserId } })
  return { ok: true }
}

export async function unblockUser(caller: MessagingCaller, input: { targetUserId: string }): Promise<BlockResult> {
  await getDb()

  const targetUserIdRaw = input.targetUserId?.trim()
  if (!targetUserIdRaw) return { ok: false, status: 400, error: 'invalid_input' }
  // Même normalisation qu'au blocage (blockUser) : blockedUserIds ne stocke
  // désormais que la forme canonique, donc un $pull sur une casse différente
  // de la même id doit quand même matcher — sinon une entrée légitime
  // deviendrait impossible à retirer selon la casse soumise par le client.
  const targetUserId = mongoose.isValidObjectId(targetUserIdRaw) ? normalizeObjectId(targetUserIdRaw) : targetUserIdRaw

  await User.updateOne({ _id: caller.id }, { $pull: { blockedUserIds: targetUserId } })
  return { ok: true }
}

// ───────────────────────────── reportUser ─────────────────────────────────

export type ReportResult = ErrResult | { ok: true }

export async function reportUser(caller: MessagingCaller, input: { targetUserId: string; reason: string }): Promise<ReportResult> {
  await getDb()

  const targetUserIdRaw = input.targetUserId?.trim()
  if (!targetUserIdRaw) return { ok: false, status: 400, error: 'invalid_input' }
  if (!mongoose.isValidObjectId(targetUserIdRaw)) return { ok: false, status: 404, error: 'user_not_found' }
  // Normalisé AVANT le self-check et le Report.create ci-dessous — voir
  // normalizeObjectId.
  const targetUserId = normalizeObjectId(targetUserIdRaw)

  const target = await User.findById(targetUserId).lean()
  if (!target) return { ok: false, status: 404, error: 'user_not_found' }
  if (targetUserId === caller.id) return { ok: false, status: 400, error: 'cannot_report_self' }

  const reason = input.reason?.trim()
  if (!reason || reason.length > 1000) return { ok: false, status: 400, error: 'reason_required' }

  // Noms TOUJOURS résolus depuis de vrais documents User — jamais depuis une
  // valeur fournie par le client.
  const callerUser = await User.findById(caller.id).lean()
  const fromName = callerUser ? `${callerUser.firstName ?? ''} ${callerUser.lastName ?? ''}`.trim() || callerUser.email : ''
  const targetName = `${target.firstName ?? ''} ${target.lastName ?? ''}`.trim() || target.email

  await Report.create({ fromId: caller.id, fromName, targetId: targetUserId, targetName, reason })
  return { ok: true }
}
