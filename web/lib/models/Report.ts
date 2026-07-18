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
    // Revue agent (#9 phase agent/admin, tâche #103) — absent du legacy
    // (localStorage stockait `handled`/`handledAt` directement sur l'entrée,
    // voir src/pages/AgentPage.jsx resolveReport). handledBy/handledNote sont
    // de nouveaux champs, jamais présents côté legacy, pour tracer QUI a
    // traité le signalement et avec quel commentaire interne — cohérent avec
    // adminNote sur Application (lib/models/Application.ts).
    handled: { type: Boolean, default: false, index: true },
    handledAt: { type: Date, default: null },
    handledBy: { type: String, default: '' },
    handledNote: { type: String, default: '' },
  },
  { timestamps: true }
)

export type ReportDoc = InferSchemaType<typeof reportSchema>
export type ReportModel = Model<ReportDoc>

export default (models.Report as ReportModel) || model<ReportDoc>('Report', reportSchema)
