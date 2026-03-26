import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'

const MOCK_SONGS = [
  { id: 1, title: 'Goosebumps', artist: 'Travis Scott', likes: 12, myLike: false, addedBy: 'Alex M.' },
  { id: 2, title: 'Midnight in Paris', artist: 'Kanye West', likes: 9, myLike: false, addedBy: 'Sarah K.' },
  { id: 3, title: 'SICKO MODE', artist: 'Travis Scott', likes: 7, myLike: false, addedBy: 'Tom B.' },
  { id: 4, title: "Money Trees", artist: 'Kendrick Lamar', likes: 5, myLike: true, addedBy: 'Moi' },
  { id: 5, title: "God's Plan", artist: 'Drake', likes: 3, myLike: false, addedBy: 'Julie R.' },
]

const MAX_LIKES_PER_USER = 5

function formatMs(ms) {
  if (!ms) return '?'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function PlaylistSystem({ event, booked }) {
  const { user } = useAuth()
  const userId = getUserId(user)

  // Persist playlist state in localStorage so tab switching doesn't reset it
  const songsKey = `lib_playlist_songs_${event.id}`
  const addedKey = `lib_playlist_added_${event.id}_${userId}`
  const likesKey = `lib_playlist_likes_${event.id}_${userId}`

  function loadSongs() {
    try { return JSON.parse(localStorage.getItem(songsKey)) || MOCK_SONGS } catch { return MOCK_SONGS }
  }
  function loadHasAdded() {
    try { return localStorage.getItem(addedKey) === 'true' } catch { return false }
  }
  function loadLikesUsed() {
    try { return parseInt(localStorage.getItem(likesKey)) || 1 } catch { return 1 }
  }

  const [songs, setSongsState] = useState(loadSongs)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [likesUsed, setLikesUsedState] = useState(loadLikesUsed)
  const [hasAdded, setHasAddedState] = useState(loadHasAdded)
  const [preview, setPreview] = useState(null)
  const [message, setMessage] = useState('')
  const audioRef = useRef(null)
  const debounceRef = useRef(null)

  function setSongs(updater) {
    setSongsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem(songsKey, JSON.stringify(next)) } catch {}
      return next
    })
  }
  function setHasAdded(val) {
    setHasAddedState(val)
    try { localStorage.setItem(addedKey, String(val)) } catch {}
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
      setMessage(`⚠ "${song.title}" est déjà dans la playlist.`)
      setTimeout(() => setMessage(''), 3000)
      return
    }
    const newSong = { id: Date.now(), title: song.title, artist: song.artist, likes: 0, myLike: false, addedBy: 'Moi', previewUrl: song.previewUrl || null }
    setSongs((prev) => [...prev, newSong])
    setHasAdded(true)
    setSearch('')
    setSearchResults([])
    audioRef.current?.pause()
    setPreview(null)
    setMessage(`✓ "${song.title}" ajouté à la playlist !`)
    setTimeout(() => setMessage(''), 3000)
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
      setMessage(`Tu as utilisé tes ${MAX_LIKES_PER_USER} likes maximum.`)
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const sortedSongs = [...songs].sort((a, b) => b.likes - a.likes)

  if (!booked) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-4xl">🔒</p>
        <p className="text-white font-semibold">Playlist réservée aux participants</p>
        <p className="text-gray-500 text-sm">Réserve ta place pour accéder à la playlist interactive.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-semibold">Playlist interactive</h3>
          <p className="text-gray-500 text-xs mt-0.5">
            Likes restants : <span className="text-[#d4af37]">{MAX_LIKES_PER_USER - likesUsed}/{MAX_LIKES_PER_USER}</span>
          </p>
        </div>
        <div className="flex items-end gap-0.5 h-5">
          <div className="w-1 bg-[#d4af37] rounded-full bar-1" style={{ height: 8 }} />
          <div className="w-1 bg-[#d4af37] rounded-full bar-2" style={{ height: 14 }} />
          <div className="w-1 bg-[#d4af37] rounded-full bar-3" style={{ height: 6 }} />
          <div className="w-1 bg-[#d4af37] rounded-full bar-1" style={{ height: 16 }} />
          <div className="w-1 bg-[#d4af37] rounded-full bar-2" style={{ height: 10 }} />
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-xl text-sm text-center border ${
          message.startsWith('⚠')
            ? 'border-orange-500/30 bg-orange-500/10 text-orange-300'
            : 'border-green-500/30 bg-green-500/10 text-green-300'
        }`}>
          {message}
        </div>
      )}

      {/* Add a song */}
      {!hasAdded ? (
        <div>
          <p className="text-gray-500 text-xs mb-2">Recherche un son à proposer au DJ (1 seul autorisé)</p>
          <div className="relative">
            <input
              className="input-dark pr-10"
              placeholder="Titre, artiste..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600">
              {isSearching ? '⏳' : '🔍'}
            </span>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 border border-[#222] rounded-xl overflow-hidden">
              {searchResults.map((r, idx) => (
                <div key={idx} className="border-b border-[#1a1a1a] last:border-0">
                  <div className="flex items-center justify-between p-3 hover:bg-white/5 transition-all gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {/* Artwork */}
                      {r.artwork && (
                        <img src={r.artwork} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      )}
                      {/* Preview + info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => togglePreview(r)}
                            className="w-6 h-6 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-xs text-gray-400 hover:text-white hover:border-[#d4af37] transition-all flex-shrink-0"
                          >
                            {preview?.title === r.title ? '■' : '▶'}
                          </button>
                          <div className="min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{r.title}</p>
                            <p className="text-gray-500 text-xs truncate">{r.artist} · {r.duration}</p>
                          </div>
                        </div>
                        {preview?.title === r.title && (
                          <div className="mt-1.5 ml-8">
                            <div className="h-1 bg-[#222] rounded-full overflow-hidden">
                              <div className="h-full w-1/3 bg-[#d4af37] rounded-full animate-pulse" />
                            </div>
                            <p className="text-gray-600 text-[10px] mt-0.5">Pré-écoute 30s · iTunes</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => addSong(r)}
                      className="w-7 h-7 rounded-full bg-[#d4af37] text-black flex items-center justify-center text-sm font-bold hover:scale-110 transition-transform flex-shrink-0"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {search.length >= 2 && !isSearching && searchResults.length === 0 && (
            <p className="text-gray-600 text-xs mt-2 text-center">Aucun résultat pour "{search}"</p>
          )}
        </div>
      ) : (
        <div className="glass p-3 rounded-xl text-center">
          <p className="text-green-400 text-sm">✓ Tu as déjà ajouté ton son à la playlist</p>
        </div>
      )}

      {/* DJ notice */}
      <div className="flex items-start gap-2 p-3 bg-[#1a1a1a] rounded-xl border border-[#222]">
        <span className="text-lg">🎧</span>
        <div>
          {event.artists?.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {event.artists.map((a, i) => (
                <span key={i} className="text-white text-xs font-semibold">
                  <span className="text-[#d4af37] text-[10px] mr-1">{a.role}</span>{a.name}
                  {i < event.artists.length - 1 && <span className="text-gray-600 ml-1">·</span>}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-white text-xs font-semibold">{event.dj || 'DJ'}</p>
          )}
          <p className="text-gray-500 text-xs">Le DJ peut ignorer ou ajouter ses propres sons. La playlist est indicative.</p>
        </div>
      </div>

      {/* Songs list */}
      <div>
        <h4 className="text-gray-500 text-xs uppercase tracking-widest mb-3">
          Classement ({sortedSongs.length} sons)
        </h4>
        <div className="space-y-2">
          {sortedSongs.map((song, i) => (
            <div
              key={song.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                i === 0 ? 'border-[#d4af37]/30 bg-[#d4af37]/5' : 'border-[#1a1a1a] hover:border-[#222]'
              }`}
            >
              <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${i === 0 ? 'text-[#d4af37]' : 'text-gray-700'}`}>
                {i + 1}
              </span>
              {/* Preview play button for ranked songs */}
              {song.previewUrl ? (
                <button
                  onClick={() => togglePreview(song)}
                  className="w-6 h-6 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-xs text-gray-400 hover:text-white hover:border-[#d4af37] transition-all flex-shrink-0"
                >
                  {preview?.title === song.title ? '■' : '▶'}
                </button>
              ) : (
                <div className="w-6 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${i === 0 ? 'text-white' : 'text-gray-300'}`}>{song.title}</p>
                <p className="text-gray-600 text-xs truncate">{song.artist}
                  {preview?.title === song.title && (
                    <span className="ml-2 text-[#d4af37] text-[10px] animate-pulse">▶ en cours</span>
                  )}
                </p>
              </div>
              <span className="text-gray-700 text-[10px] flex-shrink-0">{song.addedBy}</span>
              <button
                onClick={() => toggleLike(song.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold transition-all ${
                  song.myLike
                    ? 'border-[#d4af37] bg-[#d4af37]/10 text-[#d4af37]'
                    : 'border-[#222] text-gray-600 hover:border-gray-500 hover:text-gray-400'
                }`}
              >
                ♥ {song.likes}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
