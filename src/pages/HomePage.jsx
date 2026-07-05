import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import RegionSelector from '../components/RegionSelector'
import EmptyState from '../components/EmptyState'
import TonightCarousel, { remainingPlaces } from '../components/TonightCarousel'
import HeroSearch from '../components/HeroSearch'
import { events, getTopEventsByRegion } from '../data/events'
import { useAuth } from '../context/AuthContext'
import { regions } from '../data/regions'
import { getActiveBoostsByRegion } from '../utils/ticket'
import { getEventCountdown, isCountdownUrgent, getStockBadge } from '../utils/eventUrgency'
import { getEnabledRoles } from '../utils/accounts'
import { GooeyText } from '../components/ui/gooey-text-morphing'
import { IconTent, IconMic } from '../components/icons'
import PublicLanding from './PublicLanding'
import { getRecommendations, hasPreferences, personalizationEnabled } from '../utils/recommendations'
import { PreferencesModal } from '../components/PreferencesEditor'

function HostStatsWidget() {
  const [percent, setPercent] = useState(0)
  const [revenue, setRevenue] = useState(0)
  const [contacts, setContacts] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => {
      setPercent(72)
      
      let startRev = 0
      const targetRev = 4280
      const revInterval = setInterval(() => {
        startRev += 107
        if (startRev >= targetRev) {
          setRevenue(targetRev)
          clearInterval(revInterval)
        } else {
          setRevenue(startRev)
        }
      }, 30)

      let startCont = 0
      const targetCont = 1099
      const contInterval = setInterval(() => {
        startCont += 31
        if (startCont >= targetCont) {
          setContacts(targetCont)
          clearInterval(contInterval)
        } else {
          setContacts(startCont)
        }
      }, 30)
    }, 450)

    return () => clearTimeout(t)
  }, [])

  const radius = 34
  const circ = 2 * Math.PI * radius
  const strokeDashoffset = circ - (percent / 100) * circ

  return (
    <div style={{
      background: 'rgba(6, 6, 12, 0.48)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      borderRadius: 20,
      padding: '20px 24px',
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.02)',
      width: '100%',
      maxWidth: 320,
      minWidth: 260,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      textAlign: 'left',
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      {/* Header Widget */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ee8c8', boxShadow: '0 0 6px #4ee8c8' }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ventes en direct</span>
        </div>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, color: '#c9b0ff', background: 'rgba(132,68,255,0.18)', padding: '2px 8px', borderRadius: 999 }}>LIVE</span>
      </div>

      {/* Main content: Donut + Stat Cards */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* SVG Donut Chart */}
        <div style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
          <svg width="88" height="88" viewBox="0 0 88 88" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
            <circle cx="44" cy="44" r={radius} fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="8" />
            <circle
              cx="44"
              cy="44"
              r={radius}
              fill="none"
              stroke="url(#widgetGrad)"
              strokeWidth="8"
              strokeDasharray={circ}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1.8s cubic-bezier(0.22, 1, 0.36, 1)' }}
            />
            <defs>
              <linearGradient id="widgetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8444ff" />
                <stop offset="100%" stopColor="#ff4da6" />
              </linearGradient>
            </defs>
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#fff', letterSpacing: '0.02em' }}>{percent}%</span>
            <span style={{ fontSize: 7, color: 'rgba(255, 255, 255, 0.3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>Rempli</span>
          </div>
        </div>

        {/* Text metrics */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <p style={{ margin: 0, fontSize: 8.5, color: 'rgba(255, 255, 255, 0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue</p>
            <p style={{ margin: '1px 0 0', fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#fff', letterSpacing: '0.02em' }}>{revenue.toLocaleString()} €</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 8.5, color: 'rgba(255, 255, 255, 0.35)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Audience</p>
            <p style={{ margin: '1px 0 0', fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#ff4da6', letterSpacing: '0.02em' }}>{contacts.toLocaleString()}</p>
          </div>
        </div>
      </div>
      
      {/* Mini graph lines */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22, paddingTop: 4, borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
        {[30, 45, 25, 60, 40, 75, 55, 90, 65, 80, 95].map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${(h * percent) / 100}%`,
              background: `linear-gradient(0deg, rgba(132, 68, 255, 0.1) 0%, ${i === 10 ? '#ff4da6' : '#8444ff'} 100%)`,
              borderRadius: '2px 2px 0 0',
              opacity: 0.8,
              transition: 'height 1.5s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function isEventPast(ev) {
  try {
    if (!ev.date) return false
    const endTime = ev.endTime || ev.time || '23:59'
    const [h, m] = endTime.split(':').map(Number)
    const d = new Date(ev.date + 'T00:00:00')
    d.setHours(h, m, 0, 0)
    // Si endTime < startTime → croise minuit → ajouter 1 jour
    const startTime = ev.time || '00:00'
    const [sh, sm] = startTime.split(':').map(Number)
    if (h < sh || (h === sh && m < sm)) d.setDate(d.getDate() + 1)
    return d.getTime() < Date.now()
  } catch { return false }
}

// Event visible si : non annulé, publishAt passé (ou absent), clôture non encore atteinte (ou absente), et pas expiré depuis 48h
function isEventVisible(ev) {
  const now = Date.now()
  if (ev.cancelled) return false
  if (ev.publishAt && new Date(ev.publishAt).getTime() > now) return false
  // Clôture manuelle ou auto à la date de l'event + 48h de grâce
  const gracePeriodMs = 48 * 60 * 60 * 1000
  if (ev.closingDate) {
    if (new Date(ev.closingDate).getTime() + gracePeriodMs < now) return false
  } else if (isEventPast(ev)) {
    // Pas de closingDate → on utilise la date/heure de fin + 48h
    try {
      const endTime = ev.endTime || ev.time || '23:59'
      const [h, m] = endTime.split(':').map(Number)
      const d = new Date(ev.date + 'T00:00:00')
      d.setHours(h, m, 0, 0)
      const startTime = ev.time || '00:00'
      const [sh, sm] = startTime.split(':').map(Number)
      if (h < sh || (h === sh && m < sm)) d.setDate(d.getDate() + 1)
      if (d.getTime() + gracePeriodMs < now) return false
    } catch { return false }
  }
  return true
}

// Réservations closes (clôture manuelle ou date event passée, mais encore dans la grâce)
function isEventClosed(ev) {
  if (!isEventVisible(ev)) return false
  const now = Date.now()
  if (ev.closingDate && new Date(ev.closingDate).getTime() < now) return true
  if (isEventPast(ev)) return true
  return false
}

function getGreeting() {
  const h = new Date().getHours()
  if (h >= 5  && h < 12) return 'Bonjour'
  if (h >= 12 && h < 18) return 'Bon après-midi'
  if (h >= 18 && h < 22) return 'Bonsoir'
  return 'Bonne nuit'
}

// ── Scroll-reveal hook ───────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.12 }
    )
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

function RevealSection({ children, delay = 0, style = {} }) {
  const { ref, visible } = useReveal()
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(36px)',
      transition: `opacity 0.72s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.72s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      ...style,
    }}>
      {children}
    </div>
  )
}

// Révèle un fragment de phrase quand il entre dans le viewport : il « pop »
// en grossissant avec un léger overshoot et une rotation désordonnée (variée
// selon l'index) → effet ludique, un fragment à la fois au fil du scroll.
function ScrollPhrase({ children, i = 0, color }) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) { setVis(true); return }
    let r1, r2, t
    const reveal = () => { r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setVis(true)) }) }
    // Déjà visible au chargement (hero en haut) → on joue l'anim direct, de façon
    // FIABLE (double rAF : on peint d'abord l'état caché, puis on révèle).
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight && rect.bottom > 0) { reveal() }
    else {
      const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { reveal(); obs.disconnect() } }, { threshold: 0.3 })
      obs.observe(el)
      return () => { obs.disconnect(); cancelAnimationFrame(r1); cancelAnimationFrame(r2) }
    }
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); clearTimeout(t) }
  }, [])
  const hidden = [
    'translateY(26px) scale(0.35) rotate(-6deg)',
    'translateY(32px) scale(0.5) rotate(7deg)',
    'translateY(20px) scale(0.42) rotate(-3deg)',
    'translateY(28px) scale(0.45) rotate(4deg)',
  ][i % 4]
  return (
    <span ref={ref} style={{
      display: 'inline-block', color: color || undefined, whiteSpace: 'nowrap',
      opacity: vis ? 1 : 0, transform: vis ? 'none' : hidden,
      transformOrigin: 'left center', willChange: 'transform, opacity',
      transition: `opacity 0.5s ease ${i * 110}ms, transform 0.6s cubic-bezier(0.18,1.5,0.4,1) ${i * 110}ms`,
    }}>{children}</span>
  )
}

// ── Galerie vidéo du hero (desktop) ──────────────────────────────────────────
const HERO_VIDEOS = [
  { src: '/discover.mp4', title: 'Vis chaque nuit.' },
  { src: '/discover3.mp4', title: 'Brûle la piste.' },
  { src: '/discover4.mp4', title: 'Entre dans la nuit.' },
]

// Marque LIB complète (étoile laser + œil + « LIB ») — pas juste l'étoile.
function LibMark({ size = 30 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} fill="none" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.7))' }}>
      <path d="M50 5 L60 40 L95 50 L60 60 L50 95 L40 60 L5 50 L40 40 Z" fill="none" stroke="#e879f9" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M22 50C22 50 35 32 50 32C65 32 78 50 78 50" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M22 50C22 50 35 68 50 68C65 68 78 50 78 50" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <text x="50" y="52" fill="#050507" stroke="#050507" strokeWidth="4" strokeLinejoin="round" fontSize="12.5" fontFamily="sans-serif" fontWeight="900" letterSpacing="-0.2" dominantBaseline="middle" textAnchor="middle">LIB</text>
      <text x="50" y="52" fill="#fff" fontSize="12.5" fontFamily="sans-serif" fontWeight="900" letterSpacing="-0.2" dominantBaseline="middle" textAnchor="middle">LIB</text>
    </svg>
  )
}

// Galerie « coverflow » : les vidéos roulent en continu de l'arrière vers
// l'avant. Transition fluide (transform + opacité) au clic ET auto-avance douce.
function HeroVideoGallery() {
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const n = HERO_VIDEOS.length
  const go = (d) => setIdx(i => (i + d + n) % n)

  // position relative de chaque vidéo par rapport au centre (…-1, 0, +1…)
  const rel = (i) => { let r = ((i - idx) % n + n) % n; if (r > n / 2) r -= n; return r }

  // Auto-avance continue (pause au survol) → « circule de façon continue »
  useEffect(() => {
    if (paused || n < 2) return
    const t = setInterval(() => setIdx(i => (i + 1) % n), 4200)
    return () => clearInterval(t)
  }, [paused, n])

  const Arrow = ({ side, onClick }) => (
    <button onClick={onClick} aria-label={side === 'left' ? 'Précédent' : 'Suivant'} className="lib-press"
      style={{
        position: 'absolute', top: '50%', [side]: 4, transform: 'translateY(-50%)', zIndex: 6,
        width: 38, height: 38, borderRadius: '50%', cursor: 'pointer',
        background: 'rgba(8,9,14,0.8)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
      }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {side === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  )

  return (
    <div style={{ position: 'relative', width: 400, height: 388 }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div style={{ position: 'absolute', inset: '-10px 0', background: 'radial-gradient(58% 52% at 50% 40%, rgba(78,232,200,0.16), transparent 70%)', filter: 'blur(22px)', pointerEvents: 'none' }} />

      {HERO_VIDEOS.map((v, i) => {
        const r = rel(i)
        const center = r === 0
        const visible = Math.abs(r) <= 1
        return (
          <div key={v.src}
            onClick={() => !center && setIdx(i)}
            style={{
              position: 'absolute', top: '50%', left: '50%', width: 288,
              transform: `translate(-50%, -50%) translateX(${r * 128}px) scale(${center ? 1 : 0.74})`,
              opacity: visible ? (center ? 1 : 0.5) : 0,
              zIndex: center ? 4 : 1,
              transition: 'transform 0.6s cubic-bezier(0.4,0,0.2,1), opacity 0.6s ease',
              pointerEvents: visible ? 'auto' : 'none',
              cursor: center ? 'default' : 'pointer',
              filter: center ? 'none' : 'blur(1.5px) saturate(0.85) brightness(0.65)',
            }}>
            <div style={{ position: 'relative', borderRadius: 26, overflow: 'hidden', aspectRatio: '4 / 5', border: '1px solid rgba(255,255,255,0.14)', boxShadow: center ? '0 40px 90px -24px rgba(0,0,0,0.78)' : '0 20px 50px -24px rgba(0,0,0,0.7)' }}>
              <video src={v.src} autoPlay loop muted playsInline preload="auto"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,4,11,0.35) 0%, transparent 30%, rgba(4,4,11,0.88) 100%)' }} />
              {/* logo + légende : uniquement sur la carte centrale */}
              {center && (
                <>
                  <div style={{ position: 'absolute', top: 14, left: 14 }}><LibMark size={30} /></div>
                  <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18 }}>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4ee8c8', margin: '0 0 4px' }}>Live in black</p>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: 0, lineHeight: 1.1 }}>{v.title}</p>
                  </div>
                  <div style={{ position: 'absolute', top: 16, right: 14, display: 'flex', gap: 5 }}>
                    {HERO_VIDEOS.map((_, j) => (
                      <span key={j} style={{ width: j === idx ? 16 : 6, height: 6, borderRadius: 999, background: j === idx ? '#4ee8c8' : 'rgba(255,255,255,0.4)', transition: 'all 0.25s' }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })}

      {n > 1 && <Arrow side="left" onClick={() => go(-1)} />}
      {n > 1 && <Arrow side="right" onClick={() => go(1)} />}
    </div>
  )
}

const VIOLET = '#8444ff'
const WHITE  = '#ffffff'

function HeroGooeyText({ user, orgName, prestName }) {
  const { texts, colors } = useMemo(() => {
    // Pour les organisateurs/prestataires : afficher le nom commercial plutôt
    // que le prénom personnel — c'est l'identité sous laquelle ils opèrent
    // dans CETTE interface (le prénom reste affiché côté client, lui).
    const displayName = (user?.role === 'organisateur' && orgName)
      ? orgName
      : (user?.role === 'prestataire' && prestName)
      ? prestName
      : user?.name?.trim() || null
    if (displayName) {
      const greeting = (() => {
        const h = new Date().getHours()
        if (h >= 5  && h < 12) return 'Bonjour'
        if (h >= 12 && h < 18) return 'Bon après-midi'
        if (h >= 18 && h < 22) return 'Bonsoir'
        return 'Bonne nuit'
      })()
      const txts = [greeting, displayName]
      const clrs = txts.map((_, i) => i === 0 ? VIOLET : WHITE)
      return { texts: txts, colors: clrs }
    }
    return {
      // La 2e frame est le nom de marque propre (au lieu de « sur L|VE IN BLACK »
      // qui, figé, laissait un « sur » orphelin peu lisible).
      texts: ['Bienvenue', 'L|VE IN BLACK'],
      colors: [VIOLET, WHITE],
    }
  }, [user?.name, user?.role, orgName, prestName])

  // Taille adaptative : un nom long (ou nom de marque) doit tenir sur une ligne
  // sans déborder de la colonne — on réduit la police selon le texte le plus long.
  const longest = Math.max(...texts.map(t => (t || '').length))
  const fontSize = longest >= 16 ? 'clamp(22px, 4vw, 38px)'
    : longest >= 13 ? 'clamp(24px, 4.8vw, 44px)'
    : longest >= 10 ? 'clamp(30px, 6.4vw, 54px)'
    : longest >= 8 ? 'clamp(36px, 8.4vw, 68px)'
    : 'clamp(42px, 11vw, 84px)'
  const height = longest >= 16 ? 'clamp(28px, 4.6vw, 44px)'
    : longest >= 13 ? 'clamp(30px, 5.4vw, 50px)'
    : longest >= 10 ? 'clamp(36px, 7vw, 58px)'
    : 'clamp(44px, 11.5vw, 84px)'

  return (
    <div style={{ position: 'relative', height, marginBottom: 0, maxWidth: '100%', overflow: 'visible' }}>
      <GooeyText
        texts={texts}
        textColors={colors}
        morphTime={0.8}
        cooldownTime={1.5}
        className="w-full h-full"
        textClassName="font-extrabold leading-none tracking-tight"
        textStyle={{
          fontSize,
          fontFamily: 'Inter, system-ui, sans-serif',
          letterSpacing: 'clamp(-1.5px, -0.04em, -3px)',
          lineHeight: 0.95,
          whiteSpace: 'nowrap',
        }}
      />
    </div>
  )
}

export default function HomePage() {
  const navigate  = useNavigate()
  const { user, setUser } = useAuth()

  // Pour les organisateurs : récupérer le nom commercial de leur dossier
  const [orgName, setOrgName] = useState(null)
  useEffect(() => {
    if (user?.role !== 'organisateur') { setOrgName(null); return }
    import('../utils/applications').then(({ getApplicationByUser }) => {
      const app = getApplicationByUser(user.uid, 'organisateur')
      setOrgName(app?.formData?.nomCommercial || null)
    }).catch(() => {})
  }, [user?.uid, user?.role])

  // Pour les prestataires : récupérer le nom de scène/commercial de leur
  // profil d'annuaire (providers/{uid}) — c'est l'identité publique sous
  // laquelle ils opèrent dans cette interface, distincte de leur prénom.
  const [prestName, setPrestName] = useState(null)
  useEffect(() => {
    if (user?.role !== 'prestataire') { setPrestName(null); return }
    import('../utils/services').then(({ getProviderProfile }) => {
      setPrestName(getProviderProfile(user.uid)?.name || null)
    }).catch(() => {})
  }, [user?.uid, user?.role])

  const defaultRegion = regions.find((r) => r.id === 'france')
  const [selectedRegion, setSelectedRegion] = useState(() => {
    try {
      const saved = localStorage.getItem('lib_region')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed === null) return null  // user explicitly chose "Toutes les régions"
        const { id } = parsed
        const found = regions.find(r => r.id === id)
        if (found) return found
      }
    } catch {}
    return defaultRegion
  })
  const [showRegionSelector, setShowRegionSelector] = useState(false)
  const [geoToast, setGeoToast] = useState('')

  const enabledRoles  = user ? getEnabledRoles(user) : []
  const isClient      = user && (enabledRoles.includes('client') || enabledRoles.includes('user')) && !enabledRoles.includes('organisateur') && !enabledRoles.includes('prestataire') && user.role !== 'agent'
  // org/prest accounts are separate — check the user's own role/status
  const orgStatus  = user?.role === 'organisateur' ? (user?.status || 'pending') : 'none'
  const prestStatus = user?.role === 'prestataire'  ? (user?.status || 'pending') : 'none'

  useEffect(() => {
    const alreadySaved = localStorage.getItem('lib_region')
    if (alreadySaved) return
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=fr`
          )
          const data = await res.json()
          const country = data.address?.country
          const matched = regions.find(r => r.country.toLowerCase() === country?.toLowerCase())
          if (matched) {
            setSelectedRegion(matched)
            localStorage.setItem('lib_region', JSON.stringify({ id: matched.id }))
            setGeoToast(`${matched.flag} ${matched.name} détecté`)
            setTimeout(() => setGeoToast(''), 4000)
          }
        } catch {}
      },
      () => {},
      { timeout: 8000 }
    )
  }, [])

  // Real-time events from Firestore — source of truth for all users
  // + fallback localStorage (events publiés sur ce device, pas encore syncés)
  const [createdEvents, setCreatedEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lib_created_events') || '[]') } catch { return [] }
  })

  useEffect(() => {
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenEvents, reconcileCreatedEvents }) => {
      unsub = listenEvents(firestoreEvts => {
        // Réconciliation : Firestore + créations locales encore _pendingSync.
        // Un event supprimé côté serveur disparaît (fini le fantôme au cache local).
        setCreatedEvents(prev => {
          const next = reconcileCreatedEvents(prev, firestoreEvts)
          try { localStorage.setItem('lib_created_events', JSON.stringify(next)) } catch {}
          return next
        })
      })
    }).catch(() => {})
    return () => unsub()
  }, [])

  // Boosts globaux (collection partagée `boosts`) — pour que le Top 3 boosté
  // s'affiche pour TOUS les visiteurs, pas seulement l'acheteur. lib_boosts local
  // ne contient que les boosts du user courant.
  const [globalBoosts, setGlobalBoosts] = useState([])

  // ── Recommandations : modal d'édition des goûts + bannière d'onboarding ──
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [tasteBannerDismissed, setTasteBannerDismissed] = useState(() => {
    try { return localStorage.getItem(`lib_taste_banner_dismissed_${user?.uid || ''}`) === '1' } catch { return false }
  })
  // Resynchroniser au changement de compte (login/logout sans remount de la page) :
  // sinon l'état « bannière écartée » d'un compte fuit vers le suivant.
  useEffect(() => {
    try { setTasteBannerDismissed(localStorage.getItem(`lib_taste_banner_dismissed_${user?.uid || ''}`) === '1') } catch { setTasteBannerDismissed(false) }
  }, [user?.uid])
  useEffect(() => {
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenBoosts }) => {
      unsub = listenBoosts(setGlobalBoosts)
    }).catch(() => {})
    return () => unsub()
  }, [])

  // Dédupliquer (statiques vs créés ayant le même id)
  const allEvents = (() => {
    const seen = new Set()
    const list = []
    for (const e of [...events, ...createdEvents]) {
      const key = String(e.id)
      if (seen.has(key)) continue
      seen.add(key)
      list.push(e)
    }
    return list
  })()

  // Top 3 : filtre par région sur tous les événements (statiques + créés par organisateurs)
  const regionName = selectedRegion?.name
  const regionEvents = allEvents.filter(e =>
    !regionName || regionName === 'Toutes' || e.region === regionName
  )
  // Non-boostés : triés par date la plus proche — on exclut les events clos/invisibles
  const baseTopThree = regionEvents
    .filter(e => isEventVisible(e) && !isEventClosed(e))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 10) // plus de candidats pour le fallback

  // Boosts filtrés par la région du visiteur — source = collection globale
  // (cross-device/cross-user), avec fallback localStorage si Firestore indispo
  const activeBoosts = getActiveBoostsByRegion(regionName, globalBoosts)

  const boostedByPosition = {}
  activeBoosts.forEach(b => {
    const ev = allEvents.find(e => e.id === b.eventId)
    // Ne montrer l'event boosté que s'il est visible et non passé/annulé
    if (ev && !ev.cancelled && !isEventPast(ev) && b.position >= 1 && b.position <= 3 && !boostedByPosition[b.position]) {
      boostedByPosition[b.position] = { ...ev, boostPosition: b.position, featured: true }
    }
  })
  const boostedIds = new Set(Object.values(boostedByPosition).map(e => e.id))
  const fallback   = baseTopThree.filter(e => !boostedIds.has(e.id))

  const topThree = []
  let fallbackIdx = 0
  for (let pos = 1; pos <= 3; pos++) {
    if (boostedByPosition[pos]) {
      topThree.push(boostedByPosition[pos])
    } else {
      if (fallbackIdx < fallback.length) topThree.push(fallback[fallbackIdx++])
    }
  }

  // « Réservez pour ce soir » : soirées du JOUR MÊME, dans la région, où il
  // reste des places. Discovery dernière minute pour les sorties spontanées.
  // « Ce soir » = soirée à venir dans les ~18 prochaines heures (inclut les
  // events qui croisent minuit), encore en cours, avec des places. Plus robuste
  // qu'un « aujourd'hui pile » qui disparaissait au passage de minuit.
  const tonightEvents = (() => {
    const now = Date.now()
    const WINDOW = 18 * 3600 * 1000     // à venir dans 18h
    const GRACE = 6 * 3600 * 1000        // ou démarré il y a moins de 6h
    return regionEvents
      .filter(e => isEventVisible(e) && !isEventClosed(e) && !isEventPast(e))
      .filter(e => remainingPlaces(e) > 0)
      .filter(e => {
        try {
          const start = new Date(`${e.date}T${e.time || '20:00'}:00`).getTime()
          const delta = start - now
          return delta <= WINDOW && delta >= -GRACE
        } catch { return false }
      })
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
  })()

  const handleRegionSelect = (region) => {
    setSelectedRegion(region)
    localStorage.setItem('lib_region', region ? JSON.stringify({ id: region.id }) : 'null')
  }

  // ── « Nos recommandations pour vous » ──────────────────────────────────────
  // Candidats = events de la région, visibles, HORS Top 3 (pas de doublon).
  // Score simple préférences déclarées + activité (voir utils/recommendations).
  const topThreeIds = new Set(topThree.map(e => String(e.id)))
  const recoCandidates = regionEvents.filter(e =>
    isEventVisible(e) && !isEventClosed(e) && !topThreeIds.has(String(e.id))
  )
  const recommendations = user ? getRecommendations({
    user,
    events: recoCandidates,
    allEvents, // liste complète (passés inclus) pour résoudre les réservations
    boostedIds: new Set(activeBoosts.map(b => String(b.eventId))),
    max: 6,
  }) : []

  // Bannière « personnalise ton expérience » : connecté, personnalisation active,
  // formulaire jamais REMPLI (updatedAt : même un enregistrement partiel — juste
  // la fréquence par ex. — compte comme fait), pas déjà écartée sur cet appareil.
  const showTasteBanner = !!user
    && personalizationEnabled(user)
    && !hasPreferences(user?.preferences)
    && !user?.preferences?.updatedAt
    && !tasteBannerDismissed
  const dismissTasteBanner = () => {
    setTasteBannerDismissed(true)
    try { localStorage.setItem(`lib_taste_banner_dismissed_${user?.uid || ''}`, '1') } catch {}
  }

  const RANK_LABEL = ['01', '02', '03']
  const RANK_COLOR = ['var(--gold)', '#b0b8c8', '#a0714f']

  // Utilisateur NON connecté → vitrine publique premium (conversion).
  // L'expérience connectée ci-dessous reste strictement inchangée.
  if (!user) return <PublicLanding />

  return (
    <Layout>
      <style>{`
        /* Perspective on cards for 3D depth */
        .lib-org-card {
          perspective: 1200px;
          transform-style: preserve-3d;
        }

        /* Widget floating & 3D tilt styles */
        .stats-widget-wrapper {
          transform-style: preserve-3d;
          transition: transform 0.7s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.7s ease;
          animation: libWidgetFloat 5s ease-in-out infinite alternate;
          width: 100%;
          max-width: 320px;
        }

        /* Hovering the card lifts and tilts the widget */
        .lib-org-card:hover .stats-widget-wrapper {
          transform: translateZ(35px) rotateY(-14deg) rotateX(10deg) translateY(-8px);
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(132, 68, 255, 0.15);
        }

        @keyframes libWidgetFloat {
          0% {
            transform: translateY(0px) rotateY(-3deg) rotateX(2deg);
          }
          100% {
            transform: translateY(-8px) rotateY(3deg) rotateX(-2deg);
          }
        }

        /* Card hover effects on HomePage */
        .lib-org-card:hover .lib-org-cta {
          background: #8444ff !important;
          color: #fff !important;
          box-shadow: 0 0 24px rgba(132,68,255,0.45);
          border-color: rgba(255,255,255,0.3) !important;
        }
        .lib-org-card:hover .lib-org-cta svg {
          transform: translateX(4px);
        }
        .lib-org-cta svg {
          transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .lib-prest-card:hover .lib-prest-cta {
          background: #ff4da6 !important;
          color: #fff !important;
          box-shadow: 0 0 24px rgba(255,77,166,0.45);
          border-color: rgba(255,255,255,0.3) !important;
        }
        .lib-prest-card:hover .lib-prest-cta svg {
          transform: translateX(4px);
        }
        .lib-prest-cta svg {
          transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        }
      `}</style>
      {/* geo toast */}
      {geoToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
          style={{
            padding: '8px 20px',
            background: 'rgba(6,8,16,0.75)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(78,232,200,0.3)',
            borderRadius: 99,
            color: 'var(--teal)',
            fontFamily: 'Inter, sans-serif',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}>
          {geoToast}
        </div>
      )}

      <div style={{ paddingLeft: 'max(20px, env(safe-area-inset-left))', paddingRight: 'max(20px, env(safe-area-inset-right))' }}>

        {/* ── Hero ── */}
        <div style={{ padding: 'clamp(22px, 5vw, 44px) 0 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(40px, 7vw, 120px)' }}>
          {/* Colonne gauche : titre + accroche + bouton vidéo */}
          <div style={{ flex: '0 1 520px', minWidth: 0 }}>
            <HeroGooeyText user={user} orgName={orgName} prestName={prestName} />
            <div style={{ marginTop: 12, maxWidth: 460 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.5px', fontSize: 'clamp(21px, 6vw, 34px)', lineHeight: 1.18, color: '#fff', margin: 0 }}>
                <ScrollPhrase i={0}>Les meilleures soirées,</ScrollPhrase>{' '}
                <ScrollPhrase i={1}>au bout des doigts.</ScrollPhrase>
              </p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 'clamp(15px, 4.2vw, 20px)', lineHeight: 1.4, margin: '8px 0 0' }}>
                <ScrollPhrase i={2} color="#4ee8c8">Réserve,</ScrollPhrase>{' '}
                <ScrollPhrase i={3} color="#c8a96e">booste,</ScrollPhrase>{' '}
                <ScrollPhrase i={4} color="#e05aaa">profite.</ScrollPhrase>
              </p>
            </div>

            {/* Recherche globale animée — événements, artistes, organisateurs, prestataires */}
            <HeroSearch />

            {/* CTA Découvrir — la vidéo joue À L'INTÉRIEUR du bouton, le libellé reste lisible en haut */}
            <button
              onClick={() => navigate('/evenements')}
              className="lib-press lib-lift"
              aria-label="Découvrir les événements"
              style={{
                marginTop: 26, position: 'relative', overflow: 'hidden', display: 'block', textAlign: 'left',
                width: 'min(440px, 100%)', height: 132, padding: 0, borderRadius: 20, cursor: 'pointer',
                border: '1px solid rgba(78,232,200,0.4)',
                boxShadow: '0 18px 44px -14px rgba(78,232,200,0.45)',
              }}
            >
              <video src="/discover.mp4" autoPlay loop muted playsInline
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              {/* Voile dégradé : sombre en haut pour le texte, et en bas pour l'ancrage */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,4,11,0.82) 0%, rgba(4,4,11,0.18) 42%, rgba(4,4,11,0.45) 100%)' }} />
              <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '15px 18px' }}>
                {/* Texte en haut */}
                <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 17, letterSpacing: '-0.3px', color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>
                  Découvrir les événements
                </span>
                {/* Pastille flèche en bas */}
                <span style={{ alignSelf: 'flex-end', width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #4ee8c8, #7af0d8)', boxShadow: '0 6px 18px rgba(78,232,200,0.5)' }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#04040b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </span>
              </div>
            </button>
          </div>

          {/* Colonne droite : galerie vidéo (desktop) — flèches + aperçus latéraux */}
          <div className="hidden md:block" style={{ flexShrink: 0 }}>
            <HeroVideoGallery />
          </div>
        </div>

        {/* ── Bannière onboarding goûts (optionnelle, non bloquante) ── */}
        {showTasteBanner && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            margin: '0 0 40px', padding: '16px 20px', borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(132,68,255,0.14), rgba(78,232,200,0.06))',
            border: '1px solid rgba(132,68,255,0.35)',
          }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.2px' }}>
                Des soirées choisies pour toi ✨
              </p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'rgba(255,255,255,0.55)', margin: '4px 0 0', lineHeight: 1.5 }}>
                Dis-nous tes styles, ton budget et ton ambiance — on te recommande les événements qui te ressemblent. 30 secondes, modifiable à tout moment.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => setPrefsOpen(true)} style={{
                padding: '11px 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #8444ff, #a56bff)', color: '#fff',
                fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 800,
                boxShadow: '0 8px 24px -8px rgba(132,68,255,0.55)',
              }}>
                Personnaliser
              </button>
              <button onClick={dismissTasteBanner} aria-label="Plus tard" style={{
                width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 16,
              }}>
                ×
              </button>
            </div>
          </div>
        )}

        {/* ── Top 3 Events ── */}
        <RevealSection delay={60}>
          <div style={{ marginBottom: 56 }}>
            {/* section header */}
            <div style={{ marginBottom: 36 }}>
              <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, color: 'var(--teal)' }}>
                <span style={{ width: 22, height: 2, borderRadius: 2, background: 'var(--teal)', boxShadow: '0 0 8px var(--teal)' }} />
                À ne pas manquer
                <span style={{ width: 22, height: 2, borderRadius: 2, background: 'var(--teal)', boxShadow: '0 0 8px var(--teal)' }} />
              </p>
              <button
                onClick={() => setShowRegionSelector(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <h2 style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 'clamp(34px, 8vw, 60px)',
                  fontWeight: 800,
                  letterSpacing: '-2px',
                  lineHeight: 1,
                  margin: 0,
                  color: '#fff',
                }}>
                  {selectedRegion?.name || 'Partout'}
                </h2>
                <span style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  flexShrink: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="rgba(255,255,255,0.5)" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>
            </div>

            {/* Event cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {topThree.length > 0 ? topThree.map((event, i) => (
                <RevealSection key={event.id} delay={100 + i * 80}>
                  <button
                    onClick={() => navigate(`/evenements/${event.id}`)}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    <div style={{
                      position: 'relative',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      borderRadius: 24,
                      overflow: 'hidden',
                      transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 24px 60px rgba(0,0,0,0.5)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>

                      {/* Banner */}
                      {event.imageUrl ? (
                        <div style={{ width: '100%', height: 240, overflow: 'hidden', position: 'relative' }}>
                          <img src={event.imageUrl} alt={event.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(5,6,10,0.8) 0%, transparent 60%)' }} />
                        </div>
                      ) : (
                        <div style={{
                          height: 240, position: 'relative', overflow: 'hidden',
                          background: `radial-gradient(circle at 26% 34%, ${event.color}88 0%, transparent 45%), radial-gradient(circle at 72% 40%, ${event.accentColor || event.color}66 0%, transparent 42%), linear-gradient(165deg, #110e19, #08080f)`,
                        }}>
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(5,6,10,0.75) 0%, transparent 55%)' }} />
                          <div style={{ position: 'absolute', top: 16, left: 18, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {event.tags?.map((tag) => (
                              <span key={tag} style={{
                                fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600,
                                letterSpacing: '0.06em', textTransform: 'uppercase',
                                padding: '4px 10px', borderRadius: 999,
                                border: '1px solid rgba(255,255,255,0.15)',
                                background: 'rgba(255,255,255,0.08)',
                                color: 'rgba(255,255,255,0.75)',
                                backdropFilter: 'blur(8px)',
                              }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                            <span style={{
                              fontFamily: 'Inter, sans-serif', fontWeight: 900,
                              fontSize: 'clamp(26px, 8vw, 44px)',
                              letterSpacing: '-1px', opacity: 0.10, color: '#fff',
                              whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '88%', textOverflow: 'ellipsis',
                            }}>
                              {event.name}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Rank badge + indicateur BOOSTÉ si l'event est vraiment promu */}
                      <div style={{
                        position: 'absolute', top: 16, right: 18,
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
                      }}>
                        <div style={{
                          fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 800,
                          letterSpacing: '0.08em',
                          color: RANK_COLOR[i],
                          background: 'rgba(5,6,10,0.6)',
                          backdropFilter: 'blur(10px)',
                          padding: '5px 10px', borderRadius: 999,
                          border: '1px solid rgba(255,255,255,0.12)',
                        }}>
                          {RANK_LABEL[i]}
                        </div>
                        {event.featured && (
                          <div style={{
                            fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 700,
                            letterSpacing: '0.18em', textTransform: 'uppercase',
                            color: '#e05aaa',
                            background: 'rgba(224,90,170,0.18)',
                            backdropFilter: 'blur(10px)',
                            padding: '4px 9px', borderRadius: 999,
                            border: '1px solid rgba(224,90,170,0.45)',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="#e05aaa" stroke="none">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                            </svg>
                            Boosté
                          </div>
                        )}
                        {(() => {
                          const cd = getEventCountdown(event); const urg = isCountdownUrgent(event); const st = getStockBadge(event)
                          return (<>
                            {cd && (
                              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: urg ? '#fff' : '#4ee8c8', background: urg ? 'rgba(224,90,170,0.9)' : 'rgba(5,6,10,0.6)', backdropFilter: 'blur(10px)', padding: '4px 9px', borderRadius: 999, border: `1px solid ${urg ? 'rgba(224,90,170,0.6)' : 'rgba(78,232,200,0.4)'}` }}>{cd}</div>
                            )}
                            {st && (
                              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: st.color, background: 'rgba(5,6,10,0.6)', backdropFilter: 'blur(10px)', padding: '4px 9px', borderRadius: 999, border: `1px solid ${st.color}66` }}>{st.label}</div>
                            )}
                          </>)
                        })()}
                      </div>

                      {/* Info */}
                      <div style={{ padding: '20px 24px 24px' }}>
                        <p style={{
                          fontFamily: 'Inter, system-ui, sans-serif',
                          fontWeight: 700, fontSize: 'clamp(20px, 5vw, 26px)',
                          letterSpacing: '-0.5px',
                          color: '#fff', margin: '0 0 6px', lineHeight: 1.15,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {event.name}
                        </p>
                        <p style={{
                          fontFamily: 'Inter, sans-serif', fontSize: 14, color: 'rgba(255,255,255,0.4)',
                          marginBottom: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {event.subtitle}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                              fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
                              color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em', textTransform: 'uppercase',
                            }}>
                              {event.dateDisplay}
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 16 }}>·</span>
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                              {event.city}
                            </span>
                          </div>
                          <span style={{
                            fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700,
                            color: 'var(--violet-end)',
                          }}>
                            {(() => {
                              // Événements organisateur : prix dans places[].price
                              // Événements statiques : prix dans event.price
                              const minPlace = event.places?.length > 0
                                ? Math.min(...event.places.map(p => Number(p.price) || 0))
                                : null
                              const effectivePrice = minPlace !== null ? minPlace : (Number(event.price) || 0)
                              if (effectivePrice > 0) return `À partir de ${effectivePrice} €`
                              return 'Gratuit'
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                </RevealSection>
              )) : (
                <EmptyState
                  icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(78,232,200,0.7)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>}
                  title="Aucun événement dans cette zone"
                  subtitle="Change de région ou explore tous les événements"
                />
              )}
            </div>

            {/* ── Réservez pour ce soir ── (toujours visible : carrousel ou état vide) */}
            <RevealSection delay={150}>
              <div style={{ marginTop: 28 }}>
                <TonightCarousel
                  events={tonightEvents}
                  regionName={selectedRegion?.name}
                  onOpen={(id) => navigate(`/evenements/${id}`)}
                />
              </div>
            </RevealSection>

            {/* See all CTA */}
            <RevealSection delay={400}>
              <div style={{ marginTop: 28, textAlign: 'center' }}>
                <button onClick={() => navigate('/evenements')}
                  style={{
                    padding: '13px 32px', borderRadius: 999,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.55)',
                    fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', letterSpacing: '0.04em',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
                >
                  Voir tous les événements →
                </button>
              </div>
            </RevealSection>
          </div>
        </RevealSection>

        {/* ── Nos recommandations pour vous ── */}
        {recommendations.length > 0 && (
          <RevealSection delay={80}>
            <div style={{ marginBottom: 56 }}>
              <style>{`
                .reco-card { transition: transform .25s ease, box-shadow .25s ease; }
                .reco-card:hover { transform: translateY(-3px); box-shadow: 0 24px 60px rgba(0,0,0,0.5); }
              `}</style>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
                <div>
                  <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12, color: '#c9b0ff' }}>
                    <span style={{ width: 22, height: 2, borderRadius: 2, background: '#8444ff', boxShadow: '0 0 8px #8444ff' }} />
                    Rien que pour toi
                  </p>
                  <h2 style={{
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontSize: 'clamp(26px, 6vw, 42px)',
                    fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05,
                    color: '#fff', margin: 0,
                  }}>
                    Nos recommandations <span style={{ color: '#c9b0ff' }}>pour toi</span>
                  </h2>
                </div>
                <button onClick={() => setPrefsOpen(true)} style={{
                  padding: '9px 15px', borderRadius: 999, cursor: 'pointer',
                  border: '1px solid rgba(132,68,255,0.4)', background: 'rgba(132,68,255,0.08)',
                  color: '#c9b0ff', fontFamily: 'Inter, sans-serif', fontSize: 11.5, fontWeight: 700,
                }}>
                  Régler mes goûts
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 18 }}>
                {recommendations.map(({ event, reason }) => {
                  const minPrice = event.places?.length > 0 ? Math.min(...event.places.map(p => p.price)) : null
                  return (
                    <button
                      key={event.id}
                      onClick={() => navigate(`/evenements/${event.id}`)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div className="reco-card" style={{
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        borderRadius: 24, overflow: 'hidden',
                      }}>
                        <div style={{ position: 'relative', height: 168 }}>
                          {event.imageUrl
                            ? <img src={event.imageUrl} alt={event.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            : <div style={{ width: '100%', height: '100%', background: `radial-gradient(circle at 30% 20%, ${event.color || '#8444ff'}44, transparent 60%), linear-gradient(135deg, rgba(132,68,255,0.25), rgba(78,232,200,0.08))` }} />}
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(5,6,10,0.8), transparent 60%)' }} />
                          {/* Raison de la recommandation — discrète, jamais intrusive */}
                          {reason && (
                            <span style={{
                              position: 'absolute', top: 10, left: 10, maxWidth: 'calc(100% - 20px)',
                              fontFamily: 'Inter, sans-serif', fontSize: 10.5, fontWeight: 700,
                              color: '#e5d8ff', background: 'rgba(24,10,50,0.72)', backdropFilter: 'blur(8px)',
                              padding: '5px 10px', borderRadius: 999, border: '1px solid rgba(132,68,255,0.45)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              ✨ {reason}
                            </span>
                          )}
                        </div>
                        <div style={{ padding: '16px 18px 18px' }}>
                          <p style={{
                            fontFamily: 'Inter, sans-serif', fontSize: 18, fontWeight: 700, letterSpacing: '-0.4px',
                            color: '#fff', margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {event.name}
                          </p>
                          <p style={{
                            fontFamily: 'Inter, sans-serif', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em',
                            color: 'rgba(255,255,255,0.38)', margin: 0,
                          }}>
                            {[event.dateDisplay, event.city].filter(Boolean).join(' · ')}
                          </p>
                          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: 'var(--violet-end)', margin: '10px 0 0' }}>
                            {minPrice != null ? (minPrice <= 0 ? 'Gratuit' : `Dès ${minPrice.toLocaleString('fr-FR')} €`) : (event.price ? `Dès ${event.price} €` : 'Gratuit')}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </RevealSection>
        )}

        {/* ── Comment ça marche — visitors only ── */}
        {!user && (
          <RevealSection delay={120}>
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: 56,
              paddingBottom: 56,
              marginBottom: 24,
            }}>
              <p className="eyebrow" style={{ marginBottom: 14, color: 'rgba(255,255,255,0.28)' }}>Comment ça marche</p>
              <h2 style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 'clamp(28px, 6vw, 44px)',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1.05,
                color: '#fff',
                margin: '0 0 36px',
                maxWidth: 580,
              }}>
                Une marketplace où la <span style={{ color: 'var(--teal)' }}>nuit</span> rencontre ses <span style={{ color: 'var(--gold)' }}>acteurs</span>.
              </h2>

              {/* 3 étapes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                {[
                  {
                    n: '01',
                    color: '#4ee8c8',
                    title: 'Découvre',
                    desc: "Parcours les soirées les plus attendues de ta région. Top 3 mis à jour en temps réel, événements boostés mis en avant.",
                  },
                  {
                    n: '02',
                    color: '#c8a96e',
                    title: 'Réserve',
                    desc: "Achète tes billets en quelques clics, paiement sécurisé via Stripe, QR code instantané dans ton wallet.",
                  },
                  {
                    n: '03',
                    color: '#e05aaa',
                    title: 'Vis l\'instant',
                    desc: "Précommande tes consos, vote pour la playlist en live, partage avec ta team — tout dans une seule app.",
                  },
                ].map(step => (
                  <div key={step.n} style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 18,
                    padding: '22px 22px 24px',
                  }}>
                    <p style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 11, letterSpacing: '0.25em',
                      color: step.color, margin: 0,
                    }}>{step.n}</p>
                    <h3 style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 22, fontWeight: 700,
                      letterSpacing: '-0.5px',
                      color: '#fff', margin: '8px 0 8px',
                    }}>{step.title}</h3>
                    <p style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 13, lineHeight: 1.6,
                      color: 'rgba(255,255,255,0.5)', margin: 0,
                    }}>{step.desc}</p>
                  </div>
                ))}
              </div>

              {/* CTA principal */}
              <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigate('/connexion?mode=register')}
                  style={{
                    padding: '14px 26px',
                    background: 'linear-gradient(135deg, var(--teal) 0%, #4ee8c8cc 100%)',
                    border: 'none', borderRadius: 999,
                    fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700,
                    letterSpacing: '0.02em',
                    color: '#04040b', cursor: 'pointer',
                    boxShadow: '0 10px 30px rgba(78,232,200,0.25)',
                  }}
                >
                  Créer mon compte gratuit →
                </button>
                <button
                  onClick={() => navigate('/evenements')}
                  style={{
                    padding: '14px 26px',
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 999,
                    fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600,
                    letterSpacing: '0.02em',
                    color: 'rgba(255,255,255,0.78)', cursor: 'pointer',
                  }}
                >
                  Voir les événements
                </button>
              </div>
            </div>
          </RevealSection>
        )}

        {/* ── Élargis ton espace — bottom section ── */}
        {user?.role !== 'agent' && (!enabledRoles.includes('organisateur') || !enabledRoles.includes('prestataire')) && (
          <RevealSection delay={0}>
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: 64,
              paddingBottom: 64,
            }}>
              {/* Big heading */}
              <div style={{ marginBottom: 48 }}>
                <p className="eyebrow" style={{ marginBottom: 16, color: 'rgba(255,255,255,0.28)' }}>Pour toi</p>
                <h2 style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 'clamp(36px, 9vw, 64px)',
                  fontWeight: 800,
                  lineHeight: 0.94,
                  letterSpacing: '-2.5px',
                  margin: 0,
                }}>
                  Tu veux <span className="gradient-text">élargir</span> ton espace ?
                </h2>
                <p style={{
                  fontFamily: 'Inter, sans-serif', fontSize: 16,
                  color: 'rgba(255,255,255,0.35)', marginTop: 20, maxWidth: 440, lineHeight: 1.6,
                }}>
                  Rejoins la plateforme en tant qu'acteur de la nuit. Crée, propose, performe.
                </p>
              </div>

              {/* Two big cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Organisateur card */}
                {!enabledRoles.includes('organisateur') && (
                  <RevealSection delay={100}>
                    <button
                      onClick={() => navigate(orgStatus !== 'none' ? '/mon-dossier' : '/inscription-organisateur')}
                      style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      <div className="lib-org-card" style={{
                        position: 'relative', overflow: 'hidden',
                        borderRadius: 24,
                        background: 'linear-gradient(135deg, rgba(132,68,255,0.14) 0%, rgba(132,68,255,0.04) 100%)',
                        border: '1px solid rgba(132,68,255,0.28)',
                        padding: '36px 32px',
                        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 24px 60px rgba(132,68,255,0.2)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
                        {/* Glow */}
                        <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(132,68,255,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />

                        <div className="flex flex-col md:flex-row gap-8 md:items-center justify-between" style={{ position: 'relative', zIndex: 2 }}>
                          {/* Left Column (Text Info) */}
                          <div style={{ flex: '1 1 55%', minWidth: 0 }}>
                            <div style={{
                              width: 56, height: 56, borderRadius: 14, marginBottom: 18,
                              background: 'rgba(132,68,255,0.16)', border: '1px solid rgba(132,68,255,0.32)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <IconTent size={26} color="#c9b0ff" />
                            </div>
                            <h3 style={{
                              fontFamily: 'Inter, sans-serif', fontWeight: 800,
                              fontSize: 'clamp(22px, 5vw, 30px)',
                              letterSpacing: '-0.8px', lineHeight: 1.1,
                              color: '#fff', margin: '0 0 12px',
                            }}>
                              Organiser<br />un événement
                            </h3>
                            <p style={{
                              fontFamily: 'Inter, sans-serif', fontSize: 15,
                              color: 'rgba(255,255,255,0.45)', lineHeight: 1.6,
                              margin: '0 0 24px', maxWidth: 360,
                            }}>
                              Crée tes événements, gère la billetterie, booste ta visibilité et connecte avec les meilleurs prestataires.
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span className="lib-org-cta" style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                padding: '10px 20px', borderRadius: 999,
                                background: 'rgba(132,68,255,0.22)',
                                border: '1px solid rgba(132,68,255,0.35)',
                                fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#c9b0ff',
                                transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                              }}>
                                {orgStatus !== 'none' ? 'Voir mon dossier' : 'Créer un compte organisateur'}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transition: 'transform 0.2s ease' }}><path d="M9 18l6-6-6-6"/></svg>
                              </span>
                              {orgStatus === 'pending' && (
                                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'rgba(200,169,110,0.12)', border: '1px solid rgba(200,169,110,0.25)', color: 'var(--gold)' }}>
                                  En attente
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right Column (Widget) */}
                          <div style={{ flex: '1 1 40%', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                            <div className="stats-widget-wrapper">
                              <HostStatsWidget />
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  </RevealSection>
                )}

                {/* Prestataire card */}
                {!enabledRoles.includes('prestataire') && (
                  <RevealSection delay={180}>
                    <button
                      onClick={() => navigate(prestStatus !== 'none' ? '/mon-dossier' : '/inscription-prestataire')}
                      style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      <div className="lib-prest-card" style={{
                        position: 'relative', overflow: 'hidden',
                        borderRadius: 24,
                        background: 'linear-gradient(135deg, rgba(255,77,166,0.12) 0%, rgba(255,77,166,0.03) 100%)',
                        border: '1px solid rgba(255,77,166,0.25)',
                        padding: '36px 32px',
                        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 24px 60px rgba(255,77,166,0.18)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
                        {/* Glow */}
                        <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,77,166,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

                        <div className="flex flex-col md:flex-row gap-8 md:items-center justify-between" style={{ position: 'relative', zIndex: 2 }}>
                          {/* Left Column (Text Info) */}
                          <div style={{ flex: '1 1 55%', minWidth: 0 }}>
                            <div style={{
                              width: 56, height: 56, borderRadius: 14, marginBottom: 18,
                              background: 'rgba(255,77,166,0.16)', border: '1px solid rgba(255,77,166,0.32)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <IconMic size={26} color="#ffb3d9" />
                            </div>
                            <h3 style={{
                              fontFamily: 'Inter, sans-serif', fontWeight: 800,
                              fontSize: 'clamp(22px, 5vw, 30px)',
                              letterSpacing: '-0.8px', lineHeight: 1.1,
                              color: '#fff', margin: '0 0 12px',
                            }}>
                              Proposer<br />mes services
                            </h3>
                            <p style={{
                              fontFamily: 'Inter, sans-serif', fontSize: 15,
                              color: 'rgba(255,255,255,0.45)', lineHeight: 1.6,
                              margin: '0 0 24px', maxWidth: 360,
                            }}>
                              DJ, salle, matériel, traiteur, photographe… Rejoins la plateforme et connecte avec les organisateurs.
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span className="lib-prest-cta" style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                padding: '10px 20px', borderRadius: 999,
                                background: 'rgba(255,77,166,0.18)',
                                border: '1px solid rgba(255,77,166,0.32)',
                                fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#ffb3d9',
                                transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                              }}>
                                {prestStatus !== 'none' ? 'Voir mon dossier' : 'Créer un compte prestataire'}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transition: 'transform 0.2s ease' }}><path d="M9 18l6-6-6-6"/></svg>
                              </span>
                              {prestStatus === 'pending' && (
                                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'rgba(200,169,110,0.12)', border: '1px solid rgba(200,169,110,0.25)', color: 'var(--gold)' }}>
                                  En attente
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Empty space for alignment/structure on Prestataire (could be a service-matching mockup later) */}
                          <div style={{ flex: '1 1 40%', minWidth: 0, display: 'none', md: 'block' }} />
                        </div>
                      </div>
                    </button>
                  </RevealSection>
                )}
              </div>
            </div>
          </RevealSection>
        )}

      </div>

      <RegionSelector
        isOpen={showRegionSelector}
        onClose={() => setShowRegionSelector(false)}
        onSelect={handleRegionSelect}
        currentRegion={selectedRegion?.name}
      />

      {/* Édition des goûts (onboarding + « Régler mes goûts ») */}
      <PreferencesModal open={prefsOpen} onClose={() => setPrefsOpen(false)} user={user} setUser={setUser} />
    </Layout>
  )
}
