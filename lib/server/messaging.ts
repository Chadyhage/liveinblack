import mongoose, { type HydratedDocument } from 'mongoose'
import { getDb } from '../db/mongoose'
import Conversation, { type ConversationDoc } from '../models/Conversation'
import Message, { type MessageDoc } from '../models/Message'
import User from '../models/User'
import ProviderProfile from '../models/ProviderProfile'
import Report from '../models/Report'
import { uploadDataUri } from './cloudinary'

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
  // Présent (non-undefined) UNIQUEMENT si ce membre est actuellement muté —
  // null = sourdine indéfinie ("jusqu'à réactivation"), sinon échéance ISO.
  muteUntilAt?: string | null
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
  // Personnalisation PROPRE À L'APPELANT (jamais partagée entre participants).
  pinned: boolean
  mutedForMe: boolean
  // null ⇒ l'appelant n'est pas muté dans ce groupe. untilAt null (à
  // l'intérieur) ⇒ sourdine indéfinie.
  myGroupMute: { untilAt: string | null } | null
}

export interface MessagePollOptionView {
  id: string
  text: string
  voterIds: string[]
}

export interface MessagePollView {
  pollType: 'poll' | 'event_poll'
  question: string
  options: MessagePollOptionView[]
  event: { id: string; name: string; date: string; price: number; currency: string; image: string | null } | null
}

export interface MessageView {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  type: 'text' | 'image' | 'voice' | 'poll' | 'event_poll' | 'story' | 'event' | 'catalog_item' | 'system'
  content: string | null
  // Renseigné UNIQUEMENT pour type 'poll'/'event_poll' — voir lib/server/polls.ts
  // pour la logique de création/vote. getMessages() (ce fichier) doit
  // renvoyer cette donnée pour que l'historique d'une conversation affiche
  // correctement un sondage déjà envoyé, pas seulement au moment de sa
  // création (qui passe par polls.ts, jamais par ce fichier).
  poll: MessagePollView | null
  reactions: Record<string, string[]>
  readBy: Record<string, string>
  deletedForAll: boolean
  pinned: boolean
  replyToMessageId: string | null
  createdAt: string
  editedAt: string | null
  starredByMe: boolean
  forwardedFrom: { senderName: string; convName: string } | null
  // Renseigné UNIQUEMENT sur les messages de L'APPELANT — statut de lecture
  // par les AUTRES participants ('read' si au moins un autre participant a lu
  // la conversation après l'envoi de ce message, sinon 'sent'). Pas d'état
  // "delivered" distinct : cette migration n'utilise QUE du polling (jamais
  // de websocket, cf. instructions), donc "livré" et "lu" ne peuvent pas être
  // distingués de façon significative sans un signal de livraison dédié —
  // fidèle à ce que le polling peut honnêtement observer.
  readStatus: 'sent' | 'read' | null
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
  memberMuteUntil?: Record<string, string> | Map<string, string>
  lastMessage?: string
  lastMessageAt?: Date | string | null
  lastSenderId?: string | null
  pinnedMessageId?: string | null
  lastReadAt?: Record<string, Date | string>
  pinnedByUserIds?: string[]
  mutedConversationByUserIds?: string[]
  hiddenByUserIds?: string[]
  typingAt?: Record<string, Date | string> | Map<string, Date | string>
  createdAt: Date | string
}

interface MessageSource {
  _id: unknown
  conversationId: string
  senderId: string
  senderName?: string | null
  type: MessageView['type']
  content?: string | null
  poll?: {
    pollType: 'poll' | 'event_poll'
    question: string
    options: { id: string; text: string; voterIds?: string[] }[]
    event?: { id: string; name?: string | null; date?: string | null; price?: number | null; currency?: string | null; image?: string | null } | null
  } | null
  reactions?: Record<string, string[]>
  readBy?: Record<string, Date | string>
  deletedForAll?: boolean
  deletedForUserIds?: string[]
  pinned?: boolean
  replyToMessageId?: string | null
  createdAt: Date | string
  editedAt?: Date | string | null
  starredByUserIds?: string[]
  forwardedFrom?: { senderName?: string | null; convName?: string | null } | null
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

// `lastReadAt` d'une conversation, pour calculer `readStatus` — accepte
// aussi bien la forme Map (document Mongoose vivant) que l'objet brut
// (`.lean()`), les deux formes circulant selon le point d'appel.
function readLastReadAt(source: Record<string, Date | string> | Map<string, Date | string> | undefined, userId: string): number | null {
  if (!source) return null
  const raw = source instanceof Map ? source.get(userId) : source[userId]
  if (!raw) return null
  const ms = new Date(raw).getTime()
  return Number.isFinite(ms) ? ms : null
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

// ctx.conversation : nécessaire pour calculer `readStatus` (statut de
// lecture PAR LES AUTRES, uniquement pertinent sur les messages de
// l'appelant) — jamais dérivé d'une valeur fournie par le client.
// ctx.readReceiptsAllowed : réglage "Confirmations de lecture" (section
// Confidentialité de ProfilePage.jsx), pré-résolu en Map une seule fois par
// getMessages pour tous les participants de la conversation — jamais une
// requête par message. Réciproque comme sur WhatsApp/le legacy : un message
// n'apparaît "lu" QUE si l'expéditeur ET le lecteur ont tous deux ce réglage
// actif ; le désactiver empêche de voir SI ses propres messages sont lus,
// pas seulement d'en informer les autres.
function toMessageView(
  msg: MessageSource,
  ctx: { callerId: string; conversation: ConversationSource; readReceiptsAllowed: Map<string, boolean> }
): MessageView {
  const reactions = msg.reactions ?? {}
  const readByRaw = msg.readBy ?? {}
  const readBy: Record<string, string> = {}
  for (const [userId, at] of Object.entries(readByRaw)) readBy[userId] = new Date(at).toISOString()

  let readStatus: MessageView['readStatus'] = null
  if (msg.senderId === ctx.callerId && !msg.deletedForAll) {
    const createdAtMs = new Date(msg.createdAt).getTime()
    const callerAllows = ctx.readReceiptsAllowed.get(ctx.callerId) !== false
    const others = (ctx.conversation.participantIds ?? []).filter((id) => id !== ctx.callerId)
    const readByAnyOther =
      callerAllows &&
      others.some((id) => {
        if (ctx.readReceiptsAllowed.get(id) === false) return false
        const lastReadMs = readLastReadAt(ctx.conversation.lastReadAt, id)
        return lastReadMs !== null && lastReadMs >= createdAtMs
      })
    readStatus = readByAnyOther ? 'read' : 'sent'
  }

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
    poll:
      msg.poll && !msg.deletedForAll
        ? {
            pollType: msg.poll.pollType,
            question: msg.poll.question,
            options: msg.poll.options.map((o) => ({ id: o.id, text: o.text, voterIds: [...(o.voterIds ?? [])] })),
            event: msg.poll.event
              ? {
                  id: msg.poll.event.id,
                  name: msg.poll.event.name ?? '',
                  date: msg.poll.event.date ?? '',
                  price: msg.poll.event.price ?? 0,
                  currency: msg.poll.event.currency ?? 'EUR',
                  image: msg.poll.event.image ?? null,
                }
              : null,
          }
        : null,
    reactions,
    readBy,
    deletedForAll: Boolean(msg.deletedForAll),
    pinned: Boolean(msg.pinned),
    replyToMessageId: msg.replyToMessageId ?? null,
    createdAt: new Date(msg.createdAt).toISOString(),
    editedAt: msg.editedAt ? new Date(msg.editedAt).toISOString() : null,
    starredByMe: (msg.starredByUserIds ?? []).includes(ctx.callerId),
    forwardedFrom: msg.forwardedFrom
      ? { senderName: msg.forwardedFrom.senderName ?? '', convName: msg.forwardedFrom.convName ?? '' }
      : null,
    readStatus,
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
    view.members = view.participantIds.map((id) => ({ userId: id, name: names.get(id) ?? '', role: 'member' as const }))
    return { ok: true, conversation: view }
  }

  const callerUser = await User.findById(caller.id).lean()
  const blocked =
    Boolean(callerUser?.blockedUserIds?.includes(otherUserId)) || Boolean(other.blockedUserIds?.includes(caller.id))
  if (blocked) return { ok: false, status: 403, error: 'blocked' }

  const created = await Conversation.create({ type: 'direct', participantIds: [caller.id, otherUserId] })
  const view = toConversationView(created.toObject({ flattenMaps: true }) as unknown as ConversationSource)
  const names = await resolveDirectMemberNames(view.participantIds)
  view.members = view.participantIds.map((id) => ({ userId: id, name: names.get(id) ?? '', role: 'member' as const }))
  return { ok: true, conversation: view }
}

// ─────────────────────────── listMyConversations ──────────────────────────

export type ConversationListResult = ErrResult | { ok: true; conversations: ConversationListView[] }

export async function listMyConversations(caller: MessagingCaller): Promise<ConversationListResult> {
  await getDb()

  const all = (await Conversation.find({ participantIds: caller.id }).lean()) as unknown as ConversationSource[]
  // Masquage PERSONNEL (hideConversationForMe) — jamais visible pour
  // l'appelant qui l'a masquée, mais n'affecte en rien les autres
  // participants (voir hideConversationForMe plus bas).
  const conversations = all.filter((c) => !(c.hiddenByUserIds ?? []).includes(caller.id))

  // Tri : épinglées (pour MOI) d'abord, puis par lastMessageAt décroissant,
  // jamais-messagé en dernier (traité comme "-Infinity" pour le tri, jamais
  // comme "maintenant").
  const sorted = [...conversations].sort((a, b) => {
    const aPinned = (a.pinnedByUserIds ?? []).includes(caller.id)
    const bPinned = (b.pinnedByUserIds ?? []).includes(caller.id)
    if (aPinned !== bPinned) return aPinned ? -1 : 1
    const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : -Infinity
    const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : -Infinity
    return bt - at
  })

  // Une seule requête User pour TOUTES les conversations directes de la
  // liste (jamais un User.find par conversation) — évite un N+1.
  const directParticipantIds = Array.from(
    new Set(sorted.filter((c) => c.type === 'direct').flatMap((c) => c.participantIds ?? []))
  )
  const directNames = await resolveDirectMemberNames(directParticipantIds)

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
        deletedForUserIds: { $ne: caller.id },
      })
      const view = toConversationView(conv)
      if (view.type === 'direct') {
        view.members = view.participantIds.map((id) => ({ userId: id, name: directNames.get(id) ?? '', role: 'member' as const }))
      } else {
        view.members = view.members.map((m) => {
          const status = resolveMemberMuteStatus(conv, m.userId)
          return status.muted ? { ...m, muteUntilAt: status.untilAtMs === null ? null : new Date(status.untilAtMs).toISOString() } : m
        })
      }
      const myMuteStatus = view.type === 'group' ? resolveMemberMuteStatus(conv, caller.id) : { muted: false, untilAtMs: null }
      return {
        ...view,
        unreadCount,
        pinned: (conv.pinnedByUserIds ?? []).includes(caller.id),
        mutedForMe: (conv.mutedConversationByUserIds ?? []).includes(caller.id),
        myGroupMute: myMuteStatus.muted ? { untilAt: myMuteStatus.untilAtMs === null ? null : new Date(myMuteStatus.untilAtMs).toISOString() } : null,
      }
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

const SENDABLE_TYPES = ['text', 'image', 'voice'] as const
type SendableType = (typeof SENDABLE_TYPES)[number]

export interface SendMessageInput {
  conversationId: string
  type: string
  // 'text' : contenu brut. 'image'/'voice' : soit `content` est déjà une URL
  // (compat), soit `mediaDataUri` porte le média encodé en base64 — dans ce
  // second cas, l'upload Cloudinary est fait ICI, jamais côté client (le
  // client n'a pas de clé API Cloudinary).
  content: string
  mediaDataUri?: string
  replyToMessageId?: string | null
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
    const otherId = conversation.participantIds.find((id) => id !== callerId)
    if (otherId) {
      const [callerUser, otherUser] = await Promise.all([User.findById(callerId).lean(), User.findById(otherId).lean()])
      const blocked = Boolean(callerUser?.blockedUserIds?.includes(otherId)) || Boolean(otherUser?.blockedUserIds?.includes(callerId))
      if (blocked) return { ok: false, status: 403, error: 'blocked' }
    }
  }
  return { ok: true }
}

export async function sendMessage(caller: MessagingCaller, input: SendMessageInput): Promise<SendMessageResult> {
  await getDb()

  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard
  const conversation = guard.conversation

  if (!SENDABLE_TYPES.includes(input.type as SendableType)) return { ok: false, status: 400, error: 'invalid_type' }
  const type = input.type as SendableType

  let content = (input.content ?? '').trim()
  if (type !== 'text' && !content && input.mediaDataUri) {
    const uploaded = await uploadDataUri(input.mediaDataUri, `messages/${String(conversation._id)}`)
    if (!uploaded.ok) return { ok: false, status: 400, error: uploaded.error }
    content = uploaded.url
  }
  if (!content) return { ok: false, status: 400, error: 'empty_message' }
  // 'text' : contenu affiché tel quel, plafond généreux pour un message de
  // chat. 'image'/'voice' : `content` est documenté (lib/models/Message.ts)
  // comme une URL Cloudinary, jamais le média lui-même — un plafond plus
  // court suffit largement et empêche un appelant de faire passer un blob de
  // plusieurs méga-octets pour une "URL" (ce champ n'avait, avant ce
  // correctif, AUCUNE limite de taille pour ces deux types).
  if (type === 'text' && content.length > 4000) return { ok: false, status: 400, error: 'message_too_long' }
  if (type !== 'text' && content.length > 2000) return { ok: false, status: 400, error: 'message_too_long' }

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
  const lastMessageLabel = type === 'text' ? content : type === 'image' ? 'Photo' : 'Message vocal'
  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { lastMessage: lastMessageLabel, lastMessageAt: created.createdAt, lastSenderId: caller.id } }
  )

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

// ─────────────────────── resolveMemberMuteStatus ──────────────────────────

// Source de vérité pour "ce membre de groupe est-il actuellement muté ?" —
// dérivée de `memberMuteUntil`, avec repli sur `mutedUserIds` seul (muté
// indéfiniment) si aucune échéance n'est enregistrée — un document seedé/
// migré qui ne porte que `mutedUserIds` (avant l'introduction de
// `memberMuteUntil`) doit rester traité comme muté, jamais silencieusement
// débloqué. Exportée : groups.ts (muteMember/unmuteMember/écriture du champ)
// ET les DTO de conversation (listMyConversations) en ont besoin.
export function resolveMemberMuteStatus(
  conversation: { mutedUserIds?: string[]; memberMuteUntil?: Record<string, string> | Map<string, string> },
  userId: string
): { muted: boolean; untilAtMs: number | null } {
  const source = conversation.memberMuteUntil
  const raw = source instanceof Map ? source.get(userId) : source?.[userId]
  if (raw === undefined) {
    const inLegacyList = (conversation.mutedUserIds ?? []).includes(userId)
    return inLegacyList ? { muted: true, untilAtMs: null } : { muted: false, untilAtMs: null }
  }
  if (raw === '') return { muted: true, untilAtMs: null } // sourdine indéfinie
  const untilAtMs = new Date(raw).getTime()
  if (!Number.isFinite(untilAtMs) || untilAtMs <= Date.now()) return { muted: false, untilAtMs: null }
  return { muted: true, untilAtMs }
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

// ─────────────────────── loadParticipantMessage ───────────────────────────

type MessageGuardResult = ErrResult | { ok: true; message: HydratedDocument<MessageDoc>; conversation: HydratedDocument<ConversationDoc> }

// Garde PARTAGÉE par toute action ciblant un message précis (editMessage,
// deleteMessageForMe/ForAll, starMessage, forwardMessage) : charge le VRAI
// document Message, résout sa conversation, et vérifie que l'appelant en est
// bien participant — 404 générique dans les deux cas (message inexistant OU
// appelant non participant), même raisonnement que loadParticipantConversation.
async function loadParticipantMessage(messageId: string, callerId: string): Promise<MessageGuardResult> {
  if (!mongoose.isValidObjectId(messageId)) return { ok: false, status: 404, error: 'message_not_found' }
  const message = await Message.findById(messageId)
  if (!message) return { ok: false, status: 404, error: 'message_not_found' }
  const conversation = await Conversation.findById(message.conversationId)
  if (!conversation || !conversation.participantIds.includes(callerId)) {
    return { ok: false, status: 404, error: 'message_not_found' }
  }
  return { ok: true, message, conversation }
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

export type ListStarredResult = ErrResult | { ok: true; messages: MessageView[] }

// Traverse TOUTES les conversations de l'appelant (jamais une seule) — la
// vue "Importants" du legacy est transversale à toute la messagerie.
export async function listStarredMessages(caller: MessagingCaller): Promise<ListStarredResult> {
  await getDb()

  const conversations = (await Conversation.find({ participantIds: caller.id }).lean()) as unknown as ConversationSource[]
  if (conversations.length === 0) return { ok: true, messages: [] }
  const convById = new Map(conversations.map((c) => [String(c._id), c] as const))

  const docs = (await Message.find({
    conversationId: { $in: [...convById.keys()] },
    starredByUserIds: caller.id,
    deletedForUserIds: { $ne: caller.id },
  })
    .sort({ createdAt: -1 })
    .lean()) as unknown as MessageSource[]

  const allParticipantIds = [...new Set(conversations.flatMap((c) => c.participantIds ?? []))]
  const readReceiptsAllowed = await resolveReadReceiptsAllowed(allParticipantIds)

  const messages = docs
    .map((m) => {
      const conversation = convById.get(m.conversationId)
      if (!conversation) return null
      return toMessageView(m, { callerId: caller.id, conversation, readReceiptsAllowed })
    })
    .filter((m): m is MessageView => m !== null)

  return { ok: true, messages }
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

const MAX_FORWARD_TARGETS = 20

export async function forwardMessage(caller: MessagingCaller, input: ForwardMessageInput): Promise<ForwardMessageResult> {
  await getDb()

  const messageId = input.messageId?.trim()
  if (!messageId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantMessage(messageId, caller.id)
  if (!guard.ok) return guard
  const { message: source, conversation: sourceConversation } = guard
  if (source.deletedForAll) return { ok: false, status: 400, error: 'message_deleted' }
  if (source.type === 'system') return { ok: false, status: 400, error: 'invalid_type' }

  const targetIdsRaw = Array.isArray(input.toConversationIds) ? input.toConversationIds : []
  const targetIds = [...new Set(targetIdsRaw.map((id) => id?.trim()).filter((id): id is string => Boolean(id)))]
  if (targetIds.length === 0) return { ok: false, status: 400, error: 'invalid_input' }
  if (targetIds.length > MAX_FORWARD_TARGETS) return { ok: false, status: 400, error: 'too_many_targets' }

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
    const forwardedPoll = source.poll
      ? {
          pollType: source.poll.pollType,
          question: source.poll.question,
          options: source.poll.options.map((o) => ({ id: o.id, text: o.text, voterIds: [] as string[] })),
          event: source.poll.event ? { ...source.poll.event } : null,
        }
      : null

    const created = await Message.create({
      conversationId: String(targetConversation._id),
      senderId: caller.id,
      senderName,
      type: source.type,
      content: source.content,
      poll: forwardedPoll,
      forwardedFrom: { senderName: source.senderName, convName: sourceConvLabel },
    })

    const lastMessageLabel =
      source.type === 'text' ? (source.content ?? '') : source.type === 'image' ? 'Photo' : source.type === 'voice' ? 'Message vocal' : 'Message'
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

  const typingAtRaw = conv.typingAt as unknown as Map<string, Date> | Record<string, Date> | undefined
  const entries = typingAtRaw instanceof Map ? Array.from(typingAtRaw.entries()) : Object.entries(typingAtRaw ?? {})
  const now = Date.now()
  const activeUserIds = entries
    .filter(([userId, at]) => {
      if (userId === caller.id) return false
      const ms = new Date(at).getTime()
      return Number.isFinite(ms) && now - ms < TYPING_TTL_MS
    })
    .map(([userId]) => userId)

  if (activeUserIds.length === 0) return { ok: true, users: [] }

  let names: Map<string, string>
  if (conv.type === 'group' && conv.members) {
    names = new Map(conv.members.map((m) => [m.userId, m.name || '']))
  } else {
    names = await resolveDirectMemberNames(activeUserIds)
  }
  return { ok: true, users: activeUserIds.map((id) => ({ userId: id, name: names.get(id) ?? '' })) }
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
