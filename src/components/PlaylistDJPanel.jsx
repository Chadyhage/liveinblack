import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'

// ─── Interface DJ / organisateur de la playlist ───────────────────────────────
// Le DJ/orga voit tous les sons proposés, écoute, trie, valide/refuse/marque
// joué, retire un contenu, ajoute ses propres sons et exporte la liste.
// Source partagée : event_playlists/{eventId}.songs (mêmes transactions ciblées
// que la vue participant → pas d'écrasement des ajouts/likes concurrents).

const FONT = 'Inter, sans-serif'
const C = { teal: '#4ee8c8', gold: '#c8a96e', violet: '#8b5cf6', pink: '#e05aaa' }

const STATUS = {
  validated: { label: 'Validé', color: C.teal },
  refused:   { label: 'Refusé', color: C.pink },
  played:    { label: 'Joué',   color: C.violet },
}

function fmtMs(ms) { if (!ms) return ''; const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

export default function PlaylistDJPanel({ event }) {
  const { user } = useAuth()
  const userId = getUserId(user)
  const [songs, setSongs] = useState([])
  const [sort, setSort] = useState('likes') // likes | recent
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [preview, setPreview] = useState(null)
  const [toast, setToast] = useState('')
  const [copied, setCopied] = useState(false)
  const audioRef = useRef(null)
  const debRef = useRef(null)

  useEffect(() => {
    if (!event?.id) return
    let unsub = () => {}, cancelled = false
    import('../utils/firestore-sync').then(({ listenDoc }) => {
      if (cancelled) return
      unsub = listenDoc(`event_playlists/${event.id}`, data => {
        if (!Array.isArray(data?.songs)) { setSongs([]); return }
        setSongs(data.songs)
      })
    }).catch(() => {})
    return () => { cancelled = true; unsub() }
  }, [event?.id])

  useEffect(() => () => audioRef.current?.pause(), [])

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2500) }

  function patchStatus(song, status) {
    // Toggle : re-cliquer sur le même statut le retire
    const next = song.status === status ? null : status
    setSongs(prev => prev.map(s => s.id === song.id ? { ...s, status: next } : s))
    import('../utils/firestore-sync').then(({ mergeItemsById }) => {
      mergeItemsById(`event_playlists/${event.id}`, { field: 'songs', patches: [{ id: song.id, set: { status: next } }] })
    }).catch(() => {})
    if (next) flash(`« ${song.title} » → ${STATUS[next].label}`)
  }

  function remove(song) {
    setSongs(prev => prev.filter(s => s.id !== song.id))
    import('../utils/firestore-sync').then(({ mergeItemsById }) => {
      mergeItemsById(`event_playlists/${event.id}`, { field: 'songs', removeIds: [song.id] })
    }).catch(() => {})
    if (preview?.title === song.title) { audioRef.current?.pause(); setPreview(null) }
    flash(`« ${song.title} » retiré`)
  }

  function togglePreview(song) {
    if (preview?.title === song.title) { audioRef.current?.pause(); setPreview(null); return }
    audioRef.current?.pause()
    if (song.previewUrl) { audioRef.current = new Audio(song.previewUrl); audioRef.current.play().catch(() => {}) }
    setPreview(song)
  }

  function doSearch(val) {
    setSearch(val)
    clearTimeout(debRef.current)
    if (val.length < 2) { setResults([]); return }
    debRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(val)}&media=music&entity=song&limit=8`)
        const data = await res.json()
        setResults(data.results.map(r => ({ title: r.trackName, artist: r.artistName, duration: fmtMs(r.trackTimeMillis), previewUrl: r.previewUrl, artwork: r.artworkUrl60 })))
      } catch { setResults([]) } finally { setSearching(false) }
    }, 400)
  }

  function addAsDJ(r) {
    if (songs.find(s => s.title.toLowerCase() === r.title.toLowerCase())) { flash('Déjà dans la playlist'); return }
    const cover = r.artwork ? r.artwork.replace('60x60', '200x200') : null
    const newSong = { id: Date.now(), title: r.title, artist: r.artist, likes: 0, addedBy: 'DJ', userId, previewUrl: r.previewUrl || null, cover, status: 'validated' }
    setSongs(prev => [...prev, newSong])
    import('../utils/firestore-sync').then(({ mergeItemsById }) => {
      mergeItemsById(`event_playlists/${event.id}`, { field: 'songs', upserts: [newSong] })
    }).catch(() => {})
    setSearch(''); setResults([])
    flash(`« ${r.title} » ajouté par le DJ`)
  }

  function exportList() {
    const lines = ordered.map((s, i) => `${i + 1}. ${s.title} — ${s.artist}${s.status ? ` [${STATUS[s.status].label}]` : ''}`).join('\n')
    const text = `Playlist — ${event.name || 'Événement'}\n\n${lines}`
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2200) }
    try {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(done)
      else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') } catch {} document.body.removeChild(ta); done() }
    } catch { done() }
  }

  const ordered = [...songs].sort((a, b) => sort === 'likes' ? (b.likes || 0) - (a.likes || 0) : (b.id || 0) - (a.id || 0))

  const iconBtn = (color, active) => ({
    width: 34, height: 34, borderRadius: 10, flexShrink: 0, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? `${color}1f` : 'rgba(255,255,255,0.08)',
    border: `1px solid ${active ? `${color}80` : 'rgba(255,255,255,0.12)'}`, color: active ? color : 'rgba(255,255,255,0.65)',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontFamily: FONT, fontWeight: 800, fontSize: 22, letterSpacing: '-0.5px', color: '#fff', margin: 0 }}>Gestion playlist</h3>
          <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '3px 0 0' }}>{songs.length} son{songs.length > 1 ? 's' : ''} proposé{songs.length > 1 ? 's' : ''} · tu gardes le contrôle final</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportList} style={{ padding: '9px 16px', borderRadius: 11, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#181203', background: C.gold, border: '1px solid rgba(255,255,255,0.14)' }}>
            {copied ? 'Copié' : 'Exporter'}
          </button>
        </div>
      </div>

      {toast && (
        <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(12,12,22,0.96)', border: '1px solid rgba(78,232,200,0.5)', fontFamily: FONT, fontSize: 13.5, color: C.teal, textAlign: 'center' }}>{toast}</div>
      )}

      {/* Ajouter un son (DJ) */}
      <div>
        <div style={{ position: 'relative' }}>
          <input value={search} onChange={e => doSearch(e.target.value)} placeholder="Rechercher un titre, un artiste…"
            style={{ width: '100%', boxSizing: 'border-box', background: '#0b0c12', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontFamily: FONT, fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.92)', padding: '13px 14px', outline: 'none' }} />
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: 10, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, overflow: 'hidden', background: '#12131c', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
            {results.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 11, borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                {r.artwork && <img src={r.artwork} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14.5, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                  <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.artist} · {r.duration}</p>
                </div>
                <button onClick={() => addAsDJ(r)} title="Ajouter à la playlist" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', fontSize: 18, color: '#181203', background: C.gold, border: 'none' }}>+</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tri */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[['likes', 'Par likes'], ['recent', 'Plus récents']].map(([id, label]) => (
          <button key={id} onClick={() => setSort(id)} style={{
            padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700,
            color: sort === id ? C.teal : 'rgba(255,255,255,0.55)',
            background: sort === id ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${sort === id ? 'rgba(78,232,200,0.4)' : 'rgba(255,255,255,0.1)'}`,
          }}>{label}</button>
        ))}
      </div>

      {/* Liste */}
      {ordered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="rgba(255,255,255,0.35)" xmlns="http://www.w3.org/2000/svg"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          </div>
          <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>Aucun son proposé pour l'instant</p>
          <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0, maxWidth: 300, lineHeight: 1.5 }}>Les propositions des participants apparaîtront ici. Tu peux aussi ajouter tes propres sons.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ordered.map((song) => {
            const st = song.status ? STATUS[song.status] : null
            const playing = preview?.title === song.title
            return (
              <div key={song.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: '#0e0f16', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', flexWrap: 'wrap' }}>
                <button onClick={() => song.previewUrl && togglePreview(song)} style={{
                  width: 42, height: 42, borderRadius: 9, flexShrink: 0, overflow: 'hidden', position: 'relative', padding: 0,
                  border: playing ? `1px solid ${C.gold}90` : '1px solid rgba(255,255,255,0.1)',
                  background: song.cover ? `url(${song.cover}) center/cover` : 'rgba(255,255,255,0.05)', cursor: song.previewUrl ? 'pointer' : 'default',
                }}>
                  {song.previewUrl && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', color: '#fff', fontSize: 11 }}>{playing ? '■' : '▶'}</span>}
                </button>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontFamily: FONT, fontWeight: 700, fontSize: 15, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</p>
                    {st && <span style={{ flexShrink: 0, fontFamily: FONT, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: st.color, background: `${st.color}1f`, border: `1px solid ${st.color}55`, borderRadius: 8, padding: '3px 8px' }}>{st.label}</span>}
                  </div>
                  <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {song.artist} · <span style={{ color: C.teal }}>{song.likes || 0} like{(song.likes || 0) > 1 ? 's' : ''}</span>{song.addedBy === 'DJ' ? ' · ajouté par toi' : ''}
                  </p>
                </div>
                {/* Actions DJ */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => patchStatus(song, 'validated')} title="Valider" style={iconBtn(C.teal, song.status === 'validated')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </button>
                  <button onClick={() => patchStatus(song, 'refused')} title="Refuser" style={iconBtn(C.pink, song.status === 'refused')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                  <button onClick={() => patchStatus(song, 'played')} title="Marquer joué" style={iconBtn(C.violet, song.status === 'played')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" /></svg>
                  </button>
                  <button onClick={() => remove(song)} title="Supprimer" style={iconBtn(C.pink, false)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
