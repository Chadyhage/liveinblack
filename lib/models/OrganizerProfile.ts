import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `organizer_profiles/{uid}` (Firestore). Écrit par OrganizerPublicStudio
// (édition — phase organisateur ultérieure) ; lu ici en phase 2 (annuaire +
// page publique). Seuls les profils status:'public' apparaissent publiquement.
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

const mediaItemSchema = new Schema(
  {
    id: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], default: 'image' },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    eventId: { type: String, default: null },
    visibility: { type: String, enum: ['public', 'hidden'], default: 'public' },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false }
)

const organizerProfileSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    publicName: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    shortDescription: { type: String, default: '' },
    longDescription: { type: String, default: '' },

    city: { type: String, default: '' },
    country: { type: String, default: '' },
    regionId: { type: String, default: '' },

    avatarUrl: { type: String, default: null },
    bannerUrl: { type: String, default: null },

    status: { type: String, enum: ['draft', 'public', 'hidden', 'suspended', 'pending_review'], default: 'draft' },
    isVerified: { type: Boolean, default: false },

    socialLinks: { type: socialLinksSchema, default: () => ({}) },
    zonesIntervention: { type: [String], default: [] },

    followersCount: { type: Number, default: 0 },
    totalEventsCount: { type: Number, default: 0 },
    viewsCount: { type: Number, default: 0 },
    eventClicksCount: { type: Number, default: 0 },
    mediaViewsCount: { type: Number, default: 0 },

    media: { type: [mediaItemSchema], default: [] },
    proPhone: { type: String, default: '' },
  },
  { timestamps: true }
)

organizerProfileSchema.index({ publicName: 'text', shortDescription: 'text', city: 'text' })

export type OrganizerProfileDoc = InferSchemaType<typeof organizerProfileSchema>
export type OrganizerProfileModel = Model<OrganizerProfileDoc>

export default (models.OrganizerProfile as OrganizerProfileModel) || model<OrganizerProfileDoc>('OrganizerProfile', organizerProfileSchema)
