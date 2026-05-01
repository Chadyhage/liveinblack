import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { events } from '../data/events'
import { useAuth } from '../context/AuthContext'
import { getUserId, sendMessage } from '../utils/messaging'

function getCreatedEvents() {
  try { return JSON.parse(localStorage.getItem('lib_created_events') || '[]') } catch { return [] }
}
function getUnlockedEvents() {
  try { return JSON.parse(localStorage.getItem('lib_unlocked_events') || '[]') } catch { return [] }
}
function getEventCodes() {
  try { return JSON.parse(localStorage.getItem('lib_event_codes') || '{}') } catch { return {} }
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

function isEventVisible(ev) {
  const now = Date.now()
  if (ev.cancelled) return false
  if (ev.publishAt && new Date(ev.publishAt).getTime() > now) return false
  const gracePeriodMs = 48 * 60 * 60 * 1000
  if (ev.closingDate) {
    if (new Date(ev.closingDate).getTime() + gracePeriodMs < now) return false
  } else if (isEventPast(ev)) {
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

const KNOWN_CATEGORIES = ['Afrobeat', 'Rap', 'Électronique']
const CATEGORIES = ['Tous', ...KNOWN_CATEGORIES, 'Autre']

export default function EventsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const myId = getUserId(user)
  const myName = user?.name || 'Moi'
  const [searchParams] = useSearchParams()
  const shareConvId = searchParams.get('share')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Tous')
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [codeMsg, setCodeMsg] = useState(null)
  const [sharedEventId, setSharedEventId] = useState(null)

  function handleShareEvent(event) {
    if (!shareConvId || !myId) return
    const minPrice = event.places?.length > 0 ? Math.min(...event.places.map(p => p.price)) : null
    const payload = JSON.stringify({ id: event.id, name: event.name, date: event.dateDisplay, price: minPrice, image: event.imageUrl || null })
    sendMessage(shareConvId, myId, myName, 'event', payload)
    setSharedEventId(event.id)
    setTimeout(() => navigate('/messagerie'), 800)
  }

  // Real-time events from Firestore — source of truth for all users
  // + fallback localStorage (events créés sur ce device, pas encore syncés)
  const [createdEventsState, setCreatedEventsState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lib_created_events') || '[]') } catch { return [] }
  })
  const unsubEventsRef = useRef(() => {})

  useEffect(() => {
    import('../utils/firestore-sync').then(({ listenEvents }) => {
      unsubEventsRef.current = listenEvents(firestoreEvts => {
        // Merge robuste : Firestore + events locaux qui ne sont pas (encore) sync
        setCreatedEventsState(prev => {
          const incomingIds = new Set(firestoreEvts.map(e => String(e.id)))
          const localOnly = prev.filter(e => !incomingIds.has(String(e.id)))
          return [...firestoreEvts, ...localOnly]
        })
      })
    }).catch(() => {})
    return () => unsubEventsRef.current()
  }, [])

  // Dédupliquer en cas de doublons (statiques vs créés ayant le même id)
  const allEvents = (() => {
    const seen = new Set()
    const list = []
    for (const e of [...events, ...createdEventsState]) {
      const key = String(e.id)
      if (seen.has(key)) continue
      seen.add(key)
      list.push(e)
    }
    return list
  })()
  const unlockedEvents = getUnlockedEvents()

  // Filter: show public events + unlocked private events
  const visibleEvents = allEvents.filter(e => !e.isPrivate || unlockedEvents.includes(String(e.id)))

  const filtered = visibleEvents.filter((e) => {
    const q = search.toLowerCase()
    const matchSearch =
      (e.name || '').toLowerCase().includes(q) ||
      (e.city || '').toLowerCase().includes(q) ||
      (e.category || '').toLowerCase().includes(q)
    const matchCategory =
      activeCategory === 'Tous' ||
      (activeCategory === 'Autre' ? !KNOWN_CATEGORIES.includes(e.category) : e.category === activeCategory)
    return matchSearch && matchCategory && isEventVisible(e)
  })

  function handleCodeSubmit() {
    const code = codeInput.trim().toUpperCase()
    if (!code) return

    const eventCodes = getEventCodes()
    let found = false

    for (const [eventId, codes] of Object.entries(eventCodes)) {
      const idx = codes.findIndex(c => c.code === code && !c.usedBy)
      if (idx !== -1) {
        // Mark code as used
        codes[idx].usedBy = 'user_' + Date.now()
        localStorage.setItem('lib_event_codes', JSON.stringify(eventCodes))

        // Unlock the event for this user
        const unlocked = getUnlockedEvents()
        if (!unlocked.includes(eventId)) {
          localStorage.setItem('lib_unlocked_events', JSON.stringify([...unlocked, eventId]))
        }

        found = true
        setCodeMsg({ type: 'success', text: 'Code valide — événement débloqué.' })
        setTimeout(() => {
          setShowCodeModal(false)
          setCodeInput('')
          setCodeMsg(null)
          navigate(`/evenements/${eventId}`)
        }, 1200)
        break
      }
    }

    if (!found) {
      // Check if code was already used
      let alreadyUsed = false
      for (const codes of Object.values(eventCodes)) {
        if (codes.find(c => c.code === code && c.usedBy)) {
          alreadyUsed = true
          break
        }
      }
      setCodeMsg({ type: 'error', text: alreadyUsed ? 'Ce code a déjà été utilisé.' : 'Code invalide ou expiré.' })
    }
  }

  return (
    <Layout>
      <div style={{ position: 'relative', zIndex: 1, background: 'transparent', padding: '20px 16px 32px' }}>

        {/* Share mode banner */}
        {shareConvId && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            background: 'rgba(200,169,110,0.08)',
            border: '1px solid rgba(200,169,110,0.28)',
            borderRadius: 12,
            marginBottom: 20,
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(200,169,110,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8a96e', margin: 0 }}>Mode partage</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: '3px 0 0' }}>Appuie sur un événement pour l'envoyer dans la conversation</p>
            </div>
            <button
              onClick={() => navigate('/messagerie')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.28)', fontSize: 16, flexShrink: 0, padding: 4, lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Title + Code button */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.4em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', margin: '0 0 6px' }}>
              Découvrir
            </p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 34, color: 'white', margin: 0, lineHeight: 1 }}>
              Événements
            </h2>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.28)', margin: '6px 0 0' }}>
              {visibleEvents.length} soirées disponibles
            </p>
          </div>
          {!shareConvId && (
            <button
              onClick={() => setShowCodeModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '10px 16px',
                background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                border: '1px solid rgba(200,169,110,0.45)',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: "'DM Mono', monospace",
                fontSize: 10,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#c8a96e',
                transition: 'all 0.2s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              J'ai un code
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.25)', pointerEvents: 'none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input
            style={{
              width: '100%',
              padding: '12px 14px 12px 38px',
              background: 'rgba(6,8,16,0.6)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 4,
              fontFamily: "'DM Mono', monospace",
              fontSize: 13,
              color: 'white',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s',
            }}
            placeholder="Recherche par nom, ville, style..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={e => e.target.style.borderColor = '#4ee8c8'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.3)',
                fontSize: 14,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Categories */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 24, scrollbarWidth: 'none' }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                flexShrink: 0,
                padding: '7px 18px',
                background: activeCategory === cat ? 'rgba(78,232,200,0.10)' : 'rgba(255,255,255,0.07)',
                border: `1px solid ${activeCategory === cat ? '#4ee8c8' : 'rgba(255,255,255,0.13)'}`,
                borderRadius: 999,
                cursor: 'pointer',
                fontFamily: "'DM Mono', monospace",
                fontSize: 10,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: activeCategory === cat ? '#4ee8c8' : 'rgba(255,255,255,0.45)',
                transition: 'all 0.2s',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Events list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 0' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', margin: 0 }}>
                Aucun événement trouvé
              </p>
            </div>
          ) : (
            filtered.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                shareMode={!!shareConvId}
                shared={sharedEventId === event.id}
                onClick={() => shareConvId ? handleShareEvent(event) : navigate(`/evenements/${event.id}`)}
              />
            ))
          )}
        </div>
      </div>

      {/* Code modal */}
      {showCodeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}
            onClick={() => { setShowCodeModal(false); setCodeInput(''); setCodeMsg(null) }}
          />
          <div style={{
            position: 'relative',
            background: 'rgba(8,10,20,0.92)',
            backdropFilter: 'blur(22px)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 12,
            padding: '32px 28px',
            width: '100%',
            maxWidth: 360,
          }}>
            {/* Modal header */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                background: 'rgba(200,169,110,0.12)',
                border: '1px solid rgba(200,169,110,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: 22, color: 'white', margin: '0 0 8px' }}>
                Code d'accès privé
              </h3>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.28)', margin: 0, lineHeight: 1.6 }}>
                Entre le code reçu de l'organisateur pour débloquer la soirée.
              </p>
            </div>

            {/* Code input */}
            <input
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'rgba(6,8,16,0.6)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 4,
                fontFamily: "'DM Mono', monospace",
                fontSize: 16,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: 'white',
                textAlign: 'center',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: 12,
                transition: 'border-color 0.2s',
              }}
              placeholder="EX: NEON2026"
              value={codeInput}
              onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeMsg(null) }}
              onKeyDown={e => e.key === 'Enter' && handleCodeSubmit()}
              onFocus={e => e.target.style.borderColor = '#4ee8c8'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'}
              maxLength={20}
            />

            {/* Feedback message */}
            {codeMsg && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 6,
                marginBottom: 12,
                fontFamily: "'DM Mono', monospace",
                fontSize: 10,
                letterSpacing: '0.15em',
                textAlign: 'center',
                background: codeMsg.type === 'success' ? 'rgba(78,232,200,0.08)' : 'rgba(224,90,170,0.08)',
                border: `1px solid ${codeMsg.type === 'success' ? 'rgba(78,232,200,0.25)' : 'rgba(224,90,170,0.25)'}`,
                color: codeMsg.type === 'success' ? '#4ee8c8' : '#e05aaa',
              }}>
                {codeMsg.text}
              </div>
            )}

            {/* Modal buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                onClick={() => { setShowCodeModal(false); setCodeInput(''); setCodeMsg(null) }}
                style={{
                  flex: 1,
                  padding: '13px 16px',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.6)',
                  transition: 'all 0.2s',
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleCodeSubmit}
                style={{
                  flex: 1,
                  padding: '13px 16px',
                  background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                  border: '1px solid rgba(200,169,110,0.45)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  letterSpacing: '0.25em',
                  textTransform: 'uppercase',
                  color: '#c8a96e',
                  transition: 'all 0.2s',
                }}
              >
                Valider
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

function EventCard({ event, onClick, shareMode, shared }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
    >
      <div
        style={{
          position: 'relative',
          background: 'rgba(8,10,20,0.55)',
          backdropFilter: 'blur(22px)',
          border: shareMode ? '1px solid rgba(200,169,110,0.35)' : '1px solid rgba(255,255,255,0.10)',
          borderRadius: 12,
          overflow: 'hidden',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          transform: hovered && !shared ? 'translateY(-4px)' : 'none',
          boxShadow: hovered && !shared ? '0 12px 40px rgba(0,0,0,0.45)' : 'none',
          opacity: shared ? 0.6 : 1,
        }}
      >
        {/* Iridescent top edge on hover */}
        {hovered && !shared && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background: 'linear-gradient(90deg, #4ee8c8, #e05aaa, #c8a96e)',
            zIndex: 2,
          }} />
        )}

        {/* Share overlay */}
        {shareMode && !shared && hovered && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            borderRadius: 12,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
              border: '1px solid rgba(200,169,110,0.45)',
              borderRadius: 4,
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#c8a96e',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              Partager dans la conversation
            </div>
          </div>
        )}

        {/* Sent confirmation overlay */}
        {shared && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.65)',
            borderRadius: 12,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              background: 'rgba(78,232,200,0.10)',
              border: '1px solid rgba(78,232,200,0.35)',
              borderRadius: 4,
              fontFamily: "'DM Mono', monospace",
              fontSize: 10,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#4ee8c8',
            }}>
              Envoyé
            </div>
          </div>
        )}

        {/* Color accent bar */}
        <div style={{ height: 2, width: '100%', background: `linear-gradient(to right, ${event.color}, ${event.accentColor})` }} />

        {event.imageUrl ? (
          /* Image card (user-created events with photo) */
          <>
            <div style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden' }}>
              <img
                src={event.imageUrl}
                alt={event.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transition: 'transform 0.5s ease',
                  transform: hovered ? 'scale(1.05)' : 'scale(1)',
                }}
              />
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: 20, color: event.accentColor, margin: '0 0 4px', lineHeight: 1.2 }}>
                  {event.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.1em' }}>
                    {event.dateDisplay}
                  </span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.1em' }}>
                    {event.city}
                  </span>
                </div>
              </div>
              {event.userCreated && (
                <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 9,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: '#c8a96e',
                  background: 'rgba(200,169,110,0.10)',
                  border: '1px solid rgba(200,169,110,0.25)',
                  padding: '4px 10px',
                  borderRadius: 4,
                  flexShrink: 0,
                  marginLeft: 12,
                }}>
                  Mon event
                </span>
              )}
            </div>
          </>
        ) : (
          /* Gradient card (static events) */
          <>
            <div
              style={{
                height: 120,
                position: 'relative',
                overflow: 'hidden',
                background: `linear-gradient(135deg, ${event.color}22 0%, ${event.color}08 100%)`,
              }}
            >
              <div style={{
                position: 'absolute',
                inset: 0,
                opacity: 0.12,
                backgroundImage: `radial-gradient(circle at 20% 50%, ${event.color} 0%, transparent 50%), radial-gradient(circle at 80% 20%, ${event.accentColor} 0%, transparent 40%)`,
              }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontWeight: 300,
                  fontSize: 38,
                  letterSpacing: '0.08em',
                  opacity: 0.18,
                  color: event.color,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  maxWidth: '90%',
                  textOverflow: 'ellipsis',
                }}>
                  {event.name}
                </span>
              </div>
              {/* Tags */}
              <div style={{ position: 'absolute', top: 12, left: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(event.tags || []).map((tag) => (
                  <span key={tag} style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 9,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    padding: '3px 10px',
                    borderRadius: 999,
                    border: `1px solid ${event.color}44`,
                    background: `${event.color}11`,
                    color: event.accentColor,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Card body */}
            <div style={{ padding: '14px 16px' }}>
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: 22, color: event.accentColor, margin: '0 0 4px', lineHeight: 1.2 }}>
                {event.name}
              </h3>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.30)', margin: '0 0 12px', letterSpacing: '0.08em' }}>
                {event.subtitle}
              </p>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                paddingTop: 12,
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}>
                {/* Date */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em' }}>{event.dateDisplay}</span>
                </div>
                {/* Time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em' }}>{event.time}</span>
                </div>
                {/* City */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.08em', maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {event.city}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </button>
  )
}
