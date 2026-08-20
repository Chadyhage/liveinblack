import mongoose, { type HydratedDocument } from 'mongoose'
import { getDb } from '../db/mongoose'
import Conversation, { type ConversationDoc } from '../models/Conversation'
import Message from '../models/Message'
import User from '../models/User'
import ProviderProfile from '../models/ProviderProfile'
import Event from '../models/Event'
import Report from '../models/Report'
import { AUDIO_MIME_TYPES, IMAGE_MIME_TYPES, uploadDataUri } from './cloudinary'
import { upsertMessageNotification } from './notifications'
import { notifyUserById, notifyAllAgents } from './emails/notify'
import { reportReceivedAgainstAccountEmail, newReportToReviewEmail, newMessageDigestEmail } from './emails'
import { sendPushToUser } from './push'
import {
  toConversationView,
  toMessageView,
  type ConversationSource,
  type ConversationView,
  type MessageSource,
  type MessageView,
} from './messagingViews'
import { collectDirectParticipantIds, withDirectConversationMembers } from './messagingConversationUtils'
import { buildTypingUsers, collectActiveTypingUserIds } from './messagingTypingUtils'
import {
  buildConversationLookup,
  normalizeStarredPagination,
  resolveVisibleStarredConversations,
} from './messagingStarredUtils'
import { resolveMemberMuteStatus } from './messagingMuteUtils'
import {
  buildReactionTogglePipeline,
  normalizeReactionMap,
  validateReactionEmoji,
} from './messagingReactionUtils'
import { loadParticipantMessage } from './messagingMessageGuards'
import {
  buildCatalogItemMessageContent,
  buildEventMessageContent,
  isSendableType,
  resolveLastMessageLabel,
  validateMessageContentLength,
} from './messagingSendUtils'
import {
  buildForwardedPoll,
  canForwardMessageType,
  normalizeForwardTargetIds,
  resolveForwardedLastMessageLabel,
} from './messagingForwardUtils'
import {
  buildConversationMessagePath,
  buildConversationMessageUrl,
  buildMessagePushPayload,
  selectOfflineRecipientIds,
} from './messagingNotificationUtils'
import { findOtherParticipantId, hasBlockedEitherWay, toBlockedUserIdsMap } from './messagingDirectBlockUtils'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

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

export interface SendMessageOptions {
  // Les emails et notifications système ne doivent pas retarder l'affichage
  // du message. Une route Next peut les confier à `after()` ; les appels
  // directs (tests, scripts) gardent le comportement attendu et les attendent.
  deferSideEffects?: (work: () => Promise<void>) => void | Promise<void>
}

type ErrResult = { ok: false; status: number; error: string }

// ─────────────────────────────── vues (DTO) ──────────────────────────────

export interface ConversationListView extends ConversationView {
  unreadCount: number
  // Personnalisation PROPRE À L'APPELANT (jamais partagée entre participants).
  pinned: boolean
  mutedForMe: boolean
  // null ⇒ l'appelant n'est pas muté dans ce groupe. untilAt null (à
  // l'intérieur) ⇒ sourdine indéfinie.
  myGroupMute: { untilAt: string | null } | null
}

export interface ConversationListInput {
  page?: number
  pageSize?: number
}

export interface ConversationListPageMeta {
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// Une seule requête pour tous les participants fournis — jamais une par
// message ni une par appel de toMessageView. `!== false` partout où cette
// Map est lue : un id absent (utilisateur supprimé, ou Map vide passée par
// un appelant qui sait que le message vient d'être créé) doit se comporter
// comme "autorisé", jamais comme "refusé" par défaut.
async function resolveReadReceiptsAllowed(participantIds: string[]): Promise<Map<string, boolean>> {
  if (participantIds.length === 0) return new Map()
  const users = await User.find({ _id: { $in: participantIds } }).select('privacy.readReceipts').lean()
  return new Map(users.map((u) => [String(u._id), u.privacy?.readReceipts !== false]))
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

// Contrairement aux groupes, une conversation directe ne dénormalise pas les
// noms de ses participants dans le document (pas de `members` stocké — voir
// lib/models/Conversation.ts). `toConversationView` seul ne peut donc jamais
// afficher le nom de l'interlocuteur pour un type 'direct' : on le résout ici
// à la lecture, depuis de vrais documents User, jamais depuis le client.
async function resolveDirectMemberNames(participantIds: string[]): Promise<Map<string, string>> {
  if (participantIds.length === 0) return new Map()
  const users = await User.find({ _id: { $in: participantIds } }).lean()
  return new Map(users.map((u) => [String(u._id), `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email]))
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
  if (existing) {
    const view = toConversationView(existing as unknown as ConversationSource)
    const names = await resolveDirectMemberNames(view.participantIds)
    return { ok: true, conversation: withDirectConversationMembers(view, names) }
  }

  const callerUser = await User.findById(caller.id).lean()
  const blocked =
    Boolean(callerUser?.blockedUserIds?.includes(otherUserId)) || Boolean(other.blockedUserIds?.includes(caller.id))
  if (blocked) return { ok: false, status: 403, error: 'blocked' }

  const created = await Conversation.create({ type: 'direct', participantIds: [caller.id, otherUserId] })
  const view = toConversationView(created.toObject({ flattenMaps: true }) as unknown as ConversationSource)
  const names = await resolveDirectMemberNames(view.participantIds)
  return { ok: true, conversation: withDirectConversationMembers(view, names) }
}

// ─────────────────────────── listMyConversations ──────────────────────────

export type ConversationListResult =
  | ErrResult
  | ({ ok: true; conversations: ConversationListView[] } & ConversationListPageMeta)

export async function listMyConversations(caller: MessagingCaller, input: ConversationListInput = {}): Promise<ConversationListResult> {
  await getDb()

  const page = Number.isFinite(Number(input.page)) ? Math.max(1, Math.floor(Number(input.page))) : 1
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(input.pageSize) || 20)))
  const skip = (page - 1) * pageSize

  const [aggr] = await Conversation.aggregate([
    { $match: { participantIds: caller.id, hiddenByUserIds: { $ne: caller.id } } },
    {
      $addFields: {
        _pinnedForMe: {
          $cond: [
            { $in: [caller.id, { $ifNull: ['$pinnedByUserIds', []] }] },
            1,
            0,
          ],
        },
        _sortDate: { $ifNull: ['$lastMessageAt', '$createdAt'] },
      },
    },
    { $sort: { _pinnedForMe: -1, _sortDate: -1 } },
    {
      $project: {
        type: 1,
        participantIds: 1,
        members: 1,
        name: 1,
        avatar: 1,
        mutedUserIds: 1,
        lastMessage: 1,
        lastMessageAt: 1,
        lastSenderId: 1,
        pinnedMessageId: 1,
        createdAt: 1,
        lastReadAt: 1,
        pinnedByUserIds: 1,
        mutedConversationByUserIds: 1,
      },
    },
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: pageSize }],
        total: [{ $count: 'value' }],
      },
    },
  ])

  const conversations = (aggr?.items ?? []) as unknown as ConversationSource[]
  const total = Number(aggr?.total?.[0]?.value ?? 0)
  const hasMore = skip + conversations.length < total

  // Une seule requête User pour TOUTES les conversations directes de la
  // liste (jamais un User.find par conversation) — évite un N+1.
  const directParticipantIds = collectDirectParticipantIds(conversations)
  const directNames = await resolveDirectMemberNames(directParticipantIds)

  const unreadOrs = conversations.map((conv) => {
    const lastReadAt = conv.lastReadAt ?? {}
    const lastReadForCaller = lastReadAt[caller.id] ?? conv.createdAt
    return {
      conversationId: String(conv._id),
      senderId: { $ne: caller.id },
      deletedForUserIds: { $ne: caller.id },
      createdAt: { $gt: new Date(lastReadForCaller) },
    }
  })

  const unreadRows = unreadOrs.length
    ? ((await Message.aggregate([{ $match: { $or: unreadOrs } }, { $group: { _id: '$conversationId', unreadCount: { $sum: 1 } } }])) as unknown as
        { _id: string; unreadCount: number }[])
    : []

  const unreadByConversation = new Map(unreadRows.map((row) => [String(row._id), row.unreadCount]))

  const views = await Promise.all(
    conversations.map(async (conv) => {
      const view = toConversationView(conv)
      if (view.type === 'direct') {
        return {
          ...withDirectConversationMembers(view, directNames),
          unreadCount: unreadByConversation.get(String(conv._id)) ?? 0,
          pinned: (conv.pinnedByUserIds ?? []).includes(caller.id),
          mutedForMe: (conv.mutedConversationByUserIds ?? []).includes(caller.id),
          myGroupMute: null,
        }
      } else {
        view.members = view.members.map((m) => {
          const status = resolveMemberMuteStatus(conv, m.userId)
          return status.muted ? { ...m, muteUntilAt: status.untilAtMs === null ? null : new Date(status.untilAtMs).toISOString() } : m
        })
      }
      const myMuteStatus = view.type === 'group' ? resolveMemberMuteStatus(conv, caller.id) : { muted: false, untilAtMs: null }
      return {
        ...view,
        unreadCount: unreadByConversation.get(String(conv._id)) ?? 0,
        pinned: (conv.pinnedByUserIds ?? []).includes(caller.id),
        mutedForMe: (conv.mutedConversationByUserIds ?? []).includes(caller.id),
        myGroupMute: myMuteStatus.muted ? { untilAt: myMuteStatus.untilAtMs === null ? null : new Date(myMuteStatus.untilAtMs).toISOString() } : null,
      }
    })
  )

  return {
    ok: true,
    conversations: views,
    total,
    page,
    pageSize,
    hasMore,
  }
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

  // deletedForUserIds : exclu au niveau requête plutôt qu'au rendu (le
  // legacy masquait côté client seulement) — un message "supprimé pour moi"
  // ne doit jamais quitter le serveur pour cet appelant.
  const query: Record<string, unknown> = { conversationId, deletedForUserIds: { $ne: caller.id } }
  if (input.before) {
    if (!mongoose.isValidObjectId(input.before)) return { ok: false, status: 400, error: 'invalid_cursor' }
    query._id = { $lt: new mongoose.Types.ObjectId(input.before) }
  }

  // On lit `limit + 1` en ordre décroissant (plus récent d'abord) pour
  // détecter `hasMore` sans requête de comptage séparée, puis on renverse
  // pour livrer le tableau du plus ancien au plus récent (ordre "prêt à
  // afficher" pour un fil de discussion).
  const docs = (await Message.find(query)
    .select('conversationId senderId senderName type content poll reactions readBy deletedForAll pinned replyToMessageId createdAt editedAt starredByUserIds forwardedFrom')
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean()) as unknown as MessageSource[]

  const hasMore = docs.length > limit
  const page = docs.slice(0, limit).reverse()
  const conversationSource = guard.conversation.toObject({ flattenMaps: true }) as unknown as ConversationSource

  const readReceiptsAllowed = await resolveReadReceiptsAllowed(conversationSource.participantIds ?? [])

  return {
    ok: true,
    messages: page.map((m) => toMessageView(m, { callerId: caller.id, conversation: conversationSource, readReceiptsAllowed })),
    hasMore,
  }
}

// ────────────────────────────── sendMessage ───────────────────────────────

// 'catalog_item' rejoint enfin ce type sendable : fermait un intégration
// morte laissée par la migration — le bouton "Demander ce service" côté
// client (app/(public)/providers/[id]/page.tsx +
// ProviderCatalogInquiry.tsx) et l'affichage `CatalogItemCard` côté
// MessagesClient.tsx existaient déjà tous les deux, mais le serveur
// refusait systématiquement ce type ('invalid_type') faute d'avoir jamais
// été ajouté ici. Contrairement à 'text'/'image'/'voice', le CONTENU d'un
// message 'catalog_item' n'est JAMAIS pris depuis `input.content` (voir
// sendMessage) : c'est une frontière de confiance réelle — un client
// pourrait sinon forger un JSON prétendant représenter n'importe quelle
// offre (nom/prix arbitraires, voire une offre d'un AUTRE prestataire) dans
// une conversation qu'il contrôle. Le serveur reconstruit donc lui-même le
// payload depuis le VRAI catalogue Mongo du destinataire, à partir du seul
// `catalogItemId` fourni.
// 'event' rejoint ce type sendable pour le MÊME motif que 'catalog_item'
// ci-dessus : le bouton "Partager un événement" du composeur
// (MessagesClient.tsx, attach menu) et le rendu `EventCard` existaient déjà,
// mais il n'existait AUCUN chemin serveur pour produire un message de ce
// type — seul 'event_poll' (lib/server/polls.ts, sondage "On y va ?") était
// atteignable. Résultat côté client : "Partager un événement" ne faisait
// jamais qu'ouvrir un sondage, jamais un partage direct — feedback client
// "le partage d'événements ne marche pas". Comme pour 'catalog_item', le
// CONTENU n'est jamais pris depuis `input.content` : le serveur recharge
// l'Event réel depuis Mongo à partir du seul `eventId` fourni, jamais depuis
// des champs (nom/prix/image) que le client pourrait forger.
export interface SendMessageInput {
  conversationId: string
  type: string
  // 'text' : contenu brut. 'image'/'voice' : soit `content` est déjà une URL
  // (compat), soit `mediaDataUri` porte le média encodé en base64 — dans ce
  // second cas, l'upload Cloudinary est fait ICI, jamais côté client (le
  // client n'a pas de clé API Cloudinary). 'catalog_item' : `content` est
  // IGNORÉ, voir `catalogItemId` ci-dessous.
  content: string
  mediaDataUri?: string
  replyToMessageId?: string | null
  // 'catalog_item' UNIQUEMENT : id d'un item du catalogue Mongo du DESTINATAIRE
  // de la conversation directe (jamais un id arbitraire d'un autre
  // prestataire — voir sendMessage pour la vérification d'appartenance).
  catalogItemId?: string
  // 'event' UNIQUEMENT : id d'un Event Mongo réel — voir sendMessage, le
  // payload est reconstruit depuis ce seul id, jamais depuis `content`.
  eventId?: string
}

export type SendMessageResult = ErrResult | { ok: true; message: MessageView }

// Garde partagée par sendMessage, forwardMessage, ET lib/server/polls.ts
// (créer un sondage/sondage-événement, voter) : écrire QUOI QUE CE SOIT dans
// une conversation doit être refusé exactement dans les mêmes conditions —
// sourdine de groupe (y compris temporisée, voir resolveMemberMuteStatus),
// blocage direct — jamais dupliquée entre les points d'appel. polls.ts avait
// sa propre vérification appauvrie (mutedUserIds legacy uniquement, jamais le
// blocage) avant ce correctif, ce qui permettait à un compte bloqué de créer
// des sondages ou d'y voter dans une conversation directe malgré le blocage.
export async function assertCanSendInConversation(
  conversation: HydratedDocument<ConversationDoc>,
  callerId: string
): Promise<{ ok: true } | ErrResult> {
  if (conversation.type === 'group' && resolveMemberMuteStatus(conversation, callerId).muted) {
    return { ok: false, status: 403, error: 'muted' }
  }
  if (conversation.type === 'direct') {
    // Re-vérifié À CHAQUE envoi même si createDirectConversation l'a déjà
    // vérifié à la création : un blocage peut survenir à tout moment APRÈS
    // que la conversation existe déjà (voir en-tête de fichier, amélioration #3).
    const otherId = findOtherParticipantId(conversation.participantIds, callerId)
    if (otherId) {
      const users = await User.find({ _id: { $in: [callerId, otherId] } }).select('_id blockedUserIds').lean()
      const blocked = hasBlockedEitherWay(toBlockedUserIdsMap(users), callerId, otherId)
      if (blocked) return { ok: false, status: 403, error: 'blocked' }
    }
  }
  return { ok: true }
}

export async function sendMessage(
  caller: MessagingCaller,
  input: SendMessageInput,
  options: SendMessageOptions = {}
): Promise<SendMessageResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard
  const conversation = guard.conversation

  if (!isSendableType(input.type)) return { ok: false, status: 400, error: 'invalid_type' }
  const type = input.type

  let content = (input.content ?? '').trim()
  if (type === 'catalog_item') {
    // Toujours une conversation DIRECTE : "Demander ce service" (legacy
    // PublicPrestatairePage.jsx:sendServiceInquiry) crée/retrouve une
    // conversation directe avec le prestataire AVANT d'y envoyer ce message —
    // jamais un item de catalogue partagé dans un groupe (hors périmètre de
    // ce correctif, voir ShareToChatModal côté legacy).
    if (conversation.type !== 'direct') return { ok: false, status: 400, error: 'invalid_type' }
    const catalogItemId = input.catalogItemId?.trim()
    if (!catalogItemId) return { ok: false, status: 400, error: 'invalid_input' }

    const otherId = conversation.participantIds.find((id) => id !== caller.id)
    const provider = otherId ? await ProviderProfile.findOne({ userId: otherId }).lean() : null
    // `available !== false` : même filtre que `visibleCatalog` côté page
    // publique (app/(public)/providers/[id]/page.tsx) — un item retiré/masqué
    // par le prestataire ne doit pas devenir référençable via un
    // catalogItemId forgé une fois qu'il n'a plus de bouton "Demander ce
    // service" dans l'UI.
    const item = provider?.catalog?.find((i) => i.id === catalogItemId && i.available !== false)
    // Le VRAI point de la vérification : `provider` est dérivé de L'AUTRE
    // PARTICIPANT de LA conversation ciblée, jamais d'un `providerId` fourni
    // par le client — un item appartenant à un AUTRE prestataire que celui de
    // cette conversation ne peut donc jamais matcher ici, quel que soit le
    // catalogItemId soumis.
    if (!provider || !item) return { ok: false, status: 404, error: 'catalog_item_not_found' }

    content = buildCatalogItemMessageContent({
      providerId: otherId,
      providerName: provider.name || '',
      item,
    })
  } else if (type === 'event') {
    // Voir commentaire sur SENDABLE_TYPES : le client ne fournit qu'un id,
    // le contenu affiché (`EventCard`, MessagesClient.tsx) est reconstruit
    // ICI depuis le VRAI document Event, jamais depuis quoi que ce soit
    // fourni par l'appelant.
    const eventId = input.eventId?.trim()
    if (!eventId) return { ok: false, status: 400, error: 'invalid_input' }
    const event = await Event.findById(eventId).lean()
    if (!event) return { ok: false, status: 404, error: 'event_not_found' }
    content = buildEventMessageContent(event)
  } else if (type !== 'text' && !content && input.mediaDataUri) {
    const uploaded = await uploadDataUri(input.mediaDataUri, `messages/${String(conversation._id)}`, {
      allowedMimeTypes: type === 'voice' ? AUDIO_MIME_TYPES : IMAGE_MIME_TYPES,
    })
    if (!uploaded.ok) return { ok: false, status: 400, error: uploaded.error }
    content = uploaded.url
  }
  const contentValidation = validateMessageContentLength(type, content)
  if (!contentValidation.ok) return { ok: false, status: 400, error: contentValidation.error }

  const sendGuard = await assertCanSendInConversation(conversation, caller.id)
  if (!sendGuard.ok) return sendGuard

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
  const lastMessageLabel = resolveLastMessageLabel(type, content)
  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { lastMessage: lastMessageLabel, lastMessageAt: created.createdAt, lastSenderId: caller.id } }
  )

  // Une notification par destinataire, upsertée par conversation (anti-spam,
  // voir upsertMessageNotification) — jamais pour l'expéditeur lui-même.
  const conversationIdStr = String(conversation._id)
  const recipientIds = conversation.participantIds.filter((id) => id !== caller.id)
  const conversationPath = buildConversationMessagePath(conversationIdStr)
  await Promise.all(
    recipientIds.map((recipientId) =>
      upsertMessageNotification(recipientId, conversationIdStr, lastMessageLabel, conversationPath)
    )
  )

  // E20/E40 : pas de vraie agrégation par lot (aucun cron de digest n'existe,
  // voir organizerFollowNotifications.ts pour le seul pattern de fan-out
  // existant, non applicable ici) — on envoie un email "un message reçu hors
  // ligne" seulement si le destinataire est hors ligne depuis plus de 30 min
  // ou ne s'est jamais connecté, jamais si sa présence est fraîche (évite
  // d'inonder un destinataire déjà en train de discuter dans l'app).
  if (recipientIds.length) {
    const recipients = await User.find({ _id: { $in: recipientIds } }).select('lastSeenAt').lean()
    const conversationUrl = buildConversationMessageUrl(SITE, conversationIdStr)
    const offlineRecipientIds = selectOfflineRecipientIds(recipients)
    const notifyOfflineRecipients = () => Promise.all(
      offlineRecipientIds
        .map(async (recipientId) => {
          await notifyUserById(recipientId, () => newMessageDigestEmail(senderName, lastMessageLabel, conversationUrl, SITE))
          // Pas de champ `inApp` sur newMessageDigestEmail : la notification
          // in-app existe déjà via upsertMessageNotification ci-dessus
          // (anti-spam par conversation) — un second createNotification()
          // dupliquerait l'entrée. Le push, lui, n'a pas cet anti-spam
          // (une seule notif système par appareil de toute façon), appelé
          // directement ici plutôt que via le mécanisme `inApp`.
          await sendPushToUser(recipientId, buildMessagePushPayload(senderName, lastMessageLabel, conversationUrl))
        })
    ).then(() => undefined)
    if (options.deferSideEffects) await options.deferSideEffects(notifyOfflineRecipients)
    else await notifyOfflineRecipients()
  }

  const conversationSource = conversation.toObject({ flattenMaps: true }) as unknown as ConversationSource
  return {
    ok: true,
    // Message tout juste créé : personne n'a encore eu le temps de le lire,
    // readStatus vaudra 'sent' quel que soit le contenu de cette Map — voir
    // le commentaire de toMessageView pour la réciprocité complète (getMessages).
    message: toMessageView(created.toObject({ flattenMaps: true }) as unknown as MessageSource, {
      callerId: caller.id,
      conversation: conversationSource,
      readReceiptsAllowed: new Map(),
    }),
  }
}

// ───────────────────────────── reactToMessage ─────────────────────────────

export interface ReactToMessageInput {
  messageId: string
  emoji: string
}

export type ReactToMessageResult = ErrResult | { ok: true; reactions: Record<string, string[]> }

export async function reactToMessage(caller: MessagingCaller, input: ReactToMessageInput): Promise<ReactToMessageResult> {
  await getDb()

  const messageId = input.messageId?.trim()
  const emojiResult = validateReactionEmoji(input.emoji)
  if (!messageId || !emojiResult.ok) {
    return { ok: false, status: 400, error: emojiResult.ok ? 'invalid_input' : emojiResult.error }
  }
  const emoji = emojiResult.emoji
  // Défense en profondeur : borne indépendamment du zod de la route
  // (app/api/messages/[messageId]/react/route.ts) — cette fonction ne doit
  // jamais faire confiance à ce que SEULE la route ait validé la taille,
  // sinon une chaîne de taille arbitraire devient une clé Map permanente sur
  // un message partagé (voir en-tête de reactToMessage/buildReactionTogglePipeline).
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
  const reactions = normalizeReactionMap(updated?.reactions)
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

// Port de src/pages/MessagingPage.jsx:handleBlockUser/handleUnblockUser
// (lignes 1536-1571, 2914) : un blocage/déblocage laisse une trace 'system'
// PERSISTANTE dans la conversation directe partagée (si elle existe), lisible
// dans les deux sens — jamais un simple bandeau transitoire qui disparaîtrait
// au rechargement. Le contenu est encodé `SYS::{...}` (même convention que le
// legacy) plutôt que déjà traduit pour un viewer : le texte affiché diffère
// selon qui regarde (« Tu as bloqué X » vs « X t'a bloqué »), donc seul le
// client (qui connaît currentUserId) peut le décoder correctement — voir
// messageTypeLabel/MessageRow dans MessagesClient.tsx.
async function postBlockSystemMessage(byId: string, targetId: string, kind: 'block' | 'unblock'): Promise<void> {
  const conversation = await Conversation.findOne({
    type: 'direct',
    participantIds: { $all: [byId, targetId], $size: 2 },
  })
  // Aucune conversation directe entre les deux comptes : rien à consigner
  // (fidèle au legacy, qui ne postait que dans la conversation active/existante).
  if (!conversation) return

  const [byName, targetName] = await Promise.all([resolveDisplayName(byId), resolveDisplayName(targetId)])
  const content = `SYS::${JSON.stringify({ kind, by: byId, byName, target: targetId, targetName })}`

  const created = await Message.create({
    conversationId: String(conversation._id),
    senderId: byId,
    senderName: 'Système',
    type: 'system',
    content,
  })

  // Aperçu de conversation lisible pour les DEUX participants — contrairement
  // au `content` (décodé par viewer), le legacy affichait le JSON brut dans
  // l'aperçu de liste (bug cosmétique non reproduit ici : un aperçu neutre et
  // lisible est strictement meilleur, sans rien changer au comportement
  // fonctionnel du blocage lui-même).
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessage: kind === 'block' ? 'Contact bloqué' : 'Contact débloqué',
        lastMessageAt: created.createdAt,
        lastSenderId: byId,
      },
    }
  )
}

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
  await postBlockSystemMessage(caller.id, targetUserId, 'block')
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
  await postBlockSystemMessage(caller.id, targetUserId, 'unblock')
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

  await notifyUserById(targetUserId, () => reportReceivedAgainstAccountEmail(reason, `${SITE}/help`, SITE))
  await notifyAllAgents(() => newReportToReviewEmail(`Utilisateur — ${targetName}`, `${SITE}/agent/signalements`, SITE))

  return { ok: true }
}

// ───────────────────────────── getContactPhone ────────────────────────────

export type ContactPhoneResult = ErrResult | { ok: true; phone: string | null }

// Port de src/pages/MessagingPage.jsx:1048-1070 — UNIQUEMENT le numéro PRO
// (business) de l'interlocuteur d'une conversation DIRECTE, jamais un numéro
// personnel (retiré du legacy, décision produit rappelée dans le commentaire
// d'origine). `User.phone` porte ce numéro pro (un seul par compte, saisi à
// l'inscription — voir app/api/auth/register/route.ts), avec repli
// historique sur `ProviderProfile.phone` si absent, exactement comme le
// legacy retombait sur `providers/{uid}.phone`. Restreint aux DEUX
// participants d'une conversation directe existante — jamais un lookup libre
// par userId, qui exposerait le numéro de n'importe quel compte à n'importe
// quel appelant authentifié.
export async function getContactPhone(caller: MessagingCaller, input: { conversationId: string }): Promise<ContactPhoneResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard
  const { conversation } = guard
  if (conversation.type !== 'direct') return { ok: false, status: 400, error: 'invalid_type' }

  const otherId = conversation.participantIds.find((id) => id !== caller.id)
  if (!otherId) return { ok: true, phone: null }

  const other = await User.findById(otherId).lean()
  const proPhone = other?.phone?.trim()
  if (proPhone) return { ok: true, phone: proPhone }

  const provider = await ProviderProfile.findOne({ userId: otherId }).lean()
  const providerPhone = provider?.phone?.trim()
  return { ok: true, phone: providerPhone || null }
}

// ───────────────────────────── editMessage ────────────────────────────────

export interface EditMessageInput {
  messageId: string
  content: string
}

export type EditMessageResult = ErrResult | { ok: true; message: MessageView }

export async function editMessage(caller: MessagingCaller, input: EditMessageInput): Promise<EditMessageResult> {
  await getDb()

  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard
  const { message, conversation } = guard

  // Édition réservée au PROPRIÉTAIRE, et au texte uniquement — fidèle au
  // legacy (handleEditStart : "contextMenu.msg.type === 'text'").
  if (message.senderId !== caller.id) return { ok: false, status: 403, error: 'not_message_owner' }
  if (message.type !== 'text') return { ok: false, status: 400, error: 'invalid_type' }
  if (message.deletedForAll) return { ok: false, status: 400, error: 'message_deleted' }

  const content = input.content?.trim()
  if (!content) return { ok: false, status: 400, error: 'empty_message' }
  if (content.length > 4000) return { ok: false, status: 400, error: 'message_too_long' }

  message.content = content
  message.editedAt = new Date()
  await message.save()

  const conversationSource = conversation.toObject({ flattenMaps: true }) as unknown as ConversationSource
  const readReceiptsAllowed = await resolveReadReceiptsAllowed(conversationSource.participantIds ?? [])
  return {
    ok: true,
    message: toMessageView(message.toObject({ flattenMaps: true }) as unknown as MessageSource, {
      callerId: caller.id,
      conversation: conversationSource,
      readReceiptsAllowed,
    }),
  }
}

// ─────────────────── deleteMessageForMe / deleteMessageForAll ────────────

export interface MessageIdInput {
  messageId: string
}

export type SimpleOkResult = ErrResult | { ok: true }

export async function deleteMessageForMe(caller: MessagingCaller, input: MessageIdInput): Promise<SimpleOkResult> {
  await getDb()

  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard

  // N'IMPORTE QUEL participant peut masquer un message pour lui-même
  // (propriétaire ou pas) — fidèle au legacy ("Supprimer pour moi" figure
  // toujours dans le menu, contrairement à "Supprimer pour tous").
  await Message.updateOne({ _id: guard.message._id }, { $addToSet: { deletedForUserIds: caller.id } })
  return { ok: true }
}

export async function deleteMessageForAll(caller: MessagingCaller, input: MessageIdInput): Promise<SimpleOkResult> {
  await getDb()

  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard
  if (guard.message.senderId !== caller.id) return { ok: false, status: 403, error: 'not_message_owner' }

  await Message.updateOne({ _id: guard.message._id }, { $set: { deletedForAll: true, content: null, poll: null } })
  return { ok: true }
}

// ─────────────────────── starMessage / unstarMessage ──────────────────────

export type StarResult = ErrResult | { ok: true; starred: boolean }

export async function starMessage(caller: MessagingCaller, input: MessageIdInput): Promise<StarResult> {
  await getDb()

  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard

  await Message.updateOne({ _id: guard.message._id }, { $addToSet: { starredByUserIds: caller.id } })
  return { ok: true, starred: true }
}

export async function unstarMessage(caller: MessagingCaller, input: MessageIdInput): Promise<StarResult> {
  await getDb()

  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard

  await Message.updateOne({ _id: guard.message._id }, { $pull: { starredByUserIds: caller.id } })
  return { ok: true, starred: false }
}

export type ListStarredResult = ErrResult | {
  ok: true
  messages: MessageView[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

type ListStarredMessagesParams = {
  page?: number
  pageSize?: number
}

// Traverse TOUTES les conversations de l'appelant (jamais une seule) — la
// vue "Importants" du legacy est transversale à toute la messagerie.
export async function listStarredMessages(
  caller: MessagingCaller,
  params: ListStarredMessagesParams = {},
): Promise<ListStarredResult> {
  await getDb()
  const { page: safePage, pageSize: safePageSize, skip } = normalizeStarredPagination(params)

  const conversations = (await Conversation.find({ participantIds: caller.id })
    .select('type participantIds lastReadAt')
    .lean()) as unknown as ConversationSource[]
  if (conversations.length === 0) {
    return {
      ok: true,
      messages: [],
      page: safePage,
      pageSize: safePageSize,
      total: 0,
      hasMore: false,
    }
  }
  const convLookup = buildConversationLookup(conversations)

  const filter = {
    conversationId: { $in: convLookup.ids },
    starredByUserIds: caller.id,
    deletedForUserIds: { $ne: caller.id },
  }

  const totalPromise = Message.countDocuments(filter)
  const docsPromise = Message.find(filter)
    .select('conversationId senderId senderName type content poll reactions readBy deletedForAll pinned replyToMessageId createdAt editedAt starredByUserIds forwardedFrom')
    .sort({ _id: -1 })
    .skip(skip)
    .limit(safePageSize + 1)
    .lean()

  const [rawRows, total] = await Promise.all([docsPromise, totalPromise])
  const rows = rawRows as unknown as MessageSource[]

  const hasMore = rows.length > safePageSize
  const pageRows = hasMore ? rows.slice(0, safePageSize) : rows
  const { visibleConversationMap, allParticipantIds } = resolveVisibleStarredConversations(conversations, rows)
  const readReceiptsAllowed = await resolveReadReceiptsAllowed(allParticipantIds)

  const messages = pageRows
    .map((m) => {
      const conversation = visibleConversationMap.get(m.conversationId) || convLookup.byId.get(m.conversationId)
      if (!conversation) return null
      return toMessageView(m, { callerId: caller.id, conversation, readReceiptsAllowed })
    })
    .filter((m): m is MessageView => m !== null)

  return {
    ok: true,
    messages,
    page: safePage,
    pageSize: safePageSize,
    total,
    hasMore,
  }
}

// ─────────────────────────────── forwardMessage ───────────────────────────

async function resolveConversationLabel(conversation: { type: 'direct' | 'group'; name?: string | null; participantIds: string[] }, callerId: string): Promise<string> {
  if (conversation.type === 'group') return conversation.name || 'Groupe'
  const otherId = conversation.participantIds.find((id) => id !== callerId)
  return otherId ? await resolveDisplayName(otherId) : ''
}

export interface ForwardMessageInput {
  messageId: string
  toConversationIds: string[]
}

export type ForwardMessageResult = ErrResult | { ok: true; messages: MessageView[] }

export async function forwardMessage(caller: MessagingCaller, input: ForwardMessageInput): Promise<ForwardMessageResult> {
  await getDb()

  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard
  const { message: source, conversation: sourceConversation } = guard
  const sourceGuard = canForwardMessageType(source)
  if (!sourceGuard.ok) return { ok: false, status: 400, error: sourceGuard.error }

  const targetIdsResult = normalizeForwardTargetIds(input.toConversationIds)
  if (!targetIdsResult.ok) return { ok: false, status: 400, error: targetIdsResult.error }
  const { targetIds } = targetIdsResult

  const sourceConvLabel = await resolveConversationLabel(sourceConversation, caller.id)
  const senderName = await resolveDisplayName(caller.id)

  const sent: MessageView[] = []
  for (const targetId of targetIds) {
    const targetGuard = await loadParticipantConversation(targetId, caller.id)
    // Conversation cible invalide, inexistante, ou dont l'appelant n'est pas
    // participant → ignorée silencieusement (best-effort sur la liste,
    // jamais d'échec de TOUT le transfert à cause d'UNE cible invalide).
    if (!targetGuard.ok) continue
    const targetConversation = targetGuard.conversation
    const canSend = await assertCanSendInConversation(targetConversation, caller.id)
    if (!canSend.ok) continue

    // Un sondage transféré est une NOUVELLE question posée dans la conversation
    // cible : jamais les votes de la conversation source, dont les membres ne
    // sont pas forcément (voire jamais) membres de la cible. Copier
    // `voterIds` verbatim ferait apparaître des votes préexistants attribués
    // à des utilisateurs étrangers à G2, sans qu'aucun membre de G2 ne puisse
    // jamais les retirer (createPoll/createEventPoll dans polls.ts démarrent
    // toujours `voterIds: []` pour la même raison).
    const forwardedPoll = buildForwardedPoll(source.poll)

    const created = await Message.create({
      conversationId: String(targetConversation._id),
      senderId: caller.id,
      senderName,
      type: source.type,
      content: source.content,
      poll: forwardedPoll,
      forwardedFrom: { senderName: source.senderName, convName: sourceConvLabel },
    })

    const lastMessageLabel = resolveForwardedLastMessageLabel(source.type, source.content)
    await Conversation.updateOne(
      { _id: targetConversation._id },
      { $set: { lastMessage: lastMessageLabel, lastMessageAt: created.createdAt, lastSenderId: caller.id } }
    )

    const targetConvSource = targetConversation.toObject({ flattenMaps: true }) as unknown as ConversationSource
    // Message tout juste créé dans cette conversation cible : personne n'a
    // encore eu le temps de le lire (voir le commentaire équivalent dans
    // sendMessage) — une Map vide se comporte comme "autorisé partout" et
    // readStatus vaudra 'sent' de toute façon.
    sent.push(
      toMessageView(created.toObject({ flattenMaps: true }) as unknown as MessageSource, {
        callerId: caller.id,
        conversation: targetConvSource,
        readReceiptsAllowed: new Map(),
      })
    )
  }

  if (sent.length === 0) return { ok: false, status: 400, error: 'forward_failed' }
  return { ok: true, messages: sent }
}

// ───────── pin / mute / masquage PERSONNELS d'une conversation ───────────

export interface ConversationIdInput {
  conversationId: string
}

export async function pinConversationForMe(caller: MessagingCaller, input: ConversationIdInput): Promise<SimpleOkResult> {
  await getDb()
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }
  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard
  await Conversation.updateOne({ _id: guard.conversation._id }, { $addToSet: { pinnedByUserIds: caller.id } })
  return { ok: true }
}

export async function unpinConversationForMe(caller: MessagingCaller, input: ConversationIdInput): Promise<SimpleOkResult> {
  await getDb()
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }
  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard
  await Conversation.updateOne({ _id: guard.conversation._id }, { $pull: { pinnedByUserIds: caller.id } })
  return { ok: true }
}

export async function muteConversationForMe(caller: MessagingCaller, input: ConversationIdInput): Promise<SimpleOkResult> {
  await getDb()
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }
  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard
  await Conversation.updateOne({ _id: guard.conversation._id }, { $addToSet: { mutedConversationByUserIds: caller.id } })
  return { ok: true }
}

export async function unmuteConversationForMe(caller: MessagingCaller, input: ConversationIdInput): Promise<SimpleOkResult> {
  await getDb()
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }
  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard
  await Conversation.updateOne({ _id: guard.conversation._id }, { $pull: { mutedConversationByUserIds: caller.id } })
  return { ok: true }
}

// Masquage PERSONNEL (liste de conversations) — n'affecte jamais les autres
// participants, contrairement à quitter/supprimer un groupe. Voir
// listMyConversations (filtre hiddenByUserIds).
export async function hideConversationForMe(caller: MessagingCaller, input: ConversationIdInput): Promise<SimpleOkResult> {
  await getDb()
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }
  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard
  await Conversation.updateOne({ _id: guard.conversation._id }, { $addToSet: { hiddenByUserIds: caller.id } })
  return { ok: true }
}

// "Vider l'historique" (panneau contact, conversation directe) — masque
// TOUS les messages existants pour l'appelant seul (deletedForUserIds),
// jamais pour l'autre participant.
export async function clearHistoryForMe(caller: MessagingCaller, input: ConversationIdInput): Promise<SimpleOkResult> {
  await getDb()
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }
  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard
  await Message.updateMany({ conversationId, deletedForUserIds: { $ne: caller.id } }, { $addToSet: { deletedForUserIds: caller.id } })
  return { ok: true }
}

// ────────────────────────── typing indicator ──────────────────────────────

export interface SetTypingInput {
  conversationId: string
  typing: boolean
}

export async function setTyping(caller: MessagingCaller, input: SetTypingInput): Promise<SimpleOkResult> {
  await getDb()
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }
  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard

  if (input.typing) {
    await Conversation.updateOne({ _id: guard.conversation._id }, { $set: { [`typingAt.${caller.id}`]: new Date() } })
  } else {
    await Conversation.updateOne({ _id: guard.conversation._id }, { $unset: { [`typingAt.${caller.id}`]: '' } })
  }
  return { ok: true }
}

// Expiration côté LECTURE plutôt que côté écriture (pas de job de nettoyage) —
// pas d'infra temps réel dans cette migration (polling uniquement, jamais de
// websocket), donc pas de "stop typing" fiable à la fermeture d'onglet ; une
// entrée de plus de TYPING_TTL_MS est simplement traitée comme expirée ici,
// jamais comme "toujours en train d'écrire".
const TYPING_TTL_MS = 5_000

export interface TypingUserView {
  userId: string
  name: string
}

export type TypingResult = ErrResult | { ok: true; users: TypingUserView[] }

export async function getTypingUsers(caller: MessagingCaller, input: ConversationIdInput): Promise<TypingResult> {
  await getDb()
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }
  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard
  const conv = guard.conversation

  const typingAtRaw = conv.typingAt as unknown as Map<string, Date | string> | Record<string, Date | string> | undefined
  const activeUserIds = collectActiveTypingUserIds(typingAtRaw, caller.id, TYPING_TTL_MS)

  if (activeUserIds.length === 0) return { ok: true, users: [] }

  let names: Map<string, string>
  if (conv.type === 'group' && conv.members) {
    names = new Map(conv.members.map((m) => [m.userId, m.name || '']))
  } else {
    names = await resolveDirectMemberNames(activeUserIds)
  }
  return { ok: true, users: buildTypingUsers(activeUserIds, names) }
}

// ──────────────────────── listMyReports / listBlockedUsers ────────────────

export interface MyReportView {
  id: string
  targetId: string
  targetName: string
  reason: string
  createdAt: string
}

export type MyReportsResult = ErrResult | { ok: true; reports: MyReportView[] }

export async function listMyReports(caller: MessagingCaller): Promise<MyReportsResult> {
  await getDb()
  const reports = await Report.find({ fromId: caller.id }).sort({ createdAt: -1 }).lean()
  return {
    ok: true,
    reports: reports.map((r) => ({
      id: String(r._id),
      targetId: r.targetId,
      targetName: r.targetName,
      reason: r.reason,
      createdAt: new Date(r.createdAt as unknown as string).toISOString(),
    })),
  }
}

export interface BlockedUserView {
  userId: string
  name: string
  email: string
}

export type BlockedListResult = ErrResult | { ok: true; blocked: BlockedUserView[] }

export async function listBlockedUsers(caller: MessagingCaller): Promise<BlockedListResult> {
  await getDb()
  const me = await User.findById(caller.id).lean()
  const ids = me?.blockedUserIds ?? []
  if (ids.length === 0) return { ok: true, blocked: [] }
  const users = await User.find({ _id: { $in: ids } }).lean()
  return {
    ok: true,
    blocked: users.map((u) => ({ userId: String(u._id), name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email, email: u.email })),
  }
}
