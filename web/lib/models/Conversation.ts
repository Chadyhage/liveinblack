import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `conversations/{convId}` (Firestore). Contrairement au legacy, qui
// dupliquait la liste des participants sur deux champs différents
// (`participants` pour le direct, `participantIds` pour les groupes) UNIQUEMENT
// parce que Firestore a besoin d'une requête `array-contains` distincte par
// champ, ici un seul champ `participantIds` sert aux deux types — Mongo
// interroge un tableau de la même façon quel que soit le type de conversation.
const ROLES = ['admin', 'member'] as const

const memberSchema = new Schema(
  {
    userId: { type: String, required: true },
    name: { type: String, default: '' },
    role: { type: String, enum: ROLES, default: 'member' },
  },
  { _id: false }
)

const conversationSchema = new Schema(
  {
    type: { type: String, enum: ['direct', 'group'], required: true },
    participantIds: { type: [String], required: true, index: true },
    // members/name/avatar/mutedUserIds : uniquement pertinents pour type:'group'
    // (undefined sur un direct — pas de sur-structure imposée à une conv 1:1).
    members: { type: [memberSchema], default: undefined },
    name: { type: String, default: null },
    avatar: { type: String, default: null },
    // Mute permanent (togglé par un admin), pas une expiration temporisée —
    // fidèle au comportement legacy (setGroupMemberMute/clearGroupMemberMute).
    mutedUserIds: { type: [String], default: [] },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
    lastSenderId: { type: String, default: null },
    pinnedMessageId: { type: String, default: null },
    // Dernière lecture PAR PARTICIPANT — remplace le doc séparé
    // `user_read_status/{uid}` du legacy (un map par utilisateur, pas par
    // conversation) : ici directement sur la conversation, plus simple à lire
    // et à mettre à jour en une seule écriture au marquage "lu".
    lastReadAt: { type: Map, of: Date, default: {} },
  },
  { timestamps: true }
)

conversationSchema.index({ participantIds: 1, updatedAt: -1 })

export type ConversationDoc = InferSchemaType<typeof conversationSchema>
export type ConversationModel = Model<ConversationDoc>

export default (models.Conversation as ConversationModel) || model<ConversationDoc>('Conversation', conversationSchema)
