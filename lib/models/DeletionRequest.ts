import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `deletion_requests/{id}` (Firestore, src/utils/accountDeletion.js)
// — demande de suppression de compte nécessitant une revue agent avant purge
// (#9 phase agent/admin, tâche #104). N'existe QUE pour le flux qui a
// réellement besoin d'une approbation humaine : un organisateur/prestataire
// dont le dossier est `approved` (MonDossierPage.jsx légataire — un compte
// avec des événements/un abonnement/une vitrine publique en cours ne doit
// pas pouvoir se retirer d'un clic). Le compte `client` simple, lui,
// s'auto-supprime immédiatement sans détour par cette file — voir
// lib/server/profile.ts:deleteAccount (app/api/profil/supprimer-compte),
// que ce modèle ne touche ni ne remplace.
//
// Contrairement au legacy, qui stocke un audit `{blockers,warnings}` FIGÉ au
// moment de la soumission (potentiellement périmé le jour où l'agent statue,
// des jours ou semaines plus tard), cette migration ne persiste PAS de
// snapshot d'audit : lib/server/agentDeletion.ts le RECALCULE à la demande
// (liste + détail + juste avant la purge) depuis l'état Mongo actuel — plus
// fidèle, et c'est précisément ce que permet une base interrogeable qui
// n'existait pas côté Firestore/localStorage.
const STATUSES = ['pending', 'approved', 'rejected'] as const

const deletionRequestSchema = new Schema(
  {
    userId: { type: String, required: true },
    reason: { type: String, required: true },
    requestedAt: { type: Date, required: true, default: () => new Date() },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true }
)

// Un seul aller EN ATTENTE par compte — index partiel (même pattern que
// FriendRequest/SeatInvitation) : l'historique (approved/rejected) ne
// bloque jamais une future demande si une précédente a été refusée.
deletionRequestSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } })

export type DeletionRequestDoc = InferSchemaType<typeof deletionRequestSchema>
export type DeletionRequestModel = Model<DeletionRequestDoc>

export default (models.DeletionRequest as DeletionRequestModel) || model<DeletionRequestDoc>('DeletionRequest', deletionRequestSchema)
