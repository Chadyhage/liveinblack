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
function SearchIcon({ size = 14, color = 'rgba(255,255,255,0.3)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

const S = {
  card: {
    background: 'rgba(8,10,20,0.55)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    padding: '14px 16px',
  },
  label: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.42)',
  },
  input: {
    background: 'rgba(6,8,16,0.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 13,
    color: 'white',
    padding: '10px 36px 10px 12px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  },
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
  const audioRef = useRef(null)
  const debounceRef = useRef(null)

  const songsRemaining = Math.max(0, ticketCount - songsAdded)

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
    const newSong = { id: Date.now(), title: song.title, artist: song.artist, likes: 0, myLike: false, addedBy: 'Moi', previewUrl: song.previewUrl || null }
    setSongs((prev) => [...prev, newSong])
    incrementSongsAdded()
    setSearch('')
    setSearchResults([])
    audioRef.current?.pause()
    setPreview(null)
    const remaining = songsRemaining - 1
    setMessage(remaining > 0
      ? `ok:"${song.title}" ajouté ! Il te reste ${remaining} son${remaining > 1 ? 's' : ''} à proposer.`
      : `ok:"${song.title}" ajouté à la playlist !`)
    setTimeout(() => setMessage(''), 4000)
  }

  function toggleLike(songId) {
    const song = songs.find((s) => s.id === songId)
    if (!song) return
    if (song.myLike) {
      setLikesUsed((l) => l - 1)
      setSongs((prev) => prev.map((s) => s.id === songId ? { ...s, likes: s.likes - 1, myLike: false } : s).sort((a, b) => b.likes - a.likes))
    } else if (likesUsed < MAX_LIKES_PER_USER) {
      setLikesUsed((l) => l + 1)
      setSongs((prev) => prev.map((s) => s.id === songId ? { ...s, likes: s.likes + 1, myLike: true } : s).sort((a, b) => b.likes - a.likes))
    } else {
      setMessage(`warn:Tu as utilisé tes ${MAX_LIKES_PER_USER} likes maximum.`)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const sortedSongs = [...songs].sort((a, b) => b.likes - a.likes)

  const isWarn = message.startsWith('warn:')
  const isOk = message.startsWith('ok:')
  const msgText = isWarn ? message.slice(5) : isOk ? message.slice(3) : message

  if (!booked) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <LockIcon size={36} color="rgba(255,255,255,0.15)" />
        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 20, color: 'white', margin: 0 }}>
          Playlist réservée aux participants
        </p>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', letterSpacing: '0.1em', margin: 0 }}>
          Réserve ta place pour accéder à la playlist interactive.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 22, color: 'white', margin: 0 }}>
            Playlist interactive
          </h3>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 4 }}>
            Likes restants :{' '}
            <span style={{ color: '#c8a96e' }}>{MAX_LIKES_PER_USER - likesUsed}/{MAX_LIKES_PER_USER}</span>
          </p>
        </div>
        {/* Animated equalizer bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 20 }}>
          {[8, 14, 6, 16, 10].map((h, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: h,
                background: '#c8a96e',
                borderRadius: 2,
                opacity: 0.7,
                animation: `bar${(i % 3) + 1} 0.8s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          border: isWarn
            ? '1px solid rgba(234,88,12,0.35)'
            : '1px solid rgba(78,232,200,0.30)',
          background: isWarn
            ? 'rgba(234,88,12,0.08)'
            : 'rgba(78,232,200,0.07)',
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          letterSpacing: '0.05em',
          color: isWarn ? '#fb923c' : '#4ee8c8',
          textAlign: 'center',
        }}>
          {msgText}
        </div>
      )}

      {/* Add a song */}
      {songsRemaining > 0 ? (
        <div>
          <p style={{ ...S.label, marginBottom: 8 }}>
            Propose un son au DJ —{' '}
            <span style={{ color: '#c8a96e' }}>
              {songsRemaining} slot{songsRemaining > 1 ? 's' : ''} restant{songsRemaining > 1 ? 's' : ''}
            </span>
            {ticketCount > 1 && (
              <span style={{ color: 'rgba(255,255,255,0.25)' }}> · {ticketCount} billets</span>
            )}
          </p>
          <div style={{ position: 'relative' }}>
            <input
              style={S.input}
              placeholder="Titre, artiste..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={e => (e.target.style.borderColor = '#4ee8c8')}
              onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.10)')}
            />
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
              {isSearching
                ? <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>…</span>
                : <SearchIcon />
              }
            </span>
          </div>

          {searchResults.length > 0 && (
            <div style={{
              marginTop: 8,
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'rgba(6,8,16,0.90)',
            }}>
              {searchResults.map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    borderBottom: idx < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      {r.artwork && (
                        <img src={r.artwork} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            onClick={() => togglePreview(r)}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: 'rgba(255,255,255,0.06)',
                              border: preview?.title === r.title ? '1px solid rgba(200,169,110,0.50)' : '1px solid rgba(255,255,255,0.12)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: "'DM Mono', monospace",
                              fontSize: 9,
                              color: preview?.title === r.title ? '#c8a96e' : 'rgba(255,255,255,0.5)',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            {preview?.title === r.title ? '■' : '▶'}
                          </button>
                          <div style={{ minWidth: 0 }}>
                            <p style={{
                              fontFamily: "'Cormorant Garamond', serif",
                              fontWeight: 400,
                              fontSize: 15,
                              color: 'white',
                              margin: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>{r.title}</p>
                            <p style={{
                              fontFamily: "'DM Mono', monospace",
                              fontSize: 9,
                              color: 'rgba(255,255,255,0.42)',
                              margin: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>{r.artist} · {r.duration}</p>
                          </div>
                        </div>
                        {preview?.title === r.title && (
                          <div style={{ marginTop: 8, paddingLeft: 32 }}>
                            <div style={{ height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 1, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: '33%', background: '#c8a96e', borderRadius: 1 }} />
                            </div>
                            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 3 }}>
                              Pré-écoute 30s · iTunes
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => addSong(r)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                        border: '1px solid rgba(200,169,110,0.45)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 16,
                        color: '#c8a96e',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {search.length >= 2 && !isSearching && searchResults.length === 0 && (
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 8, textAlign: 'center' }}>
              Aucun résultat pour "{search}"
            </p>
          )}
        </div>
      ) : (
        <div style={{
          ...S.card,
          textAlign: 'center',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#4ee8c8', letterSpacing: '0.1em', margin: 0 }}>
            {songsAdded} son{songsAdded > 1 ? 's' : ''} ajouté{songsAdded > 1 ? 's' : ''} sur {ticketCount}
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', margin: 0, letterSpacing: '0.06em' }}>
            Tu as utilisé tous tes slots · 1 son par billet réservé
          </p>
        </div>
      )}

      {/* DJ notice */}
      <div style={{
        ...S.card,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}>
        <div style={{ marginTop: 2, flexShrink: 0 }}>
          <HeadphonesIcon size={18} color="#c8a96e" />
        </div>
        <div>
          {event.artists?.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {event.artists.map((a, i) => (
                <span key={i} style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'white' }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#c8a96e', marginRight: 4, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {a.role}
                  </span>
                  {a.name}
                  {i < event.artists.length - 1 && (
                    <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: 6 }}>·</span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'white', margin: 0 }}>
              {event.dj || 'DJ'}
            </p>
          )}
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 4, letterSpacing: '0.05em' }}>
            Le DJ peut ignorer ou ajouter ses propres sons. La playlist est indicative.
          </p>
        </div>
      </div>

      {/* Songs list */}
      <div>
        <p style={{ ...S.label, marginBottom: 12 }}>
          Classement ({sortedSongs.length} son{sortedSongs.length !== 1 ? 's' : ''})
        </p>
        {sortedSongs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '28px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <MusicNoteIcon size={28} color="rgba(255,255,255,0.10)" />
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: 0, letterSpacing: '0.1em' }}>
              La playlist est vide — sois le premier à proposer un son
            </p>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedSongs.map((song, i) => (
            <div
              key={song.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 10,
                border: i === 0 ? '1px solid rgba(200,169,110,0.30)' : '1px solid rgba(255,255,255,0.07)',
                background: i === 0 ? 'rgba(200,169,110,0.05)' : 'rgba(8,10,20,0.35)',
                transition: 'border-color 0.2s',
              }}
            >
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 10,
                fontWeight: 700,
                width: 18,
                textAlign: 'center',
                flexShrink: 0,
                color: i === 0 ? '#c8a96e' : 'rgba(255,255,255,0.2)',
              }}>
                {i + 1}
              </span>

              {/* Preview play button for ranked songs */}
              {song.previewUrl ? (
                <button
                  onClick={() => togglePreview(song)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                    border: preview?.title === song.title ? '1px solid rgba(200,169,110,0.50)' : '1px solid rgba(255,255,255,0.10)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 8,
                    color: preview?.title === song.title ? '#c8a96e' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {preview?.title === song.title ? '■' : '▶'}
                </button>
              ) : (
                <div style={{ width: 24, flexShrink: 0 }} />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontWeight: i === 0 ? 400 : 300,
                  fontSize: 16,
                  color: i === 0 ? 'white' : 'rgba(255,255,255,0.75)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {song.title}
                </p>
                <p style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.35)',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {song.artist}
                  {preview?.title === song.title && (
                    <span style={{ marginLeft: 8, color: '#c8a96e' }}>▶ en cours</span>
                  )}
                </p>
              </div>

              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                {song.addedBy}
              </span>

              <button
                onClick={() => toggleLike(song.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 10px',
                  borderRadius: 4,
                  border: song.myLike ? '1px solid rgba(78,232,200,0.40)' : '1px solid rgba(255,255,255,0.10)',
                  background: song.myLike ? 'rgba(78,232,200,0.08)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
              >
                <HeartIcon filled={song.myLike} size={11} color={song.myLike ? '#4ee8c8' : 'rgba(255,255,255,0.3)'} />
                <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  color: song.myLike ? '#4ee8c8' : 'rgba(255,255,255,0.3)',
                }}>
                  {song.likes}
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
