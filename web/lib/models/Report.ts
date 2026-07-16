import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `reports/{id}` (Firestore). Signalement au niveau UTILISATEUR
// uniquement, fidèle au legacy (aucune fonction de signalement de message
// n'existait — on ne l'invente pas ici, hors périmètre de cette migration).
const reportSchema = new Schema(
  {
    fromId: { type: String, required: true, index: true },
    fromName: { type: String, default: '' },
    targetId: { type: String, required: true, index: true },
    targetName: { type: String, default: '' },
    reason: { type: String, required: true },
  },
  { timestamps: true }
)

export type ReportDoc = InferSchemaType<typeof reportSchema>
export type ReportModel = Model<ReportDoc>

export default (models.Report as ReportModel) || model<ReportDoc>('Report', reportSchema)
