import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { DISCS, subscribe, play, stop, toggle, playRandom, setVolume, getSavedDiscId } from '../utils/musicEngine'

// Platine vinyle SVG — disque noir à sillons + pastille « disque d'or » + bras
// de lecture qui s'avance vers le centre quand ça joue. `arm` active le bras
// (pour les grandes vignettes : bouton flottant + now-playing).
function Vinyl({ size = 30, color = '#e05aaa', spinning, arm = false }) {
  const gid = 'g' + size
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <radialGradient id={gid + 'gold'} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fcf6ba" />
          <stop offset="35%" stopColor="#e0b94e" />
          <stop offset="70%" stopColor="#b38728" />
          <stop offset="100%" stopColor="#8a6516" />
        </radialGradient>
      </defs>
      {/* Disque (tourne) */}
      <g className={spinning ? 'lib-spin' : ''} style={{ transformOrigin: '50px 50px' }}>
        <circle cx="50" cy="50" r="48" fill="#0b0b10" stroke="rgba(255,255,255,0.10)" strokeWidth="1.5" />
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <circle cx="50" cy="50" r="35" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        {/* pastille or */}
        <circle cx="50" cy="50" r="18" fill={`url(#${gid}gold)`} stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
        <circle cx="50" cy="50" r="3" fill="#0b0b10" />
        {/* éclat qui tourne avec le disque */}
        <path d="M50 4 A46 46 0 0 1 88 28" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      {/* Bras de lecture (fixe, pivote) */}
      {arm && (
        <g className="lib-tonearm" style={{ transform: spinning ? 'rotate(0deg)' : 'rotate(-22deg)' }}>
          <line x1="80" y1="18" x2="55" y2="46" stroke="#d8d8de" strokeWidth="3.4" strokeLinecap="round" />
          <line x1="80" y1="18" x2="55" y2="46" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
          <circle cx="80" cy="18" r="5" fill="#2a2a30" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <circle cx="55" cy="46" r="2.6" fill="#555" />
        </g>
      )}
    </svg>
  )
}

const HIDE_ON = ['/messagerie', '/scanner', '/ticket', '/connexion', '/paiement', '/boost-active']

export default function MusicPlayer() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [st, setSt] = useState({ playing: false, discId: getSavedDiscId(), volume: 0.5 })
  const panelRef = useRef(null)
  const btnRef = useRef(null)

  useEffect(() => subscribe(setSt), [])

  // Fermer le panneau au clic extérieur
  useEffect(() => {
    if (!open) return
    const h = e => {
      if (panelRef.current && !panelRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  if (HIDE_ON.some(p => location.pathname.startsWith(p))) return null

  const current = DISCS.find(d => d.id === st.discId) || DISCS[0]
  const accent = current.color

  return (
    <div style={{ position: 'fixed', right: 14, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 86px)', zIndex: 45, fontFamily: 'Inter, sans-serif' }}>
      {/* Panneau */}
      {open && (
        <div ref={panelRef} style={{
          position: 'absolute', bottom: 64, right: 0, width: 268,
          background: '#101014', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 20, boxShadow: '0 30px 60px -15px rgba(0,0,0,0.85)', backdropFilter: 'blur(22px)',
          padding: 14, animation: 'lib-pop 0.18s ease',
        }}>
          {/* En-tête */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Ambiance</span>
            <button onClick={() => playRandom()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, background: 'rgba(224,90,170,0.12)', border: '1px solid rgba(224,90,170,0.3)', color: '#e05aaa', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
              Au hasard
            </button>
          </div>

          {/* Now playing */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 12 }}>
            <Vinyl size={42} color={accent} spinning={st.playing} arm />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800, color: '#fff' }}>{current.name}</p>
              <p style={{ margin: '1px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{st.playing ? 'En lecture…' : current.desc}</p>
            </div>
            <button onClick={() => toggle(current.id)} aria-label={st.playing ? 'Pause' : 'Jouer'}
              style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', background: accent, boxShadow: `0 6px 18px ${accent}55` }}>
              {st.playing
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="#0c0c12"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="#0c0c12" style={{ marginLeft: 2 }}><polygon points="6 4 20 12 6 20 6 4" /></svg>}
            </button>
          </div>

          {/* Choix des disques */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
            {DISCS.map(d => {
              const isCur = d.id === current.id
              return (
                <button key={d.id} onClick={() => play(d.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', borderRadius: 11, cursor: 'pointer', textAlign: 'left',
                    background: isCur ? `${d.color}1a` : 'rgba(255,255,255,0.025)',
                    border: `1px solid ${isCur ? d.color + '55' : 'rgba(255,255,255,0.06)'}` }}>
                  <Vinyl size={22} color={d.color} spinning={isCur && st.playing} />
                  <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 700, color: isCur ? '#fff' : 'rgba(255,255,255,0.6)' }}>{d.name}</span>
                </button>
              )
            })}
          </div>

          {/* Volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
            <input type="range" min="0" max="1" step="0.01" value={st.volume} onChange={e => setVolume(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: accent, cursor: 'pointer' }} />
          </div>
        </div>
      )}

      {/* Bouton flottant (disque) — 1er tap : lance un disque AU HASARD + ouvre
          le panneau (pour voir ce qui joue / changer). Ensuite : ouvre/ferme. */}
      <button ref={btnRef}
        onClick={() => { if (!st.playing && !open) { playRandom(); setOpen(true) } else setOpen(o => !o) }}
        title="Jouer un disque"
        style={{
          position: 'relative', width: 54, height: 54, borderRadius: '50%', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(16,16,20,0.85)', backdropFilter: 'blur(14px)',
          border: `1px solid ${st.playing ? accent + '66' : 'rgba(255,255,255,0.1)'}`,
          boxShadow: st.playing ? `0 8px 28px ${accent}40, 0 0 0 1px ${accent}22` : '0 8px 24px rgba(0,0,0,0.5)',
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}>
        <Vinyl size={30} color={accent} spinning={st.playing} arm />
        {st.playing && <span style={{ position: 'absolute', top: 4, right: 4, width: 9, height: 9, borderRadius: '50%', background: accent, boxShadow: `0 0 8px ${accent}`, animation: 'lib-pulse 1.4s infinite' }} />}
      </button>
    </div>
  )
}
