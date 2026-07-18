import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

// Splash d'entrée : le logo LIVEINBLACK apparaît plein écran puis "vole" se
// repositionner sur sa place exacte dans la navbar. La cible est MESURÉE en
// direct ([data-navlogo]), donc l'atterrissage est juste sur mobile comme
// desktop. Court (~1,2 s), tap pour passer, respecte prefers-reduced-motion.
//
// Déclenché à chaque arrivée sur /accueil : chargement initial, reload (on
// atterrit sur /accueil via la redirection racine), clic Accueil, et connexion
// (qui renvoie sur /accueil).

function BigLogo({ reveal }) {
  return (
    <div className="lib-intro-logo" style={{ display: 'flex', alignItems: 'center', gap: 'clamp(7px, 1.8vw, 13px)', fontFamily: "'Syne', sans-serif", maxWidth: '94vw' }}>
      {/* Icône */}
      <div style={{ position: 'relative', width: 'clamp(50px, 13vw, 80px)', height: 'clamp(50px, 13vw, 80px)', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: '-30%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,121,249,0.22), transparent 65%)', filter: 'blur(8px)' }} className={reveal ? 'lib-glow-in' : ''} />
        <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" className={reveal ? 'lib-star-in' : ''} style={{ position: 'absolute', inset: 0 }}>
          <path d="M50 5 L60 40 L95 50 L60 60 L50 95 L40 60 L5 50 L40 40 Z" fill="none" stroke="#e879f9" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
        <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" style={{ position: 'absolute', inset: 0, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.9))' }}>
          <path d="M22 50C22 50 35 32 50 32C65 32 78 50 78 50" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M22 50C22 50 35 68 50 68C65 68 78 50 78 50" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <text x="50" y="52" fill="#050507" stroke="#050507" strokeWidth="4" strokeLinejoin="round" fontSize="12.5" fontFamily="sans-serif" fontWeight="900" letterSpacing="-0.2" dominantBaseline="middle" textAnchor="middle">LIB</text>
          <text x="50" y="52" fill="#fff" fontSize="12.5" fontFamily="sans-serif" fontWeight="900" letterSpacing="-0.2" dominantBaseline="middle" textAnchor="middle">LIB</text>
        </svg>
      </div>
      {/* Lettrage */}
      <div className={reveal ? 'lib-text-in' : ''} style={{ display: 'flex', alignItems: 'center', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.01em', fontSize: 'clamp(19px, 5.2vw, 36px)', color: '#e879f9', whiteSpace: 'nowrap', filter: 'drop-shadow(0 0 14px rgba(232,121,249,0.18))' }}>
        <span>L</span>
        <span style={{ display: 'inline-block', width: 'clamp(2px,0.4vw,3px)', height: '0.72em', background: '#fff', margin: '0 0.14em', transform: 'scaleY(1.1)' }} />
        <span>VE</span>
        <span style={{ margin: '0 0.32em' }}>IN</span>
        <span>BLACK</span>
      </div>
    </div>
  )
}

export default function IntroOverlay() {
  const location = useLocation()
  const [active, setActive] = useState(false)
  const [flying, setFlying] = useState(false)
  const [flyStyle, setFlyStyle] = useState(null)
  const logoRef = useRef(null)
  const timers = useRef([])
  const reduce = useRef(false)
  const finishing = useRef(false)

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  function beginFly() {
    if (finishing.current) return
    const nav = Array.from(document.querySelectorAll('[data-navlogo]'))
      .find(e => e.offsetParent !== null && e.getBoundingClientRect().width > 4)
    const lg = logoRef.current
    if (nav && lg) {
      const n = nav.getBoundingClientRect()
      const l = lg.getBoundingClientRect()
      const scale = Math.max(0.1, Math.min(1, n.width / l.width))
      const dx = (n.left + n.width / 2) - (l.left + l.width / 2)
      const dy = (n.top + n.height / 2) - (l.top + l.height / 2)
      setFlyStyle({ transform: `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${scale.toFixed(3)})`, opacity: 0 })
    } else {
      setFlyStyle({ transform: 'translateY(-24px) scale(0.5)', opacity: 0 })
    }
    setFlying(true)
  }

  function finish() { finishing.current = true; setActive(false); setFlying(false); setFlyStyle(null); finishing.current = false }

  function startIntro() {
    clear(); finishing.current = false
    setFlyStyle(null); setFlying(false); setActive(true)
    const revealMs = reduce.current ? 120 : 950
    const flyMs = reduce.current ? 160 : 620
    timers.current.push(setTimeout(beginFly, revealMs))
    timers.current.push(setTimeout(finish, revealMs + flyMs))
  }

  function skip() {
    if (!active || flying) return
    clear(); beginFly()
    timers.current.push(setTimeout(finish, 600))
  }

  useEffect(() => { reduce.current = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches }, [])

  // Rejoue à chaque arrivée sur /accueil (mount initial inclus).
  useEffect(() => {
    if (location.pathname !== '/accueil') return
    startIntro()
    return clear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  if (!active) return null

  return (
    <div onClick={skip} style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {/* Fond opaque qui se dissout pendant le vol */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(120% 80% at 50% 42%, #161226 0%, #08070f 60%, #050507 100%)',
        opacity: flying ? 0 : 1, transition: 'opacity 0.6s ease',
      }} />
      {/* Logo */}
      <div ref={logoRef} style={{
        position: 'relative',
        transition: flying ? 'transform 0.62s cubic-bezier(0.6,0,0.2,1), opacity 0.62s ease' : 'none',
        ...(flyStyle || {}),
      }}>
        <BigLogo reveal={!flying} />
      </div>
      {/* Hint discret */}
      {!flying && !reduce.current && (
        <span style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom,0px) + 28px)', left: 0, right: 0, textAlign: 'center', fontFamily: "'Syne', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', animation: 'lib-pulse 2s infinite' }}>
          Toucher pour passer
        </span>
      )}
    </div>
  )
}
