import { useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import AnimatedLogo from './AnimatedLogo'

// ─── Navbar publique unifiée (vitrine) ───────────────────────────────────────
// Vidéo d'ambiance en fond + vrai logo + onglet actif souligné (trait émeraude).
// Utilisée par toutes les pages publiques (landing, prestataires, à propos) pour
// une expérience cohérente.

const C = { obsidian: '#04040b', teal: '#4ee8c8' }
const FONT = 'Inter, sans-serif'

const LINKS = [
  ['Accueil', '/accueil'],
  ['Événements', '/evenements'],
  ['Organisateurs', '/organisateurs'],
  ['Prestataires', '/prestataires'],
  ['Live in Black, c’est quoi ?', '/c-est-quoi'],
  ["J’ai un code", '/evenements?code=1'],
]

export default function PublicNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (path) => path === '/evenements' ? pathname.startsWith('/evenements') : pathname.startsWith(path)

  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 20, overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
      <style>{`
        .lb-pubnav-link{ display:none }
        .lb-pubnav-menu{display:inline-flex}
        .lb-pubnav-mobile{display:flex}
        @media(min-width:1120px){ .lb-pubnav-link{ display:inline-flex } .lb-pubnav-menu{display:none}.lb-pubnav-mobile{display:none} }
        @media(max-width:560px){
          .lb-pubnav-login{display:none}
          .lb-pubnav-logo{width:122px;height:26px;transform:scale(.72);transform-origin:left center}
          .lb-pubnav-cta{padding:8px 10px!important;font-size:11px!important}
        }
      `}</style>
      {/* Vidéo d'ambiance */}
      <video autoPlay muted loop playsInline preload="auto" aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45, pointerEvents: 'none' }}>
        <source src="/nav-ambience.mp4" type="video/mp4" />
      </video>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(4,4,11,.93) 0%, rgba(4,4,11,.88) 45%, rgba(4,4,11,.93) 100%)', backdropFilter: 'blur(8px)' }} />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '9px 18px' }}>
        <div className="lb-pubnav-logo"><AnimatedLogo size={26} textScale={0.44} onClick={() => navigate('/accueil')} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {LINKS.map(([label, path]) => {
            const active = isActive(path)
            return (
              <button key={`${label}-${path}`} onClick={() => navigate(path)} className="lb-pubnav-link"
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
                  background: '#34d399',
                }} />
              </button>
            )
          })}
          {user ? (
            <button onClick={() => navigate('/accueil')} style={{ ...ctaBtn }}>Mon espace</button>
          ) : (
            <>
              <button className="lb-pubnav-login" onClick={() => navigate('/connexion')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.7)', padding: '8px 10px', whiteSpace: 'nowrap' }}>Connexion</button>
              <button className="lb-pubnav-cta" onClick={() => navigate('/connexion?mode=register')} style={ctaBtn}>Créer un compte</button>
            </>
          )}
          <button onClick={() => navigate('/recherche')} aria-label="Recherche globale" style={{width:35,height:35,borderRadius:'50%',background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.14)',color:'rgba(255,255,255,.75)',display:'grid',placeItems:'center',cursor:'pointer'}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></button>
          <button className="lb-pubnav-menu" aria-label="Ouvrir le menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen(v => !v)} style={{width:38,height:38,alignItems:'center',justifyContent:'center',background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.14)',color:'#fff',borderRadius:10,cursor:'pointer'}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        </div>
      </div>
      {mobileOpen && <div className="lb-pubnav-mobile" style={{position:'relative',flexDirection:'column',gap:3,padding:'8px 14px 16px',background:'#0a0b12',borderTop:'1px solid rgba(255,255,255,.08)',boxShadow:'0 24px 64px rgba(0,0,0,.55)'}}>{LINKS.map(([label,path], index)=><button key={`${label}-${index}`} onClick={()=>{navigate(path);setMobileOpen(false)}} style={{padding:'12px 12px',background:isActive(path)?'rgba(78,232,200,.08)':'none',border:0,borderLeft:`2px solid ${isActive(path)?C.teal:'transparent'}`,color:isActive(path)?C.teal:'rgba(255,255,255,.75)',textAlign:'left',fontFamily:FONT,fontSize:13,fontWeight:600,cursor:'pointer'}}>{label}</button>)}</div>}
    </nav>
  )
}

const ctaBtn = { padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#04120e', background: '#3ed6b5', border: 'none', whiteSpace: 'nowrap' }
