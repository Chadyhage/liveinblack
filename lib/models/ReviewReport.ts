import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `provider_review_reports/{reviewId}__{reporterId}` (Firestore) —
// signalements d'avis (#8 phase prestataire). Collection SÉPARÉE des avis :
// l'identité d'un rapporteur n'est jamais exposée au prestataire ni à
// l'auteur de l'avis signalé (anti-représailles, fidèle au commentaire
// d'en-tête de api/provider-reviews.js). Index unique {reviewId, reporterId}
// = un seul signalement par personne et par avis, sans transaction.
const reviewReportSchema = new Schema(
  {
    reviewId: { type: String, required: true, index: true },
    reporterId: { type: String, required: true },
    // Affiché à l'agent modérateur (jamais au prestataire ni à l'auteur de
    // l'avis, voir le commentaire d'en-tête ci-dessus) — évite un lookup
    // User supplémentaire à chaque affichage de la file de modération.
    reporterName: { type: String, default: '' },
    reason: { type: String, required: true },
    details: { type: String, default: '' },
    status: { type: String, enum: ['open', 'dismissed', 'action_taken'], default: 'open' },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: null },
  },
  { timestamps: true }
)

reviewReportSchema.index({ reviewId: 1, reporterId: 1 }, { unique: true })

export type ReviewReportDoc = InferSchemaType<typeof reviewReportSchema>
export type ReviewReportModel = Model<ReviewReportDoc>

export default (models.ReviewReport as ReviewReportModel) || model<ReviewReportDoc>('ReviewReport', reviewReportSchema)
