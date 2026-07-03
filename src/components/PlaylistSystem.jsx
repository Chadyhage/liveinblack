import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'

// pas de sons par défaut — la playlist démarre vide

const MAX_LIKES_PER_USER = 5

function formatMs(ms) {
  if (!ms) return '?'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// SVG heart icon
function HeartIcon({ filled = false, size = 12, color = '#4ee8c8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  )
}

// SVG music note icon
function MusicNoteIcon({ size = 16, color = '#c8a96e' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
    </svg>
  )
}

// SVG lock icon
function LockIcon({ size = 32, color = 'rgba(255,255,255,0.2)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
    </svg>
  )
}

// SVG headphone icon
function HeadphonesIcon({ size = 18, color = '#c8a96e' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h1v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-2v8h1c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/>
    </svg>
  )
}

// SVG search icon
function SearchIcon({ size = 16, color = 'rgba(255,255,255,0.35)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

const FONT = 'Inter, sans-serif'
const C = { teal: '#4ee8c8', gold: '#c8a96e', violet: '#8b5cf6', pink: '#e05aaa' }

const S = {
  card: {
    background: 'rgba(9,11,20,0.6)',
    backdropFilter: 'blur(22px) saturate(1.5)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 16,
    padding: '16px 18px',
  },
  label: {
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
  },
  input: {
    background: 'rgba(6,8,16,0.6)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 13,
    fontFamily: FONT,
    fontSize: 15,
    color: 'white',
    padding: '14px 40px 14px 14px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  },
}

// Puce statistique (billets/likes) en tête de la playlist
function StatChip({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 92, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '10px 14px' }}>
      <p style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', margin: 0 }}>{label}</p>
      <p style={{ fontFamily: FONT, fontSize: 19, fontWeight: 800, letterSpacing: '-0.5px', color: color || '#fff', margin: '3px 0 0' }}>{value}</p>
    </div>
  )
}

export default function PlaylistSystem({ event, booked }) {
  const { user } = useAuth()
  const userId = getUserId(user)

  // Persist playlist state in localStorage so tab switching doesn't reset it
  const songsKey = `lib_playlist_songs_${event.id}`
  const addedKey = `lib_playlist_added_${event.id}_${userId}` // stocke un nombre maintenant
  const likesKey = `lib_playlist_likes_${event.id}_${userId}`

  // Nombre de billets que l'utilisateur a pour cet événement
  function loadTicketCount() {
    try {
      const bookings = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      return bookings.filter(b => String(b.eventId) === String(event.id) && b.userId === userId).length
    } catch { return 1 }
  }

  function loadSongs() {
    try { return JSON.parse(localStorage.getItem(songsKey)) || [] } catch { return [] }
  }
  // Combien de sons cet utilisateur a déjà ajoutés (entier, pas booléen)
  function loadSongsAdded() {
    try {
      const raw = localStorage.getItem(addedKey)
      if (raw === 'true') return 1  // migration ancien format booléen
      return parseInt(raw) || 0
    } catch { return 0 }
  }
  function loadLikesUsed() {
    try { return parseInt(localStorage.getItem(likesKey)) || 0 } catch { return 0 }
  }

  const ticketCount = loadTicketCount()

  const [songs, setSongsState] = useState(loadSongs)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [likesUsed, setLikesUsedState] = useState(loadLikesUsed)
  const [songsAdded, setSongsAddedState] = useState(loadSongsAdded)
  const [preview, setPreview] = useState(null)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState('top') // top | mine | rules
  const audioRef = useRef(null)
  const debounceRef = useRef(null)

  const songsRemaining = Math.max(0, ticketCount - songsAdded)

  // Le cache local donne un affichage instantané, puis Firestore devient la
  // source partagée : sans ce listener, les morceaux ajoutés depuis un autre
  // appareil (ou préparés pour une démo) n'apparaissaient jamais ici.
  useEffect(() => {
    if (!event?.id) return
    let unsubscribe = () => {}
    let cancelled = false
    import('../utils/firestore-sync').then(({ listenDoc }) => {
      if (cancelled) return
      unsubscribe = listenDoc(`event_playlists/${event.id}`, data => {
        if (!Array.isArray(data?.songs)) return
        const remoteSongs = [...data.songs].sort((a, b) => (b.likes || 0) - (a.likes || 0))
        // myLike est un état PERSONNEL (jamais écrit dans le doc partagé) :
        // on le réapplique depuis l'état local au moment du merge distant.
        setSongsState(prev => {
          const merged = remoteSongs.map(s => ({ ...s, myLike: prev.find(p => String(p.id) === String(s.id))?.myLike || false }))
          try { localStorage.setItem(songsKey, JSON.stringify(merged)) } catch {}
          return merged
        })
      })
    }).catch(() => {})
    return () => { cancelled = true; unsubscribe() }
  }, [event?.id, songsKey])

  // Mise à jour LOCALE uniquement (cache + affichage optimiste). Les écritures
  // Firestore passent par des transactions ciblées (mergeItemsById pour un ajout,
  // adjustPlaylistLike pour un like) : écrire le tableau complet depuis l'état
  // local écrasait les ajouts/likes concurrents des autres participants.
  function setSongs(updater) {
    setSongsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem(songsKey, JSON.stringify(next)) } catch {}
      return next
    })
  }
  function incrementSongsAdded() {
    const next = songsAdded + 1
    setSongsAddedState(next)
    try { localStorage.setItem(addedKey, String(next)) } catch {}
  }
  function setLikesUsed(updater) {
    setLikesUsedState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem(likesKey, String(next)) } catch {}
      return next
    })
  }

  // Cleanup audio on unmount
  useEffect(() => () => audioRef.current?.pause(), [])

  function handleSearch(val) {
    setSearch(val)
    clearTimeout(debounceRef.current)
    if (val.length < 2) { setSearchResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(val)}&media=music&entity=song&limit=8`,
        )
        const data = await res.json()
        setSearchResults(
          data.results.map((r) => ({
            title: r.trackName,
            artist: r.artistName,
            duration: formatMs(r.trackTimeMillis),
            previewUrl: r.previewUrl,
            artwork: r.artworkUrl60,
          })),
        )
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 400)
  }

  function togglePreview(song) {
    if (preview?.title === song.title) {
      audioRef.current?.pause()
      setPreview(null)
    } else {
      audioRef.current?.pause()
      if (song.previewUrl) {
        audioRef.current = new Audio(song.previewUrl)
        audioRef.current.play().catch(() => {})
      }
      setPreview(song)
    }
  }

  function addSong(song) {
    const exists = songs.find((s) => s.title.toLowerCase() === song.title.toLowerCase())
    if (exists) {
      setMessage(`warn:"${song.title}" est déjà dans la playlist.`)
      setTimeout(() => setMessage(''), 3000)
      return
    }
    // userId stocké pour distinguer « Mes sons » et empêcher de liker son propre son (cross-device)
    // cover : pochette iTunes (montée en 200px) ; previewUrl : extrait 30s « écouter »
    const cover = song.artwork ? song.artwork.replace('60x60', '200x200').replace('100x100', '200x200') : null
    const newSong = { id: Date.now(), title: song.title, artist: song.artist, likes: 0, addedBy: 'Moi', userId, previewUrl: song.previewUrl || null, cover }
    setSongs((prev) => [...prev, { ...newSong, myLike: false }])
    // Upsert transactionnel : n'ajoute QUE ce morceau côté serveur, sans écraser
    // les ajouts concurrents des autres participants. (myLike reste local.)
    import('../utils/firestore-sync').then(({ mergeItemsById }) => {
      mergeItemsById(`event_playlists/${event.id}`, { field: 'songs', upserts: [newSong] })
    }).catch(() => {})
    incrementSongsAdded()
    setSearch('')
    setSearchResults([])
    audioRef.current?.pause()
    setPreview(null)
    // Use nextAdded for accurate remaining count (state update is async)
    const nextAdded = songsAdded + 1
    const remaining = Math.max(0, ticketCount - nextAdded)
    setMessage(remaining > 0
      ? `ok:"${song.title}" ajouté ! Il te reste ${remaining} son${remaining > 1 ? 's' : ''} à proposer.`
      : `ok:"${song.title}" est dans la playlist !`)
    setTimeout(() => setMessage(''), 4000)
  }

  function toggleLike(songId) {
    const song = songs.find((s) => s.id === songId)
    if (!song) return
    // Règle : on ne peut pas liker son propre son
    if (song.userId && song.userId === userId) {
      setMessage('warn:Tu ne peux pas liker ton propre son.')
      setTimeout(() => setMessage(''), 3000)
      return
    }
    // Optimiste en local, transactionnel côté serveur : le compteur est incrémenté
    // sur l'état Firestore réel (pas l'état local), donc deux likes simultanés
    // font bien +2 et l'écran DJ ne saute plus de position en position.
    if (song.myLike) {
      setLikesUsed((l) => l - 1)
      setSongs((prev) => prev.map((s) => s.id === songId ? { ...s, likes: Math.max(0, s.likes - 1), myLike: false } : s).sort((a, b) => b.likes - a.likes))
      import('../utils/firestore-sync').then(({ adjustPlaylistLike }) => adjustPlaylistLike(event.id, songId, -1)).catch(() => {})
    } else if (likesUsed < MAX_LIKES_PER_USER) {
      setLikesUsed((l) => l + 1)
      setSongs((prev) => prev.map((s) => s.id === songId ? { ...s, likes: s.likes + 1, myLike: true } : s).sort((a, b) => b.likes - a.likes))
      import('../utils/firestore-sync').then(({ adjustPlaylistLike }) => adjustPlaylistLike(event.id, songId, +1)).catch(() => {})
    } else {
      setMessage(`warn:Tu as utilisé tes ${MAX_LIKES_PER_USER} likes maximum.`)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  // Supprimer un de SES sons (avant que le DJ ne l'ait joué) → libère un slot,
  // ce qui permet aussi de « remplacer » (supprimer puis proposer un autre son).
  function removeSong(song) {
    if (!song || song.userId !== userId) return
    setSongs((prev) => prev.filter((s) => s.id !== song.id))
    import('../utils/firestore-sync').then(({ mergeItemsById }) => {
      mergeItemsById(`event_playlists/${event.id}`, { field: 'songs', removeIds: [song.id] })
    }).catch(() => {})
    const next = Math.max(0, songsAdded - 1)
    setSongsAddedState(next)
    try { localStorage.setItem(addedKey, String(next)) } catch {}
    if (preview?.title === song.title) { audioRef.current?.pause(); setPreview(null) }
    setMessage(`ok:« ${song.title} » retiré — tu peux proposer un autre son.`)
    setTimeout(() => setMessage(''), 3500)
  }

  const sortedSongs = [...songs].sort((a, b) => b.likes - a.likes)
  const mySongs = songs.filter((s) => s.userId && s.userId === userId)
  const likesLeft = Math.max(0, MAX_LIKES_PER_USER - likesUsed)

  const isWarn = message.startsWith('warn:')
  const isOk = message.startsWith('ok:')
  const msgText = isWarn ? message.slice(5) : isOk ? message.slice(3) : message

  const djName = event.artists?.length ? event.artists.map(a => a.name).join(' · ') : (event.dj || 'Le DJ')

  // Ligne de morceau réutilisée (Top playlist + Mes sons)
  function SongRow({ song, rank, canDelete }) {
    const mine = song.userId && song.userId === userId
    const top = rank === 1
    const playing = preview?.title === song.title
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', borderRadius: 14,
        border: top ? `1px solid ${C.gold}55` : '1px solid rgba(255,255,255,0.07)',
        background: top ? `${C.gold}0d` : 'rgba(9,11,20,0.5)',
      }}>
        {rank != null && (
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 800, width: 18, textAlign: 'center', flexShrink: 0, color: top ? C.gold : 'rgba(255,255,255,0.28)' }}>{rank}</span>
        )}
        {/* Pochette (cover) — clic = pré-écoute si dispo */}
        <button onClick={() => song.previewUrl && togglePreview(song)} style={{
          width: 42, height: 42, borderRadius: 9, flexShrink: 0, overflow: 'hidden', position: 'relative', padding: 0,
          border: playing ? `1px solid ${C.gold}90` : '1px solid rgba(255,255,255,0.1)',
          background: song.cover ? `url(${song.cover}) center/cover` : 'rgba(255,255,255,0.05)',
          cursor: song.previewUrl ? 'pointer' : 'default',
        }}>
          {!song.cover && <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><MusicNoteIcon size={16} color="rgba(255,255,255,0.3)" /></span>}
          {song.previewUrl && (
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', color: '#fff', fontSize: 11 }}>{playing ? '■' : '▶'}</span>
          )}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15.5, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</p>
          <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {song.artist}
            <span style={{ color: 'rgba(255,255,255,0.28)' }}> · {mine ? 'ajouté par toi' : 'un invité'}</span>
            {playing && <span style={{ marginLeft: 8, color: C.gold }}>▶ en cours</span>}
          </p>
        </div>
        <button onClick={() => toggleLike(song.id)} disabled={mine} title={mine ? 'Tu ne peux pas liker ton propre son' : undefined} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 999, flexShrink: 0,
          border: song.myLike ? `1px solid ${C.teal}66` : '1px solid rgba(255,255,255,0.12)',
          background: song.myLike ? `${C.teal}14` : 'transparent',
          cursor: mine ? 'not-allowed' : 'pointer', opacity: mine ? 0.4 : 1,
        }}>
          <HeartIcon filled={song.myLike} size={14} color={song.myLike ? C.teal : 'rgba(255,255,255,0.4)'} />
          <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: song.myLike ? C.teal : 'rgba(255,255,255,0.55)' }}>{song.likes}</span>
        </button>
        {canDelete && mine && (
          <button onClick={() => removeSong(song)} title="Supprimer mon son" style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(224,90,170,0.08)', border: '1px solid rgba(224,90,170,0.3)', color: C.pink,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
          </button>
        )}
      </div>
    )
  }

  // ── Locked (non-participant) ──
  if (!booked) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 68, height: 68, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <LockIcon size={30} color="rgba(255,255,255,0.3)" />
        </div>
        <p style={{ fontFamily: FONT, fontWeight: 800, fontSize: 21, letterSpacing: '-0.4px', color: '#fff', margin: 0 }}>
          Playlist réservée aux participants
        </p>
        <p style={{ fontFamily: FONT, fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0, maxWidth: 300, lineHeight: 1.5 }}>
          Réserve ta place pour proposer tes sons et voter pour la playlist de la soirée.
        </p>
      </div>
    )
  }

  const TABS = [['top', 'Top playlist'], ['mine', 'Mes sons'], ['rules', 'Règles']]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{`
        @keyframes lbBar1 { from { height: 5px } to { height: 18px } }
        @keyframes lbBar2 { from { height: 14px } to { height: 6px } }
        @keyframes lbBar3 { from { height: 8px } to { height: 16px } }
      `}</style>

      {/* Affiche de l'événement */}
      {(event.imageUrl || event.image || event.cover) && (
        <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', height: 120 }}>
          <div style={{ position: 'absolute', inset: 0, background: `url(${event.imageUrl || event.image || event.cover}) center/cover` }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(6,8,14,0.95), rgba(6,8,14,0.35))' }} />
          <div style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
            {event.name && <p style={{ fontFamily: FONT, fontSize: 17, fontWeight: 800, letterSpacing: '-0.4px', color: '#fff', margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.name}</p>}
            {(event.dateDisplay || event.city || event.venue) && (
              <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,0.75)', margin: '3px 0 0' }}>
                {[event.dateDisplay, event.city || event.venue].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontFamily: FONT, fontWeight: 800, fontSize: 23, letterSpacing: '-0.6px', color: '#fff', margin: 0 }}>
            Playlist interactive
          </h3>
          <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }}>Propose tes sons, vote pour la soirée</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22, flexShrink: 0 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ width: 3, height: 10, background: C.gold, borderRadius: 2, opacity: 0.75, animation: `lbBar${(i % 3) + 1} 0.7s ease-in-out ${i * 0.1}s infinite alternate` }} />
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatChip label="Tes sons" value={`${songsAdded} / ${ticketCount}`} color={C.gold} />
        <StatChip label="Likes dispo" value={`${likesLeft} / ${MAX_LIKES_PER_USER}`} color={C.teal} />
        <StatChip label="Classement" value={sortedSongs.length} />
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '11px 15px', borderRadius: 12,
          border: isWarn ? '1px solid rgba(234,88,12,0.35)' : '1px solid rgba(78,232,200,0.30)',
          background: isWarn ? 'rgba(234,88,12,0.08)' : 'rgba(78,232,200,0.07)',
          fontFamily: FONT, fontSize: 13.5, fontWeight: 500,
          color: isWarn ? '#fb923c' : C.teal, textAlign: 'center',
        }}>
          {msgText}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, padding: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16 }}>
        {TABS.map(([id, label]) => {
          const active = tab === id
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: '10px 8px', borderRadius: 12, border: 'none', cursor: 'pointer',
              fontFamily: FONT, fontSize: 13.5, fontWeight: active ? 800 : 600, transition: 'all 0.2s',
              color: active ? '#04040b' : 'rgba(255,255,255,0.55)',
              background: active ? `linear-gradient(135deg, ${C.teal}, #7af0d8)` : 'transparent',
            }}>
              {label}{id === 'mine' && mySongs.length ? ` · ${mySongs.length}` : ''}
            </button>
          )
        })}
      </div>

      {/* ── TAB: TOP PLAYLIST ── */}
      {tab === 'top' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedSongs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <MusicNoteIcon size={30} color="rgba(255,255,255,0.12)" />
              <p style={{ fontFamily: FONT, fontSize: 14, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                La playlist est vide — propose le premier son dans « Mes sons ».
              </p>
            </div>
          ) : sortedSongs.map((song, i) => <SongRow key={song.id} song={song} rank={i + 1} />)}
        </div>
      )}

      {/* ── TAB: MES SONS ── */}
      {tab === 'mine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Ajouter un son */}
          {songsRemaining > 0 ? (
            <div>
              <p style={{ ...S.label, marginBottom: 8, letterSpacing: '0.01em', textTransform: 'none', fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.62)' }}>
                Propose un son au DJ — <span style={{ color: C.gold, fontWeight: 700 }}>{songsRemaining} slot{songsRemaining > 1 ? 's' : ''} restant{songsRemaining > 1 ? 's' : ''}</span>
              </p>
              <div style={{ position: 'relative' }}>
                <input
                  style={S.input}
                  placeholder="Rechercher un titre, un artiste…"
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  onFocus={e => (e.target.style.borderColor = C.teal)}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                />
                <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                  {isSearching ? <span style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>…</span> : <SearchIcon />}
                </span>
              </div>

              {searchResults.length > 0 && (
                <div style={{ marginTop: 10, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, overflow: 'hidden', background: 'rgba(6,8,16,0.92)' }}>
                  {searchResults.map((r, idx) => (
                    <div key={idx} style={{ borderBottom: idx < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 }}>
                          {r.artwork && <img src={r.artwork} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <button onClick={() => togglePreview(r)} style={{
                                width: 26, height: 26, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', fontSize: 9,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(255,255,255,0.06)', color: preview?.title === r.title ? C.gold : 'rgba(255,255,255,0.5)',
                                border: preview?.title === r.title ? `1px solid ${C.gold}80` : '1px solid rgba(255,255,255,0.12)',
                              }}>{preview?.title === r.title ? '■' : '▶'}</button>
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 15, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                                <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.artist} · {r.duration}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <button onClick={() => addSong(r)} style={{
                          width: 34, height: 34, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', fontSize: 20, lineHeight: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#04040b',
                          background: `linear-gradient(135deg, ${C.gold}, #e0c48a)`, border: 'none',
                        }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {search.length >= 2 && !isSearching && searchResults.length === 0 && (
                <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 10, textAlign: 'center' }}>Aucun résultat pour « {search} »</p>
              )}
            </div>
          ) : (
            <div style={{ ...S.card, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: C.teal, margin: 0 }}>
                {ticketCount <= 1 ? 'Ton son est dans la playlist' : `${songsAdded} / ${ticketCount} slots utilisés`}
              </p>
              <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                Tu as utilisé tous tes slots · 1 son par billet réservé
              </p>
            </div>
          )}

          {/* Liste de mes sons */}
          <div>
            <p style={{ ...S.label, marginBottom: 10 }}>Mes sons proposés ({mySongs.length})</p>
            {mySongs.length === 0 ? (
              <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,0.4)', margin: 0, textAlign: 'center', padding: '16px 0' }}>
                Tu n'as pas encore proposé de son.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {mySongs.map((song) => {
                  const rank = sortedSongs.findIndex((s) => s.id === song.id) + 1
                  return <SongRow key={song.id} song={song} rank={rank} canDelete />
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: RÈGLES ── */}
      {tab === 'rules' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={S.card}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['Sons autorisés', `${ticketCount} son${ticketCount > 1 ? 's' : ''} — 1 par billet réservé`],
                ['Likes disponibles', `${MAX_LIKES_PER_USER} likes au total pour cet événement`],
                ['Un like par son', 'Tu ne peux liker un son qu\'une seule fois'],
                ['Pas ton propre son', 'Impossible de liker un son que tu as ajouté'],
                ['Le classement est indicatif', 'Il aide le DJ, mais ne décide pas à sa place'],
              ].map(([t, d]) => (
                <div key={t} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <span style={{ marginTop: 3, flexShrink: 0, color: C.teal }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  <div>
                    <p style={{ fontFamily: FONT, fontSize: 14.5, fontWeight: 700, color: '#fff', margin: 0 }}>{t}</p>
                    <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0', lineHeight: 1.45 }}>{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DJ garde le contrôle final */}
          <div style={{ ...S.card, display: 'flex', alignItems: 'flex-start', gap: 12, borderColor: 'rgba(200,169,110,0.28)', background: 'rgba(200,169,110,0.05)' }}>
            <div style={{ marginTop: 2, flexShrink: 0 }}><HeadphonesIcon size={20} color={C.gold} /></div>
            <div>
              <p style={{ fontFamily: FONT, fontSize: 14.5, fontWeight: 700, color: '#fff', margin: 0 }}>{djName} garde le choix final</p>
              <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '3px 0 0', lineHeight: 1.5 }}>
                Le DJ peut ignorer la playlist, y ajouter ses propres sons ou retirer un contenu inapproprié. La playlist reste une suggestion de la salle.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
