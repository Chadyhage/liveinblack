import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import Layout from '../components/Layout'
import { events } from '../data/events'
import PlaylistSystem from '../components/PlaylistSystem'
import { useAuth } from '../context/AuthContext'
import { generateTicketToken, checkScheduleConflict } from '../utils/ticket'
import { getConversations, sendMessage, getUserId, formatTime, getInitials, saveGroupBooking, getGroupBookings, validateGroupBooking, payGroupBookingShare } from '../utils/messaging'
import { startStripeCheckout } from '../utils/stripe'
import { canBook, getBookingBlockedReason } from '../utils/permissions'
import AgeVerificationModal from '../components/AgeVerificationModal'
import { IconLock } from '../components/icons'

// Cache séparé pour les events fetchés depuis Firestore par les visiteurs.
// Important : NE PAS confondre avec 'lib_created_events' qui est réservé aux
// events créés par le user lui-même (le mélanger pollue user_events et causait
// la disparition aléatoire des events sur d'autres comptes).
const EVENT_VIEW_CACHE_KEY = 'lib_event_view_cache'

function readEventViewCache() {
  try { return JSON.parse(localStorage.getItem(EVENT_VIEW_CACHE_KEY) || '[]') } catch { return [] }
}
function writeEventViewCache(arr) {
  try { localStorage.setItem(EVENT_VIEW_CACHE_KEY, JSON.stringify(arr)) } catch {}
}

function getAllLocalEvents() {
  try {
    const created = JSON.parse(localStorage.getItem('lib_created_events') || '[]')
    const viewed = readEventViewCache()
    return [...events, ...created, ...viewed]
  } catch { return events }
}

// Récupère un event par ID en explorant TOUTES les sources :
// 1. Events statiques (data/events.js)
// 2. localStorage 'lib_created_events' (créés sur ce device)
// 3. Cache local 'lib_event_view_cache' (events déjà consultés)
// 4. Firestore collection 'events/{id}' (créés sur un AUTRE device)
async function fetchEventById(id) {
  // 1+2+3 : recherche locale
  const local = getAllLocalEvents().find((e) => String(e.id) === String(id))
  if (local) return local

  // 4 : Firestore fallback (cas visiteur sur un event créé par un organisateur)
  try {
    const { db, USE_REAL_FIREBASE } = await import('../firebase')
    if (!USE_REAL_FIREBASE) return null
    const { doc, getDoc } = await import('firebase/firestore')
    const snap = await getDoc(doc(db, 'events', String(id)))
    if (snap.exists()) {
      const ev = { ...snap.data(), id: snap.data().id || snap.id }
      // Cache UNIQUEMENT dans 'lib_event_view_cache' — pas dans 'lib_created_events'
      // sinon syncOnLogin pourrait croire que cet event nous appartient
      try {
        const cache = readEventViewCache()
        const without = cache.filter(e => String(e.id) !== String(ev.id))
        without.push({ ...ev, _cachedAt: Date.now() })
        // Limite à 50 events pour éviter une croissance infinie
        const trimmed = without.slice(-50)
        writeEventViewCache(trimmed)
      } catch {}
      return ev
    }
  } catch {}
  return null
}

const PREORDER_ITEMS = [
  { name: 'Bouteille Champagne', price: 90 },
  { name: 'Pack Cocktails x5', price: 55 },
  { name: 'Chicha Premium', price: 40 },
  { name: 'Pack Bières x6', price: 25 },
  { name: 'Shot Pack x10', price: 35 },
  { name: 'Pack Soft x4', price: 15 },
]

// ─── SVG Icons ───────────────────────────────────────────────────────────────

function CalendarIcon({ size = 14, color = 'rgba(255,255,255,0.5)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function ClockIcon({ size = 14, color = 'rgba(255,255,255,0.5)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}
function PinIcon({ size = 14, color = 'rgba(255,255,255,0.5)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  )
}
function GroupIcon({ size = 14, color = '#4ee8c8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
    </svg>
  )
}
function MusicNoteIcon({ size = 12, color = '#e05aaa' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
    </svg>
  )
}
function LockIcon({ size = 14, color = 'rgba(255,255,255,0.3)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
    </svg>
  )
}
function CheckIcon({ size = 16, color = '#4ee8c8' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function ShareIcon({ size = 16, color = 'white' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  )
}
function BackIcon({ size = 16, color = 'white' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}
function WarnIcon({ size = 20, color = 'rgba(220,100,100,0.9)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
    </svg>
  )
}
function SparkleIcon({ size = 12, color = '#c8a96e' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 1l2.12 8.38L22 12l-7.88 2.62L12 23l-2.12-8.38L2 12l7.88-2.62z"/>
    </svg>
  )
}

// ─── Style tokens ────────────────────────────────────────────────────────────

const S = {
  card: {
    background: 'rgba(8,10,20,0.55)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
    padding: '16px',
  },
  btnPrimary: {
    padding: '13px 28px',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06), rgba(78,232,200,0.12))',
    border: '1px solid rgba(255,255,255,0.28)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'white',
    cursor: 'pointer',
    width: '100%',
  },
  btnGold: {
    padding: '13px 28px',
    background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
    border: '1px solid rgba(200,169,110,0.45)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: '#c8a96e',
    cursor: 'pointer',
    width: '100%',
  },
  btnGhost: {
    padding: '10px 20px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
  },
  btnDanger: {
    padding: '10px 20px',
    background: 'rgba(220,50,50,0.10)',
    border: '1px solid rgba(220,50,50,0.35)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'rgba(220,100,100,0.9)',
    cursor: 'pointer',
  },
  input: {
    background: 'rgba(6,8,16,0.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 13,
    color: 'white',
    padding: '10px 12px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  },
  label: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.42)',
  },
  price: {
    fontFamily: 'Inter, sans-serif',
    fontWeight: 800,
    letterSpacing: '-0.5px',
    color: '#c8a96e',
  },
  muted: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    color: 'rgba(255,255,255,0.42)',
  },
  // Libellé de ligne (récap réservation) — Inter, fini le mono « pixélisé »
  rowLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 12.5,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.5)',
  },
  rowValue: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 13.5,
    fontWeight: 600,
    color: 'white',
  },
  // Onglet Info — typo Inter propre (fini le mono « pixélisé »)
  infoLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#c8a96e',
  },
  infoBody: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 1.7,
    margin: 0,
  },
  // CTA paiement — plein, doré, aguicheur (cohérent interface de paiement)
  btnCheckout: {
    width: '100%',
    padding: '15px 22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    background: 'linear-gradient(135deg, #e9cd90 0%, #c8a96e 52%, #b8975a 100%)',
    border: 'none',
    borderRadius: 11,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 800,
    fontSize: 15.5,
    letterSpacing: '0.005em',
    color: '#1a1206',
    cursor: 'pointer',
    boxShadow: '0 10px 26px -8px rgba(200,169,110,0.6), inset 0 1px 0 rgba(255,255,255,0.4)',
  },
  // CTA « Proposer au groupe » — pendant teal du btnCheckout (même prestance,
  // identité groupe conservée). Évite le DM Mono pâle qui passait inaperçu.
  btnGroupCTA: {
    width: '100%',
    padding: '15px 22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    background: 'linear-gradient(135deg, #6ff5d8 0%, #4ee8c8 52%, #38c4a8 100%)',
    border: 'none',
    borderRadius: 11,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 800,
    fontSize: 15.5,
    letterSpacing: '0.005em',
    color: '#04140f',
    cursor: 'pointer',
    boxShadow: '0 10px 26px -8px rgba(78,232,200,0.55), inset 0 1px 0 rgba(255,255,255,0.4)',
  },
}

// ── Carte du lieu — géocode l'adresse (Nominatim, gratuit) puis affiche une
// carte OpenStreetMap librement intégrable (pas de clé API, pas de blocage X-Frame
// comme l'embed Google Maps). Fallback : on garde le lien « Ouvrir dans Google Maps ».
function LocationMap({ query, fallback }) {
  const [coords, setCoords] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ok | error

  useEffect(() => {
    // On tente l'adresse complète, puis on retombe sur la ville/région si le nom
    // de salle n'est pas géocodable (fréquent pour des lieux privés).
    const queries = [query, fallback].filter((q, i, arr) => q && arr.indexOf(q) === i)
    if (!queries.length) { setStatus('error'); return }
    let cancelled = false
    setStatus('loading')
    async function geocode(q) {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } })
      if (!r.ok) return null
      const list = await r.json()
      return list && list[0] ? { lat: parseFloat(list[0].lat), lon: parseFloat(list[0].lon) } : null
    }
    ;(async () => {
      for (const q of queries) {
        try {
          const c = await geocode(q)
          if (cancelled) return
          if (c) { setCoords(c); setStatus('ok'); return }
        } catch { /* try next */ }
      }
      if (!cancelled) setStatus('error')
    })()
    return () => { cancelled = true }
  }, [query, fallback])

  if (status === 'error') return null

  const wrap = { marginTop: 12, height: 190, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', position: 'relative' }

  if (status === 'loading' || !coords) {
    return (
      <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Chargement de la carte…</span>
      </div>
    )
  }

  const d = 0.008
  const bbox = `${coords.lon - d},${coords.lat - d},${coords.lon + d},${coords.lat + d}`
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${coords.lat},${coords.lon}`
  return (
    <div style={wrap}>
      <iframe
        title="Carte du lieu"
        width="100%"
        height="190"
        style={{ border: 0, display: 'block', filter: 'grayscale(0.15) brightness(0.92) contrast(1.05)' }}
        loading="lazy"
        src={src}
      />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, setUser, openAuthModal } = useAuth()
  // Event en state — initialement cherché localement, puis fetché Firestore si absent
  const [event, setEvent] = useState(() => getAllLocalEvents().find((e) => String(e.id) === String(id)) || null)
  const [eventLoading, setEventLoading] = useState(() => !getAllLocalEvents().find((e) => String(e.id) === String(id)))

  useEffect(() => {
    if (event) return // déjà trouvé en local
    let cancelled = false
    fetchEventById(id).then(ev => {
      if (cancelled) return
      setEvent(ev)
      setEventLoading(false)
    })
    return () => { cancelled = true }
  }, [id, event])

  const hasPlaylist = !!event?.playlist
  const TABS = ['Réservation', ...(hasPlaylist ? ['Playlist'] : []), 'Info']

  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab')
    return t && TABS.includes(t) ? t : 'Réservation'
  })
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [ticketQty, setTicketQty] = useState(1)
  const [bookingStep, setBookingStep] = useState('place') // 'place' | 'preorder' | 'confirmed'
  const [activePreorderTicket, setActivePreorderTicket] = useState(0)
  const [perTicketOrders, setPerTicketOrders] = useState([]) // [{ items: {itemName:qty}, shows: {} }]
  const [showInfoModal, setShowInfoModal] = useState(null) // { itemName, opt } — popup for requiresInfo
  const [showInfoInput, setShowInfoInput] = useState('')
  const [descModal, setDescModal] = useState(null) // item description to display
  const [photoGallery, setPhotoGallery] = useState(null) // { type, photos[], index } — aperçu photos d'une place
  const [bookedTickets, setBookedTickets] = useState([]) // tickets for the LAST confirmed booking
  const [allBookedThisSession, setAllBookedThisSession] = useState([]) // { place, tickets, preorderSummary, totalPrice }
  const [showShareModal, setShowShareModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  // Garde de réentrance pour la réservation gratuite (anti double-clic / multi-onglet,
  // sinon double création de billets + double points). Le chemin payant est déjà
  // protégé par stripeRedirecting.
  const freeBookingLockRef = useRef(false)
  const [stripeRedirecting, setStripeRedirecting] = useState(false)
  const [stripeError, setStripeError] = useState('')
  const [showGroupSendModal, setShowGroupSendModal] = useState(false)
  const [groupSendConvId, setGroupSendConvId] = useState(null)
  const [insufficientFunds] = useState(false) // legacy — vérification gérée côté Stripe
  const [conflictBooking, setConflictBooking] = useState(null)
  const [showConflictModal, setShowConflictModal] = useState(false)
  const [conflictProceedFn, setConflictProceedFn] = useState(null)
  const [eventStartedError, setEventStartedError] = useState(false)
  const [showPointsToast, setShowPointsToast] = useState(false)
  const [showAgeModal, setShowAgeModal] = useState(false)
  const [ageVerified, setAgeVerified] = useState(false)
  const [playlistTabBlink, setPlaylistTabBlink] = useState(false)

  // Loading state — pendant qu'on cherche l'event sur Firestore (cas client cross-device)
  if (eventLoading) {
    return (
      <Layout>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.10)',
            borderTopColor: '#4ee8c8',
            animation: 'spin 0.9s linear infinite',
          }} />
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Chargement de l'événement…
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </Layout>
    )
  }

  if (!event) {
    return (
      <Layout>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
          <LockIcon size={36} color="rgba(255,255,255,0.15)" />
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.42)', letterSpacing: '0.1em' }}>
            Événement introuvable
          </p>
          <button onClick={() => navigate('/evenements')} style={{ ...S.btnGhost, marginTop: 8 }}>
            Retour
          </button>
        </div>
      </Layout>
    )
  }

  const selectedPlaceObj = event.places.find((p) => p.type === selectedPlace)
  const isGroupPlace = selectedPlaceObj?.groupType === 'group'

  // Only use organiser-defined items — never fall back to hardcoded defaults
  const baseMenu = (event.menu && event.menu.length > 0) ? event.menu : []
  const activeMenu = baseMenu.filter(item => !item.excludedPlaces?.includes(selectedPlace))

  const maxPerAccount = selectedPlaceObj?.maxPerAccount || 0
  // Borne la quantité sélectionnable : stock dispo ET plafond par compte (si défini)
  const maxQtyForSelectedPlace = Math.max(1, Math.min(
    selectedPlaceObj?.available ?? 1,
    maxPerAccount > 0 ? maxPerAccount : Infinity,
  ))

  const placePrice = selectedPlaceObj?.price || 0
  const curTicketOrder = perTicketOrders[activePreorderTicket] || { items: {}, shows: {} }
  const preorderTotal = perTicketOrders.reduce((total, t) =>
    total + activeMenu.reduce((sum, item) => sum + (t.items[item.name] || 0) * item.price, 0), 0)
  // Place price × qty + preorder total (preorderTotal already sums all tickets)
  const grandTotal = placePrice * ticketQty + preorderTotal
  const isAuctionPlace = selectedPlaceObj?.auctionType === 'auction'
  const currentAuctionPrice = 0
  const userCanBook = canBook(user)
  const bookingBlockedReason = getBookingBlockedReason(user)

  // ── Event status ──
  const now = Date.now()
  const isEventCancelled = !!event.cancelled
  const isEventSoldOut = event.places?.length > 0 && event.places.every(p => p.available === 0)
  // Calcule la timestamp de fin réelle de l'événement (start + duration jusqu'à endTime)
  const eventEndTimestamp = (() => {
    if (!event.date) return 0
    try {
      const endTime = event.endTime || event.time || '23:59'
      const [h, m] = endTime.split(':').map(Number)
      const d = new Date(event.date + 'T00:00:00')
      d.setHours(h, m, 0, 0)
      const startTime = event.time || '00:00'
      const [sh, sm] = startTime.split(':').map(Number)
      if (h < sh || (h === sh && m < sm)) d.setDate(d.getDate() + 1)
      return d.getTime()
    } catch { return 0 }
  })()

  const isEventClosed = (() => {
    // Cas 1 : closingDate explicite — on vérifie qu'il est cohérent
    // (un closingDate avant le début de l'event qui n'a même pas eu lieu = config foireuse, on ignore)
    if (event.closingDate) {
      const closeTs = new Date(event.closingDate).getTime()
      // Si l'event est encore dans le futur ET que closingDate est dans le passé,
      // c'est une mauvaise config (l'organisateur a probablement saisi par erreur).
      // On considère que l'event est fermé seulement si l'event lui-même est passé.
      if (eventEndTimestamp > now) return false  // event futur → on ignore closingDate pourri
      return closeTs < now
    }
    // Cas 2 : pas de closingDate → fermer à la fin de l'event
    return eventEndTimestamp > 0 && eventEndTimestamp < now
  })()
  const bookingDisabled = isEventCancelled || isEventSoldOut || isEventClosed

  // ── Urgence & FOMO ──────────────────────────────────────────────────────────
  // Timestamp de DÉBUT de l'event (pour le compte à rebours « avant la soirée »)
  const eventStartTimestamp = (() => {
    if (!event.date) return 0
    try {
      const [sh, sm] = (event.time || '23:00').split(':').map(Number)
      const d = new Date(event.date + 'T00:00:00'); d.setHours(sh, sm, 0, 0)
      return d.getTime()
    } catch { return 0 }
  })()
  // Libellé du compte à rebours : « CE SOIR », « DEMAIN », « J-3 », « DANS 4H »…
  const countdownLabel = (() => {
    if (!eventStartTimestamp || isEventCancelled || isEventClosed) return null
    const ms = eventStartTimestamp - now
    if (ms <= 0) return eventEndTimestamp > now ? 'EN COURS' : null
    const h = Math.floor(ms / 3600000)
    if (h < 1) return `DANS ${Math.max(1, Math.floor(ms / 60000))} MIN`
    if (h < 8) return `DANS ${h}H`
    const startDay = new Date(eventStartTimestamp); startDay.setHours(0, 0, 0, 0)
    const today = new Date(now); today.setHours(0, 0, 0, 0)
    const days = Math.round((startDay.getTime() - today.getTime()) / 86400000)
    if (days <= 0) return 'CE SOIR'
    if (days === 1) return 'DEMAIN'
    return `J-${days}`
  })()
  const countdownUrgent = eventStartTimestamp > 0 && (eventStartTimestamp - now) < 48 * 3600000 && (eventStartTimestamp - now) > 0
  // Remplissage des places (jauge globale + urgence stock)
  const totalCapacity = (event.places || []).reduce((s, p) => s + (Number(p.total) || 0), 0)
  const totalAvailable = (event.places || []).reduce((s, p) => s + (Number(p.available) || 0), 0)
  const soldCount = Math.max(0, totalCapacity - totalAvailable)
  const fillPct = totalCapacity > 0 ? Math.round(soldCount / totalCapacity * 100) : 0
  // Badge stock : « COMPLET » / « DERNIÈRES PLACES » / « BIENTÔT COMPLET »
  const stockBadge = (() => {
    if (isEventCancelled || isEventClosed || totalCapacity === 0) return null
    if (totalAvailable === 0) return { label: 'COMPLET', color: '#e05aaa' }
    if (totalAvailable <= 5) return { label: `PLUS QUE ${totalAvailable} PLACE${totalAvailable > 1 ? 'S' : ''}`, color: '#e05aaa' }
    if (fillPct >= 80) return { label: 'BIENTÔT COMPLET', color: '#c8a96e' }
    return null
  })()

  function updatePreorder(name, delta) {
    setPerTicketOrders(prev => prev.map((t, i) =>
      i === activePreorderTicket
        ? { ...t, items: { ...t.items, [name]: Math.max(0, (t.items[name] || 0) + delta) } }
        : t
    ))
  }

  async function confirmBooking() {
    const uid = getUserId(user)
    // Age check
    if ((event.minAge || 0) >= 18 && !ageVerified) {
      setShowAgeModal(true)
      setShowConfirmModal(false)
      return
    }
    // Event already started?
    const eventStartTs = (() => {
      try {
        const [h, m] = (event.time || '00:00').split(':').map(Number)
        const d = new Date(event.date + 'T00:00:00')
        d.setHours(h, m, 0, 0)
        return d.getTime()
      } catch { return 0 }
    })()
    if (eventStartTs && Date.now() >= eventStartTs) {
      setEventStartedError(true)
      setShowConfirmModal(false)
      return
    }
    setEventStartedError(false)

    // ─── ÉVÉNEMENT PAYANT — Stripe Checkout ───────────────────────────────
    if (grandTotal > 0) {
      // Construire un id de réservation persistant (rapproche pending ↔ session Stripe)
      const arr = new Uint32Array(2)
      crypto.getRandomValues(arr)
      const bookingId = `${arr[0].toString(36)}${arr[1].toString(36)}`.slice(0, 16).toUpperCase()

      // Construire le récap des consos précommandées (en EUR) pour Stripe line_items
      // On passe par le total agrégé : Stripe ne sait pas découper "ticket A + ticket B avec menus différents"
      const aggregatedPreorder = {}
      perTicketOrders.forEach(t => {
        Object.entries(t.items || {}).forEach(([name, q]) => {
          if (!q) return
          aggregatedPreorder[name] = (aggregatedPreorder[name] || 0) + q
        })
      })
      const preorderItems = Object.entries(aggregatedPreorder).map(([name, q]) => {
        const item = activeMenu.find(m => m.name === name)
        return { name, qty: q, priceEUR: item?.price || 0 }
      }).filter(i => i.priceEUR > 0)

      // Sauvegarder la réservation en attente — sera finalisée par /paiement-reussi
      const pending = {
        bookingId,
        eventId: event.id,
        eventName: event.name,
        eventImage: event.imageUrl,
        eventDate: event.dateDisplay,
        eventDateISO: event.date,
        eventStartTime: event.time,
        eventEndTime: event.endTime,
        placeType: selectedPlace,
        qty: ticketQty,
        unitPriceEUR: placePrice,
        preorderItems,
        perTicketOrders, // détail par billet — utilisé pour réhydrater à /paiement-reussi
        activeMenu,
        userId: uid,
        userName: user?.name || null,
        userEmail: user?.email || null,
        createdAt: new Date().toISOString(),
      }
      try {
        localStorage.setItem(`lib_pending_booking_${bookingId}`, JSON.stringify(pending))
      } catch {}

      setStripeRedirecting(true)
      const result = await startStripeCheckout({
        eventId: event.id,
        eventName: event.name,
        eventImage: event.imageUrl,
        placeType: selectedPlace,
        qty: ticketQty,
        unitPriceEUR: placePrice,
        preorderItems,
        userId: uid,
        userEmail: user?.email,
        bookingId,
      })

      if (!result.ok) {
        setStripeRedirecting(false)
        setStripeError(result.error || 'Erreur Stripe — réessaye dans un instant.')
        // Cleanup pending si erreur
        try { localStorage.removeItem(`lib_pending_booking_${bookingId}`) } catch {}
      }
      // Si ok : window.location.href a déjà été déclenché → on attend la redirection
      return
    }

    // ─── ÉVÉNEMENT GRATUIT — création directe (pas de paiement) ──────────
    // Garde anti double-exécution : un 2e clic rapide créerait des billets
    // et des points en double.
    if (freeBookingLockRef.current) return
    freeBookingLockRef.current = true

    // Décrément atomique du stock AVANT de créer les billets — empêche la survente
    // si un autre acheteur réserve la dernière place au même moment. Passe par un
    // endpoint serveur (Admin SDK) car les règles Firestore n'autorisent que
    // l'organisateur à écrire dans events/{id} — pas un acheteur quelconque.
    let stockReserved = false
    try {
      const stockRes = await fetch('/api/event-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, placeType: selectedPlace, qty: ticketQty, action: 'reserve' }),
      })
      const stockData = await stockRes.json().catch(() => ({}))
      if (!stockRes.ok) {
        freeBookingLockRef.current = false
        setStripeError(stockData.error || 'Il ne reste plus assez de places disponibles.')
        return
      }
      stockReserved = !stockData.skipped // pas de suivi de stock pour les events de démo statiques
    } catch {
      // Réseau indisponible — on ne bloque pas la réservation gratuite pour ça,
      // mais on ne peut pas garantir l'absence de survente dans ce cas précis.
    }
    if (stockReserved) {
      const newPlaces = event.places.map(p => p.type === selectedPlace ? { ...p, available: Math.max(0, (Number(p.available) || 0) - ticketQty) } : p)
      setEvent(ev => ({ ...ev, places: newPlaces }))
      try {
        const created = JSON.parse(localStorage.getItem('lib_created_events') || '[]')
        const idx = created.findIndex(e => String(e.id) === String(event.id))
        if (idx >= 0) {
          created[idx] = { ...created[idx], places: newPlaces }
          localStorage.setItem('lib_created_events', JSON.stringify(created))
        } else {
          const viewed = readEventViewCache()
          const vIdx = viewed.findIndex(e => String(e.id) === String(event.id))
          if (vIdx >= 0) {
            viewed[vIdx] = { ...viewed[vIdx], places: newPlaces }
            writeEventViewCache(viewed)
          }
        }
      } catch {}
    }

    const newTickets = []
    try {
      const prev = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      const newBookings = []

      for (let n = 0; n < ticketQty; n++) {
        const arr = new Uint32Array(1)
        crypto.getRandomValues(arr)
        const code = arr[0].toString(36).slice(0, 6).toUpperCase().padEnd(6, '0')
        const fullCode = `LIB-${event.id.toString().padStart(3, '0')}-${code}`
        const tOrder = perTicketOrders[n] || { items: {}, shows: {} }
        const tSummary = activeMenu.filter(i => (tOrder.items[i.name] || 0) > 0)
        const tPreorderTotal = activeMenu.reduce((sum, i) => sum + (tOrder.items[i.name] || 0) * i.price, 0)
        const booking = {
          id: code,
          ticketCode: fullCode,
          eventId: event.id,
          eventName: event.name,
          eventDate: event.dateDisplay,
          eventDateISO: event.date,
          eventStartTime: event.time,
          eventEndTime: event.endTime,
          place: selectedPlace,
          placePrice,
          preorderItems: { ...tOrder.items },
          preorderSummary: tSummary.map(i => ({ ...i })),
          preorderShowSelections: { ...tOrder.shows },
          totalPrice: placePrice + tPreorderTotal,
          bookedAt: new Date().toISOString(),
          userId: uid,
          userName: user?.name || null,
          userEmail: user?.email || null,
          paid: false,
          paymentMethod: 'free',
        }
        const token = generateTicketToken(booking)
        booking.token = token
        newTickets.push({ ticketCode: fullCode, ticketToken: token, id: code })
        newBookings.push(booking)
      }

      const allBookings = [...prev, ...newBookings]
      localStorage.setItem('lib_bookings', JSON.stringify(allBookings))
      import('../utils/firestore-sync').then(({ syncDoc }) => {
        const myBookings = allBookings.filter(b => b.userId === uid)
        if (myBookings.length) syncDoc(`user_bookings/${uid}`, { items: myBookings })
        // Registre anti-fraude tickets/{code} — le scanner vérifie l'existence
        // réelle du billet ici (les règles n'autorisent que paid:false côté client)
        for (const b of newBookings) {
          syncDoc(`tickets/${b.ticketCode}`, {
            ticketCode: b.ticketCode,
            eventId: b.eventId,
            eventName: b.eventName,
            place: b.place,
            userId: uid,
            paid: false,
            source: 'free',
            bookedAt: b.bookedAt,
          })
        }
      }).catch(() => {})

      setBookedTickets(newTickets)
      if (user && uid) {
        const newPoints = (user.points || 0) + ticketQty
        setUser({ ...user, points: newPoints })
        // Incrément ATOMIQUE côté serveur (et non écriture d'une valeur fixe) :
        // évite la perte de points en cas de double-clic / multi-onglet.
        import('../utils/firestore-sync').then(({ syncIncrement }) => {
          syncIncrement(`users/${uid}`, 'points', ticketQty)
        }).catch(() => {})
        import('../utils/accounts').then(({ updateAccount }) => {
          updateAccount(uid, { points: newPoints })
        }).catch(() => {})
        setShowPointsToast(true)
        setTimeout(() => setShowPointsToast(false), 2500)
      }
      // Notifier l'organisateur de la réservation gratuite (engagement).
      // Passe par un endpoint serveur car les règles Firestore interdisent à un
      // client d'écrire dans notifications/{organizerUid} (anti-spam). Les ventes
      // payées sont notifiées par le webhook Stripe. Fire-and-forget.
      const organizerUid = event.organizerId || event.createdBy
      if (organizerUid && organizerUid !== uid) {
        fetch('/api/notify-sale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: event.id, qty: ticketQty, place: selectedPlace, buyerId: uid }),
        }).catch(() => {})
      }
      setAllBookedThisSession(prev => [...prev, {
        place: selectedPlace,
        tickets: newTickets,
        totalPrice: grandTotal,
      }])
      setBookingStep('confirmed')
      setShowConfirmModal(false)
    } catch {
      // La création des billets a échoué APRÈS le décrément de stock — on restocke
      // pour ne pas perdre des places disponibles pour rien.
      if (stockReserved) {
        fetch('/api/event-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: event.id, placeType: selectedPlace, qty: ticketQty, action: 'release' }),
        }).catch(() => {})
      }
      setShowConfirmModal(false)
      return
    } finally {
      freeBookingLockRef.current = false
    }
    if (hasPlaylist) {
      setPlaylistTabBlink(true)
      setTimeout(() => setPlaylistTabBlink(false), 5000)
    }
  }

  // Vérifie le conflit AVANT de procéder — si conflit, ouvre le modal dédié
  function tryProceed(action) {
    const uid = getUserId(user)
    const conflict = checkScheduleConflict(uid, event.date, event.time, event.endTime, event.id)
    if (conflict) {
      setConflictBooking(conflict)
      setConflictProceedFn(() => action) // stocker l'action à exécuter si l'utilisateur confirme
      setShowConflictModal(true)
    } else {
      setConflictBooking(null)
      action()
    }
  }

  // Redirige vers l'auth si non connecté, sinon exécute l'action
  function requireUserThenDo(action) {
    if (!user) {
      openAuthModal('Crée ton compte pour réserver ta place 🎟️', action)
      return
    }
    action()
  }

  function resetBooking() {
    setBookingStep('place')
    setSelectedPlace(null)
    setPerTicketOrders([])
    setActivePreorderTicket(0)
    setTicketQty(1)
  }

  function selectShowOption(itemName, opt) {
    if (opt.requiresInfo) {
      setShowInfoModal({ itemName, opt })
      setShowInfoInput('')
    } else {
      setPerTicketOrders(prev => prev.map((t, i) =>
        i === activePreorderTicket
          ? { ...t, shows: { ...t.shows, [itemName]: { showOptionId: opt.id, showLabel: opt.label, showInfo: '' } } }
          : t
      ))
    }
  }

  function confirmShowInfo() {
    if (!showInfoModal) return
    setPerTicketOrders(prev => prev.map((t, i) =>
      i === activePreorderTicket
        ? { ...t, shows: { ...t.shows, [showInfoModal.itemName]: { showOptionId: showInfoModal.opt.id, showLabel: showInfoModal.opt.label, showInfo: showInfoInput } } }
        : t
    ))
    setShowInfoModal(null)
    setShowInfoInput('')
  }

  return (
    <Layout>
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Hero Banner ─────────────────────────────────────────────────── */}
        <div
          style={{
            position: 'relative',
            height: 208,
            overflow: 'hidden',
            ...(event.imageUrl ? {} : { background: `linear-gradient(135deg, ${event.color}44 0%, #000 100%)` }),
          }}
        >
          {event.imageUrl ? (
            <img src={event.imageUrl} alt={event.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.08 }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 300, fontSize: 80, color: event.color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {event.name}
              </span>
            </div>
          )}
          {/* Gradient overlay */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,5,12,1) 0%, transparent 60%)' }} />

          {/* Back button */}
          <button
            onClick={() => navigate('/evenements')}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <BackIcon size={16} color="white" />
          </button>

          {/* Share button */}
          <button
            onClick={() => setShowShareModal(true)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)',
              border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <ShareIcon size={14} color="white" />
          </button>

          {/* Title area */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 20px 20px' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {event.tags?.map((t) => (
                <span
                  key={t}
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 9,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    padding: '3px 8px',
                    borderRadius: 3,
                    color: event.accentColor,
                    borderColor: event.color + '55',
                    border: `1px solid ${event.color}55`,
                    background: event.color + '11',
                  }}
                >
                  {t}
                </span>
              ))}
              {(event.minAge || 0) >= 16 && (
                <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 9,
                  letterSpacing: '0.2em',
                  padding: '3px 8px',
                  border: '1px solid rgba(200,169,110,0.5)',
                  borderRadius: 3,
                  color: '#c8a96e',
                  background: 'rgba(200,169,110,0.08)',
                }}>
                  {event.minAge}+
                </span>
              )}
            </div>
            <h1 style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: 800,
              fontSize: 'clamp(30px, 8vw, 44px)',
              letterSpacing: '-1px',
              textTransform: 'uppercase',
              color: event.accentColor || 'white',
              lineHeight: 0.98,
              margin: 0,
            }}>
              {event.name}
            </h1>
            {event.subtitle && (
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 4, letterSpacing: '0.1em' }}>
                {event.subtitle}
              </p>
            )}
            {/* ── Badges de statut ── */}
            {isEventCancelled && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.4)', borderRadius: 4, padding: '4px 10px', marginTop: 8 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: 'rgba(220,100,100,0.95)', textTransform: 'uppercase' }}>● ÉVÉNEMENT ANNULÉ</span>
              </div>
            )}
            {!isEventCancelled && isEventSoldOut && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.35)', borderRadius: 4, padding: '4px 10px', marginTop: 8 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: 'rgba(220,120,120,0.95)', textTransform: 'uppercase' }}>● COMPLET</span>
              </div>
            )}
            {!isEventCancelled && !isEventSoldOut && isEventClosed && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '4px 10px', marginTop: 8 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>● RÉSERVATIONS CLOSES</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Quick info strip ── puces propres (Inter, fonds subtils) ──────── */}
        <div className="hide-scrollbar" style={{
          display: 'flex', alignItems: 'center',
          padding: '12px 16px', gap: 8,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          overflowX: 'auto',
        }}>
          {countdownLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '6px 11px', borderRadius: 999, background: countdownUrgent ? 'rgba(224,90,170,0.14)' : 'rgba(78,232,200,0.12)', border: `1px solid ${countdownUrgent ? 'rgba(224,90,170,0.4)' : 'rgba(78,232,200,0.35)'}` }}>
              <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: countdownUrgent ? '#e05aaa' : '#4ee8c8', boxShadow: `0 0 8px ${countdownUrgent ? '#e05aaa' : '#4ee8c8'}` }} />
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: countdownUrgent ? '#e05aaa' : '#4ee8c8', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{countdownLabel}</span>
            </div>
          )}
          {stockBadge && (
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, padding: '6px 11px', borderRadius: 999, background: `${stockBadge.color}22`, border: `1px solid ${stockBadge.color}55` }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: stockBadge.color, whiteSpace: 'nowrap' }}>{stockBadge.label}</span>
            </div>
          )}
          {[
            { Icon: CalendarIcon, val: event.dateDisplay },
            { Icon: ClockIcon, val: `${event.time} → ${event.endTime}` },
            { Icon: PinIcon, val: event.location },
          ].filter(it => it.val).map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '6px 11px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <item.Icon size={13} color="rgba(200,169,110,0.85)" />
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
                {item.val}
              </span>
            </div>
          ))}
        </div>

        {/* ── Tabs (segmented control — clairement cliquable) ───────────────── */}
        <div className="hide-scrollbar" style={{
          display: 'flex',
          gap: 6,
          padding: 4,
          margin: '4px 16px 0',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          overflowX: 'auto',
        }}>
          {/* Keyframe pour le clignotement de l'onglet Playlist */}
          <style>{`
            @keyframes playlistTabBlink {
              0%, 100% { color: rgba(255,255,255,0.3); border-bottom-color: transparent; text-shadow: none; }
              50% { color: #e05aaa; border-bottom-color: #e05aaa; text-shadow: 0 0 8px rgba(224,90,170,0.6); }
            }
          `}</style>

          {TABS.map((tab) => {
            const isPlaylistBlink = tab === 'Playlist' && playlistTabBlink && activeTab !== 'Playlist'
            return (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); if (tab === 'Playlist') setPlaylistTabBlink(false) }}
              style={{
                flex: 1,
                minWidth: 'max-content',
                whiteSpace: 'nowrap',
                padding: '9px 16px',
                fontFamily: 'Inter, sans-serif',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.02em',
                background: activeTab === tab ? 'linear-gradient(135deg, rgba(78,232,200,0.18), rgba(78,232,200,0.06))' : 'transparent',
                border: activeTab === tab ? '1px solid rgba(78,232,200,0.4)' : '1px solid transparent',
                borderRadius: 9,
                color: activeTab === tab ? '#4ee8c8' : 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                animation: isPlaylistBlink ? 'playlistTabBlink 0.7s ease-in-out infinite' : 'none',
              }}
            >
              {tab}
            </button>
          )})}
        </div>

        {/* ── Tab Content ───────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ──────────────── RÉSERVATION ──────────────────────────────────── */}
          {activeTab === 'Réservation' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Step 1: choose place */}
              {bookingStep === 'place' && (
                <>
                  <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 21, letterSpacing: '-0.4px', color: 'white', margin: 0 }}>
                    Choisis ta place
                  </h3>

                  {/* Preuve sociale + jauge de remplissage globale (FOMO) */}
                  {totalCapacity > 0 && soldCount >= 3 && !isEventCancelled && !isEventClosed && (
                    <div style={{ margin: '2px 0 4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: '#4ee8c8', letterSpacing: '0.01em' }}>
                          🔥 {soldCount} {soldCount > 1 ? 'personnes y vont' : 'personne y va'}
                        </span>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>{fillPct}% rempli</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 99, width: `${fillPct}%`, background: fillPct >= 80 ? 'linear-gradient(90deg,#c8a96e,#e05aaa)' : 'linear-gradient(90deg,#4ee8c8,#c8a96e)', transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  )}

                  {/* Utilisateur connecté avec mauvais rôle → avertissement */}
                  {user && !userCanBook && (
                    <div style={{
                      margin: '4px 0 14px', padding: '14px 16px',
                      background: 'rgba(200,169,110,0.07)',
                      border: '1px solid rgba(200,169,110,0.22)',
                      borderRadius: 14, display: 'flex', alignItems: 'flex-start', gap: 12,
                    }}>
                      <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(200,169,110,0.14)', border: '1px solid rgba(200,169,110,0.3)' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: '#e0c690', margin: 0, lineHeight: 1.4 }}>
                          {bookingBlockedReason}
                        </p>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '3px 0 0', lineHeight: 1.45 }}>
                          Pour réserver des places, utilise un compte client.
                        </p>
                      </div>
                    </div>
                  )}

                  {event.places.map((place) => {
                    const alreadyBooked = allBookedThisSession.filter(b => b.place === place.type)
                    const bookedCount = alreadyBooked.reduce((sum, b) => sum + b.tickets.length, 0)
                    const isSelected = selectedPlace === place.type
                    return (
                      <div
                        key={place.type}
                        onClick={() => { setSelectedPlace(place.type === selectedPlace ? null : place.type); setTicketQty(1) }}
                        className="lib-press"
                        style={{
                          position: 'relative', display: 'flex', cursor: 'pointer',
                          borderRadius: 16, overflow: 'hidden',
                          border: `1px solid ${isSelected ? 'rgba(200,169,110,0.6)' : 'rgba(255,255,255,0.10)'}`,
                          background: isSelected ? 'rgba(200,169,110,0.07)' : 'rgba(11,13,20,0.7)',
                          boxShadow: isSelected ? '0 10px 30px -10px rgba(200,169,110,0.4)' : 'none',
                          transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
                        }}
                      >
                        {/* Rail couleur (bord gauche du billet) */}
                        <div style={{ width: 5, flexShrink: 0, background: place.available < 10 ? '#dc3232' : (event.color || '#c8a96e') }} />

                        {/* Corps du billet */}
                        <div style={{ flex: 1, minWidth: 0, padding: '14px 14px' }}>
                          <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 17, letterSpacing: '-0.3px', color: 'white', margin: 0 }}>
                            {place.type}
                          </p>
                          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, color: place.available < 10 ? '#ff8a8a' : 'rgba(255,255,255,0.4)', margin: '3px 0 0' }}>
                            {place.available}/{place.total} restantes
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {place.groupType === 'group' && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: 'rgba(78,232,200,0.1)', border: '1px solid rgba(78,232,200,0.28)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, color: '#4ee8c8' }}>
                                <GroupIcon size={11} color="#4ee8c8" />
                                {place.groupMin || '?'}–{place.groupMax || '?'} pers.
                              </span>
                            )}
                            {bookedCount > 0 && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: 'rgba(78,232,200,0.1)', border: '1px solid rgba(78,232,200,0.28)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, color: '#4ee8c8' }}>
                                <CheckIcon size={10} color="#4ee8c8" />
                                {bookedCount} réservé{bookedCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {/* Jauge de remplissage */}
                          <div style={{ marginTop: 12, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 99, width: `${(place.available / place.total) * 100}%`, background: place.available < 10 ? 'rgba(220,50,50,0.85)' : event.color, transition: 'width 0.4s' }} />
                          </div>

                          {/* Aperçu photos de la place (fourni par l'organisateur) */}
                          {Array.isArray(place.photos) && place.photos.length > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setPhotoGallery({ type: place.type, photos: place.photos, index: 0 }) }}
                              className="lib-press"
                              style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 9, background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.32)', color: '#4ee8c8', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                              Voir à quoi ressemble ma place
                              <span style={{ opacity: 0.7, fontWeight: 500 }}>· {place.photos.length}</span>
                            </button>
                          )}
                        </div>

                        {/* Perforation + talon de prix (l'aspect « vrai billet ») */}
                        <div style={{ position: 'relative', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 18px', borderLeft: '2px dashed rgba(255,255,255,0.16)' }}>
                          {/* encoches cut-out haut/bas */}
                          <span style={{ position: 'absolute', top: -8, left: -8, width: 16, height: 16, borderRadius: '50%', background: '#04040b' }} />
                          <span style={{ position: 'absolute', bottom: -8, left: -8, width: 16, height: 16, borderRadius: '50%', background: '#04040b' }} />
                          <p style={{ ...S.price, fontSize: 26, margin: 0, lineHeight: 1 }}>{place.price}€</p>
                          {isSelected
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, color: '#c8a96e' }}><CheckIcon size={11} color="#c8a96e" /> Choisi</span>
                            : <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>Choisir →</span>}
                        </div>
                      </div>
                    )
                  })}

                  {eventStartedError && (
                    <div style={{ background: 'rgba(220,50,50,0.08)', border: '1px solid rgba(220,50,50,0.30)', borderRadius: 8, padding: '12px 14px' }}>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(220,100,100,0.9)', margin: '0 0 2px', letterSpacing: '0.08em' }}>
                        Réservation impossible
                      </p>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
                        Cet événement a déjà commencé.
                      </p>
                    </div>
                  )}

                  {/* conflit affiché dans le modal dédié (showConflictModal) */}


                  {selectedPlace && (
                    <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Summary card */}
                      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={S.rowLabel}>Place sélectionnée</span>
                          <span style={S.rowValue}>{selectedPlace}</span>
                        </div>

                        {!isGroupPlace && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8 }}>
                            <span style={S.rowLabel}>Quantité</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <button
                                onClick={() => setTicketQty(q => Math.max(1, q - 1))}
                                disabled={ticketQty <= 1}
                                style={{
                                  width: 26, height: 26, borderRadius: 4,
                                  background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'rgba(255,255,255,0.5)',
                                  cursor: ticketQty <= 1 ? 'not-allowed' : 'pointer', opacity: ticketQty <= 1 ? 0.3 : 1,
                                }}
                              >−</button>
                              <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15, color: '#c8a96e', width: 18, textAlign: 'center' }}>
                                {ticketQty}
                              </span>
                              <button
                                onClick={() => setTicketQty(q => Math.min(maxQtyForSelectedPlace, q + 1))}
                                disabled={ticketQty >= maxQtyForSelectedPlace}
                                style={{
                                  width: 26, height: 26, borderRadius: 4,
                                  background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                                  border: '1px solid rgba(200,169,110,0.45)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontFamily: "'DM Mono', monospace", fontSize: 15, color: '#c8a96e',
                                  cursor: ticketQty >= maxQtyForSelectedPlace ? 'not-allowed' : 'pointer',
                                  opacity: ticketQty >= maxQtyForSelectedPlace ? 0.3 : 1,
                                }}
                              >+</button>
                            </div>
                          </div>
                        )}
                        {!isGroupPlace && maxPerAccount > 0 && (
                          <p style={{ ...S.label, marginTop: -4, textAlign: 'right' }}>Max {maxPerAccount} par compte</p>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8 }}>
                          <span style={S.rowLabel}>
                            {isAuctionPlace ? (currentAuctionPrice > 0 ? 'Enchère actuelle' : 'Prix de base') : ticketQty > 1 ? `Prix (${placePrice}€ × ${ticketQty})` : 'Prix'}
                          </span>
                          <span style={{ ...S.price, fontSize: 20 }}>
                            {isAuctionPlace ? (currentAuctionPrice > 0 ? currentAuctionPrice : placePrice) : placePrice * ticketQty}€
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={S.rowLabel}>Points gagnés</span>
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: '#c8a96e' }}>+{ticketQty} point{ticketQty > 1 ? 's' : ''}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8 }}>
                          <span style={S.rowLabel}>Paiement</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Inter, sans-serif', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            {grandTotal > 0 ? 'Sécurisé · Stripe' : 'Gratuit'}
                          </span>
                        </div>
                      </div>

                      {/* CTA — non connecté : ouvre le modal auth puis continue */}
                      {event.preorder ? (
                        <button
                          style={{
                            ...S.btnGold,
                            opacity: (user && !userCanBook) ? 0.4 : 1,
                            cursor: (user && !userCanBook) ? 'not-allowed' : 'pointer',
                            pointerEvents: (user && !userCanBook) ? 'none' : 'auto',
                          }}
                          disabled={user && !userCanBook}
                          onClick={() => requireUserThenDo(() => tryProceed(() => {
                            setPerTicketOrders(Array.from({ length: ticketQty }, () => ({ items: {}, shows: {} })))
                            setActivePreorderTicket(0)
                            setBookingStep('preorder')
                          }))}
                        >
                          Continuer →
                        </button>
                      ) : isGroupPlace ? (
                        <button
                          style={{
                            ...S.btnGroupCTA,
                            opacity: (user && !userCanBook) ? 0.4 : 1,
                            cursor: (user && !userCanBook) ? 'not-allowed' : 'pointer',
                            pointerEvents: (user && !userCanBook) ? 'none' : 'auto',
                          }}
                          disabled={user && !userCanBook}
                          onClick={() => requireUserThenDo(() => { setGroupSendConvId(null); setShowGroupSendModal(true) })}
                        >
                          <GroupIcon size={16} color="#04140f" />
                          Proposer au groupe
                        </button>
                      ) : (
                        <button
                          style={{
                            ...S.btnCheckout,
                            opacity: (user && !userCanBook) || bookingDisabled ? 0.4 : 1,
                            cursor: (user && !userCanBook) || bookingDisabled ? 'not-allowed' : 'pointer',
                            pointerEvents: (user && !userCanBook) || bookingDisabled ? 'none' : 'auto',
                          }}
                          disabled={(user && !userCanBook) || bookingDisabled}
                          onClick={() => !bookingDisabled && requireUserThenDo(() => tryProceed(() => setShowConfirmModal(true)))}
                        >
                          {isEventCancelled || isEventSoldOut || isEventClosed ? (
                            isEventCancelled ? 'Événement annulé' : isEventSoldOut ? 'Complet' : 'Réservations closes'
                          ) : (() => {
                            const amount = isAuctionPlace ? (currentAuctionPrice > 0 ? currentAuctionPrice : placePrice) : placePrice * ticketQty
                            return (<>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1a1206" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              {amount > 0 ? `Réserver · ${amount}€` : 'Réserver — Gratuit'}
                            </>)
                          })()}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Session bookings summary */}
                  {allBookedThisSession.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckIcon size={12} color="#4ee8c8" />
                        <p style={{ ...S.label, color: '#4ee8c8' }}>Tes réservations ce soir</p>
                      </div>
                      {allBookedThisSession.map((b, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            background: 'rgba(78,232,200,0.05)',
                            border: '1px solid rgba(78,232,200,0.18)',
                            borderRadius: 6,
                          }}
                        >
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'white' }}>{b.place}</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#4ee8c8' }}>
                            {b.tickets.length} billet{b.tickets.length > 1 ? 's' : ''} · {b.totalPrice}€
                          </span>
                        </div>
                      ))}
                      <p style={{ ...S.label, textAlign: 'center' }}>
                        Retrouve tes billets dans{' '}
                        <span style={{ color: '#c8a96e' }}>Mes billets</span>
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* ──────── Step 2: preorder ──────── */}
              {bookingStep === 'preorder' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      onClick={() => setBookingStep('place')}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <BackIcon size={14} color="rgba(255,255,255,0.5)" />
                    </button>
                    <div>
                      <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 20, letterSpacing: '-0.4px', color: 'white', margin: 0 }}>
                        Précommande de consommations
                      </h3>
                      <p style={{ ...S.label, marginTop: 3 }}>
                        Optionnel · Récupère ta commande à l'entrée sans attendre
                      </p>
                    </div>
                  </div>

                  {/* Sélecteur de billet à personnaliser (si plusieurs billets) */}
                  {perTicketOrders.length > 1 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {perTicketOrders.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setActivePreorderTicket(i)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 4,
                            border: activePreorderTicket === i ? '1px solid rgba(200,169,110,0.55)' : '1px solid rgba(255,255,255,0.10)',
                            background: activePreorderTicket === i ? 'rgba(200,169,110,0.14)' : 'transparent',
                            fontFamily: "'DM Mono', monospace",
                            fontSize: 9,
                            letterSpacing: '0.15em',
                            textTransform: 'uppercase',
                            color: activePreorderTicket === i ? '#c8a96e' : 'rgba(255,255,255,0.4)',
                            cursor: 'pointer',
                          }}
                        >
                          Billet {i + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {activeMenu.map((item) => {
                      const qty = curTicketOrder.items[item.name] || 0
                      const showSel = curTicketOrder.shows[item.name]
                      return (
                        <div
                          key={item.name}
                          style={{
                            ...S.card,
                            padding: 0,
                            overflow: 'hidden',
                            borderColor: qty > 0 ? 'rgba(200,169,110,0.25)' : 'rgba(255,255,255,0.08)',
                            transition: 'border-color 0.2s',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                              ) : (
                                <div style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 6,
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}>
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
                                    {item.name.slice(0, 2).toUpperCase()}
                                  </span>
                                </div>
                              )}
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 300, fontSize: 16, color: 'white', margin: 0 }}>
                                    {item.name}
                                  </p>
                                  {item.description && (
                                    <button
                                      onClick={() => setDescModal(item)}
                                      style={{
                                        width: 16,
                                        height: 16,
                                        borderRadius: '50%',
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        fontFamily: "'DM Mono', monospace",
                                        fontSize: 9,
                                        color: 'rgba(255,255,255,0.4)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        flexShrink: 0,
                                      }}
                                    >
                                      i
                                    </button>
                                  )}
                                  {item.hasShow && item.showOptions?.length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 3, background: 'rgba(224,90,170,0.08)', border: '1px solid rgba(224,90,170,0.20)' }}>
                                      <SparkleIcon size={9} color="#e05aaa" />
                                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: '#e05aaa', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Show</span>
                                    </div>
                                  )}
                                </div>
                                <p style={{ ...S.price, fontSize: 14, margin: '3px 0 0' }}>{item.price}€</p>
                              </div>
                            </div>

                            {/* Quantity controls */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                              <button
                                onClick={() => updatePreorder(item.name, -1)}
                                disabled={qty === 0}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 4,
                                  background: 'transparent',
                                  border: '1px solid rgba(255,255,255,0.15)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontFamily: "'DM Mono', monospace",
                                  fontSize: 14,
                                  color: 'rgba(255,255,255,0.5)',
                                  cursor: qty === 0 ? 'not-allowed' : 'pointer',
                                  opacity: qty === 0 ? 0.3 : 1,
                                }}
                              >−</button>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: qty > 0 ? '#c8a96e' : 'rgba(255,255,255,0.3)', width: 16, textAlign: 'center' }}>
                                {qty}
                              </span>
                              <button
                                onClick={() => updatePreorder(item.name, 1)}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 4,
                                  background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                                  border: '1px solid rgba(200,169,110,0.45)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontFamily: "'DM Mono', monospace",
                                  fontSize: 16,
                                  color: '#c8a96e',
                                  cursor: 'pointer',
                                }}
                              >+</button>
                            </div>
                          </div>

                          {/* Show options */}
                          {qty > 0 && item.hasShow && item.showOptions?.length > 0 && (
                            <div style={{
                              padding: '10px 14px 12px',
                              borderTop: '1px solid rgba(255,255,255,0.06)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}>
                              <p style={{ ...S.label, color: '#e05aaa' }}>Choisis ton show</p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {item.showOptions.map(opt => (
                                  <button
                                    key={opt.id}
                                    onClick={() => selectShowOption(item.name, opt)}
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: 4,
                                      border: showSel?.showOptionId === opt.id
                                        ? '1px solid rgba(200,169,110,0.55)'
                                        : '1px solid rgba(200,169,110,0.20)',
                                      background: showSel?.showOptionId === opt.id
                                        ? 'rgba(200,169,110,0.18)'
                                        : 'transparent',
                                      fontFamily: "'DM Mono', monospace",
                                      fontSize: 9,
                                      letterSpacing: '0.1em',
                                      textTransform: 'uppercase',
                                      color: showSel?.showOptionId === opt.id ? '#c8a96e' : 'rgba(200,169,110,0.55)',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s',
                                    }}
                                  >
                                    {opt.label}
                                    {opt.requiresInfo && showSel?.showOptionId !== opt.id ? ' ✎' : ''}
                                  </button>
                                ))}
                                {showSel && (
                                  <button
                                    onClick={() => setPerTicketOrders(prev => prev.map((t, i) => {
                                      if (i !== activePreorderTicket) return t
                                      const s = { ...t.shows }; delete s[item.name]; return { ...t, shows: s }
                                    }))}
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: 4,
                                      border: '1px solid rgba(220,50,50,0.25)',
                                      background: 'transparent',
                                      fontFamily: "'DM Mono', monospace",
                                      fontSize: 9,
                                      letterSpacing: '0.1em',
                                      textTransform: 'uppercase',
                                      color: 'rgba(220,100,100,0.7)',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    ✕ Sans show
                                  </button>
                                )}
                              </div>
                              {showSel?.showInfo && (
                                <p style={{ ...S.muted, fontSize: 9, paddingLeft: 4 }}>↳ {showSel.showInfo}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Order total */}
                  <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={S.muted}>Place · {selectedPlace}{ticketQty > 1 ? ` ×${ticketQty}` : ''}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'white' }}>{placePrice * ticketQty}€</span>
                    </div>
                    {perTicketOrders.map((t, n) => {
                      const ticketItems = activeMenu.filter(i => (t.items[i.name] || 0) > 0)
                      if (ticketItems.length === 0) return null
                      return (
                        <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {perTicketOrders.length > 1 && (
                            <span style={{ ...S.muted, fontSize: 9, color: '#c8a96e' }}>Billet {n + 1}</span>
                          )}
                          {ticketItems.map(i => (
                            <div key={i.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={S.muted}>{i.name} ×{t.items[i.name]}</span>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{i.price * t.items[i.name]}€</span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8, marginTop: 4 }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'white', letterSpacing: '0.1em' }}>Total</span>
                      <span style={{ ...S.price, fontSize: 22 }}>{grandTotal}€</span>
                    </div>
                  </div>

                  {isGroupPlace ? (
                    <button
                      style={{
                        ...S.btnGroupCTA,
                        opacity: !userCanBook ? 0.4 : 1,
                        cursor: !userCanBook ? 'not-allowed' : 'pointer',
                        pointerEvents: !userCanBook ? 'none' : 'auto',
                      }}
                      disabled={!userCanBook}
                      onClick={() => { setGroupSendConvId(null); setShowGroupSendModal(true) }}
                    >
                      <GroupIcon size={16} color="#04140f" />
                      Proposer au groupe
                    </button>
                  ) : (
                    <>
                      <button
                        style={{ ...S.btnGold, opacity: !userCanBook ? 0.4 : 1, cursor: !userCanBook ? 'not-allowed' : 'pointer', pointerEvents: !userCanBook ? 'none' : 'auto' }}
                        disabled={!userCanBook}
                        onClick={() => setShowConfirmModal(true)}
                      >
                        {preorderTotal > 0 ? `Confirmer la commande — ${grandTotal}€` : 'Confirmer la réservation'}
                      </button>
                      {preorderTotal > 0 && (
                        <button
                          onClick={() => setShowConfirmModal(true)}
                          disabled={!userCanBook}
                          style={{ ...S.btnGhost, width: '100%', padding: '10px', opacity: !userCanBook ? 0.4 : 1, cursor: !userCanBook ? 'not-allowed' : 'pointer', pointerEvents: !userCanBook ? 'none' : 'auto' }}
                        >
                          Réserver sans précommande
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ──────── Step confirmed ──────── */}
              {bookingStep === 'confirmed' && (
                <BookedCard
                  event={event}
                  selectedPlace={selectedPlace}
                  totalPrice={grandTotal}
                  bookedTickets={bookedTickets}
                  onBookAnother={resetBooking}
                />
              )}
            </div>
          )}


          {/* ──────────────── PLAYLIST ─────────────────────────────────────── */}
          {activeTab === 'Playlist' && (
            <PlaylistSystem event={event} booked={allBookedThisSession.length > 0} />
          )}

          {/* ──────────────── INFO ─────────────────────────────────────────── */}
          {activeTab === 'Info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
              <div>
                <p style={{ ...S.infoLabel, marginBottom: 9 }}>Description</p>
                <p style={S.infoBody}>
                  {event.description}
                </p>
              </div>
              {(event.artists?.length > 0 || event.dj) && (
                <div>
                  <p style={{ ...S.infoLabel, marginBottom: 12 }}>Artistes / DJ</p>
                  {event.artists?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {event.artists.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            padding: '3px 9px',
                            borderRadius: 999,
                            background: 'rgba(200,169,110,0.10)',
                            border: '1px solid rgba(200,169,110,0.3)',
                            color: '#c8a96e',
                          }}>
                            {a.role}
                          </span>
                          <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 17, color: 'white' }}>
                            {a.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 17, color: 'white', margin: 0 }}>
                      {event.dj}
                    </p>
                  )}
                </div>
              )}
              {event.performers?.length > 0 && (
                <div>
                  <p style={{ ...S.infoLabel, marginBottom: 12 }}>Performances</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {event.performers.map((p) => (
                      <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <SparkleIcon size={12} color="#c8a96e" />
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: 'rgba(255,255,255,0.72)' }}>
                          {p}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p style={{ ...S.infoLabel, marginBottom: 12 }}>Organisateur</p>
                <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 46,
                    height: 46,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                    border: '1px solid rgba(200,169,110,0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 700,
                    fontSize: 20,
                    color: '#c8a96e',
                    flexShrink: 0,
                  }}>
                    {event.organizer?.[0]}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 18, color: 'white', margin: 0 }}>
                      {event.organizer}
                    </p>
                    <p style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'rgba(255,255,255,0.5)', margin: '3px 0 0' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
                      Organisateur vérifié
                    </p>
                  </div>
                </div>
              </div>
              <div>
                <p style={{ ...S.infoLabel, marginBottom: 12 }}>Lieu</p>
                <div style={{ ...S.card }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14.5, fontWeight: 500, color: 'rgba(255,255,255,0.82)', margin: 0, lineHeight: 1.4 }}>
                      {event.location}
                    </p>
                  </div>
                  {/* Carte interactive intégrée (OpenStreetMap, sans clé API) */}
                  <LocationMap query={event.location || event.city} fallback={[event.city, event.region].filter(Boolean).join(', ')} />
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location || event.city)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#c8a96e', marginTop: 12, textDecoration: 'none' }}
                  >
                    Ouvrir dans Google Maps
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Galerie photos d'une place (lightbox / carrousel) ───────────────── */}
      {photoGallery && (
        <div
          onClick={() => setPhotoGallery(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4ee8c8', margin: 0 }}>À quoi ressemble ta place</p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 19, fontWeight: 800, color: '#fff', margin: '2px 0 0' }}>{photoGallery.type}</p>
              </div>
              <button onClick={() => setPhotoGallery(null)} aria-label="Fermer" style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 20, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>×</button>
            </div>

            <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', borderRadius: 16, overflow: 'hidden', background: '#0b0d14', border: '1px solid rgba(255,255,255,0.1)' }}>
              <img src={photoGallery.photos[photoGallery.index]} alt={`${photoGallery.type} — photo ${photoGallery.index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {photoGallery.photos.length > 1 && (
                <>
                  <button
                    onClick={() => setPhotoGallery(g => ({ ...g, index: (g.index - 1 + g.photos.length) % g.photos.length }))}
                    aria-label="Photo précédente"
                    style={{ position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >‹</button>
                  <button
                    onClick={() => setPhotoGallery(g => ({ ...g, index: (g.index + 1) % g.photos.length }))}
                    aria-label="Photo suivante"
                    style={{ position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)', width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >›</button>
                  <span style={{ position: 'absolute', top: 10, right: 12, fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '3px 9px', borderRadius: 999 }}>
                    {photoGallery.index + 1} / {photoGallery.photos.length}
                  </span>
                </>
              )}
            </div>

            {photoGallery.photos.length > 1 && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }} className="hide-scrollbar">
                {photoGallery.photos.map((ph, k) => (
                  <button
                    key={k}
                    onClick={() => setPhotoGallery(g => ({ ...g, index: k }))}
                    style={{ flexShrink: 0, width: 56, height: 56, borderRadius: 8, overflow: 'hidden', padding: 0, cursor: 'pointer', background: 'none', border: k === photoGallery.index ? '2px solid #4ee8c8' : '2px solid rgba(255,255,255,0.12)' }}
                  >
                    <img src={ph} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: k === photoGallery.index ? 1 : 0.6 }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Description modal ───────────────────────────────────────────────── */}
      {descModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(4px)' }} onClick={() => setDescModal(null)} />
          <div style={{
            ...S.card,
            position: 'relative',
            width: '100%',
            maxWidth: 360,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {descModal.imageUrl ? (
                <img src={descModal.imageUrl} alt={descModal.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.3)',
                }}>
                  {descModal.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: 20, color: 'white', margin: 0 }}>
                  {descModal.name}
                </p>
                <p style={{ ...S.price, fontSize: 16 }}>{descModal.price}€</p>
              </div>
            </div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, letterSpacing: '0.03em' }}>
              {descModal.description}
            </p>
            <button onClick={() => setDescModal(null)} style={S.btnGold}>Fermer</button>
          </div>
        </div>
      )}

      {/* ── Share modal ─────────────────────────────────────────────────────── */}
      {showShareModal && (() => {
        const myId = getUserId(user)
        const myName = user?.name || 'Moi'
        const convs = getConversations(myId)
        const minPrice = event.places?.length > 0 ? Math.min(...event.places.map(p => p.price)) : null
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(4px)' }} onClick={() => setShowShareModal(false)} />
            <div style={{
              position: 'relative',
              width: '100%',
              maxWidth: 448,
              background: 'rgba(4,5,12,0.97)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: '16px 16px 0 0',
              maxHeight: '60vh',
              display: 'flex',
              flexDirection: 'column',
              paddingBottom: 24,
            }}>
              <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: 40, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto 12px' }} />
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)', textAlign: 'center' }}>
                  Partager l'événement
                </p>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {convs.length === 0 ? (
                  <p style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.25)', padding: '40px 0' }}>
                    Aucune conversation
                  </p>
                ) : convs.map(conv => {
                  const isGroup = conv.type === 'group'
                  const otherName = isGroup
                    ? conv.name
                    : (() => {
                        const otherId = conv.participants?.find(id => id !== myId)
                        return conv.names?.[otherId] || 'Utilisateur'
                      })()
                  return (
                    <button
                      key={conv.id}
                      onClick={() => {
                        const payload = JSON.stringify({ id: event.id, name: event.name, date: event.dateDisplay, price: minPrice, image: event.imageUrl || null })
                        sendMessage(conv.id, myId, myName, 'event', payload)
                        setShowShareModal(false)
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: 'none',
                        border: 'none',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontFamily: "'DM Mono', monospace",
                        fontSize: 10,
                        color: '#c8a96e',
                      }}>
                        {isGroup ? <GroupIcon size={14} color="#c8a96e" /> : getInitials(otherName)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {otherName}
                        </p>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', margin: 0 }}>
                          {formatTime(conv.updatedAt)}
                        </p>
                      </div>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#c8a96e' }}>↗</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Confirm booking modal ────────────────────────────────────────────── */}
      {/* ── Modal conflit de créneau ───────────────────────────────────────── */}
      {showConflictModal && conflictBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 55, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)' }} onClick={() => setShowConflictModal(false)} />
          <div style={{
            position: 'relative', width: '100%', maxWidth: 448,
            background: 'rgba(4,5,12,0.98)',
            border: '1px solid rgba(245,158,11,0.35)',
            borderRadius: '16px 16px 0 0',
            padding: '20px 20px 40px',
            display: 'flex', flexDirection: 'column', gap: 18,
          }}>
            <div style={{ width: 40, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto' }} />

            {/* Icône + titre */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.40)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#f59e0b">
                  <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
              </div>
              <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 300, fontSize: 24, color: 'white', margin: 0 }}>
                Conflit de créneau
              </h3>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, letterSpacing: '0.04em', margin: 0 }}>
                Tu as déjà une réservation pour{' '}
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>{conflictBooking.eventName}</span>
                {' '}le <span style={{ color: 'white' }}>{conflictBooking.eventDate}</span> sur un créneau qui se chevauche avec cet événement.
              </p>
            </div>

            {/* Card récap conflit */}
            <div style={{
              background: 'rgba(245,158,11,0.07)',
              border: '1px solid rgba(245,158,11,0.22)',
              borderRadius: 10, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: 'rgba(245,158,11,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b">
                  <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
                </svg>
              </div>
              <div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, color: 'rgba(255,255,255,0.88)', margin: 0 }}>
                  {conflictBooking.eventName}
                </p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', margin: '3px 0 0', letterSpacing: '0.1em' }}>
                  {conflictBooking.eventDate} · {conflictBooking.eventStartTime} → {conflictBooking.eventEndTime}
                </p>
              </div>
            </div>

            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', textAlign: 'center', margin: 0, letterSpacing: '0.06em' }}>
              Tu peux quand même réserver — la décision t'appartient.
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => {
                  setShowConflictModal(false)
                  if (conflictProceedFn) conflictProceedFn()
                }}
                style={{
                  padding: '14px', borderRadius: 4, cursor: 'pointer',
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.22), rgba(245,158,11,0.07))',
                  border: '1px solid rgba(245,158,11,0.45)',
                  fontFamily: "'DM Mono', monospace", fontSize: 11,
                  letterSpacing: '0.2em', textTransform: 'uppercase', color: '#f59e0b',
                }}
              >
                Continuer quand même →
              </button>
              <button
                onClick={() => setShowConflictModal(false)}
                style={{
                  padding: '12px', borderRadius: 4, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                  fontFamily: "'DM Mono', monospace", fontSize: 11,
                  letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)',
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)' }} onClick={() => setShowConfirmModal(false)} />
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: 448,
            background: 'rgba(4,5,12,0.97)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '16px 16px 0 0',
            padding: '20px 20px 36px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ width: 40, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto' }} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, paddingTop: 4 }}>
              <WarnIcon size={28} color="rgba(200,169,110,0.8)" />
              <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 22, letterSpacing: '-0.4px', color: 'white', margin: 0 }}>
                {grandTotal > 0 ? 'Procéder au paiement ?' : 'Confirmer la réservation ?'}
              </h3>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7, letterSpacing: '0.03em' }}>
                Une fois confirmée, tu ne pourras{' '}
                <span style={{ color: 'white' }}>plus modifier</span>{' '}
                ta réservation.
              </p>
              {event.preorder && preorderTotal === 0 && (
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.05em' }}>
                  Tu pars sans précommande — tu pourras commander sur place.
                </p>
              )}
            </div>

            {/* Récap montant à payer */}
            {grandTotal > 0 && (
              <div style={{ background: 'rgba(78,232,200,0.06)', border: '1px solid rgba(78,232,200,0.20)', borderRadius: 8, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)', margin: 0, marginBottom: 4 }}>
                    Total à payer
                  </p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.32)', margin: 0 }}>
                    {ticketQty} {selectedPlace}{ticketQty > 1 ? 's' : ''}{preorderTotal > 0 ? ' + précommandes' : ''}
                  </p>
                </div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 26, fontWeight: 300, color: '#4ee8c8', margin: 0 }}>
                  {grandTotal.toFixed(2)} €
                </p>
              </div>
            )}

            {/* Mention paiement sécurisé */}
            {grandTotal > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <IconLock size={11} color="rgba(255,255,255,0.32)" />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.05em', lineHeight: 1.7 }}>
                  Paiement sécurisé via Stripe — tu seras redirigé.
                </span>
              </div>
            )}

            {stripeError && (
              <div style={{ background: 'rgba(220,50,50,0.10)', border: '1px solid rgba(220,50,50,0.30)', borderRadius: 6, padding: '10px 12px' }}>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,180,180,0.95)', margin: 0, lineHeight: 1.6 }}>
                  {stripeError}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                style={{ ...S.btnGold, opacity: stripeRedirecting ? 0.6 : 1, cursor: stripeRedirecting ? 'wait' : 'pointer' }}
                disabled={stripeRedirecting}
                onClick={() => { setStripeError(''); confirmBooking() }}
              >
                {stripeRedirecting ? 'Redirection vers Stripe…' : grandTotal > 0 ? `Payer ${grandTotal.toFixed(2)} €` : 'Oui, confirmer'}
              </button>
              <button
                onClick={() => { setShowConfirmModal(false); setStripeError('') }}
                style={S.btnGhost}
                disabled={stripeRedirecting}
              >
                Retour
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Age verification modal ───────────────────────────────────────────── */}
      {showAgeModal && (
        <AgeVerificationModal
          minAge={event.minAge || 18}
          onVerified={() => {
            setAgeVerified(true)
            setShowAgeModal(false)
            setShowConfirmModal(true)
          }}
          onCancel={() => setShowAgeModal(false)}
        />
      )}

      {/* ── Group send modal ─────────────────────────────────────────────────── */}
      {showGroupSendModal && (() => {
        const myId = getUserId(user)
        const myName = user?.name || 'Moi'
        const groupMin = selectedPlaceObj?.groupMin || 2
        const groupMax = selectedPlaceObj?.groupMax || 99
        const groupConvs = getConversations(myId).filter(c => {
          if (c.type !== 'group') return false
          const mc = c.members?.length || 0
          return mc >= groupMin && (groupMax <= 0 || mc <= groupMax)
        })
        const allGroupConvs = getConversations(myId).filter(c => c.type === 'group')
        const preorderData = perTicketOrders[0] || { items: {}, shows: {} }
        const preorderItems = Object.entries(preorderData.items || {}).filter(([, q]) => q > 0)
        function sendGroupProposal() {
          if (!groupSendConvId) return
          const conv = groupConvs.find(c => c.id === groupSendConvId)
          const bookingId = 'gb_' + Date.now()
          saveGroupBooking({
            id: bookingId,
            eventId: event.id,
            eventName: event.name,
            eventDate: event.dateDisplay || event.date,
            eventDateISO: event.date,
            eventStartTime: event.time,
            eventEndTime: event.endTime,
            eventImage: event.imageUrl || null,
            placeName: selectedPlace,
            placePrice,
            groupMin,
            groupMax,
            preorderData,
            preorderTotal,
            totalPrice: grandTotal,
            convId: groupSendConvId,
            // CRITIQUE : on passe les membres de la conversation pour que
            // saveGroupBooking en dérive participantIds. Sans ça, participantIds
            // restait vide → la règle Firestore isMemberOf refusait la création
            // du doc (le proposeur n'est pas membre d'une liste vide) → la résa
            // n'arrivait jamais en base et les autres membres voyaient
            // « Réservation introuvable » sur leur appareil.
            members: (conv?.members || []).map(m => ({ userId: m.userId, name: m.name })),
            participantIds: (conv?.members || []).map(m => m.userId).filter(Boolean),
            convMemberCount: conv?.members?.length || 2,
            proposerId: myId,
            proposerName: myName,
            status: 'pending_validation',
            validations: { [myId]: true },
            payments: {},
            songSelections: {},
            withdrawnMembers: [],
            createdAt: Date.now(),
            deadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          })
          sendMessage(groupSendConvId, myId, myName, 'group_booking', bookingId)
          setShowGroupSendModal(false)
          navigate('/messagerie')
        }
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)' }} onClick={() => setShowGroupSendModal(false)} />
            <div style={{
              position: 'relative',
              width: '100%',
              maxWidth: 448,
              background: 'rgba(4,5,12,0.97)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: '16px 16px 0 0',
              padding: '20px 20px 36px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}>
              <div style={{ width: 40, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto' }} />

              <div>
                <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 22, color: 'white', margin: 0, letterSpacing: '-0.01em' }}>
                  Proposer au groupe
                </h3>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                  Choisis une conversation de groupe pour partager la réservation
                </p>
              </div>

              {/* Summary */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.55)' }}>Place</span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'white' }}>{selectedPlace}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.55)' }}>Groupe requis</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <GroupIcon size={13} color="#4ee8c8" />
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#4ee8c8' }}>
                      {selectedPlaceObj?.groupMin || '?'}–{selectedPlaceObj?.groupMax || '?'} pers.
                    </span>
                  </div>
                </div>
                {preorderItems.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.55)' }}>Précommande</span>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#c8a96e' }}>
                      {preorderItems.map(([n, q]) => `${q}× ${n}`).join(', ')}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 2 }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Total</span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 700, color: '#c8a96e', letterSpacing: '-0.02em' }}>{grandTotal} €</span>
                </div>
              </div>

              {/* Group size info */}
              <div style={{ background: 'rgba(78,232,200,0.06)', border: '1px solid rgba(78,232,200,0.20)', borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500, color: 'rgba(78,232,200,0.85)', margin: 0, lineHeight: 1.5 }}>
                  Cette place requiert entre {groupMin} et {groupMax > 0 ? groupMax : '∞'} personnes.
                  Seuls les groupes compatibles sont affichés.
                </p>
              </div>
              {/* Group conversation list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 192, overflowY: 'auto' }}>
                {allGroupConvs.length === 0 ? (
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.30)', textAlign: 'center', padding: '20px 0' }}>
                    Aucune conversation de groupe. Crée un groupe dans Messages.
                  </p>
                ) : groupConvs.length === 0 ? (
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.40)', textAlign: 'center', padding: '20px 0' }}>
                    Aucun groupe compatible ({groupMin}–{groupMax > 0 ? groupMax : '∞'} membres requis).
                  </p>
                ) : groupConvs.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setGroupSendConvId(c.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: groupSendConvId === c.id ? '1px solid rgba(78,232,200,0.50)' : '1px solid rgba(255,255,255,0.08)',
                      background: groupSendConvId === c.id ? 'rgba(78,232,200,0.08)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: groupSendConvId === c.id ? 'rgba(78,232,200,0.12)' : 'rgba(255,255,255,0.06)',
                      border: groupSendConvId === c.id ? '1px solid rgba(78,232,200,0.35)' : '1px solid rgba(255,255,255,0.10)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 12,
                      fontWeight: 700,
                      color: groupSendConvId === c.id ? '#4ee8c8' : '#c8a96e',
                      flexShrink: 0,
                    }}>
                      {getInitials(c.name || '?')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </p>
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.40)', margin: 0 }}>
                        {c.members?.length || 0} membres
                      </p>
                    </div>
                    {groupSendConvId === c.id && (
                      <CheckIcon size={16} color="#4ee8c8" />
                    )}
                  </button>
                ))}
              </div>

              <button
                style={{
                  ...S.btnGroupCTA,
                  opacity: groupSendConvId ? 1 : 0.45,
                  cursor: groupSendConvId ? 'pointer' : 'not-allowed',
                  filter: groupSendConvId ? 'none' : 'grayscale(0.6)',
                }}
                onClick={sendGroupProposal}
                disabled={!groupSendConvId}
              >
                Envoyer la proposition
              </button>
            </div>
          </div>
        )
      })()}

      {/* ── Show info modal ──────────────────────────────────────────────────── */}
      {showInfoModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(4px)' }} onClick={() => setShowInfoModal(null)} />
          <div style={{
            ...S.card,
            position: 'relative',
            width: '100%',
            maxWidth: 360,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <SparkleIcon size={22} color="#c8a96e" />
              <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 300, fontSize: 22, color: 'white', margin: 0 }}>
                {showInfoModal.opt.label}
              </h3>
              <p style={{ ...S.label }}>Pour {showInfoModal.itemName}</p>
            </div>
            <div>
              <label style={{ ...S.label, display: 'block', marginBottom: 6 }}>
                {showInfoModal.opt.infoPrompt || 'Information requise'}
              </label>
              <input
                style={S.input}
                placeholder="Ta réponse…"
                value={showInfoInput}
                onChange={e => setShowInfoInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmShowInfo()}
                onFocus={e => (e.target.style.borderColor = '#4ee8c8')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.10)')}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowInfoModal(null)} style={{ ...S.btnGhost, flex: 1 }}>Annuler</button>
              <button onClick={confirmShowInfo} style={{ ...S.btnGold, flex: 1, width: 'auto' }}>Confirmer →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Points toast ─────────────────────────────────────────────────────── */}
      {showPointsToast && (
        <div style={{
          position: 'fixed',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
          border: '1px solid rgba(200,169,110,0.45)',
          borderRadius: 4,
          padding: '10px 20px',
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: '#c8a96e',
          boxShadow: '0 8px 32px rgba(0,0,0,0.40)',
          whiteSpace: 'nowrap',
        }}>
          <SparkleIcon size={12} color="#c8a96e" />
          +1 point gagné
        </div>
      )}
    </Layout>
  )
}

// ─── BookedCard ────────────────────────────────────────────────────────────────

function BookedCard({ event, selectedPlace, preorderSummary = [], preorderItems = {}, totalPrice, bookedTickets = [], onBookAnother }) {
  const [visibleQr, setVisibleQr] = useState(0)
  const ticket = bookedTickets[visibleQr] || bookedTickets[0] || {}
  const qrUrl = ticket.ticketToken ? `${window.location.origin}/ticket/${ticket.ticketToken}` : ''

  const S2 = {
    card: {
      background: 'rgba(8,10,20,0.55)',
      backdropFilter: 'blur(22px) saturate(1.6)',
      border: '1px solid rgba(78,232,200,0.18)',
      borderRadius: 12,
      padding: '20px 16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      textAlign: 'center',
    },
    label: {
      fontFamily: "'DM Mono', monospace",
      fontSize: 9,
      letterSpacing: '0.25em',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.42)',
    },
  }

  return (
    <div style={S2.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 20, letterSpacing: '-0.4px', color: 'white', margin: 0 }}>
          Réservation confirmée !
        </p>
      </div>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', margin: 0 }}>
        {selectedPlace} · {event.name}
      </p>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#4ee8c8', margin: 0 }}>
        +{bookedTickets.length} point{bookedTickets.length > 1 ? 's' : ''} ajouté{bookedTickets.length > 1 ? 's' : ''}
      </p>

      {/* Multiple ticket tabs */}
      {bookedTickets.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {bookedTickets.map((_, i) => (
            <button
              key={i}
              onClick={() => setVisibleQr(i)}
              style={{
                padding: '4px 12px',
                borderRadius: 4,
                border: visibleQr === i ? '1px solid rgba(200,169,110,0.45)' : '1px solid rgba(255,255,255,0.10)',
                background: visibleQr === i ? 'rgba(200,169,110,0.12)' : 'transparent',
                fontFamily: "'DM Mono', monospace",
                fontSize: 9,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: visibleQr === i ? '#c8a96e' : 'rgba(255,255,255,0.3)',
                cursor: 'pointer',
              }}
            >
              Billet {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* QR Code */}
      <div style={{ padding: 16, background: 'white', borderRadius: 8, display: 'inline-block' }}>
        {qrUrl ? (
          <QRCodeSVG value={qrUrl} size={128} level="H" />
        ) : (
          <div style={{ width: 128, height: 128, background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 12, color: '#999' }}>QR...</span>
          </div>
        )}
      </div>

      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', margin: 0 }}>
        Scanne ce QR code à l'entrée
      </p>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.18)', margin: 0, letterSpacing: '0.05em' }}>
        {ticket.ticketCode}
      </p>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,0.15)', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Billet sécurisé · non duplicable
      </p>

      {/* Preorder details */}
      {visibleQr === 0 && preorderSummary.length > 0 && (
        <div style={{
          width: '100%',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 8,
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          textAlign: 'left',
        }}>
          <p style={{ ...S2.label, color: '#c8a96e', marginBottom: 4 }}>Précommande incluse</p>
          {preorderSummary.map((item) => (
            <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>{item.name}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>×{preorderItems[item.name]}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 6, marginTop: 2 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)' }}>Total payé</span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 300, fontSize: 16, color: '#c8a96e' }}>{totalPrice}€</span>
          </div>
        </div>
      )}

      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', margin: 0 }}>
        Retrouve tous tes billets dans{' '}
        <span style={{ color: '#c8a96e' }}>Mes billets</span>
      </p>

      {onBookAnother && (
        <button
          onClick={onBookAnother}
          style={{
            width: '100%',
            padding: '10px',
            background: 'transparent',
            border: '1px solid rgba(200,169,110,0.25)',
            borderRadius: 4,
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#c8a96e',
            cursor: 'pointer',
          }}
        >
          + Réserver une autre place
        </button>
      )}

      {event.playlist && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          borderRadius: 4,
          background: 'rgba(224,90,170,0.07)',
          border: '1px solid rgba(224,90,170,0.22)',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#e05aaa">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#e05aaa' }}>
            Playlist interactive débloquée
          </span>
        </div>
      )}
    </div>
  )
}
