import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { DISCS, subscribe, play, stop, toggle, playRandom, setVolume, getSavedDiscId } from '../utils/musicEngine'

// Mapping des images d'ambiance avec des filtres lumineux ajustés pour une meilleure visibilité
const DISC_ASSETS = {
  house: {
    img: '/media1.jpg',
    bgPosition: 'center 40%',
    filter: 'brightness(0.7) saturate(1.4) contrast(1.1) hue-rotate(-20deg)', // Rouge/fuchsia chaud
  },
  afro: {
    img: '/media1.jpg',
    bgPosition: 'center 40%',
    filter: 'brightness(0.7) saturate(1.6) contrast(1.1) hue-rotate(50deg)', // Vert chaud / doré
  },
  techno: {
    img: '/media1.jpg',
    bgPosition: 'center 40%',
    filter: 'brightness(0.7) saturate(1.8) contrast(1.15) hue-rotate(150deg)', // Violet électrique / néon
  },
  lofi: {
    img: '/media3.jpg',
    bgPosition: 'center 35%',
    filter: 'brightness(0.75) sepia(0.2) contrast(1.1)', // Synthétiseur vintage, chaud
  },
  nuit: {
    img: '/media2.jpg',
    bgPosition: 'center 50%',
    filter: 'brightness(0.7) saturate(1.3) contrast(1.1)', // Nuit étoilée Van Gogh, vibrant
  }
}

// Platine vinyle/CD SVG de haute précision — Pastille de couleur dynamique, 
// sillons fins, reflet métallique rotatif réaliste et bras de lecture animé.
function Vinyl({ size = 30, color = '#e05aaa', spinning, arm = false }) {
  const gid = 'v-' + size + '-' + color.replace('#', '')
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.45))' }}>
      <defs>
        {/* Dégradé brillant pour la pastille centrale */}
        <radialGradient id={gid + 'label'} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="30%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0.4" />
        </radialGradient>
        
        {/* Reflet métallique/sheen CD/Vinyle */}
        <linearGradient id={gid + 'sheen'} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.02)" />
          <stop offset="35%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.01)" />
          <stop offset="65%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>
      </defs>

      {/* Disque (tourne) */}
      <g className={spinning ? 'lib-spin' : ''} style={{ transformOrigin: '50px 50px' }}>
        {/* Fond du disque vinyle sombre */}
        <circle cx="50" cy="50" r="48" fill="#08080b" stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" />
        
        {/* Sillons (Grooves) détaillés pour casser le rendu "plat" */}
        <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />

        {/* Pastille de couleur (Sticker central) */}
        <circle cx="50" cy="50" r="15" fill={`url(#${gid}label)`} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        
        {/* Détails du sticker */}
        <circle cx="50" cy="50" r="11" fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="0.8" />
        <circle cx="50" cy="50" r="7" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
        
        {/* Trou central */}
        <circle cx="50" cy="50" r="3" fill="#040406" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />

        {/* Reflet métallique dynamique qui tourne avec le disque */}
        <circle cx="50" cy="50" r="48" fill={`url(#${gid}sheen)`} pointerEvents="none" />
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
  const activeAsset = DISC_ASSETS[current.id]

  return (
    <div style={{ position: 'fixed', right: 14, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 86px)', zIndex: 45, fontFamily: 'Inter, sans-serif' }}>
      {/* Styles CSS injectés pour le zoom d'image et le lift */}
      <style>{`
        .mp-btn-card {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          overflow: hidden;
          height: 48px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s cubic-bezier(0.22,0.9,0.3,1);
        }
        .mp-btn-card:hover {
          transform: translateY(-2px);
        }
        .mp-btn-card:active {
          transform: translateY(0) scale(0.97);
        }
        .mp-btn-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          z-index: 0;
          transition: transform 0.5s cubic-bezier(0.22,0.9,0.3,1);
        }
        .mp-btn-card:hover .mp-btn-bg {
          transform: scale(1.12);
        }
      `}</style>

      {/* Panneau */}
      {open && (
        <div ref={panelRef} style={{
          position: 'absolute', bottom: 64, right: 0, width: 288,
          background: 'rgba(10,10,14,0.92)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 22, boxShadow: '0 32px 64px -16px rgba(0,0,0,0.9)', backdropFilter: 'blur(28px)',
          padding: 14, animation: 'lib-pop 0.2s cubic-bezier(0.22,0.9,0.3,1)',
        }}>
          {/* En-tête */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 2px' }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>Ambiance</span>
            <button onClick={() => playRandom()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, background: 'rgba(224,90,170,0.12)', border: '1px solid rgba(224,90,170,0.3)', color: '#e05aaa', fontFamily: 'Inter, sans-serif', fontSize: 9.5, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }} className="lib-press">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
              Au hasard
            </button>
          </div>

          {/* Now playing card - Rendu premium net avec illustration (sans flou excessif) */}
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 16,
            border: `1px solid ${accent}44`,
            boxShadow: `0 8px 24px -4px ${accent}25`,
            marginBottom: 12,
            overflow: 'hidden',
          }}>
            {/* Image d'ambiance de fond - affichée de façon nette et classe, identique aux boutons */}
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${activeAsset.img})`,
              backgroundSize: 'cover',
              backgroundPosition: activeAsset.bgPosition,
              filter: activeAsset.filter, // Utilise le même filtre propre que le bouton du bas
              zIndex: 0,
            }} />
            {/* Voile dégradé sombre de contraste (style Découvrir les événements) */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(10,10,14,0.3) 0%, rgba(10,10,14,0.88) 100%)',
              zIndex: 1,
            }} />

            {/* Contenu textuel */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <Vinyl size={42} color={accent} spinning={st.playing} arm />
              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.15 }}>
                <p style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '0.01em' }}>{current.name}</p>
                <p style={{ margin: '3px 0 0', fontSize: 9.5, color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter, sans-serif' }}>{st.playing ? 'En lecture…' : current.desc}</p>
              </div>
              <button onClick={() => toggle(current.id)} aria-label={st.playing ? 'Pause' : 'Jouer'}
                className="lib-press"
                style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', border: 'none', background: accent,
                  boxShadow: `0 0 16px ${accent}66`,
                  transition: 'transform 0.2s',
                }}>
                {st.playing
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="#0c0c12"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                  : <svg width="12" height="12" viewBox="0 0 24 24" fill="#0c0c12" style={{ marginLeft: 2 }}><polygon points="6 4 20 12 6 20 6 4" /></svg>}
              </button>
            </div>
          </div>

          {/* Choix des disques — Grille de cartes album premium */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {DISCS.map((d, idx) => {
              const isCur = d.id === current.id
              const asset = DISC_ASSETS[d.id]
              const isLast = idx === DISCS.length - 1
              return (
                <button key={d.id} onClick={() => play(d.id)}
                  className="mp-btn-card"
                  style={{
                    gridColumn: isLast ? '1 / span 2' : undefined,
                    borderColor: isCur ? d.color : 'rgba(255,255,255,0.06)',
                    boxShadow: isCur ? `0 8px 20px ${d.color}25` : '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                >
                  {/* Image d'ambiance de fond avec zoom au survol */}
                  <div className="mp-btn-bg" style={{
                    backgroundImage: `url(${asset.img})`,
                    backgroundPosition: asset.bgPosition,
                    filter: asset.filter,
                  }} />

                  {/* Voile dégradé dynamique (coloré si actif) */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: isCur 
                      ? `linear-gradient(180deg, ${d.color}25 0%, rgba(10,10,14,0.92) 100%)`
                      : 'linear-gradient(180deg, rgba(4,4,8,0.25) 0%, rgba(10,10,14,0.95) 100%)',
                    zIndex: 1,
                  }} />

                  {/* Textes et pastille */}
                  <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                    <Vinyl size={22} color={d.color} spinning={isCur && st.playing} />
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.1 }}>
                      <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 11.5, fontWeight: 800, color: isCur ? '#fff' : 'rgba(255,255,255,0.85)', letterSpacing: '0.01em' }}>{d.name}</span>
                      <span style={{ fontSize: 8, color: isCur ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.3)', letterSpacing: '0.01em', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.desc}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 2px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
            <input type="range" min="0" max="1" step="0.01" value={st.volume} onChange={e => setVolume(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: accent, cursor: 'pointer' }} />
          </div>
        </div>
      )}

      {/* Bouton flottant (disque) — Ouvre/ferme le panneau d'ambiance */}
      <button ref={btnRef}
        onClick={() => setOpen(o => !o)}
        title="Jouer un disque"
        style={{
          position: 'relative', width: 54, height: 54, borderRadius: '50%', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center',
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
