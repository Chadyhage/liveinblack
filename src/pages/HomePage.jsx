import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import RegionSelector from '../components/RegionSelector'
import { events, getTopEventsByRegion } from '../data/events'
import { useAuth } from '../context/AuthContext'
import { regions } from '../data/regions'
import { getActiveBoostsByRegion } from '../utils/ticket'
import { getEnabledRoles } from '../utils/accounts'
import { GooeyText } from '../components/ui/gooey-text-morphing'

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

const VIOLET = '#8444ff'
const WHITE  = '#ffffff'

function HeroGooeyText({ user, orgName }) {
  const { texts, colors } = useMemo(() => {
    // Pour les organisateurs : afficher le nom de l'organisation
    const displayName = (user?.role === 'organisateur' && orgName)
      ? orgName
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
      texts: ['Bienvenue', 'sur L|VE IN BLACK'],
      colors: [VIOLET, WHITE],
    }
  }, [user?.name, user?.role, orgName])

  return (
    <div style={{ position: 'relative', height: 'clamp(52px, 13vw, 100px)', marginBottom: 4 }}>
      <GooeyText
        texts={texts}
        textColors={colors}
        morphTime={0.8}
        cooldownTime={1.5}
        className="w-full h-full"
        textClassName="font-extrabold leading-none tracking-tight"
        textStyle={{
          fontSize: 'clamp(42px, 11vw, 88px)',
          fontFamily: 'Inter, system-ui, sans-serif',
          letterSpacing: 'clamp(-1.5px, -0.04em, -3px)',
          lineHeight: 0.95,
        }}
      />
    </div>
  )
}

export default function HomePage() {
  const navigate  = useNavigate()
  const { user }  = useAuth()

  // Pour les organisateurs : récupérer le nom commercial de leur dossier
  const [orgName, setOrgName] = useState(null)
  useEffect(() => {
    if (user?.role !== 'organisateur') { setOrgName(null); return }
    import('../utils/applications').then(({ getApplicationByUser }) => {
      const app = getApplicationByUser(user.uid, 'organisateur')
      setOrgName(app?.formData?.nomCommercial || null)
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
  const [createdEvents, setCreatedEvents] = useState([])

  useEffect(() => {
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenEvents }) => {
      unsub = listenEvents(evts => {
        setCreatedEvents(evts)
      })
    }).catch(() => {})
    return () => unsub()
  }, [])

  const allEvents = [...events, ...createdEvents]

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

  // Boosts filtrés par la région du visiteur
  const activeBoosts = getActiveBoostsByRegion(regionName)

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

  const handleRegionSelect = (region) => {
    setSelectedRegion(region)
    localStorage.setItem('lib_region', region ? JSON.stringify({ id: region.id }) : 'null')
  }

  const RANK_LABEL = ['01', '02', '03']
  const RANK_COLOR = ['var(--gold)', '#b0b8c8', '#a0714f']

  return (
    <Layout>
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
        <div style={{ padding: '52px 0 48px' }}>
          <HeroGooeyText user={user} orgName={orgName} />
          <p style={{
            fontFamily: 'Inter, sans-serif', fontSize: 'clamp(15px, 4vw, 18px)',
            color: 'rgba(255,255,255,0.38)', marginTop: 20, maxWidth: 420, lineHeight: 1.55,
          }}>
            Découvre les meilleurs événements près de toi. Achète tes billets, booste tes soirées.
          </p>
        </div>

        {/* ── Top 3 Events ── */}
        <RevealSection delay={60}>
          <div style={{ marginBottom: 56 }}>
            {/* section header */}
            <div style={{ marginBottom: 36 }}>
              <p className="eyebrow" style={{ marginBottom: 12, color: 'rgba(255,255,255,0.35)' }}>Top 3 événements</p>
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
                  {selectedRegion?.name || 'Monde'}
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

                      {/* Rank badge */}
                      <div style={{
                        position: 'absolute', top: 16, right: 18,
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
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>
                    Aucun événement dans cette zone
                  </p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.15)' }}>
                    Change de région ou explore tout
                  </p>
                </div>
              )}
            </div>

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
                      <div style={{
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

                        <div style={{ fontSize: 36, marginBottom: 16 }}>🎪</div>
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
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '10px 20px', borderRadius: 999,
                            background: 'rgba(132,68,255,0.22)',
                            border: '1px solid rgba(132,68,255,0.35)',
                            fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#c9b0ff',
                          }}>
                            {orgStatus !== 'none' ? 'Voir mon dossier →' : 'Créer un compte organisateur'}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                          </span>
                          {orgStatus === 'pending' && (
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'rgba(200,169,110,0.12)', border: '1px solid rgba(200,169,110,0.25)', color: 'var(--gold)' }}>
                              En attente
                            </span>
                          )}
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
                      <div style={{
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

                        <div style={{ fontSize: 36, marginBottom: 16 }}>🎤</div>
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
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '10px 20px', borderRadius: 999,
                            background: 'rgba(255,77,166,0.18)',
                            border: '1px solid rgba(255,77,166,0.32)',
                            fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#ffb3d9',
                          }}>
                            {prestStatus !== 'none' ? 'Voir mon dossier →' : 'Créer un compte prestataire'}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                          </span>
                          {prestStatus === 'pending' && (
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'rgba(200,169,110,0.12)', border: '1px solid rgba(200,169,110,0.25)', color: 'var(--gold)' }}>
                              En attente
                            </span>
                          )}
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
    </Layout>
  )
}
