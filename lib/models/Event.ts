import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace la collection Firestore `events` (un doc par événement, shape
// confirmée par le payload de création/édition de MesEvenementsPage.jsx côté
// legacy). SÉCURITÉ (audit C01) : `privateCode` a `select: false` — jamais
// renvoyé par une requête Mongoose par défaut, il faut explicitement
// `.select('+privateCode')`. Aucune route de lecture publique ne doit faire
// ça ; seule la route de déverrouillage (POST /api/events/[id]/unlock)
// compare le code, jamais ne le retourne au client.

const placeSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    price: { type: Number, default: 0 },
    available: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    icon: { type: String, default: '' },
    maxPerAccount: { type: Number, default: 0 },
    groupType: { type: String, enum: ['solo', 'group'], default: 'solo' },
    groupMin: { type: Number, default: 0 },
    groupMax: { type: Number, default: 0 },
    photos: { type: [String], default: [] },
    included: {
      type: [{ name: { type: String, required: true }, qty: { type: Number, default: 1 } }],
      default: [],
    },
  },
  { _id: false }
)

const menuItemSchema = new Schema(
  {
    name: { type: String, required: true },
    emoji: { type: String, default: '' },
    imageUrl: { type: String, default: null },
    price: { type: Number, default: 0 },
    category: { type: String, default: 'Boissons' },
    description: { type: String, default: '' },
    hasShow: { type: Boolean, default: false },
    showOptions: { type: [String], default: [] },
    excludedPlaces: { type: [String], default: [] },
  },
  { _id: false }
)

const artistSchema = new Schema(
  {
    name: { type: String, required: true },
    role: { type: String, default: 'DJ' },
  },
  { _id: false }
)

const eventSchema = new Schema(
  {
    name: { type: String, required: true },
    subtitle: { type: String, default: '' },
    description: { type: String, default: '' },
    category: { type: String, default: '' },
    tags: { type: [String], default: [] },

    eventType: { type: String, default: '' },
    musicStyles: { type: [String], default: [] },
    ambiances: { type: [String], default: [] },

    date: { type: String, required: true }, // 'YYYY-MM-DD'
    dateDisplay: { type: String, default: '' }, // ex: "SAM 18 AVR 2026", dérivé de `date` à la création
    time: { type: String, default: '22:00' }, // 'HH:MM'
    endTime: { type: String, default: '05:00' },
    publishAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    closingDate: { type: Date, default: null },
    cancelled: { type: Boolean, default: false },
    // Message affiché aux détenteurs de billets sur leur billet/le mail
    // d'annulation (#7 phase organisateur, port de cancelEventWithMessage) —
    // jamais affiché ailleurs que sur les billets DE CET événement.
    cancellationMessage: { type: String, default: '' },
    cancelledAt: { type: Date, default: null },
    // Report (#7 phase organisateur, port de postpone_event) — conserve la
    // date/heure D'ORIGINE pour affichage ("reporté depuis...") pendant que
    // `date`/`time` ci-dessus portent la NOUVELLE date ; les billets déjà
    // vendus restent valables, aucun remboursement.
    postponedFrom: {
      type: new Schema({ date: { type: String, required: true }, time: { type: String, default: '' } }, { _id: false }),
      default: null,
    },

    location: { type: String, default: '' },
    city: { type: String, default: '' },
    region: { type: String, default: '' }, // nom de région (regions.ts), pas un id

    currency: { type: String, enum: ['EUR', 'XOF'], default: 'EUR' },

    imageUrl: { type: String, default: null },
    videoUrl: { type: String, default: null },
    color: { type: String, default: '#c8a96e' },
    accentColor: { type: String, default: '#e8d49e' },

    places: { type: [placeSchema], default: [] },

    playlist: { type: Boolean, default: false },
    preorder: { type: Boolean, default: false },
    menu: { type: [menuItemSchema], default: null },

    featured: { type: Boolean, default: false },
    rating: { type: Number, default: 0 },
    attendees: { type: Number, default: 0 },

    artists: { type: [artistSchema], default: [] },
    dj: { type: String, default: '' },
    performers: { type: [String], default: [] },

    minAge: { type: Number, default: 18 },
    userCreated: { type: Boolean, default: true },
    isPrivate: { type: Boolean, default: false },
    // select:false = jamais renvoyé sauf .select('+privateCodeHash') explicite.
    // Stocké haché (pas en clair) — voir lib/server/events.ts pour la comparaison.
    privateCodeHash: { type: String, default: null, select: false },

    createdBy: { type: String, required: true, index: true },
    organizerId: { type: String, required: true, index: true },
    organizerName: { type: String, default: '' },
    organizer: { type: String, default: '' },
  },
  { timestamps: true }
)

eventSchema.index({ date: 1, cancelled: 1, isPrivate: 1 })
eventSchema.index({ name: 'text', city: 'text', category: 'text', subtitle: 'text', description: 'text' })

export type EventDoc = InferSchemaType<typeof eventSchema>
export type EventModel = Model<EventDoc>

export default (models.Event as EventModel) || model<EventDoc>('Event', eventSchema)
