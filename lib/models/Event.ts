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
    available: { type: Boolean, default: true },
    hasShow: { type: Boolean, default: false },
    // Mixed conserve la compatibilité avec les premiers événements migrés
    // (`string[]`) et la forme riche actuelle ({id,label,requiresInfo,...}).
    // Toute lecture métier passe par normalizeShowOptions().
    showOptions: { type: [Schema.Types.Mixed], default: [] },
    excludedPlaces: { type: [String], default: [] },
  },
  { _id: false }
)

const artistSchema = new Schema(
  {
    name: { type: String, required: true },
    role: { type: String, default: 'DJ' },
    // Lien optionnel vers un vrai profil prestataire (ProviderProfile.userId
    // — id applicatif, jamais un ObjectId ref, cohérent avec le reste du
    // projet) — #E7, confirmé en réunion live le 11/08/2026. `name` reste la
    // source d'affichage même si lié (pré-rempli depuis le profil au moment
    // de l'association, jamais recalculé après coup si le prestataire
    // renomme son profil), pour ne jamais casser un line-up déjà publié.
    providerId: { type: String, default: null },
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
    // Anti-doublon du récap organisateur "c'est dans 2 jours" (voir
    // lib/server/organizerEvents.ts::sendEventRecapReminders) — jamais
    // réinitialisé, même en cas de report (un événement reporté aura une
    // nouvelle date, donc une nouvelle fenêtre J-2 pertinente ; réinitialisé
    // explicitement par postponeOrganizerEvent).
    recapEmailSentAt: { type: Date, default: null },
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
    // Fenêtre pendant laquelle un client peut demander le remboursement de son
    // billet suite à un report (lib/server/clientRefunds.ts) — fixée au moment
    // du report (postponeOrganizerEvent), jamais recalculée après coup. Passé
    // ce délai, le billet reste valable pour la nouvelle date sans possibilité
    // de remboursement (politique d'annulation/remboursement, §2).
    refundWindowClosesAt: { type: Date, default: null },

    location: { type: String, default: '' },
    city: { type: String, default: '' },
    region: { type: String, default: '' }, // nom de région (regions.ts), pas un id

    currency: { type: String, enum: ['EUR', 'XOF'], default: 'EUR' },

    imageUrl: { type: String, default: null },
    videoUrl: { type: String, default: null },
    color: { type: String, default: '#2a2a2f' },
    accentColor: { type: String, default: '#f53d8d' },

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
eventSchema.index({ organizerId: 1, cancelled: 1, date: 1, time: 1 })
eventSchema.index({ organizerId: 1, cancelled: 1, date: -1, publishAt: 1 })
eventSchema.index({ date: 1, cancelled: 1, category: 1, region: 1, isDemo: 1, publishAt: 1 })
eventSchema.index({ name: 'text', city: 'text', category: 'text', subtitle: 'text', description: 'text' })
eventSchema.index({ cancelled: 1, isDemo: 1, publishAt: 1, date: 1 })
eventSchema.index({ cancelled: 1, isDemo: 1, publishAt: 1, date: 1, category: 1, region: 1 })
eventSchema.index({ organizerId: 1, cancelled: 1, isDemo: 1, publishAt: 1, date: 1, closingDate: 1 })
eventSchema.index({ cancelled: 1, isDemo: 1, isPrivate: 1, publishAt: 1, date: 1, closingDate: 1 })
eventSchema.index({ isPrivate: 1, cancelled: 1, isDemo: 1, publishAt: 1, date: 1, closingDate: 1, organizerId: 1, time: 1 })

export type EventDoc = InferSchemaType<typeof eventSchema>
export type EventModel = Model<EventDoc>

export default (models.Event as EventModel) || model<EventDoc>('Event', eventSchema)
