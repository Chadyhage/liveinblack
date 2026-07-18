import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `provider_reviews/{providerId}__{authorId}` (Firestore) — avis
// client sur un prestataire (#8 phase prestataire, port de api/provider-reviews.js).
// La clé composite legacy (un seul avis par paire acheteur/prestataire, sans
// transaction) devient ici un index unique {providerId, authorId} — même
// garantie, sans avoir à fabriquer un _id lisible.
const replySchema = new Schema(
  {
    text: { type: String, default: '' },
    createdAt: { type: Date, default: null },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
)

const reviewSchema = new Schema(
  {
    providerId: { type: String, required: true, index: true },
    providerName: { type: String, default: '' },
    authorId: { type: String, required: true, index: true },
    authorName: { type: String, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
    status: { type: String, enum: ['published', 'hidden', 'deleted'], default: 'published', index: true },
    // Legacy dérive ce badge d'un service_order confirmé/prêt/terminé entre
    // acheteur et prestataire. Cette migration n'a volontairement PAS de
    // système de commande de prestation (mise en relation + messagerie
    // uniquement, voir l'en-tête de src/utils/services.js) — le champ reste
    // pour compat de forme mais lib/server/providerReviews.ts le pose
    // toujours à `false`, jamais recalculé.
    verified: { type: Boolean, default: false },
    reply: { type: replySchema, default: () => ({}) },
    reportCount: { type: Number, default: 0 },
    edited: { type: Boolean, default: false },
    hiddenAt: { type: Date, default: null },
    hiddenBy: { type: String, default: null },
    deletedAt: { type: Date, default: null },
    // Modération agent (#9 phase agent/admin) — `deletedBy` distingue une
    // suppression agent de l'auto-retrait par l'auteur (deleteOwnReview,
    // lib/server/providerReviews.ts, qui ne pose pas ce champ). `adminNote`
    // est une note interne, jamais exposée au prestataire ni à l'auteur.
    deletedBy: { type: String, default: null },
    adminNote: { type: String, default: '' },
  },
  { timestamps: true }
)

reviewSchema.index({ providerId: 1, authorId: 1 }, { unique: true })

export type ReviewDoc = InferSchemaType<typeof reviewSchema>
export type ReviewModel = Model<ReviewDoc>

export default (models.Review as ReviewModel) || model<ReviewDoc>('Review', reviewSchema)
