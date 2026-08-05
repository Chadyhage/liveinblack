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
    // Sourdine d'ENVOI (togglée par un admin, empêche le membre d'écrire) —
    // reflète en permanence l'état "actuellement muté", dérivé de
    // memberMuteUntil ci-dessous (nettoyé paresseusement à chaque envoi, voir
    // lib/server/groups.ts). Fidèle au comportement legacy
    // (setGroupMemberMute/clearGroupMemberMute), mais avec une VRAIE
    // expiration temporisée cette fois (le premier port avait délibérément
    // simplifié en mute permanent — voir groups.ts pour le détail).
    mutedUserIds: { type: [String], default: [] },
    // Échéance de la sourdine de CHAQUE membre muté — chaîne ISO, ou chaîne
    // vide '' pour "jusqu'à réactivation" (indéfini). Absent d'un membre ⇒
    // jamais muté. Map de String (pas de Date) pour représenter proprement le
    // cas indéfini sans sentinelle de date arbitraire.
    memberMuteUntil: { type: Map, of: String, default: {} },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
    lastSenderId: { type: String, default: null },
    pinnedMessageId: { type: String, default: null },
    // Dernière lecture PAR PARTICIPANT — remplace le doc séparé
    // `user_read_status/{uid}` du legacy (un map par utilisateur, pas par
    // conversation) : ici directement sur la conversation, plus simple à lire
    // et à mettre à jour en une seule écriture au marquage "lu".
    lastReadAt: { type: Map, of: Date, default: {} },
    // Personnalisation PAR PARTICIPANT de la conversation elle-même
    // (épinglée/masquée dans SA liste, notifications coupées POUR LUI) —
    // jamais partagée entre participants, contrairement à mutedUserIds
    // (sourdine d'ENVOI décidée par un admin, qui s'applique à tout le monde).
    pinnedByUserIds: { type: [String], default: [] },
    mutedConversationByUserIds: { type: [String], default: [] },
    hiddenByUserIds: { type: [String], default: [] },
    // "En train d'écrire" — horodatage de la dernière frappe par
    // participant, expiré côté lecture (voir getTypingUsers) plutôt que
    // nettoyé par un job : pas d'infra temps réel dans cette migration
    // (polling uniquement), donc pas de "stop typing" fiable à la fermeture
    // d'onglet — une expiration courte côté lecture compense.
    typingAt: { type: Map, of: Date, default: {} },
  },
  { timestamps: true }
)

conversationSchema.index({ participantIds: 1, updatedAt: -1 })

export type ConversationDoc = InferSchemaType<typeof conversationSchema>
export type ConversationModel = Model<ConversationDoc>

export default (models.Conversation as ConversationModel) || model<ConversationDoc>('Conversation', conversationSchema)
