import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `conv_messages/{convId}.items[]` (Firestore, UN SEUL document par
// CONVERSATION contenant tous ses messages). Ferme l'audit C10 : le legacy
// autorisait la lecture/écriture de ce document même quand `conversations/{id}`
// n'existait pas encore (aucune vérification d'appartenance réelle), avec des
// ids dérivés de `Date.now()` (prévisibles, jamais garantis uniques). Ici,
// UN DOCUMENT PAR MESSAGE dans sa propre collection : la vérification "la
// conversation existe et l'expéditeur en est bien participant" se fait
// SERVEUR (lib/server/messaging.ts) avant toute écriture, l'id est
// l'ObjectId Mongo (imprévisible, garanti unique), et `senderId` ne peut
// jamais être falsifié par le client (dérivé de la session, jamais du corps
// de requête).
const POLL_TYPES = ['poll', 'event_poll'] as const

// Options d'un sondage — `voterIds` (liste, pas un compteur) permet de
// répondre à la fois à "combien de votes" ET "qui a voté quoi", exactement
// comme le `votes: {userId: true}` du legacy, mais en tableau plutôt qu'en
// map pour permettre une mise à jour atomique par pipeline d'agrégation
// (voir lib/server/polls.ts) — le legacy documentait lui-même l'absence
// d'une telle garantie ("deux votes SIMULTANÉS... last-write-wins") comme un
// gap connu ; ce choix de structure ferme ce gap.
const pollOptionSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    voterIds: { type: [String], default: [] },
  },
  { _id: false }
)

// Snapshot minimal de l'événement pour un event_poll ("On y va ?") — capturé
// au moment de l'envoi, jamais re-résolu depuis l'event courant (un event
// poll reste cohérent même si l'événement change de nom/prix ensuite).
const pollEventSnapshotSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: '' },
    date: { type: String, default: '' },
    price: { type: Number, default: 0 },
    currency: { type: String, default: 'EUR' },
    image: { type: String, default: null },
  },
  { _id: false }
)

const pollSchema = new Schema(
  {
    pollType: { type: String, enum: POLL_TYPES, required: true },
    question: { type: String, required: true },
    options: { type: [pollOptionSchema], required: true },
    event: { type: pollEventSnapshotSchema, default: null },
  },
  { _id: false }
)

// Snapshot minimal du message d'origine transféré — capturé au moment du
// transfert (jamais re-résolu depuis le message source, qui peut être
// supprimé ensuite sans casser le libellé « Transféré de … »).
const forwardedFromSchema = new Schema(
  {
    senderName: { type: String, default: '' },
    convName: { type: String, default: '' },
  },
  { _id: false }
)

const messageSchema = new Schema(
  {
    conversationId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    senderName: { type: String, default: '' },
    type: {
      type: String,
      enum: ['text', 'image', 'voice', 'poll', 'event_poll', 'story', 'event', 'catalog_item', 'system'],
      required: true,
    },
    // content : texte pour 'text'/'system', URL pour 'image'/'voice', JSON
    // sérialisé pour 'story'/'event'/'catalog_item' (fidèle au legacy, qui
    // sérialisait déjà ces trois types en JSON dans `content`). Absent pour
    // 'poll'/'event_poll', qui utilisent le champ `poll` structuré ci-dessous
    // plutôt qu'un JSON.stringify dans une string (le legacy sérialisait le
    // sondage EN TEXTE dans `content` — ici un vrai sous-document, qui permet
    // une mise à jour atomique ciblée par MongoDB).
    content: { type: String, default: null },
    poll: { type: pollSchema, default: null },
    reactions: { type: Map, of: [String], default: {} },
    readBy: { type: Map, of: Date, default: {} },
    deletedForAll: { type: Boolean, default: false },
    deletedForUserIds: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
    replyToMessageId: { type: String, default: null },
    // Édition (texte uniquement, propriétaire seul) — voir editMessage
    // (lib/server/messaging.ts). Non-null ⇒ suffixe "(modifié)" côté UI.
    editedAt: { type: Date, default: null },
    // Marquage "important" — par utilisateur (chacun ses propres messages
    // marqués, jamais partagé), voir starMessage/unstarMessage.
    starredByUserIds: { type: [String], default: [] },
    // Renseigné uniquement pour un message transféré (handleForward côté
    // legacy) — jamais recalculé après coup.
    forwardedFrom: { type: forwardedFromSchema, default: null },
  },
  { timestamps: true }
)

messageSchema.index({ conversationId: 1, createdAt: -1 })

export type MessageDoc = InferSchemaType<typeof messageSchema>
export type MessageModel = Model<MessageDoc>

export default (models.Message as MessageModel) || model<MessageDoc>('Message', messageSchema)
