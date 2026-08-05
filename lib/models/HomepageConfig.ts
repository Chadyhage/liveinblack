import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace le doc Firestore global `app_config/homepage_actualite` (règle :
// lecture publique, écriture agent-only) — port de src/utils/homepageConfig.js.
// SINGLETON : un seul document existe jamais pour cette collection, adressé
// par un `_id` fixe (même pattern que CronLock) plutôt que par un id généré,
// pour garantir qu'un seul « app_config/homepage_actualite » puisse exister.
export const HOMEPAGE_ACTUALITE_ID = 'homepage_actualite'

export const ACTUALITE_ACCENTS = ['teal', 'gold', 'pink'] as const
export type ActualiteAccent = (typeof ACTUALITE_ACCENTS)[number]

const homepageConfigSchema = new Schema(
  {
    _id: { type: String, required: true },
    active: { type: Boolean, default: false },
    title: { type: String, default: "L'actu du moment" },
    subtitle: { type: String, default: 'Les temps forts à ne pas manquer' },
    accent: { type: String, enum: ACTUALITE_ACCENTS, default: 'teal' },
    // Ordre curé, explicite — jamais de sélection automatique (voir legacy).
    eventIds: { type: [String], default: [] },
    updatedAt: { type: Date, default: null },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: false }
)

export type HomepageConfigDoc = InferSchemaType<typeof homepageConfigSchema>
export type HomepageConfigModel = Model<HomepageConfigDoc>

export default (models.HomepageConfig as HomepageConfigModel) || model<HomepageConfigDoc>('HomepageConfig', homepageConfigSchema)
