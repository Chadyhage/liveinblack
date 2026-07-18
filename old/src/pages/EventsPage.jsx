import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import PublicNav from '../components/PublicNav'
import { events } from '../data/events'
import { useAuth } from '../context/AuthContext'
import { getUserId, sendMessage } from '../utils/messaging'
import { getEventCountdown, isCountdownUrgent, getStockBadge } from '../utils/eventUrgency'
import { fmtMoney, eventCurrency } from '../utils/money'
import { normalizeGeoText } from '../utils/locations'
import EmptyState from '../components/EmptyState'
import { MessagingSearchBar } from '../components/MessagingActions'
import EventHoverMedia from '../components/EventHoverMedia'
import { isEventEnded } from '../utils/event-time'
import { isPlaceholderEvent } from '../utils/eventDiscovery'

// Coquille publique (visiteur NON connecté) : même navbar que la vitrine
// (PublicNav, vidéo + onglet actif) pour une transition cohérente depuis la
// landing — au lieu de basculer sur la nav de l'app connectée (effet « bug »).
function PublicShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', color: '#fff' }}>
      <PublicNav />
      <div style={{ maxWidth: 1320, margin: '0 auto', width: '100%' }}>
        {children}
      </div>
    </div>
  )
}

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
  if (ev.isDemo === true || ev.demoLabel || isPlaceholderEvent(ev)) return false
  if (ev.publishAt && new Date(ev.publishAt).getTime() > now) return false
  if (isEventEnded(ev)) return false
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

const KNOWN_CATEGORIES = ['Afrobeat', 'Amapiano', 'Zouk / Kompa', 'Hip-Hop', 'House', 'Live']
const CATEGORIES = ['Tous', ...KNOWN_CATEGORIES, 'Autre']

export default function EventsPage() {
  const navigate = useNavigate()
  const { user, openAuthModal } = useAuth()
  const myId = getUserId(user)
  const myName = user?.name || 'Moi'
  const [searchParams] = useSearchParams()
  const shareConvId = searchParams.get('share')
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [activeCategory, setActiveCategory] = useState('Tous')
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [codeMsg, setCodeMsg] = useState(null)
  const [sharedEventId, setSharedEventId] = useState(null)
  const codePromptedRef = useRef(false)

  useEffect(() => {
    if (searchParams.get('code') !== '1' || codePromptedRef.current) return
    codePromptedRef.current = true
    if (user) setShowCodeModal(true)
    else openAuthModal('Connecte-toi pour débloquer une soirée privée avec ton code.')
  }, [searchParams, user, openAuthModal])

  function handleShareEvent(event) {
    if (!shareConvId || !myId) return
    const minPrice = event.places?.length > 0 ? Math.min(...event.places.map(p => p.price)) : null
    const payload = JSON.stringify({ id: event.id, name: event.name, date: event.dateDisplay, price: minPrice, currency: eventCurrency(event), image: event.imageUrl || null })
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
    import('../utils/firestore-sync').then(({ listenEvents, reconcileCreatedEvents }) => {
      unsubEventsRef.current = listenEvents(firestoreEvts => {
        // Réconciliation : Firestore + créations locales encore non synchronisées
        // (_pendingSync). Un event supprimé côté serveur disparaît (plus de fantôme).
        setCreatedEventsState(prev => {
          const next = reconcileCreatedEvents(prev, firestoreEvts)
          try { localStorage.setItem('lib_created_events', JSON.stringify(next)) } catch {}
          return next
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
    // Recherche normalisée (accents/casse) sur plus de champs — cohérent avec
    // HeroSearch et la recherche globale (audit pages #4 : avant, sensible aux
    // accents et limitée à nom/ville/catégorie).
    const q = normalizeGeoText(search)
    const hay = [e.name, e.city, e.category, e.subtitle, e.organizer, e.venue,
      e.region, ...(e.tags || []), ...(e.artists || []), ...(e.lineup || [])].map(normalizeGeoText).join(' ')
    const matchSearch = !q || hay.includes(q)
    const matchCategory =
      activeCategory === 'Tous' ||
      (activeCategory === 'Autre' ? !KNOWN_CATEGORIES.includes(e.category) : e.category === activeCategory)
    return matchSearch && matchCategory && isEventVisible(e)
  })

  function unlockAndGo(eventId) {
    const unlocked = getUnlockedEvents()
    if (!unlocked.includes(String(eventId))) {
      const next = [...unlocked, String(eventId)]
      localStorage.setItem('lib_unlocked_events', JSON.stringify(next))
      // Cross-device : sans cette persistance, l'event débloqué sur PC reste
      // verrouillé sur téléphone alors que le code est déjà consommé → client
      // bloqué à l'entrée le soir J. syncOnLogin recharge ce doc au login.
      if (user?.uid) {
        import('../utils/firestore-sync').then(({ syncDoc }) => {
          syncDoc(`user_private_access/${user.uid}`, { items: next, updatedAt: Date.now() })
        }).catch(() => {})
      }
    }
    setCodeMsg({ type: 'success', text: 'Code valide — événement débloqué.' })
    setTimeout(() => {
      setShowCodeModal(false)
      setCodeInput('')
      setCodeMsg(null)
      navigate(`/evenements/${eventId}`)
    }, 1200)
  }

  async function handleCodeSubmit() {
    // Sécurité : un code d'accès privé ne peut être utilisé que connecté
    // (sinon usedBy = user_<timestamp> anonyme → contournement de l'invitation).
    if (!user) {
      setShowCodeModal(false)
      openAuthModal('Connecte-toi pour débloquer une soirée privée avec ton code.')
      return
    }
    const code = codeInput.trim().toUpperCase()
    if (!code) return

    // ── Source de vérité : collection plate event_access_codes/{code} ────────
    // Permet de valider un code créé par un organisateur sur un AUTRE device
    // (avant, on ne lisait que le localStorage local → inutilisable cross-device).
    try {
      const { db, USE_REAL_FIREBASE } = await import('../firebase')
      if (USE_REAL_FIREBASE) {
        const { doc, getDoc, setDoc } = await import('firebase/firestore')
        const snap = await getDoc(doc(db, 'event_access_codes', code))
        if (snap.exists()) {
          const data = snap.data()
          if (data.usedBy) {
            setCodeMsg({ type: 'error', text: 'Ce code a déjà été utilisé.' })
            return
          }
          // Marquer utilisé côté serveur (atomique au mieux via merge)
          const usedBy = user?.uid || ('user_' + Date.now())
          await setDoc(doc(db, 'event_access_codes', code), { usedBy, usedAt: Date.now() }, { merge: true })
          // Refléter en local aussi
          const eventCodes = getEventCodes()
          const key = String(data.eventId)
          const list = eventCodes[key] || []
          const i = list.findIndex(c => c.code === code)
          if (i !== -1) list[i].usedBy = usedBy
          else list.push({ code, usedBy })
          eventCodes[key] = list
          localStorage.setItem('lib_event_codes', JSON.stringify(eventCodes))
          unlockAndGo(data.eventId)
          return
        }
      }
    } catch {} // Firestore indispo → fallback localStorage ci-dessous

    // ── Fallback localStorage (hors-ligne / legacy même device) ──────────────
    const eventCodes = getEventCodes()
    for (const [eventId, codes] of Object.entries(eventCodes)) {
      const idx = codes.findIndex(c => c.code === code && !c.usedBy)
      if (idx !== -1) {
        codes[idx].usedBy = user?.uid || ('user_' + Date.now())
        localStorage.setItem('lib_event_codes', JSON.stringify(eventCodes))
        // Best-effort sync du statut utilisé
        import('../utils/firestore-sync').then(({ syncDoc }) => {
          syncDoc(`event_access_codes/${code}`, { code, eventId: String(eventId), usedBy: codes[idx].usedBy, usedAt: Date.now() })
        }).catch(() => {})
        unlockAndGo(eventId)
        return
      }
    }

    // Code introuvable / déjà utilisé en local
    let alreadyUsed = false
    for (const codes of Object.values(eventCodes)) {
      if (codes.find(c => c.code === code && c.usedBy)) { alreadyUsed = true; break }
    }
    setCodeMsg({ type: 'error', text: alreadyUsed ? 'Ce code a déjà été utilisé.' : 'Ce code est invalide ou expiré.' })
  }

  // Visiteur non connecté → coquille vitrine (PublicNav) ; connecté → app Layout
  const Shell = user ? Layout : PublicShell

  return (
    <Shell>
      <div style={{ position: 'relative', zIndex: 1, background: 'transparent', padding: '12px 16px 32px' }}>

        {/* Share mode banner */}
        {shareConvId && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            background: '#12131c',
            border: '1px solid rgba(255,255,255,0.10)',
            borderLeft: '3px solid #c8a96e',
            borderRadius: 12,
            marginBottom: 20,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
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
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#c8a96e', margin: 0 }}>Mode partage</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'rgba(255,255,255,0.55)', margin: '3px 0 0' }}>Touche un événement pour l'envoyer dans la conversation.</p>
            </div>
            <button
              onClick={() => navigate('/messagerie')}
              aria-label="Fermer"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.55)', flexShrink: 0, padding: 4, lineHeight: 1, display: 'flex', alignItems: 'center' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Bouton « J'ai un code » — titre « Événements » retiré pour gagner de la place */}
        {!shareConvId && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button
              onClick={() => user ? setShowCodeModal(true) : openAuthModal('Connecte-toi pour débloquer une soirée privée avec ton code.')}
              className="lib-press"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                background: 'rgba(200,169,110,0.14)',
                border: '1px solid rgba(200,169,110,0.45)',
                borderRadius: 999,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#e2c68c',
                transition: 'all 0.2s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              J'ai un code
            </button>
          </div>
        )}

        {/* Search — barre identique à celle des messages */}
        <div style={{ marginBottom: 16 }}>
          <MessagingSearchBar
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Recherche un nom, une ville, un style…"
          />
        </div>

        {/* Recherche active ou mode partage → liste verticale de résultats.
            Sinon → rangées horizontales par genre (façon Netflix). */}
        {(search.trim() || shareConvId) ? (
          <div className={filtered.length ? 'lib-stagger' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filtered.length === 0 ? (
              <EmptyState
                icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(78,232,200,0.7)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
                title="Aucun événement trouvé"
                subtitle="Essaie un autre mot-clé ou une autre catégorie"
              />
            ) : (
              filtered.map((event) => (
                <EventCard key={event.id} event={event} shareMode={!!shareConvId} shared={sharedEventId === event.id}
                  onClick={() => shareConvId ? handleShareEvent(event) : navigate(`/evenements/${event.id}`)} />
              ))
            )}
          </div>
        ) : (() => {
          const live = visibleEvents.filter(isEventVisible)
          const rows = []
          const featured = live.filter(e => e.featured)
          if (featured.length) rows.push({ title: 'À la une', events: featured })
          const tonight = live.filter(e => /ce soir/i.test(getEventCountdown(e) || ''))
          if (tonight.length) rows.push({ title: 'Ce soir', events: tonight })
          for (const cat of KNOWN_CATEGORIES) {
            const list = live.filter(e => e.category === cat)
            if (list.length) rows.push({ title: cat, events: list })
          }
          const others = live.filter(e => !KNOWN_CATEGORIES.includes(e.category))
          if (others.length) rows.push({ title: 'Autres soirées', events: others })
          if (rows.length === 0) return (
            <EmptyState
              icon={<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(78,232,200,0.7)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
              title="Aucun événement pour l'instant"
              subtitle="Reviens bientôt — de nouvelles soirées arrivent"
            />
          )
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
              {rows.map(row => (
                <EventRow key={row.title} title={row.title} events={row.events}
                  onOpen={(id) => navigate(`/evenements/${id}`)} />
              ))}
            </div>
          )
        })()}
      </div>

      {/* Code modal */}
      {showCodeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }}
            onClick={() => { setShowCodeModal(false); setCodeInput(''); setCodeMsg(null) }}
          />
          <div style={{
            position: 'relative',
            background: '#12131c',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 20,
            padding: '32px 28px',
            width: '100%',
            maxWidth: 360,
            boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
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
              <h3 style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 20, color: 'white', margin: '0 0 8px' }}>
                Code d'accès privé
              </h3>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6 }}>
                Entre le code reçu de l'organisateur pour débloquer la soirée.
              </p>
            </div>

            {/* Code input */}
            <input
              style={{
                width: '100%',
                padding: '14px 16px',
                background: '#0b0c12',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                fontFamily: 'Inter, sans-serif',
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'white',
                textAlign: 'center',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: 12,
                transition: 'border-color 0.2s',
              }}
              placeholder="Ex. NEON2026"
              value={codeInput}
              onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeMsg(null) }}
              onKeyDown={e => e.key === 'Enter' && handleCodeSubmit()}
              onFocus={e => e.target.style.borderColor = '#8444ff'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
              maxLength={20}
            />

            {/* Feedback message */}
            {codeMsg && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 10,
                marginBottom: 12,
                fontFamily: 'Inter, sans-serif',
                fontSize: 12.5,
                fontWeight: 600,
                textAlign: 'center',
                background: codeMsg.type === 'success' ? 'rgba(78,232,200,0.12)' : 'rgba(224,90,170,0.12)',
                border: `1px solid ${codeMsg.type === 'success' ? 'rgba(78,232,200,0.4)' : 'rgba(224,90,170,0.4)'}`,
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
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.9)',
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
                  background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#fff',
                  boxShadow: '0 6px 20px rgba(122,59,242,0.35)',
                  transition: 'all 0.2s',
                }}
              >
                Valider
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}

// ── Rangée horizontale par genre (façon Netflix) ──
// Défilement 100 % manuel : swipe tactile + flèches ← →. Plus d'auto-défilement
// (il repartait en sens inverse quand on swipait vers la droite — comportement
// perçu comme un bug). Les flèches n'apparaissent que du côté où il reste du
// contenu à faire défiler.
function EventRow({ title, events, onOpen }) {
  const scrollRef = useRef(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const [overflow, setOverflow] = useState(false)

  const refresh = () => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setOverflow(max > 4)
    setAtStart(el.scrollLeft <= 2)
    setAtEnd(el.scrollLeft >= max - 2)
  }
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    refresh()
    // Re-mesure fiable quand la taille du rail change (chargement des cartes,
    // rotation de l'écran, redimensionnement) — sans dépendre d'un event global.
    el.addEventListener('scroll', refresh, { passive: true })
    let ro
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(refresh); ro.observe(el) }
    else window.addEventListener('resize', refresh)
    // Filet supplémentaire : re-mesure au frame suivant (layout stabilisé).
    const raf = requestAnimationFrame(refresh)
    return () => {
      el.removeEventListener('scroll', refresh)
      if (ro) ro.disconnect(); else window.removeEventListener('resize', refresh)
      cancelAnimationFrame(raf)
    }
  }, [events])

  const scrollByCards = (dir) => {
    const el = scrollRef.current
    if (!el) return
    // ~2 posters à la fois (148px + 12px de gap), borné à 80 % de la largeur visible.
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 320), behavior: 'smooth' })
  }

  const arrow = (side) => (
    <button onClick={() => scrollByCards(side === 'left' ? -1 : 1)} aria-label={side === 'left' ? 'Précédent' : 'Suivant'} className="lib-press"
      style={{
        position: 'absolute', top: '50%', [side]: -4, transform: 'translateY(-50%)', zIndex: 7,
        width: 40, height: 40, borderRadius: '50%', cursor: 'pointer',
        background: 'rgba(8,9,14,0.94)', border: '1px solid rgba(255,255,255,0.16)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px rgba(0,0,0,0.55)',
      }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {side === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  )

  return (
    <div>
      <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.4px', color: '#fff', margin: '0 0 12px' }}>
        {title}
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>{events.length}</span>
      </h3>
      <div style={{ position: 'relative' }}>
        {overflow && !atStart && arrow('left')}
        {overflow && !atEnd && arrow('right')}
        {/* overflowX:auto force le navigateur à rogner AUSSI hors de l'axe vertical
            ET aux bords gauche/droit du padding-box. La carte survolée grandit de
            ~14px en haut/bas et ~10px à gauche/droite (scale 1.14, origine centre) :
            - vertical : zone invisible de 340px (marges -70) → large marge
            - horizontal : paddingLeft/Right 16 + marges -16 → la 1re carte n'est
              plus tranchée à gauche (c'était la « ligne invisible » au survol) ;
              scrollPaddingLeft aligne les positions de snap sur ce padding. */}
        <div ref={scrollRef} className="hide-scrollbar"
          style={{ display: 'flex', alignItems: 'center', gap: 12, overflowX: 'auto', overflowY: 'hidden', height: 340, marginTop: -70, marginBottom: -70, marginLeft: -16, paddingLeft: 16, marginRight: -16, paddingRight: 16, scrollPaddingLeft: 16, WebkitOverflowScrolling: 'touch' }}>
          {events.map(ev => <EventPoster key={ev.id} event={ev} onClick={() => onOpen(ev.id)} />)}
        </div>
      </div>
    </div>
  )
}

// ── Affiche compacte (poster) — s'agrandit façon Netflix au survol prolongé ──
function EventPoster({ event, onClick }) {
  const countdown = getEventCountdown(event)
  const urgent = isCountdownUrgent(event)
  const prices = (event.places || []).map(p => Number(p.price) || 0)
  const minP = prices.length ? Math.min(...prices) : null
  const accent = event.accentColor || event.color || '#4ee8c8'

  // Survol > 500 ms → la carte grandit et révèle des infos supplémentaires
  const [expanded, setExpanded] = useState(false)
  const timerRef = useRef(null)
  const handleEnter = () => { clearTimeout(timerRef.current); timerRef.current = setTimeout(() => setExpanded(true), 500) }
  const handleLeave = () => { clearTimeout(timerRef.current); setExpanded(false) }
  useEffect(() => () => clearTimeout(timerRef.current), [])

  return (
    <button onClick={onClick} onMouseEnter={handleEnter} onMouseLeave={handleLeave} className="lib-press"
      style={{
        scrollSnapAlign: 'start', flexShrink: 0, width: 148, aspectRatio: '3 / 4', padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
        position: 'relative', zIndex: expanded ? 6 : 1,
        transform: expanded ? 'scale(1.14)' : 'scale(1)',
        transformOrigin: 'center',
        transition: 'transform 0.35s cubic-bezier(0.22,0.9,0.3,1)',
      }}>
      <div style={{
        position: 'relative', width: '100%', height: '100%', borderRadius: 14, overflow: 'hidden', background: '#0b0d14',
        border: expanded ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.08)',
        boxShadow: expanded ? '0 20px 44px -10px rgba(0,0,0,0.75)' : 'none',
        transition: 'border-color 0.35s ease, box-shadow 0.35s ease',
      }}>
        <EventHoverMedia
          event={event}
          height="100%"
          zoom={expanded}
          fallbackBackground={`radial-gradient(circle at 30% 25%, ${(event.color || '#2a2440')}aa, transparent 60%), linear-gradient(150deg, #1a1426, #0b0d14)`}
          overlay={expanded ? 'linear-gradient(to top, rgba(8,9,14,0.97) 18%, rgba(8,9,14,0.4) 55%, transparent 80%)' : 'linear-gradient(to top, rgba(8,9,14,0.95) 6%, transparent 55%)'}
        />
        {/* Countdown — bornée à gauche pour ne jamais chevaucher le prix */}
        {countdown && (
          <span style={{ position: 'absolute', top: 8, left: 8, maxWidth: '42%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: urgent ? '#fff' : '#4ee8c8', background: urgent ? 'rgba(224,90,170,0.92)' : 'rgba(5,6,10,0.78)', padding: '3px 7px', borderRadius: 999, border: `1px solid ${urgent ? 'rgba(224,90,170,0.6)' : 'rgba(78,232,200,0.4)'}` }}>{countdown}</span>
        )}
        {/* Nom + meta + prix (le prix vit EN BAS : les prix FCFA sont longs et
            chevaucheraient le compte à rebours s'ils étaient en haut à droite). */}
        <div style={{ position: 'absolute', left: 9, right: 9, bottom: 9 }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 13.5, letterSpacing: '-0.3px', color: accent, margin: 0, lineHeight: 1.15, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{event.name}</p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.5)', margin: '3px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[event.dateDisplay, event.city].filter(Boolean).join(' · ')}</p>
          {minP != null && (
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 800, color: '#c8a96e', margin: '4px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{minP > 0 ? `dès ${fmtMoney(minP, eventCurrency(event))}` : 'Gratuit'}</p>
          )}

          {/* Bloc révélé au survol prolongé */}
          <div style={{ maxHeight: expanded ? 90 : 0, opacity: expanded ? 1 : 0, overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.3s ease 0.05s' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
              {event.category && (
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)', padding: '2px 7px', borderRadius: 999 }}>{event.category}</span>
              )}
              {event.time && (
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)', padding: '2px 7px', borderRadius: 999 }}>{event.time}</span>
              )}
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 800, color: '#0b0d14', background: accent, padding: '5px 11px', borderRadius: 8 }}>
              Réserver
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0b0d14" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

function EventCard({ event, onClick, shareMode, shared }) {
  const [hovered, setHovered] = useState(false)
  const countdown = getEventCountdown(event)
  const urgent = isCountdownUrgent(event)
  const stock = getStockBadge(event)

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
          background: '#0e0f16',
          border: shareMode ? '1px solid rgba(200,169,110,0.35)' : '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          overflow: 'hidden',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          transform: hovered && !shared ? 'translateY(-4px)' : 'none',
          boxShadow: hovered && !shared ? '0 12px 40px rgba(0,0,0,0.45)' : '0 8px 24px rgba(0,0,0,0.35)',
          opacity: shared ? 0.6 : 1,
        }}
      >
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
            borderRadius: 16,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              background: 'rgba(12,12,22,0.96)',
              border: '1px solid rgba(200,169,110,0.5)',
              borderRadius: 12,
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#e2c68c',
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
            borderRadius: 16,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              background: 'rgba(12,12,22,0.96)',
              border: '1px solid rgba(78,232,200,0.5)',
              borderRadius: 12,
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#4ee8c8',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Envoyé
            </div>
          </div>
        )}

        {/* Badges urgence/FOMO — coin haut-droit */}
        {!shareMode && (countdown || stock) && (
          <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            {countdown && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, background: urgent ? 'rgba(224,90,170,0.92)' : 'rgba(8,10,20,0.88)', border: `1px solid ${urgent ? 'rgba(224,90,170,0.6)' : 'rgba(78,232,200,0.4)'}`, fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: urgent ? '#fff' : '#4ee8c8' }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: urgent ? '#fff' : '#4ee8c8' }} />
                {countdown}
              </span>
            )}
            {stock && (
              <span style={{ padding: '3px 8px', borderRadius: 99, background: 'rgba(8,10,20,0.88)', border: `1px solid ${stock.color}66`, fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: stock.color }}>
                {stock.label}
              </span>
            )}
          </div>
        )}

        {/* Color accent bar */}
        <div style={{ height: 2, width: '100%', background: event.color || 'rgba(255,255,255,0.08)' }} />

        {event.imageUrl ? (
          /* Image card (user-created events with photo) */
          <>
            <div style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden' }}>
              <EventHoverMedia
                event={event}
                height="100%"
                zoom={hovered}
                fallbackBackground={`radial-gradient(circle at 30% 25%, ${(event.color || '#2a2440')}aa, transparent 60%), linear-gradient(150deg, #1a1426, #0b0d14)`}
              />
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 19, letterSpacing: '-0.4px', color: event.accentColor, margin: '0 0 4px', lineHeight: 1.15 }}>
                  {event.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    {event.dateDisplay}
                  </span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    {event.city}
                  </span>
                </div>
              </div>
              {event.userCreated && (
                <span style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: '#c8a96e',
                  background: 'rgba(200,169,110,0.14)',
                  border: '1px solid rgba(200,169,110,0.35)',
                  padding: '4px 10px',
                  borderRadius: 8,
                  flexShrink: 0,
                  marginLeft: 12,
                }}>
                  Mon événement
                </span>
              )}
            </div>
          </>
        ) : (
          /* Gradient card (static events) */
          <>
            <EventHoverMedia
              event={event}
              height={120}
              zoom={hovered}
              fallbackBackground={`linear-gradient(135deg, ${event.color}22 0%, ${event.color}08 100%)`}
              overlay={false}
            >
              <div style={{
                position: 'absolute',
                inset: 0,
                opacity: 0.12,
                backgroundImage: `radial-gradient(circle at 20% 50%, ${event.color} 0%, transparent 50%), radial-gradient(circle at 80% 20%, ${event.accentColor} 0%, transparent 40%)`,
              }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{
                  fontFamily: "Inter, sans-serif",
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
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    padding: '3px 10px',
                    borderRadius: 999,
                    border: `1px solid ${event.color}55`,
                    background: 'rgba(5,6,10,0.72)',
                    color: event.accentColor,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </EventHoverMedia>

            {/* Card body */}
            <div style={{ padding: '14px 16px' }}>
              <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 21, letterSpacing: '-0.5px', color: event.accentColor, margin: '0 0 4px', lineHeight: 1.15 }}>
                {event.name}
              </h3>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'rgba(255,255,255,0.55)', margin: '0 0 12px' }}>
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
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{event.dateDisplay}</span>
                </div>
                {/* Time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{event.time}</span>
                </div>
                {/* City */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.55)', maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
