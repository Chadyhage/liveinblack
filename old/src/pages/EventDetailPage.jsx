import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import Layout from '../components/Layout'
import { events } from '../data/events'
import PlaylistSystem from '../components/PlaylistSystem'
import PlaylistDJPanel from '../components/PlaylistDJPanel'
import { useAuth } from '../context/AuthContext'
import { generateTicketToken, checkScheduleConflict } from '../utils/ticket'
import { getConversations, sendMessage, getUserId, formatTime, getInitials } from '../utils/messaging'
import { startTicketCheckout } from '../utils/stripe'
import { shareOrCopy } from '../utils/share'
import { eventCurrency, fmtMoney } from '../utils/money'
import { canBook, getBookingBlockedReason } from '../utils/permissions'
import { canDJ as canDJStaff } from '../utils/eventOrders'
import AgeVerificationModal from '../components/AgeVerificationModal'
import Breadcrumb from '../components/Breadcrumb'
import EventInterestButton from '../components/EventInterestButton'
import { Skeleton, SkeletonText } from '../components/Skeleton'
import { IconLock, IconTicket, IconCheck } from '../components/icons'

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
    background: '#0e0f16',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '16px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  },
  btnPrimary: {
    padding: '13px 20px',
    background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 12,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
    width: '100%',
    boxShadow: '0 6px 20px rgba(122,59,242,0.35)',
  },
  btnGold: {
    padding: '13px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: 'linear-gradient(180deg, #e0c48a, #c8a96e)',
    border: 'none',
    borderRadius: 12,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 700,
    color: '#1a1206',
    cursor: 'pointer',
    width: '100%',
    boxShadow: '0 6px 20px rgba(200,169,110,0.3)',
  },
  btnGhost: {
    padding: '11px 18px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 12,
    fontFamily: 'Inter, sans-serif',
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.85)',
    cursor: 'pointer',
  },
  btnDanger: {
    padding: '11px 18px',
    background: '#c2347f',
    border: 'none',
    borderRadius: 12,
    fontFamily: 'Inter, sans-serif',
    fontSize: 13,
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
  },
  input: {
    background: '#0b0c12',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.92)',
    padding: '12px 14px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  },
  label: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  price: {
    fontFamily: 'Inter, sans-serif',
    fontWeight: 800,
    letterSpacing: '-0.5px',
    color: '#c8a96e',
  },
  muted: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 12,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.5)',
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
    letterSpacing: '0.08em',
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
  const [organizerProfile, setOrganizerProfile] = useState(null)

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

  // « Événement consulté » → journal LOCAL des recommandations (jamais envoyé
  // au serveur ; no-op si la personnalisation est désactivée dans Confidentialité).
  useEffect(() => {
    if (!event?.id || !user?.uid) return
    import('../utils/recommendations').then(({ recordEventView }) => recordEventView(user, event)).catch(() => {})
  }, [event?.id, user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ownerUid = event?.organizerId || event?.createdBy
    if (!ownerUid) { setOrganizerProfile(null); return }
    let stop = () => {}
    import('../utils/firestore-sync').then(({ listenOrganizerProfiles }) => {
      stop = listenOrganizerProfiles(items => {
        setOrganizerProfile(items.find(profile => profile.id === ownerUid || profile.userId === ownerUid) || null)
      })
    }).catch(() => {})
    return () => stop()
  }, [event?.organizerId, event?.createdBy])

  const hasPlaylist = !!event?.playlist
  const TABS = ['Réservation', ...(hasPlaylist ? ['Playlist'] : []), 'Info']

  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab')
    return t && TABS.includes(t) ? t : 'Réservation'
  })
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [djPlaylistView, setDjPlaylistView] = useState('dj') // organisateur/agent : 'dj' | 'participant'
  // Rôle staff RÉACTIF sur cet événement (pour débloquer le panneau DJ même au
  // cache froid). Un simple read localStorage au render n'est pas réactif : le
  // listener global de Layout ne re-render pas cette page.
  const [myStaffRole, setMyStaffRole] = useState(null)
  const [ticketQty, setTicketQty] = useState(1)
  const [bookingStep, setBookingStep] = useState('place') // 'place' | 'preorder' | 'confirmed'
  const [activePreorderTicket, setActivePreorderTicket] = useState(0)
  const [perTicketOrders, setPerTicketOrders] = useState([]) // [{ items: {itemName:qty}, shows: {} }]
  const [showInfoModal, setShowInfoModal] = useState(null) // { itemName, opt } — popup for requiresInfo
  const [showInfoInput, setShowInfoInput] = useState('')
  const [descModal, setDescModal] = useState(null) // item description to display
  const [photoGallery, setPhotoGallery] = useState(null) // { type, photos[], index } — aperçu photos d'une place
  const [includedModal, setIncludedModal] = useState(null) // { type, items[] } — détail des options incluses d'un billet
  const [bookedTickets, setBookedTickets] = useState([]) // tickets for the LAST confirmed booking
  const [allBookedThisSession, setAllBookedThisSession] = useState([]) // { place, tickets, preorderSummary, totalPrice }
  const [showShareModal, setShowShareModal] = useState(false)
  const [extShareMsg, setExtShareMsg] = useState('')
  const [storyGenerating, setStoryGenerating] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  // Garde de réentrance pour la réservation gratuite (anti double-clic / multi-onglet,
  // sinon double création de billets). Le chemin payant est déjà
  // protégé par stripeRedirecting.
  const freeBookingLockRef = useRef(false)
  const [stripeRedirecting, setStripeRedirecting] = useState(false)
  const [stripeError, setStripeError] = useState('')
  const [insufficientFunds] = useState(false) // legacy — vérification gérée côté Stripe
  const [conflictBooking, setConflictBooking] = useState(null)
  const [showConflictModal, setShowConflictModal] = useState(false)
  const [conflictProceedFn, setConflictProceedFn] = useState(null)
  const [eventStartedError, setEventStartedError] = useState(false)
  const [groupLimitError, setGroupLimitError] = useState('') // règle « 1 place de groupe par compte »
  // ── Code promo (modèle Shotgun) : saisi ici, VALIDÉ et APPLIQUÉ côté serveur
  // (action 'validate_promo' d'api/event-stock pour l'affichage, puis
  // api/checkout / api/fedapay pour le prix réellement payé).
  const [promoInput, setPromoInput] = useState('')
  const [promoOpen, setPromoOpen] = useState(false)
  const [promoApplied, setPromoApplied] = useState(null) // { code, label, unitDiscount, currency }
  const [promoError, setPromoError] = useState('')
  const [promoBusy, setPromoBusy] = useState(false)
  // La réduction est calculée sur le prix de LA place sélectionnée → changer de
  // place invalide le code appliqué (il sera re-vérifié sur la nouvelle place).
  useEffect(() => { setPromoApplied(null); setPromoError(''); setPromoInput(''); setPromoOpen(false) }, [selectedPlace])
  const [showAgeModal, setShowAgeModal] = useState(false)
  const [ageVerified, setAgeVerified] = useState(false)
  const [playlistTabBlink, setPlaylistTabBlink] = useState(false)

  // Abonnement staff réactif → myStaffRole pour CET événement (débloque le
  // panneau DJ même quand la fiche est ouverte au cache froid, ex. deep-link
  // « Gérer la playlist » depuis Mes soirées sur un appareil neuf).
  useEffect(() => {
    const uid = getUserId(user)
    if (!uid || !event?.id) return
    let unsub = () => {}
    import('../utils/eventOrders').then(({ listenMyStaffAssignments }) => {
      unsub = listenMyStaffAssignments(uid, list => {
        const mine = (list || []).find(a => String(a.eventId) === String(event.id))
        setMyStaffRole(mine?.role || null)
      })
    }).catch(() => {})
    return () => { try { unsub() } catch {} }
  }, [user, event?.id])

  // Deep-link ?tab=Playlist : l'onglet Playlist n'existe qu'une fois l'event
  // résolu (hasPlaylist). Au cache froid, l'initialiseur d'activeTab s'exécute
  // avec event=null → param ignoré. On le ré-applique dès que l'onglet devient
  // valide, une seule fois, sans écraser un choix manuel de l'utilisateur.
  const tabParamAppliedRef = useRef(false)
  useEffect(() => {
    if (tabParamAppliedRef.current) return
    const t = searchParams.get('tab')
    if (t && TABS.includes(t)) {
      tabParamAppliedRef.current = true
      setActiveTab(cur => cur === 'Réservation' ? t : cur)
    }
  }, [hasPlaylist]) // eslint-disable-line react-hooks/exhaustive-deps

  // Loading state — squelette de la fiche pendant le fetch Firestore (cas client
  // cross-device). Plus pro qu'un spinner : la structure de la page est déjà là.
  if (eventLoading) {
    return (
      <Layout hideNav>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 0 40px' }}>
          <Skeleton w="100%" h={0} r={0} style={{ aspectRatio: '16 / 10', height: 'auto' }} />
          <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Skeleton w="70%" h={26} />
            <div style={{ display: 'flex', gap: 10 }}>
              <Skeleton w={110} h={30} r={999} />
              <Skeleton w={90} h={30} r={999} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Skeleton w={120} h={40} r={12} />
              <Skeleton w={90} h={40} r={12} />
            </div>
            <div style={{ marginTop: 10 }}><SkeletonText lines={4} /></div>
            <Skeleton w="100%" h={56} r={14} style={{ marginTop: 8 }} />
          </div>
        </div>
      </Layout>
    )
  }

  if (!event) {
    return (
      <Layout>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LockIcon size={30} color="rgba(255,255,255,0.4)" />
          </div>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', margin: 0 }}>
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
  // Borne la quantité sélectionnable : stock dispo ET plafond par compte (si défini).
  // Place GRATUITE (prix 0) = 1 par compte (règle appliquée aussi côté serveur dans
  // api/event-stock 'reserve') → on cape le sélecteur à 1 pour que l'UX colle.
  const maxQtyForSelectedPlace = Math.max(1, Math.min(
    selectedPlaceObj?.available ?? 1,
    maxPerAccount > 0 ? maxPerAccount : Infinity,
    (Number(selectedPlaceObj?.price) || 0) === 0 ? 1 : Infinity,
  ))

  const placePrice = selectedPlaceObj?.price || 0
  // Devise de l'événement : XOF (FCFA — FedaPay) au Togo/Bénin, EUR (Stripe) sinon.
  const evCur = eventCurrency(event)
  const curTicketOrder = perTicketOrders[activePreorderTicket] || { items: {}, shows: {} }
  const preorderTotal = perTicketOrders.reduce((total, t) =>
    total + activeMenu.reduce((sum, item) => sum + (t.items[item.name] || 0) * item.price, 0), 0)
  // Place price × qty + preorder total (preorderTotal already sums all tickets)
  // Réduction promo (par billet, validée serveur) DÉDUITE du total : tout ce qui
  // affiche grandTotal (bouton Payer, modal, totalPrice stocké sur la résa) doit
  // montrer ce que Stripe/FedaPay débitera réellement. Jamais 0 : les codes 100 %
  // sont refusés à la création ET au checkout.
  const promoDiscountTotal = promoApplied
    ? Math.min(placePrice * ticketQty, (promoApplied.unitDiscount / (evCur === 'XOF' ? 1 : 100)) * ticketQty)
    : 0
  const grandTotal = Math.max(0, placePrice * ticketQty - promoDiscountTotal) + preorderTotal
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
    if (event.closingDate) {
      return new Date(event.closingDate).getTime() < now
    }
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

  // RÈGLE « 1 place de groupe par compte et par événement » — vérif LOCALE
  // (l'autorité reste le serveur : /api/checkout et /api/fedapay refusent en 409).
  // Lié = hôte d'une table (tous ses sièges portent tableId + userId=lui) OU
  // membre (copie de siège attribuée, tableId + assignedByHost).
  function findMyGroupTie() {
    try {
      const uid = getUserId(user)
      const bookings = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      return bookings.find(b =>
        b.userId === uid && String(b.eventId) === String(event.id) && b.tableId && !b.revoked
      ) || null
    } catch { return null }
  }

  // ── Code promo : vérification serveur (jamais de liste de codes côté client).
  // La réduction affichée vient du PRIX SERVEUR de la place — identique à ce que
  // le checkout appliquera. Changer de place invalide le code appliqué (le
  // montant de la réduction dépend de la place).
  async function applyPromo() {
    const code = promoInput.trim()
    if (!code) return
    if (!user) { openAuthModal('Connecte-toi pour utiliser un code promo.'); return }
    setPromoBusy(true); setPromoError('')
    try {
      const { authHeaders } = await import('../utils/apiAuth')
      const r = await fetch('/api/event-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        // qty = utilisations demandées (table = 1) → la validation reflète le
        // plafond par quantité du code, comme le fera le checkout (#69).
        body: JSON.stringify({ action: 'validate_promo', eventId: event.id, code, placeType: selectedPlace, qty: isGroupPlace ? 1 : ticketQty }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Vérification impossible')
      if (!data.valid) { setPromoApplied(null); setPromoError(data.message || 'Code promo invalide.') }
      else { setPromoApplied(data); setPromoInput(''); setPromoOpen(false) }
    } catch (e) {
      setPromoError(e.message || 'Vérification impossible — réessaye.')
    }
    setPromoBusy(false)
  }

  // Ouvre le résumé/paiement — mais affiche D'ABORD l'avertissement d'âge si
  // l'événement est 18+ et pas encore acquitté. But : que « Payer » n'apparaisse
  // qu'UNE SEULE fois. Avant, l'avertissement s'intercalait APRÈS un premier clic
  // sur Payer, puis renvoyait sur le paiement → impression de double débit.
  function openConfirm() {
    // Place de groupe : blocage AVANT tout tunnel si l'utilisateur est déjà lié
    // à une place de groupe (achetée ou reçue) pour cet événement.
    if (isGroupPlace) {
      const tie = findMyGroupTie()
      if (tie) {
        setGroupLimitError(
          tie.assignedByHost
            ? `Une place t'a déjà été attribuée dans une place de groupe pour cet événement (${tie.place || 'place de groupe'}). Une seule place de groupe par compte et par événement.`
            : `Tu as déjà réservé une place de groupe pour cet événement (${tie.place || 'place de groupe'}). Une seule place de groupe par compte et par événement.`
        )
        return
      }
    }
    setGroupLimitError('')
    if ((event.minAge || 0) >= 18 && !ageVerified) {
      setShowAgeModal(true)
      return
    }
    setShowConfirmModal(true)
  }

  async function confirmBooking() {
    const uid = getUserId(user)
    // NB : la restriction d'âge est acquittée AVANT ce point (openConfirm →
    // AgeVerificationModal → confirm modal). Plus de check ici, sinon on
    // ré-intercalerait une modal après le clic « Payer » (double clic).
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

    // ─── TABLE GRATUITE INTERDITE ────────────────────────────────────────
    // Une table (place de groupe) se vend ENTIÈRE via le tunnel payant qui émet
    // tous les sièges. Une table à 0 tomberait dans le flux « billet gratuit »
    // qui ne créerait qu'UN billet normal (table cassée). On la bloque proprement.
    if (isGroupPlace && grandTotal <= 0) {
      setStripeError("Cette table n'a pas de tarif. Contacte l'organisateur — une table de groupe doit avoir un prix.")
      setShowConfirmModal(true)
      return
    }

    // ─── ÉVÉNEMENT PAYANT — Stripe Checkout (EUR) ou FedaPay (FCFA) ───────
    if (grandTotal > 0) {
      // Construire un id de réservation persistant (rapproche pending ↔ session de paiement)
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
        // Prix PAYÉ par billet (code promo déduit) : les billets réhydratés à
        // /paiement-reussi portent le prix réel, aligné sur le webhook.
        unitPriceEUR: promoApplied
          ? Math.max(0, placePrice - promoApplied.unitDiscount / (evCur === 'XOF' ? 1 : 100))
          : placePrice,
        ...(promoApplied ? { promoCode: promoApplied.code } : {}),
        currency: evCur, // XOF (FedaPay) ou EUR (Stripe) — réhydraté à /paiement-reussi
        isTable: isGroupPlace, // table entière → le webhook émet tous les sièges
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
      const result = await startTicketCheckout({
        eventId: event.id,
        eventName: event.name,
        eventImage: event.imageUrl,
        placeType: selectedPlace,
        qty: ticketQty,
        unitPriceEUR: placePrice, // prix PLEIN — le serveur applique le code lui-même
        currency: evCur,
        isTable: isGroupPlace,
        preorderItems,
        userId: uid,
        userEmail: user?.email,
        userName: user?.name,
        bookingId,
        // Code promo : le serveur re-valide et applique la réduction sur SON prix
        ...(promoApplied ? { promoCode: promoApplied.code } : {}),
      })

      if (!result.ok) {
        setStripeRedirecting(false)
        setStripeError(result.error || 'Erreur de paiement — réessaye dans un instant.')
        // Cleanup pending si erreur
        try { localStorage.removeItem(`lib_pending_booking_${bookingId}`) } catch {}
      }
      // Si ok : window.location.href a déjà été déclenché → on attend la redirection
      return
    }

    // ─── ÉVÉNEMENT GRATUIT — création directe (pas de paiement) ──────────
    // Garde anti double-exécution : un 2e clic rapide créerait des billets
    // en double.
    if (freeBookingLockRef.current) return
    freeBookingLockRef.current = true

    // Décrément atomique du stock AVANT de créer les billets — empêche la survente
    // si un autre acheteur réserve la dernière place au même moment. Passe par un
    // endpoint serveur (Admin SDK) car les règles Firestore n'autorisent que
    // l'organisateur à écrire dans events/{id} — pas un acheteur quelconque.
    let stockReserved = false
    try {
      const { authHeaders } = await import('../utils/apiAuth')
      const stockRes = await fetch('/api/event-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
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
      import('../utils/firestore-sync').then(({ syncDoc, syncMyBookings }) => {
        const myBookings = allBookings.filter(b => b.userId === uid)
        // syncMyBookings (transactionnel) — JAMAIS d'overwrite brut du carnet :
        // les sièges de table côté serveur (webhook/api-tickets) sont préservés.
        if (myBookings.length) syncMyBookings(uid, myBookings)
        // Registre anti-fraude tickets/{code} — le scanner vérifie l'existence
        // réelle du billet ici (les règles n'autorisent que paid:false côté client)
        for (const b of newBookings) {
          syncDoc(`tickets/${b.ticketCode}`, {
            ticketCode: b.ticketCode,
            eventId: b.eventId,
            eventName: b.eventName,
            place: b.place,
            // Prix payé figé (0 pour un billet gratuit) — les stats lisent ce champ
            placePrice: b.placePrice != null ? Number(b.placePrice) : 0,
            userId: uid,
            paid: false,
            source: 'free',
            bookedAt: b.bookedAt,
          })
        }
      }).catch(() => {})

      setBookedTickets(newTickets)
      // Points de fidélité : AUCUN à la réservation. Le point (+1/billet) se
      // gagne au scan à l'entrée — action 'checkin' d'api/tickets.js.
      // Notifier l'organisateur de la réservation gratuite (engagement).
      // Passe par un endpoint serveur car les règles Firestore interdisent à un
      // client d'écrire dans notifications/{organizerUid} (anti-spam). Les ventes
      // payées sont notifiées par le webhook Stripe. Fire-and-forget.
      const organizerUid = event.organizerId || event.createdBy
      if (organizerUid && organizerUid !== uid) {
        import('../utils/apiAuth').then(async ({ authHeaders }) => fetch('/api/event-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ action: 'notify', eventId: event.id, qty: ticketQty, placeType: selectedPlace, buyerId: uid }),
        })).catch(() => {})
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
        import('../utils/apiAuth').then(async ({ authHeaders }) => fetch('/api/event-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ eventId: event.id, placeType: selectedPlace, qty: ticketQty, action: 'release' }),
        })).catch(() => {})
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
      openAuthModal('Crée ton compte pour réserver ta place', action)
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
    setGroupLimitError('')
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

        {/* ── Fil d'ariane + retour ──────────────────────────────────────── */}
        <Breadcrumb
          style={{ padding: '10px 16px' }}
          items={[
            { label: 'Accueil', to: '/accueil' },
            { label: 'Événements', to: '/evenements' },
            ...(event.city ? [{ label: `Événements à ${event.city}`, to: '/evenements' }] : []),
            { label: event.name || 'Événement' },
          ]}
        />

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

          {/* Interest + share actions */}
          <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <EventInterestButton event={event} floating />
            <button
              onClick={() => setShowShareModal(true)}
              aria-label="Partager l'événement"
              style={{
                width: 34,
                height: 34,
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
          </div>

          {/* Title area */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 20px 20px' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {event.tags?.map((t) => (
                <span
                  key={t}
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    padding: '4px 10px',
                    borderRadius: 8,
                    color: event.accentColor,
                    border: `1px solid ${event.color}59`,
                    background: event.color + '22',
                  }}
                >
                  {t}
                </span>
              ))}
              {(event.minAge || 0) >= 16 && (
                <span style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  padding: '4px 10px',
                  border: '1px solid rgba(200,169,110,0.5)',
                  borderRadius: 8,
                  color: '#c8a96e',
                  background: 'rgba(200,169,110,0.14)',
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
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
                {event.subtitle}
              </p>
            )}
            {/* ── Badges de statut ── */}
            {isEventCancelled && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.4)', borderRadius: 8, padding: '4px 10px', marginTop: 8 }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(220,110,110,0.95)', textTransform: 'uppercase' }}>● Événement annulé</span>
              </div>
            )}
            {!isEventCancelled && isEventSoldOut && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.35)', borderRadius: 8, padding: '4px 10px', marginTop: 8 }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(220,120,120,0.95)', textTransform: 'uppercase' }}>● Complet</span>
              </div>
            )}
            {!isEventCancelled && !isEventSoldOut && isEventClosed && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '4px 10px', marginTop: 8 }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>● Réservations closes</span>
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
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: countdownUrgent ? '#e05aaa' : '#4ee8c8' }} />
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
              0%, 100% { color: rgba(255,255,255,0.3); border-bottom-color: transparent; }
              50% { color: #e05aaa; border-bottom-color: #e05aaa; }
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
                background: activeTab === tab ? 'rgba(255,255,255,0.10)' : 'transparent',
                border: activeTab === tab ? '1px solid rgba(255,255,255,0.14)' : '1px solid transparent',
                borderRadius: 10,
                color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.6)',
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
        <div key={activeTab} className="lib-tab-content" style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

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
                          {soldCount} {soldCount > 1 ? 'personnes y vont' : 'personne y va'}
                        </span>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>{fillPct}% rempli</span>
                      </div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 99, width: `${fillPct}%`, background: fillPct >= 80 ? '#c8a96e' : '#4ee8c8', transition: 'width 0.5s' }} />
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
                        onClick={() => { setSelectedPlace(place.type === selectedPlace ? null : place.type); setTicketQty(1); setGroupLimitError('') }}
                        className="lib-press"
                        style={{
                          position: 'relative', display: 'flex', cursor: 'pointer',
                          borderRadius: 16, overflow: 'hidden',
                          border: `1px solid ${isSelected ? 'rgba(200,169,110,0.6)' : 'rgba(255,255,255,0.10)'}`,
                          background: '#0e0f16',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
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

                          {/* Aperçu photos + options incluses (fournis par l'organisateur) */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
                            {Array.isArray(place.included) && place.included.length > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setIncludedModal({ type: place.type, items: place.included }) }}
                                className="lib-press"
                                style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 9, background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.38)', color: '#c8a96e', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v8H4v-8"/><path d="M2 7h20v5H2z"/><path d="M12 7v13"/><path d="M12 7c-1.5 0-4-.5-4-3 0-2 3-2 4 3Z"/><path d="M12 7c1.5 0 4-.5 4-3 0-2-3-2-4 3Z"/></svg>
                                Voir ce qui est inclus
                                <span style={{ opacity: 0.7, fontWeight: 500 }}>· {place.included.length}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Perforation + talon de prix (l'aspect « vrai billet ») */}
                        <div style={{ position: 'relative', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 18px', borderLeft: '2px dashed rgba(255,255,255,0.16)' }}>
                          {/* encoches cut-out haut/bas */}
                          <span style={{ position: 'absolute', top: -8, left: -8, width: 16, height: 16, borderRadius: '50%', background: '#04040b' }} />
                          <span style={{ position: 'absolute', bottom: -8, left: -8, width: 16, height: 16, borderRadius: '50%', background: '#04040b' }} />
                          <p style={{ ...S.price, fontSize: 26, margin: 0, lineHeight: 1 }}>{fmtMoney(place.price, evCur)}</p>
                          {isSelected
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, color: '#c8a96e' }}><CheckIcon size={11} color="#c8a96e" /> Choisi</span>
                            : <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>Choisir</span>}
                        </div>
                      </div>
                    )
                  })}

                  {eventStartedError && (
                    <div style={{ background: 'rgba(220,50,50,0.10)', border: '1px solid rgba(220,50,50,0.30)', borderRadius: 12, padding: '12px 14px' }}>
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: 'rgba(255,150,150,0.95)', margin: '0 0 2px' }}>
                        Réservation impossible
                      </p>
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
                        Cet événement a déjà commencé.
                      </p>
                    </div>
                  )}

                  {groupLimitError && (
                    <div style={{ background: 'rgba(200,169,110,0.07)', border: '1px solid rgba(200,169,110,0.35)', borderRadius: 10, padding: '13px 15px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <GroupIcon size={16} color="#c8a96e" />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 700, color: '#c8a96e', margin: '0 0 3px' }}>
                          Place de groupe déjà réservée
                        </p>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.55 }}>
                          {groupLimitError}
                        </p>
                      </div>
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
                                  width: 28, height: 28, borderRadius: 8,
                                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
                                  cursor: ticketQty <= 1 ? 'not-allowed' : 'pointer', opacity: ticketQty <= 1 ? 0.4 : 1,
                                }}
                              >−</button>
                              <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 15, color: '#c8a96e', width: 18, textAlign: 'center' }}>
                                {ticketQty}
                              </span>
                              <button
                                onClick={() => setTicketQty(q => Math.min(maxQtyForSelectedPlace, q + 1))}
                                disabled={ticketQty >= maxQtyForSelectedPlace}
                                style={{
                                  width: 28, height: 28, borderRadius: 8,
                                  background: ticketQty >= maxQtyForSelectedPlace ? 'rgba(255,255,255,0.07)' : '#c8a96e',
                                  border: 'none',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 700,
                                  color: ticketQty >= maxQtyForSelectedPlace ? 'rgba(255,255,255,0.35)' : '#1a1206',
                                  cursor: ticketQty >= maxQtyForSelectedPlace ? 'not-allowed' : 'pointer',
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
                            {isAuctionPlace ? (currentAuctionPrice > 0 ? 'Enchère actuelle' : 'Prix de base') : ticketQty > 1 ? `Prix (${fmtMoney(placePrice, evCur)} × ${ticketQty})` : 'Prix'}
                          </span>
                          <span style={{ ...S.price, fontSize: 20, ...(promoApplied ? { textDecoration: 'line-through', opacity: 0.45, fontSize: 15 } : {}) }}>
                            {fmtMoney(isAuctionPlace ? (currentAuctionPrice > 0 ? currentAuctionPrice : placePrice) : placePrice * ticketQty, evCur)}
                          </span>
                        </div>
                        {/* ── Code promo (modèle Shotgun) — validation serveur, prix final serveur ── */}
                        {!isAuctionPlace && placePrice > 0 && (promoApplied ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ ...S.rowLabel, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              Code {promoApplied.code} ({promoApplied.label})
                              <button onClick={() => { setPromoApplied(null); setPromoError('') }} style={{ background: 'none', border: 'none', color: 'rgba(224,90,170,0.85)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, padding: 0 }}>Retirer</button>
                            </span>
                            <span style={{ ...S.price, fontSize: 20, color: '#4ee8c8' }}>
                              {fmtMoney(Math.max(0, (placePrice - promoApplied.unitDiscount / (evCur === 'XOF' ? 1 : 100)) * ticketQty), evCur)}
                            </span>
                          </div>
                        ) : promoOpen ? (
                          <div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input
                                value={promoInput}
                                onChange={e => { setPromoInput(e.target.value.toUpperCase()); setPromoError('') }}
                                onKeyDown={e => { if (e.key === 'Enter') applyPromo() }}
                                placeholder="TON CODE"
                                autoFocus
                                style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 9, border: `1px solid ${promoError ? 'rgba(224,90,170,0.55)' : 'rgba(255,255,255,0.14)'}`, background: '#0b0c12', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, letterSpacing: '0.06em', outline: 'none', textTransform: 'uppercase' }}
                              />
                              <button onClick={applyPromo} disabled={promoBusy || !promoInput.trim()} style={{ padding: '10px 16px', borderRadius: 9, border: 'none', background: promoBusy || !promoInput.trim() ? 'rgba(255,255,255,0.08)' : '#3ed6b5', color: promoBusy || !promoInput.trim() ? 'rgba(255,255,255,0.35)' : '#04120e', fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 700, cursor: promoBusy ? 'wait' : 'pointer' }}>
                                {promoBusy ? '…' : 'Appliquer'}
                              </button>
                            </div>
                            {promoError && <p style={{ margin: '7px 0 0', color: '#ff9ed2', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>{promoError}</p>}
                          </div>
                        ) : (
                          <button onClick={() => setPromoOpen(true)} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', color: 'rgba(255,255,255,0.55)', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24H4a2 2 0 0 0-2 2v5.59c0 .53.21 1.04.59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l5.59-5.59a2 2 0 0 0 0-2.83z"/><circle cx="7.5" cy="8.5" r="1"/></svg>
                            Ajouter un code promo
                          </button>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={S.rowLabel}>Points fidélité</span>
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: '#c8a96e' }}>+1 par billet scanné à l'entrée</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8 }}>
                          <span style={S.rowLabel}>Paiement</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Inter, sans-serif', fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            {grandTotal > 0 ? (evCur === 'XOF' ? 'Sécurisé · Mobile Money' : 'Sécurisé · Stripe') : 'Gratuit'}
                          </span>
                        </div>
                      </div>

                      {/* CTA — non connecté : ouvre le modal auth puis continue */}
                      {event.preorder ? (
                        <button
                          style={{
                            ...S.btnGold,
                            ...((user && !userCanBook) ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', boxShadow: 'none' } : {}),
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
                          Continuer
                        </button>
                      ) : isGroupPlace ? (
                        <button
                          style={{
                            ...S.btnCheckout,
                            ...((user && !userCanBook) || bookingDisabled ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', boxShadow: 'none' } : {}),
                            cursor: (user && !userCanBook) || bookingDisabled ? 'not-allowed' : 'pointer',
                            pointerEvents: (user && !userCanBook) || bookingDisabled ? 'none' : 'auto',
                          }}
                          disabled={(user && !userCanBook) || bookingDisabled}
                          onClick={() => !bookingDisabled && requireUserThenDo(() => tryProceed(() => openConfirm()))}
                        >
                          {isEventCancelled || isEventSoldOut || isEventClosed ? (
                            isEventCancelled ? 'Événement annulé' : isEventSoldOut ? 'Complet' : 'Réservations closes'
                          ) : (
                            <>
                              <GroupIcon size={16} color="#1a1206" />
                              {placePrice > 0 ? `Réserver la table · ${fmtMoney(placePrice, evCur)}` : 'Réserver la table'}
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          style={{
                            ...S.btnCheckout,
                            ...((user && !userCanBook) || bookingDisabled ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', boxShadow: 'none' } : {}),
                            cursor: (user && !userCanBook) || bookingDisabled ? 'not-allowed' : 'pointer',
                            pointerEvents: (user && !userCanBook) || bookingDisabled ? 'none' : 'auto',
                          }}
                          disabled={(user && !userCanBook) || bookingDisabled}
                          onClick={() => !bookingDisabled && requireUserThenDo(() => tryProceed(() => openConfirm()))}
                        >
                          {isEventCancelled || isEventSoldOut || isEventClosed ? (
                            isEventCancelled ? 'Événement annulé' : isEventSoldOut ? 'Complet' : 'Réservations closes'
                          ) : (() => {
                            const amount = isAuctionPlace ? (currentAuctionPrice > 0 ? currentAuctionPrice : placePrice) : placePrice * ticketQty
                            return (<>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1a1206" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              {amount > 0 ? `Réserver · ${fmtMoney(amount, evCur)}` : 'Réserver — Gratuit'}
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
                            background: 'rgba(78,232,200,0.07)',
                            border: '1px solid rgba(78,232,200,0.25)',
                            borderRadius: 10,
                          }}
                        >
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'white' }}>{b.place}</span>
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#4ee8c8' }}>
                            {b.tickets.length} billet{b.tickets.length > 1 ? 's' : ''} · {fmtMoney(b.totalPrice, evCur)}
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
                            padding: '7px 14px',
                            borderRadius: 10,
                            border: activePreorderTicket === i ? '1px solid rgba(200,169,110,0.55)' : '1px solid rgba(255,255,255,0.12)',
                            background: activePreorderTicket === i ? 'rgba(200,169,110,0.16)' : 'rgba(255,255,255,0.05)',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: 12,
                            fontWeight: 600,
                            color: activePreorderTicket === i ? '#c8a96e' : 'rgba(255,255,255,0.55)',
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
                                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>
                                    {item.name.slice(0, 2).toUpperCase()}
                                  </span>
                                </div>
                              )}
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 16, color: 'white', margin: 0 }}>
                                    {item.name}
                                  </p>
                                  {item.description && (
                                    <button
                                      onClick={() => setDescModal(item)}
                                      style={{
                                        width: 16,
                                        height: 16,
                                        borderRadius: '50%',
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.14)',
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize: 10,
                                        fontWeight: 700,
                                        color: 'rgba(255,255,255,0.55)',
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 8, background: 'rgba(224,90,170,0.12)', border: '1px solid rgba(224,90,170,0.35)' }}>
                                      <SparkleIcon size={9} color="#e05aaa" />
                                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, color: '#e05aaa', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Show</span>
                                    </div>
                                  )}
                                </div>
                                <p style={{ ...S.price, fontSize: 14, margin: '3px 0 0' }}>{fmtMoney(item.price, evCur)}</p>
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
                                  borderRadius: 8,
                                  background: 'rgba(255,255,255,0.08)',
                                  border: '1px solid rgba(255,255,255,0.14)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontFamily: 'Inter, sans-serif',
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: 'rgba(255,255,255,0.7)',
                                  cursor: qty === 0 ? 'not-allowed' : 'pointer',
                                  opacity: qty === 0 ? 0.4 : 1,
                                }}
                              >−</button>
                              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700, color: qty > 0 ? '#c8a96e' : 'rgba(255,255,255,0.4)', width: 16, textAlign: 'center' }}>
                                {qty}
                              </span>
                              <button
                                onClick={() => updatePreorder(item.name, 1)}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 8,
                                  background: '#c8a96e',
                                  border: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontFamily: 'Inter, sans-serif',
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: '#1a1206',
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
                                      padding: '7px 12px',
                                      borderRadius: 10,
                                      border: showSel?.showOptionId === opt.id
                                        ? '1px solid rgba(200,169,110,0.55)'
                                        : '1px solid rgba(255,255,255,0.14)',
                                      background: showSel?.showOptionId === opt.id
                                        ? 'rgba(200,169,110,0.16)'
                                        : 'rgba(255,255,255,0.06)',
                                      fontFamily: 'Inter, sans-serif',
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: showSel?.showOptionId === opt.id ? '#c8a96e' : 'rgba(255,255,255,0.65)',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s',
                                    }}
                                  >
                                    {opt.label}
                                    {opt.requiresInfo && showSel?.showOptionId !== opt.id ? ' · à préciser' : ''}
                                  </button>
                                ))}
                                {showSel && (
                                  <button
                                    onClick={() => setPerTicketOrders(prev => prev.map((t, i) => {
                                      if (i !== activePreorderTicket) return t
                                      const s = { ...t.shows }; delete s[item.name]; return { ...t, shows: s }
                                    }))}
                                    style={{
                                      padding: '7px 12px',
                                      borderRadius: 10,
                                      border: '1px solid rgba(224,90,170,0.4)',
                                      background: 'rgba(224,90,170,0.12)',
                                      fontFamily: 'Inter, sans-serif',
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: '#e88bc4',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Sans show
                                  </button>
                                )}
                              </div>
                              {showSel?.showInfo && (
                                <p style={{ ...S.muted, fontSize: 11.5, paddingLeft: 4 }}>Info transmise : {showSel.showInfo}</p>
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
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'white' }}>{fmtMoney(placePrice * ticketQty, evCur)}</span>
                    </div>
                    {perTicketOrders.map((t, n) => {
                      const ticketItems = activeMenu.filter(i => (t.items[i.name] || 0) > 0)
                      if (ticketItems.length === 0) return null
                      return (
                        <div key={n} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {perTicketOrders.length > 1 && (
                            <span style={{ ...S.muted, fontSize: 11, fontWeight: 700, color: '#c8a96e' }}>Billet {n + 1}</span>
                          )}
                          {ticketItems.map(i => (
                            <div key={i.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={S.muted}>{i.name} ×{t.items[i.name]}</span>
                              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}>{fmtMoney(i.price * t.items[i.name], evCur)}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 8, marginTop: 4 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13.5, fontWeight: 700, color: 'white' }}>Total</span>
                      <span style={{ ...S.price, fontSize: 22 }}>{fmtMoney(grandTotal, evCur)}</span>
                    </div>
                  </div>

                  {isGroupPlace ? (
                    <button
                      style={{ ...S.btnGold, ...(!userCanBook ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', boxShadow: 'none' } : {}), cursor: !userCanBook ? 'not-allowed' : 'pointer', pointerEvents: !userCanBook ? 'none' : 'auto' }}
                      disabled={!userCanBook}
                      onClick={() => openConfirm()}
                    >
                      <GroupIcon size={16} color={!userCanBook ? 'rgba(255,255,255,0.35)' : '#1a1206'} />
                      {`Réserver la table — ${fmtMoney(grandTotal, evCur)}`}
                    </button>
                  ) : (
                    <>
                      <button
                        style={{ ...S.btnGold, ...(!userCanBook ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', boxShadow: 'none' } : {}), cursor: !userCanBook ? 'not-allowed' : 'pointer', pointerEvents: !userCanBook ? 'none' : 'auto' }}
                        disabled={!userCanBook}
                        onClick={() => openConfirm()}
                      >
                        {preorderTotal > 0 ? `Confirmer la commande — ${fmtMoney(grandTotal, evCur)}` : 'Confirmer la réservation'}
                      </button>
                      {preorderTotal > 0 && (
                        <button
                          onClick={() => openConfirm()}
                          disabled={!userCanBook}
                          style={{ ...S.btnGhost, width: '100%', padding: '12px', ...(!userCanBook ? { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.06)' } : {}), cursor: !userCanBook ? 'not-allowed' : 'pointer', pointerEvents: !userCanBook ? 'none' : 'auto' }}
                        >
                          Réserver sans précommande
                        </button>
                      )}
                    </>
                  )}

                  {groupLimitError && (
                    <div style={{ background: 'rgba(200,169,110,0.07)', border: '1px solid rgba(200,169,110,0.35)', borderRadius: 10, padding: '13px 15px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <GroupIcon size={16} color="#c8a96e" />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 700, color: '#c8a96e', margin: '0 0 3px' }}>
                          Place de groupe déjà réservée
                        </p>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.55 }}>
                          {groupLimitError}
                        </p>
                      </div>
                    </div>
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
          {activeTab === 'Playlist' && (() => {
            const ownerUid = event.organizerId || event.createdBy
            const myUid = user?.uid || getUserId(user)
            const isOwnerOrAgent = (ownerUid && (ownerUid === myUid || ownerUid === getUserId(user))) || user?.role === 'agent'
            // Membre d'équipe rôle DJ (ou manager invité) : même panneau que
            // l'organisateur. myStaffRole vient d'un listener réactif (state) —
            // pas d'un read localStorage au render, qui restait périmé au cache froid.
            const canManagePlaylist = isOwnerOrAgent || canDJStaff(myStaffRole)
            const hasBooking = allBookedThisSession.length > 0 || (() => { try { const all = JSON.parse(localStorage.getItem('lib_bookings') || '[]'); return all.some(b => String(b.eventId) === String(event.id) && b.userId === (user?.uid || getUserId(user))) } catch { return false } })()
            if (!canManagePlaylist) return <PlaylistSystem event={event} booked={hasBooking} />
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Bascule DJ / vue participant (organisateur, agent & DJ invité) */}
                <div style={{ display: 'flex', gap: 6, padding: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, alignSelf: 'flex-start' }}>
                  {[['dj', 'Vue DJ'], ['participant', 'Vue participant']].map(([id, label]) => {
                    const active = (djPlaylistView || 'dj') === id
                    return (
                      <button key={id} onClick={() => setDjPlaylistView(id)} style={{
                        padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: active ? 800 : 600,
                        color: active ? '#04040b' : 'rgba(255,255,255,0.55)',
                        background: active ? 'linear-gradient(135deg,#c8a96e,#e0c48a)' : 'transparent',
                      }}>{label}</button>
                    )
                  })}
                </div>
                {(djPlaylistView || 'dj') === 'dj'
                  ? <PlaylistDJPanel event={event} />
                  : /* previewCheckedIn : l'équipe voit ce qu'un participant AVEC
                       billet scanné voit — sans ça, le champ d'ajout restait
                       invisible en test (gate « billet scanné requis »). */
                    <PlaylistSystem event={event} booked previewCheckedIn />}
              </div>
            )
          })()}

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
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            padding: '3px 9px',
                            borderRadius: 999,
                            background: 'rgba(200,169,110,0.12)',
                            border: '1px solid rgba(200,169,110,0.35)',
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
                    {organizerProfile?.avatarUrl
                      ? <img src={organizerProfile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : (organizerProfile?.publicName || event.organizerName || event.organizer || 'O')[0]}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 18, color: 'white', margin: 0 }}>
                      {organizerProfile?.publicName || event.organizerName || event.organizer || 'Organisateur'}
                    </p>
                  </div>
                  {organizerProfile && <button onClick={() => navigate(`/organisateurs/${organizerProfile.slug}`)} style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 10, border: 'none', background: '#3ed6b5', color: '#04120e', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Voir la page</button>}
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
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#4ee8c8', margin: 0 }}>À quoi ressemble ta place</p>
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

      {/* ── Options incluses dans un billet (détail) ────────────────────────── */}
      {includedModal && (
        <div
          onClick={() => setIncludedModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#12131c', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, padding: 22, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#c8a96e', margin: 0 }}>Inclus dans ce billet</p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 19, fontWeight: 800, color: '#fff', margin: '2px 0 0' }}>{includedModal.type}</p>
              </div>
              <button onClick={() => setIncludedModal(null)} aria-label="Fermer" style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 20, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* L'entrée elle-même, toujours incluse */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 11, border: '1px solid rgba(78,232,200,0.22)', background: 'rgba(78,232,200,0.05)' }}>
                <IconTicket size={17} color="#4ee8c8" />
                <span style={{ flex: 1, fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>1 entrée à la soirée</span>
                <span style={{ flexShrink: 0, fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#4ee8c8', padding: '4px 10px', borderRadius: 8, background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.35)' }}>INCLUS</span>
              </div>
              {includedModal.items.map((inc, k) => {
                const menuItem = (event.menu || []).find(m => m?.name === inc.name)
                return (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 11, border: '1px solid rgba(78,232,200,0.22)', background: 'rgba(78,232,200,0.05)' }}>
                    {menuItem?.emoji
                      ? <span style={{ fontSize: 17, flexShrink: 0 }}>{menuItem.emoji}</span>
                      : <IconCheck size={16} color="#4ee8c8" />}
                    <span style={{ flex: 1, minWidth: 0, fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                      {inc.qty > 1 ? `${inc.qty}× ` : '1× '}{inc.name}
                    </span>
                    <span style={{ flexShrink: 0, fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', padding: '4px 10px', borderRadius: 8, color: '#4ee8c8', background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.35)' }}>
                      INCLUS
                    </span>
                  </div>
                )
              })}
            </div>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.55, margin: 0 }}>
              Tes options te seront servies sur place : le staff les valide sur ton billet. Tu les retrouveras aussi dans « Mes billets » après l'achat.
            </p>
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
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.4)',
                }}>
                  {descModal.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 18, color: 'white', margin: 0 }}>
                  {descModal.name}
                </p>
                <p style={{ ...S.price, fontSize: 16 }}>{fmtMoney(descModal.price, evCur)}</p>
              </div>
            </div>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65 }}>
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
              background: '#12131c',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: '16px 16px 0 0',
              boxShadow: '0 -24px 64px rgba(0,0,0,0.55)',
              maxHeight: '60vh',
              display: 'flex',
              flexDirection: 'column',
              paddingBottom: 24,
            }}>
              <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: 40, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto 12px' }} />
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
                  Partager l'événement
                </p>
              </div>
              {/* Partage EXTERNE (hors app) : feuille native mobile + repli copier-lien */}
              <div style={{ padding: '14px 16px 4px' }}>
                <button
                  onClick={async () => {
                    const res = await shareOrCopy({
                      title: event.name,
                      text: `${event.name} — sur Live in Black`,
                      url: `${window.location.origin}/evenements/${event.id}`,
                    })
                    if (res.method === 'share') { setShowShareModal(false); return }
                    setExtShareMsg(res.method === 'copy' ? 'Lien copié' : 'Indisponible sur ce navigateur')
                    setTimeout(() => setExtShareMsg(''), 1800)
                  }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '13px 16px', borderRadius: 12, border: 'none', background: '#3ed6b5', color: '#04120e', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                  <ShareIcon size={15} color="#04120e" />
                  {extShareMsg || 'Partager le lien (WhatsApp, Insta…)'}
                </button>
                {/* Story 1080×1920 aux couleurs de l'événement — SANS QR ni info
                    sensible : juste l'affiche, la date et la hype (médiatisation). */}
                <button
                  onClick={async () => {
                    if (storyGenerating) return
                    setStoryGenerating(true)
                    try {
                      const { shareStory } = await import('../utils/storyImage')
                      const minP = event.places?.length > 0 ? Math.min(...event.places.map(p => p.price)) : null
                      const res = await shareStory({
                        kicker: 'Événement',
                        title: event.name,
                        chips: [event.dateDisplay, event.city || event.location, minP > 0 ? `dès ${fmtMoney(minP, evCur)}` : (minP === 0 ? 'Gratuit' : null)],
                        tagline: 'Rejoins-moi à cette soirée',
                        imageUrl: event.imageUrl || null,
                      })
                      if (res.method === 'share') { setShowShareModal(false) }
                      else if (res.method === 'download') { setExtShareMsg('Story téléchargée — prête à publier'); setTimeout(() => setExtShareMsg(''), 2500) }
                      else { setExtShareMsg('Génération impossible'); setTimeout(() => setExtShareMsg(''), 1800) }
                    } catch { setExtShareMsg('Génération impossible'); setTimeout(() => setExtShareMsg(''), 1800) }
                    setStoryGenerating(false)
                  }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '13px 16px', borderRadius: 12, marginTop: 10, border: '1px solid rgba(224,90,170,0.45)', background: 'rgba(224,90,170,0.14)', color: '#e88bc4', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, cursor: storyGenerating ? 'wait' : 'pointer' }}
                >
                  {storyGenerating
                    ? <span className="lib-spin" style={{ width: 14, height: 14, border: '2px solid rgba(224,90,170,0.3)', borderTopColor: '#e88bc4', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e88bc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="0.8" fill="#e88bc4"/></svg>}
                  {storyGenerating ? 'Création de la story…' : 'Partager en story'}
                </button>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.32)', textAlign: 'center', margin: '12px 0 2px' }}>
                  ou envoyer dans une conversation
                </p>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {convs.length === 0 ? (
                  <p style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)', padding: '40px 0' }}>
                    Aucune conversation pour l'instant
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
                        fontFamily: 'Inter, sans-serif',
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#c8a96e',
                      }}>
                        {isGroup ? <GroupIcon size={14} color="#c8a96e" /> : getInitials(otherName)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13.5, fontWeight: 600, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {otherName}
                        </p>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                          {formatTime(conv.updatedAt)}
                        </p>
                      </div>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 600, color: '#c8a96e', lineHeight: 1 }}>›</span>
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
            background: '#12131c',
            border: '1px solid rgba(245,158,11,0.35)',
            borderRadius: '16px 16px 0 0',
            boxShadow: '0 -24px 64px rgba(0,0,0,0.55)',
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
              <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 21, letterSpacing: '-0.4px', color: 'white', margin: 0 }}>
                Conflit de créneau
              </h3>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: 0 }}>
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
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.88)', margin: 0 }}>
                  {conflictBooking.eventName}
                </p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)', margin: '3px 0 0' }}>
                  {conflictBooking.eventDate} · {conflictBooking.eventStartTime} → {conflictBooking.eventEndTime}
                </p>
              </div>
            </div>

            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: 0 }}>
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
                  padding: '14px', borderRadius: 12, cursor: 'pointer',
                  background: '#f59e0b',
                  border: 'none',
                  fontFamily: 'Inter, sans-serif', fontSize: 14,
                  fontWeight: 700, color: '#1a1206',
                }}
              >
                Continuer quand même
              </button>
              <button
                onClick={() => setShowConflictModal(false)}
                style={{
                  padding: '12px', borderRadius: 12, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                  fontFamily: 'Inter, sans-serif', fontSize: 13,
                  fontWeight: 600, color: 'rgba(255,255,255,0.75)',
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
            background: '#12131c',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '16px 16px 0 0',
            boxShadow: '0 -24px 64px rgba(0,0,0,0.55)',
            padding: '20px 20px 36px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ width: 40, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto' }} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, paddingTop: 4 }}>
              <WarnIcon size={30} color="rgba(200,169,110,0.9)" />
              <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 23, letterSpacing: '-0.5px', color: 'white', margin: 0 }}>
                {grandTotal > 0 ? 'Procéder au paiement ?' : 'Confirmer la réservation ?'}
              </h3>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55, margin: 0 }}>
                Une fois confirmée, tu ne pourras{' '}
                <span style={{ color: '#fff', fontWeight: 600 }}>plus modifier</span>{' '}
                ta réservation.
              </p>
              {event.preorder && preorderTotal === 0 && (
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                  Tu pars sans précommande — tu pourras commander sur place.
                </p>
              )}
            </div>

            {/* Récap montant à payer */}
            {grandTotal > 0 && (
              <div style={{ background: 'rgba(78,232,200,0.06)', border: '1px solid rgba(78,232,200,0.20)', borderRadius: 14, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: '0 0 4px' }}>
                    Total à payer
                  </p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                    {ticketQty} {selectedPlace}{ticketQty > 1 ? 's' : ''}{preorderTotal > 0 ? ' + précommandes' : ''}
                  </p>
                  {promoApplied && (
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: '#4ee8c8', margin: '4px 0 0' }}>
                      Code {promoApplied.code} appliqué ({promoApplied.label})
                    </p>
                  )}
                </div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 30, fontWeight: 800, letterSpacing: '-1px', color: '#4ee8c8', margin: 0, whiteSpace: 'nowrap' }}>
                  {fmtMoney(grandTotal, evCur)}
                </p>
              </div>
            )}

            {/* Rappel restriction d'âge — reste visible dans le résumé avant de
                payer (l'avertissement détaillé a déjà été acquitté en amont). */}
            {(event.minAge || 0) >= 18 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(200,169,110,0.07)', border: '1px solid rgba(200,169,110,0.22)', borderRadius: 12, padding: '11px 14px' }}>
                <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(200,169,110,0.4)', background: 'rgba(200,169,110,0.10)', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: '#c8a96e' }}>
                  {event.minAge}+
                </span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                  Événement {event.minAge}+ · une pièce d'identité pourra être demandée à l'entrée.
                </span>
              </div>
            )}

            {/* Mention paiement sécurisé */}
            {grandTotal > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <IconLock size={12} color="rgba(255,255,255,0.4)" />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'rgba(255,255,255,0.42)', lineHeight: 1.5 }}>
                  {evCur === 'XOF'
                    ? 'Paiement sécurisé via FedaPay (Mixx by Yas, Moov, carte) — tu seras redirigé.'
                    : 'Paiement sécurisé via Stripe — tu seras redirigé.'}
                </span>
              </div>
            )}

            {stripeError && (
              <div style={{ background: 'rgba(220,50,50,0.10)', border: '1px solid rgba(220,50,50,0.30)', borderRadius: 12, padding: '12px 14px' }}>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,180,180,0.95)', margin: 0, lineHeight: 1.5 }}>
                  {stripeError}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                disabled={stripeRedirecting}
                onClick={() => { setStripeError(''); confirmBooking() }}
                style={{
                  padding: '16px', borderRadius: 14, border: 'none', width: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  fontFamily: 'Inter, sans-serif', fontSize: 15.5, fontWeight: 700, color: '#04040b',
                  background: 'linear-gradient(135deg,#c8a96e,#e0c48a)', boxShadow: '0 8px 26px rgba(200,169,110,0.32)',
                  opacity: stripeRedirecting ? 0.75 : 1, cursor: stripeRedirecting ? 'wait' : 'pointer',
                }}
              >
                {stripeRedirecting && <span className="lib-spin" style={{ width: 14, height: 14, border: '2px solid rgba(4,4,11,0.25)', borderTopColor: '#04040b', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />}
                {stripeRedirecting ? 'Redirection vers le paiement…' : grandTotal > 0 ? `Payer ${fmtMoney(grandTotal, evCur)}` : 'Oui, confirmer'}
              </button>
              <button
                onClick={() => { setShowConfirmModal(false); setStripeError('') }}
                disabled={stripeRedirecting}
                style={{
                  padding: '15px', borderRadius: 14, width: '100%', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)',
                  fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
                }}
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
              <h3 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 20, letterSpacing: '-0.3px', color: 'white', margin: 0 }}>
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
                onFocus={e => (e.target.style.borderColor = '#8444ff')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowInfoModal(null)} style={{ ...S.btnGhost, flex: 1 }}>Annuler</button>
              <button onClick={confirmShowInfo} style={{ ...S.btnGold, flex: 1, width: 'auto' }}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}

// ─── BookedCard ────────────────────────────────────────────────────────────────

function BookedCard({ event, selectedPlace, preorderSummary = [], preorderItems = {}, totalPrice, bookedTickets = [], onBookAnother }) {
  // Composant top-level : evCur du parent n'est PAS dans la portée ici.
  const evCur = eventCurrency(event)
  const [visibleQr, setVisibleQr] = useState(0)
  const ticket = bookedTickets[visibleQr] || bookedTickets[0] || {}
  const qrUrl = ticket.ticketToken ? `${window.location.origin}/ticket/${ticket.ticketToken}` : ''

  const S2 = {
    card: {
      background: '#0e0f16',
      border: '1px solid rgba(78,232,200,0.22)',
      borderRadius: 16,
      padding: '20px 16px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      textAlign: 'center',
    },
    label: {
      fontFamily: 'Inter, sans-serif',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.5)',
    },
  }

  return (
    <div style={S2.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 20, letterSpacing: '-0.4px', color: 'white', margin: 0 }}>
          Réservation confirmée
        </p>
      </div>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
        {selectedPlace} · {event.name}
      </p>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#4ee8c8', margin: 0 }}>
        +{bookedTickets.length} point{bookedTickets.length > 1 ? 's' : ''} fidélité au scan de {bookedTickets.length > 1 ? 'tes billets' : 'ton billet'} à l'entrée
      </p>

      {/* Multiple ticket tabs */}
      {bookedTickets.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {bookedTickets.map((_, i) => (
            <button
              key={i}
              onClick={() => setVisibleQr(i)}
              style={{
                padding: '6px 14px',
                borderRadius: 10,
                border: visibleQr === i ? '1px solid rgba(200,169,110,0.5)' : '1px solid rgba(255,255,255,0.12)',
                background: visibleQr === i ? 'rgba(200,169,110,0.16)' : 'rgba(255,255,255,0.05)',
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
                fontWeight: 600,
                color: visibleQr === i ? '#c8a96e' : 'rgba(255,255,255,0.55)',
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
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#999' }}>QR…</span>
          </div>
        )}
      </div>

      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.55)', margin: 0 }}>
        Présente ce QR code à l'entrée
      </p>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', margin: 0, letterSpacing: '0.04em' }}>
        {ticket.ticketCode}
      </p>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
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
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.65)' }}>{item.name}</span>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.45)' }}>×{preorderItems[item.name]}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 6, marginTop: 2 }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>Total payé</span>
            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 16, color: '#c8a96e' }}>{fmtMoney(totalPrice, evCur)}</span>
          </div>
        </div>
      )}

      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
        Retrouve tous tes billets dans{' '}
        <span style={{ color: '#c8a96e' }}>Mes billets</span>
      </p>

      {onBookAnother && (
        <button
          onClick={onBookAnother}
          style={{
            width: '100%',
            padding: '12px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 12,
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.9)',
            cursor: 'pointer',
          }}
        >
          Réserver une autre place
        </button>
      )}

      {event.playlist && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 12px',
          borderRadius: 8,
          background: 'rgba(224,90,170,0.12)',
          border: '1px solid rgba(224,90,170,0.35)',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#e05aaa">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#e05aaa' }}>
            Playlist interactive débloquée
          </span>
        </div>
      )}
    </div>
  )
}
