import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `providers/{uid}` + `catalogs/{uid}` (Firestore). Les deux docs
// legacy sont toujours lus/écrits ensemble (une page profil prestataire) —
// regroupés ici en un seul document Mongo (simplification, pas de changement
// de comportement : plus besoin d'une jointure pour rendre une page profil).
const socialLinksSchema = new Schema(
  {
    instagram: { type: String, default: '' },
    tiktok: { type: String, default: '' },
    facebook: { type: String, default: '' },
    x: { type: String, default: '' },
    youtube: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    website: { type: String, default: '' },
  },
  { _id: false }
)

const catalogItemMediaSchema = new Schema(
  {
    url: { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], default: 'image' },
  },
  { _id: false }
)

const catalogItemSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, default: null },
    currency: { type: String, enum: ['EUR', 'XOF'], default: 'EUR' },
    unit: { type: String, default: '' }, // '', 'heure', 'soirée', 'jour', 'personne', 'unité', 'lot', 'forfait'
    category: { type: String, default: '' },
    available: { type: Boolean, default: true },
    media: { type: [catalogItemMediaSchema], default: [] },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
)

const providerProfileSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    headline: { type: String, default: '' },
    description: { type: String, default: '' },

    city: { type: String, default: '' },
    location: { type: String, default: '' }, // alias legacy de city
    regionId: { type: String, default: '' },
    country: { type: String, default: '' },
    zonesIntervention: { type: [String], default: [] },

    website: { type: String, default: '' },
    socialLinks: { type: socialLinksSchema, default: () => ({}) },

    photoUrl: { type: String, default: null },
    coverUrl: { type: String, default: null },

    prestataireType: { type: String, default: 'autre' },
    prestataireTypes: { type: [String], default: [] },

    phone: { type: String, default: '' },
    catalogCurrency: { type: String, enum: ['EUR', 'XOF'], default: 'EUR' },

    // Gate de visibilité publique — un profil n'apparaît dans l'annuaire ou par
    // URL directe que si subscriptionActive === true (sauf agent ou owner).
    subscriptionActive: { type: Boolean, default: false },

    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    catalog: { type: [catalogItemSchema], default: [] },
  },
  { timestamps: true }
)

providerProfileSchema.index({ name: 'text', description: 'text', city: 'text' })

export type ProviderProfileDoc = InferSchemaType<typeof providerProfileSchema>
export type ProviderProfileModel = Model<ProviderProfileDoc>

export default (models.ProviderProfile as ProviderProfileModel) || model<ProviderProfileDoc>('ProviderProfile', providerProfileSchema)
