import { getDb } from '../db/mongoose'
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
import { withDirectConversationMembers } from './messagingConversationUtils'
import {
  buildReactionTogglePipeline,
  normalizeReactionMap,
  validateReactionEmoji,
} from './messagingReactionUtils'
import { loadParticipantMessage } from './messagingMessageGuards'
import {
  isSendableType,
  validateMessageContentLength,
} from './messagingSendUtils'
import { resolveDirectMemberNames, resolveReadReceiptsAllowed } from './messagingParticipantLookupUtils'
import {
  listStarredMessagesPage,
  type ListStarredMessagesParams,
  type ListStarredMessagesResult,
} from './messagingStarredMessagesService'
import {
  type ConversationIdInput,
} from './messagingConversationPreferencesService'
import {
  type ListBlockedUsersResult,
  type ListMyReportsResult,
} from './messagingSafetyListsService'
import { type SetTypingInput, type TypingUserView } from './messagingTypingService'
import { type MessageIdInput } from './messagingMessageActionsService'
import { resolveConversationContactPhone } from './messagingContactService'
import { forwardMessageForCaller } from './messagingForwardService'
import { type EditMessageInput } from './messagingEditService'
import { toggleMessageReaction, type ReactToMessageInput } from './messagingReactionService'
import { markConversationReadForCaller } from './messagingReadService'
import { postBlockSystemMessage } from './messagingBlockSystemMessageService'
import { createDirectConversationForCaller } from './messagingDirectConversationService'
import { listConversationsForCaller } from './messagingConversationListService'
import { listMessagesForCaller } from './messagingMessagesService'
import { resolveSendMessageContent } from './messagingSendContentService'
import { deliverMessageForConversation } from './messagingDeliveryService'
import { reportUserForCaller } from './messagingReportService'
import { assertConversationSendAllowed } from './messagingSendGuardService'
import { blockUserForCaller, unblockUserForCaller } from './messagingBlockService'
import {
  deleteMessageForAllWorkflow,
  deleteMessageForMeWorkflow,
  editMessageWorkflow,
  starMessageWorkflow,
  unstarMessageWorkflow,
} from './messagingMessageWorkflowService'
import {
  clearConversationHistoryWorkspace,
  getTypingUsersWorkspace,
  hideConversationWorkspace,
  listWorkspaceBlockedUsers,
  listWorkspaceReports,
  muteConversationWorkspace,
  pinConversationWorkspace,
  setTypingWorkspace,
  unmuteConversationWorkspace,
  unpinConversationWorkspace,
} from './messagingWorkspaceService'
import {
  loadParticipantConversation,
  normalizeObjectId,
  resolveDisplayName,
  type MessagingCaller,
} from './messagingCoreService'
import {
  sendMessageForCaller,
  type SendMessageInput,
  type SendMessageOptions,
  type SendMessageResult,
} from './messagingSendMessageService'

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

// ────────────────────────── createDirectConversation ─────────────────────

export interface CreateDirectConversationInput {
  otherUserId: string
}

export type ConversationResult = ErrResult | { ok: true; conversation: ConversationView }

export async function createDirectConversation(caller: MessagingCaller, input: CreateDirectConversationInput): Promise<ConversationResult> {
  await getDb()
  return createDirectConversationForCaller(caller, input, {
    normalizeObjectId,
    toConversationView: (conversation) => toConversationView(conversation as ConversationSource),
    withDirectConversationMembers,
    resolveDirectMemberNames,
  })
}

// ─────────────────────────── listMyConversations ──────────────────────────

export type ConversationListResult =
  | ErrResult
  | ({ ok: true; conversations: ConversationListView[] } & ConversationListPageMeta)

export async function listMyConversations(caller: MessagingCaller, input: ConversationListInput = {}): Promise<ConversationListResult> {
  await getDb()
  return listConversationsForCaller(caller, input, {
    toConversationView: (conversation) => toConversationView(conversation as ConversationSource) as ConversationListView,
    resolveDirectMemberNames,
  })
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

export async function getMessages(caller: MessagingCaller, input: GetMessagesInput): Promise<MessagesResult> {
  await getDb()
  return listMessagesForCaller(caller, input, {
    loadParticipantConversation: async (conversationId, callerId) => {
      const guard = await loadParticipantConversation(conversationId, callerId)
      if (!guard.ok) return guard
      return {
        ok: true as const,
        conversation: guard.conversation.toObject({ flattenMaps: true }) as ConversationSource,
      }
    },
    toMessageView: (message, ctx) => toMessageView(message as MessageSource, ctx),
    resolveReadReceiptsAllowed,
  })
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
  return assertConversationSendAllowed(conversation, callerId)
}

export async function sendMessage(
  caller: MessagingCaller,
  input: SendMessageInput,
  options: SendMessageOptions = {}
): Promise<SendMessageResult> {
  await getDb()
  return sendMessageForCaller(caller, input, options, {
    loadParticipantConversation,
    isSendableType,
    resolveSendMessageContent: (callerId, conversation, sendInput) =>
      resolveSendMessageContent(callerId, conversation, sendInput, {
        uploadDataUri,
        imageMimeTypes: IMAGE_MIME_TYPES,
        audioMimeTypes: AUDIO_MIME_TYPES,
      }),
    validateMessageContentLength,
    assertCanSendInConversation,
    resolveDisplayName,
    deliverMessageForConversation: (deliveryCaller, conversation, deliveryInput, deliveryOptions) =>
      deliverMessageForConversation(
        deliveryCaller,
        conversation,
        deliveryInput,
        {
          site: SITE,
          deferSideEffects: deliveryOptions.deferSideEffects,
        },
        {
          upsertMessageNotification,
          notifyUserById,
          newMessageDigestEmail,
          sendPushToUser,
          toMessageView,
        },
      ),
  })
}

export type ReactToMessageResult = ErrResult | { ok: true; reactions: Record<string, string[]> }

export async function reactToMessage(caller: MessagingCaller, input: ReactToMessageInput): Promise<ReactToMessageResult> {
  await getDb()
  return toggleMessageReaction(caller, input, {
    validateReactionEmoji,
    buildReactionTogglePipeline,
    normalizeReactionMap,
  })
}

// ────────────────────────── markConversationRead ──────────────────────────

export type MarkReadResult = ErrResult | { ok: true }

export async function markConversationRead(caller: MessagingCaller, input: { conversationId: string }): Promise<MarkReadResult> {
  await getDb()
  return markConversationReadForCaller(caller, input, loadParticipantConversation)
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
export async function blockUser(caller: MessagingCaller, input: { targetUserId: string }): Promise<BlockResult> {
  await getDb()
  return blockUserForCaller(caller, input, {
    normalizeObjectId,
    postBlockSystemMessage,
    resolveDisplayName,
  })
}

export async function unblockUser(caller: MessagingCaller, input: { targetUserId: string }): Promise<BlockResult> {
  await getDb()
  return unblockUserForCaller(caller, input, {
    normalizeObjectId,
    postBlockSystemMessage,
    resolveDisplayName,
  })
}

// ───────────────────────────── reportUser ─────────────────────────────────

export type ReportResult = ErrResult | { ok: true }

export async function reportUser(caller: MessagingCaller, input: { targetUserId: string; reason: string }): Promise<ReportResult> {
  await getDb()
  return reportUserForCaller(caller, input, SITE, {
    normalizeObjectId,
    notifyUserById,
    notifyAllAgents,
    reportReceivedAgainstAccountEmail,
    newReportToReviewEmail,
  })
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
  return resolveConversationContactPhone(caller, input, loadParticipantConversation)
}

export type EditMessageResult = ErrResult | { ok: true; message: MessageView }

export async function editMessage(caller: MessagingCaller, input: EditMessageInput): Promise<EditMessageResult> {
  await getDb()
  return editMessageWorkflow(caller, input, {
    loadParticipantMessage,
    resolveReadReceiptsAllowed,
  })
}

export type SimpleOkResult = ErrResult | { ok: true }

export async function deleteMessageForMe(caller: MessagingCaller, input: MessageIdInput): Promise<SimpleOkResult> {
  await getDb()
  return deleteMessageForMeWorkflow(caller, input, { loadParticipantMessage })
}

export async function deleteMessageForAll(caller: MessagingCaller, input: MessageIdInput): Promise<SimpleOkResult> {
  await getDb()
  return deleteMessageForAllWorkflow(caller, input, { loadParticipantMessage })
}

// ─────────────────────── starMessage / unstarMessage ──────────────────────

export type StarResult = ErrResult | { ok: true; starred: boolean }

export async function starMessage(caller: MessagingCaller, input: MessageIdInput): Promise<StarResult> {
  await getDb()
  return starMessageWorkflow(caller, input, { loadParticipantMessage })
}

export async function unstarMessage(caller: MessagingCaller, input: MessageIdInput): Promise<StarResult> {
  await getDb()
  return unstarMessageWorkflow(caller, input, { loadParticipantMessage })
}

export type ListStarredResult = ErrResult | ListStarredMessagesResult

// Traverse TOUTES les conversations de l'appelant (jamais une seule) — la
// vue "Importants" du legacy est transversale à toute la messagerie.
export async function listStarredMessages(
  caller: MessagingCaller,
  params: ListStarredMessagesParams = {},
): Promise<ListStarredResult> {
  await getDb()
  return listStarredMessagesPage(caller, params, resolveReadReceiptsAllowed)
}

// ─────────────────────────────── forwardMessage ───────────────────────────

export interface ForwardMessageInput {
  messageId: string
  toConversationIds: string[]
}

export type ForwardMessageResult = ErrResult | { ok: true; messages: MessageView[] }

export async function forwardMessage(caller: MessagingCaller, input: ForwardMessageInput): Promise<ForwardMessageResult> {
  await getDb()
  return forwardMessageForCaller(caller, input, {
    loadParticipantMessage,
    loadParticipantConversation,
    assertCanSendInConversation,
    resolveDisplayName,
  })
}

export async function pinConversationForMe(caller: MessagingCaller, input: ConversationIdInput): Promise<SimpleOkResult> {
  await getDb()
  return pinConversationWorkspace(caller, input, { loadParticipantConversation })
}

export async function unpinConversationForMe(caller: MessagingCaller, input: ConversationIdInput): Promise<SimpleOkResult> {
  await getDb()
  return unpinConversationWorkspace(caller, input, { loadParticipantConversation })
}

export async function muteConversationForMe(caller: MessagingCaller, input: ConversationIdInput): Promise<SimpleOkResult> {
  await getDb()
  return muteConversationWorkspace(caller, input, { loadParticipantConversation })
}

export async function unmuteConversationForMe(caller: MessagingCaller, input: ConversationIdInput): Promise<SimpleOkResult> {
  await getDb()
  return unmuteConversationWorkspace(caller, input, { loadParticipantConversation })
}

// Masquage PERSONNEL (liste de conversations) — n'affecte jamais les autres
// participants, contrairement à quitter/supprimer un groupe. Voir
// listMyConversations (filtre hiddenByUserIds).
export async function hideConversationForMe(caller: MessagingCaller, input: ConversationIdInput): Promise<SimpleOkResult> {
  await getDb()
  return hideConversationWorkspace(caller, input, { loadParticipantConversation })
}

// "Vider l'historique" (panneau contact, conversation directe) — masque
// TOUS les messages existants pour l'appelant seul (deletedForUserIds),
// jamais pour l'autre participant.
export async function clearHistoryForMe(caller: MessagingCaller, input: ConversationIdInput): Promise<SimpleOkResult> {
  await getDb()
  return clearConversationHistoryWorkspace(caller, input, { loadParticipantConversation })
}

export async function setTyping(caller: MessagingCaller, input: SetTypingInput): Promise<SimpleOkResult> {
  await getDb()
  return setTypingWorkspace(caller, input, { loadParticipantConversation })
}

export type TypingResult = ErrResult | { ok: true; users: TypingUserView[] }

export async function getTypingUsers(caller: MessagingCaller, input: ConversationIdInput): Promise<TypingResult> {
  await getDb()
  return getTypingUsersWorkspace(caller, input, {
    loadParticipantConversation,
    resolveDirectMemberNames,
  })
}

// ──────────────────────── listMyReports / listBlockedUsers ────────────────

export type MyReportsResult = ErrResult | ListMyReportsResult

export async function listMyReports(caller: MessagingCaller): Promise<MyReportsResult> {
  await getDb()
  return listWorkspaceReports(caller)
}
export type BlockedListResult = ErrResult | ListBlockedUsersResult

export async function listBlockedUsers(caller: MessagingCaller): Promise<BlockedListResult> {
  await getDb()
  return listWorkspaceBlockedUsers(caller)
}
