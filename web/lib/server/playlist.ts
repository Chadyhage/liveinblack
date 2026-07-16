import crypto from 'node:crypto'
import mongoose, { type HydratedDocument } from 'mongoose'
import { getDb } from '../db/mongoose'
import Event, { type EventDoc } from '../models/Event'
import EventStaff from '../models/EventStaff'
import EventPlaylist, { type EventPlaylistDoc, type PlaylistSong } from '../models/EventPlaylist'
import Ticket from '../models/Ticket'
import User from '../models/User'

// Port de src/components/PlaylistSystem.jsx + PlaylistDJPanel.jsx vers un
// modèle serveur-only. Ferme l'audit H16 (firestore.rules:367-385 laissait
// n'importe quel compte connecté modifier songs/statuts/votes — seul
// `nowPlaying` était protégé) : ici, AUCUNE écriture client directe n'existe,
// toute mutation ci-dessous revérifie l'autorisation réelle de l'appelant
// depuis la base, jamais depuis un flag/rôle fourni par le client.
//
// Deux durcissements délibérés par rapport au legacy (cf. prompt de cette
// phase, ne pas re-débattre) :
//   1. les quotas (1 son/billet, 5 likes/événement) étaient de simples
//      compteurs localStorage côté client — sans valeur face à un appel API
//      direct. Ici, les deux quotas sont recomptés à chaque appel depuis de
//      VRAIES lectures Mongo (tickets, songs.addedBy, songs.likedBy).
//   2. le remboursement du budget de likes quand un son est refusé (déjà le
//      comportement legacy, cf. PlaylistSystem.jsx "refund") est implémenté
//      en EXCLUANT les chansons `status:'refused'` du calcul du budget
//      dépensé, plutôt qu'en mutant `likedBy` à la refus — l'historique des
//      likes reste intact, seul le calcul du budget change.

export interface PlaylistCaller {
  id: string
  roles: string[]
}

type ErrResult = { ok: false; status: number; error: string }

export type StaffRoster = Record<string, { role: string }>

// ─────────────────────────── canModeratePlaylist ────────────────────────────

// Règle d'autorisation DJ, volontairement DIFFÉRENTE de l'échelle de rang de
// lib/server/eventOrders.ts (resolveRank : manager:3, serveur:2, scan:1,
// dj/absent:0 — pensée pour la commande sur place, pas pour la playlist).
// Ici, on reprend exactement `canDJ = (role) => role === 'dj' || role ===
// 'manager'` du legacy (PlaylistDJPanel.jsx) : propriétaire de l'événement OU
// agent (bypass total, comme ticketCheckin.ts) OU rôle roster EXACTEMENT
// 'dj' ou 'manager'. 'serveur' et 'scan' n'ont PAS la main sur la playlist,
// contrairement à la commande sur place où ils ont rang ≥ 1.
export function canModeratePlaylist(
  callerId: string,
  callerRoles: string[],
  event: Pick<EventDoc, 'organizerId' | 'createdBy'>,
  staffRoster: StaffRoster | undefined
): boolean {
  const isOwner = event.organizerId === callerId || event.createdBy === callerId
  if (isOwner) return true
  if (callerRoles.includes('agent')) return true
  const role = staffRoster?.[callerId]?.role
  return role === 'dj' || role === 'manager'
}

// ─────────────────────────── hasEventParticipation ──────────────────────────

export interface EventParticipation {
  ticketCount: number
  hasCheckedIn: boolean
}

// Gating d'ajout de son (mirrors PlaylistSystem.jsx "Conditions pour proposer
// un son") : il faut à la fois AU MOINS un billet non révoqué pour cet
// événement, ET qu'au moins un de ces billets ait été scanné à l'entrée
// (`checkedInAt` posé par lib/server/ticketCheckin.ts). Deux comptages
// distincts plutôt qu'un `.find()` : `countDocuments` reste bon marché même
// si un compte détient de nombreux billets (place de groupe).
export async function hasEventParticipation(callerId: string, eventId: string): Promise<EventParticipation> {
  const [ticketCount, checkedInCount] = await Promise.all([
    Ticket.countDocuments({ userId: callerId, eventId, revoked: { $ne: true } }),
    Ticket.countDocuments({ userId: callerId, eventId, revoked: { $ne: true }, checkedInAt: { $ne: null } }),
  ])
  return { ticketCount, hasCheckedIn: checkedInCount > 0 }
}

// ──────────────────────────────── vues / utils ──────────────────────────────

export interface PlaylistSongView {
  id: string
  title: string
  artist: string
  previewUrl: string | null
  cover: string | null
  addedBy: string
  addedByName: string
  likedBy: string[]
  status: 'pending' | 'validated' | 'refused' | 'played'
}

function toSongView(song: PlaylistSong): PlaylistSongView {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist ?? '',
    previewUrl: song.previewUrl ?? null,
    cover: song.cover ?? null,
    addedBy: song.addedBy,
    addedByName: song.addedByName ?? '',
    likedBy: song.likedBy ?? [],
    status: (song.status ?? 'pending') as PlaylistSongView['status'],
  }
}

async function resolveCallerName(callerId: string): Promise<string> {
  const user = await User.findById(callerId).lean()
  if (!user) return ''
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
}

// Même pattern que `getOrCreateOrder` (lib/server/eventOrders.ts) : upsert
// atomique DANS la transaction, pour que la lecture qui suit voie l'état
// fraîchement créé sans un second aller-retour.
async function getOrCreatePlaylist(eventId: string, session: mongoose.ClientSession): Promise<HydratedDocument<EventPlaylistDoc>> {
  const playlist = await EventPlaylist.findOneAndUpdate(
    { eventId },
    { $setOnInsert: { eventId, songs: [], nowPlaying: null } },
    { upsert: true, new: true, session }
  )
  return playlist as HydratedDocument<EventPlaylistDoc>
}

// Charge l'Event + le roster EventStaff nécessaires à `canModeratePlaylist`.
// `event: null` si l'événement n'existe pas — reproduit le 404 event_not_found
// AVANT toute décision d'autorisation, comme `loadEventContext` dans
// eventOrders.ts (même si le bypass agent, lui, ne dépend structurellement pas
// de l'événement — on garde un ordre de vérification unique et prévisible).
async function loadEventAndRoster(eventId: string): Promise<{ event: HydratedDocument<EventDoc> | null; roster: StaffRoster | undefined }> {
  const event = await Event.findById(eventId)
  if (!event) return { event: null, roster: undefined }
  const staffDoc = await EventStaff.findOne({ eventId }).lean()
  const roster = staffDoc?.roster as StaffRoster | undefined
  return { event, roster }
}

function countMySpentLikes(songs: PlaylistSong[], callerId: string): number {
  // EXCLUT les chansons refusées : c'est tout le mécanisme de remboursement
  // (voir commentaire d'en-tête) — un like sur un son refusé n'est plus
  // compté contre le budget, sans jamais toucher à `likedBy` lui-même.
  return songs.filter((s) => s.status !== 'refused' && (s.likedBy ?? []).includes(callerId)).length
}

const LIKE_BUDGET = 5

// ──────────────────────────────── searchSongs ───────────────────────────────

export interface SearchSongView {
  title: string
  artist: string
  previewUrl: string | null
  cover: string | null
}

export type SearchSongsResult = ErrResult | { ok: true; results: SearchSongView[] }

interface ItunesTrack {
  trackName?: string
  artistName?: string
  previewUrl?: string
  artworkUrl100?: string
}
interface ItunesSearchResponse {
  results?: ItunesTrack[]
}

// Proxy serveur de l'iTunes Search API (le legacy l'appelait directement
// depuis le navigateur — voir PlaylistSystem.jsx/PlaylistDJPanel.jsx
// `handleSearch`/`doSearch`). Ce port garde la cohérence "aucun appel externe
// direct depuis le client" de toute la migration, même si l'API iTunes
// elle-même ne demande aucune authentification. `caller` n'est pas utilisé
// ici : l'authentification (session.user existe) est déjà vérifiée par le
// route handler avant l'appel, cette fonction n'a rien de plus à revérifier.
export async function searchSongs(_caller: PlaylistCaller, input: { query: string }): Promise<SearchSongsResult> {
  const query = input.query?.trim()
  if (!query || query.length > 200) return { ok: false, status: 400, error: 'invalid_query' }

  let payload: ItunesSearchResponse
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=8`)
    if (!res.ok) return { ok: false, status: 502, error: 'search_unavailable' }
    payload = (await res.json()) as ItunesSearchResponse
  } catch {
    return { ok: false, status: 502, error: 'search_unavailable' }
  }

  // On extrait UNIQUEMENT les champs utiles (jamais le payload iTunes brut) :
  // trackName/artistName/previewUrl/artworkUrl100 sont les noms de champs
  // réels de l'iTunes Search API. `artworkUrl100` est repris tel quel (le
  // legacy remontait en 200x200 par remplacement de chaîne sur artworkUrl60 —
  // détail d'affichage, pas une exigence fonctionnelle de ce port serveur).
  const results: SearchSongView[] = (payload.results ?? [])
    .filter((t) => Boolean(t.trackName))
    .map((t) => ({
      title: t.trackName as string,
      artist: t.artistName ?? '',
      previewUrl: t.previewUrl ?? null,
      cover: t.artworkUrl100 ?? null,
    }))

  return { ok: true, results }
}

// ────────────────────────────────── addSong ─────────────────────────────────

export interface AddSongInput {
  eventId: string
  title: string
  artist?: string
  previewUrl?: string | null
  cover?: string | null
}

export type AddSongResult = ErrResult | { ok: true; song: PlaylistSongView }

export async function addSong(caller: PlaylistCaller, input: AddSongInput): Promise<AddSongResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  if (!eventId) return { ok: false, status: 400, error: 'invalid_input' }
  const title = input.title?.trim()
  if (!title || title.length > 200) return { ok: false, status: 400, error: 'title_required' }

  // Gating participation : au moins un billet non révoqué ET au moins un
  // check-in réel (mirrors PlaylistSystem.jsx "Conditions pour proposer un
  // son") — un seul code d'erreur pour les deux cas, la distinction n'apporte
  // rien côté client (les deux cartes de condition s'affichent déjà via
  // getPlaylist.isCheckedIn/ticketCount, pas via ce code d'erreur).
  const { ticketCount, hasCheckedIn } = await hasEventParticipation(caller.id, eventId)
  if (ticketCount === 0 || !hasCheckedIn) return { ok: false, status: 403, error: 'not_checked_in' }

  const normalizedTitle = title.toLowerCase()

  // Pré-vérifications (rejet rapide, hors transaction) — la re-vérification
  // AUTORITATIVE se fait sur l'état frais DANS la transaction ci-dessous, pour
  // fermer la course check-then-act entre deux appels concurrents du même
  // utilisateur (cf. test de concurrence).
  const preCheck = await EventPlaylist.findOne({ eventId }).lean()
  const preSongs = preCheck?.songs ?? []
  const preRemaining = ticketCount - preSongs.filter((s) => s.addedBy === caller.id).length
  if (preRemaining <= 0) return { ok: false, status: 403, error: 'quota_exceeded' }
  if (preSongs.some((s) => s.title.toLowerCase() === normalizedTitle)) {
    return { ok: false, status: 400, error: 'duplicate_song' }
  }

  const addedByName = await resolveCallerName(caller.id)
  const songId = crypto.randomBytes(12).toString('hex')

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'created'; song: PlaylistSong }

  const session = await mongoose.startSession()
  let outcome: Outcome
  try {
    outcome = await session.withTransaction(async (): Promise<Outcome> => {
      const doc = await getOrCreatePlaylist(eventId, session)

      // RE-CHECK sur l'état FRAIS lu dans cette même transaction : ferme la
      // course check-then-act — si deux appels concurrents du même appelant
      // n'avaient qu'1 place restante, `withTransaction` retente celui des
      // deux qui perd le conflit d'écriture Mongo ; à la reprise, il relit ce
      // `doc` déjà mis à jour par le premier et voit `freshRemaining <= 0`.
      //
      // `ticketCount` lui-même est RE-INTERROGÉ ici (liée à `session`) plutôt
      // que réutilisé depuis la fermeture calculée par `hasEventParticipation`
      // avant l'ouverture de la transaction : si un billet est révoqué/remboursé
      // pendant que cet appel est en vol (ex. un remboursement traité par une
      // autre requête), le nombre capturé avant transaction serait obsolète.
      // Seul le côté "chansons déjà ajoutées" (`doc.songs`) était déjà relu
      // depuis l'état transactionnel ; le côté "billets détenus" doit l'être
      // tout autant pour que la re-vérification soit intégralement fraîche.
      const freshTicketCount = await Ticket.countDocuments({ userId: caller.id, eventId, revoked: { $ne: true } }).session(session)
      const freshRemaining = freshTicketCount - doc.songs.filter((s) => s.addedBy === caller.id).length
      if (freshRemaining <= 0) return { kind: 'error', status: 403, error: 'quota_exceeded' }
      if (doc.songs.some((s) => s.title.toLowerCase() === normalizedTitle)) {
        return { kind: 'error', status: 400, error: 'duplicate_song' }
      }

      doc.songs.push({
        id: songId,
        title,
        artist: input.artist?.trim() ?? '',
        previewUrl: input.previewUrl ?? null,
        cover: input.cover ?? null,
        addedBy: caller.id,
        addedByName,
        likedBy: [],
        status: 'pending',
      })
      await doc.save({ session })
      return { kind: 'created', song: doc.songs[doc.songs.length - 1] }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  return { ok: true, song: toSongView(outcome.song) }
}

// ─────────────────────────────── addSongAsDj ────────────────────────────────

export async function addSongAsDj(caller: PlaylistCaller, input: AddSongInput): Promise<AddSongResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  if (!eventId) return { ok: false, status: 400, error: 'invalid_input' }
  const title = input.title?.trim()
  if (!title || title.length > 200) return { ok: false, status: 400, error: 'title_required' }

  const { event, roster } = await loadEventAndRoster(eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  if (!canModeratePlaylist(caller.id, caller.roles, event, roster)) return { ok: false, status: 403, error: 'staff_only' }

  const normalizedTitle = title.toLowerCase()
  const addedByName = await resolveCallerName(caller.id)
  const songId = crypto.randomBytes(12).toString('hex')

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'created'; song: PlaylistSong }

  const session = await mongoose.startSession()
  let outcome: Outcome
  try {
    outcome = await session.withTransaction(async (): Promise<Outcome> => {
      const doc = await getOrCreatePlaylist(eventId, session)
      if (doc.songs.some((s) => s.title.toLowerCase() === normalizedTitle)) {
        return { kind: 'error', status: 400, error: 'duplicate_song' }
      }
      // Auto-validé (mirrors PlaylistDJPanel.jsx addAsDJ : `status:'validated'`
      // dès l'ajout) — pas de file d'attente pour un ajout du DJ lui-même.
      doc.songs.push({
        id: songId,
        title,
        artist: input.artist?.trim() ?? '',
        previewUrl: input.previewUrl ?? null,
        cover: input.cover ?? null,
        addedBy: caller.id,
        addedByName,
        likedBy: [],
        status: 'validated',
      })
      await doc.save({ session })
      return { kind: 'created', song: doc.songs[doc.songs.length - 1] }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  return { ok: true, song: toSongView(outcome.song) }
}

// ─────────────────────────────── toggleLike ─────────────────────────────────

export type ToggleLikeResult = ErrResult | { ok: true; liked: boolean }

export async function toggleLike(caller: PlaylistCaller, input: { eventId: string; songId: string }): Promise<ToggleLikeResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  const songId = input.songId?.trim()
  if (!eventId || !songId) return { ok: false, status: 400, error: 'invalid_input' }

  const playlist = await EventPlaylist.findOne({ eventId }).lean()
  const song = playlist?.songs.find((s) => s.id === songId)
  if (!playlist || !song) return { ok: false, status: 404, error: 'playlist_not_found' }

  if (song.addedBy === caller.id) return { ok: false, status: 400, error: 'cannot_like_own_song' }

  const alreadyLiked = (song.likedBy ?? []).includes(caller.id)

  if (alreadyLiked) {
    // Retirer un like ne dépense jamais de budget : toujours permis, aucune
    // vérification de quota nécessaire. `$pull` scopé par le filtre positionnel
    // 'songs.id' — atomique, jamais de perte d'update concurrente.
    await EventPlaylist.updateOne({ eventId, 'songs.id': songId }, { $pull: { 'songs.$.likedBy': caller.id } })
    return { ok: true, liked: false }
  }

  // Budget de 5 likes / utilisateur / ÉVÉNEMENT ENTIER (pas par chanson),
  // recalculé depuis l'état réel des `likedBy` (jamais un compteur à part) et
  // EXCLUANT les chansons refusées (remboursement, voir commentaire d'en-tête
  // du fichier).
  //
  // TRADEOFF ACCEPTÉ ET DOCUMENTÉ : ce calcul est un read-then-write classique
  // (lecture de `playlist` ci-dessus, puis `$addToSet` plus bas) — deux clics
  // très rapprochés du MÊME utilisateur sur deux chansons différentes
  // pourraient tous deux lire un budget encore sous la limite et tous deux
  // passer, dépassant son propre budget d'une unité dans une fenêtre étroite.
  // Ce n'est PAS un problème d'intégrité cross-utilisateur (chaque `$addToSet`
  // par chanson reste atomique — deux likes concurrents de deux utilisateurs
  // DIFFÉRENTS sur le même son ne se perdent jamais) ni un problème de
  // sécurité : c'est une négligence d'équité auto-infligée par l'utilisateur
  // sur son propre budget, pas justifiée pour une réécriture transactionnelle
  // complète sur ce ticket.
  const spent = countMySpentLikes(playlist.songs, caller.id)
  if (spent >= LIKE_BUDGET) return { ok: false, status: 403, error: 'like_quota_exceeded' }

  await EventPlaylist.updateOne({ eventId, 'songs.id': songId }, { $addToSet: { 'songs.$.likedBy': caller.id } })
  return { ok: true, liked: true }
}

// ────────────────────────────── setSongStatus ───────────────────────────────

const SONG_STATUSES = ['pending', 'validated', 'refused', 'played'] as const
type SongStatus = (typeof SONG_STATUSES)[number]

export type SetSongStatusResult = ErrResult | { ok: true }

export async function setSongStatus(
  caller: PlaylistCaller,
  input: { eventId: string; songId: string; status: string }
): Promise<SetSongStatusResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  const songId = input.songId?.trim()
  if (!eventId || !songId) return { ok: false, status: 400, error: 'invalid_input' }
  if (!SONG_STATUSES.includes(input.status as SongStatus)) return { ok: false, status: 400, error: 'invalid_status' }

  const { event, roster } = await loadEventAndRoster(eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  if (!canModeratePlaylist(caller.id, caller.roles, event, roster)) return { ok: false, status: 403, error: 'staff_only' }

  const result = await EventPlaylist.updateOne({ eventId, 'songs.id': songId }, { $set: { 'songs.$.status': input.status } })
  if (result.matchedCount === 0) return { ok: false, status: 404, error: 'song_not_found' }

  return { ok: true }
}

// ─────────────────────────────── removeSong ─────────────────────────────────

export type RemoveSongResult = ErrResult | { ok: true }

export async function removeSong(caller: PlaylistCaller, input: { eventId: string; songId: string }): Promise<RemoveSongResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  const songId = input.songId?.trim()
  if (!eventId || !songId) return { ok: false, status: 400, error: 'invalid_input' }

  const { event, roster } = await loadEventAndRoster(eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  if (!canModeratePlaylist(caller.id, caller.roles, event, roster)) return { ok: false, status: 403, error: 'staff_only' }

  // `modifiedCount` (pas `matchedCount`) : le filtre top-level `{ eventId }`
  // matche dès que le document playlist existe, que `songId` y soit ou non —
  // seul `modifiedCount === 0` prouve qu'aucun élément du tableau `songs` n'a
  // été retiré (songId d'un autre événement, déjà supprimé, ou bogus). Sans
  // cette vérification l'appel renvoyait `ok:true` silencieusement même sans
  // suppression réelle (cf. setSongStatus ci-dessus qui, lui, vérifie déjà
  // `matchedCount` — pertinent dans son cas car son filtre inclut `songs.id`).
  const result = await EventPlaylist.updateOne({ eventId }, { $pull: { songs: { id: songId } } })
  if (result.modifiedCount === 0) return { ok: false, status: 404, error: 'song_not_found' }
  return { ok: true }
}

// ──────────────────────────────── playNow ───────────────────────────────────

export type PlayNowResult = ErrResult | { ok: true }

export async function playNow(caller: PlaylistCaller, input: { eventId: string; songId: string }): Promise<PlayNowResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  const songId = input.songId?.trim()
  if (!eventId || !songId) return { ok: false, status: 400, error: 'invalid_input' }

  const { event, roster } = await loadEventAndRoster(eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  if (!canModeratePlaylist(caller.id, caller.roles, event, roster)) return { ok: false, status: 403, error: 'staff_only' }

  const playlist = await EventPlaylist.findOne({ eventId }).lean()
  const song = playlist?.songs.find((s) => s.id === songId)
  if (!song) return { ok: false, status: 404, error: 'song_not_found' }

  // Ne touche PAS `song.status` : marquer "joué" est une action explicite et
  // séparée (setSongStatus), voir commentaire du modèle nowPlaying.
  await EventPlaylist.updateOne(
    { eventId },
    { $set: { nowPlaying: { id: song.id, title: song.title, artist: song.artist ?? '', cover: song.cover ?? null, at: new Date() } } },
    { upsert: true }
  )
  return { ok: true }
}

// ──────────────────────────────── stopNow ───────────────────────────────────

export type StopNowResult = ErrResult | { ok: true }

export async function stopNow(caller: PlaylistCaller, input: { eventId: string }): Promise<StopNowResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  if (!eventId) return { ok: false, status: 400, error: 'invalid_input' }

  const { event, roster } = await loadEventAndRoster(eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  if (!canModeratePlaylist(caller.id, caller.roles, event, roster)) return { ok: false, status: 403, error: 'staff_only' }

  await EventPlaylist.updateOne({ eventId }, { $set: { nowPlaying: null } }, { upsert: true })
  return { ok: true }
}

// ─────────────────────────────── getPlaylist ────────────────────────────────

export interface NowPlayingView {
  id: string
  title: string
  artist: string
  cover: string | null
  at: string
}

export type GetPlaylistResult =
  | ErrResult
  | {
      ok: true
      songs: PlaylistSongView[]
      nowPlaying: NowPlayingView | null
      canModerate: boolean
      songsRemaining: number
      likesRemaining: number
      isCheckedIn: boolean
    }

// Vue en lecture seule — accessible à tout appelant AUTHENTIFIÉ, sans gating
// de participation (mirrors l'onglet Playlist public de la page événement).
// Seuls l'ajout et le like exigent une participation ; ce endpoint calcule
// juste le contexte que le client afficherait sinon en plusieurs allers-retours.
export async function getPlaylist(caller: PlaylistCaller, input: { eventId: string }): Promise<GetPlaylistResult> {
  await getDb()

  const eventId = input.eventId?.trim()
  if (!eventId) return { ok: false, status: 400, error: 'invalid_input' }

  const { event, roster } = await loadEventAndRoster(eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }

  const playlist = await EventPlaylist.findOne({ eventId }).lean()
  const songs = playlist?.songs ?? []

  const canModerate = canModeratePlaylist(caller.id, caller.roles, event, roster)
  const { ticketCount, hasCheckedIn } = await hasEventParticipation(caller.id, eventId)

  const mySongsCount = songs.filter((s) => s.addedBy === caller.id).length
  const songsRemaining = Math.max(0, ticketCount - mySongsCount)

  const mySpentLikes = countMySpentLikes(songs, caller.id)
  const likesRemaining = Math.max(0, LIKE_BUDGET - mySpentLikes)

  const nowPlaying: NowPlayingView | null = playlist?.nowPlaying
    ? {
        id: playlist.nowPlaying.id,
        title: playlist.nowPlaying.title,
        artist: playlist.nowPlaying.artist ?? '',
        cover: playlist.nowPlaying.cover ?? null,
        at: new Date(playlist.nowPlaying.at).toISOString(),
      }
    : null

  return {
    ok: true,
    songs: songs.map((s) => toSongView(s as PlaylistSong)),
    nowPlaying,
    canModerate,
    songsRemaining,
    likesRemaining,
    isCheckedIn: hasCheckedIn,
  }
}
