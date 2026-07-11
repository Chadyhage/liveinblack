import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Cropper from 'react-easy-crop'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import BoostModal from '../components/BoostModal'
import EventStaffModal from '../components/EventStaffModal'
import PromoCodesPanel from '../components/PromoCodesPanel'
import EventHoverMedia from '../components/EventHoverMedia'
import { IconHourglass, IconAlert } from '../components/icons'
import getCroppedImg from '../utils/cropImage'
import { canCreateEvent, getCreateEventBlockedReason } from '../utils/permissions'
import { regions } from '../data/regions'
import { fmtMoney, eventCurrency, regionToCurrency, currencySymbol, organizerCurrency, payRailLabel } from '../utils/money'
import { MUSIC_STYLES, EVENT_TYPES, AMBIANCES } from '../utils/recommendations'
import { getGuestlist, loadGuestlistRemote, addGuestlistEntry, removeGuestlistEntry } from '../utils/guestlist'
import { ticketPreorderLines, eventStock } from '../utils/eventStats'

function generateCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
function getEventCodes() {
  try { return JSON.parse(localStorage.getItem('lib_event_codes') || '{}') } catch { return {} }
}
function saveEventCodes(data) {
  try { localStorage.setItem('lib_event_codes', JSON.stringify(data)) } catch {}
}
// Publie chaque code dans la collection plate event_access_codes/{code} pour
// qu'un client sur N'IMPORTE QUEL device puisse le valider (lookup O(1)) et
// que le statut « utilisé » se synchronise. Avant, les codes restaient dans le
// localStorage de l'organisateur → inutilisables cross-device.
function syncEventCodesToFirestore(eventId, codes) {
  import('../utils/firestore-sync').then(({ syncDoc }) => {
    for (const c of codes) {
      if (!c?.code) continue
      syncDoc(`event_access_codes/${c.code}`, {
        code: c.code,
        eventId: String(eventId),
        usedBy: c.usedBy || null,
      })
    }
  }).catch(() => {})
}

const CREATION_STEPS = ['Bases', 'Places & Prix', 'Lieu & Infos', 'Options avancées', 'Publier']

function formatDateDisplay(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
  } catch { return dateStr }
}

function getCreatedEvents() {
  try { return JSON.parse(localStorage.getItem('lib_created_events') || '[]') } catch { return [] }
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

// ── Shared style tokens ────────────────────────────────────────────────────────
const S = {
  card: {
    background: '#0e0f16',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  },
  inputBase: {
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
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 'normal',
    color: 'rgba(255,255,255,0.6)',
    display: 'block',
    marginBottom: 6,
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
    boxShadow: '0 6px 20px rgba(122,59,242,0.35)',
    width: '100%',
  },
  btnGold: {
    padding: '13px 20px',
    background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 12,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(122,59,242,0.35)',
    width: '100%',
  },
  btnGhost: {
    padding: '12px 18px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 12,
    fontFamily: 'Inter, sans-serif',
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.9)',
    cursor: 'pointer',
    width: '100%',
  },
  btnDanger: {
    padding: '13px 20px',
    background: '#c2347f',
    border: 'none',
    borderRadius: 12,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
    width: '100%',
  },
  btnTeal: {
    padding: '13px 20px',
    background: '#3ed6b5',
    border: 'none',
    borderRadius: 12,
    fontFamily: 'Inter, sans-serif',
    fontSize: 14,
    fontWeight: 700,
    color: '#04120e',
    cursor: 'pointer',
    width: '100%',
  },
}

// ── Eyebrow label with teal line ──────────────────────────────────────────────
function Eyebrow({ children, style = {} }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, ...style }}>
      <div style={{ width: 28, height: 1, background: '#4ee8c8', flexShrink: 0 }} />
      <span style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.5)',
      }}>{children}</span>
    </div>
  )
}

const EVENT_ACTIONS = {
  stats: { label: 'Statistiques', color: '#4ee8c8', icon: <svg viewBox="0 0 24 24"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg> },
  bookings: { label: 'Réservations', color: '#c8a96e', icon: <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> },
  boost: { label: 'Booster', color: '#e05aaa', icon: <svg viewBox="0 0 24 24"><path d="m12 15-3-3a22 22 0 0 1 2-4A13 13 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2Z"/><path d="M9 12H4s.6-3 2-4c1.6-1 5 0 5 0M12 15v5s3-.6 4-2c1-1.6 0-5 0-5"/></svg> },
  guests: { label: 'Guestlist', color: '#4ee8c8', icon: <svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M19 8v6M16 11h6"/></svg> },
  staff: { label: 'Équipe', color: '#c8a96e', icon: <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-4M16 3a4 4 0 0 1 0 8"/></svg> },
  codes: { label: 'Codes', color: 'rgba(255,255,255,.65)', icon: <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
  promo: { label: 'Codes promo', color: '#8b8ff5', icon: <svg viewBox="0 0 24 24"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24H4a2 2 0 0 0-2 2v5.59c0 .53.21 1.04.59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l5.59-5.59a2 2 0 0 0 0-2.83z"/><circle cx="7.5" cy="8.5" r="1"/></svg> },
  duplicate: { label: 'Dupliquer', color: '#8b8ff5', icon: <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> },
  edit: { label: 'Modifier', color: '#c8a96e', icon: <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="m18.5 2.5 3 3L12 15l-4 1 1-4Z"/></svg> },
  delete: { label: 'Supprimer', color: '#dc7777', icon: <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg> },
}

function EventActionButton({ type, onClick }) {
  const action = EVENT_ACTIONS[type]
  return <button className="event-action" onClick={onClick} style={{ '--action-color': action.color }}>
    <span className="event-action-icon">{action.icon}</span><span>{action.label}</span>
  </button>
}

function EventDashboardCard({ event, onOpen, onStats, onBookings, onBoost, onGuests, onStaff, onCodes, onPromo, onDuplicate, onEdit, onDelete }) {
  return <article className="event-manage-card">
    <button className="event-manage-main" onClick={onOpen}>
      <div className="event-manage-media" style={{ position: 'relative', ...(event.imageUrl ? {backgroundImage:`linear-gradient(to top,rgba(4,4,11,.72),transparent 65%),url(${event.imageUrl})`} : {}) }}>
        {!event.imageUrl && <svg viewBox="0 0 24 24"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/></svg>}
        {event.videoUrl && (
          <EventHoverMedia
            event={event}
            showBadge
            overlay="linear-gradient(to top,rgba(4,4,11,.72),transparent 65%)"
            style={{ position: 'absolute', inset: 0, height: '100%', aspectRatio: 'auto' }}
          />
        )}
      </div>
      <div className="event-manage-copy">
        <span className="event-status">Publié</span>
        <h3>{event.name}</h3>
        <p>{[event.dateDisplay, event.city].filter(Boolean).join(' · ')}</p>
        <span className="event-open-link">Voir la page de l’événement →</span>
      </div>
    </button>
    <div className="event-action-grid">
      <EventActionButton type="stats" onClick={onStats}/><EventActionButton type="bookings" onClick={onBookings}/>
      <EventActionButton type="boost" onClick={onBoost}/><EventActionButton type="guests" onClick={onGuests}/>
      <EventActionButton type="staff" onClick={onStaff}/><EventActionButton type="promo" onClick={onPromo}/>{event.isPrivate && <EventActionButton type="codes" onClick={onCodes}/>}
      <EventActionButton type="duplicate" onClick={onDuplicate}/><EventActionButton type="edit" onClick={onEdit}/><EventActionButton type="delete" onClick={onDelete}/>
    </div>
  </article>
}

function InputField({ label, value, onChange, placeholder, type = 'text', error, style = {}, min, max, locked = false, lockedReason = '' }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      {label && (
        <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 6 }}>
          {label}
          {locked && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(200,169,110,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2"/>
              <path d="M8 11 V7 a4 4 0 0 1 8 0 V11"/>
            </svg>
          )}
        </label>
      )}
      <input
        type={type}
        min={min}
        max={max}
        disabled={locked}
        title={locked ? (lockedReason || 'Champ verrouillé — billets déjà vendus') : undefined}
        style={{
          ...S.inputBase,
          borderColor: error ? 'rgba(220,50,50,0.6)' : focused ? '#4ee8c8' : locked ? 'rgba(200,169,110,0.18)' : 'rgba(255,255,255,0.10)',
          boxShadow: focused && !locked ? '0 0 0 3px rgba(78,232,200,0.06)' : 'none',
          opacity: locked ? 0.55 : 1,
          cursor: locked ? 'not-allowed' : 'text',
          background: locked ? 'rgba(200,169,110,0.04)' : S.inputBase.background,
          ...style,
        }}
        placeholder={placeholder}
        value={value}
        onChange={locked ? () => {} : onChange}
        onFocus={() => !locked && setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {error && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{error}</p>}
    </div>
  )
}

function Toggle({ value, onChange, disabled = false }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: value ? '#4ee8c8' : 'rgba(255,255,255,0.08)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 4,
        width: 16,
        height: 16,
        background: 'white',
        borderRadius: '50%',
        transition: 'left 0.2s',
        left: value ? 24 : 4,
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }} />
    </div>
  )
}

// ── Close icon ────────────────────────────────────────────────────────────────
function IconClose({ size = 12, color = 'rgba(255,255,255,0.5)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

export default function MesEvenementsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const userCanCreate = canCreateEvent(user)
  const imageInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const videoObjectUrlRef = useRef(null)

  const [view, setView] = useState('dashboard')
  const [createStep, setCreateStep] = useState(0)
  const [editingEventId, setEditingEventId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [cancellationMessageDraft, setCancellationMessageDraft] = useState('')
  const [cancelBusy, setCancelBusy] = useState(false)
  const [syncErrorBanner, setSyncErrorBanner] = useState(null)
  const [showBoostModal, setShowBoostModal] = useState(false)
  const [boostTargetEvent, setBoostTargetEvent] = useState(null)
  const [showBoostToast, setShowBoostToast] = useState(false)
  const [justPublishedEvent, setJustPublishedEvent] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [videoUploadPct, setVideoUploadPct] = useState(null)
  const toastTimerRef = useRef(null)
  // Devise de l'organisateur (« 1 organisateur = 1 zone ») : ancrée à son profil,
  // source de vérité de la devise de TOUS ses events. null tant qu'inconnue → on
  // retombe sur la région de l'event (rétro-compat, ne casse pas l'existant).
  const [orgCurrency, setOrgCurrency] = useState(null)

  // Step 0: Bases
  const [form, setForm] = useState({ name: '', date: '', timeStart: '', timeEnd: '', description: '', privateCode: '', minAge: 18, region: '' })
  const [artists, setArtists] = useState([]) // [{ name: '', role: 'DJ' }]
  const [showArtistSection, setShowArtistSection] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const [videoFile, setVideoFile] = useState(null)
  const [videoPreview, setVideoPreview] = useState(null)
  const [videoName, setVideoName] = useState('')
  const [eventType, setEventType] = useState(null)
  const [category, setCategory] = useState(null)
  const [customGenre, setCustomGenre] = useState('')
  // Tags de ciblage (recommandations) — référentiels PARTAGÉS avec le profil
  // client (utils/recommendations) : c'est ce qui rend le matching fiable.
  const [partyType, setPartyType] = useState('')      // id EVENT_TYPES (unique)
  const [musicStyles, setMusicStyles] = useState([])  // ids MUSIC_STYLES (multi)
  const [ambiances, setAmbiances] = useState([])      // ids AMBIANCES (multi)
  const [errors, setErrors] = useState({})

  // Image crop state
  const [showCropper, setShowCropper] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const onCropComplete = useCallback((_, cap) => setCroppedAreaPixels(cap), [])

  // Step 1: Places
  const [places, setPlaces] = useState([{ type: 'Entrée libre', price: 0, qty: 100, maxPerAccount: 0, groupType: 'solo', groupMin: '', groupMax: '', included: [] }])

  // Step 2: Venue
  const [venue, setVenue] = useState({ name: '', address: '', city: '', country: '' })

  // Step 3: Options avancées
  const [options, setOptions] = useState({ playlist: false, preorder: false, qr: true })
  const [publishAt, setPublishAt]     = useState('')   // '' = publier immédiatement
  const [closingDate, setClosingDate] = useState('')   // '' = fermer à la date de l'event
  const [menuItems, setMenuItems] = useState([{ name: '', emoji: '', imageUrl: null, price: '', category: 'Boissons', description: '', hasShow: false, showOptions: [] }])

  // Dashboard bookings panel
  const [showBookingsPanel, setShowBookingsPanel] = useState(false)
  const [bookingsPanelEvent, setBookingsPanelEvent] = useState(null)

  // Analytics : billets vendus (vraie source = registre tickets/ Firestore)
  const [salesTickets, setSalesTickets] = useState([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [salesError, setSalesError] = useState(false)
  const [salesRetry, setSalesRetry] = useState(0)

  // Dashboard codes state
  const [showCodesModal, setShowCodesModal] = useState(false)
  const [codesTargetEvent, setCodesTargetEvent] = useState(null)
  const [codesQty, setCodesQty] = useState(10)
  const [generatedCodes, setGeneratedCodes] = useState(null)

  // Codes promo : panneau par événement (composant autonome PromoCodesPanel)
  const [promoTargetEvent, setPromoTargetEvent] = useState(null)
  // Guestlist state
  const [showGuestlistModal, setShowGuestlistModal] = useState(false)
  const [guestlistTargetEvent, setGuestlistTargetEvent] = useState(null)
  const [guestlistItems, setGuestlistItems] = useState([])
  const [guestlistLoading, setGuestlistLoading] = useState(false)
  const [guestForm, setGuestForm] = useState({ name: '', phone: '', note: '', placeType: '' })
  const [guestlistError, setGuestlistError] = useState('')
  const [guestlistAdding, setGuestlistAdding] = useState(false)
  const [copiedGuestId, setCopiedGuestId] = useState(null)
  const [codesCopied, setCodesCopied] = useState(false)
  const [copiedCodeIdx, setCopiedCodeIdx] = useState(null)

  // Staff / équipe state
  const [staffTargetEvent, setStaffTargetEvent] = useState(null)

  const [createdEvents, setCreatedEvents] = useState([])
  const [showStatsPanel, setShowStatsPanel] = useState(false)
  const [statsPanelEvent, setStatsPanelEvent] = useState(null)

  // ── Real-time Firestore listener for organizer's events ──────────────────────
  // Charge initial depuis localStorage pour éviter le flash vide pendant que
  // le listener se met en place
  useEffect(() => {
    try {
      const tomb = new Set((JSON.parse(localStorage.getItem('lib_deleted_events') || '[]')).map(String))
      const cached = JSON.parse(localStorage.getItem('lib_created_events') || '[]').filter(e => !tomb.has(String(e.id)))
      if (cached.length) setCreatedEvents(cached)
    } catch {}
  }, [])

  // Charge la devise de zone de l'organisateur depuis son profil.
  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false
    import('../utils/organizers').then(({ getOrganizerProfile }) => {
      const cur = organizerCurrency(getOrganizerProfile(user.uid))
      if (!cancelled && cur) setOrgCurrency(cur)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid) return
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenUserEvents }) => {
      unsub = listenUserEvents(user.uid, (firestoreItems) => {
        // Tombstones : ids supprimés à ne jamais réafficher, même si un snapshot
        // Firestore périmé les renvoie encore.
        let tombSet = new Set()
        try { tombSet = new Set((JSON.parse(localStorage.getItem('lib_deleted_events') || '[]')).map(String)) } catch {}
        const fresh = firestoreItems.filter(e => !tombSet.has(String(e.id)))
        // Merge robuste : on ne supprime PAS les events locaux qui ne sont pas
        // (encore) dans Firestore — ça évite le flicker "ça part ça revient"
        // quand on vient de publier et que le sync n'a pas encore propagé.
        // MAIS on exclut les events supprimés (tombstones) pour qu'ils ne soient
        // pas reclassés "local non synchronisé" et gardés à vie.
        setCreatedEvents(prev => {
          const incomingIds = new Set(fresh.map(e => String(e.id)))
          const localOnly = prev.filter(e => !incomingIds.has(String(e.id)) && !tombSet.has(String(e.id)))
          const merged = [...fresh, ...localOnly]
          try { localStorage.setItem('lib_created_events', JSON.stringify(merged)) } catch {}
          return merged
        })
      })
    }).catch(() => {})
    return () => unsub()
  }, [user?.uid])

  // ── Charge les ventes réelles (registre tickets/) pour les events de l'orga ──
  const myEventIds = (() => {
    const uid = user?.uid
    return createdEvents
      .filter(ev => !ev.createdBy || ev.createdBy === uid || ev.organizerId === uid)
      .map(ev => String(ev.id))
  })()
  const myEventIdsKey = myEventIds.join(',')
  useEffect(() => {
    if (!myEventIds.length) { setSalesTickets([]); setSalesError(false); return }
    let cancelled = false
    setSalesLoading(true)
    setSalesError(false)
    import('../utils/firestore-sync').then(async ({ loadTicketsForEvents }) => {
      const tix = await loadTicketsForEvents(myEventIds)
      if (!cancelled) { setSalesTickets(tix); setSalesLoading(false) }
    }).catch(() => { if (!cancelled) { setSalesLoading(false); setSalesError(true) } })
    return () => { cancelled = true }
  }, [myEventIdsKey, salesRetry]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (videoObjectUrlRef.current) URL.revokeObjectURL(videoObjectUrlRef.current)
    }
  }, [])

  function clearEventVideoPreview() {
    if (videoObjectUrlRef.current) {
      URL.revokeObjectURL(videoObjectUrlRef.current)
      videoObjectUrlRef.current = null
    }
    setVideoFile(null)
    setVideoPreview(null)
    setVideoName('')
    setErrors(err => ({ ...err, video: null }))
    if (videoInputRef.current) videoInputRef.current.value = ''
  }

  function handleVideo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime']
    if (!allowed.includes(file.type)) {
      setErrors(err => ({ ...err, video: 'Format invalide — MP4, WEBM ou MOV uniquement' }))
      e.target.value = ''
      return
    }
    if (file.size > 30 * 1024 * 1024) {
      setErrors(err => ({ ...err, video: 'Vidéo trop lourde — 30 MB maximum' }))
      e.target.value = ''
      return
    }
    if (videoObjectUrlRef.current) URL.revokeObjectURL(videoObjectUrlRef.current)
    const nextPreview = URL.createObjectURL(file)
    videoObjectUrlRef.current = nextPreview
    setVideoFile(file)
    setVideoPreview(nextPreview)
    setVideoName(file.name || 'Vidéo d’aperçu')
    setErrors(err => ({ ...err, video: null }))
    e.target.value = ''
  }

  function handleImage(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors(err => ({ ...err, image: 'Format invalide — JPG, PNG ou WEBP uniquement' }))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors(err => ({ ...err, image: 'Fichier trop lourd — 5 MB maximum' }))
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      setCropSrc(ev.target.result)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setShowCropper(true)
    }
    reader.readAsDataURL(file)
    setErrors(err => ({ ...err, image: null }))
    e.target.value = ''
  }

  async function applyCrop() {
    try {
      const cropped = await getCroppedImg(cropSrc, croppedAreaPixels)
      setImagePreview(cropped)
      setShowCropper(false)
    } catch {
      setShowCropper(false)
    }
  }

  function generateCodes() {
    if (!codesTargetEvent) return
    const qty = Math.max(1, Math.min(100, Number(codesQty) || 10))
    const codes = Array.from({ length: qty }, () => ({ code: generateCode(), usedBy: null }))
    const all = getEventCodes()
    all[String(codesTargetEvent.id)] = [...(all[String(codesTargetEvent.id)] || []), ...codes]
    saveEventCodes(all)
    syncEventCodesToFirestore(codesTargetEvent.id, codes)
    setGeneratedCodes(codes)
  }

  function validateAndNext(currentStep) {
    const errs = {}
    if (currentStep === 0) {
      if (!form.name.trim()) errs.name = 'Le nom est obligatoire'
      if (!form.date) {
        errs.date = 'La date est obligatoire'
      } else {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const picked = new Date(form.date + 'T00:00:00')
        if (picked < today) errs.date = 'La date que tu as choisie est déjà passée'
      }
      if (form.timeStart && form.timeEnd) {
        // Only block identical times — overnight events (end < start) are valid for clubs
        if (form.timeStart === form.timeEnd) errs.timeEnd = "L'heure de fin doit être différente de l'heure de début"
        // Note: end < start is allowed (soirée crossing midnight, e.g. 23:00 → 05:00)
      }
      if (!eventType) errs.eventType = "Choisis un type d'événement"
    }
    if (currentStep === 1) {
      places.forEach((p, i) => {
        if (!p.type.trim()) errs[`place_${i}`] = 'Donne un nom à cette place'
        // Une table/carré (place de groupe) se vend ENTIÈRE au prix plein et
        // émet un billet par siège → elle doit avoir un tarif (> 0). Sinon le
        // parcours d'achat gratuit ne créerait qu'un seul billet (table cassée).
        if (p.groupType === 'group' && (Number(p.price) || 0) <= 0) {
          errs[`place_${i}`] = 'Une table de groupe doit avoir un prix (supérieur à 0)'
        }
      })
    }
    if (currentStep === 2) {
      if (!venue.city.trim()) errs.city = 'La ville est obligatoire'
      if (!form.region) errs.region = 'Choisis une région'
    }
    setErrors(errs)
    if (Object.keys(errs).length === 0) setCreateStep(currentStep + 1)
  }

  // Ajoute des photos à une place (lecture fichier → compression → aperçu data:).
  // L'upload Storage réel se fait à la publication (handlePublish). Max 6/place.
  async function handlePlacePhotos(placeIndex, fileList) {
    const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'))
    if (!files.length) return
    const { compressDataUrl } = await import('../utils/uploadImage')
    for (const file of files) {
      const dataUrl = await new Promise((res) => {
        const r = new FileReader()
        r.onload = () => res(r.result)
        r.onerror = () => res(null)
        r.readAsDataURL(file)
      })
      if (!dataUrl) continue
      let light = dataUrl
      try { light = await compressDataUrl(dataUrl, 1100, 0.72) } catch { /* garde l'original */ }
      setPlaces(prev => prev.map((p, j) => j === placeIndex
        ? { ...p, photos: [...(p.photos || []), light].slice(0, 6) }
        : p))
    }
  }

  async function handlePublish() {
    // Vérification critique : un event ne peut être publié que par un user authentifié Firebase Auth
    // Sinon les rules Firestore rejettent silencieusement et l'event reste invisible cross-device
    const { auth } = await import('../firebase')
    const fbUid = auth?.currentUser?.uid
    if (!fbUid) {
      setSyncErrorBanner({
        title: 'Connexion requise',
        message: 'Tu dois être connecté pour publier un événement. Reconnecte-toi et réessaye.',
      })
      return
    }
    if (user?.uid && fbUid !== user.uid) {
      setSyncErrorBanner({
        title: 'Session expirée',
        message: 'Ton authentification ne correspond plus. Déconnecte-toi puis reconnecte-toi pour publier.',
      })
      return
    }

    const eventId = editingEventId || String(Date.now())

    // ── Affiche : Firestore limite chaque document à 1 Mo. Une image base64
    // pleine résolution fait échouer l'écriture events/{id} → event invisible
    // cross-device. On upload donc l'affiche sur Storage et on ne stocke que
    // l'URL. Secours si Storage échoue : version compressée < 1 Mo.
    let finalImageUrl = imagePreview
    if (imagePreview && imagePreview.startsWith('data:')) {
      setPublishing(true)
      try {
        const { uploadEventPoster } = await import('../utils/uploadImage')
        finalImageUrl = await uploadEventPoster(eventId, imagePreview)
      } catch {
        try {
          const { compressDataUrl } = await import('../utils/uploadImage')
          finalImageUrl = await compressDataUrl(imagePreview, 700, 0.6)
        } catch {}
      }
    }

    let finalVideoUrl = videoPreview && !videoPreview.startsWith('blob:') ? videoPreview : null
    if (videoFile) {
      setPublishing(true)
      setVideoUploadPct(0)
      try {
        const { uploadEventVideo } = await import('../utils/uploadImage')
        finalVideoUrl = await uploadEventVideo(eventId, videoFile, pct => setVideoUploadPct(pct))
      } catch (err) {
        setPublishing(false)
        setSyncErrorBanner({
          title: 'Vidéo non envoyée',
          message: err?.message || 'La vidéo d’aperçu est trop lourde ou son format n’est pas accepté. Utilise une courte vidéo MP4/WEBM/MOV de moins de 30 Mo.',
        })
        return
      } finally {
        setVideoUploadPct(null)
      }
    }

    // ── Photos par type de place → Storage (mêmes raisons que l'affiche : jamais
    // de base64 dans Firestore). On upload chaque photo data: et on ne garde que
    // les URLs. Secours si Storage échoue : version compressée. Les URLs http(s)
    // déjà présentes (édition sans changement) sont conservées telles quelles.
    let placesPhotos = places.map(p => (Array.isArray(p.photos) ? p.photos : []))
    if (placesPhotos.some(arr => arr.some(ph => typeof ph === 'string' && ph.startsWith('data:')))) {
      setPublishing(true)
      const { uploadPlacePhoto, compressDataUrl } = await import('../utils/uploadImage')
      placesPhotos = await Promise.all(placesPhotos.map(async (arr, i) => {
        const out = await Promise.all(arr.map(async (ph, k) => {
          if (typeof ph !== 'string' || !ph.startsWith('data:')) return ph
          try { return await uploadPlacePhoto(eventId, ph, `${i}_${k}`) }
          catch { try { return await compressDataUrl(ph, 900, 0.6) } catch { return null } }
        }))
        return out.filter(Boolean)
      }))
    }

    // ── FIX survente : à l'ÉDITION, ne jamais remettre available = total.
    // `available` est un compteur vivant décrémenté côté serveur (webhook Stripe,
    // réservations gratuites) : on lit le doc SERVEUR (source de vérité) pour
    // préserver le nombre de billets déjà vendus par type de place.
    let soldByType = {}
    if (editingEventId) {
      try {
        const { loadDoc } = await import('../utils/firestore-sync')
        const serverEv = await loadDoc(`events/${editingEventId}`)
        const source = serverEv || createdEvents.find(ev => ev.id === editingEventId)
        for (const pl of (source?.places || [])) {
          soldByType[pl.type] = Math.max(0, (Number(pl.total) || 0) - (Number(pl.available) || 0))
        }
      } catch {}
    }

    // ── Options incluses par type de place : STRICTEMENT liées au menu de
    // l'événement (jamais d'option orpheline). On ne garde que les entrées dont
    // l'article existe encore dans le menu validé au moment de la publication.
    const validMenuItems = menuItems.filter(i => i.name.trim() && i.price)
    const menuNames = new Set(validMenuItems.map(i => i.name.trim()))
    const sanitizeIncluded = (p) => (Array.isArray(p.included) ? p.included : [])
      .map(inc => ({ name: String(inc?.name || '').trim(), qty: Math.max(1, Number(inc?.qty) || 1) }))
      .filter(inc => inc.name && menuNames.has(inc.name))
    const anyIncluded = places.some(p => sanitizeIncluded(p).length > 0)

    const eventData = {
      id: eventId,
      name: form.name,
      subtitle: form.description?.slice(0, 60) || '',
      date: form.date,
      dateDisplay: formatDateDisplay(form.date),
      time: form.timeStart || '22:00',
      endTime: form.timeEnd || '05:00',
      location: [venue.name, venue.city].filter(Boolean).join(', '),
      city: venue.city,
      region: form.region || venue.city,
      // Devise de facturation : Togo/Bénin → XOF (FedaPay), France → EUR (Stripe).
      // Figée à la publication — les prix des places sont saisis dans cette devise.
      // « 1 organisateur = 1 zone » : la devise vient de la zone de l'organisateur
      // (orgCurrency) ; à défaut (profil sans zone connue) on retombe sur la région.
      currency: orgCurrency || regionToCurrency(form.region || venue.city),
      imageUrl: finalImageUrl,
      videoUrl: finalVideoUrl,
      color: '#c8a96e',
      accentColor: '#e8d49e',
      category: category === 'Autre' ? (customGenre.trim() || 'Autre') : (category || 'Autre'),
      // Tags de ciblage (ids stables pour le score de recommandation)…
      eventType: partyType || '',
      musicStyles,
      ambiances,
      // …et tags lisibles pour l'affichage sur les cartes/fiches (compat champ historique)
      tags: [
        partyType && EVENT_TYPES.find(t => t.id === partyType)?.label,
        ...musicStyles.map(id => MUSIC_STYLES.find(s => s.id === id)?.label),
        ...ambiances.map(id => AMBIANCES.find(a => a.id === id)?.label),
      ].filter(Boolean).slice(0, 6),
      organizer: user?.name || 'Organisateur',
      description: form.description,
      places: places.map((p, i) => ({
        type: p.type || 'Entrée',
        price: Number(p.price) || 0,
        // Édition : total - (déjà vendus) ; création : tout est disponible
        available: Math.max(0, (Number(p.qty) || 50) - (soldByType[p.type || 'Entrée'] || 0)),
        total: Number(p.qty) || 50,
        icon: '',
        maxPerAccount: Number(p.maxPerAccount) || 0,
        groupType: p.groupType || 'solo',
        groupMin: Number(p.groupMin) || 0,
        groupMax: Number(p.groupMax) || 0,
        photos: placesPhotos[i] || [],
        included: sanitizeIncluded(p),
      })),
      playlist: options.playlist,
      preorder: options.preorder,
      featured: false,
      rating: 0,
      attendees: 0,
      artists: artists.filter(a => a.name.trim()),
      dj: artists.filter(a => a.name.trim()).length > 0
        ? artists.filter(a => a.name.trim()).map(a => a.name.trim()).join(', ')
        : user?.name || 'Organisateur',
      performers: [],
      minAge: form.minAge || 18,
      userCreated: true,
      isPrivate: eventType === 'private',
      privateCode: eventType === 'private' ? form.privateCode.trim() : null,
      // Le menu est publié si les précommandes sont actives OU si un billet
      // inclut des options (elles pointent vers le menu — il doit exister).
      menu: (options.preorder || anyIncluded) ? validMenuItems : null,
      publishAt: publishAt || null,
      // Utilisé par les abonnements organisateur pour notifier uniquement les
      // événements réellement publiés après l'abonnement (anti-doublon).
      publishedAt: editingEventId
        ? (createdEvents.find(ev => ev.id === editingEventId)?.publishedAt || Date.now())
        : Date.now(),
      closingDate: closingDate || null,
      cancelled: false,
    }
    let updated
    if (editingEventId) {
      updated = createdEvents.map(ev => ev.id === editingEventId ? eventData : ev)
    } else {
      // _pendingSync : marque cette création locale « pas encore confirmée par
      // Firestore » → la réconciliation la garde tant qu'elle n'est pas remontée,
      // MAIS ne ressuscite pas les events supprimés (eux n'ont pas ce flag).
      // Flag LOCAL uniquement — non envoyé à Firestore (eventToSync = eventData).
      updated = [...createdEvents, { ...eventData, _pendingSync: true }]
    }
    localStorage.setItem('lib_created_events', JSON.stringify(updated))
    setCreatedEvents(updated)

    // Sync event to shared Firestore collection so all users see it cross-device
    // CRITIQUE : on AWAIT le sync de events/{id} car c'est ce qui rend l'event public.
    // Si ça échoue, le user doit le savoir (toast d'erreur) sinon il pense que l'event
    // est publié alors qu'en réalité il est seulement dans son localStorage.
    // organizerName = le nom PUBLIC de la page organisateur (pas le nom perso du
    // compte) : c'est ce que voient les clients sur la fiche événement.
    let organizerPublicName = ''
    try {
      const { getOrganizerProfile } = await import('../utils/organizers')
      organizerPublicName = getOrganizerProfile(fbUid)?.publicName || ''
    } catch {}
    const eventToSync = {
      ...eventData,
      createdBy: fbUid,
      organizerId: fbUid,
      organizerName: organizerPublicName || user?.name || 'Organisateur',
    }
    try {
      const { syncDocAwaitable, syncDoc } = await import('../utils/firestore-sync')
      const result = await syncDocAwaitable(`events/${eventData.id}`, eventToSync)
      if (!result.ok) {
        setSyncErrorBanner({
          title: 'Publication incomplète',
          message: `L'événement n'a pas pu être publié sur le serveur (${result.code || 'erreur'}). Il reste sauvegardé localement, mais il ne sera pas visible par les clients tant que le problème n'est pas résolu.`,
          retry: () => handlePublish(),
        })
        // On continue quand même — l'event est en localStorage au cas où
      } else {
        setSyncErrorBanner(null)
        // E-mails « nouvel événement » aux abonnés de l'organisateur — SEULEMENT
        // à la première publication (pas sur une édition) et pour les events
        // publics. Fire-and-forget : l'échec n'affecte pas la publication.
        // L'endpoint est idempotent côté serveur (flag event_notifications).
        if (!editingEventId && !eventData.isPrivate) {
          import('../utils/apiAuth').then(async ({ authHeaders }) => fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({ type: 'new_event_followers', eventId: eventData.id }),
          })).catch(() => {})
        }
      }
      // user_events est non-bloquant — on sanitise les vieilles images base64
      // pour rester sous la limite Firestore de 1 Mo par document
      const { sanitizeEventsForSync } = await import('../utils/uploadImage')
      sanitizeEventsForSync(updated).then(items => syncDoc(`user_events/${fbUid}`, { items }))
    } catch {
      setSyncErrorBanner({
        title: 'Erreur réseau',
        message: 'Impossible de joindre le serveur. Vérifie ta connexion et réessaye.',
        retry: () => handlePublish(),
      })
    }

    if (eventType === 'private' && form.privateCode.trim()) {
      const all = getEventCodes()
      const key = String(eventData.id)
      if (!all[key]?.find(c => c.code === form.privateCode.trim())) {
        const newCode = { code: form.privateCode.trim(), usedBy: null }
        all[key] = [...(all[key] || []), newCode]
        saveEventCodes(all)
        syncEventCodesToFirestore(eventData.id, [newCode])
      }
    }

    setPublishing(false)
    const wasEditing = !!editingEventId
    setEditingEventId(null)
    if (!wasEditing) {
      setJustPublishedEvent(eventData)
      setView('dashboard')
      setTimeout(() => {
        setShowBoostToast(true)
        toastTimerRef.current = setTimeout(() => {
          setShowBoostToast(false)
          navigate('/evenements')
        }, 4000)
      }, 400)
    } else {
      navigate('/evenements')
    }
  }

  function startCreate() {
    setCreateStep(0)
    setEditingEventId(null)
    // Pré-remplir la région depuis la région sélectionnée dans l'app
    const defaultRegion = (() => {
      try {
        const saved = localStorage.getItem('lib_region')
        if (saved) {
          const { id } = JSON.parse(saved)
          const found = regions.find(r => r.id === id)
          return found ? found.name : ''
        }
      } catch {}
      return ''
    })()
    setForm({ name: '', date: '', timeStart: '', timeEnd: '', description: '', privateCode: '', minAge: 18, region: defaultRegion })
    setArtists([])
    setShowArtistSection(false)
    setImagePreview(null)
    clearEventVideoPreview()
    setEventType(null)
    setCategory(null)
    setCustomGenre('')
    setPartyType('')
    setMusicStyles([])
    setAmbiances([])
    setErrors({})
    setPlaces([{ type: 'Entrée libre', price: 0, qty: 100, maxPerAccount: 0, groupType: 'solo', groupMin: '', groupMax: '', included: [] }])
    setVenue({ name: '', address: '', city: '', country: '' })
    setOptions({ playlist: false, preorder: false, qr: true })
    setMenuItems([{ name: '', emoji: '', imageUrl: null, price: '', category: 'Boissons', description: '', hasShow: false, showOptions: [], excludedPlaces: [] }])
    setPublishAt('')
    setClosingDate('')
    setView('create')
  }

  function startEdit(ev) {
    setCreateStep(0)
    setEditingEventId(ev.id)
    setForm({
      name: ev.name || '',
      date: ev.date || '',
      timeStart: ev.time || '',
      timeEnd: ev.endTime || '',
      description: ev.description || '',
      privateCode: ev.privateCode || '',
      minAge: ev.minAge != null ? ev.minAge : 18,
      region: ev.region || '',
    })
    const loadedArtists = ev.artists?.length ? ev.artists : []
    setArtists(loadedArtists)
    setShowArtistSection(loadedArtists.length > 0)
    setImagePreview(ev.imageUrl || null)
    if (videoObjectUrlRef.current) {
      URL.revokeObjectURL(videoObjectUrlRef.current)
      videoObjectUrlRef.current = null
    }
    setVideoFile(null)
    setVideoPreview(ev.videoUrl || null)
    setVideoName(ev.videoUrl ? 'Vidéo d’aperçu enregistrée' : '')
    // FIX : c'était setEventType('public') en dur → éditer un événement PRIVÉ le
    // republiait en PUBLIC (isPrivate recalculé depuis eventType à la sauvegarde).
    setEventType(ev.isPrivate ? 'private' : 'public')
    const PRESET_GENRES = ['Afrobeat', 'Rap', 'Électronique', 'R&B', 'Reggaeton', 'Dancehall', 'House', 'Autre']
    const evCat = ev.category || null
    if (evCat && !PRESET_GENRES.includes(evCat)) {
      setCategory('Autre')
      setCustomGenre(evCat)
    } else {
      setCategory(evCat)
      setCustomGenre('')
    }
    // Tags de ciblage : préremplir depuis l'event (sinon une ré-édition les effacerait,
    // eventData étant reconstruit intégralement à chaque publication)
    setPartyType(ev.eventType || '')
    setMusicStyles(Array.isArray(ev.musicStyles) ? ev.musicStyles : [])
    setAmbiances(Array.isArray(ev.ambiances) ? ev.ambiances : [])
    setErrors({})
    const venueParts = (ev.location || '').split(', ')
    setVenue({
      name: venueParts.length > 1 ? venueParts[0] : '',
      address: '',
      city: ev.city || '',
      country: ev.region !== ev.city ? ev.region || '' : '',
    })
    setPlaces(ev.places?.map(p => ({ type: p.type, price: p.price, qty: p.total, maxPerAccount: p.maxPerAccount || 0, groupType: p.groupType || 'solo', groupMin: p.groupMin || '', groupMax: p.groupMax || '', photos: Array.isArray(p.photos) ? p.photos : [], included: Array.isArray(p.included) ? p.included : [] })) || [{ type: 'Entrée libre', price: 0, qty: 100, maxPerAccount: 0, groupType: 'solo', groupMin: '', groupMax: '', photos: [], included: [] }])
    setOptions({ playlist: ev.playlist || false, preorder: ev.preorder || false, qr: true })
    setMenuItems(ev.menu?.length ? ev.menu : [{ name: '', emoji: '', imageUrl: null, price: '', category: 'Boissons', description: '', hasShow: false, showOptions: [], excludedPlaces: [] }])
    setPublishAt(ev.publishAt || '')
    setClosingDate(ev.closingDate || '')
    setView('create')
  }

  // Duplique un événement : réutilise tout le pré-remplissage de startEdit, mais
  // en NOUVEL événement (editingEventId = null → la publication crée un nouvel id,
  // n'écrase pas l'original) avec la date à re-choisir. Gain de temps pour un
  // organisateur qui refait la même soirée.
  function duplicateEvent(ev) {
    startEdit(ev)
    setEditingEventId(null)
    setForm(f => ({ ...f, name: `${ev.name || 'Événement'} (copie)`, date: '' }))
    setPublishAt('')
    setClosingDate('')
  }

  function getEventBookingCount(eventId) {
    try {
      const all = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      return all.filter(b => b.eventId === String(eventId)).length
    } catch { return 0 }
  }

  // Combien de billets vendus pour une catégorie de place donnée d'un event
  function getPlaceBookingCount(eventId, placeType) {
    try {
      const all = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      return all.filter(b => b.eventId === String(eventId) && b.place === placeType).length
    } catch { return 0 }
  }

  // ── Politique de modification post-publication ──
  // Si l'event est en cours d'édition ET a au moins 1 réservation,
  // certains champs sont verrouillés (date, prix, lieu, etc.)
  const editingBookingCount = editingEventId ? getEventBookingCount(editingEventId) : 0
  const isLocked = editingBookingCount > 0
  // Précommandes existantes → verrouiller le menu et le toggle précommande
  const hasPreorders = (() => {
    if (!editingEventId) return false
    try {
      const all = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      return all.some(b => b.eventId === String(editingEventId) && b.preorderSummary?.length > 0)
    } catch { return false }
  })()
  const editingEventCancelled = (() => {
    if (!editingEventId) return false
    const ev = createdEvents.find(e => e.id === editingEventId)
    return !!ev?.cancelled
  })()
  // En cas d'event annulé, on verrouille TOUT (lecture seule)
  const isReadOnly = editingEventCancelled

  async function deleteEvent(id) {
    const sid = String(id)
    // Un event encore _pendingSync n'a jamais atteint Firestore : aucun billet
    // serveur ne peut exister → suppression locale directe, sans passer par l'API.
    const isPendingLocal = createdEvents.some(ev => String(ev.id) === sid && ev._pendingSync === true)
    if (!isPendingLocal) {
      // Cascade serveur OBLIGATOIRE (fail-closed) : purge le registre tickets/
      // et les carnets user_bookings des détenteurs, puis supprime events/{id}.
      // Sans ça, les billets déjà émis restaient orphelins et ressuscitaient
      // dans « Mes billets » à chaque sync (billets fantômes).
      try {
        const { authHeaders } = await import('../utils/apiAuth')
        const r = await fetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ action: 'delete_event', eventId: sid }),
        })
        if (r.status === 409) {
          // Des réservations existent (souvent faites depuis un autre appareil,
          // invisibles dans lib_bookings local) → flux d'annulation, pas suppression.
          const data = await r.json().catch(() => ({}))
          setCancellationMessageDraft('')
          setDeleteError('')
          setDeleteConfirm({ id, bookingCount: data.bookingCount || data.paidCount || 1 })
          return
        }
        if (!r.ok && r.status !== 404) {
          // 401/403/5xx : on NE retombe PAS sur la suppression locale — elle
          // contournerait la garde « réservations existantes » et laisserait des
          // billets orphelins impossibles à re-purger (la cascade exige events/{id}).
          const data = await r.json().catch(() => ({}))
          setDeleteError(data.error || 'Suppression impossible pour le moment — réessaie dans un instant.')
          return
        }
        // 2xx (cascade OK) ou 404 (déjà supprimé côté serveur) → on poursuit.
      } catch {
        // Vraie erreur réseau : même principe fail-closed.
        setDeleteError('Connexion impossible — vérifie ta connexion et réessaie.')
        return
      }
    }

    // Tombstone : marque l'event comme supprimé pour empêcher le "merge robuste"
    // du listener de le ressusciter. Sinon un snapshot Firestore périmé pouvait
    // le réinjecter dans le state, puis le merge le gardait à vie comme « event
    // local pas encore synchronisé » → il restait affiché chez l'organisateur.
    try {
      const tomb = JSON.parse(localStorage.getItem('lib_deleted_events') || '[]')
      if (!tomb.includes(sid)) localStorage.setItem('lib_deleted_events', JSON.stringify([...tomb, sid].slice(-200)))
    } catch {}
    const updated = createdEvents.filter(ev => String(ev.id) !== sid)
    localStorage.setItem('lib_created_events', JSON.stringify(updated))
    setCreatedEvents(updated)
    setDeleteConfirm(null)
    setDeleteError('')
    setCancellationMessageDraft('')
    // events/{id} est déjà supprimé par la cascade (ou n'a jamais existé pour un
    // _pendingSync) — il ne reste qu'à mettre à jour la liste de l'organisateur.
    import('../utils/firestore-sync').then(async ({ syncDoc }) => {
      if (user?.uid) {
        const { sanitizeEventsForSync } = await import('../utils/uploadImage')
        syncDoc(`user_events/${user.uid}`, { items: await sanitizeEventsForSync(updated) })
      }
    }).catch(() => {})
  }

  // Annule l'event sans le supprimer pour de vrai — utilisé quand des réservations existent
  // Le client gardera accès à son billet avec le message de l'organisateur + bouton support
  async function cancelEventWithMessage(id, message) {
    const sid = String(id)
    setDeleteError('')
    // Serveur = AUTORITÉ (#71) : marque annulé, REMBOURSE les acheteurs (carte
    // automatique / mobile money mis en liste), annule les billets, libère le
    // stock, bloque le versement à l'organisateur. Fail-closed : si l'appel
    // échoue, on NE marque PAS annulé localement — sinon l'organisateur croirait
    // les acheteurs remboursés alors que rien n'a bougé. Un event _pendingSync
    // n'a jamais atteint le serveur (aucun billet payé) → annulation locale directe.
    const isPendingLocal = createdEvents.some(ev => String(ev.id) === sid && ev._pendingSync === true)
    if (!isPendingLocal) {
      setCancelBusy(true)
      try {
        const { authHeaders } = await import('../utils/apiAuth')
        const r = await fetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ action: 'cancel_event', eventId: sid, reason: message || '' }),
        })
        if (!r.ok) {
          const data = await r.json().catch(() => ({}))
          setDeleteError(data.error || "Annulation impossible pour le moment — réessaie dans un instant.")
          setCancelBusy(false)
          return
        }
        // Prévenir les acheteurs par e-mail (fire-and-forget, idempotent serveur).
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ type: 'event_cancelled', eventId: sid }),
        }).catch(() => {})
      } catch {
        setDeleteError("Connexion impossible — vérifie ta connexion et réessaie.")
        setCancelBusy(false)
        return
      }
      setCancelBusy(false)
    }
    const updated = createdEvents.map(ev =>
      ev.id === id
        ? { ...ev, cancelled: true, cancellationMessage: message || '', cancelledAt: new Date().toISOString() }
        : ev
    )
    localStorage.setItem('lib_created_events', JSON.stringify(updated))
    setCreatedEvents(updated)
    setDeleteConfirm(null)
    setCancellationMessageDraft('')
    // Sync à Firestore — l'event reste dans la collection events/ pour que les billets
    // existants puissent toujours afficher le message d'annulation cross-device.
    // Écriture MINIMALE (merge des 3 champs seulement) : ré-écrire l'event entier
    // avec son image pouvait échouer silencieusement (taille, règles) → l'annulation
    // restait locale et l'admin ne voyait jamais l'event annulé.
    const cancelledEvent = updated.find(ev => ev.id === id)
    import('../utils/firestore-sync').then(async ({ syncDoc }) => {
      syncDoc(`events/${id}`, {
        cancelled: true,
        cancellationMessage: cancelledEvent?.cancellationMessage || message || '',
        cancelledAt: cancelledEvent?.cancelledAt || new Date().toISOString(),
        // Identité minimale (merge) : si le doc n'existait pas encore côté
        // serveur, l'admin voit quand même QUI/QUOI a été annulé
        ...(cancelledEvent ? {
          id: String(cancelledEvent.id),
          name: cancelledEvent.name || '',
          city: cancelledEvent.city || '',
          date: cancelledEvent.date || '',
          dateDisplay: cancelledEvent.dateDisplay || '',
          organizer: cancelledEvent.organizer || '',
          createdBy: cancelledEvent.createdBy || user?.uid || '',
        } : {}),
      })
      if (user?.uid) {
        const { sanitizeEventsForSync } = await import('../utils/uploadImage')
        syncDoc(`user_events/${user.uid}`, { items: await sanitizeEventsForSync(updated) })
      }
    }).catch(() => {})
  }

  // Retire un event ANNULÉ de la liste de l'organisateur (il reste dans events/
  // pour que les détenteurs de billet voient toujours le message d'annulation).
  // Tombstone local + retrait de user_events → disparaît du dashboard de l'orga
  // partout, sans casser l'accès billet côté client.
  function hideCancelledEvent(id) {
    const sid = String(id)
    try {
      const tomb = JSON.parse(localStorage.getItem('lib_deleted_events') || '[]')
      if (!tomb.includes(sid)) localStorage.setItem('lib_deleted_events', JSON.stringify([...tomb, sid].slice(-200)))
    } catch {}
    const updated = createdEvents.filter(ev => String(ev.id) !== sid)
    localStorage.setItem('lib_created_events', JSON.stringify(updated))
    setCreatedEvents(updated)
    import('../utils/firestore-sync').then(async ({ syncDoc }) => {
      if (user?.uid) {
        const { sanitizeEventsForSync } = await import('../utils/uploadImage')
        syncDoc(`user_events/${user.uid}`, { items: await sanitizeEventsForSync(updated) })
      }
    }).catch(() => {})
  }

  // ─── Guestlist ──────────────────────────────────────────────────────────────
  function openGuestlistModal(ev) {
    setGuestlistTargetEvent(ev)
    setGuestlistItems(getGuestlist(ev.id))
    setGuestForm({ name: '', phone: '', note: '', placeType: ev.places?.[0]?.type || 'Invité' })
    setGuestlistError('')
    setShowGuestlistModal(true)
    setGuestlistLoading(true)
    loadGuestlistRemote(ev.id).then(items => { setGuestlistItems(items); setGuestlistLoading(false) })
  }

  async function handleAddGuest() {
    if (!guestlistTargetEvent) return
    setGuestlistError('')
    setGuestlistAdding(true)
    const res = await addGuestlistEntry(guestlistTargetEvent, guestForm, user?.uid)
    setGuestlistAdding(false)
    if (!res.ok) { setGuestlistError(res.error || "Impossible d'ajouter cet invité."); return }
    setGuestlistItems(getGuestlist(guestlistTargetEvent.id))
    setGuestForm(f => ({ ...f, name: '', phone: '', note: '' }))
  }

  async function handleRemoveGuest(entryId) {
    if (!guestlistTargetEvent) return
    await removeGuestlistEntry(guestlistTargetEvent.id, entryId)
    setGuestlistItems(getGuestlist(guestlistTargetEvent.id))
  }

  function copyGuestLink(entry) {
    const url = `${window.location.origin}/ticket/${entry.ticketToken}`
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedGuestId(entry.id)
      setTimeout(() => setCopiedGuestId(null), 1800)
    }).catch(() => {})
  }

  function copyAllCodes() {
    const text = (generatedCodes || []).map(c => c.code).join('\n')
    navigator.clipboard?.writeText(text).then(() => {
      setCodesCopied(true)
      setTimeout(() => setCodesCopied(false), 1800)
    }).catch(() => {})
  }
  function copyOneCode(code, idx) {
    navigator.clipboard?.writeText(code).then(() => {
      setCopiedCodeIdx(idx)
      setTimeout(() => setCopiedCodeIdx(null), 1400)
    }).catch(() => {})
  }

  // ─── Guards (after all hooks — respects Rules of Hooks) ───────────────────────
  // Compte en attente de validation
  if (user?.status === 'pending') {
    return (
      <Layout>
        <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', margin: '0 auto 24px',
              background: 'rgba(200,169,110,0.10)', border: '1px solid rgba(200,169,110,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconHourglass size={32} color="#c8a96e" />
            </div>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c8a96e', marginBottom: 12 }}>
              Validation en cours
            </p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 24 }}>
              Ton compte organisateur est en attente de validation par l'équipe LIVEINBLACK. Tu pourras créer des événements dès que ton dossier sera approuvé.
            </p>
            <button onClick={() => navigate('/mon-dossier')}
              style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '11px 20px', cursor: 'pointer' }}>
              Voir mon dossier
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  if (!userCanCreate) {
    return (
      <Layout>
        <div style={{ padding: '60px 20px', textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)" style={{ marginBottom: 16 }}>
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
          </svg>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>
            Accès restreint
          </p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 20 }}>
            {getCreateEventBlockedReason(user)}
          </p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6 }}>
            Pour créer des événements, tu dois avoir un compte organisateur validé.
          </p>
        </div>
      </Layout>
    )
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────────
  if (view === 'dashboard') {
    return (
      <Layout>
        <style>{`
          .event-manage-list{display:flex;flex-direction:column;gap:14px}
          .event-manage-card{display:grid;grid-template-columns:minmax(390px,1.25fr) minmax(390px,.9fr);min-height:220px;overflow:hidden;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:#0e0f16;box-shadow:0 8px 24px rgba(0,0,0,.35)}
          .event-manage-main{display:grid;grid-template-columns:minmax(190px,.8fr) 1fr;min-width:0;padding:0;border:0;border-right:1px solid rgba(255,255,255,.08);background:transparent;color:#fff;text-align:left;cursor:pointer}
          .event-manage-media{min-height:220px;background:#12131c;background-size:cover;background-position:center;display:grid;place-items:center}
          .event-manage-media svg{width:42px;fill:none;stroke:rgba(200,169,110,.7);stroke-width:1.2}
          .event-manage-copy{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:28px;min-width:0}
          .event-manage-copy h3{font:600 22px Inter,sans-serif;letter-spacing:-.025em;margin:13px 0 6px;max-width:100%;overflow:hidden;text-overflow:ellipsis}
          .event-manage-copy p{font:500 12px Inter,sans-serif;letter-spacing:.04em;color:rgba(255,255,255,.5);margin:0;text-transform:uppercase}
          .event-status{font:700 11px Inter,sans-serif;letter-spacing:.04em;text-transform:uppercase;color:#4ee8c8;border:1px solid rgba(78,232,200,.35);background:rgba(78,232,200,.14);padding:4px 10px;border-radius:8px}
          .event-open-link{font:500 12px Inter,sans-serif;color:rgba(255,255,255,.55);margin-top:24px}
          .event-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:18px;align-content:center}
          .event-action{min-height:52px;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--action-color) 26%,transparent);background:color-mix(in srgb,var(--action-color) 7%,transparent);color:rgba(255,255,255,.82);font:600 12px Inter,sans-serif;cursor:pointer;text-align:left;transition:transform .18s ease,border-color .18s ease,background .18s ease}
          .event-action:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--action-color) 55%,transparent);background:color-mix(in srgb,var(--action-color) 12%,transparent)}
          .event-action-icon{width:27px;height:27px;display:grid;place-items:center;border-radius:7px;background:color-mix(in srgb,var(--action-color) 10%,transparent);color:var(--action-color);flex:none}
          .event-action-icon svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
          @media(max-width:980px){.event-manage-card{grid-template-columns:1fr}.event-manage-main{border-right:0;border-bottom:1px solid rgba(255,255,255,.08)}}
          @media(max-width:600px){.event-manage-card{border-radius:14px}.event-manage-main{grid-template-columns:1fr}.event-manage-media{min-height:180px}.event-manage-copy{padding:19px}.event-manage-copy h3{font-size:20px}.event-open-link{margin-top:16px}.event-action-grid{padding:12px;gap:7px}.event-action{min-height:50px;padding:9px;font-size:11px}.event-action-icon{width:25px;height:25px}}
        `}</style>
        <div style={{ position: 'relative', zIndex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Page header */}
          <div>
            <h2 style={{ fontFamily: "Inter, sans-serif", fontSize: 38, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0, letterSpacing: '0.02em', lineHeight: 1.1 }}>
              Mes <span style={{ color: '#c8a96e' }}>Événements</span>
            </h2>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
              Crée et gère tes soirées
            </p>
          </div>

          {/* Panneau « Reversements » retiré volontairement (décision produit) :
              les paiements FCFA passent par FedaPay configuré — plus de demande
              manuelle de reversement ici. Ne pas le réintroduire. */}

          {/* Bandeau d'erreur de sync — l'event n'a pas pu être publié sur Firestore */}
          {syncErrorBanner && (
            <div style={{
              background: '#12131c',
              border: '1px solid rgba(224,90,170,0.5)',
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(220,100,100,0.95)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <circle cx="12" cy="16" r="0.6" fill="rgba(220,100,100,0.95)"/>
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(220,100,100,0.95)', margin: 0, marginBottom: 4 }}>
                    {syncErrorBanner.title}
                  </p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
                    {syncErrorBanner.message}
                  </p>
                </div>
                <button onClick={() => setSyncErrorBanner(null)} aria-label="Fermer" style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(220,100,100,0.7)', fontSize: 18, lineHeight: 1, padding: 0,
                }}>×</button>
              </div>
              {syncErrorBanner.retry && (
                <button
                  onClick={syncErrorBanner.retry}
                  style={{
                    alignSelf: 'flex-start', marginLeft: 30,
                    fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600,
                    color: 'rgba(255,255,255,0.9)',
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 10, padding: '9px 16px', cursor: 'pointer',
                  }}
                >
                  Réessayer la publication
                </button>
              )}
            </div>
          )}

          {/* Quick actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={startCreate} style={{ flex: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
              <div style={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 14,
                border: '1px solid rgba(200,169,110,0.30)',
                background: '#0e0f16',
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                padding: 20,
                height: '100%',
              }}>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c8a96e', marginBottom: 6 }}>Nouveau</p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.92)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>Créer un événement</p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.45)' }}>De A à Z — lieux, places, options</p>
                <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.10 }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="#c8a96e"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
                </div>
              </div>
            </button>

            <button onClick={() => navigate('/ma-page-organisateur')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
              <div style={{
                position: 'relative', overflow: 'hidden', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#0e0f16',
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(78,232,200,0.10)', border: '1px solid rgba(78,232,200,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3"/><path d="M5 20c0-4 3-7 7-7s7 3 7 7"/><path d="M18 4h3v3"/></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4ee8c8', marginBottom: 4 }}>Audience</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,0.92)', margin: 0 }}>Ma page publique</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>Active ta page pour apparaître chez les clients</p>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(78,232,200,0.5)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </button>

            {/* Scanner — bouton pleine largeur séparé, accent teal (outil d'entrée) */}
            <button onClick={() => navigate('/scanner')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
              <div style={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#0e0f16',
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}>
                {/* Viseur de scan */}
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: 'rgba(78,232,200,0.10)',
                  border: '1px solid rgba(78,232,200,0.30)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
                    <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                    <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
                    <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4ee8c8', marginBottom: 4 }}>Entrée</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,0.92)', margin: 0, letterSpacing: '-0.01em' }}>Scanner les billets</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>Vérifie les QR à l'entrée en temps réel</p>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(78,232,200,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </button>
          </div>

          {/* Analytics — ventes réelles (registre tickets/) */}
          {salesError ? (
            <div style={{ background: '#12131c', border: '1px solid rgba(220,160,50,0.4)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.6 }}>
                Impossible de charger tes statistiques de vente. Vérifie ta connexion.
              </p>
              <button onClick={() => setSalesRetry(n => n + 1)}
                style={{ padding: '9px 16px', borderRadius: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.9)', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600 }}>
                Réessayer
              </button>
            </div>
          ) : (
            <OrganizerAnalytics
              events={createdEvents.filter(ev => !ev.createdBy || ev.createdBy === user?.uid || ev.organizerId === user?.uid)}
              tickets={salesTickets}
              loading={salesLoading}
            />
          )}

          {/* Events list */}
          <div>
            {(() => {
              const uid = user?.uid
              // Mes événements = créés par ce compte OU sans createdBy (legacy)
              const myEvents = createdEvents.filter(ev =>
                !ev.createdBy ||
                ev.createdBy === uid ||
                ev.organizerId === uid
              )
              // Les events ANNULÉS sortent de "en cours"/"passés" et vont dans leur
              // propre section (ils restent en base pour les détenteurs de billet).
              const upcomingEvents = myEvents.filter(ev => !isEventPast(ev) && !ev.cancelled)
              const pastEvents = myEvents.filter(ev => isEventPast(ev) && !ev.cancelled)
              const cancelledEvents = myEvents.filter(ev => ev.cancelled)
              return (
                <>
            <Eyebrow style={{ marginBottom: 14 }}>Mes soirées en cours</Eyebrow>
            {upcomingEvents.length === 0 ? (
              <div style={{ ...S.card, padding: 40, textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                  </svg>
                </div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Aucun événement pour l'instant</p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Crée ton premier événement pour le retrouver ici.</p>
              </div>
            ) : (
              <div className="event-manage-list">
                {upcomingEvents.map(ev => <EventDashboardCard key={ev.id} event={ev}
                  onOpen={() => navigate(`/evenements/${ev.id}`)}
                  onStats={() => navigate(`/mes-evenements/${ev.id}/statistiques`)}
                  onBookings={() => { setBookingsPanelEvent(ev); setShowBookingsPanel(true) }}
                  onBoost={() => { setBoostTargetEvent(ev); setShowBoostModal(true) }}
                  onGuests={() => openGuestlistModal(ev)} onStaff={() => setStaffTargetEvent(ev)}
                  onPromo={() => setPromoTargetEvent(ev)}
                  onCodes={() => { setCodesTargetEvent(ev); setGeneratedCodes(null); setCodesQty(10); setShowCodesModal(true) }}
                  onDuplicate={() => duplicateEvent(ev)}
                  onEdit={() => startEdit(ev)}
                  onDelete={() => { setDeleteError(''); setDeleteConfirm({ id: ev.id, bookingCount: getEventBookingCount(ev.id) }) }}
                />)}
              </div>
            )}

            {/* ── Événements annulés ── */}
            {cancelledEvents.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <Eyebrow style={{ marginBottom: 14 }}>Annulés</Eyebrow>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {cancelledEvents.map(ev => (
                    <div key={ev.id} style={{ ...S.card, padding: 14, display: 'flex', alignItems: 'center', gap: 12, opacity: 0.9 }}>
                      <button onClick={() => navigate(`/evenements/${ev.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                        {ev.imageUrl ? (
                          <img src={ev.imageUrl} alt={ev.name} style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0, filter: 'grayscale(60%)' }} />
                        ) : (
                          <div style={{ width: 52, height: 52, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.78)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</p>
                          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{ev.dateDisplay} · {ev.city}</p>
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#e05aaa', background: 'rgba(224,90,170,0.14)', border: '1px solid rgba(224,90,170,0.35)', padding: '4px 10px', borderRadius: 8, marginTop: 4, display: 'inline-block' }}>
                            Annulé
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={() => hideCancelledEvent(ev.id)}
                        title="Retirer de ma liste"
                        style={{ flexShrink: 0, padding: '9px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.9)', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Retirer de ma liste
                      </button>
                    </div>
                  ))}
                </div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginTop: 8 }}>
                  Les événements annulés restent accessibles aux personnes ayant déjà un billet (elles voient ton message d'annulation). « Retirer de ma liste » les enlève seulement de ton tableau de bord.
                </p>
              </div>
            )}

            {/* ── Événements passés ── */}
            {pastEvents.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <Eyebrow style={{ marginBottom: 14 }}>Événements passés</Eyebrow>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pastEvents.map(ev => {
                    const evBookings = (() => { try { return JSON.parse(localStorage.getItem('lib_bookings') || '[]').filter(b => String(b.eventId) === String(ev.id)) } catch { return [] } })()
                    const totalRevenue = evBookings.reduce((s, b) => s + (b.totalPrice || 0), 0)
                    return (
                      <div key={ev.id} style={{ ...S.card, padding: 14, display: 'flex', alignItems: 'center', gap: 12, opacity: 0.85 }}>
                        <button onClick={() => navigate(`/evenements/${ev.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                          {ev.imageUrl ? (
                            <img src={ev.imageUrl} alt={ev.name} style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0, filter: 'grayscale(30%)' }} />
                          ) : (
                            <div style={{ width: 52, height: 52, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.75)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</p>
                            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{ev.dateDisplay} · {ev.city}</p>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '4px 10px', borderRadius: 8 }}>
                                Terminé
                              </span>
                              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: '#c8a96e', alignSelf: 'center' }}>
                                {evBookings.length} billet{evBookings.length !== 1 ? 's' : ''} · {fmtMoney(Math.round(totalRevenue), eventCurrency(ev))}
                              </span>
                            </div>
                          </div>
                        </button>
                        {/* Bouton Statistiques */}
                        <button
                          onClick={() => navigate(`/mes-evenements/${ev.id}/statistiques`)}
                          title="Statistiques"
                          style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(78,232,200,0.14)', border: '1px solid rgba(78,232,200,0.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 2 }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

                </>
              )
            })()}
          </div>

          {/* Delete confirmation modal */}
          {deleteConfirm && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={() => setDeleteConfirm(null)} />
              <div style={{ ...S.card, background: '#12131c', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.55)', position: 'relative', padding: 24, width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: 0 }}>Supprimer l'événement ?</p>

                {deleteConfirm.bookingCount > 0 ? (
                  /* Cas : réservations existantes — on annule (pas de suppression dure) */
                  <>
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(220,160,50,0.35)', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ flexShrink: 0, display: 'inline-flex', marginTop: 1 }}><IconAlert size={18} color="rgba(255,210,110,0.9)" /></span>
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, margin: 0 }}>
                        <strong>{deleteConfirm.bookingCount} réservation{deleteConfirm.bookingCount > 1 ? 's' : ''}</strong> {deleteConfirm.bookingCount > 1 ? 'ont' : 'a'} déjà eu lieu. En confirmant, <strong>les acheteurs sont remboursés automatiquement</strong> (carte bancaire) ou placés dans ta liste de remboursement mobile money — tu ne touches jamais l'argent d'un événement annulé, et chaque acheteur est prévenu par e-mail.
                      </p>
                    </div>

                    <div>
                      <label style={{ ...S.label, marginBottom: 6 }}>
                        Message aux acheteurs <span style={{ color: 'rgba(255,255,255,0.38)' }}>(optionnel)</span>
                      </label>
                      <textarea
                        value={cancellationMessageDraft}
                        onChange={e => setCancellationMessageDraft(e.target.value)}
                        placeholder="Ex : L'événement est annulé pour cause de force majeure. Un remboursement intégral sera effectué sous 5 jours ouvrés via votre moyen de paiement initial. Pour toute question, contactez-nous."
                        rows={4}
                        maxLength={500}
                        style={{
                          ...S.inputBase,
                          resize: 'vertical',
                          minHeight: 90,
                          lineHeight: 1.6,
                        }}
                      />
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 5, lineHeight: 1.6 }}>
                        Ce message s'affichera sur le billet de chaque acheteur, accompagné d'un bouton de contact support. ({cancellationMessageDraft.length}/500)
                      </p>
                    </div>

                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0 }}>
                      L'événement sera marqué <strong style={{ color: '#e05aaa' }}>Annulé</strong> et retiré du site, mais restera accessible aux personnes ayant un billet pour qu'elles voient ce message.
                    </p>

                    {deleteError && (
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#dc7777', lineHeight: 1.6, margin: 0 }}>{deleteError}</p>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setDeleteConfirm(null); setCancellationMessageDraft(''); setDeleteError('') }} disabled={cancelBusy} style={{ ...S.btnGhost, flex: 1, ...(cancelBusy ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}>Retour</button>
                      <button onClick={() => cancelEventWithMessage(deleteConfirm.id, cancellationMessageDraft.trim())} disabled={cancelBusy} style={{ ...S.btnDanger, flex: 1, ...(cancelBusy ? { opacity: 0.6, cursor: 'wait' } : {}) }}>{cancelBusy ? 'Annulation en cours…' : "Confirmer l'annulation"}</button>
                    </div>
                  </>
                ) : (
                  /* Cas : aucune réservation — suppression directe */
                  <>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: 0 }}>
                      Cette action est irréversible. L'événement sera retiré de la liste.
                    </p>
                    {deleteError && (
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: '#dc7777', lineHeight: 1.6, margin: 0 }}>
                        {deleteError}
                      </p>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setDeleteConfirm(null); setDeleteError('') }} style={{ ...S.btnGhost, flex: 1 }}>Annuler</button>
                      <button onClick={() => deleteEvent(deleteConfirm.id)} style={{ ...S.btnDanger, flex: 1 }}>Supprimer</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bookings panel */}
        {showBookingsPanel && bookingsPanelEvent && (
          <BookingsPanel event={bookingsPanelEvent} onClose={() => setShowBookingsPanel(false)} />
        )}

        {/* Stats panel */}
        {showStatsPanel && statsPanelEvent && (
          <StatsPanel event={statsPanelEvent} onClose={() => setShowStatsPanel(false)} />
        )}

        {/* Boost toast */}
        {showBoostToast && justPublishedEvent && (
          <div style={{ position: 'fixed', bottom: 96, right: 16, zIndex: 50, maxWidth: 280 }}>
            <div
              style={{ ...S.card, background: '#12131c', boxShadow: '0 24px 64px rgba(0,0,0,0.55)', padding: 16, borderColor: 'rgba(224,90,170,0.40)', cursor: 'pointer' }}
              onClick={() => {
                clearTimeout(toastTimerRef.current)
                setShowBoostToast(false)
                setBoostTargetEvent(justPublishedEvent)
                setShowBoostModal(true)
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e05aaa" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/>
                  <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/>
                </svg>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.93)' }}>Booste ton événement</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4, lineHeight: 1.6 }}>
                    Apparais dans le Top 3 régional et multiplie ta visibilité.
                  </p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#e05aaa', marginTop: 6 }}>Voir les offres</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); clearTimeout(toastTimerRef.current); setShowBoostToast(false); navigate('/evenements') }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', flexShrink: 0, padding: 2, display: 'flex', alignItems: 'center' }}
                >
                  <IconClose size={14} color="rgba(255,255,255,0.4)" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Boost modal */}
        {showBoostModal && boostTargetEvent && (
          <BoostModal
            event={boostTargetEvent}
            onClose={() => setShowBoostModal(false)}
            onBoostDone={() => { setShowBoostModal(false); navigate('/evenements') }}
          />
        )}

        {/* Codes generation modal */}
        {showCodesModal && codesTargetEvent && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={() => { setShowCodesModal(false); setGeneratedCodes(null) }} />
            <div style={{ ...S.card, background: '#12131c', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.55)', position: 'relative', padding: 24, width: '100%', maxWidth: 360, maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: 0 }}>Codes d'accès</p>
                </div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
                  Génère des codes uniques pour{' '}
                  <span style={{ color: '#c8a96e' }}>{codesTargetEvent.name}</span>
                </p>
              </div>
              {!generatedCodes ? (
                <>
                  <div>
                    <label style={S.label}>Nombre de codes à générer</label>
                    <InputField
                      type="number"
                      value={codesQty}
                      onChange={e => setCodesQty(e.target.value)}
                      placeholder="10"
                    />
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>100 codes maximum par génération</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setShowCodesModal(false)} style={{ ...S.btnGhost, flex: 1 }}>Annuler</button>
                    <button onClick={generateCodes} style={{ ...S.btnGold, flex: 1 }}>Générer</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(78,232,200,0.35)', borderRadius: 12, padding: '10px 14px' }}>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#4ee8c8' }}>{generatedCodes.length} codes générés</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                    {generatedCodes.map((c, i) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: '#c8a96e', letterSpacing: '0.08em' }}>{c.code}</span>
                        <button onClick={() => copyOneCode(c.code, i)} style={{ padding: '8px 14px', borderRadius: 10, cursor: 'pointer', background: copiedCodeIdx === i ? '#3ed6b5' : 'rgba(255,255,255,0.08)', border: copiedCodeIdx === i ? 'none' : '1px solid rgba(255,255,255,0.14)', color: copiedCodeIdx === i ? '#04120e' : 'rgba(255,255,255,0.9)', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{copiedCodeIdx === i ? 'Copié' : 'Copier'}</button>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
                    Copie et envoie ces codes à tes invités. Chaque code ne peut être utilisé qu'une seule fois.
                  </p>
                  <button onClick={copyAllCodes} style={{ ...S.btnGold, width: '100%' }}>{codesCopied ? 'Tous les codes copiés' : 'Copier tous les codes'}</button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setGeneratedCodes(null)} style={{ ...S.btnGhost, flex: 1 }}>Générer d'autres codes</button>
                    <button onClick={() => { setShowCodesModal(false); setGeneratedCodes(null) }} style={{ ...S.btnGhost, flex: 1 }}>Fermer</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Guestlist modal */}
        {showGuestlistModal && guestlistTargetEvent && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={() => setShowGuestlistModal(false)} />
            <div style={{ ...S.card, background: '#12131c', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.55)', position: 'relative', padding: 24, width: '100%', maxWidth: 420, maxHeight: '86vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="1.5"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: 0 }}>Guestlist</p>
                  </div>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
                    Invitations pour <span style={{ color: '#4ee8c8' }}>{guestlistTargetEvent.name}</span>
                    {guestlistItems.length > 0 && (
                      <> · {guestlistItems.length} invité{guestlistItems.length > 1 ? 's' : ''} · {guestlistItems.filter(g => g.checkedInAt).length} arrivé{guestlistItems.filter(g => g.checkedInAt).length > 1 ? 's' : ''}</>
                    )}
                  </p>
                </div>
                <button onClick={() => setShowGuestlistModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                  <IconClose size={14} color="rgba(255,255,255,0.4)" />
                </button>
              </div>

              {/* Add guest form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14 }}>
                <InputField label="Nom de l'invité" value={guestForm.name} onChange={e => setGuestForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex : Aminata Koné" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <InputField label="Téléphone (optionnel)" value={guestForm.phone} onChange={e => setGuestForm(f => ({ ...f, phone: e.target.value }))} placeholder="+228 90 00 00 00" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={S.label}>Type de place</label>
                    {guestlistTargetEvent.places?.length ? (
                      <select
                        value={guestForm.placeType}
                        onChange={e => setGuestForm(f => ({ ...f, placeType: e.target.value }))}
                        style={{ ...S.inputBase, cursor: 'pointer' }}
                      >
                        {guestlistTargetEvent.places.map(p => (
                          <option key={p.type} value={p.type}>{p.type}{p.price > 0 ? ` (offert, ${fmtMoney(p.price, eventCurrency(guestlistTargetEvent))})` : ''}</option>
                        ))}
                      </select>
                    ) : (
                      <InputField value={guestForm.placeType} onChange={e => setGuestForm(f => ({ ...f, placeType: e.target.value }))} placeholder="Invité" />
                    )}
                  </div>
                </div>
                <InputField label="Note (optionnel)" value={guestForm.note} onChange={e => setGuestForm(f => ({ ...f, note: e.target.value }))} placeholder="Ex : table 4, presse, artiste…" />
                {guestlistError && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', margin: 0 }}>{guestlistError}</p>}
                <button onClick={handleAddGuest} disabled={guestlistAdding || !guestForm.name.trim()} style={{ ...S.btnTeal, ...(guestlistAdding || !guestForm.name.trim() ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'not-allowed', boxShadow: 'none' } : {}) }}>
                  {guestlistAdding ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                      <span className="lib-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} />
                      Ajout…
                    </span>
                  ) : 'Ajouter à la guestlist'}
                </button>
              </div>

              {/* Guest list */}
              {guestlistLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
                  <span className="lib-spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} />
                </div>
              ) : guestlistItems.length === 0 ? (
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '12px 0', lineHeight: 1.6 }}>
                  Pas encore d'invité — ajoute le premier ci-dessus.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {guestlistItems.map(g => {
                    const link = `${window.location.origin}/ticket/${g.ticketToken}`
                    const waLink = g.phone ? `https://wa.me/${g.phone.replace(/[^\d+]/g, '').replace(/^\+/, '')}?text=${encodeURIComponent(`Salut ${g.name} ! Voici ton entrée pour ${guestlistTargetEvent.name} : ${link}`)}` : null
                    return (
                      <div key={g.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</p>
                            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>
                              {g.place}{g.note ? ` · ${g.note}` : ''}
                            </p>
                          </div>
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0, color: g.checkedInAt ? '#22c55e' : 'rgba(255,255,255,0.45)' }}>
                            {g.checkedInAt ? 'Arrivé' : 'En attente'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button onClick={() => copyGuestLink(g)} style={{ flex: 1, padding: '9px', borderRadius: 10, cursor: 'pointer', background: copiedGuestId === g.id ? '#3ed6b5' : 'rgba(255,255,255,0.08)', border: copiedGuestId === g.id ? 'none' : '1px solid rgba(255,255,255,0.14)', color: copiedGuestId === g.id ? '#04120e' : 'rgba(255,255,255,0.9)', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>
                            {copiedGuestId === g.id ? 'Copié' : 'Copier le lien'}
                          </button>
                          {waLink && (
                            <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '9px', borderRadius: 10, textAlign: 'center', textDecoration: 'none', background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600 }}>
                              WhatsApp
                            </a>
                          )}
                          {!g.checkedInAt && (
                            <button onClick={() => handleRemoveGuest(g.id)} title="Retirer" style={{ padding: '9px 12px', borderRadius: 10, cursor: 'pointer', background: 'rgba(224,90,170,0.14)', border: '1px solid rgba(224,90,170,0.55)', color: '#ff9ed2', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>
                              <IconClose size={11} color="#ff9ed2" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: 0 }}>
                Chaque invité reçoit un billet réel (gratuit) à ce lien — il le présente à l'entrée, le videur le scanne comme n'importe quel billet.
              </p>
            </div>
          </div>
        )}

        {/* Modal Équipe / staff de la soirée */}
        {staffTargetEvent && (
          <EventStaffModal event={staffTargetEvent} user={user} onClose={() => setStaffTargetEvent(null)} />
        )}

        {/* Panneau Codes promo (réductions par billet, modèle Shotgun) */}
        {promoTargetEvent && (
          <PromoCodesPanel event={promoTargetEvent} onClose={() => setPromoTargetEvent(null)} />
        )}
      </Layout>
    )
  }

  // ─── Create flow ─────────────────────────────────────────────────────────────
  return (
    <Layout>
      {/* Crop modal */}
      {showCropper && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', background: 'black' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <button onClick={() => setShowCropper(false)} style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)', background: 'none', border: 'none', cursor: 'pointer' }}>Annuler</button>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.93)' }}>Recadrer l'image</p>
            <button onClick={applyCrop} style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: '#fff', background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '8px 16px', cursor: 'pointer', boxShadow: '0 6px 20px rgba(122,59,242,0.35)' }}>Valider</button>
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <Cropper
              image={cropSrc}
              crop={crop}
              zoom={zoom}
              aspect={16 / 9}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 8 }}>Pince à deux doigts ou molette pour zoomer</p>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#c8a96e' }}
            />
          </div>
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => createStep === 0 ? setView('dashboard') : setCreateStep(s => s - 1)}
            style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.93)', margin: 0 }}>
              {editingEventId ? "Modifier l'événement" : 'Créer un événement'}
            </p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              Étape {createStep + 1}/{CREATION_STEPS.length} — {CREATION_STEPS[createStep]}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4 }}>
          {CREATION_STEPS.map((s, i) => (
            <div key={s} style={{ flex: 1, height: 2, borderRadius: 2, background: i <= createStep ? '#c8a96e' : 'rgba(255,255,255,0.06)', transition: 'background 0.3s' }} />
          ))}
        </div>

        {/* Bannière de modification post-publication — billets déjà vendus */}
        {editingEventId && isLocked && !isReadOnly && (
          <div style={{
            background: '#12131c',
            border: '1px solid rgba(200,169,110,0.35)',
            borderRadius: 12, padding: '14px 16px',
            display: 'flex', gap: 12, alignItems: 'flex-start',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <rect x="4" y="11" width="16" height="10" rx="2"/>
              <path d="M8 11 V7 a4 4 0 0 1 8 0 V11"/>
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#c8a96e', margin: 0, marginBottom: 4 }}>
                {editingBookingCount} billet{editingBookingCount > 1 ? 's' : ''} déjà vendu{editingBookingCount > 1 ? 's' : ''}
              </p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
                Pour ne pas léser les acheteurs, certains champs sont verrouillés (date, heures, lieu, prix existants, type d'événement, âge minimum, options, date de publication). Tu peux toujours modifier la description, l'affiche, les artistes et la date de clôture.
              </p>
            </div>
          </div>
        )}

        {/* Bannière event annulé : lecture seule complète */}
        {isReadOnly && (
          <div style={{
            background: '#12131c',
            border: '1px solid rgba(224,90,170,0.5)',
            borderRadius: 12, padding: '14px 16px',
            display: 'flex', gap: 12, alignItems: 'flex-start',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(220,100,100,0.95)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <circle cx="12" cy="16" r="0.6" fill="rgba(220,100,100,0.95)"/>
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(220,100,100,0.95)', margin: 0, marginBottom: 4 }}>
                Événement annulé
              </p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6 }}>
                Cet événement a été annulé. Les modifications sont désactivées. Pour relancer un événement similaire, crée-en un nouveau depuis ton tableau de bord.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 0: Bases ── */}
        {createStep === 0 && (
          <div className="lib-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Image upload */}
            <div>
              <label style={S.label}>Affiche / Photo de l'événement</label>
              <div
                style={{
                  position: 'relative',
                  borderRadius: 12,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  aspectRatio: '16/9',
                  border: imagePreview ? '1px solid rgba(200,169,110,0.35)' : '2px dashed rgba(255,255,255,0.14)',
                  background: '#0b0c12',
                }}
                onClick={() => imageInputRef.current?.click()}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Clique pour ajouter l'affiche</p>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Format recommandé : 1200 × 630 px</p>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>JPG, PNG ou WEBP — 5 Mo maximum</p>
                  </div>
                )}
              </div>
              <input ref={imageInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={handleImage} />
              {errors.image && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{errors.image}</p>}
            </div>

            {/* Video preview upload */}
            <div>
              <label style={S.label}>Vidéo d’aperçu au survol <span style={{ color: 'rgba(255,255,255,0.28)' }}>(optionnel)</span></label>
              <div
                style={{
                  position: 'relative',
                  minHeight: 118,
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: videoPreview ? '1px solid rgba(78,232,200,0.32)' : '1px dashed rgba(255,255,255,0.14)',
                  background: '#0b0c12',
                }}
              >
                {videoPreview ? (
                  <>
                    <video src={videoPreview} controls muted playsInline preload="metadata" style={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'cover', background: '#05060b' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: '#4ee8c8', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{videoName || 'Vidéo d’aperçu'}</p>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '3px 0 0' }}>Elle se lance après 1 seconde de survol sur les cartes événement.</p>
                      </div>
                      <button onClick={clearEventVideoPreview} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(224,90,170,0.55)', background: 'rgba(224,90,170,0.14)', color: '#ff9ed2', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Retirer
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    style={{
                      width: '100%',
                      minHeight: 118,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 13,
                      padding: 16,
                      border: 0,
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ width: 42, height: 42, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(78,232,200,0.10)', border: '1px solid rgba(78,232,200,0.28)', color: '#4ee8c8', flexShrink: 0 }}>
                      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Ajouter une courte vidéo</span>
                      <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginTop: 4 }}>MP4, WEBM ou MOV · 30 Mo maximum. Idéal : 6 à 12 secondes en 720p.</span>
                    </span>
                  </button>
                )}
              </div>
              <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: 'none' }} onChange={handleVideo} />
              {errors.video && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{errors.video}</p>}
            </div>

            {/* Basic fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <InputField label="Nom de l'événement *" placeholder="Ex: NEON NIGHT Vol.3" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} error={errors.name} />
              <InputField
                label="Date *"
                type="date"
                value={form.date}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                error={errors.date}
                locked={isLocked || isReadOnly}
              />
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <InputField label="Heure début" type="time" value={form.timeStart} onChange={e => setForm(f => ({ ...f, timeStart: e.target.value }))} locked={isLocked || isReadOnly} />
                  <InputField label="Heure fin" type="time" value={form.timeEnd} onChange={e => setForm(f => ({ ...f, timeEnd: e.target.value }))} locked={isLocked || isReadOnly} />
                </div>
                {errors.timeEnd && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{errors.timeEnd}</p>}
              </div>

              <div>
                <label style={S.label}>Description courte</label>
                <textarea
                  style={{ ...S.inputBase, resize: 'none', height: 80 }}
                  placeholder="Décris ta soirée en deux ou trois phrases…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                />
              </div>

              {/* Artists section */}
              <div style={{ ...S.card, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showArtistSection ? 12 : 0 }}>
                  <div>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.93)' }}>DJs / Artistes</p>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Affiché sur la playlist et la fiche événement</p>
                  </div>
                  <Toggle value={showArtistSection} onChange={() => setShowArtistSection(v => !v)} />
                </div>
                {showArtistSection && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {artists.map((a, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                          value={a.role}
                          onChange={e => setArtists(prev => prev.map((x, xi) => xi === i ? { ...x, role: e.target.value } : x))}
                          style={{ ...S.inputBase, width: 'auto', flexShrink: 0 }}
                        >
                          {['DJ', 'Artiste', 'MC', 'Live', 'Guest'].map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <input
                          style={{ ...S.inputBase, flex: 1 }}
                          placeholder="Nom de l'artiste"
                          value={a.name}
                          onChange={e => setArtists(prev => prev.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
                          onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                          onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                        />
                        <button
                          onClick={() => setArtists(prev => prev.filter((_, xi) => xi !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', padding: 4 }}
                        >
                          <IconClose size={13} color="rgba(220,100,100,0.9)" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setArtists(prev => [...prev, { name: '', role: 'DJ' }])}
                      style={{ padding: '10px', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, background: 'rgba(255,255,255,0.08)', cursor: 'pointer' }}
                    >
                      + Ajouter un DJ / artiste
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Event type */}
            <div>
              <label style={{ ...S.label, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                Type d'événement *
                {(isLocked || isReadOnly) && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(200,169,110,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2"/>
                    <path d="M8 11 V7 a4 4 0 0 1 8 0 V11"/>
                  </svg>
                )}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {['public', 'private'].map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      if (isLocked || isReadOnly) return
                      setEventType(t); setErrors(e => ({ ...e, eventType: null }))
                    }}
                    title={isLocked || isReadOnly ? "Verrouillé — billets déjà vendus" : undefined}
                    style={{
                      ...S.card,
                      padding: 12,
                      textAlign: 'center',
                      cursor: isLocked || isReadOnly ? 'not-allowed' : 'pointer',
                      opacity: (isLocked || isReadOnly) && eventType !== t ? 0.4 : 1,
                      borderColor: eventType === t ? 'rgba(200,169,110,0.55)' : 'rgba(255,255,255,0.08)',
                      background: eventType === t ? 'rgba(200,169,110,0.08)' : '#0e0f16',
                    }}
                  >
                    <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
                      {t === 'public' ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={eventType === t ? '#c8a96e' : 'rgba(255,255,255,0.42)'} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={eventType === t ? '#c8a96e' : 'rgba(255,255,255,0.42)'} strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      )}
                    </div>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: eventType === t ? '#c8a96e' : 'rgba(255,255,255,0.93)' }}>
                      {t === 'public' ? 'Public' : 'Privé'}
                    </p>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                      {t === 'public' ? 'Visible par tous' : 'Accès par code'}
                    </p>
                  </button>
                ))}
              </div>
              {errors.eventType && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{errors.eventType}</p>}
              {eventType === 'private' && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <InputField
                    label="Code d'accès maître (optionnel)"
                    placeholder="Ex: NEON2026"
                    value={form.privateCode}
                    onChange={e => setForm(f => ({ ...f, privateCode: e.target.value.toUpperCase() }))}
                    style={{ fontFamily: 'Inter, sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                  />
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                    Tu pourras aussi générer des codes individuels depuis ton tableau de bord après publication.
                  </p>
                </div>
              )}
            </div>

            {/* Genre */}
            <div>
              <label style={{ ...S.label, marginBottom: 8 }}>Genre musical</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {['Afrobeat', 'Rap', 'Électronique', 'R&B', 'Reggaeton', 'Dancehall', 'House', 'Autre'].map((g) => (
                  <button
                    key={g}
                    onClick={() => { setCategory(g); if (g !== 'Autre') setCustomGenre('') }}
                    style={{
                      padding: '10px',
                      borderRadius: 10,
                      border: category === g ? '1px solid rgba(200,169,110,0.55)' : '1px solid rgba(255,255,255,0.10)',
                      background: category === g ? 'rgba(200,169,110,0.10)' : '#0e0f16',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 12,
                      fontWeight: 600,
                      color: category === g ? '#c8a96e' : 'rgba(255,255,255,0.6)',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
              {/* Champ libre quand "Autre" est sélectionné */}
              {category === 'Autre' && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    autoFocus
                    type="text"
                    maxLength={40}
                    placeholder="Précise le genre (ex : Afropop, Jazz, Amapiano…)"
                    value={customGenre}
                    onChange={e => setCustomGenre(e.target.value)}
                    style={{
                      ...S.inputBase,
                      padding: '9px 14px',
                      border: customGenre.trim()
                        ? '1px solid rgba(200,169,110,0.45)'
                        : '1px solid rgba(200,169,110,0.22)',
                    }}
                  />
                </div>
              )}
            </div>

            {/* ── Ciblage & recommandations (optionnel) ──────────────────────
                Ces tags alimentent « Nos recommandations pour vous » sur
                l'accueil : plus ils sont précis, plus l'événement est proposé
                aux bons profils. Ids partagés avec le profil client. */}
            <div>
              <label style={{ ...S.label, marginBottom: 4 }}>Ciblage & recommandations</label>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: '0 0 12px' }}>
                Optionnel mais recommandé : ta soirée sera proposée en priorité aux clients dont les goûts correspondent.
              </p>

              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', margin: '0 0 7px' }}>Type de soirée</p>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
                {EVENT_TYPES.map(t => (
                  <button key={t.id} type="button" onClick={() => setPartyType(cur => cur === t.id ? '' : t.id)}
                    style={{
                      padding: '8px 12px', borderRadius: 999, cursor: 'pointer',
                      border: partyType === t.id ? '1px solid #8444ff' : '1px solid rgba(255,255,255,0.10)',
                      background: partyType === t.id ? 'rgba(132,68,255,0.14)' : 'transparent',
                      color: partyType === t.id ? '#c9b0ff' : 'rgba(255,255,255,0.5)',
                      fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700,
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>

              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', margin: '0 0 7px' }}>Styles musicaux joués</p>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
                {MUSIC_STYLES.map(s => (
                  <button key={s.id} type="button" onClick={() => setMusicStyles(cur => cur.includes(s.id) ? cur.filter(x => x !== s.id) : [...cur, s.id])}
                    style={{
                      padding: '8px 12px', borderRadius: 999, cursor: 'pointer',
                      border: musicStyles.includes(s.id) ? '1px solid rgba(78,232,200,0.55)' : '1px solid rgba(255,255,255,0.10)',
                      background: musicStyles.includes(s.id) ? 'rgba(78,232,200,0.10)' : 'transparent',
                      color: musicStyles.includes(s.id) ? '#4ee8c8' : 'rgba(255,255,255,0.5)',
                      fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700,
                    }}>
                    {s.label}
                  </button>
                ))}
              </div>

              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', margin: '0 0 7px' }}>Ambiance (3 max)</p>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {AMBIANCES.map(a => {
                  const active = ambiances.includes(a.id)
                  const full = !active && ambiances.length >= 3
                  return (
                    <button key={a.id} type="button" disabled={full}
                      onClick={() => setAmbiances(cur => active ? cur.filter(x => x !== a.id) : [...cur, a.id])}
                      style={{
                        padding: '8px 12px', borderRadius: 999, cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.35 : 1,
                        border: active ? '1px solid rgba(200,169,110,0.55)' : '1px solid rgba(255,255,255,0.10)',
                        background: active ? 'rgba(200,169,110,0.10)' : 'transparent',
                        color: active ? '#c8a96e' : 'rgba(255,255,255,0.5)',
                        fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700,
                      }}>
                      {a.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Âge légal */}
            <div>
              <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 6 }}>
                Âge minimum requis
                {(isLocked || isReadOnly) && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(200,169,110,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2"/>
                    <path d="M8 11 V7 a4 4 0 0 1 8 0 V11"/>
                  </svg>
                )}
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {[{ label: 'TOUT PUBLIC', value: 0 }, { label: '16+', value: 16 }, { label: '18+', value: 18 }, { label: '21+', value: 21 }].map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={isLocked || isReadOnly}
                    title={(isLocked || isReadOnly) ? "Verrouillé — billets déjà vendus" : undefined}
                    onClick={() => setForm(f => ({ ...f, minAge: value }))}
                    style={{
                      padding: '9px 18px',
                      borderRadius: 10,
                      border: form.minAge === value ? '1px solid rgba(78,232,200,0.55)' : '1px solid rgba(255,255,255,0.10)',
                      background: form.minAge === value ? 'rgba(78,232,200,0.12)' : '#0e0f16',
                      color: form.minAge === value ? '#4ee8c8' : 'rgba(255,255,255,0.6)',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      cursor: (isLocked || isReadOnly) ? 'not-allowed' : 'pointer',
                      opacity: (isLocked || isReadOnly) && form.minAge !== value ? 0.4 : 1,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Custom age input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={form.minAge === 0 ? '' : form.minAge}
                  placeholder="Autre âge…"
                  disabled={isLocked || isReadOnly}
                  onChange={e => {
                    if (isLocked || isReadOnly) return
                    const v = parseInt(e.target.value, 10)
                    if (e.target.value === '') { setForm(f => ({ ...f, minAge: 0 })); return }
                    if (!isNaN(v) && v >= 0 && v <= 99) setForm(f => ({ ...f, minAge: v }))
                  }}
                  style={{
                    ...S.inputBase,
                    width: 130,
                    padding: '8px 14px',
                    opacity: (isLocked || isReadOnly) ? 0.55 : 1,
                    cursor: (isLocked || isReadOnly) ? 'not-allowed' : 'text',
                  }}
                />
                <span style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.5)',
                }}>
                  {form.minAge === 0 ? 'Tout public' : `${form.minAge} ans minimum`}
                </span>
              </div>
            </div>

            <button onClick={() => validateAndNext(0)} style={S.btnGold}>Suivant</button>
          </div>
        )}

        {/* ── Step 1: Places & Prix ── */}
        {createStep === 1 && (
          <div className="lib-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: '0 0 4px' }}>Tes types de places</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Configure chaque type de place que tu veux proposer.</p>
            </div>

            {/* Devise explicite : l'organisateur voit clairement dans quelle devise
                il fixe ses prix et par quel moyen les billets seront payés. */}
            {(() => {
              const cur = orgCurrency || regionToCurrency(form.region)
              const isXof = cur === 'XOF'
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${isXof ? '#4ee8c8' : '#c8a96e'}` }}>
                  {isXof ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                  )}
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.4 }}>
                    Tu fixes tes prix en <strong style={{ color: isXof ? '#4ee8c8' : '#c8a96e' }}>{currencySymbol(cur)}</strong> — paiement par {payRailLabel(cur)}.
                  </p>
                </div>
              )
            })()}

            {places.map((place, i) => {
              // Cette place a-t-elle déjà été vendue ? (uniquement si on édite un event existant)
              const placeSoldCount = editingEventId && place.type ? getPlaceBookingCount(editingEventId, place.type) : 0
              const placeHasSales = placeSoldCount > 0
              // Le type et le prix sont verrouillés si vente sur cette place
              const placeTypeLocked = placeHasSales || isReadOnly
              const placePriceLocked = placeHasSales || isReadOnly
              // La suppression est interdite si vente sur cette place
              const placeDeleteLocked = placeHasSales || isReadOnly
              return (
              <div key={i} style={{ ...S.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, ...(placeHasSales ? { borderColor: 'rgba(200,169,110,0.25)' } : {}) }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c8a96e' }}>Place {i + 1}</p>
                    {placeHasSales && (
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#c8a96e', background: 'rgba(200,169,110,0.14)', border: '1px solid rgba(200,169,110,0.35)', borderRadius: 8, padding: '4px 10px' }}>
                        {placeSoldCount} vendu{placeSoldCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {i > 0 && (
                    <button
                      onClick={() => {
                        if (placeDeleteLocked) return
                        setPlaces(places.filter((_, j) => j !== i))
                      }}
                      disabled={placeDeleteLocked}
                      title={placeDeleteLocked ? "Impossible — cette place a déjà été vendue" : undefined}
                      style={{
                        padding: '8px 14px', borderRadius: 10,
                        background: 'rgba(224,90,170,0.14)', border: '1px solid rgba(224,90,170,0.55)',
                        cursor: placeDeleteLocked ? 'not-allowed' : 'pointer',
                        opacity: placeDeleteLocked ? 0.4 : 1,
                        fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
                        color: '#ff9ed2',
                      }}>Supprimer</button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <InputField
                      label="Nom du type *"
                      placeholder="Ex: Carré VIP"
                      value={place.type}
                      onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, type: e.target.value } : p))}
                      error={errors[`place_${i}`]}
                      locked={placeTypeLocked}
                    />
                  </div>
                  <div>
                    <InputField
                      label={`Prix (${currencySymbol(orgCurrency || regionToCurrency(form.region))})`}
                      type="number"
                      placeholder="0 = gratuit"
                      value={place.price}
                      onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, price: e.target.value } : p))}
                      locked={placePriceLocked}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <InputField
                      label="Quantité disponible"
                      type="number"
                      placeholder="Ex: 100"
                      value={place.qty}
                      onChange={e => {
                        if (isReadOnly) return
                        const newQty = parseInt(e.target.value) || 0
                        // Empêcher la décroissance en dessous des billets vendus
                        if (placeHasSales && newQty < placeSoldCount) {
                          return // refus silencieux
                        }
                        setPlaces(places.map((p, j) => j === i ? { ...p, qty: e.target.value } : p))
                      }}
                      min={placeHasSales ? placeSoldCount : 0}
                      locked={isReadOnly}
                    />
                    {placeHasSales && (
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(200,169,110,0.85)', marginTop: 4 }}>
                        Minimum : {placeSoldCount} (déjà vendu{placeSoldCount > 1 ? 's' : ''})
                      </p>
                    )}
                  </div>
                  <div>
                    <InputField
                      label="Max/compte"
                      type="number"
                      placeholder="0 = illimité"
                      value={place.groupType === 'group' ? '1' : (place.maxPerAccount || '')}
                      onChange={e => place.groupType !== 'group' && setPlaces(places.map((p, j) => j === i ? { ...p, maxPerAccount: e.target.value } : p))}
                      style={place.groupType === 'group' ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
                      locked={placeHasSales || isReadOnly}
                    />
                    {place.groupType === 'group' && (
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(78,232,200,0.75)', marginTop: 4 }}>
                        Fixé à 1 réservation par compte (groupe)
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.93)' }}>Place de groupe</p>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Réservation pour plusieurs personnes</p>
                  </div>
                  <Toggle
                    value={place.groupType === 'group'}
                    onChange={() => {
                      if (placeHasSales || isReadOnly) return
                      setPlaces(places.map((p, j) =>
                        j === i
                          ? { ...p, groupType: p.groupType === 'group' ? 'solo' : 'group', maxPerAccount: p.groupType !== 'group' ? 1 : p.maxPerAccount }
                          : p
                      ))
                    }}
                    disabled={placeHasSales || isReadOnly}
                  />
                </div>
                {place.groupType === 'group' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ ...S.label, color: '#4ee8c8' }}>Capacité du groupe</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <InputField label="Min personnes" type="number" placeholder="Ex: 8" value={place.groupMin || ''} onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, groupMin: e.target.value } : p))} locked={placeHasSales || isReadOnly} />
                      <InputField label="Max personnes" type="number" placeholder="Ex: 12" value={place.groupMax || ''} onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, groupMax: e.target.value } : p))} locked={placeHasSales || isReadOnly} />
                    </div>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>La réservation est validée dès le minimum atteint, jusqu'au maximum indiqué.</p>
                  </div>
                )}

                {/* Photos de la place — ce que le client verra via « Voir à quoi
                    ressemble ma place » sur la fiche de l'événement */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                  <p style={{ ...S.label }}>Photos de cette place <span style={{ color: 'rgba(255,255,255,0.38)', letterSpacing: 0 }}>(optionnel)</span></p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {(place.photos || []).map((ph, k) => (
                      <div key={k} style={{ position: 'relative', width: 66, height: 66, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', flexShrink: 0 }}>
                        <img src={ph} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        {!isReadOnly && (
                          <button
                            onClick={() => setPlaces(places.map((p, j) => j === i ? { ...p, photos: (p.photos || []).filter((_, m) => m !== k) } : p))}
                            title="Retirer"
                            style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, lineHeight: '15px', cursor: 'pointer', padding: 0 }}>×</button>
                        )}
                      </div>
                    ))}
                    {!isReadOnly && (place.photos || []).length < 6 && (
                      <label style={{ width: 66, height: 66, borderRadius: 8, border: '1px dashed rgba(200,169,110,0.4)', background: 'rgba(200,169,110,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer', color: '#c8a96e', flexShrink: 0 }}>
                        <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { handlePlacePhotos(i, e.target.files); e.target.value = '' }} />
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700 }}>Ajouter</span>
                      </label>
                    )}
                  </div>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8, lineHeight: 1.5 }}>
                    Montre le carré, la table, la vue… Le client les verra avant de réserver. 6 photos maximum.
                  </p>
                </div>

                {/* Options incluses dans ce billet — liées au menu de l'événement */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                  <p style={{ ...S.label }}>Options incluses dans ce billet <span style={{ color: 'rgba(255,255,255,0.38)', letterSpacing: 0 }}>(optionnel)</span></p>
                  {(() => {
                    const menuChoices = menuItems.filter(m => m.name.trim() && m.price)
                    const incs = Array.isArray(place.included) ? place.included : []
                    const setInc = (updater) => setPlaces(places.map((p, j) => j === i ? { ...p, included: updater(Array.isArray(p.included) ? p.included : []) } : p))
                    if (!menuChoices.length && !incs.length) {
                      return (
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8, lineHeight: 1.5 }}>
                          Ajoute d'abord des articles au <span style={{ color: '#c8a96e', fontWeight: 700 }}>menu de l'événement</span> (étape Options avancées → Précommandes). Tu pourras ensuite inclure une boisson, un dîner ou une bouteille directement dans ce billet — ex. « Entrée + boisson ».
                        </p>
                      )
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                        {incs.map((inc, k) => {
                          const stillInMenu = menuChoices.some(m => m.name.trim() === inc.name)
                          return (
                            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: `1px solid ${stillInMenu ? 'rgba(78,232,200,0.22)' : 'rgba(220,100,100,0.35)'}`, background: 'rgba(255,255,255,0.04)' }}>
                              <select
                                value={inc.name}
                                disabled={isReadOnly}
                                onChange={e => setInc(list => list.map((x, m) => m === k ? { ...x, name: e.target.value } : x))}
                                style={{ flex: 1, minWidth: 0, background: '#0b0c12', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.92)', fontFamily: 'Inter, sans-serif', fontSize: 12, padding: '8px 8px', outline: 'none' }}
                              >
                                {!stillInMenu && <option value={inc.name}>{inc.name} (retiré du menu)</option>}
                                {menuChoices.map(m => (
                                  <option key={m.name} value={m.name.trim()}>{m.emoji ? `${m.emoji} ` : ''}{m.name.trim()} · {m.price} {currencySymbol(orgCurrency || regionToCurrency(form.region))}</option>
                                ))}
                              </select>
                              <input
                                type="number" min="1" value={inc.qty || 1}
                                disabled={isReadOnly}
                                onChange={e => setInc(list => list.map((x, m) => m === k ? { ...x, qty: Math.max(1, parseInt(e.target.value) || 1) } : x))}
                                title="Quantité incluse"
                                style={{ width: 52, background: '#0b0c12', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.92)', fontFamily: 'Inter, sans-serif', fontSize: 12, padding: '8px 6px', textAlign: 'center', outline: 'none' }}
                              />
                              <span
                                title="Inclus gratuitement dans le billet"
                                style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 8, fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', border: '1px solid rgba(78,232,200,0.35)', background: 'rgba(78,232,200,0.14)', color: '#4ee8c8' }}
                              >
                                Offert
                              </span>
                              {!isReadOnly && (
                                <button
                                  onClick={() => setInc(list => list.filter((_, m) => m !== k))}
                                  title="Retirer cette option"
                                  style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: 'rgba(220,50,50,0.10)', border: '1px solid rgba(220,100,100,0.3)', color: 'rgba(255,150,150,0.9)', fontSize: 13, lineHeight: '20px', cursor: 'pointer', padding: 0 }}
                                >×</button>
                              )}
                            </div>
                          )
                        })}
                        {!isReadOnly && menuChoices.length > 0 && (
                          <button
                            onClick={() => setInc(list => [...list, { name: menuChoices[0].name.trim(), qty: 1 }])}
                            style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, background: 'rgba(78,232,200,0.14)', border: '1px solid rgba(78,232,200,0.35)', color: '#4ee8c8', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          >
                            + Inclure un article du menu
                          </button>
                        )}
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, margin: 0 }}>
                          Ex. « Entrée + boisson », « VIP dîner »… Le client voit ce qui est inclus avant de réserver, et le staff coche chaque option servie au scan (aucun dépassement possible).
                        </p>
                      </div>
                    )
                  })()}
                </div>
              </div>
              )
            })}

            <button
              onClick={() => {
                if (isReadOnly) return
                setPlaces(p => [...p, { type: '', price: 0, qty: 50, included: [] }])
              }}
              disabled={isReadOnly}
              style={{ ...S.btnGhost, opacity: isReadOnly ? 0.4 : 1, cursor: isReadOnly ? 'not-allowed' : 'pointer' }}
            >
              + Ajouter un type de place
            </button>
            <button onClick={() => validateAndNext(1)} style={{ ...S.btnGold, ...(isReadOnly ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: 'none', cursor: 'not-allowed' } : {}) }} disabled={isReadOnly}>
              Suivant
            </button>
          </div>
        )}

        {/* ── Step 2: Lieu & Infos pratiques ── */}
        {createStep === 2 && (
          <div className="lib-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: '0 0 4px' }}>Lieu & infos pratiques</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Indique où se déroulera ton événement.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { key: 'name', label: 'Nom du lieu', placeholder: 'Ex: Club Le Baroque, Salle des Fêtes...' },
                { key: 'address', label: 'Adresse', placeholder: 'Ex: 12 rue de la Paix' },
                { key: 'city', label: 'Ville *', placeholder: 'Ex: Paris, Lomé, Abidjan...' },
              ].map((f) => (
                <InputField
                  key={f.key}
                  label={f.label}
                  placeholder={f.placeholder}
                  value={venue[f.key]}
                  onChange={e => setVenue(v => ({ ...v, [f.key]: e.target.value }))}
                  error={f.key === 'city' ? errors.city : undefined}
                  locked={isLocked || isReadOnly}
                />
              ))}
              {/* Sélecteur de région */}
              <div>
                <label style={{ ...S.label, marginBottom: 4 }}>Région *</label>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
                  Dans quelle région se déroule l'événement ?
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {regions.map(r => {
                    const selected = form.region === r.name
                    // Code ISO 2 lettres (fonctionne sur tous les OS, contrairement aux flags emoji)
                    const code = r.id === 'togo' ? 'TG'
                      : r.id === 'benin' ? 'BJ'
                      : r.id === 'france' ? 'FR'
                      : r.id.slice(0, 2).toUpperCase()
                    return (
                      <button
                        key={r.id}
                        type="button"
                        disabled={isLocked || isReadOnly}
                        title={(isLocked || isReadOnly) ? "Verrouillé — billets déjà vendus" : undefined}
                        onClick={() => {
                          if (isLocked || isReadOnly) return
                          setForm(f => ({ ...f, region: r.name }))
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 14px',
                          borderRadius: 999,
                          border: selected ? '1px solid rgba(78,232,200,0.55)' : '1px solid rgba(255,255,255,0.10)',
                          background: selected ? 'rgba(78,232,200,0.10)' : '#0e0f16',
                          color: selected ? '#4ee8c8' : 'rgba(255,255,255,0.55)',
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: (isLocked || isReadOnly) ? 'not-allowed' : 'pointer',
                          opacity: (isLocked || isReadOnly) && !selected ? 0.4 : 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 16, borderRadius: 3,
                          background: selected ? 'rgba(78,232,200,0.18)' : 'rgba(255,255,255,0.08)',
                          fontFamily: 'Inter, sans-serif',
                          fontSize: code.length > 2 ? 12 : 9,
                          fontWeight: 700,
                          color: selected ? '#4ee8c8' : 'rgba(255,255,255,0.5)',
                          letterSpacing: 0,
                          flexShrink: 0,
                        }}>
                          {code}
                        </span>
                        {r.name}
                      </button>
                    )
                  })}
                </div>
                {errors.region && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', marginTop: 6 }}>{errors.region}</p>}
              </div>
            </div>
            <div style={{ ...S.card, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12, borderColor: 'rgba(200,169,110,0.18)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.5" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
              </svg>
              <div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#c8a96e' }}>Tu cherches une salle ou des prestataires ?</p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 1.6 }}>DJs, artistes, sono, lumières — tout est disponible dans l'onglet Services.</p>
              </div>
            </div>
            <button onClick={() => validateAndNext(2)} style={S.btnGold}>Suivant</button>
          </div>
        )}

        {/* ── Step 3: Options avancées ── */}
        {createStep === 3 && (
          <div className="lib-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: 0 }}>Options avancées</p>
            {/* QR Code — toujours actif, non modifiable */}
            <div style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, borderColor: 'rgba(78,232,200,0.15)' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.93)' }}>QR code billet</p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 1.6 }}>Billet numérique unique scanné à l'entrée — obligatoire</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: '#4ee8c8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Inclus</span>
              </div>
            </div>
            {[
              { key: 'playlist', label: 'Playlist interactive', desc: '1 son par ticket — vote par likes' },
              { key: 'preorder', label: 'Précommande de consommations', desc: "Clients commandent à l'avance" },
            ].map((opt) => {
              const optLocked = isLocked || isReadOnly || (opt.key === 'preorder' && hasPreorders)
              return (
              <div key={opt.key} style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, ...(optLocked ? { borderColor: 'rgba(200,169,110,0.18)' } : {}) }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.93)' }}>{opt.label}</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 1.6 }}>{opt.desc}</p>
                  {optLocked && (
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(200,169,110,0.85)', marginTop: 4 }}>
                      {opt.key === 'preorder' && hasPreorders ? 'Verrouillé — des précommandes existent' : 'Verrouillé — billets déjà vendus'}
                    </p>
                  )}
                </div>
                <Toggle value={options[opt.key]} onChange={() => setOptions(o => ({ ...o, [opt.key]: !o[opt.key] }))} disabled={optLocked} />
              </div>
            )})}
            {options.preorder && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...(hasPreorders ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}>
                <div style={{ borderTop: '1px solid rgba(200,169,110,0.15)', paddingTop: 16 }}>
                  <p style={{ ...S.label, color: '#c8a96e', marginBottom: 4 }}>Définir ta carte / menu</p>
                  {hasPreorders ? (
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(200,169,110,0.85)', marginBottom: 12 }}>
                      Menu verrouillé — des clients ont déjà passé des précommandes.
                    </p>
                  ) : (
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Ajoute les articles que tes clients pourront précommander.</p>
                  )}
                  {menuItems.map((item, i) => (
                    <MenuItemEditor
                      key={i}
                      item={item}
                      index={i}
                      currency={orgCurrency || regionToCurrency(form.region)}
                      placeTypes={places.map(p => p.type).filter(Boolean)}
                      onUpdate={updated => setMenuItems(menuItems.map((m, j) => j === i ? updated : m))}
                      onRemove={i > 0 ? () => setMenuItems(menuItems.filter((_, j) => j !== i)) : null}
                    />
                  ))}
                  <button
                    onClick={() => setMenuItems(m => [...m, { name: '', emoji: '', imageUrl: null, price: '', category: 'Boissons', description: '', hasShow: false, showOptions: [] }])}
                    style={S.btnGhost}
                  >
                    + Ajouter un article
                  </button>
                </div>
              </div>
            )}
            {options.preorder && menuItems.filter(i => i.name.trim() && i.price).length === 0 && (
              <div style={{
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(224,90,170,0.5)',
                borderRadius: 12,
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.6,
              }}>
                La précommande est activée mais aucun article n'a été renseigné. Ajoute au moins un article avec un nom et un prix, ou désactive la précommande.
              </div>
            )}
            {/* ── Publication & clôture ── */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Planification</p>
              <div>
                <label style={S.label}>Date de publication <span style={{ color: 'rgba(255,255,255,0.38)' }}>(optionnel — vide = maintenant)</span></label>
                <input
                  type="datetime-local"
                  value={publishAt}
                  onChange={e => { if (!isLocked && !isReadOnly) setPublishAt(e.target.value) }}
                  disabled={isLocked || isReadOnly}
                  style={{ ...S.inputBase, colorScheme: 'dark', ...(isLocked || isReadOnly ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
                />
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: isLocked ? 'rgba(200,169,110,0.85)' : 'rgba(255,255,255,0.5)', marginTop: 5, lineHeight: 1.6 }}>
                  {isLocked ? 'Verrouillé — l\'événement est déjà publié.' : 'L\'événement apparaîtra sur le site à cette date et heure. Laisse vide pour publier immédiatement.'}
                </p>
              </div>
              <div>
                <label style={S.label}>Date de clôture des réservations <span style={{ color: 'rgba(255,255,255,0.38)' }}>(optionnel)</span></label>
                <input
                  type="datetime-local"
                  value={closingDate}
                  onChange={e => setClosingDate(e.target.value)}
                  min={form.date || undefined}
                  style={{ ...S.inputBase, colorScheme: 'dark' }}
                />
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 5, lineHeight: 1.6 }}>
                  Laisse vide pour fermer automatiquement à la date de l'événement.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                if (options.preorder && menuItems.filter(i => i.name.trim() && i.price).length === 0) return
                setCreateStep(4)
              }}
              style={{
                ...S.btnGold,
                ...((options.preorder && menuItems.filter(i => i.name.trim() && i.price).length === 0)
                  ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: 'none', cursor: 'not-allowed' }
                  : {}),
              }}
            >
              Suivant
            </button>
          </div>
        )}

        {/* ── Step 4: Récapitulatif & Publier ── */}
        {createStep === 4 && (
          <div className="lib-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: 0 }}>Récapitulatif & publication</p>

            {imagePreview && (
              <div style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9' }}>
                <img src={imagePreview} alt="affiche" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Événement', val: form.name || '—' },
                { label: 'Date', val: formatDateDisplay(form.date) || '—' },
                { label: 'Horaires', val: form.timeStart ? `${form.timeStart} → ${form.timeEnd || '?'}` : '—' },
                { label: 'DJ / Artiste', val: artists.filter(a => a.name?.trim()).map(a => a.name.trim()).join(', ') || user?.name || '—' },
                { label: 'Visibilité', val: eventType === 'private' ? 'Privé (codes requis)' : 'Public' },
                { label: 'Genre musical', val: category === 'Autre' ? (customGenre.trim() || 'Autre') : (category || 'Autre') },
                { label: 'Ciblage', val: [
                  partyType && EVENT_TYPES.find(t => t.id === partyType)?.label,
                  ...musicStyles.map(id => MUSIC_STYLES.find(s => s.id === id)?.label),
                  ...ambiances.map(id => AMBIANCES.find(a => a.id === id)?.label),
                ].filter(Boolean).join(', ') || 'Aucun tag (recommandations limitées)' },
                { label: 'Types de places', val: `${places.length} type(s)` },
                { label: 'Lieu', val: venue.name ? `${venue.name}, ${venue.city}` : venue.city ? venue.city : '—' },
                { label: 'Région', val: (() => { const r = regions.find(x => x.name === form.region); return r ? r.name : form.region || '—' })() },
                { label: 'Playlist interactive', val: options.playlist ? 'Activée' : 'Désactivée' },
                { label: 'Précommande conso', val: options.preorder ? `Activée (${menuItems.filter(i => i.name.trim()).length} articles)` : 'Désactivée' },
                { label: 'QR Code billet', val: 'Activé — obligatoire' },
              ].map((r) => (
                <div key={r.label} style={{ ...S.card, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{r.label}</span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.92)', textAlign: 'right' }}>{r.val}</span>
                </div>
              ))}
            </div>

            <button
              style={{ ...S.btnGold, cursor: publishing ? 'wait' : 'pointer' }}
              onClick={handlePublish}
              disabled={publishing}
            >
              {publishing ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <span className="lib-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} />
                  {videoUploadPct != null ? `Envoi de la vidéo… ${videoUploadPct}%` : 'Publication…'}
                </span>
              ) : editingEventId ? 'Enregistrer les modifications' : 'Publier mon événement'}
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}

// ─── Menu Item Editor ────────────────────────────────────────────────────────
function MenuItemEditor({ item, index, onUpdate, onRemove, placeTypes = [], currency = 'EUR' }) {
  const photoRef = useRef(null)
  const [showDesc, setShowDesc] = useState(!!item.description)
  const u = (field, val) => onUpdate({ ...item, [field]: val })

  function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => u('imageUrl', ev.target.result)
    reader.readAsDataURL(file)
  }

  function addShowOption() {
    const newOpt = { id: 'so_' + Date.now(), label: '', requiresInfo: false, infoPrompt: '', excludedPlaces: [] }
    onUpdate({ ...item, showOptions: [...(item.showOptions || []), newOpt] })
  }

  function updateShowOption(optId, field, val) {
    onUpdate({
      ...item,
      showOptions: item.showOptions.map(o => o.id === optId ? { ...o, [field]: val } : o)
    })
  }

  function removeShowOption(optId) {
    onUpdate({ ...item, showOptions: item.showOptions.filter(o => o.id !== optId) })
  }

  return (
    <div style={{ ...S.card, padding: 12, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Article {index + 1}</p>
        {onRemove && (
          <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}>
            <IconClose size={12} color="rgba(220,100,100,0.9)" />
          </button>
        )}
      </div>

      {/* Photo / Symbol row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {item.imageUrl ? (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img src={item.imageUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.08)' }} />
            <button
              onClick={() => u('imageUrl', null)}
              style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: 'rgba(220,50,50,0.9)', border: 'none', color: 'white', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <IconClose size={8} color="white" />
            </button>
          </div>
        ) : (
          <input
            style={{ ...S.inputBase, width: 56, textAlign: 'center', flexShrink: 0, padding: '8px 6px' }}
            placeholder="Icône"
            value={item.emoji}
            onChange={e => u('emoji', e.target.value)}
            maxLength={4}
            onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
          />
        )}
        <button
          onClick={() => photoRef.current?.click()}
          style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '8px 14px', background: 'rgba(255,255,255,0.08)', cursor: 'pointer', flexShrink: 0 }}
        >
          {item.imageUrl ? 'Changer la photo' : 'Ajouter une photo'}
        </button>
        <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            style={{ ...S.inputBase }}
            placeholder="Nom de l'article"
            value={item.name}
            onChange={e => u('name', e.target.value)}
            onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
          />
        </div>
      </div>

      {/* Price + Category */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={S.label}>Prix ({currencySymbol(currency)})</label>
          <input style={{ ...S.inputBase }} type="number" placeholder="0" min="0" value={item.price} onChange={e => u('price', Math.max(0, parseFloat(e.target.value) || 0))}
            onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }} />
        </div>
        <div>
          <label style={S.label}>Catégorie</label>
          <input
            style={{ ...S.inputBase }}
            placeholder="Ex: Boissons, VIP, Snacks…"
            value={item.category}
            onChange={e => u('category', e.target.value)}
            onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
          />
        </div>
      </div>

      {/* Description toggle */}
      {!showDesc ? (
        <button onClick={() => setShowDesc(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)', textAlign: 'left' }}>
          + Ajouter une description
        </button>
      ) : (
        <div>
          <label style={S.label}>Description (optionnelle)</label>
          <textarea
            style={{ ...S.inputBase, resize: 'none' }}
            rows={2}
            placeholder="Ex: Bouteille 75cl servie avec glaçons et pailles dorées..."
            value={item.description}
            onChange={e => u('description', e.target.value)}
            onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
          />
        </div>
      )}

      {/* Show toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.93)' }}>Option show</p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Mise en scène spéciale à la livraison</p>
        </div>
        <Toggle value={item.hasShow} onChange={() => u('hasShow', !item.hasShow)} />
      </div>

      {/* Show options editor */}
      {item.hasShow && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 8, borderLeft: '2px solid rgba(200,169,110,0.18)' }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Définis les shows disponibles pour cet article :</p>
          {(item.showOptions || []).map(opt => (
            <div key={opt.id} style={{ ...S.card, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  style={{ ...S.inputBase, flex: 1, fontSize: 12 }}
                  placeholder="Ex: Pancartes + feu d'artifices"
                  value={opt.label}
                  onChange={e => updateShowOption(opt.id, 'label', e.target.value)}
                  onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                />
                <button
                  onClick={() => removeShowOption(opt.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', padding: 4 }}
                >
                  <IconClose size={12} color="rgba(220,100,100,0.9)" />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Nécessite des informations client</p>
                <Toggle value={opt.requiresInfo} onChange={() => updateShowOption(opt.id, 'requiresInfo', !opt.requiresInfo)} />
              </div>
              {opt.requiresInfo && (
                <input
                  style={{ ...S.inputBase, fontSize: 12 }}
                  placeholder="Question à poser au client (ex: Prénom sur la pancarte ?)"
                  value={opt.infoPrompt}
                  onChange={e => updateShowOption(opt.id, 'infoPrompt', e.target.value)}
                  onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                />
              )}
              {/* Exclusion par place pour CE show spécifiquement */}
              {placeTypes.length > 1 && (
                <div style={{ paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                    Masquer ce show pour certaines places :
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {placeTypes.map(pt => {
                      const isExcl = (opt.excludedPlaces || []).includes(pt)
                      return (
                        <button
                          key={pt}
                          type="button"
                          onClick={() => {
                            const excl = opt.excludedPlaces || []
                            updateShowOption(opt.id, 'excludedPlaces', isExcl ? excl.filter(x => x !== pt) : [...excl, pt])
                          }}
                          style={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '5px 10px',
                            borderRadius: 8,
                            border: isExcl ? '1px solid rgba(224,90,170,0.5)' : '1px solid rgba(255,255,255,0.10)',
                            background: isExcl ? 'rgba(224,90,170,0.14)' : '#0b0c12',
                            color: isExcl ? '#ff9ed2' : 'rgba(255,255,255,0.55)',
                            cursor: 'pointer',
                          }}
                        >
                          {isExcl ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              {pt}
                            </span>
                          ) : pt}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
          <button
            onClick={addShowOption}
            style={{ padding: '8px 14px', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#c8a96e', border: '1px solid rgba(200,169,110,0.35)', borderRadius: 10, background: 'rgba(200,169,110,0.10)', cursor: 'pointer' }}
          >
            + Ajouter un show
          </button>
        </div>
      )}

      {/* Place exclusion */}
      {placeTypes.length > 1 && (
        <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Exclure de certaines places :</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {placeTypes.map(pt => {
              const isExcluded = (item.excludedPlaces || []).includes(pt)
              return (
                <button
                  key={pt}
                  onClick={() => {
                    const excl = item.excludedPlaces || []
                    u('excludedPlaces', isExcluded ? excl.filter(x => x !== pt) : [...excl, pt])
                  }}
                  style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '5px 10px',
                    borderRadius: 8,
                    border: isExcluded ? '1px solid rgba(224,90,170,0.5)' : '1px solid rgba(255,255,255,0.10)',
                    background: isExcluded ? 'rgba(224,90,170,0.14)' : '#0b0c12',
                    color: isExcluded ? '#ff9ed2' : 'rgba(255,255,255,0.55)',
                    cursor: 'pointer',
                  }}
                >
                  {isExcluded ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      {pt}
                    </span>
                  ) : pt}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Analytics organisateur ──────────────────────────────────────────────────
// Statistiques de ventes RÉELLES, calculées depuis le registre tickets/ Firestore
// (un billet = une vente, cross-device), joint aux prix des places de l'event.
function OrganizerAnalytics({ events, tickets: rawTickets, loading }) {
  // Détail au clic : 'revenue' | 'tickets' | null
  const [detail, setDetail] = useState(null)
  const eventById = Object.fromEntries((events || []).map(e => [String(e.id), e]))
  // Un billet révoqué (invitation annulée, siège repris) n'est plus « émis » —
  // il ne compte ni dans les billets ni dans le CA.
  const tickets = (rawTickets || []).filter(t => t.revoked !== true && t.cancelled !== true)
  const revokedCount = (rawTickets || []).length - tickets.length
  // « 1 organisateur = 1 zone » : en principe TOUS les events sont dans la même
  // devise. Par sécurité on ne SOMME JAMAIS deux devises : on retient la devise
  // dominante (le plus d'events) et le CA agrégé n'additionne QUE les billets de
  // cette devise. Un event résiduel dans l'autre devise reste juste sur sa propre
  // ligne « par événement » mais ne pollue pas le total (jamais de « 5012 »).
  const curCounts = (events || []).reduce((m, e) => { const c = eventCurrency(e); m[c] = (m[c] || 0) + 1; return m }, {})
  const statsCur = (curCounts.XOF || 0) > (curCounts.EUR || 0) ? 'XOF' : 'EUR'
  const inStatsCur = (t) => eventCurrency(eventById[String(t.eventId)]) === statsCur
  const priceOf = (t) => {
    // Prix payé figé sur le billet en priorité : le CA des ventes passées ne doit
    // JAMAIS changer si l'organisateur modifie ses tarifs (cohérence comptable).
    if (t.placePrice != null) return Number(t.placePrice) || 0
    const ev = eventById[String(t.eventId)]
    const place = ev?.places?.find(p => p.type === t.place)
    return Number(place?.price) || 0
  }
  const totalTickets = tickets.length
  // Revenu = uniquement les billets PAYÉS. Un billet gratuit (guestlist / event
  // gratuit) occupe une place mais ne rapporte rien — il ne doit pas gonfler le CA.
  // L'organisateur garde 100 % du prix du billet : le frais de service LIVEINBLACK
  // est payé par l'ACHETEUR en sus (lib/fees.js) — pas de commission vendeur.
  // Les remises codes promo sont déjà déduites (placePrice = prix réellement payé).
  const ticketRevenue = tickets.reduce((s, t) => s + (t.paid && inStatsCur(t) ? priceOf(t) : 0), 0)
  // Précommandes (consos payées au checkout) : même règle — 100 % organisateur.
  const preorderRevenue = tickets.reduce((s, t) => {
    if (!t.paid || !inStatsCur(t)) return s
    return s + ticketPreorderLines(t).reduce((a, l) => a + l.quantity * l.price, 0)
  }, 0)
  const grossRevenue = ticketRevenue + preorderRevenue
  const paidCount = tickets.filter(t => t.paid).length
  const freeCount = totalTickets - paidCount
  const scannedCount = tickets.filter(t => t.checkedInAt).length
  const otherCurrency = (curCounts.XOF || 0) > 0 && (curCounts.EUR || 0) > 0

  // Par événement (avec ventes), trié par revenu décroissant. Remplissage en
  // UNITÉS DE STOCK (une table de groupe = 1) — compter les billets-sièges
  // contre la capacité gonflait artificiellement le remplissage des tables.
  const perEvent = (events || []).map(e => {
    const evTix = tickets.filter(t => String(t.eventId) === String(e.id))
    const stock = eventStock(e)
    const rev = evTix.reduce((s, t) => s + (t.paid ? priceOf(t) : 0), 0)
    return { event: e, tix: evTix.length, sold: stock.sold, cap: stock.capacity, rev, fill: stock.capacity > 0 ? Math.round(stock.sold / stock.capacity * 100) : 0 }
  }).filter(x => x.tix > 0).sort((a, b) => b.rev - a.rev).slice(0, 6)

  // Formule des frais acheteur (transparence du modal Revenus) selon la devise.
  const feeLabel = statsCur === 'XOF' ? '5 % + 300 FCFA par billet (plafonné à 1 500 FCFA)' : '5 % + 0,49 € par billet (plafonné à 2,50 €)'

  const card = { background: '#0e0f16', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }
  const inter = 'Inter, sans-serif'

  if (loading && totalTickets === 0) {
    return (
      <div style={{ ...card, padding: 20, textAlign: 'center' }}>
        <span className="lib-spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', verticalAlign: '-3px', marginRight: 8 }} />
        <span style={{ fontFamily: inter, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }}>Chargement des ventes…</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontFamily: inter, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Statistiques de ventes</p>

      {totalTickets === 0 ? (
        <div style={{ ...card, padding: '28px 20px', textAlign: 'center' }}>
          <p style={{ fontFamily: inter, fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', margin: '0 0 6px' }}>Aucune vente pour l'instant</p>
          <p style={{ fontFamily: inter, fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Tes ventes apparaîtront ici dès le premier billet.</p>
        </div>
      ) : (<>
        {/* KPI cards — cliquables : le détail du calcul s'ouvre en modal. */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setDetail('revenue')} style={{ ...card, flex: 1.4, padding: '16px 18px', borderLeft: '3px solid #c8a96e', textAlign: 'left', cursor: 'pointer' }}>
            <p style={{ fontFamily: inter, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(200,169,110,0.85)', margin: '0 0 6px' }}>Revenus billetterie + précommandes</p>
            <p style={{ fontFamily: inter, fontSize: statsCur === 'XOF' ? 24 : 30, fontWeight: 600, color: '#c8a96e', margin: 0, lineHeight: 1, letterSpacing: '-0.02em' }}>{fmtMoney(grossRevenue, statsCur)}</p>
            <p style={{ fontFamily: inter, fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.5)', margin: '6px 0 0' }}>Ce que tu gagnes vraiment · voir le calcul →</p>
          </button>
          <button onClick={() => setDetail('tickets')} style={{ ...card, flex: 1, padding: '16px 14px', textAlign: 'left', cursor: 'pointer' }}>
            <p style={{ fontFamily: inter, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: '0 0 6px' }}>Billets émis</p>
            <p style={{ fontFamily: inter, fontSize: 28, fontWeight: 600, color: '#4ee8c8', margin: 0, lineHeight: 1 }}>{totalTickets}</p>
            <p style={{ fontFamily: inter, fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.5)', margin: '6px 0 0' }}>tous événements, payés ou non · détails →</p>
          </button>
        </div>

        {/* ── Modal détail Revenus : le calcul expliqué noir sur blanc ── */}
        {detail === 'revenue' && (
          <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px,100%)', maxHeight: '86vh', overflowY: 'auto', background: '#12131c', border: '1px solid rgba(255,255,255,0.11)', borderRadius: 20, padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <h2 style={{ font: '26px Bebas Neue, Impact, sans-serif', letterSpacing: '0.03em', margin: 0 }}>Tes revenus, expliqués</h2>
                <button onClick={() => setDetail(null)} aria-label="Fermer" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}>×</button>
              </div>
              <div style={{ marginTop: 16, padding: 15, borderRadius: 12, background: '#0e0f16', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: 9 }}>
                {[['Billetterie (billets payés)', ticketRevenue], ['Précommandes (consos payées)', preorderRevenue]].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: inter, fontSize: 13.5, color: 'rgba(255,255,255,0.75)' }}>
                    <span>{label}</span><b style={{ color: '#fff' }}>{fmtMoney(val, statsCur)}</b>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, paddingTop: 9, borderTop: '1px solid rgba(255,255,255,0.09)', fontFamily: inter, fontSize: 14.5, fontWeight: 700 }}>
                  <span style={{ color: 'rgba(255,255,255,0.85)' }}>Total pour toi</span><b style={{ color: '#c8a96e' }}>{fmtMoney(grossRevenue, statsCur)}</b>
                </div>
              </div>
              <div style={{ marginTop: 14, fontFamily: inter, fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.62)' }}>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#fff' }}>Comment c'est calculé.</strong> Sur chaque vente, le client paie le prix de ton billet <em>plus</em> un frais de service LIVEINBLACK de <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{feeLabel}</strong>. Ce frais est payé <strong style={{ color: 'rgba(255,255,255,0.85)' }}>par l'acheteur, en plus</strong> — jamais prélevé sur toi.</p>
                <p style={{ margin: '0 0 10px' }}><strong style={{ color: '#c8a96e' }}>Ta part : 100 %</strong> du prix affiché de tes billets et de tes précommandes. <strong style={{ color: 'rgba(255,255,255,0.85)' }}>La part LIVEINBLACK :</strong> uniquement le frais de service payé par le client.</p>
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Les réductions codes promo sont déjà déduites (on compte le prix réellement payé). Les billets gratuits et invitations ne rapportent rien et ne sont pas comptés. Les remboursements éventuels ne sont pas encore déduits.{otherCurrency ? ' Tes événements dans une autre devise ne sont pas additionnés ici (jamais de mélange de devises).' : ''}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal détail Billets émis ── */}
        {detail === 'tickets' && (
          <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px,100%)', maxHeight: '86vh', overflowY: 'auto', background: '#12131c', border: '1px solid rgba(255,255,255,0.11)', borderRadius: 20, padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <h2 style={{ font: '26px Bebas Neue, Impact, sans-serif', letterSpacing: '0.03em', margin: 0 }}>Billets émis</h2>
                <button onClick={() => setDetail(null)} aria-label="Fermer" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}>×</button>
              </div>
              <div style={{ marginTop: 16, padding: 15, borderRadius: 12, background: '#0e0f16', border: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: 9 }}>
                {[
                  ['Billets émis (tous événements)', totalTickets],
                  ['· dont payés', paidCount],
                  ['· dont gratuits & invitations', freeCount],
                  ['Déjà scannés à l\'entrée', scannedCount],
                  ...(revokedCount > 0 ? [['Révoqués (non comptés)', revokedCount]] : []),
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: inter, fontSize: 13.5, color: String(label).startsWith('·') ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.8)' }}>
                    <span>{label}</span><b style={{ color: '#fff' }}>{val}</b>
                  </div>
                ))}
              </div>
              {perEvent.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontFamily: inter, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: '0 0 8px' }}>Par événement</p>
                  {perEvent.map(({ event, tix }) => (
                    <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontFamily: inter, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.name}</span><b style={{ color: '#4ee8c8', flexShrink: 0 }}>{tix} billet{tix > 1 ? 's' : ''}</b>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ marginTop: 12, fontFamily: inter, fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,0.45)' }}>Un billet émis = une personne attendue : billets payés, billets gratuits et invitations guestlist. Le détail complet (participants, entrées, démographie) est dans les statistiques de chaque événement.</p>
            </div>
          </div>
        )}

        {/* Par événement — seulement à partir de 2 events (avec un seul, ce serait
            une redite des KPI Revenus / Billets / Remplissage ci-dessus). */}
        {perEvent.length > 1 && (
          <div style={{ ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontFamily: inter, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Par événement</p>
            {perEvent.map(({ event, sold, cap, rev, fill }) => (
              <div key={event.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
                  <span style={{ fontFamily: inter, fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.name}</span>
                  <span style={{ fontFamily: inter, fontSize: 14, fontWeight: 600, color: '#c8a96e', flexShrink: 0 }}>{fmtMoney(rev, eventCurrency(event))}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${fill}%`, borderRadius: 99, background: fill >= 80 ? '#c8a96e' : '#4ee8c8' }} />
                  </div>
                  <span style={{ fontFamily: inter, fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.45)', flexShrink: 0 }}>{sold}/{cap}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </>)}
    </div>
  )
}

// ─── Bookings Panel ──────────────────────────────────────────────────────────
function BookingsPanel({ event, onClose }) {
  const localBookings = (() => {
    try { return JSON.parse(localStorage.getItem('lib_bookings') || '[]') } catch { return [] }
  })()
  const localEventBookings = localBookings.filter(b => String(b.eventId) === String(event.id))
  // Source RÉELLE des réservations = registre tickets/ Firestore (cross-device).
  // lib_bookings local ne contient que les achats faits sur CE device → invisible
  // pour l'organisateur. On charge le registre et on l'enrichit du détail local
  // (préco) quand il existe, sinon fallback local hors-ligne.
  const [remoteTickets, setRemoteTickets] = useState([])
  useEffect(() => {
    let cancelled = false
    import('../utils/firestore-sync').then(async ({ loadTicketsForEvents }) => {
      const tix = await loadTicketsForEvents([event.id])
      if (!cancelled) setRemoteTickets(tix)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [event.id])
  const localByCode = Object.fromEntries(localEventBookings.map(b => [b.ticketCode, b]))
  const eventBookings = remoteTickets.length
    ? remoteTickets.map(t => ({ ...(localByCode[t.ticketCode] || {}), ticketCode: t.ticketCode, place: t.place, eventId: t.eventId, paid: t.paid, id: t.ticketCode }))
    : localEventBookings

  const byPlace = eventBookings.reduce((acc, b) => {
    if (!acc[b.place]) acc[b.place] = []
    acc[b.place].push(b)
    return acc
  }, {})

  const itemTotals = {}
  eventBookings.forEach(b => {
    if (b.preorderSummary?.length) {
      b.preorderSummary.forEach(item => {
        const qty = b.preorderItems?.[item.name] || 0
        if (!itemTotals[item.name]) itemTotals[item.name] = { emoji: item.emoji, qty: 0, shows: {} }
        itemTotals[item.name].qty += qty
        const sel = b.preorderShowSelections?.[item.name]
        if (sel?.showLabel) {
          const k = sel.showLabel
          if (!itemTotals[item.name].shows[k]) itemTotals[item.name].shows[k] = { count: 0, infos: [] }
          itemTotals[item.name].shows[k].count++
          if (sel.showInfo) itemTotals[item.name].shows[k].infos.push(sel.showInfo)
        }
      })
    }
  })

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: '#05060a' }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 4, display: 'flex', alignItems: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 500, color: 'rgba(255,255,255,0.92)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{event.name}</p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
            Réservations · {eventBookings.length} billet{eventBookings.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {eventBookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'rgba(255,255,255,0.45)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto 12px', display: 'block' }}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Aucune réservation pour l'instant.</p>
          </div>
        ) : (
          <>
            {/* Summary by place */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Eyebrow style={{ marginBottom: 8 }}>Résumé par type de place</Eyebrow>
              {Object.entries(byPlace).map(([place, bks]) => (
                <div key={place} style={{ ...S.card, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.90)' }}>{place}</span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 600, color: '#c8a96e' }}>{bks.length}</span>
                </div>
              ))}
            </div>

            {/* Item totals + shows */}
            {Object.keys(itemTotals).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Eyebrow style={{ marginBottom: 8 }}>Précommandes (stock à prévoir)</Eyebrow>
                {Object.entries(itemTotals).map(([name, data]) => (
                  <div key={name} style={{ ...S.card, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.90)' }}>{data.emoji} {name}</span>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 18, fontWeight: 600, color: '#c8a96e' }}>×{data.qty}</span>
                    </div>
                    {Object.entries(data.shows).map(([showLabel, showData]) => (
                      <div key={showLabel} style={{ paddingLeft: 12, borderLeft: '2px solid rgba(200,169,110,0.18)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }}>{showLabel}</span>
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.45)' }}>×{showData.count}</span>
                        </div>
                        {showData.infos.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {showData.infos.map((info, idx) => (
                              <span key={idx} style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, background: 'rgba(200,169,110,0.08)', color: '#c8a96e', border: '1px solid rgba(200,169,110,0.18)', padding: '3px 9px', borderRadius: 4 }}>
                                {info}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Per-ticket details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Eyebrow style={{ marginBottom: 8 }}>Détail par billet</Eyebrow>
              {eventBookings.map((b, idx) => (
                <div key={b.id || idx} style={{ ...S.card, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.08em' }}>{b.ticketCode}</p>
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>{b.place} · {fmtMoney(b.placePrice, eventCurrency(event))}</p>
                      {b.userName && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{b.userName}</p>}
                    </div>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: eventCurrency(event) === 'XOF' ? 16 : 22, fontWeight: 600, color: '#c8a96e', letterSpacing: '-0.01em' }}>{fmtMoney(b.totalPrice, eventCurrency(event))}</span>
                  </div>
                  {b.preorderSummary?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8, borderLeft: '2px solid rgba(255,255,255,0.05)' }}>
                      {b.preorderSummary.map(item => {
                        const sel = b.preorderShowSelections?.[item.name]
                        return (
                          <div key={item.name}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.55)' }}>{item.emoji} {item.name}</span>
                              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.45)' }}>×{b.preorderItems?.[item.name]}</span>
                            </div>
                            {sel?.showLabel && (
                              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, color: '#c8a96e', paddingLeft: 8, marginTop: 2 }}>
                                {sel.showLabel}{sel.showInfo ? ` — ${sel.showInfo}` : ''}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Stats Panel (événements passés) ─────────────────────────────────────────
function StatsPanel({ event, onClose }) {
  const allBookings = (() => {
    try { return JSON.parse(localStorage.getItem('lib_bookings') || '[]') } catch { return [] }
  })()
  const bookings = allBookings.filter(b => String(b.eventId) === String(event.id))

  const totalRevenue = bookings.reduce((s, b) => s + (b.totalPrice || 0), 0)
  const totalTickets = bookings.length

  // By place type
  const byPlace = bookings.reduce((acc, b) => {
    const key = b.place || 'Standard'
    if (!acc[key]) acc[key] = { count: 0, revenue: 0 }
    acc[key].count++
    acc[key].revenue += b.placePrice || 0
    return acc
  }, {})

  // Preorder totals
  const itemTotals = {}
  bookings.forEach(b => {
    if (b.preorderSummary?.length) {
      b.preorderSummary.forEach(item => {
        const qty = (b.preorderItems || {})[item.name] || 0
        if (!itemTotals[item.name]) itemTotals[item.name] = { emoji: item.emoji, qty: 0, revenue: 0 }
        itemTotals[item.name].qty += qty
        itemTotals[item.name].revenue += qty * (item.price || 0)
      })
    }
  })

  const preorderRevenue = Object.values(itemTotals).reduce((s, i) => s + i.revenue, 0)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: '#05060a' }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 4, display: 'flex', alignItems: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 500, color: 'rgba(255,255,255,0.92)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{event.name}</p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
            Statistiques · {event.dateDisplay || event.date}
          </p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Billets vendus', value: totalTickets, color: '#4ee8c8' },
            { label: 'Revenus totaux', value: fmtMoney(Math.round(totalRevenue), eventCurrency(event)), color: '#c8a96e' },
            { label: 'Dont billetterie', value: fmtMoney(Math.round(totalRevenue - preorderRevenue), eventCurrency(event)), color: 'rgba(255,255,255,0.55)' },
            { label: 'Dont précommandes', value: fmtMoney(Math.round(preorderRevenue), eventCurrency(event)), color: 'rgba(255,255,255,0.55)' },
          ].map(k => (
            <div key={k.label} style={{ ...S.card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: 0 }}>{k.label}</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 26, fontWeight: 600, color: k.color, margin: 0, lineHeight: 1, letterSpacing: '-0.02em' }}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* By place */}
        {Object.keys(byPlace).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Eyebrow style={{ marginBottom: 8 }}>Répartition par place</Eyebrow>
            {Object.entries(byPlace).sort((a, b) => b[1].count - a[1].count).map(([place, data]) => {
              const pct = totalTickets > 0 ? (data.count / totalTickets) * 100 : 0
              return (
                <div key={place} style={{ ...S.card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.90)' }}>{place}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#c8a96e' }}>{fmtMoney(Math.round(data.revenue), eventCurrency(event))}</span>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 600, color: '#4ee8c8' }}>{data.count}</span>
                    </div>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: '#4ee8c8', borderRadius: 2, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Preorder stats */}
        {Object.keys(itemTotals).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Eyebrow style={{ marginBottom: 8 }}>Précommandes consommées</Eyebrow>
            {Object.entries(itemTotals).sort((a, b) => b[1].qty - a[1].qty).map(([name, data]) => (
              <div key={name} style={{ ...S.card, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.90)' }}>{data.emoji} {name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#c8a96e' }}>{fmtMoney(Math.round(data.revenue), eventCurrency(event))}</span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 600, color: '#4ee8c8' }}>×{data.qty}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No data */}
        {bookings.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'rgba(255,255,255,0.45)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto 12px', display: 'block' }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>Aucune réservation enregistrée.</p>
          </div>
        )}
      </div>
    </div>
  )
}
