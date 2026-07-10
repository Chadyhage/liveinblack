import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import EmptyState from '../components/EmptyState'
import EventHoverMedia from '../components/EventHoverMedia'
import EventInterestButton from '../components/EventInterestButton'
import { useAuth } from '../context/AuthContext'
import { events as staticEvents } from '../data/events'
import { isEventEnded } from '../utils/event-time'
import { getEventInterests } from '../utils/eventInterests'
import { getUserId } from '../utils/messaging'
import { eventCurrency, fmtMoney } from '../utils/money'

function getLocalCreatedEvents() {
  try { return JSON.parse(localStorage.getItem('lib_created_events') || '[]') } catch { return [] }
}

function getMinPrice(event, interest) {
  const prices = (event?.places || []).map(place => Number(place?.price)).filter(price => Number.isFinite(price))
  if (prices.length) return Math.min(...prices)
  return interest?.event?.minPrice ?? null
}

function InterestCard({ item, event, inactive, onOpen }) {
  const minPrice = getMinPrice(event, item)
  const accent = event.accentColor || event.color || '#4ee8c8'
  const meta = [event.dateDisplay, event.time, event.city].filter(Boolean).join(' · ')

  return (
    <article
      className="lib-press lib-lift"
      onClick={() => onOpen(event.id)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 14,
        background: '#0e0f16',
        border: inactive ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        cursor: 'pointer',
        opacity: inactive ? 0.72 : 1,
      }}
    >
      <div style={{ height: 158, position: 'relative', overflow: 'hidden' }}>
        <EventHoverMedia
          event={event}
          height="100%"
          fallbackBackground={`radial-gradient(circle at 25% 20%, ${(event.color || '#4ee8c8')}55, transparent 54%), linear-gradient(145deg, #151522, #07080d)`}
          overlay="linear-gradient(to top, rgba(8,9,14,0.98) 0%, rgba(8,9,14,0.35) 55%, transparent 86%)"
        />
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 'calc(100% - 86px)' }}>
          {event.category && (
            <span style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(0,0,0,0.58)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.86)', fontFamily: 'Inter, sans-serif', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {event.category}
            </span>
          )}
          {inactive && (
            <span style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(224,90,170,0.16)', border: '1px solid rgba(224,90,170,0.38)', color: '#ff9ed2', fontFamily: 'Inter, sans-serif', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Indisponible
            </span>
          )}
        </div>
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 10, right: 10 }}>
          <EventInterestButton event={event} compact floating />
        </div>
      </div>

      <div style={{ padding: 15, display: 'grid', gap: 10 }}>
        <div>
          <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: 19, fontWeight: 850, letterSpacing: '-0.4px', color: accent, lineHeight: 1.12, margin: 0 }}>
            {event.name}
          </h2>
          <p style={{ margin: '5px 0 0', fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {meta || 'Date à confirmer'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
            Ajouté le {new Date(item.createdAt || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
          </span>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 850, color: '#c8a96e', whiteSpace: 'nowrap' }}>
            {minPrice == null ? 'Voir les places' : minPrice > 0 ? `dès ${fmtMoney(minPrice, eventCurrency(event))}` : 'Gratuit'}
          </span>
        </div>
      </div>
    </article>
  )
}

export default function InterestedEventsPage() {
  const { user } = useAuth()
  const uid = getUserId(user)
  const navigate = useNavigate()
  const [interests, setInterests] = useState(() => getEventInterests(uid))
  const [remoteEvents, setRemoteEvents] = useState([])
  const [createdEvents, setCreatedEvents] = useState(() => getLocalCreatedEvents())

  useEffect(() => {
    if (!uid) { setInterests([]); return }
    setInterests(getEventInterests(uid))
    let stopSocial = () => {}
    let stopEvents = () => {}
    import('../utils/firestore-sync').then(({ listenDoc, listenEvents }) => {
      stopSocial = listenDoc(`user_social/${uid}`, data => {
        if (data?.interestedEvents) {
          localStorage.setItem(`lib_event_interests_${uid}`, JSON.stringify(data.interestedEvents))
          setInterests(getEventInterests(uid))
        }
      })
      stopEvents = listenEvents(items => setRemoteEvents(items))
    }).catch(() => {})
    const refresh = () => {
      setCreatedEvents(getLocalCreatedEvents())
      setInterests(getEventInterests(uid))
    }
    window.addEventListener('lib:event-interests-updated', refresh)
    window.addEventListener('lib:sync-complete', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      try { stopSocial() } catch {}
      try { stopEvents() } catch {}
      window.removeEventListener('lib:event-interests-updated', refresh)
      window.removeEventListener('lib:sync-complete', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [uid])

  const activeInterests = interests.filter(item => item.status === 'active')
  const eventById = useMemo(() => {
    const map = new Map()
    for (const event of [...staticEvents, ...createdEvents, ...remoteEvents]) {
      if (event?.id) map.set(String(event.id), event)
    }
    return map
  }, [createdEvents, remoteEvents])

  const resolved = activeInterests.map(item => ({
    item,
    event: { ...(item.event || {}), ...(eventById.get(String(item.eventId)) || {}) },
  }))

  const upcoming = resolved.filter(({ event }) => !event.cancelled && !isEventEnded(event))
  const inactive = resolved.filter(({ event }) => event.cancelled || isEventEnded(event))

  return (
    <Layout>
      <main style={{ minHeight: '100vh', padding: '18px 16px 92px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <button onClick={() => navigate('/profil')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 0, padding: 0, color: 'rgba(255,255,255,0.55)', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 650, cursor: 'pointer' }}>
            <span aria-hidden="true">←</span>
            Profil
          </button>

          <header style={{ marginTop: 18, marginBottom: 20, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'end', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: '0 0 7px', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 850, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c8a96e' }}>
                Ma liste
              </p>
              <h1 style={{ margin: 0, fontFamily: 'Bebas Neue, Inter, sans-serif', fontSize: 'clamp(40px, 10vw, 68px)', lineHeight: 0.9, letterSpacing: '0.02em', color: '#fff' }}>
                Événements intéressés
              </h1>
            </div>
            <button onClick={() => navigate('/evenements')} className="lib-press" style={{ minHeight: 42, padding: '0 17px', borderRadius: 12, border: '1px solid rgba(200,169,110,0.35)', background: 'rgba(200,169,110,0.13)', color: '#e0c080', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 850, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer' }}>
              Explorer
            </button>
          </header>

          {activeInterests.length === 0 ? (
            <EmptyState
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(78,232,200,0.75)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6c-1.8-1.8-4.7-1.8-6.5 0L12 6.9 9.7 4.6c-1.8-1.8-4.7-1.8-6.5 0s-1.8 4.7 0 6.5L12 20l8.8-8.9c1.8-1.8 1.8-4.7 0-6.5z" /></svg>}
              title="Aucun événement sauvegardé"
              subtitle="Sur une fiche événement, touche Intéressé pour le retrouver ici."
            />
          ) : (
            <div style={{ display: 'grid', gap: 28 }}>
              <section>
                <h2 style={{ margin: '0 0 12px', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 850, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.62)' }}>
                  À venir <span style={{ color: 'rgba(255,255,255,0.3)' }}>{upcoming.length}</span>
                </h2>
                {upcoming.length === 0 ? (
                  <div style={{ padding: '22px 18px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)', background: '#0e0f16', color: 'rgba(255,255,255,0.48)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
                    Aucun événement à venir dans ta liste pour l'instant.
                  </div>
                ) : (
                  <div className="lib-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                    {upcoming.map(({ item, event }) => (
                      <InterestCard key={item.eventId} item={item} event={event} onOpen={(id) => navigate(`/evenements/${id}`)} />
                    ))}
                  </div>
                )}
              </section>

              {inactive.length > 0 && (
                <section>
                  <h2 style={{ margin: '0 0 12px', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 850, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)' }}>
                    Passés ou indisponibles <span style={{ color: 'rgba(255,255,255,0.25)' }}>{inactive.length}</span>
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                    {inactive.map(({ item, event }) => (
                      <InterestCard key={item.eventId} item={item} event={event} inactive onOpen={(id) => navigate(`/evenements/${id}`)} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>
    </Layout>
  )
}
