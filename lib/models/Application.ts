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
    // `url` ne sert qu'aux anciens documents publics. Les nouveaux fichiers
    // sont des assets Cloudinary `authenticated` décrits par les champs
    // ci-dessous et servis via une route d'accès contrôlée.
    url: { type: String, default: '' },
    publicId: { type: String, default: null },
    format: { type: String, default: null },
    resourceType: { type: String, enum: ['image', 'raw'], default: null },
    deliveryType: { type: String, enum: ['upload', 'authenticated'], default: null },
    version: { type: Number, default: null },
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

// Purge automatique (RGPD — minimisation des données) des dossiers ABANDONNÉS
// UNIQUEMENT — deux index TTL PARTIELS, chacun scopé à un seul statut via
// partialFilterExpression (réévalué par le moniteur TTL contre l'état ACTUEL
// du document à chaque passage, jamais figé à l'insertion — un brouillon
// soumis ou un dossier réexaminé sort donc automatiquement du filtre avant
// suppression). Jamais 'pending'/'under_review'/'needs_changes'/
// 'resubmitted'/'approved'/'suspended'.
//   - 'draft' : jamais soumis, purgé 180 jours après la dernière modification
//     (`updatedAt`, mis à jour à chaque sauvegarde de brouillon) — délai
//     court car aucune relation de candidature n'existe encore tant que rien
//     n'est soumis (cf. commentaire en tête de fichier).
//   - 'rejected' : purgé 5 ans après le refus (`rejectedAt`) — aligné sur la
//     durée annoncée dans la politique de confidentialité publique
//     ("Documents de candidature : 5 ans après refus ou désactivation",
//     app/(public)/privacy/page.tsx) ; ne pas modifier l'un sans l'autre.
applicationSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 180, partialFilterExpression: { status: 'draft' } }
)
applicationSchema.index(
  { rejectedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 365 * 5, partialFilterExpression: { status: 'rejected' } }
)

export type ApplicationDoc = InferSchemaType<typeof applicationSchema>
export type ApplicationModel = Model<ApplicationDoc>

export default (models.Application as ApplicationModel) || model<ApplicationDoc>('Application', applicationSchema)
