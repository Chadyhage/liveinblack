import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `users/{uid}` (Firestore) + Firebase Auth. Un compte peut porter
// plusieurs rôles (décision de la réunion du 15/07/2026) : `roles` liste tout
// ce que le compte a le droit d'utiliser, `activeRole` est l'interface
// actuellement affichée. Les fonctions de lib/server/permissions.ts vérifient
// toujours `activeRole`, jamais `roles` directement.
const ROLES = ['client', 'organisateur', 'prestataire', 'agent'] as const
const STATUSES = ['active', 'pending', 'rejected'] as const

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    phone: { type: String, default: '' },
    roles: { type: [String], enum: ROLES, default: ['client'] },
    activeRole: { type: String, enum: ROLES, default: 'client' },
    status: { type: String, enum: STATUSES, default: 'active' },
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
