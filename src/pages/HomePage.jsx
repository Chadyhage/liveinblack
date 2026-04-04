import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import RegionSelector from '../components/RegionSelector'
import { events, getTopEventsByRegion } from '../data/events'
import { useAuth } from '../context/AuthContext'
import { regions } from '../data/regions'
import { getActiveBoosts } from '../utils/ticket'
import { getEnabledRoles, requestAdditionalRole } from '../utils/accounts'

function getGreeting() {
  const h = new Date().getHours()
  if (h >= 5  && h < 12) return 'Bonjour'
  if (h >= 12 && h < 18) return 'Bon après-midi'
  if (h >= 18 && h < 22) return 'Bonsoir'
  return 'Bonne nuit'
}

export default function HomePage() {
  const navigate  = useNavigate()
  const { user }  = useAuth()

  const defaultRegion = regions.find((r) => r.id === 'france')
  const [selectedRegion, setSelectedRegion] = useState(() => {
    try {
      const saved = localStorage.getItem('lib_region')
      if (saved) {
        const { id } = JSON.parse(saved)
        const found = regions.find(r => r.id === id)
        if (found) return found
      }
    } catch {}
    return defaultRegion
  })
  const [showRegionSelector, setShowRegionSelector] = useState(false)
  const [geoToast, setGeoToast] = useState('')
  const [requestingRole, setRequestingRole] = useState(null)
  const [requestedRoles, setRequestedRoles] = useState([]) // optimistic UI

  const enabledRoles  = user ? getEnabledRoles(user) : []
  const isClient      = user && (enabledRoles.includes('client') || enabledRoles.includes('user')) && !enabledRoles.includes('organisateur') && !enabledRoles.includes('prestataire') && user.role !== 'agent'
  const orgStatus     = user?.orgStatus  || 'none'
  const prestStatus   = user?.prestStatus || 'none'

  async function handleRequestRole(role) {
    if (!user || requestingRole || requestedRoles.includes(role)) return
    setRequestingRole(role)
    try {
      await requestAdditionalRole(user, role)
      setRequestedRoles(prev => [...prev, role])
    } finally {
      setRequestingRole(null)
    }
  }

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

  const allEvents = (() => {
    try {
      const created = JSON.parse(localStorage.getItem('lib_created_events') || '[]')
      return [...events, ...created]
    } catch { return events }
  })()

  const activeBoosts = getActiveBoosts()
  const baseTopThree = selectedRegion ? getTopEventsByRegion(selectedRegion.name) : events.slice(0, 3)

  // Build a map of position → boosted event (each slot holds at most one boost)
  const boostedByPosition = {}
  activeBoosts.forEach(b => {
    const ev = allEvents.find(e => e.id === b.eventId)
    if (ev && b.position >= 1 && b.position <= 3 && !boostedByPosition[b.position]) {
      boostedByPosition[b.position] = { ...ev, boostPosition: b.position, featured: true }
    }
  })
  const boostedIds = new Set(Object.values(boostedByPosition).map(e => e.id))
  const fallback   = baseTopThree.filter(e => !boostedIds.has(e.id))

  // Place boosted events at their declared position; fill empty slots with fallback events
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
    localStorage.setItem('lib_region', JSON.stringify({ id: region.id }))
  }

  // rank labels
  const RANK_LABEL = ['01', '02', '03']

  return (
    <Layout>
      {/* geo toast */}
      {geoToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up"
          style={{
            padding: '8px 20px',
            background: 'rgba(6,8,16,0.75)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(78,232,200,0.3)',
            borderRadius: '4px',
            color: 'var(--teal)',
            fontFamily: 'DM Mono, monospace',
            fontSize: '10px',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
          }}>
          {geoToast}
        </div>
      )}

      {/* ── Main content ── */}
      <div className="relative animate-fade-in-up" style={{ zIndex: 1 }}>

        {/* ── Greeting ── */}
        <div className="px-4 pt-4 pb-6">
          {/* eyebrow */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginBottom: 14,
          }}>
            <span style={{
              display: 'inline-block', width: 28, height: 1,
              background: 'var(--teal)',
              flexShrink: 0,
            }} />
            <span style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: 9, letterSpacing: '0.4em',
              textTransform: 'uppercase',
              color: 'var(--teal)',
            }}>
              {getGreeting()}
            </span>
          </div>

          {/* name */}
          <h2 style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontSize: 'clamp(2.4rem, 11vw, 3.8rem)',
            fontWeight: 300,
            lineHeight: 1.05,
            letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.92)',
          }}>
            {user?.name || 'Bienvenue'}
          </h2>
        </div>

        {/* ── Role upgrade CTAs — only for pure clients ── */}
        {isClient && (
          <div className="px-4 pb-2">
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: '16px',
              background: 'rgba(8,10,20,0.45)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              marginBottom: 8,
            }}>
              <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', marginBottom: 4 }}>
                Élargis ton espace
              </p>

              {/* Organisateur CTA */}
              {!enabledRoles.includes('organisateur') && (
                <RoleCTA
                  icon="🎪"
                  label="Organiser un événement"
                  desc="Crée tes événements et gère tes billets"
                  color="#3b82f6"
                  status={orgStatus}
                  onRequest={() => navigate(orgStatus === 'pending' ? '/mon-dossier' : '/onboarding-organisateur')}
                />
              )}

              {/* Prestataire CTA */}
              {!enabledRoles.includes('prestataire') && (
                <RoleCTA
                  icon="🎤"
                  label="Proposer mes services"
                  desc="DJ, salle, matériel, traiteur…"
                  color="#8b5cf6"
                  status={prestStatus}
                  onRequest={() => navigate(prestStatus === 'pending' ? '/mon-dossier' : '/onboarding-prestataire')}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Events section ── */}
        <div className="px-4 pb-10">

          {/* section header */}
          <div style={{ marginBottom: 24 }}>
            <p style={{
              fontFamily: 'DM Mono, monospace',
              fontSize: 9, letterSpacing: '0.4em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginBottom: 10,
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: 18,
            }}>
              Top 3 événements
            </p>

            <button
              onClick={() => setShowRegionSelector(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              }}
            >
              <h3 style={{
                fontFamily: 'Cormorant Garamond, serif',
                fontSize: 'clamp(2rem, 9vw, 2.8rem)',
                fontWeight: 300,
                letterSpacing: '0.04em',
                color: 'rgba(255,255,255,0.88)',
                lineHeight: 1,
                borderBottom: '1px solid rgba(255,255,255,0.12)',
                paddingBottom: 2,
              }}>
                {selectedRegion?.name || 'Monde'}
              </h3>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, marginTop: 4 }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          {/* Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {topThree.length > 0 ? (
              topThree.map((event, i) => (
                <button
                  key={event.id}
                  onClick={() => navigate(`/evenements/${event.id}`)}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  <div style={{
                    position: 'relative',
                    background: 'rgba(8,10,20,0.55)',
                    backdropFilter: 'blur(22px)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}>
                    {/* Color accent bar */}
                    <div style={{ height: 2, width: '100%', background: `linear-gradient(to right, ${event.color}, ${event.accentColor || event.color})` }} />

                    {/* Banner */}
                    {event.imageUrl ? (
                      <div style={{ width: '100%', height: 120, overflow: 'hidden', position: 'relative' }}>
                        <img src={event.imageUrl} alt={event.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ) : (
                      <div style={{
                        height: 120, position: 'relative', overflow: 'hidden',
                        background: `linear-gradient(135deg, ${event.color}22 0%, ${event.color}08 100%)`,
                      }}>
                        <div style={{
                          position: 'absolute', inset: 0, opacity: 0.12,
                          backgroundImage: `radial-gradient(circle at 20% 50%, ${event.color} 0%, transparent 50%), radial-gradient(circle at 80% 20%, ${event.accentColor || event.color} 0%, transparent 40%)`,
                        }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{
                            fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 38,
                            letterSpacing: '0.08em', opacity: 0.18, color: event.color,
                            whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '90%', textOverflow: 'ellipsis',
                          }}>
                            {event.name}
                          </span>
                        </div>
                        {/* Tags */}
                        <div style={{ position: 'absolute', top: 12, left: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {event.tags?.map((tag) => (
                            <span key={tag} style={{
                              fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em',
                              textTransform: 'uppercase', padding: '3px 10px', borderRadius: 999,
                              border: `1px solid ${event.color}44`, background: `${event.color}11`,
                              color: event.accentColor || event.color,
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Rank badge overlay */}
                    <div style={{
                      position: 'absolute', top: 10, right: 14,
                      fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 300,
                      color: i === 0 ? '#c8a96e' : i === 1 ? '#b0b8c8' : '#a0714f',
                      opacity: 0.75, letterSpacing: '-0.02em', lineHeight: 1,
                    }}>
                      {RANK_LABEL[i]}
                    </div>

                    {/* Info row */}
                    <div style={{ padding: '12px 16px' }}>
                      <p style={{
                        fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: 20,
                        color: 'rgba(255,255,255,0.9)', margin: '0 0 4px', lineHeight: 1.2,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {event.name}
                      </p>
                      <p style={{
                        fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'var(--muted)',
                        letterSpacing: '0.05em', marginBottom: 8,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {event.subtitle}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                          {event.dateDisplay}
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: 8 }}>·</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>
                          {event.city}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <p style={{
                  fontFamily: 'DM Mono, monospace',
                  fontSize: 11, color: 'var(--muted)',
                  letterSpacing: '0.15em', textTransform: 'uppercase',
                }}>
                  Aucun événement dans cette zone
                </p>
                <p style={{
                  fontFamily: 'DM Mono, monospace',
                  fontSize: 10, color: 'rgba(255,255,255,0.15)',
                  marginTop: 6,
                }}>
                  Change de région ou explore tout
                </p>
              </div>
            )}
          </div>
        </div>
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

// ── Role upgrade CTA card ──────────────────────────────────────────────────
function RoleCTA({ icon, label, desc, color, status, onRequest }) {
  const isPending  = status === 'pending'
  const isRejected = status === 'rejected'

  return (
    <button
      onClick={onRequest}
      style={{
        width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 8,
        background: isPending ? 'rgba(200,169,110,0.05)' : color + '08',
        border: isPending ? '1px solid rgba(200,169,110,0.22)' : `1px solid ${color}28`,
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: isPending ? '#c8a96e' : color, margin: '0 0 2px' }}>
          {isPending ? 'Dossier en cours…' : isRejected ? `${label} — refusé` : label}
        </p>
        <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.05em', margin: 0 }}>
          {isPending
            ? 'Voir le statut de mon dossier →'
            : isRejected
              ? 'Soumettre un nouveau dossier'
              : desc}
        </p>
      </div>
      {isPending ? (
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 7, letterSpacing: '0.1em', color: '#c8a96e', padding: '2px 6px', borderRadius: 3, border: '1px solid rgba(200,169,110,0.3)', background: 'rgba(200,169,110,0.06)', textTransform: 'uppercase', flexShrink: 0, whiteSpace: 'nowrap' }}>
          En cours
        </span>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.6 }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
      )}
    </button>
  )
}
