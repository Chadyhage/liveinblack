import { useState, useEffect } from 'react'
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
    fontFamily: "'Cormorant Garamond', serif",
    fontWeight: 300,
    color: '#c8a96e',
  },
  muted: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    color: 'rgba(255,255,255,0.42)',
  },
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
  const [bookedTickets, setBookedTickets] = useState([]) // tickets for the LAST confirmed booking
  const [allBookedThisSession, setAllBookedThisSession] = useState([]) // { place, tickets, preorderSummary, totalPrice }
  const [showShareModal, setShowShareModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
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

  const placePrice = selectedPlaceObj?.price || 0
  const curTicketOrder = perTicketOrders[activePreorderTicket] || { items: {}, shows: {} }
  const preorderTotal = perTicketOrders.reduce((total, t) =>
    total + activeMenu.reduce((sum, item) => sum + (t.items[item.name] || 0) * item.price, 0), 0)
  const totalPrice = placePrice + preorderTotal
  // Correct total: place price × qty + preorder total (preorderTotal already sums all tickets)
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
      }).catch(() => {})

      setBookedTickets(newTickets)
      if (user && uid) {
        const newPoints = (user.points || 0) + ticketQty
        setUser({ ...user, points: newPoints })
        import('../utils/firestore-sync').then(({ syncDoc }) => {
          syncDoc(`users/${uid}`, { points: newPoints })
        }).catch(() => {})
        import('../utils/accounts').then(({ updateAccount }) => {
          updateAccount(uid, { points: newPoints })
        }).catch(() => {})
        setShowPointsToast(true)
        setTimeout(() => setShowPointsToast(false), 2500)
      }
      setAllBookedThisSession(prev => [...prev, {
        place: selectedPlace,
        tickets: newTickets,
        totalPrice: grandTotal,
      }])
      setBookingStep('confirmed')
      setShowConfirmModal(false)
    } catch {
      setShowConfirmModal(false)
      return
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
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 80, color: event.color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
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
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 300,
              fontSize: 36,
              letterSpacing: '0.04em',
              color: event.accentColor || 'white',
              lineHeight: 1,
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

        {/* ── Quick info strip ─────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          padding: '12px 16px',
          gap: 20,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          overflowX: 'auto',
        }}>
          {[
            { Icon: CalendarIcon, val: event.dateDisplay },
            { Icon: ClockIcon, val: `${event.time} → ${event.endTime}` },
            { Icon: PinIcon, val: event.location },
          ].map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <item.Icon size={12} color="rgba(200,169,110,0.7)" />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', whiteSpace: 'nowrap' }}>
                {item.val}
              </span>
            </div>
          ))}
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
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
                flexShrink: 0,
                padding: '14px 16px 12px',
                fontFamily: "'DM Mono', monospace",
                fontSize: 9,
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? '1px solid #4ee8c8' : '1px solid transparent',
                color: activeTab === tab ? '#4ee8c8' : 'rgba(255,255,255,0.3)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginBottom: -1,
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
                  <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 20, color: 'white', margin: 0 }}>
                    Choisir ton type de place
                  </h3>

                  {/* Utilisateur connecté avec mauvais rôle → avertissement */}
                  {user && !userCanBook && (
                    <div style={{
                      margin: '4px 0 12px', padding: '14px 16px',
                      background: 'rgba(200,169,110,0.08)',
                      border: '1px solid rgba(200,169,110,0.25)',
                      borderRadius: 8, display: 'flex', alignItems: 'flex-start', gap: 12,
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#c8a96e" style={{ flexShrink: 0, marginTop: 2 }}>
                        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                      </svg>
                      <div>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#c8a96e', letterSpacing: '0.1em', margin: 0 }}>
                          {bookingBlockedReason}
                        </p>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4, marginBottom: 0, letterSpacing: '0.05em' }}>
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
                        onClick={() => setSelectedPlace(place.type === selectedPlace ? null : place.type)}
                        style={{
                          ...S.card,
                          cursor: 'pointer',
                          borderColor: isSelected ? 'rgba(200,169,110,0.45)' : 'rgba(255,255,255,0.10)',
                          background: isSelected
                            ? 'rgba(200,169,110,0.06)'
                            : 'rgba(8,10,20,0.55)',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: 18, color: 'white', margin: 0 }}>
                                {place.type}
                              </p>
                              <p style={{ ...S.label, marginTop: 0 }}>
                                {place.available}/{place.total} restantes
                              </p>
                              {place.groupType === 'group' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                  <GroupIcon size={11} color="#4ee8c8" />
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#4ee8c8', letterSpacing: '0.1em' }}>
                                    {place.groupMin || '?'}–{place.groupMax || '?'} pers.
                                  </span>
                                </div>
                              )}
                              {bookedCount > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                  <CheckIcon size={10} color="#4ee8c8" />
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#4ee8c8' }}>
                                    {bookedCount} billet{bookedCount > 1 ? 's' : ''} réservé{bookedCount > 1 ? 's' : ''}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ ...S.price, fontSize: 24, margin: 0 }}>{place.price}€</p>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div style={{ marginTop: 12, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              borderRadius: 1,
                              width: `${(place.available / place.total) * 100}%`,
                              background: place.available < 10 ? 'rgba(220,50,50,0.8)' : event.color,
                              transition: 'width 0.4s',
                            }}
                          />
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
                          <span style={S.muted}>Place sélectionnée</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'white' }}>{selectedPlace}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8 }}>
                          <span style={S.muted}>
                            {isAuctionPlace ? (currentAuctionPrice > 0 ? 'Enchère actuelle' : 'Prix de base') : 'Prix'}
                          </span>
                          <span style={{ ...S.price, fontSize: 20 }}>
                            {isAuctionPlace ? (currentAuctionPrice > 0 ? currentAuctionPrice : placePrice) : placePrice}€
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={S.muted}>Points gagnés</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#4ee8c8' }}>+1 point</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8 }}>
                          <span style={S.muted}>Paiement</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#4ee8c8', letterSpacing: '0.1em' }}>FICTIF — STRIPE À VENIR</span>
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
                            setPerTicketOrders([{ items: {}, shows: {} }])
                            setActivePreorderTicket(0)
                            setBookingStep('preorder')
                          }))}
                        >
                          Continuer →
                        </button>
                      ) : isGroupPlace ? (
                        <button
                          style={{
                            ...S.btnPrimary,
                            background: 'rgba(78,232,200,0.07)',
                            border: '1px solid rgba(78,232,200,0.25)',
                            color: '#4ee8c8',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          }}
                          onClick={() => requireUserThenDo(() => { setGroupSendConvId(null); setShowGroupSendModal(true) })}
                        >
                          <GroupIcon size={13} color="#4ee8c8" />
                          Proposer au groupe →
                        </button>
                      ) : (
                        <button
                          style={{
                            ...S.btnGold,
                            opacity: (user && !userCanBook) || bookingDisabled ? 0.4 : 1,
                            cursor: (user && !userCanBook) || bookingDisabled ? 'not-allowed' : 'pointer',
                            pointerEvents: (user && !userCanBook) || bookingDisabled ? 'none' : 'auto',
                          }}
                          disabled={(user && !userCanBook) || bookingDisabled}
                          onClick={() => !bookingDisabled && requireUserThenDo(() => tryProceed(() => setShowConfirmModal(true)))}
                        >
                          {isEventCancelled ? 'Événement annulé' : isEventSoldOut ? 'Complet' : isEventClosed ? 'Réservations closes' : 'Confirmer la réservation'}
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
                      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 20, color: 'white', margin: 0 }}>
                        Précommande de consommations
                      </h3>
                      <p style={{ ...S.label, marginTop: 3 }}>
                        Optionnel · Récupère ta commande à l'entrée sans attendre
                      </p>
                    </div>
                  </div>

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
                                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 16, color: 'white', margin: 0 }}>
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
                      <span style={S.muted}>Place · {selectedPlace}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'white' }}>{placePrice}€</span>
                    </div>
                    {perTicketOrders.map((t, n) => {
                      const ticketItems = activeMenu.filter(i => (t.items[i.name] || 0) > 0)
                      if (ticketItems.length === 0) return null
                      return (
                        <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                      <span style={{ ...S.price, fontSize: 22 }}>{totalPrice}€</span>
                    </div>
                  </div>

                  {isGroupPlace ? (
                    <button
                      style={{
                        ...S.btnPrimary,
                        background: 'rgba(78,232,200,0.07)',
                        border: '1px solid rgba(78,232,200,0.25)',
                        color: '#4ee8c8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                      }}
                      onClick={() => { setGroupSendConvId(null); setShowGroupSendModal(true) }}
                    >
                      <GroupIcon size={13} color="#4ee8c8" />
                      Proposer au groupe →
                    </button>
                  ) : (
                    <>
                      <button
                        style={{ ...S.btnGold, opacity: !userCanBook ? 0.4 : 1, cursor: !userCanBook ? 'not-allowed' : 'pointer', pointerEvents: !userCanBook ? 'none' : 'auto' }}
                        disabled={!userCanBook}
                        onClick={() => setShowConfirmModal(true)}
                      >
                        {preorderTotal > 0 ? `Confirmer la commande — ${totalPrice}€` : 'Confirmer la réservation'}
                      </button>
                      {preorderTotal > 0 && (
                        <button
                          onClick={() => setShowConfirmModal(true)}
                          disabled={!userCanBook}
                          style={{ ...S.btnGhost, width: '100%', padding: '10px', opacity: !userCanBook ? 0.4 : 1, cursor: !userCanBook ? 'not-allowed' : 'pointer', pointerEvents: !userCanBook ? 'none' : 'auto' }}
                        >
                          Ignorer et réserver sans précommande
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <p style={{ ...S.label, color: '#c8a96e', marginBottom: 8 }}>Description</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.8, letterSpacing: '0.03em' }}>
                  {event.description}
                </p>
              </div>
              {(event.artists?.length > 0 || event.dj) && (
                <div>
                  <p style={{ ...S.label, color: '#c8a96e', marginBottom: 10 }}>Artistes / DJ</p>
                  {event.artists?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {event.artists.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            fontFamily: "'DM Mono', monospace",
                            fontSize: 8,
                            letterSpacing: '0.2em',
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: 3,
                            background: 'rgba(200,169,110,0.08)',
                            border: '1px solid rgba(200,169,110,0.25)',
                            color: '#c8a96e',
                          }}>
                            {a.role}
                          </span>
                          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 18, color: 'white' }}>
                            {a.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 18, color: 'white' }}>
                      {event.dj}
                    </p>
                  )}
                </div>
              )}
              {event.performers?.length > 0 && (
                <div>
                  <p style={{ ...S.label, color: '#c8a96e', marginBottom: 10 }}>Performances</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {event.performers.map((p) => (
                      <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <SparkleIcon size={10} color="#c8a96e" />
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                          {p}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p style={{ ...S.label, color: '#c8a96e', marginBottom: 10 }}>Organisateur</p>
                <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                    border: '1px solid rgba(200,169,110,0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Cormorant Garamond', serif",
                    fontWeight: 400,
                    fontSize: 18,
                    color: '#c8a96e',
                    flexShrink: 0,
                  }}>
                    {event.organizer?.[0]}
                  </div>
                  <div>
                    <p style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 18, color: 'white', margin: 0 }}>
                      {event.organizer}
                    </p>
                    <p style={{ ...S.muted, marginTop: 2 }}>Organisateur vérifié</p>
                  </div>
                </div>
              </div>
              <div>
                <p style={{ ...S.label, color: '#c8a96e', marginBottom: 10 }}>Lieu</p>
                <div style={{ ...S.card }}>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
                    {event.location}
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location || event.city)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#c8a96e', marginTop: 6, display: 'block', textDecoration: 'none' }}
                  >
                    Voir sur la carte →
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, fontSize: 20, color: 'white', margin: 0 }}>
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
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 24, color: 'white', margin: 0 }}>
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
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, color: 'rgba(255,255,255,0.88)', margin: 0 }}>
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
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 22, color: 'white', margin: 0 }}>
                {grandTotal > 0 ? 'Procéder au paiement ?' : 'Confirmer la réservation ?'}
              </h3>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7, letterSpacing: '0.03em' }}>
                Une fois confirmée, tu ne pourras{' '}
                <span style={{ color: 'white' }}>plus modifier</span>{' '}
                ta précommande ni ton son de playlist.
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
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 300, color: '#4ee8c8', margin: 0 }}>
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
            totalPrice,
            convId: groupSendConvId,
            convMemberCount: conv?.members?.length || 2,
            proposerId: myId,
            proposerName: myName,
            status: 'pending_validation',
            validations: { [myId]: true },
            payments: {},
            songSelections: {},
            createdAt: Date.now(),
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
                <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 22, color: 'white', margin: 0 }}>
                  Proposer au groupe
                </h3>
                <p style={{ ...S.label, marginTop: 4 }}>Choisis une conversation de groupe</p>
              </div>

              {/* Summary */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={S.muted}>Place</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'white' }}>{selectedPlace}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={S.muted}>Groupe</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <GroupIcon size={11} color="#4ee8c8" />
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#4ee8c8' }}>
                      {selectedPlaceObj?.groupMin || '?'}–{selectedPlaceObj?.groupMax || '?'} pers.
                    </span>
                  </div>
                </div>
                {preorderItems.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={S.muted}>Précommande</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#c8a96e' }}>
                      {preorderItems.map(([n, q]) => `${q}× ${n}`).join(', ')}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 6, marginTop: 2 }}>
                  <span style={S.muted}>Total</span>
                  <span style={{ ...S.price, fontSize: 16 }}>{totalPrice}€</span>
                </div>
              </div>

              {/* Group size info */}
              <div style={{ background: 'rgba(78,232,200,0.05)', border: '1px solid rgba(78,232,200,0.18)', borderRadius: 6, padding: '8px 12px' }}>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(78,232,200,0.75)', margin: 0, letterSpacing: '0.06em' }}>
                  Cette place requiert entre {groupMin} et {groupMax > 0 ? groupMax : '∞'} personnes.
                  Seuls les groupes respectant cette contrainte sont affichés.
                </p>
              </div>
              {/* Group conversation list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 192, overflowY: 'auto' }}>
                {allGroupConvs.length === 0 ? (
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'center', padding: '16px 0' }}>
                    Aucune conversation de groupe trouvée. Crée un groupe dans Messages.
                  </p>
                ) : groupConvs.length === 0 ? (
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '16px 0' }}>
                    Aucun groupe compatible ({groupMin}–{groupMax > 0 ? groupMax : '∞'} membres requis). Ajuste la taille de ton groupe dans Messages.
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
                      borderRadius: 8,
                      border: groupSendConvId === c.id ? '1px solid rgba(78,232,200,0.45)' : '1px solid rgba(255,255,255,0.08)',
                      background: groupSendConvId === c.id ? 'rgba(78,232,200,0.07)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
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
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#c8a96e',
                      flexShrink: 0,
                    }}>
                      {getInitials(c.name || '?')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </p>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', margin: 0 }}>
                        {c.members?.length || 0} membres
                      </p>
                    </div>
                    {groupSendConvId === c.id && (
                      <CheckIcon size={14} color="#4ee8c8" />
                    )}
                  </button>
                ))}
              </div>

              <button
                style={{
                  ...S.btnPrimary,
                  background: groupSendConvId ? 'rgba(78,232,200,0.10)' : 'rgba(255,255,255,0.03)',
                  border: groupSendConvId ? '1px solid rgba(78,232,200,0.35)' : '1px solid rgba(255,255,255,0.08)',
                  color: groupSendConvId ? '#4ee8c8' : 'rgba(255,255,255,0.2)',
                  cursor: groupSendConvId ? 'pointer' : 'not-allowed',
                  opacity: groupSendConvId ? 1 : 0.5,
                }}
                onClick={sendGroupProposal}
                disabled={!groupSendConvId}
              >
                Envoyer la proposition →
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
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 22, color: 'white', margin: 0 }}>
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
                placeholder="Votre réponse..."
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
        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 20, color: 'white', margin: 0 }}>
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
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: 16, color: '#c8a96e' }}>{totalPrice}€</span>
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
