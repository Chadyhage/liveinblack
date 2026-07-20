'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface PlaylistSong {
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

interface NowPlaying {
  id: string
  title: string
  artist: string
  cover: string | null
  at: string
}

interface SearchResult {
  title: string
  artist: string
  previewUrl: string | null
  cover: string | null
  duration: string
}

export interface PlaylistClientProps {
  eventId: string
  eventName: string
  eventImage: string | null
  eventDateDisplay: string
  eventCity: string
  djName: string
  currentUserId: string
  initialSongs: PlaylistSong[]
  initialNowPlaying: NowPlaying | null
  initialCanModerate: boolean
  initialSongsRemaining: number
  initialLikesRemaining: number
  initialIsCheckedIn: boolean
  initialHasTicket: boolean
  initialTicketCount: number
}

// Palette figée du redesign 2026-07 (voir CLAUDE.md) — les compositions avec
// alpha (bordures/fonds teintés) ont besoin de la valeur hex brute, `var(--x)`
// ne peut pas recevoir de suffixe alpha concaténé.
const HEX = { teal: '#4ee8c8', gold: '#c8a96e', violet: '#8b5cf6', pink: '#e05aaa' }
const LIKE_BUDGET = 5

const ERROR_MESSAGES: Record<string, string> = {
  auth_required: 'Ta session a expiré — reconnecte-toi.',
  invalid_input: 'Requête invalide.',
  invalid_query: 'Recherche invalide.',
  search_unavailable: 'La recherche de titres est momentanément indisponible.',
  title_required: 'Titre requis.',
  not_checked_in: "Tu dois être scanné à l'entrée pour proposer un son.",
  quota_exceeded: 'Tu as déjà utilisé tous tes sons proposés pour cet événement.',
  duplicate_song: 'Ce titre est déjà dans la playlist.',
  staff_only: "Réservé au DJ/à l'équipe de cet événement.",
  invalid_status: 'Statut invalide.',
  song_not_found: 'Ce titre a déjà été retiré.',
  playlist_not_found: 'Playlist introuvable.',
  cannot_like_own_song: 'Tu ne peux pas liker ton propre son.',
  like_quota_exceeded: 'Tu as utilisé tes 5 likes pour cet événement.',
  event_not_found: 'Événement introuvable.',
  not_song_owner: "Tu ne peux retirer que tes propres sons.",
}

function errorMessageFor(code: string | undefined): string {
  if (!code) return 'Une erreur est survenue.'
  return ERROR_MESSAGES[code] ?? 'Une erreur est survenue.'
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, init)
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) return { ok: false, error: data?.error ?? 'unknown_error' }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

let toastSeq = 0

const STATUS_BADGE: Record<PlaylistSong['status'], { label: string; color: string } | null> = {
  pending: null,
  validated: { label: 'Validé', color: 'var(--teal)' },
  refused: { label: 'Refusé par le DJ', color: 'var(--pink)' },
  played: { label: 'Joué', color: 'var(--violet)' },
}

const STATUS_ACTION_LABEL: Record<PlaylistSong['status'], string> = {
  pending: 'Remis en attente',
  validated: 'Validé',
  refused: 'Refusé',
  played: 'Joué',
}

const DJ_FILTERS: { key: 'all' | PlaylistSong['status']; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'pending', label: 'Nouveaux' },
  { key: 'validated', label: 'À jouer' },
  { key: 'played', label: 'Joués' },
  { key: 'refused', label: 'Refusés' },
]

const PARTICIPANT_TABS: { key: 'top' | 'mine' | 'rules'; label: string }[] = [
  { key: 'top', label: 'Top playlist' },
  { key: 'mine', label: 'Mes sons' },
  { key: 'rules', label: 'Règles' },
]

// SVG icônes — ports directs de PlaylistSystem.jsx (mêmes tracés, sans les
// props de couleur configurable inutiles ici : la couleur vient du contexte).
function LockIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
    </svg>
  )
}
function TicketIcon({ done }: { done: boolean }) {
  if (done) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={HEX.teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.25)" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 10V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v4c1.1 0 2 .9 2 2s-.9 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-9 7.5h-2v-2h2v2zm0-4.5h-2v-2h2v2zm0-4.5h-2v-2h2v2z" />
    </svg>
  )
}
function ScanIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  )
}
function HeadphonesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={HEX.gold} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h1v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-2v8h1c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" />
    </svg>
  )
}
function MusicNoteIcon({ opacity = 0.3 }: { opacity?: number }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill={`rgba(255,255,255,${opacity})`} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  )
}
function HeartIcon({ filled, color }: { filled: boolean; color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}
// Mirrors PlaylistSystem.jsx SearchIcon (ligne 52) — glyphe idle affiché à
// droite du champ de recherche quand aucune requête n'est en vol.
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  )
}

function PlayPauseGlyph({ playing }: { playing: boolean }) {
  return <span style={{ fontSize: 11 }}>{playing ? '■' : '▶'}</span>
}

export default function PlaylistClient({
  eventId,
  eventName,
  eventImage,
  eventDateDisplay,
  eventCity,
  djName,
  currentUserId,
  initialSongs,
  initialNowPlaying,
  initialCanModerate,
  initialSongsRemaining,
  initialLikesRemaining,
  initialIsCheckedIn,
  initialHasTicket,
  initialTicketCount,
}: PlaylistClientProps) {
  const [songs, setSongs] = useState<PlaylistSong[]>(initialSongs)
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(initialNowPlaying)
  const [canModerate, setCanModerate] = useState(initialCanModerate)
  const [songsRemaining, setSongsRemaining] = useState(initialSongsRemaining)
  const [likesRemaining, setLikesRemaining] = useState(initialLikesRemaining)
  const [isCheckedIn, setIsCheckedIn] = useState(initialIsCheckedIn)
  const [hasTicket, setHasTicket] = useState(initialHasTicket)
  const [realTicketCount, setRealTicketCount] = useState(initialTicketCount)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [participantTab, setParticipantTab] = useState<'top' | 'mine' | 'rules'>('top')
  const [moderationTab, setModerationTab] = useState<'all' | PlaylistSong['status']>('all')
  const [djSort, setDjSort] = useState<'likes' | 'recent'>('likes')
  const [previewMode, setPreviewMode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: 'ok' | 'warn' }[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function pushToast(text: string, kind: 'ok' | 'warn' = 'warn') {
    const id = ++toastSeq
    setToasts((prev) => [...prev, { id, text, kind }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }

  useEffect(() => () => audioRef.current?.pause(), [])

  function togglePreviewAudio(key: string, url: string | null) {
    if (playingKey === key) {
      audioRef.current?.pause()
      setPlayingKey(null)
      return
    }
    audioRef.current?.pause()
    if (url) {
      audioRef.current = new Audio(url)
      audioRef.current.play().catch(() => {})
    }
    setPlayingKey(key)
  }

  const refreshPlaylist = useCallback(async () => {
    const res = await apiFetch<{
      songs: PlaylistSong[]
      nowPlaying: NowPlaying | null
      canModerate: boolean
      songsRemaining: number
      likesRemaining: number
      isCheckedIn: boolean
      hasTicket: boolean
      ticketCount: number
    }>(`/api/events/${eventId}/playlist`)
    if (!res.ok) return
    setSongs(res.data.songs)
    setNowPlaying(res.data.nowPlaying)
    setCanModerate(res.data.canModerate)
    setSongsRemaining(res.data.songsRemaining)
    setLikesRemaining(res.data.likesRemaining)
    setIsCheckedIn(res.data.isCheckedIn)
    setHasTicket(res.data.hasTicket)
    setRealTicketCount(res.data.ticketCount)
  }, [eventId])

  useEffect(() => {
    const timer = setInterval(refreshPlaylist, 5000)
    return () => clearInterval(timer)
  }, [refreshPlaylist])

  // "En ce moment" auto-masqué 30 min après avoir été posé (mirrors
  // PlaylistSystem.jsx ligne 536 / PlaylistDJPanel.jsx ligne 191) — le serveur
  // (getPlaylist) fait déjà l'unique filtrage qui compte : `nowPlaying` est
  // `null` dès que le polling suivant rafraîchit l'état, donc rien de plus à
  // recalculer ici (un `Date.now()` dans le corps du rendu serait impur).
  const effectiveCanModerate = canModerate && !previewMode

  const searchSeq = useRef(0)
  const trimmedQuery = query.trim()
  useEffect(() => {
    if (trimmedQuery.length < 2) return
    const mySeq = ++searchSeq.current
    const timer = setTimeout(async () => {
      setSearching(true)
      const res = await apiFetch<{ results: SearchResult[] }>(`/api/events/${eventId}/playlist/search?q=${encodeURIComponent(trimmedQuery)}`)
      if (searchSeq.current !== mySeq) return
      setSearching(false)
      if (!res.ok) {
        pushToast(errorMessageFor(res.error))
        return
      }
      setResults(res.data.results)
    }, 400)
    return () => clearTimeout(timer)
  }, [trimmedQuery, eventId])
  const visibleResults = trimmedQuery.length >= 2 ? results : []
  const noResults = trimmedQuery.length >= 2 && !searching && visibleResults.length === 0

  async function handleAddSong(result: SearchResult, busyKey: string) {
    setBusyId(busyKey)
    // Le choix d'endpoint suit la permission RÉELLE (canModerate), pas l'onglet
    // affiché (effectiveCanModerate) : en "Aperçu participant", le staff n'a
    // généralement pas de billet réel, donc l'endpoint participant (`songs`,
    // qui exige un check-in réel côté serveur) renverrait toujours
    // `not_checked_in`. Le staff garde ses droits de modération pour l'appel
    // API même quand l'écran affiché imite la vue participant.
    const path = canModerate ? 'songs/dj' : 'songs'
    const res = await apiFetch<{ song: PlaylistSong }>(`/api/events/${eventId}/playlist/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: result.title, artist: result.artist, previewUrl: result.previewUrl, cover: result.cover }),
    })
    setBusyId(null)
    if (!res.ok) {
      // Cas particulier : le titre exact appartient au message (mirrors
      // PlaylistSystem.jsx ligne 326), les autres erreurs restent génériques.
      if (res.error === 'duplicate_song') {
        pushToast(`« ${result.title} » est déjà dans la playlist.`)
      } else {
        pushToast(errorMessageFor(res.error))
      }
      return
    }
    if (effectiveCanModerate) {
      pushToast(`« ${result.title} » ajouté par le DJ`, 'ok')
    } else {
      const remaining = Math.max(0, effectiveSongsRemaining - 1)
      pushToast(
        remaining > 0 ? `« ${result.title} » ajouté ! Il te reste ${remaining} son${remaining > 1 ? 's' : ''} à proposer.` : `« ${result.title} » est dans la playlist !`,
        'ok'
      )
    }
    setQuery('')
    setResults([])
    audioRef.current?.pause()
    setPlayingKey(null)
    await refreshPlaylist()
  }

  async function handleToggleLike(songId: string) {
    setBusyId(songId)
    const res = await apiFetch<{ liked: boolean }>(`/api/events/${eventId}/playlist/songs/${songId}/like`, { method: 'POST' })
    setBusyId(null)
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    await refreshPlaylist()
  }

  // Re-cliquer sur le statut déjà actif le retire (retour à "Nouveaux"/pending)
  // — mirrors PlaylistDJPanel.jsx patchStatus() lignes 56-66 : sans ce toggle,
  // un clic accidentel sur Refuser/Valider/Marquer joué n'a plus aucune
  // marche arrière hors suppression pure et simple du son.
  async function handleSetStatus(song: PlaylistSong, status: PlaylistSong['status']) {
    const nextStatus = song.status === status ? 'pending' : status
    setBusyId(song.id)
    const res = await apiFetch(`/api/events/${eventId}/playlist/songs/${song.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
    setBusyId(null)
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    pushToast(`« ${song.title} » → ${STATUS_ACTION_LABEL[nextStatus]}`, 'ok')
    await refreshPlaylist()
  }

  async function handleModeratorRemove(song: PlaylistSong) {
    setBusyId(song.id)
    const res = await apiFetch(`/api/events/${eventId}/playlist/songs/${song.id}`, { method: 'DELETE' })
    setBusyId(null)
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    pushToast(`« ${song.title} » retiré`, 'ok')
    await refreshPlaylist()
  }

  // Suppression par le PARTICIPANT de l'un de ses propres sons (avant qu'il ne
  // soit joué) — libère un slot, permet de "remplacer" une proposition.
  // Mirrors PlaylistSystem.jsx removeSong().
  async function handleRemoveOwnSong(song: PlaylistSong) {
    setBusyId(song.id)
    const res = await apiFetch(`/api/events/${eventId}/playlist/songs/${song.id}/mine`, { method: 'DELETE' })
    setBusyId(null)
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    pushToast(`« ${song.title} » retiré — tu peux proposer un autre son.`, 'ok')
    if (playingKey === `song-${song.id}`) {
      audioRef.current?.pause()
      setPlayingKey(null)
    }
    await refreshPlaylist()
  }

  async function handlePlayNow(song: PlaylistSong) {
    setBusyId(song.id)
    const res = await apiFetch(`/api/events/${eventId}/playlist/now-playing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: song.id }),
    })
    setBusyId(null)
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    pushToast(`« ${song.title} » en cours — visible par la salle`, 'ok')
    await refreshPlaylist()
  }

  async function handleStopNow() {
    const res = await apiFetch(`/api/events/${eventId}/playlist/now-playing`, { method: 'DELETE' })
    if (!res.ok) {
      pushToast(errorMessageFor(res.error))
      return
    }
    await refreshPlaylist()
  }

  // Export TOUJOURS la liste complète (indépendamment du filtre actif) —
  // mirrors PlaylistDJPanel.jsx exportList().
  function handleExport() {
    const full = [...songs].sort((a, b) => (djSort === 'likes' ? b.likedBy.length - a.likedBy.length : songs.indexOf(b) - songs.indexOf(a)))
    const lines = full.map((s, i) => `${i + 1}. ${s.title} — ${s.artist}${STATUS_BADGE[s.status] ? ` [${STATUS_BADGE[s.status]!.label}]` : ''}`).join('\n')
    const text = `Playlist — ${eventName}\n\n${lines}`
    const done = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {}
      document.body.removeChild(ta)
      done()
    }
  }

  const rankedSongs = [...songs].filter((s) => s.status !== 'refused').sort((a, b) => b.likedBy.length - a.likedBy.length)
  const mySongs = songs.filter((s) => s.addedBy === currentUserId)

  // "Aperçu participant" : simule un billet scanné pour le staff qui n'en a
  // pas réellement, sinon le champ d'ajout resterait invisible (quota 0/0) et
  // l'aperçu ne montrerait que l'écran "Conditions pour proposer un son" —
  // mirrors PlaylistSystem.jsx lignes 161 (`Math.max(1, ...)`) et 166
  // (`previewCheckedIn || isCheckedInReal`).
  const effectiveHasTicket = hasTicket || previewMode
  const effectiveIsCheckedIn = isCheckedIn || previewMode
  const ticketCount = previewMode ? Math.max(1, realTicketCount) : realTicketCount
  const effectiveSongsRemaining = previewMode ? Math.max(0, ticketCount - mySongs.length) : songsRemaining

  const moderationSongs = moderationTab === 'all' ? songs : songs.filter((s) => s.status === moderationTab)
  const orderedModerationSongs = [...moderationSongs].sort((a, b) =>
    djSort === 'likes' ? b.likedBy.length - a.likedBy.length : songs.indexOf(b) - songs.indexOf(a)
  )
  const djStats = {
    total: songs.length,
    likes: songs.reduce((sum, s) => sum + s.likedBy.length, 0),
    pending: songs.filter((s) => s.status === 'pending').length,
    validated: songs.filter((s) => s.status === 'validated').length,
    played: songs.filter((s) => s.status === 'played').length,
    refused: songs.filter((s) => s.status === 'refused').length,
  }

  // ── Verrouillé : non-participant (mirrors PlaylistSystem.jsx lignes 470-484) ──
  // Ne s'applique jamais à la modération : un DJ/l'équipe accède toujours au
  // panneau de gestion, billet ou non.
  if (!canModerate && !hasTicket) {
    return (
      <main style={{ maxWidth: 640, minWidth: 0, width: '100%', margin: '0 auto', padding: '24px 18px 90px' }}>
        <div style={{ marginBottom: 18 }}>
          <Link href={`/events/${eventId}`} style={{ fontSize: 12.5, color: 'var(--text-faint)', textDecoration: 'none' }}>
            ← {eventName}
          </Link>
        </div>
        <div style={{ textAlign: 'center', padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border-strong)',
            }}
          >
            <LockIcon />
          </div>
          <p style={{ fontWeight: 800, fontSize: 21, letterSpacing: '-0.4px', margin: 0 }}>Playlist réservée aux participants</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, maxWidth: 300, lineHeight: 1.5 }}>
            Réserve ta place pour proposer tes sons et voter pour la playlist de la soirée.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 640, minWidth: 0, width: '100%', margin: '0 auto', padding: '24px 18px 90px' }}>
      <style>{`
        @keyframes lbBar1 { from { height: 5px } to { height: 18px } }
        @keyframes lbBar2 { from { height: 14px } to { height: 6px } }
        @keyframes lbBar3 { from { height: 8px } to { height: 16px } }
        @keyframes lbSpin { to { transform: rotate(360deg) } }
      `}</style>

      <div style={{ marginBottom: 18 }}>
        <Link href={`/events/${eventId}`} style={{ fontSize: 12.5, color: 'var(--text-faint)', textDecoration: 'none' }}>
          ← {eventName}
        </Link>
      </div>

      {eventImage && (
        <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border-strong)', height: 120, marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={eventImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,8,14,0.95), rgba(6,8,14,0.35))' }} />
          <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
            <p
              style={{
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: '-0.4px',
                margin: 0,
                textShadow: '0 2px 10px rgba(0,0,0,0.6)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {eventName}
            </p>
            {(eventDateDisplay || eventCity) && (
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.75)', margin: '3px 0 0' }}>{[eventDateDisplay, eventCity].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        </div>
      )}

      {effectiveCanModerate ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>Gestion playlist</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0' }}>
              {djStats.total} son{djStats.total > 1 ? 's' : ''} proposé{djStats.total > 1 ? 's' : ''} · tu gardes le contrôle final
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setPreviewMode(true)} style={ghostButtonStyle}>
              Aperçu participant
            </button>
            <button type="button" onClick={handleExport} style={{ ...smallButtonStyle, background: 'var(--gold)', color: '#181203', border: 'none', fontWeight: 700 }}>
              {copied ? 'Copié' : 'Exporter'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.6px', margin: 0 }}>Playlist interactive</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Propose tes sons, vote pour la soirée</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22, flexShrink: 0 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: 10,
                  background: 'var(--gold)',
                  borderRadius: 2,
                  opacity: 0.75,
                  animation: `lbBar${(i % 3) + 1} 0.7s ease-in-out ${i * 0.1}s infinite alternate`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {previewMode && (
        <div
          style={{
            padding: '9px 13px',
            borderRadius: 10,
            border: `1px solid ${HEX.gold}55`,
            background: 'rgba(200,169,110,0.08)',
            fontSize: 12,
            color: 'var(--gold)',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span>Aperçu équipe — un vrai participant doit avoir son billet scanné à l&apos;entrée pour proposer un son.</span>
          <button type="button" onClick={() => setPreviewMode(false)} style={{ ...ghostButtonStyle, flexShrink: 0 }}>
            Retour modération
          </button>
        </div>
      )}

      {nowPlaying && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 14,
            border: `1px solid ${HEX.gold}55`,
            background: 'linear-gradient(135deg, rgba(200,169,110,0.14), rgba(139,92,246,0.10))',
            marginBottom: 18,
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 10,
              flexShrink: 0,
              background: nowPlaying.cover ? `url(${nowPlaying.cover}) center/cover` : 'rgba(255,255,255,0.06)',
              border: `1px solid ${HEX.gold}66`,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--gold)', margin: 0 }}>
              En ce moment{effectiveCanModerate ? ' · affiché à la salle' : ''}
            </p>
            <p style={{ fontSize: 15.5, fontWeight: 800, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nowPlaying.title}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nowPlaying.artist}</p>
          </div>
          {effectiveCanModerate && (
            <button type="button" onClick={handleStopNow} style={ghostButtonStyle}>
              Terminer
            </button>
          )}
        </div>
      )}

      {effectiveCanModerate ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              ['Proposés', djStats.total, 'var(--text)'],
              ['Likes', djStats.likes, 'var(--teal)'],
              ['À jouer', djStats.validated, 'var(--gold)'],
              ['Joués', djStats.played, 'var(--violet)'],
            ].map(([label, value, color]) => (
              <div key={label as string} style={{ flex: 1, minWidth: 76, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>{label}</p>
                <p style={{ fontSize: 17, fontWeight: 800, color: color as string, margin: '2px 0 0' }}>{value}</p>
              </div>
            ))}
          </div>

          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 10px' }}>Ajouter un son (auto-validé)</p>
            <div style={{ position: 'relative' }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un titre, un artiste…" style={inputStyle} />
              <SearchStatusGlyph searching={searching} />
            </div>
            {visibleResults.length > 0 && (
              <SearchResultsList
                results={visibleResults}
                busyId={busyId}
                playingKey={playingKey}
                onTogglePreview={togglePreviewAudio}
                onAdd={handleAddSong}
                disableAdd={false}
              />
            )}
            {noResults && <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '10px 0 0', textAlign: 'center' }}>Aucun résultat pour « {trimmedQuery} »</p>}
          </section>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            {DJ_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setModerationTab(f.key)}
                style={{
                  ...pillButtonStyle,
                  color: moderationTab === f.key ? 'var(--gold)' : 'var(--text-muted)',
                  background: moderationTab === f.key ? 'rgba(200,169,110,0.12)' : 'rgba(255,255,255,0.04)',
                  borderColor: moderationTab === f.key ? `${HEX.gold}73` : 'var(--border)',
                }}
              >
                {f.label} · {f.key === 'all' ? djStats.total : djStats[f.key]}
              </button>
            ))}
            <span style={{ width: 1, height: 18, background: 'var(--border-strong)', margin: '0 2px' }} />
            {(['likes', 'recent'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setDjSort(id)}
                style={{
                  ...pillButtonStyle,
                  color: djSort === id ? 'var(--teal)' : 'var(--text-muted)',
                  background: djSort === id ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.04)',
                  borderColor: djSort === id ? `${HEX.teal}66` : 'var(--border)',
                }}
              >
                {id === 'likes' ? 'Par likes' : 'Plus récents'}
              </button>
            ))}
          </div>

          {orderedModerationSongs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border)',
                }}
              >
                <MusicNoteIcon opacity={0.35} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{moderationTab === 'all' ? 'Aucun son proposé pour l’instant' : 'Aucun son dans ce filtre'}</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, maxWidth: 300, lineHeight: 1.5 }}>
                {moderationTab === 'all'
                  ? 'Les propositions des participants apparaîtront ici. Utilise la recherche ci-dessus pour ajouter le premier son.'
                  : 'Change de filtre pour voir les autres sons.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {orderedModerationSongs.map((song) => (
                <div key={song.id} style={cardStyle}>
                  <DjSongRow song={song} currentUserId={currentUserId} playingKey={playingKey} onTogglePreview={togglePreviewAudio} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={busyId === song.id}
                      onClick={() => handlePlayNow(song)}
                      style={{
                        ...smallButtonStyle,
                        borderColor: nowPlaying?.id === song.id ? 'var(--gold)' : 'var(--border)',
                        color: nowPlaying?.id === song.id ? 'var(--gold)' : smallButtonStyle.color,
                        background: nowPlaying?.id === song.id ? 'rgba(200,169,110,0.16)' : smallButtonStyle.background,
                      }}
                    >
                      Jouer maintenant
                    </button>
                    <button
                      type="button"
                      disabled={busyId === song.id}
                      onClick={() => handleSetStatus(song, 'validated')}
                      style={{ ...smallButtonStyle, borderColor: song.status === 'validated' ? 'var(--teal)' : 'var(--border)' }}
                    >
                      Valider
                    </button>
                    <button
                      type="button"
                      disabled={busyId === song.id}
                      onClick={() => handleSetStatus(song, 'refused')}
                      style={{ ...smallButtonStyle, borderColor: song.status === 'refused' ? 'var(--pink)' : 'var(--border)' }}
                    >
                      Refuser
                    </button>
                    <button
                      type="button"
                      disabled={busyId === song.id}
                      onClick={() => handleSetStatus(song, 'played')}
                      style={{ ...smallButtonStyle, borderColor: song.status === 'played' ? 'var(--violet)' : 'var(--border)' }}
                    >
                      Marquer joué
                    </button>
                    <button type="button" disabled={busyId === song.id} onClick={() => handleModeratorRemove(song)} style={{ ...smallButtonStyle, color: 'var(--pink)' }}>
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <StatChip label="Tes sons" value={`${mySongs.length} / ${ticketCount}`} color="var(--gold)" />
            <StatChip label="Likes restants" value={`${likesRemaining} / ${LIKE_BUDGET}`} color="var(--teal)" />
            <StatChip label="Dans la playlist" value={rankedSongs.length} />
          </div>

          <div style={{ display: 'flex', gap: 6, padding: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 16, marginBottom: 16 }}>
            {PARTICIPANT_TABS.map((t) => {
              const active = participantTab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setParticipantTab(t.key)}
                  style={{
                    flex: 1,
                    padding: '10px 8px',
                    borderRadius: 12,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13.5,
                    fontWeight: active ? 800 : 600,
                    transition: 'all 0.2s',
                    color: active ? '#04120e' : 'var(--text-muted)',
                    background: active ? 'var(--teal-solid)' : 'transparent',
                  }}
                >
                  {t.label}
                  {t.key === 'mine' && mySongs.length ? ` · ${mySongs.length}` : ''}
                </button>
              )
            })}
          </div>

          {participantTab === 'top' && (
            <section>
              {rankedSongs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <MusicNoteIcon opacity={0.12} />
                  <p style={{ fontSize: 14, color: 'var(--text-faint)', margin: 0 }}>La playlist est vide — propose le premier son dans « Mes sons ».</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rankedSongs.map((song, i) => {
                    const rank = i + 1
                    const liked = song.likedBy.includes(currentUserId)
                    const isMine = song.addedBy === currentUserId
                    return (
                      <div
                        key={song.id}
                        style={{
                          ...cardStyle,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 11,
                          border: rank === 1 ? `1px solid ${HEX.gold}55` : cardStyle.border,
                          background: rank === 1 ? '#14120d' : cardStyle.background,
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 800, width: 18, textAlign: 'center', flexShrink: 0, color: rank === 1 ? 'var(--gold)' : 'var(--text-faint)' }}>
                          {rank}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <SongRow song={song} isMine={isMine} playingKey={playingKey} onTogglePreview={togglePreviewAudio} />
                        </div>
                        <button
                          type="button"
                          disabled={isMine || busyId === song.id || (!liked && likesRemaining <= 0)}
                          onClick={() => handleToggleLike(song.id)}
                          title={isMine ? 'Tu ne peux pas liker ton propre son' : liked ? 'Retirer le like' : 'Liker'}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 14px',
                            borderRadius: 999,
                            flexShrink: 0,
                            border: isMine ? '1px solid rgba(255,255,255,0.06)' : liked ? `1px solid ${HEX.teal}66` : '1px solid var(--border-strong)',
                            background: isMine ? 'rgba(255,255,255,0.04)' : liked ? 'rgba(78,232,200,0.16)' : 'rgba(255,255,255,0.08)',
                            cursor: isMine ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <HeartIcon filled={liked} color={isMine ? 'rgba(255,255,255,0.25)' : liked ? HEX.teal : 'rgba(255,255,255,0.55)'} />
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: isMine ? 'rgba(255,255,255,0.35)' : liked ? 'var(--teal)' : 'rgba(255,255,255,0.75)' }}>
                            {song.likedBy.length}
                          </span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {participantTab === 'mine' && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {!effectiveIsCheckedIn && (
                <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '28px 20px', textAlign: 'center' }}>
                  <p style={{ fontWeight: 800, fontSize: 19, letterSpacing: '-0.4px', margin: 0 }}>Conditions pour proposer un son</p>
                  <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0, maxWidth: 320, lineHeight: 1.55 }}>
                    Pour proposer tes sons au DJ, tu dois remplir ces deux conditions :
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 340 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 16px',
                        borderRadius: 14,
                        border: effectiveHasTicket ? `1px solid ${HEX.teal}44` : '1px solid var(--border-strong)',
                        background: effectiveHasTicket ? 'rgba(78,232,200,0.04)' : 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: effectiveHasTicket ? 'rgba(78,232,200,0.1)' : 'rgba(255,255,255,0.05)',
                        }}
                      >
                        <TicketIcon done={effectiveHasTicket} />
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <p style={{ fontSize: 14.5, fontWeight: 700, color: effectiveHasTicket ? 'var(--teal)' : 'var(--text)', margin: 0 }}>
                          {effectiveHasTicket ? 'Billet réservé' : 'Réserver un billet'}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '2px 0 0' }}>
                          {effectiveHasTicket ? `${ticketCount} billet${ticketCount > 1 ? 's' : ''} pour cet événement` : 'Tu dois avoir un billet pour cet événement'}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, border: '1px solid var(--border-strong)', background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
                        <ScanIcon />
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <p style={{ fontSize: 14.5, fontWeight: 700, margin: 0 }}>Scanner ton billet</p>
                        <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '2px 0 0' }}>Présente ton billet QR à l&apos;entrée de la soirée</p>
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
                    Une fois sur place et ton billet scanné, tu pourras proposer 1 son par billet au DJ.
                  </p>
                </div>
              )}

              {effectiveIsCheckedIn &&
                (effectiveSongsRemaining > 0 ? (
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                      Propose un son au DJ — <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{effectiveSongsRemaining} proposition{effectiveSongsRemaining > 1 ? 's' : ''} restante{effectiveSongsRemaining > 1 ? 's' : ''}</span>
                    </p>
                    <div style={{ position: 'relative' }}>
                      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un titre, un artiste…" style={inputStyle} />
                      <SearchStatusGlyph searching={searching} />
                    </div>
                    {visibleResults.length > 0 && (
                      <SearchResultsList
                        results={visibleResults}
                        busyId={busyId}
                        playingKey={playingKey}
                        onTogglePreview={togglePreviewAudio}
                        onAdd={handleAddSong}
                        disableAdd={false}
                      />
                    )}
                    {noResults && <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '10px 0 0', textAlign: 'center' }}>Aucun résultat pour « {trimmedQuery} »</p>}
                  </div>
                ) : (
                  <div style={{ ...cardStyle, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--teal)', margin: 0 }}>
                      {ticketCount <= 1 ? 'Ton son est dans la playlist' : `${mySongs.length} / ${ticketCount} sons proposés`}
                    </p>
                    <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: 0 }}>Tu as utilisé toutes tes propositions · 1 son par billet réservé</p>
                  </div>
                ))}

              {effectiveIsCheckedIn && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 10px' }}>
                    Mes sons proposés ({mySongs.length})
                  </p>
                  {mySongs.length === 0 ? (
                    <p style={{ fontSize: 13.5, color: 'var(--text-faint)', margin: 0, textAlign: 'center', padding: '16px 0' }}>Tu n&apos;as pas encore proposé de son.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {mySongs.map((song) => {
                        // Un son refusé sort du classement (absent du Top) →
                        // pas de rang. Mirrors PlaylistSystem.jsx lignes 754-758.
                        const rank = rankedSongs.findIndex((s) => s.id === song.id)
                        return (
                        <div key={song.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10 }}>
                          {rank >= 0 && (
                            <span style={{ fontSize: 14, fontWeight: 800, width: 18, textAlign: 'center', flexShrink: 0, color: 'var(--text-faint)' }}>
                              {rank + 1}
                            </span>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <SongRow song={song} isMine playingKey={playingKey} onTogglePreview={togglePreviewAudio} />
                          </div>
                          <div
                            title="Tu ne peux pas liker ton propre son"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '8px 14px',
                              borderRadius: 999,
                              flexShrink: 0,
                              border: '1px solid rgba(255,255,255,0.06)',
                              background: 'rgba(255,255,255,0.04)',
                            }}
                          >
                            <HeartIcon filled={false} color="rgba(255,255,255,0.25)" />
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'rgba(255,255,255,0.35)' }}>{song.likedBy.length}</span>
                          </div>
                          <button
                            type="button"
                            disabled={busyId === song.id}
                            onClick={() => handleRemoveOwnSong(song)}
                            title="Supprimer mon son"
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              flexShrink: 0,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(224,90,170,0.14)',
                              border: `1px solid ${HEX.pink}8c`,
                              color: 'var(--pink)',
                            }}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {participantTab === 'rules' && (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={cardStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    ['Billet scanné requis', 'Tu dois être sur place et ton billet scanné pour proposer un son'],
                    ['Sons autorisés', `${ticketCount} son${ticketCount > 1 ? 's' : ''} — 1 par billet réservé`],
                    ['Likes disponibles', `${LIKE_BUDGET} likes au total pour cet événement`],
                    ['Un like par son', "Tu ne peux liker un son qu'une seule fois"],
                    ['Pas ton propre son', 'Impossible de liker un son que tu as ajouté'],
                    ['Le classement est indicatif', 'Il aide le DJ, mais ne décide pas à sa place'],
                  ].map(([t, d]) => (
                    <div key={t} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                      <span style={{ marginTop: 3, flexShrink: 0, color: 'var(--teal)' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                      <div>
                        <p style={{ fontSize: 14.5, fontWeight: 700, margin: 0 }}>{t}</p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.45 }}>{d}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ ...cardStyle, display: 'flex', alignItems: 'flex-start', gap: 12, borderColor: 'rgba(200,169,110,0.28)' }}>
                <div style={{ marginTop: 2, flexShrink: 0 }}>
                  <HeadphonesIcon />
                </div>
                <div>
                  <p style={{ fontSize: 14.5, fontWeight: 700, margin: 0 }}>{djName} garde le choix final</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0', lineHeight: 1.5 }}>
                    Le DJ peut ignorer la playlist, y ajouter ses propres sons ou retirer un contenu inapproprié. La playlist reste une suggestion de la salle.
                  </p>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <div style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 8, zIndex: 300 }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: 'var(--surface-2)',
              border: `1px solid ${t.kind === 'ok' ? `${HEX.teal}80` : 'rgba(234,88,12,0.45)'}`,
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 13,
              color: t.kind === 'ok' ? 'var(--teal)' : '#fb923c',
              textAlign: 'center',
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </main>
  )
}

// Mirrors PlaylistSystem.jsx lignes 692-694 : glyphe idle-ou-en-cours dans le
// slot droit (40px de padding réservé) du champ de recherche — jamais un
// vide, contrairement à un spinner affiché seul.
function SearchStatusGlyph({ searching }: { searching: boolean }) {
  return (
    <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
      {searching ? (
        <span
          style={{
            width: 13,
            height: 13,
            border: '2px solid rgba(255,255,255,0.25)',
            borderTopColor: 'rgba(255,255,255,0.8)',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'lbSpin 0.7s linear infinite',
          }}
        />
      ) : (
        <SearchIcon />
      )}
    </span>
  )
}

function SearchResultsList({
  results,
  busyId,
  playingKey,
  onTogglePreview,
  onAdd,
  disableAdd,
}: {
  results: SearchResult[]
  busyId: string | null
  playingKey: string | null
  onTogglePreview: (key: string, url: string | null) => void
  onAdd: (result: SearchResult, busyKey: string) => void
  disableAdd: boolean
}) {
  return (
    <div style={{ marginTop: 10, border: '1px solid var(--border-strong)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface-2)', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
      {results.map((r, i) => {
        // Cf. commentaire d'origine : plusieurs résultats iTunes peuvent
        // partager le même titre/artiste — l'index de la liste (toujours
        // remplacée entière à chaque recherche) sert de clé stable.
        const busyKey = `search-${i}`
        const previewKey = `preview-${busyKey}`
        const playing = playingKey === previewKey
        return (
          <div key={busyKey} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, gap: 10, borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => onTogglePreview(previewKey, r.previewUrl)}
                disabled={!r.previewUrl}
                aria-label={playing ? `Mettre en pause l'extrait de ${r.title}` : `Écouter un extrait de ${r.title}`}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  flexShrink: 0,
                  overflow: 'hidden',
                  position: 'relative',
                  padding: 0,
                  border: playing ? `1px solid ${HEX.gold}90` : '1px solid var(--border-strong)',
                  background: r.cover ? `url(${r.cover}) center/cover` : 'var(--surface-2)',
                  cursor: r.previewUrl ? 'pointer' : 'default',
                }}
              >
                {r.previewUrl && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', color: '#fff' }}>
                    <PlayPauseGlyph playing={playing} />
                  </span>
                )}
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.artist}
                  {r.duration ? ` · ${r.duration}` : ''}
                  {playing && <span style={{ marginLeft: 8, color: 'var(--gold)' }}>▶ en cours</span>}
                </p>
              </div>
            </div>
            <button type="button" disabled={disableAdd || busyId === busyKey} onClick={() => onAdd(r, busyKey)} style={{ ...smallButtonStyle, opacity: busyId === busyKey ? 0.6 : 1 }}>
              Ajouter
            </button>
          </div>
        )
      })}
    </div>
  )
}

// Ligne de morceau — vue PARTICIPANT (Top playlist + Mes sons). Aucun vrai
// nom de contributeur n'est jamais montré (mirrors PlaylistSystem.jsx
// SongRow ligne 443) : "ajouté par toi" pour ses propres sons, "un invité"
// pour tous les autres.
function SongRow({
  song,
  isMine,
  playingKey,
  onTogglePreview,
}: {
  song: PlaylistSong
  isMine: boolean
  playingKey: string | null
  onTogglePreview: (key: string, url: string | null) => void
}) {
  const badge = STATUS_BADGE[song.status]
  const previewKey = `song-${song.id}`
  const playing = playingKey === previewKey
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        type="button"
        onClick={() => song.previewUrl && onTogglePreview(previewKey, song.previewUrl)}
        disabled={!song.previewUrl}
        aria-label={playing ? `Mettre en pause l'extrait de ${song.title}` : `Écouter un extrait de ${song.title}`}
        style={{
          width: 42,
          height: 42,
          borderRadius: 9,
          flexShrink: 0,
          overflow: 'hidden',
          position: 'relative',
          padding: 0,
          border: playing ? `1px solid ${HEX.gold}90` : '1px solid var(--border-strong)',
          background: song.cover ? `url(${song.cover}) center/cover` : 'rgba(255,255,255,0.05)',
          cursor: song.previewUrl ? 'pointer' : 'default',
        }}
      >
        {!song.cover && (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <MusicNoteIcon opacity={0.3} />
          </span>
        )}
        {song.previewUrl && (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', color: '#fff' }}>
            <PlayPauseGlyph playing={playing} />
          </span>
        )}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <p style={{ fontWeight: 700, fontSize: 15.5, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</p>
          {badge && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: badge.color,
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${badge.color}55`,
                borderRadius: 8,
                padding: '3px 8px',
              }}
            >
              {badge.label}
            </span>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {song.artist}
          <span style={{ color: 'var(--text-faint)' }}> · {isMine ? 'ajouté par toi' : 'un invité'}</span>
          {playing && <span style={{ marginLeft: 8, color: 'var(--gold)' }}>▶ en cours</span>}
        </p>
      </div>
    </div>
  )
}

// Ligne de morceau — vue DJ/modération : likes visibles pour juger la
// popularité (mirrors PlaylistDJPanel.jsx ligne 307), toujours anonyme (même
// le DJ ne voit jamais le vrai nom de qui a proposé un son).
function DjSongRow({
  song,
  currentUserId,
  playingKey,
  onTogglePreview,
}: {
  song: PlaylistSong
  currentUserId: string
  playingKey: string | null
  onTogglePreview: (key: string, url: string | null) => void
}) {
  const badge = STATUS_BADGE[song.status]
  const addedByMe = song.addedBy === currentUserId
  const previewKey = `song-${song.id}`
  const playing = playingKey === previewKey
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        type="button"
        onClick={() => song.previewUrl && onTogglePreview(previewKey, song.previewUrl)}
        disabled={!song.previewUrl}
        aria-label={playing ? `Mettre en pause l'extrait de ${song.title}` : `Écouter un extrait de ${song.title}`}
        style={{
          width: 42,
          height: 42,
          borderRadius: 9,
          flexShrink: 0,
          overflow: 'hidden',
          position: 'relative',
          padding: 0,
          border: playing ? `1px solid ${HEX.gold}90` : '1px solid var(--border-strong)',
          background: song.cover ? `url(${song.cover}) center/cover` : 'rgba(255,255,255,0.05)',
          cursor: song.previewUrl ? 'pointer' : 'default',
        }}
      >
        {song.previewUrl && (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', color: '#fff' }}>
            <PlayPauseGlyph playing={playing} />
          </span>
        )}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ fontWeight: 700, fontSize: 15, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</p>
          {badge && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: badge.color,
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${badge.color}55`,
                borderRadius: 8,
                padding: '3px 8px',
              }}
            >
              {badge.label}
            </span>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {song.artist} · <span style={{ color: 'var(--teal)' }}>{song.likedBy.length} like{song.likedBy.length > 1 ? 's' : ''}</span>
          {addedByMe && <span style={{ color: 'var(--text-faint)' }}> · ajouté par toi</span>}
          {playing && <span style={{ marginLeft: 8, color: 'var(--gold)' }}>▶ en cours</span>}
        </p>
      </div>
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 92, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 14px' }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.5px', color: color || 'var(--text)', margin: '3px 0 0' }}>{value}</p>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 14,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 40px 10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: 13.5,
  boxSizing: 'border-box',
}

const smallButtonStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text)',
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
}

const ghostButtonStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const pillButtonStyle: React.CSSProperties = {
  padding: '7px 12px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}
