import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace `event_playlists/{eventId}` (Firestore, un seul doc par
// événement — conservé tel quel, le volume de morceaux par soirée reste
// petit, contrairement aux commandes/messages). Ferme l'audit H16 : le
// legacy laissait N'IMPORTE QUEL compte connecté modifier `songs`/statuts/
// votes directement (seule l'écriture de `nowPlaying` était réservée aux
// règles Firestore) — ici, AUCUNE écriture client directe n'existe : tout
// passe par lib/server/playlist.ts, qui revérifie le rang DJ (owner/agent/
// roster dj|manager, même formule que lib/server/eventOrders.ts) côté
// serveur pour chaque action de modération.
const STATUSES = ['pending', 'validated', 'refused', 'played'] as const

const songSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    artist: { type: String, default: '' },
    previewUrl: { type: String, default: null },
    cover: { type: String, default: null },
    addedBy: { type: String, required: true },
    addedByName: { type: String, default: '' },
    // Liste (pas un compteur) — répond à la fois à "combien de likes" ET "qui
    // a liké", et permet un $addToSet/$pull atomique (jamais de race sur des
    // likes concurrents, contrairement à un compteur lu-puis-réécrit).
    likedBy: { type: [String], default: [] },
    status: { type: String, enum: STATUSES, default: 'pending' },
  },
  { _id: false }
)

const nowPlayingSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    artist: { type: String, default: '' },
    cover: { type: String, default: null },
    at: { type: Date, required: true },
  },
  { _id: false }
)

const eventPlaylistSchema = new Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  songs: { type: [songSchema], default: [] },
  nowPlaying: { type: nowPlayingSchema, default: null },
})

export type EventPlaylistDoc = InferSchemaType<typeof eventPlaylistSchema>
export type EventPlaylistModel = Model<EventPlaylistDoc>
export type PlaylistSong = EventPlaylistDoc['songs'][number]

export default (models.EventPlaylist as EventPlaylistModel) || model<EventPlaylistDoc>('EventPlaylist', eventPlaylistSchema)
