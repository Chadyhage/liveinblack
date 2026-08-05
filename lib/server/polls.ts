import mongoose, { type HydratedDocument } from 'mongoose'
import { getDb } from '../db/mongoose'
import Message, { type MessageDoc } from '../models/Message'
import Conversation, { type ConversationDoc } from '../models/Conversation'
import Event from '../models/Event'
import User from '../models/User'
import { assertCanSendInConversation } from './messaging'

// Sondages de conversation (poll + event_poll). Port de `voteOnPoll` /
// création de sondage côté legacy (src/utils/messaging.js), avec UNE
// différence structurelle majeure documentée dans lib/models/Message.ts et
// rappelée ici : le legacy faisait un READ (le doc `conv_messages/{convId}`
// entier) puis un WRITE de la liste `options` recalculée en mémoire — deux
// votes SIMULTANÉS sur le même message écrasaient l'un l'autre
// ("last-write-wins", lacune documentée par le legacy lui-même). `voteOnPoll`
// ci-dessous remplace ce READ-MODIFY-WRITE par un `updateOne` en PIPELINE
// D'AGRÉGATION : la bascule (retire/ajoute l'utilisateur d'une `voterIds`)
// est calculée PAR MONGODB, atomiquement, dans la même commande qui lit et
// écrit — aucune fenêtre de course possible entre deux votes concurrents.
//
// `poll` ET `event_poll` partagent EXACTEMENT le même mécanisme de vote — un
// seul garde combiné (`type !== 'poll' && type !== 'event_poll'`), fidèle au
// legacy. Ne JAMAIS vérifier un seul des deux types isolément : un des deux
// types de sondage se retrouverait alors avec un `voteOnPoll` qui no-op
// silencieusement pour toujours (aucune erreur, aucun vote enregistré).
//
// Aucune restriction "admin uniquement" pour créer ou voter — n'importe quel
// participant de la conversation (non muet si c'est un groupe) le peut,
// exactement la même autorisation que l'envoi d'un message normal. Aucun
// mécanisme d'expiration/fermeture n'existe côté legacy non plus : on n'en
// invente pas un ici.

export interface PollCaller {
  id: string
}

export interface PollOptionView {
  id: string
  text: string
  voterIds: string[]
}

export interface PollEventSnapshotView {
  id: string
  name: string
  date: string
  price: number
  currency: string
  image: string | null
}

export interface MessagePollView {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  type: 'poll' | 'event_poll'
  // Forme complète, alignée sur MessageView (lib/server/messaging.ts) — le
  // client (MessagesClient.tsx) ajoute directement la réponse de
  // createPoll/createEventPoll à sa liste de messages typée MessageView[],
  // sans repasser par getMessages. Une forme partielle ici (déjà rencontré :
  // `reactions` manquant faisait planter MessageBubble sur
  // `Object.keys(message.reactions)`) recasse ce même rendu.
  content: string | null
  poll: {
    pollType: 'poll' | 'event_poll'
    question: string
    options: PollOptionView[]
    event: PollEventSnapshotView | null
  }
  reactions: Record<string, string[]>
  readBy: Record<string, string>
  deletedForAll: boolean
  pinned: boolean
  replyToMessageId: string | null
  createdAt: string
  editedAt: string | null
  starredByMe: boolean
  forwardedFrom: { senderName: string; convName: string } | null
  readStatus: 'sent' | 'read' | null
}

type ErrResult = { ok: false; status: number; error: string }

const MAX_QUESTION_LEN = 500
const MIN_OPTIONS = 2
const MAX_OPTIONS = 6
const MAX_OPTION_LEN = 200

function toMessageView(message: HydratedDocument<MessageDoc>): MessagePollView {
  const poll = message.poll
  if (!poll) throw new Error('toMessageView appelé sur un message sans poll')
  return {
    id: message.id as string,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.senderName ?? '',
    type: message.type as 'poll' | 'event_poll',
    // Toujours null pour un message de type sondage — voir lib/models/Message.ts.
    content: null,
    poll: {
      pollType: poll.pollType as 'poll' | 'event_poll',
      question: poll.question,
      options: poll.options.map((o) => ({ id: o.id, text: o.text, voterIds: [...(o.voterIds ?? [])] })),
      event: poll.event
        ? {
            id: poll.event.id,
            name: poll.event.name ?? '',
            date: poll.event.date ?? '',
            price: poll.event.price ?? 0,
            currency: poll.event.currency ?? 'EUR',
            image: poll.event.image ?? null,
          }
        : null,
    },
    // Message qui vient d'être créé : ces champs sont nécessairement à leur
    // valeur par défaut, jamais renseignables à la création (voir
    // lib/models/Message.ts) — pas besoin de relire le document pour ça.
    reactions: {},
    readBy: {},
    deletedForAll: false,
    pinned: false,
    replyToMessageId: null,
    createdAt: new Date(message.createdAt as unknown as string).toISOString(),
    // Forme alignée sur messaging.ts:toMessageView (voir commentaire de
    // MessagePollView ci-dessus) : un message qui vient d'être créé n'a
    // jamais été édité, épinglé en favori, transféré, ni lu par personne
    // d'autre — sauf `readStatus`, qui doit malgré tout valoir 'sent' (et non
    // `null`/`undefined`) pour que le tick d'envoi s'affiche immédiatement
    // côté expéditeur, sans attendre le prochain rafraîchissement 3s de
    // getMessages().
    editedAt: null,
    starredByMe: false,
    forwardedFrom: null,
    readStatus: 'sent',
  }
}

async function resolveSenderName(callerId: string): Promise<string> {
  const user = await User.findById(callerId).lean()
  if (!user) return ''
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
}

type ConversationGuardResult = ErrResult | { ok: true; conversation: HydratedDocument<ConversationDoc> }

// Précondition PARTAGÉE par createPoll/createEventPoll : la conversation
// existe ET l'appelant en est participant. Un id malformé (pas un ObjectId
// valide) est traité EXACTEMENT comme "n'existe pas" (même 404
// conversation_not_found) — jamais un id invalide ne doit lever un CastError
// distinguable d'un 404 normal, qui laisserait un tiers deviner la forme
// attendue d'un id de conversation.
//
// L'autorisation d'ÉCRITURE (sourdine de groupe, blocage direct) passe par
// assertCanSendInConversation (lib/server/messaging.ts), le MÊME garde
// partagé par sendMessage/forwardMessage — jamais une vérification propre à
// ce fichier qui pourrait diverger silencieusement (c'est précisément le bug
// corrigé ici : une vérification locale à polls.ts ne connaissait ni la
// sourdine temporisée ni le blocage direct, un compte bloqué pouvait donc
// créer/voter des sondages dans une conversation directe malgré le blocage).
async function loadConversationForPost(callerId: string, conversationId: string): Promise<ConversationGuardResult> {
  if (!conversationId || !mongoose.isValidObjectId(conversationId)) {
    return { ok: false, status: 404, error: 'conversation_not_found' }
  }
  const conversation = await Conversation.findById(conversationId)
  // 404 générique que la conversation n'existe pas ou que l'appelant n'en
  // est pas participant : ne jamais laisser un non-participant distinguer
  // les deux cas (il ne doit même pas apprendre que la conversation existe).
  if (!conversation || !conversation.participantIds.includes(callerId)) {
    return { ok: false, status: 404, error: 'conversation_not_found' }
  }
  const sendGuard = await assertCanSendInConversation(conversation, callerId)
  if (!sendGuard.ok) return sendGuard
  return { ok: true, conversation }
}

// Validation question : non vide après trim, longueur max 500. Deux codes
// d'erreur distincts (question_required / question_too_long) car ce sont
// deux causes différentes qu'un client peut vouloir distinguer dans son UI
// (contrairement aux options, voir validateOptions ci-dessous).
function validateQuestion(raw: string): { ok: true; value: string } | ErrResult {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed) return { ok: false, status: 400, error: 'question_required' }
  if (trimmed.length > MAX_QUESTION_LEN) return { ok: false, status: 400, error: 'question_too_long' }
  return { ok: true, value: trimmed }
}

// Validation options : tableau de 2 à 6 chaînes non vides (après trim),
// chacune ≤ 200 caractères, sans deux options identiques après
// trim+minuscule. UN SEUL code d'erreur (`invalid_options`) pour TOUTE
// violation sur le tableau d'options (count hors bornes, entrée vide,
// entrée trop longue, doublon) — choix délibéré et documenté ici plutôt que
// dans chaque site d'appel : contrairement à la question (un seul champ, une
// seule règle par violation), une violation d'options est structurelle sur
// le TABLEAU entier, pas sur une entrée isolée qu'un client pourrait cibler
// utilement avec un code plus précis.
function validateOptions(raw: unknown): { ok: true; value: string[] } | ErrResult {
  if (!Array.isArray(raw) || raw.length < MIN_OPTIONS || raw.length > MAX_OPTIONS) {
    return { ok: false, status: 400, error: 'invalid_options' }
  }
  const trimmed = raw.map((o) => (typeof o === 'string' ? o.trim() : ''))
  if (trimmed.some((o) => !o || o.length > MAX_OPTION_LEN)) {
    return { ok: false, status: 400, error: 'invalid_options' }
  }
  const lowerSet = new Set(trimmed.map((o) => o.toLowerCase()))
  if (lowerSet.size !== trimmed.length) {
    return { ok: false, status: 400, error: 'invalid_options' }
  }
  return { ok: true, value: trimmed }
}

// ──────────────────────────────── createPoll ────────────────────────────────

export interface CreatePollInput {
  conversationId: string
  question: string
  options: string[]
}

export type CreatePollResult = ErrResult | { ok: true; message: MessagePollView }

export async function createPoll(caller: PollCaller, input: CreatePollInput): Promise<CreatePollResult> {
  await getDb()

  const guard = await loadConversationForPost(caller.id, input.conversationId?.trim())
  if (!guard.ok) return guard
  const { conversation } = guard

  const questionResult = validateQuestion(input.question)
  if (!questionResult.ok) return questionResult
  const optionsResult = validateOptions(input.options)
  if (!optionsResult.ok) return optionsResult

  const senderName = await resolveSenderName(caller.id)

  const message = await Message.create({
    conversationId: conversation.id as string,
    senderId: caller.id,
    senderName,
    type: 'poll',
    content: null,
    poll: {
      pollType: 'poll',
      question: questionResult.value,
      options: optionsResult.value.map((text, i) => ({ id: String(i), text, voterIds: [] })),
      event: null,
    },
  })

  // Aperçu de conversation dérivé du type de message — même convention que
  // les types text/image/voice (préfixe fixe + contenu pertinent).
  conversation.lastMessage = `Sondage : ${questionResult.value}`
  conversation.lastMessageAt = message.createdAt as unknown as Date
  conversation.lastSenderId = caller.id
  await conversation.save()

  return { ok: true, message: toMessageView(message) }
}

// ─────────────────────────────── createEventPoll ────────────────────────────

export interface CreateEventPollInput {
  conversationId: string
  eventId: string
}

export async function createEventPoll(caller: PollCaller, input: CreateEventPollInput): Promise<CreatePollResult> {
  await getDb()

  const guard = await loadConversationForPost(caller.id, input.conversationId?.trim())
  if (!guard.ok) return guard
  const { conversation } = guard

  const eventId = input.eventId?.trim()
  if (!eventId || !mongoose.isValidObjectId(eventId)) return { ok: false, status: 404, error: 'event_not_found' }

  // Événement toujours rechargé FRAIS depuis sa propre collection — jamais
  // aucun champ event (nom/prix/devise/image) n'est accepté depuis le corps
  // de requête client. Le snapshot embarqué dans le message est donc figé
  // au moment de l'envoi et garanti fidèle à l'Event réel à cet instant.
  const event = await Event.findById(eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }

  const senderName = await resolveSenderName(caller.id)

  // Prix du snapshot : la place la MOINS CHÈRE de l'événement (0 si aucune
  // place définie) — choix documenté ici puisque le prompt laisse le choix
  // ouvert entre "moins chère" et "première place". La moins chère reflète
  // mieux la question "On y va ?" (le prix d'entrée minimum réel), alors que
  // "la première place du tableau" dépend d'un ordre de saisie arbitraire
  // côté organisateur, sans signification métier.
  const price = event.places && event.places.length > 0 ? Math.min(...event.places.map((p) => p.price ?? 0)) : 0

  const message = await Message.create({
    conversationId: conversation.id as string,
    senderId: caller.id,
    senderName,
    type: 'event_poll',
    content: null,
    poll: {
      pollType: 'event_poll',
      question: 'On y va ?',
      options: [
        { id: 'yes', text: 'Oui', voterIds: [] },
        { id: 'no', text: 'Non', voterIds: [] },
      ],
      event: {
        id: event.id as string,
        name: event.name,
        date: event.date,
        price,
        currency: event.currency,
        image: event.imageUrl ?? null,
      },
    },
  })

  conversation.lastMessage = `Sondage événement : ${event.name}`
  conversation.lastMessageAt = message.createdAt as unknown as Date
  conversation.lastSenderId = caller.id
  await conversation.save()

  return { ok: true, message: toMessageView(message) }
}

// ───────────────────────────────── voteOnPoll ───────────────────────────────

export interface VoteOnPollInput {
  messageId: string
  optionId: string
}

export type VoteOnPollResult = ErrResult | { ok: true; options: PollOptionView[] }

export async function voteOnPoll(caller: PollCaller, input: VoteOnPollInput): Promise<VoteOnPollResult> {
  await getDb()

  const messageId = input.messageId?.trim()
  const optionId = input.optionId?.trim()
  if (!messageId || !optionId || !mongoose.isValidObjectId(messageId)) {
    return { ok: false, status: 404, error: 'poll_not_found' }
  }

  const message = await Message.findById(messageId)
  // Garde COMBINÉE 'poll' OU 'event_poll' — chemin de code PARTAGÉ par les
  // deux types (voir commentaire d'en-tête). Ne jamais scinder ce check en
  // deux appels séparés selon le type.
  if (!message || (message.type !== 'poll' && message.type !== 'event_poll') || !message.poll) {
    return { ok: false, status: 404, error: 'poll_not_found' }
  }

  // Même 404 générique que le message introuvable : un non-participant ne
  // doit pas pouvoir distinguer "ce message n'existe pas" de "je n'ai pas
  // accès à sa conversation".
  const conversation = await Conversation.findById(message.conversationId)
  if (!conversation || !conversation.participantIds.includes(caller.id)) {
    return { ok: false, status: 404, error: 'poll_not_found' }
  }

  // MÊME autorisation que créer un sondage/envoyer un message (voir en-tête
  // de fichier et assertCanSendInConversation, lib/server/messaging.ts) :
  // sourdine de groupe (y compris temporisée) ET blocage direct. 403 (pas
  // 404) : l'appelant est déjà confirmé participant juste au-dessus, donc lui
  // répondre "muted"/"blocked" ne lui apprend rien qu'il ne sache déjà (il
  // est bien dans la conversation, juste empêché d'y écrire).
  const sendGuard = await assertCanSendInConversation(conversation, caller.id)
  if (!sendGuard.ok) return sendGuard

  // Vérifié AVANT l'update atomique : un optionId inconnu ne doit PAS
  // atteindre le pipeline, où le $cond de branche "cible" ne matcherait
  // jamais et retirerait silencieusement l'appelant de toutes les options
  // sans jamais l'ajouter nulle part (no-op déguisé en succès).
  const optionExists = message.poll.options.some((o) => o.id === optionId)
  if (!optionExists) return { ok: false, status: 400, error: 'invalid_option' }

  const userId = caller.id

  // Mise à jour ATOMIQUE par pipeline d'agrégation (un seul aller-retour
  // Mongo, aucun READ-MODIFY-WRITE) : pour l'option CIBLE, bascule
  // l'appelant dans/hors sa `voterIds` (vote / dévote) ; pour TOUTE AUTRE
  // option, le retire inconditionnellement (single-select — voter pour une
  // nouvelle option retire automatiquement un vote précédent sur une autre
  // option du même message, dans la MÊME opération atomique). C'est
  // exactement le correctif du bug legacy documenté en tête de fichier :
  // deux votes concurrents sur ce même message ne peuvent plus s'écraser
  // l'un l'autre, quel que soit l'ordre d'arrivée réseau.
  await Message.updateOne(
    { _id: messageId },
    [
      {
        $set: {
          'poll.options': {
            $map: {
              input: '$poll.options',
              as: 'opt',
              in: {
                $mergeObjects: [
                  '$$opt',
                  {
                    voterIds: {
                      $cond: [
                        { $eq: ['$$opt.id', optionId] },
                        {
                          $cond: [
                            { $in: [userId, '$$opt.voterIds'] },
                            { $filter: { input: '$$opt.voterIds', cond: { $ne: ['$$this', userId] } } },
                            { $concatArrays: ['$$opt.voterIds', [userId]] },
                          ],
                        },
                        { $filter: { input: '$$opt.voterIds', cond: { $ne: ['$$this', userId] } } },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    // REQUIS : Mongoose lève "Cannot pass an array to query updates unless
    // the updatePipeline option is set" sans cette option — confirmé
    // empiriquement dans ce repo.
    { updatePipeline: true }
  )

  // Relu APRÈS l'update pour renvoyer des compteurs garantis à jour (plutôt
  // que de recalculer côté application ce que le pipeline vient de faire —
  // une relecture fraîche est la source de vérité la plus simple et la plus
  // sûre ici, le coût d'un aller-retour Mongo supplémentaire étant
  // négligeable face au risque de désynchronisation d'un calcul dupliqué).
  const fresh = await Message.findById(messageId).lean()
  const options: PollOptionView[] = (fresh?.poll?.options ?? []).map((o) => ({ id: o.id, text: o.text, voterIds: [...(o.voterIds ?? [])] }))
  return { ok: true, options }
}
