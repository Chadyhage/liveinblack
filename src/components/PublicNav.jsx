import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AnimatedLogo from './AnimatedLogo'

// ─── Navbar publique unifiée (vitrine) ───────────────────────────────────────
// Vidéo d'ambiance en fond + vrai logo + onglet actif souligné (trait émeraude).
// Utilisée par toutes les pages publiques (landing, prestataires, à propos) pour
// une expérience cohérente.

const C = { obsidian: '#04040b', teal: '#4ee8c8' }
const FONT = 'Inter, sans-serif'

const LINKS = [
  ['Événements', '/evenements'],
  ['Prestataires', '/prestataires'],
  ['À propos de nous', '/c-est-quoi'],
]

export default function PublicNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()

  const isActive = (path) => path === '/evenements' ? pathname.startsWith('/evenements') : pathname === path

  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 20, overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
      <style>{`
        .lb-pubnav-link{ display:none }
        @media(min-width:760px){ .lb-pubnav-link{ display:inline-flex } }
      `}</style>
      {/* Vidéo d'ambiance */}
      <video autoPlay muted loop playsInline preload="auto" aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45, pointerEvents: 'none' }}>
        <source src="/nav-ambience.mp4" type="video/mp4" />
      </video>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(4,4,11,.85) 0%, rgba(4,4,11,.45) 45%, rgba(4,4,11,.86) 100%)', backdropFilter: 'blur(1.5px)' }} />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '9px 18px' }}>
        <AnimatedLogo size={26} textScale={0.44} onClick={() => navigate('/accueil')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {LINKS.map(([label, path]) => {
            const active = isActive(path)
            return (
              <button key={path} onClick={() => navigate(path)} className="lb-pubnav-link"
                style={{
                  position: 'relative', flexDirection: 'column', alignItems: 'center',
                  background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT,
                  fontSize: 13, fontWeight: active ? 800 : 600,
                  color: active ? '#fff' : 'rgba(255,255,255,.7)',
                  padding: '8px 12px', whiteSpace: 'nowrap', transition: 'color .2s ease',
                }}>
                {label}
                {/* Trait actif — émeraude, comme la nav connectée */}
                <span style={{
                  position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
                  height: 2, borderRadius: 2, transition: 'width .28s cubic-bezier(.22,.9,.3,1)',
                  width: active ? '62%' : 0,
                  background: 'linear-gradient(90deg, rgba(52,211,153,.4), #34d399, rgba(52,211,153,.4))',
                  boxShadow: '0 0 10px rgba(52,211,153,.7)',
                }} />
              </button>
            )
          })}
          {user ? (
            <button onClick={() => navigate('/accueil')} style={{ ...ctaBtn }}>Mon espace</button>
          ) : (
            <>
              <button onClick={() => navigate('/connexion')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.7)', padding: '8px 10px', whiteSpace: 'nowrap' }}>Connexion</button>
              <button onClick={() => navigate('/connexion?mode=register')} style={ctaBtn}>Créer un compte</button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

const ctaBtn = { padding: '8px 15px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.obsidian, background: `linear-gradient(135deg,${C.teal},#7af0d8)`, border: 'none', whiteSpace: 'nowrap' }
