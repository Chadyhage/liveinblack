import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Cropper from 'react-easy-crop'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import BoostModal from '../components/BoostModal'
import getCroppedImg from '../utils/cropImage'
import { canCreateEvent, getCreateEventBlockedReason } from '../utils/permissions'
import { regions } from '../data/regions'

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
    background: 'rgba(8,10,20,0.55)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
  },
  inputBase: {
    background: 'rgba(6,8,16,0.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    padding: '10px 14px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  },
  label: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9,
    letterSpacing: '0.35em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.28)',
    display: 'block',
    marginBottom: 6,
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
    padding: '13px 28px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    width: '100%',
  },
  btnDanger: {
    padding: '13px 28px',
    background: 'rgba(220,50,50,0.10)',
    border: '1px solid rgba(220,50,50,0.35)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'rgba(220,100,100,0.9)',
    cursor: 'pointer',
    width: '100%',
  },
  btnTeal: {
    padding: '13px 28px',
    background: 'rgba(78,232,200,0.10)',
    border: '1px solid rgba(78,232,200,0.35)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: '#4ee8c8',
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
        fontFamily: "'DM Mono', monospace",
        fontSize: 9,
        letterSpacing: '0.4em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.25)',
      }}>{children}</span>
    </div>
  )
}

function InputField({ label, value, onChange, placeholder, type = 'text', error, style = {}, min, max }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      {label && <label style={S.label}>{label}</label>}
      <input
        type={type}
        min={min}
        max={max}
        style={{
          ...S.inputBase,
          borderColor: error ? 'rgba(220,50,50,0.6)' : focused ? '#4ee8c8' : 'rgba(255,255,255,0.10)',
          boxShadow: focused ? '0 0 0 3px rgba(78,232,200,0.06)' : 'none',
          ...style,
        }}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {error && <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{error}</p>}
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: value ? '#4ee8c8' : 'rgba(255,255,255,0.08)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
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

  // Compte en attente de validation → écran d'attente
  if (user?.status === 'pending') {
    return (
      <Layout>
        <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>⏳</div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#c8a96e', marginBottom: 12 }}>
              Validation en cours
            </p>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.8, marginBottom: 24 }}>
              Ton compte organisateur est en attente de validation par l'équipe LIVEINBLACK. Tu pourras créer des événements dès que ton dossier sera approuvé.
            </p>
            <button onClick={() => navigate('/mon-dossier')}
              style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8a96e', background: 'none', border: '1px solid rgba(200,169,110,0.35)', borderRadius: 4, padding: '10px 20px', cursor: 'pointer' }}>
              Voir mon dossier →
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  const userCanCreate = canCreateEvent(user)
  const imageInputRef = useRef(null)

  const [view, setView] = useState('dashboard')
  const [createStep, setCreateStep] = useState(0)
  const [editingEventId, setEditingEventId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [showBoostModal, setShowBoostModal] = useState(false)
  const [boostTargetEvent, setBoostTargetEvent] = useState(null)
  const [showBoostToast, setShowBoostToast] = useState(false)
  const [justPublishedEvent, setJustPublishedEvent] = useState(null)
  const toastTimerRef = useRef(null)

  // Step 0: Bases
  const [form, setForm] = useState({ name: '', date: '', timeStart: '', timeEnd: '', description: '', privateCode: '', minAge: 18, region: '' })
  const [artists, setArtists] = useState([]) // [{ name: '', role: 'DJ' }]
  const [showArtistSection, setShowArtistSection] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const [eventType, setEventType] = useState(null)
  const [category, setCategory] = useState(null)
  const [customGenre, setCustomGenre] = useState('')
  const [errors, setErrors] = useState({})

  // Image crop state
  const [showCropper, setShowCropper] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const onCropComplete = useCallback((_, cap) => setCroppedAreaPixels(cap), [])

  // Step 1: Places
  const [places, setPlaces] = useState([{ type: 'Entrée libre', price: 0, qty: 100, maxPerAccount: 0, groupType: 'solo', groupMin: '', groupMax: '' }])

  // Step 2: Venue
  const [venue, setVenue] = useState({ name: '', address: '', city: '', country: '' })

  // Step 3: Options
  const [options, setOptions] = useState({ playlist: false, preorder: false, qr: true })
  const [menuItems, setMenuItems] = useState([{ name: '', emoji: '', imageUrl: null, price: '', category: 'Boissons', description: '', hasShow: false, showOptions: [] }])

  // Dashboard bookings panel
  const [showBookingsPanel, setShowBookingsPanel] = useState(false)
  const [bookingsPanelEvent, setBookingsPanelEvent] = useState(null)

  // Dashboard codes state
  const [showCodesModal, setShowCodesModal] = useState(false)
  const [codesTargetEvent, setCodesTargetEvent] = useState(null)
  const [codesQty, setCodesQty] = useState(10)
  const [generatedCodes, setGeneratedCodes] = useState(null)

  const [createdEvents, setCreatedEvents] = useState(getCreatedEvents)
  const [showStatsPanel, setShowStatsPanel] = useState(false)
  const [statsPanelEvent, setStatsPanelEvent] = useState(null)

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
        if (picked < today) errs.date = 'La date que vous avez renseignée est déjà passée'
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
      })
    }
    if (currentStep === 2) {
      if (!venue.city.trim()) errs.city = 'La ville est obligatoire'
      if (!form.region) errs.region = 'Choisis une région'
    }
    setErrors(errs)
    if (Object.keys(errs).length === 0) setCreateStep(currentStep + 1)
  }

  function handlePublish() {
    const eventData = {
      id: editingEventId || Date.now(),
      name: form.name,
      subtitle: form.description?.slice(0, 60) || '',
      date: form.date,
      dateDisplay: formatDateDisplay(form.date),
      time: form.timeStart || '22:00',
      endTime: form.timeEnd || '05:00',
      location: [venue.name, venue.city].filter(Boolean).join(', '),
      city: venue.city,
      region: form.region || venue.city,
      imageUrl: imagePreview,
      color: '#c8a96e',
      accentColor: '#e8d49e',
      category: category === 'Autre' ? (customGenre.trim() || 'Autre') : (category || 'Autre'),
      tags: [],
      organizer: user?.name || 'Organisateur',
      description: form.description,
      places: places.map(p => ({
        type: p.type || 'Entrée',
        price: Number(p.price) || 0,
        available: Number(p.qty) || 50,
        total: Number(p.qty) || 50,
        icon: '',
        maxPerAccount: Number(p.maxPerAccount) || 0,
        groupType: p.groupType || 'solo',
        groupMin: Number(p.groupMin) || 0,
        groupMax: Number(p.groupMax) || 0,
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
      menu: options.preorder ? menuItems.filter(i => i.name.trim() && i.price) : null,
    }
    let updated
    if (editingEventId) {
      updated = createdEvents.map(ev => ev.id === editingEventId ? eventData : ev)
    } else {
      updated = [...createdEvents, eventData]
    }
    localStorage.setItem('lib_created_events', JSON.stringify(updated))
    setCreatedEvents(updated)

    // Sync event to shared Firestore collection so all users see it cross-device
    import('../utils/firestore-sync').then(({ syncDoc }) => {
      const eventToSync = { ...eventData, createdBy: user?.uid, organizerId: user?.uid, organizerName: user?.name || 'Organisateur' }
      syncDoc(`events/${eventData.id}`, eventToSync)
      // Also keep in organizer's personal collection for their dashboard
      syncDoc(`user_events/${user?.uid}`, { items: updated })
    }).catch(() => {})

    if (eventType === 'private' && form.privateCode.trim()) {
      const all = getEventCodes()
      const key = String(eventData.id)
      if (!all[key]?.find(c => c.code === form.privateCode.trim())) {
        all[key] = [...(all[key] || []), { code: form.privateCode.trim(), usedBy: null }]
        saveEventCodes(all)
      }
    }

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
    setEventType(null)
    setCategory(null)
    setCustomGenre('')
    setErrors({})
    setPlaces([{ type: 'Entrée libre', price: 0, qty: 100, maxPerAccount: 0, groupType: 'solo', groupMin: '', groupMax: '' }])
    setVenue({ name: '', address: '', city: '', country: '' })
    setOptions({ playlist: false, preorder: false, qr: true })
    setMenuItems([{ name: '', emoji: '', imageUrl: null, price: '', category: 'Boissons', description: '', hasShow: false, showOptions: [], excludedPlaces: [] }])
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
    setEventType('public')
    const PRESET_GENRES = ['Afrobeat', 'Rap', 'Électronique', 'R&B', 'Reggaeton', 'Dancehall', 'House', 'Autre']
    const evCat = ev.category || null
    if (evCat && !PRESET_GENRES.includes(evCat)) {
      setCategory('Autre')
      setCustomGenre(evCat)
    } else {
      setCategory(evCat)
      setCustomGenre('')
    }
    setErrors({})
    const venueParts = (ev.location || '').split(', ')
    setVenue({
      name: venueParts.length > 1 ? venueParts[0] : '',
      address: '',
      city: ev.city || '',
      country: ev.region !== ev.city ? ev.region || '' : '',
    })
    setPlaces(ev.places?.map(p => ({ type: p.type, price: p.price, qty: p.total, maxPerAccount: p.maxPerAccount || 0, groupType: p.groupType || 'solo', groupMin: p.groupMin || '', groupMax: p.groupMax || '' })) || [{ type: 'Entrée libre', price: 0, qty: 100, maxPerAccount: 0, groupType: 'solo', groupMin: '', groupMax: '' }])
    setOptions({ playlist: ev.playlist || false, preorder: ev.preorder || false, qr: true })
    setMenuItems(ev.menu?.length ? ev.menu : [{ name: '', emoji: '', imageUrl: null, price: '', category: 'Boissons', description: '', hasShow: false, showOptions: [], excludedPlaces: [] }])
    setView('create')
  }

  function deleteEvent(id) {
    const updated = createdEvents.filter(ev => ev.id !== id)
    localStorage.setItem('lib_created_events', JSON.stringify(updated))
    setCreatedEvents(updated)
    setDeleteConfirm(null)
    // Remove from shared Firestore collection too
    import('../utils/firestore-sync').then(({ syncDelete, syncDoc }) => {
      syncDelete(`events/${id}`)
      syncDoc(`user_events/${user?.uid}`, { items: updated })
    }).catch(() => {})
  }

  // ─── Role guard ──────────────────────────────────────────────────────────────
  if (!userCanCreate) {
    return (
      <Layout>
        <div style={{ padding: '60px 20px', textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)" style={{ marginBottom: 16 }}>
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
          </svg>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 300, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
            Accès restreint
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em', lineHeight: 1.7, marginBottom: 20 }}>
            {getCreateEventBlockedReason(user)}
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.05em', lineHeight: 1.6 }}>
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
        <div style={{ position: 'relative', zIndex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Page header */}
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 38, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0, letterSpacing: '0.02em', lineHeight: 1.1 }}>
              Mes <span style={{ color: '#c8a96e' }}>Événements</span>
            </h2>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.42)', marginTop: 6 }}>
              Crée et gère tes soirées
            </p>
          </div>

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={startCreate} style={{ flex: 1, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
              <div style={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 12,
                border: '1px solid rgba(200,169,110,0.30)',
                background: 'linear-gradient(135deg, rgba(200,169,110,0.08) 0%, transparent 60%)',
                padding: 20,
                height: '100%',
              }}>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.35em', textTransform: 'uppercase', color: '#c8a96e', marginBottom: 4 }}>Nouveau</p>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: '0 0 4px' }}>Créer un événement</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)' }}>De A à Z — lieux, places, options</p>
                <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.10 }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="#c8a96e"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
                </div>
              </div>
            </button>
            <button onClick={() => navigate('/scanner')} style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              <div style={{ ...S.card, width: 90, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5">
                  <path d="M3 4h2v2H3V4zm4 0h1v2H7V4zM3 7h1v1H3V7zM3 9h3v3H3V9zM3 13h2v2H3v-2zm4 0h1v2H7v-2zM3 16h1v1H3v-1zM3 18h3v3H3v-3zM7 18h1v3H7v-3zM9 3h3v3H9V3zm4 0h2v2h-2V3zm3 0h1v2h-1V3zm-8 4h1v1H8V7zm4 0h1v1h-1V7zm4 0h1v1h-1V7zM9 9h3v3H9V9zm4 0h3v3h-3V9zm-4 4h1v1H9v-1zm4 0h3v3h-3v-3zm-4 3h3v3h-3v-3z"/>
                </svg>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', lineHeight: 1.3, textAlign: 'center' }}>Scanner</p>
              </div>
            </button>
          </div>

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
              // Événements orphelins = créés par un autre compte (ancien compte supprimé)
              const orphanEvents = createdEvents.filter(ev =>
                ev.createdBy && ev.createdBy !== uid &&
                (!ev.organizerId || ev.organizerId !== uid)
              )
              const upcomingEvents = myEvents.filter(ev => !isEventPast(ev))
              const pastEvents = myEvents.filter(ev => isEventPast(ev))
              return (
                <>
            <Eyebrow style={{ marginBottom: 14 }}>Mes soirées en cours</Eyebrow>
            {upcomingEvents.length === 0 ? (
              <div style={{ ...S.card, padding: 40, textAlign: 'center' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" style={{ margin: '0 auto 12px', display: 'block' }}>
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.08em' }}>Tu n'as pas encore d'événement créé.</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.18)', marginTop: 4 }}>Lance-toi !</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {upcomingEvents.map(ev => (
                  <div key={ev.id} style={{ ...S.card, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => navigate(`/evenements/${ev.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                      {ev.imageUrl ? (
                        <img src={ev.imageUrl} alt={ev.name} style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 52, height: 52, borderRadius: 8, background: 'rgba(200,169,110,0.12)', border: '1px solid rgba(200,169,110,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</p>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 2 }}>{ev.dateDisplay} · {ev.city}</p>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: '#4ee8c8', background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.18)', padding: '2px 8px', borderRadius: 3, marginTop: 4, display: 'inline-block' }}>
                          PUBLIE
                        </span>
                      </div>
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                      {/* Reservations */}
                      <button
                        onClick={() => { setBookingsPanelEvent(ev); setShowBookingsPanel(true) }}
                        title="Voir les réservations"
                        style={{ width: 32, height: 32, borderRadius: 4, background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
                      </button>
                      {/* Boost */}
                      <button
                        onClick={() => { setBoostTargetEvent(ev); setShowBoostModal(true) }}
                        title="Booster"
                        style={{ width: 32, height: 32, borderRadius: 4, background: 'rgba(224,90,170,0.08)', border: '1px solid rgba(224,90,170,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e05aaa" strokeWidth="1.8"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M15 9v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
                      </button>
                      {/* Private codes */}
                      {ev.isPrivate && (
                        <button
                          onClick={() => { setCodesTargetEvent(ev); setGeneratedCodes(null); setCodesQty(10); setShowCodesModal(true) }}
                          title="Codes d'accès"
                          style={{ width: 32, height: 32, borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                        </button>
                      )}
                      {/* Edit */}
                      <button
                        onClick={() => startEdit(ev)}
                        title="Modifier"
                        style={{ width: 32, height: 32, borderRadius: 4, background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => setDeleteConfirm(ev.id)}
                        title="Supprimer"
                        style={{ width: 32, height: 32, borderRadius: 4, background: 'rgba(220,50,50,0.08)', border: '1px solid rgba(220,50,50,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(220,100,100,0.9)" strokeWidth="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
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
                            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.75)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</p>
                            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{ev.dateDisplay} · {ev.city}</p>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 3 }}>
                                TERMINÉ
                              </span>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', color: '#c8a96e' }}>
                                {evBookings.length} billet{evBookings.length !== 1 ? 's' : ''} · {totalRevenue.toFixed(0)}€
                              </span>
                            </div>
                          </div>
                        </button>
                        {/* Bouton Statistiques */}
                        <button
                          onClick={() => { setStatsPanelEvent(ev); setShowStatsPanel(true) }}
                          title="Statistiques"
                          style={{ width: 36, height: 36, borderRadius: 6, background: 'linear-gradient(135deg, rgba(78,232,200,0.12), rgba(78,232,200,0.04))', border: '1px solid rgba(78,232,200,0.25)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 2 }}
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
              <div style={{ ...S.card, position: 'relative', padding: 24, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Supprimer l'événement ?</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7 }}>
                  Cette action est irréversible. L'événement sera retiré de la liste.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setDeleteConfirm(null)} style={{ ...S.btnGhost, flex: 1 }}>Annuler</button>
                  <button onClick={() => deleteEvent(deleteConfirm)} style={{ ...S.btnDanger, flex: 1 }}>Supprimer</button>
                </div>
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
              style={{ ...S.card, padding: 16, borderColor: 'rgba(224,90,170,0.40)', cursor: 'pointer' }}
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
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.05em' }}>Booste ton événement</p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 4, lineHeight: 1.6 }}>
                    Apparais dans le Top 3 régional et multiplie ta visibilité.
                  </p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#e05aaa', marginTop: 6, letterSpacing: '0.1em' }}>Voir les offres</p>
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
            <div style={{ ...S.card, position: 'relative', padding: 24, width: '100%', maxWidth: 360, maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Codes d'accès</p>
                </div>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7 }}>
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
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 4 }}>Max 100 codes par génération</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setShowCodesModal(false)} style={{ ...S.btnGhost, flex: 1 }}>Annuler</button>
                    <button onClick={generateCodes} style={{ ...S.btnGold, flex: 1 }}>Générer</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ background: 'rgba(78,232,200,0.06)', border: '1px solid rgba(78,232,200,0.18)', borderRadius: 4, padding: '10px 14px' }}>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#4ee8c8' }}>{generatedCodes.length} codes générés</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
                    {generatedCodes.map((c, i) => (
                      <div key={i} style={{ ...S.card, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: '#c8a96e', letterSpacing: '0.25em' }}>{c.code}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)' }}>1 utilisation</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.28)', lineHeight: 1.7 }}>
                    Copie et envoie ces codes à tes invités. Chaque code ne peut être utilisé qu'une seule fois.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setGeneratedCodes(null)} style={{ ...S.btnGhost, flex: 1 }}>Regénérer</button>
                    <button onClick={() => { setShowCodesModal(false); setGeneratedCodes(null) }} style={{ ...S.btnGold, flex: 1 }}>Fermer</button>
                  </div>
                </>
              )}
            </div>
          </div>
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
            <button onClick={() => setShowCropper(false)} style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em' }}>Annuler</button>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.1em' }}>Recadrer l'image</p>
            <button onClick={applyCrop} style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#c8a96e', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.1em' }}>Valider</button>
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
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', textAlign: 'center', marginBottom: 8, letterSpacing: '0.1em' }}>Pinch / molette pour zoomer</p>
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
            style={{ width: 32, height: 32, borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
              {editingEventId ? "Modifier l'événement" : 'Créer un événement'}
            </p>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.42)', marginTop: 2 }}>
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

        {/* ── Step 0: Bases ── */}
        {createStep === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Image upload */}
            <div>
              <label style={S.label}>Affiche / Photo de l'événement</label>
              <div
                style={{
                  position: 'relative',
                  borderRadius: 8,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  aspectRatio: '16/9',
                  border: imagePreview ? '1px solid rgba(200,169,110,0.35)' : '2px dashed rgba(255,255,255,0.07)',
                  background: 'rgba(6,8,16,0.4)',
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
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>Clique pour ajouter l'affiche</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.1em' }}>Format recommandé : 1200 × 630 px</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.18)' }}>JPG · PNG · WEBP — max 5 MB</p>
                  </div>
                )}
              </div>
              <input ref={imageInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={handleImage} />
              {errors.image && <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{errors.image}</p>}
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
              />
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <InputField label="Heure début" type="time" value={form.timeStart} onChange={e => setForm(f => ({ ...f, timeStart: e.target.value }))} />
                  <InputField label="Heure fin" type="time" value={form.timeEnd} onChange={e => setForm(f => ({ ...f, timeEnd: e.target.value }))} />
                </div>
                {errors.timeEnd && <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{errors.timeEnd}</p>}
              </div>

              <div>
                <label style={S.label}>Description courte</label>
                <textarea
                  style={{ ...S.inputBase, resize: 'none', height: 80 }}
                  placeholder="Décris ta soirée en 2-3 phrases..."
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
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.08em' }}>DJs / Artistes</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>Affiché sur la playlist et la fiche événement</p>
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
                          placeholder="Nom..."
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
                      style={{ padding: '8px', fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#c8a96e', border: '1px solid rgba(200,169,110,0.18)', borderRadius: 4, background: 'transparent', cursor: 'pointer', letterSpacing: '0.1em' }}
                    >
                      + Ajouter un DJ / artiste
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Event type */}
            <div>
              <label style={{ ...S.label, marginBottom: 8 }}>Type d'événement *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {['public', 'private'].map((t) => (
                  <button
                    key={t}
                    onClick={() => { setEventType(t); setErrors(e => ({ ...e, eventType: null })) }}
                    style={{
                      ...S.card,
                      padding: 12,
                      textAlign: 'center',
                      cursor: 'pointer',
                      borderColor: eventType === t ? 'rgba(200,169,110,0.55)' : 'rgba(255,255,255,0.07)',
                      background: eventType === t ? 'rgba(200,169,110,0.08)' : 'rgba(8,10,20,0.55)',
                    }}
                  >
                    <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
                      {t === 'public' ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={eventType === t ? '#c8a96e' : 'rgba(255,255,255,0.42)'} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={eventType === t ? '#c8a96e' : 'rgba(255,255,255,0.42)'} strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                      )}
                    </div>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: eventType === t ? '#c8a96e' : 'rgba(255,255,255,0.90)', letterSpacing: '0.1em' }}>
                      {t === 'public' ? 'Public' : 'Privé'}
                    </p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                      {t === 'public' ? 'Visible par tous' : 'Accès par code'}
                    </p>
                  </button>
                ))}
              </div>
              {errors.eventType && <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{errors.eventType}</p>}
              {eventType === 'private' && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <InputField
                    label="Code d'accès maître (optionnel)"
                    placeholder="Ex: NEON2026"
                    value={form.privateCode}
                    onChange={e => setForm(f => ({ ...f, privateCode: e.target.value.toUpperCase() }))}
                    style={{ fontFamily: "'DM Mono', monospace", letterSpacing: '0.25em', textTransform: 'uppercase' }}
                  />
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', lineHeight: 1.6 }}>
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
                      borderRadius: 4,
                      border: category === g ? '1px solid rgba(200,169,110,0.55)' : '1px solid rgba(255,255,255,0.07)',
                      background: category === g ? 'rgba(200,169,110,0.08)' : 'transparent',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 10,
                      letterSpacing: '0.1em',
                      color: category === g ? '#c8a96e' : 'rgba(255,255,255,0.5)',
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

            {/* Âge légal */}
            <div>
              <label style={S.label}>Âge minimum requis</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {[{ label: 'TOUT PUBLIC', value: 0 }, { label: '16+', value: 16 }, { label: '18+', value: 18 }, { label: '21+', value: 21 }].map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, minAge: value }))}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 4,
                      border: form.minAge === value ? '1px solid #4ee8c8' : '1px solid rgba(255,255,255,0.10)',
                      background: form.minAge === value ? 'rgba(78,232,200,0.10)' : 'rgba(6,8,16,0.6)',
                      color: form.minAge === value ? '#4ee8c8' : 'rgba(255,255,255,0.4)',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 11,
                      letterSpacing: '0.15em',
                      cursor: 'pointer',
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
                  onChange={e => {
                    const v = parseInt(e.target.value, 10)
                    if (e.target.value === '') { setForm(f => ({ ...f, minAge: 0 })); return }
                    if (!isNaN(v) && v >= 0 && v <= 99) setForm(f => ({ ...f, minAge: v }))
                  }}
                  style={{
                    ...S.inputBase,
                    width: 130,
                    padding: '8px 14px',
                  }}
                />
                <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  color: 'rgba(255,255,255,0.25)',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: '0 0 4px' }}>Tes types de places</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)' }}>Configure chaque type de place que tu veux proposer.</p>
            </div>

            {places.map((place, i) => (
              <div key={i} style={{ ...S.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#c8a96e' }}>Place {i + 1}</p>
                  {i > 0 && (
                    <button onClick={() => setPlaces(places.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(220,100,100,0.9)', letterSpacing: '0.1em' }}>Supprimer</button>
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
                    />
                  </div>
                  <div>
                    <InputField
                      label="Prix (€)"
                      type="number"
                      placeholder="0 = gratuit"
                      value={place.price}
                      onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, price: e.target.value } : p))}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <InputField label="Quantité disponible" type="number" placeholder="Ex: 100" value={place.qty} onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, qty: e.target.value } : p))} />
                  <div>
                    <InputField
                      label="Max/compte"
                      type="number"
                      placeholder="0 = illimité"
                      value={place.groupType === 'group' ? '1' : (place.maxPerAccount || '')}
                      onChange={e => place.groupType !== 'group' && setPlaces(places.map((p, j) => j === i ? { ...p, maxPerAccount: e.target.value } : p))}
                      style={place.groupType === 'group' ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
                    />
                    {place.groupType === 'group' && (
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(78,232,200,0.6)', letterSpacing: '0.08em', marginTop: 4 }}>
                        Fixé à 1 réservation par compte (groupe)
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.70)' }}>Place de groupe</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>Réservation pour plusieurs personnes</p>
                  </div>
                  <Toggle
                    value={place.groupType === 'group'}
                    onChange={() => setPlaces(places.map((p, j) =>
                      j === i
                        ? { ...p, groupType: p.groupType === 'group' ? 'solo' : 'group', maxPerAccount: p.groupType !== 'group' ? 1 : p.maxPerAccount }
                        : p
                    ))}
                  />
                </div>
                {place.groupType === 'group' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ ...S.label, color: '#4ee8c8' }}>Capacité du groupe</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <InputField label="Min personnes" type="number" placeholder="Ex: 8" value={place.groupMin || ''} onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, groupMin: e.target.value } : p))} />
                      <InputField label="Max personnes" type="number" placeholder="Ex: 12" value={place.groupMax || ''} onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, groupMax: e.target.value } : p))} />
                    </div>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)' }}>Validé dès le min atteint · accepté jusqu'au max avec marge</p>
                  </div>
                )}
              </div>
            ))}

            <button onClick={() => setPlaces(p => [...p, { type: '', price: 0, qty: 50 }])} style={S.btnGhost}>
              + Ajouter un type de place
            </button>
            <button onClick={() => validateAndNext(1)} style={S.btnGold}>Suivant</button>
          </div>
        )}

        {/* ── Step 2: Lieu & Infos pratiques ── */}
        {createStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: '0 0 4px' }}>Lieu & Infos pratiques</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)' }}>Indique où se déroulera ton événement.</p>
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
                />
              ))}
              {/* Sélecteur de région */}
              <div>
                <label style={{ ...S.label, marginBottom: 4 }}>Région *</label>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Dans quelle région se déroule l'événement ?
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {regions.map(r => {
                    const selected = form.region === r.name
                    // Code ISO 2 lettres extrait du flag emoji (fonctionne sur tous les OS)
                    const code = r.id === 'amerique' ? '🌎'
                      : r.id === 'cote-divoire' ? 'CI'
                      : r.id === 'ghana' ? 'GH'
                      : r.id === 'togo' ? 'TG'
                      : r.id === 'benin' ? 'BJ'
                      : r.id === 'france' ? 'FR'
                      : r.id.slice(0, 2).toUpperCase()
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, region: r.name }))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 14px',
                          borderRadius: 999,
                          border: selected ? '1px solid rgba(78,232,200,0.55)' : '1px solid rgba(255,255,255,0.10)',
                          background: selected ? 'rgba(78,232,200,0.10)' : 'rgba(6,8,16,0.5)',
                          color: selected ? '#4ee8c8' : 'rgba(255,255,255,0.45)',
                          fontFamily: "'DM Mono', monospace",
                          fontSize: 11,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 16, borderRadius: 3,
                          background: selected ? 'rgba(78,232,200,0.18)' : 'rgba(255,255,255,0.08)',
                          fontFamily: "'DM Mono', monospace",
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
                {errors.region && <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(220,100,100,0.9)', marginTop: 6 }}>{errors.region}</p>}
              </div>
            </div>
            <div style={{ ...S.card, padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12, borderColor: 'rgba(200,169,110,0.18)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.5" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
              </svg>
              <div>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#c8a96e', letterSpacing: '0.05em' }}>Tu cherches une salle ou des prestataires ?</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 4, lineHeight: 1.6 }}>DJs, artistes, sono, lumières — tout est disponible dans l'onglet Services.</p>
              </div>
            </div>
            <button onClick={() => validateAndNext(2)} style={S.btnGold}>Suivant</button>
          </div>
        )}

        {/* ── Step 3: Options avancées ── */}
        {createStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Options avancées</p>
            {/* QR Code — toujours actif, non modifiable */}
            <div style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, borderColor: 'rgba(78,232,200,0.15)' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.05em' }}>QR Code billet</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 4, lineHeight: 1.6 }}>Billet numérique unique scanné à l'entrée — obligatoire</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#4ee8c8', letterSpacing: '0.15em' }}>INCLUS</span>
              </div>
            </div>
            {[
              { key: 'playlist', label: 'Playlist interactive', desc: '1 son par ticket — vote par likes' },
              { key: 'preorder', label: 'Précommande de consommations', desc: "Clients commandent à l'avance" },
            ].map((opt) => (
              <div key={opt.key} style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.05em' }}>{opt.label}</p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 4, lineHeight: 1.6 }}>{opt.desc}</p>
                </div>
                <Toggle value={options[opt.key]} onChange={() => setOptions(o => ({ ...o, [opt.key]: !o[opt.key] }))} />
              </div>
            ))}
            {options.preorder && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ borderTop: '1px solid rgba(200,169,110,0.15)', paddingTop: 16 }}>
                  <p style={{ ...S.label, color: '#c8a96e', marginBottom: 4 }}>Définir ta carte / menu</p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginBottom: 12 }}>Ajoute les articles que tes clients pourront précommander.</p>
                  {menuItems.map((item, i) => (
                    <MenuItemEditor
                      key={i}
                      item={item}
                      index={i}
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
                padding: '10px 14px',
                background: 'rgba(220,50,50,0.07)',
                border: '1px solid rgba(220,50,50,0.25)',
                borderRadius: 6,
                fontFamily: "'DM Mono', monospace",
                fontSize: 10,
                color: 'rgba(220,100,100,0.9)',
                lineHeight: 1.7,
              }}>
                La précommande est activée mais aucun article n'a été renseigné. Ajoute au moins un article avec un nom et un prix, ou désactive la précommande.
              </div>
            )}
            <button
              onClick={() => {
                if (options.preorder && menuItems.filter(i => i.name.trim() && i.price).length === 0) return
                setCreateStep(4)
              }}
              style={{
                ...S.btnGold,
                opacity: (options.preorder && menuItems.filter(i => i.name.trim() && i.price).length === 0) ? 0.4 : 1,
                cursor: (options.preorder && menuItems.filter(i => i.name.trim() && i.price).length === 0) ? 'not-allowed' : 'pointer',
              }}
            >
              Suivant
            </button>
          </div>
        )}

        {/* ── Step 4: Récapitulatif & Publier ── */}
        {createStep === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Récapitulatif & Publication</p>

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
                { label: 'Types de places', val: `${places.length} type(s)` },
                { label: 'Lieu', val: venue.name ? `${venue.name}, ${venue.city}` : venue.city ? venue.city : '—' },
                { label: 'Région', val: (() => { const r = regions.find(x => x.name === form.region); return r ? `${r.flag} ${r.name}` : form.region || '—' })() },
                { label: 'Playlist interactive', val: options.playlist ? 'Activée' : 'Désactivée' },
                { label: 'Précommande conso', val: options.preorder ? `Activée (${menuItems.filter(i => i.name.trim()).length} articles)` : 'Désactivée' },
                { label: 'QR Code billet', val: 'Activé — obligatoire' },
              ].map((r) => (
                <div key={r.label} style={{ ...S.card, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', flexShrink: 0 }}>{r.label}</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)', textAlign: 'right' }}>{r.val}</span>
                </div>
              ))}
            </div>

            <button style={S.btnGold} onClick={handlePublish}>
              {editingEventId ? 'Enregistrer les modifications' : 'Publier mon événement'}
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}

// ─── Menu Item Editor ────────────────────────────────────────────────────────
function MenuItemEditor({ item, index, onUpdate, onRemove, placeTypes = [] }) {
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
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.42)' }}>Article {index + 1}</p>
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
            placeholder="icon"
            value={item.emoji}
            onChange={e => u('emoji', e.target.value)}
            maxLength={4}
            onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
          />
        )}
        <button
          onClick={() => photoRef.current?.click()}
          style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.42)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, padding: '6px 10px', background: 'transparent', cursor: 'pointer', letterSpacing: '0.05em', flexShrink: 0 }}
        >
          {item.imageUrl ? 'Changer photo' : 'Ajouter photo'}
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
          <label style={S.label}>Prix (€)</label>
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
        <button onClick={() => setShowDesc(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)', textAlign: 'left', letterSpacing: '0.1em' }}>
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
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.05em' }}>Option Show</p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>Mise en scène spéciale à la livraison</p>
        </div>
        <Toggle value={item.hasShow} onChange={() => u('hasShow', !item.hasShow)} />
      </div>

      {/* Show options editor */}
      {item.hasShow && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 8, borderLeft: '2px solid rgba(200,169,110,0.18)' }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>Définis les shows disponibles pour cet article :</p>
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
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)' }}>Nécessite des infos client</p>
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
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.22)', marginBottom: 6 }}>
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
                            fontFamily: "'DM Mono', monospace",
                            fontSize: 9,
                            padding: '3px 10px',
                            borderRadius: 3,
                            border: isExcl ? '1px solid rgba(220,50,50,0.30)' : '1px solid rgba(255,255,255,0.07)',
                            background: isExcl ? 'rgba(220,50,50,0.08)' : 'rgba(6,8,16,0.6)',
                            color: isExcl ? 'rgba(220,100,100,0.9)' : 'rgba(255,255,255,0.38)',
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
            style={{ padding: '7px', fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#c8a96e', border: '1px solid rgba(200,169,110,0.18)', borderRadius: 4, background: 'transparent', cursor: 'pointer', letterSpacing: '0.1em' }}
          >
            + Ajouter un show
          </button>
        </div>
      )}

      {/* Place exclusion */}
      {placeTypes.length > 1 && (
        <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', marginBottom: 8 }}>Exclure de certaines places :</p>
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
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 9,
                    padding: '3px 10px',
                    borderRadius: 3,
                    border: isExcluded ? '1px solid rgba(220,50,50,0.30)' : '1px solid rgba(255,255,255,0.07)',
                    background: isExcluded ? 'rgba(220,50,50,0.08)' : 'rgba(6,8,16,0.6)',
                    color: isExcluded ? 'rgba(220,100,100,0.9)' : 'rgba(255,255,255,0.42)',
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

// ─── Bookings Panel ──────────────────────────────────────────────────────────
function BookingsPanel({ event, onClose }) {
  const allBookings = (() => {
    try { return JSON.parse(localStorage.getItem('lib_bookings') || '[]') } catch { return [] }
  })()
  const eventBookings = allBookings.filter(b => String(b.eventId) === String(event.id))

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: 'rgba(4,4,11,0.98)', backdropFilter: 'blur(20px)' }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 4, display: 'flex', alignItems: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.name}</p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.42)', marginTop: 2 }}>
            Réservations · {eventBookings.length} billet{eventBookings.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {eventBookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'rgba(255,255,255,0.28)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto 12px', display: 'block' }}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Aucune réservation pour l'instant.</p>
          </div>
        ) : (
          <>
            {/* Summary by place */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Eyebrow style={{ marginBottom: 8 }}>Résumé par type de place</Eyebrow>
              {Object.entries(byPlace).map(([place, bks]) => (
                <div key={place} style={{ ...S.card, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)' }}>{place}</span>
                  <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: '#c8a96e' }}>{bks.length}</span>
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
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)' }}>{data.emoji} {name}</span>
                      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: '#c8a96e' }}>x{data.qty}</span>
                    </div>
                    {Object.entries(data.shows).map(([showLabel, showData]) => (
                      <div key={showLabel} style={{ paddingLeft: 12, borderLeft: '2px solid rgba(200,169,110,0.18)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{showLabel}</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)' }}>x{showData.count}</span>
                        </div>
                        {showData.infos.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {showData.infos.map((info, idx) => (
                              <span key={idx} style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, background: 'rgba(200,169,110,0.08)', color: '#c8a96e', border: '1px solid rgba(200,169,110,0.18)', padding: '2px 8px', borderRadius: 3 }}>
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
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.15em' }}>{b.ticketCode}</p>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 2 }}>{b.place} · {b.placePrice}€</p>
                      {b.userName && <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 14, fontWeight: 300, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{b.userName}</p>}
                    </div>
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: '#c8a96e' }}>{b.totalPrice}€</span>
                  </div>
                  {b.preorderSummary?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8, borderLeft: '2px solid rgba(255,255,255,0.05)' }}>
                      {b.preorderSummary.map(item => {
                        const sel = b.preorderShowSelections?.[item.name]
                        return (
                          <div key={item.name}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{item.emoji} {item.name}</span>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)' }}>x{b.preorderItems?.[item.name]}</span>
                            </div>
                            {sel?.showLabel && (
                              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#c8a96e', paddingLeft: 8, marginTop: 2 }}>
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: 'rgba(4,4,11,0.98)', backdropFilter: 'blur(20px)' }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 4, display: 'flex', alignItems: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.name}</p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.42)', marginTop: 2 }}>
            STATISTIQUES · {event.dateDisplay || event.date}
          </p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Billets vendus', value: totalTickets, color: '#4ee8c8' },
            { label: 'Revenus totaux', value: `${totalRevenue.toFixed(0)} €`, color: '#c8a96e' },
            { label: 'Dont billetterie', value: `${(totalRevenue - preorderRevenue).toFixed(0)} €`, color: 'rgba(255,255,255,0.55)' },
            { label: 'Dont précommandes', value: `${preorderRevenue.toFixed(0)} €`, color: 'rgba(255,255,255,0.55)' },
          ].map(k => (
            <div key={k.label} style={{ ...S.card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.35)', margin: 0 }}>{k.label.toUpperCase()}</p>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, color: k.color, margin: 0, lineHeight: 1 }}>{k.value}</p>
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
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)' }}>{place}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#c8a96e' }}>{data.revenue.toFixed(0)} €</span>
                      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: '#4ee8c8' }}>{data.count}</span>
                    </div>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #4ee8c8, #c8a96e)', borderRadius: 2, transition: 'width 0.6s ease' }} />
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
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)' }}>{data.emoji} {name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#c8a96e' }}>{data.revenue.toFixed(0)} €</span>
                  <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: '#4ee8c8' }}>×{data.qty}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No data */}
        {bookings.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px 0', color: 'rgba(255,255,255,0.28)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto 12px', display: 'block' }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Aucune réservation enregistrée.</p>
          </div>
        )}
      </div>
    </div>
  )
}
