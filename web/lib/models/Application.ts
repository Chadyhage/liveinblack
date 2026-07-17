import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `applications/{id}` (Firestore) — dossier de candidature
// organisateur/prestataire (#7 phase organisateur, port de
// src/utils/applications.js). Contrairement au legacy, il n'existe PAS de
// "brouillon anonyme" persisté côté serveur avant la création du compte :
// le legacy gardait un brouillon anonyme en localStorage uniquement (jamais
// en Firestore) précisément pour ne créer aucun "compte fantôme" avant la
// soumission finale — voir lib/server/applications.ts, qui reproduit cette
// même règle (le document Application n'existe qu'à partir du moment où un
// User existe réellement, anonyme ou déjà connecté).
const STATUSES = ['draft', 'submitted', 'under_review', 'needs_changes', 'resubmitted', 'approved', 'rejected', 'suspended'] as const
const TYPES = ['organisateur', 'prestataire'] as const

const documentEntrySchema = new Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: null },
  },
  { _id: false }
)

const auditLogEntrySchema = new Schema(
  {
    action: { type: String, required: true },
    by: { type: String, required: true },
    byName: { type: String, default: '' },
    at: { type: Date, required: true },
    note: { type: String, default: '' },
  },
  { _id: false }
)

const applicationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    type: { type: String, enum: TYPES, required: true },
    status: { type: String, enum: STATUSES, default: 'draft' },
    // Forme libre — les champs varient entre organisateur/prestataire et
    // évoluent avec le formulaire ; validée à l'entrée par le serveur (zod),
    // jamais par le schéma Mongoose lui-même (cf. lib/server/applications.ts).
    formData: { type: Schema.Types.Mixed, default: {} },
    // { [docKey]: DocumentEntry[] } — ex. { identity: [...], business_doc: [...] }
    documents: { type: Map, of: [documentEntrySchema], default: {} },
    auditLog: { type: [auditLogEntrySchema], default: [] },
    // Note interne (jamais renvoyée au candidat) vs. requestedChanges/
    // rejectionReason (toujours montrées verbatim au candidat sur
    // /mon-dossier) — séparation intentionnelle, à ne jamais fusionner.
    adminNote: { type: String, default: '' },
    requestedChanges: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    candidateNote: { type: String, default: '' },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Un seul dossier par (utilisateur, type) — resoumettre après un refus
// réutilise le même document plutôt que d'en créer un nouveau (même défaut
// que le legacy, cf. lib/server/applications.ts pour la discussion du cas
// "candidature après rejet").
applicationSchema.index({ userId: 1, type: 1 }, { unique: true })

export type ApplicationDoc = InferSchemaType<typeof applicationSchema>
export type ApplicationModel = Model<ApplicationDoc>

export default (models.Application as ApplicationModel) || model<ApplicationDoc>('Application', applicationSchema)
