import mongoose, { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `users/{uid}` (Firestore) + Firebase Auth. Un compte peut porter
// plusieurs rôles (décision de la réunion du 15/07/2026) : `roles` liste tout
// ce que le compte a le droit d'utiliser, `activeRole` est l'interface
// actuellement affichée. Les fonctions de lib/server/permissions.ts vérifient
// toujours `activeRole`, jamais `roles` directement.
const ROLES = ['client', 'organisateur', 'prestataire', 'agent'] as const
const STATUSES = ['active', 'pending', 'rejected'] as const
const ROLE_APPROVAL_STATUSES = ['none', 'pending', 'active', 'rejected'] as const

// Confidentialité (#6 phase profil, port de la section "Confidentialité" de
// ProfilePage.jsx) — toutes à true par défaut, comme le legacy. `showOnline`
// est réellement appliqué par lib/server/presence.ts (getPresence masque le
// statut d'un compte qui l'a désactivé) et `readReceipts` par
// lib/server/messaging.ts (un accusé de lecture n'est exposé aux AUTRES que
// si son auteur a cette préférence active). `showAvatar` et
// `personalizedRecommendations` sont stockés mais PAS ENCORE appliqués
// ailleurs dans ce port : la messagerie n'affiche aujourd'hui que des
// initiales (jamais de vraie photo, cf. Avatar dans MessagesClient.tsx) et
// aucun moteur de recommandation n'existe dans cette migration — un bascule
// inerte est fidèle à "le réglage existe" mais ne doit jamais être présentée
// comme un mensonge : documenté ici pour la prochaine phase qui touchera à
// l'un des deux.
const privacySchema = new Schema(
  {
    showOnline: { type: Boolean, default: true },
    showAvatar: { type: Boolean, default: true },
    readReceipts: { type: Boolean, default: true },
    personalizedRecommendations: { type: Boolean, default: true },
  },
  { _id: false }
)

export const NAME_COOLDOWN_DAYS = 14

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    phone: { type: String, default: '' },
    avatarUrl: { type: String, default: null },
    // Démographie facultative — jamais affichée sur un profil, jamais un
    // contrôle d'âge (voir le hint exact du legacy dans ProfilePage.jsx) :
    // sert uniquement aux statistiques anonymes côté organisateur.
    birthYear: { type: Number, default: null },
    gender: { type: String, enum: ['femme', 'homme', 'autre'], default: null },
    // Cooldown de 14 jours entre deux changements de nom (NAME_COOLDOWN_MS
    // côté legacy) — voir lib/server/profile.ts:updateName.
    nameChangedAt: { type: Date, default: null },
    // Changement d'email en attente de confirmation (verifyBeforeUpdateEmail
    // côté legacy) — `email` ne change qu'à la confirmation du lien envoyé à
    // CETTE adresse, jamais immédiatement à la demande. Voir
    // lib/server/profile.ts : requestEmailChange / confirmEmailChange.
    pendingEmail: { type: String, default: null },
    privacy: { type: privacySchema, default: () => ({}) },
    // Goûts déclarés (carte "Mes goûts", #6 phase profil) — forme libre
    // (musicStyles[]/artists[]/eventTypes[]/cities[]/budget/ambiances[]/...),
    // jamais lue en dehors de ce port : le moteur de scoring/recommandation
    // (src/utils/recommendations.js) et la section homepage qui le consomme
    // restent HORS PÉRIMÈTRE de cette migration (phase ultérieure) — seule la
    // DÉCLARATION est portée ici, fidèle au formulaire legacy.
    preferences: { type: mongoose.Schema.Types.Mixed, default: null },
    roles: { type: [String], enum: ROLES, default: ['client'] },
    activeRole: { type: String, enum: ROLES, default: 'client' },
    status: { type: String, enum: STATUSES, default: 'active' },
    // Statut d'approbation PAR RÔLE (#7 phase organisateur) — distinct du
    // `status` global ci-dessus. Nécessaire pour ne jamais reproduire le bug
    // legacy déjà corrigé une fois (audit #7 de src/utils/applications.js) :
    // un organisateur déjà actif qui candidate en plus comme prestataire ne
    // doit PAS se retrouver bloqué de ses deux interfaces le temps de la
    // review du second dossier. Voir lib/server/permissions.ts.
    orgStatus: { type: String, enum: ROLE_APPROVAL_STATUSES, default: 'none' },
    prestStatus: { type: String, enum: ROLE_APPROVAL_STATUSES, default: 'none' },
    emailVerifiedAt: { type: Date, default: null },
    points: { type: Number, default: 0 },
    lastSeenAt: { type: Date, default: null },
    superAdmin: { type: Boolean, default: false },

    // Stripe Connect (organisateurs éligibles — pays EUR/Connect uniquement).
    // Écrit UNIQUEMENT par le webhook `account.updated`, jamais par le client.
    stripeAccountId: { type: String, default: null },
    stripeChargesEnabled: { type: Boolean, default: false },
    stripeCountry: { type: String, default: null },

    // Numéros mobile money pour les versements FedaPay, par code pays ISO-2
    // ('tg','bj',...) — un organisateur peut vendre dans plusieurs zones XOF.
    payoutMomos: { type: Map, of: String, default: {} },

    // Comptes bloqués par CE compte — le blocage empêche l'envoi de messages
    // dans les deux sens, voir lib/server/messaging.ts.
    blockedUserIds: { type: [String], default: [] },
  },
  { timestamps: true }
)

export type UserDoc = InferSchemaType<typeof userSchema>
export type UserModel = Model<UserDoc>

export default (models.User as UserModel) || model<UserDoc>('User', userSchema)
