import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Cropper from 'react-easy-crop'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import BoostModal from '../components/BoostModal'
import getCroppedImg from '../utils/cropImage'

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

export default function MesEvenementsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
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
  const [form, setForm] = useState({ name: '', date: '', timeStart: '', timeEnd: '', description: '', privateCode: '' })
  const [artists, setArtists] = useState([]) // [{ name: '', role: 'DJ' }]
  const [showArtistSection, setShowArtistSection] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const [eventType, setEventType] = useState(null)
  const [category, setCategory] = useState(null)
  const [errors, setErrors] = useState({})

  // Image crop state
  const [showCropper, setShowCropper] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const onCropComplete = useCallback((_, cap) => setCroppedAreaPixels(cap), [])

  // Step 1: Places
  const [places, setPlaces] = useState([{ type: 'Entrée libre', price: 0, qty: 100, auction: false, maxPerAccount: 0, groupType: 'solo', groupMin: '', groupMax: '' }])

  // Step 2: Venue
  const [venue, setVenue] = useState({ name: '', address: '', city: '', country: '' })

  // Step 3: Options
  const [options, setOptions] = useState({ playlist: false, preorder: false, qr: true })
  // Custom menu for preorder
  const [menuItems, setMenuItems] = useState([{ name: '', emoji: '🍾', imageUrl: null, price: '', category: 'Boissons', description: '', hasShow: false, showOptions: [] }])

  // Dashboard bookings panel
  const [showBookingsPanel, setShowBookingsPanel] = useState(false)
  const [bookingsPanelEvent, setBookingsPanelEvent] = useState(null)

  // Dashboard codes state
  const [showCodesModal, setShowCodesModal] = useState(false)
  const [codesTargetEvent, setCodesTargetEvent] = useState(null)
  const [codesQty, setCodesQty] = useState(10)
  const [generatedCodes, setGeneratedCodes] = useState(null)

  // Dashboard: created events from localStorage (state so it refreshes after publish)
  const [createdEvents, setCreatedEvents] = useState(getCreatedEvents)

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
    // Reset input so same file can be re-selected
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
      if (!form.date) errs.date = 'La date est obligatoire'
      if (!eventType) errs.eventType = "Choisis un type d'événement"
    }
    if (currentStep === 1) {
      places.forEach((p, i) => {
        if (!p.type.trim()) errs[`place_${i}`] = 'Donne un nom à cette place'
      })
    }
    if (currentStep === 2) {
      if (!venue.city.trim()) errs.city = 'La ville est obligatoire'
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
      region: venue.country || venue.city,
      imageUrl: imagePreview,
      color: '#d4af37',
      accentColor: '#f5d76e',
      category: category || 'Autre',
      tags: [],
      organizer: user?.name || 'Organisateur',
      description: form.description,
      places: places.map(p => ({
        type: p.type || 'Entrée',
        price: Number(p.price) || 0,
        available: Number(p.qty) || 50,
        total: Number(p.qty) || 50,
        icon: '🎟',
        auctionEnabled: p.auction,
        maxPerAccount: Number(p.maxPerAccount) || 0,
        groupType: p.groupType || 'solo',
        groupMin: Number(p.groupMin) || 0,
        groupMax: Number(p.groupMax) || 0,
      })),
      playlist: options.playlist,
      auction: places.some(p => p.auction),
      preorder: options.preorder,
      featured: false,
      rating: 0,
      attendees: 0,
      artists: artists.filter(a => a.name.trim()),
      dj: artists.filter(a => a.name.trim()).length > 0
        ? artists.filter(a => a.name.trim()).map(a => a.name.trim()).join(', ')
        : user?.name || 'Organisateur',
      performers: [],
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

    // If private with a master code, save it to lib_event_codes
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
      // Show boost toast after short delay
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
    setForm({ name: '', date: '', timeStart: '', timeEnd: '', description: '', privateCode: '' })
    setArtists([])
    setShowArtistSection(false)
    setImagePreview(null)
    setEventType(null)
    setCategory(null)
    setErrors({})
    setPlaces([{ type: 'Entrée libre', price: 0, qty: 100, auction: false, maxPerAccount: 0, groupType: 'solo', groupMin: '', groupMax: '' }])
    setVenue({ name: '', address: '', city: '', country: '' })
    setOptions({ playlist: false, preorder: false, qr: true })
    setMenuItems([{ name: '', emoji: '🍾', imageUrl: null, price: '', category: 'Boissons', description: '', hasShow: false, showOptions: [], excludedPlaces: [] }])
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
    })
    const loadedArtists = ev.artists?.length ? ev.artists : []
    setArtists(loadedArtists)
    setShowArtistSection(loadedArtists.length > 0)
    setImagePreview(ev.imageUrl || null)
    setEventType('public')
    setCategory(ev.category || null)
    setErrors({})
    const venueParts = (ev.location || '').split(', ')
    setVenue({
      name: venueParts.length > 1 ? venueParts[0] : '',
      address: '',
      city: ev.city || '',
      country: ev.region !== ev.city ? ev.region || '' : '',
    })
    setPlaces(ev.places?.map(p => ({ type: p.type, price: p.price, qty: p.total, auction: p.auctionEnabled, maxPerAccount: p.maxPerAccount || 0, groupType: p.groupType || 'solo', groupMin: p.groupMin || '', groupMax: p.groupMax || '' })) || [{ type: 'Entrée libre', price: 0, qty: 100, auction: false, maxPerAccount: 0, groupType: 'solo', groupMin: '', groupMax: '' }])
    setOptions({ playlist: ev.playlist || false, preorder: ev.preorder || false, qr: true })
    setMenuItems(ev.menu?.length ? ev.menu : [{ name: '', emoji: '🍾', imageUrl: null, price: '', category: 'Boissons', description: '', hasShow: false, showOptions: [], excludedPlaces: [] }])
    setView('create')
  }

  function deleteEvent(id) {
    const updated = createdEvents.filter(ev => ev.id !== id)
    localStorage.setItem('lib_created_events', JSON.stringify(updated))
    setCreatedEvents(updated)
    setDeleteConfirm(null)
  }

  // ─── Dashboard ───────────────────────────────────────────────────────────────
  if (view === 'dashboard') {
    return (
      <Layout>
        <div className="px-4 py-5 space-y-5">
          <div>
            <h2 className="text-3xl font-black uppercase" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              Mes <span className="text-[#d4af37]">Événements</span>
            </h2>
            <p className="text-gray-500 text-xs mt-1">Crée et gère tes soirées</p>
          </div>

          <div className="flex gap-3">
            <button onClick={startCreate} className="flex-1">
              <div className="relative overflow-hidden rounded-2xl border border-[#d4af37]/30 bg-gradient-to-r from-[#d4af37]/10 to-transparent p-5 text-left hover:border-[#d4af37]/60 transition-all h-full">
                <p className="text-[#d4af37] text-xs uppercase tracking-widest mb-1">Nouveau</p>
                <p className="text-white text-lg font-bold">Créer un événement</p>
                <p className="text-gray-500 text-xs mt-1">De A à Z — lieux, places, enchères</p>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-4xl opacity-20">✦</div>
              </div>
            </button>
            <button onClick={() => navigate('/scanner')} className="flex-shrink-0">
              <div className="rounded-2xl border border-white/[0.08] bg-[#08080f] p-5 text-center hover:border-white/20 transition-all flex flex-col items-center gap-2 justify-center" style={{ width: 90 }}>
                <span className="text-3xl">📷</span>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider leading-tight">Scanner</p>
              </div>
            </button>
          </div>

          <div>
            <h3 className="text-gray-500 text-xs uppercase tracking-widest mb-3">Mes soirées en cours</h3>
            {createdEvents.length === 0 ? (
              <div className="border border-white/[0.05] rounded-2xl p-8 text-center">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-gray-600 text-sm">Tu n'as pas encore d'événement créé.</p>
                <p className="text-gray-700 text-xs mt-1">Lance-toi !</p>
              </div>
            ) : (
              <div className="space-y-3">
                {createdEvents.map(ev => (
                  <div key={ev.id} className="glass p-4 rounded-2xl flex items-center gap-3">
                    <button onClick={() => navigate(`/evenements/${ev.id}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      {ev.imageUrl ? (
                        <img src={ev.imageUrl} alt={ev.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-[#d4af37]/20 flex items-center justify-center text-2xl flex-shrink-0">🎉</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{ev.name}</p>
                        <p className="text-gray-500 text-xs">{ev.dateDisplay} · {ev.city}</p>
                        <span className="text-[10px] text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-full mt-1 inline-block">✓ Publié</span>
                      </div>
                    </button>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setBookingsPanelEvent(ev); setShowBookingsPanel(true) }}
                        className="w-8 h-8 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/20 flex items-center justify-center text-[#d4af37] text-sm hover:bg-[#d4af37]/20 transition-all"
                        title="Voir les réservations"
                      >
                        📋
                      </button>
                      <button
                        onClick={() => { setBoostTargetEvent(ev); setShowBoostModal(true) }}
                        className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 text-sm hover:bg-purple-500/20 transition-all"
                        title="Booster"
                      >
                        🚀
                      </button>
                      {ev.isPrivate && (
                        <button
                          onClick={() => { setCodesTargetEvent(ev); setGeneratedCodes(null); setCodesQty(10); setShowCodesModal(true) }}
                          className="w-8 h-8 rounded-lg bg-[#0e0e18] border border-white/[0.08] flex items-center justify-center text-gray-400 text-sm hover:bg-white/5 transition-all"
                          title="Codes d'accès"
                        >
                          🔑
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(ev)}
                        className="w-8 h-8 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/20 flex items-center justify-center text-[#d4af37] text-sm hover:bg-[#d4af37]/20 transition-all"
                        title="Modifier"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(ev.id)}
                        className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 text-sm hover:bg-red-500/20 transition-all"
                        title="Supprimer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delete confirmation modal */}
          {deleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
              <div className="relative glass rounded-2xl p-6 w-full max-w-sm space-y-4">
                <h3 className="text-white font-bold">Supprimer l'événement ?</h3>
                <p className="text-gray-400 text-sm">Cette action est irréversible. L'événement sera retiré de la liste.</p>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteConfirm(null)} className="btn-outline flex-1">Annuler</button>
                  <button
                    onClick={() => deleteEvent(deleteConfirm)}
                    className="flex-1 py-3 bg-red-500/20 border border-red-500/40 text-red-400 rounded-xl font-semibold hover:bg-red-500/30 transition-all"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bookings panel */}
        {showBookingsPanel && bookingsPanelEvent && (
          <BookingsPanel event={bookingsPanelEvent} onClose={() => setShowBookingsPanel(false)} />
        )}

        {/* Boost toast — slides in from right after publish */}
        {showBoostToast && justPublishedEvent && (
          <div
            className="fixed bottom-24 right-4 z-50 animate-fade-in-up"
            style={{ maxWidth: 280 }}
          >
            <div
              className="glass p-4 rounded-2xl border border-purple-500/40 bg-[#08080f] shadow-2xl cursor-pointer hover:border-purple-500/70 transition-all"
              onClick={() => {
                clearTimeout(toastTimerRef.current)
                setShowBoostToast(false)
                setBoostTargetEvent(justPublishedEvent)
                setShowBoostModal(true)
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">🚀</span>
                <div className="flex-1">
                  <p className="text-white text-sm font-bold">Booste ton événement !</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    Apparais dans le Top 3 régional et multiplie ta visibilité.
                  </p>
                  <p className="text-purple-400 text-xs mt-1 font-semibold">Voir les offres →</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); clearTimeout(toastTimerRef.current); setShowBoostToast(false); navigate('/evenements') }}
                  className="text-gray-600 hover:text-gray-400 text-lg flex-shrink-0"
                >
                  ×
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
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { setShowCodesModal(false); setGeneratedCodes(null) }} />
            <div className="relative glass rounded-2xl p-6 w-full max-w-sm space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <h3 className="text-white font-bold">🔑 Codes d'accès</h3>
                <p className="text-gray-500 text-xs mt-1">Génère des codes uniques à partager avec tes invités pour <span className="text-[#d4af37]">{codesTargetEvent.name}</span></p>
              </div>
              {!generatedCodes ? (
                <>
                  <div>
                    <label className="text-gray-500 text-xs mb-1.5 block">Nombre de codes à générer</label>
                    <input
                      className="input-dark"
                      type="number"
                      min="1"
                      max="100"
                      value={codesQty}
                      onChange={e => setCodesQty(e.target.value)}
                    />
                    <p className="text-gray-600 text-xs mt-1">Max 100 codes par génération</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCodesModal(false)} className="btn-outline flex-1 text-sm">Annuler</button>
                    <button onClick={generateCodes} className="btn-gold flex-1 text-sm">Générer →</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                    <p className="text-green-400 text-xs font-semibold">✓ {generatedCodes.length} codes générés</p>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {generatedCodes.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-[#0e0e18] rounded-lg">
                        <span className="font-mono text-[#d4af37] text-sm tracking-widest">{c.code}</span>
                        <span className="text-gray-600 text-[10px]">1 utilisation</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-gray-600 text-xs">Copie et envoie ces codes à tes invités. Chaque code ne peut être utilisé qu'une seule fois.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setGeneratedCodes(null)} className="btn-outline flex-1 text-sm">Regénérer</button>
                    <button onClick={() => { setShowCodesModal(false); setGeneratedCodes(null) }} className="btn-gold flex-1 text-sm">Fermer</button>
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
      {/* ── Crop modal ── */}
      {showCropper && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
            <button onClick={() => setShowCropper(false)} className="text-gray-400 text-sm">Annuler</button>
            <p className="text-white text-sm font-semibold">Recadrer l'image</p>
            <button onClick={applyCrop} className="text-[#d4af37] text-sm font-semibold">Valider ✓</button>
          </div>
          <div className="flex-1 relative">
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
          <div className="px-6 py-4 border-t border-white/[0.05] space-y-2">
            <p className="text-gray-500 text-xs text-center">Pinch / molette pour zoomer</p>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="w-full accent-[#d4af37]"
            />
          </div>
        </div>
      )}
      <div className="px-4 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => createStep === 0 ? setView('dashboard') : setCreateStep(s => s - 1)}
            className="w-8 h-8 rounded-full bg-[#0e0e18] flex items-center justify-center text-gray-400"
          >
            ‹
          </button>
          <div>
            <h2 className="text-white font-bold">{editingEventId ? "Modifier l'événement" : 'Créer un événement'}</h2>
            <p className="text-gray-600 text-xs">Étape {createStep + 1}/{CREATION_STEPS.length} — {CREATION_STEPS[createStep]}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex gap-1">
          {CREATION_STEPS.map((s, i) => (
            <div key={s} className="flex-1 h-1 rounded-full" style={{ background: i <= createStep ? '#d4af37' : '#0e0e18' }} />
          ))}
        </div>

        {/* ── Step 0: Bases ── */}
        {createStep === 0 && (
          <div className="space-y-4 animate-fade-in">
            {/* Image upload */}
            <div>
              <label className="text-gray-500 text-xs mb-1.5 block">Affiche / Photo de l'événement</label>
              <div
                className={`relative border-2 border-dashed rounded-2xl overflow-hidden cursor-pointer transition-all ${imagePreview ? 'border-[#d4af37]/40' : 'border-white/[0.07] hover:border-white/20'}`}
                style={{ aspectRatio: '16/9' }}
                onClick={() => imageInputRef.current?.click()}
              >
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-all">
                      <p className="text-white text-sm font-semibold">Changer l'image</p>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <p className="text-3xl">🖼</p>
                    <p className="text-gray-400 text-sm font-medium">Clique pour ajouter l'affiche</p>
                    <p className="text-gray-600 text-xs">Format recommandé : 1200 × 630 px</p>
                    <p className="text-gray-700 text-[10px]">JPG · PNG · WEBP — max 5 MB</p>
                  </div>
                )}
              </div>
              <input ref={imageInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleImage} />
              {errors.image && <p className="text-red-400 text-xs mt-1">{errors.image}</p>}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-gray-500 text-xs mb-1.5 block">Nom de l'événement *</label>
                <input
                  className={`input-dark ${errors.name ? 'border-red-500/60' : ''}`}
                  placeholder="Ex: NEON NIGHT Vol.3"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
                {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1.5 block">Date *</label>
                <input
                  className={`input-dark ${errors.date ? 'border-red-500/60' : ''}`}
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                />
                {errors.date && <p className="text-red-400 text-xs mt-1">{errors.date}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-gray-500 text-xs mb-1.5 block">Heure début</label>
                  <input className="input-dark" type="time" value={form.timeStart} onChange={e => setForm(f => ({ ...f, timeStart: e.target.value }))} />
                </div>
                <div>
                  <label className="text-gray-500 text-xs mb-1.5 block">Heure fin</label>
                  <input className="input-dark" type="time" value={form.timeEnd} onChange={e => setForm(f => ({ ...f, timeEnd: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-gray-500 text-xs mb-1.5 block">Description courte</label>
                <textarea
                  className="input-dark resize-none h-20 text-sm"
                  placeholder="Décris ta soirée en 2-3 phrases..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="glass p-3 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold">DJs / Artistes</p>
                    <p className="text-gray-600 text-[10px]">Affiché sur la playlist et la fiche événement</p>
                  </div>
                  <button
                    onClick={() => setShowArtistSection(v => !v)}
                    className={`w-10 h-5 rounded-full transition-all flex items-center flex-shrink-0 ${showArtistSection ? 'bg-[#d4af37] justify-end' : 'bg-white/[0.08] justify-start'}`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white mx-0.5 block" />
                  </button>
                </div>
                {showArtistSection && (
                  <div className="space-y-2 pt-1">
                    {artists.map((a, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <select
                          value={a.role}
                          onChange={e => setArtists(prev => prev.map((x, xi) => xi === i ? { ...x, role: e.target.value } : x))}
                          className="bg-[#08080f] border border-white/[0.07] text-white text-xs rounded-lg px-2 py-2 focus:outline-none focus:border-[#d4af37]/40 flex-shrink-0"
                        >
                          {['DJ', 'Artiste', 'MC', 'Live', 'Guest'].map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <input
                          className="input-dark text-sm flex-1"
                          placeholder="Nom..."
                          value={a.name}
                          onChange={e => setArtists(prev => prev.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
                        />
                        <button onClick={() => setArtists(prev => prev.filter((_, xi) => xi !== i))} className="text-red-400 text-xs flex-shrink-0 hover:text-red-300">✕</button>
                      </div>
                    ))}
                    <button
                      onClick={() => setArtists(prev => [...prev, { name: '', role: 'DJ' }])}
                      className="w-full py-1.5 text-xs text-[#d4af37] border border-[#d4af37]/20 rounded-xl hover:bg-[#d4af37]/5 transition-colors"
                    >
                      + Ajouter un DJ / artiste
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-gray-500 text-xs mb-2 block">Type d'événement *</label>
              <div className="grid grid-cols-2 gap-2">
                {['public', 'private'].map((t) => (
                  <button
                    key={t}
                    onClick={() => { setEventType(t); setErrors(e => ({ ...e, eventType: null })) }}
                    className={`p-3 rounded-xl border text-center transition-all ${eventType === t ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/[0.07]'}`}
                  >
                    <p className="text-lg mb-1">{t === 'public' ? '🌍' : '🔒'}</p>
                    <p className="text-white text-xs font-semibold">{t === 'public' ? 'Public' : 'Privé'}</p>
                    <p className="text-gray-600 text-[10px] mt-0.5">{t === 'public' ? 'Visible par tous' : 'Accès par code'}</p>
                  </button>
                ))}
              </div>
              {errors.eventType && <p className="text-red-400 text-xs mt-1">{errors.eventType}</p>}
              {eventType === 'private' && (
                <div className="mt-2 space-y-2">
                  <label className="text-gray-500 text-xs mb-1.5 block">Code d'accès maître (optionnel)</label>
                  <input
                    className="input-dark font-mono uppercase tracking-widest"
                    placeholder="Ex: NEON2026"
                    value={form.privateCode}
                    onChange={e => setForm(f => ({ ...f, privateCode: e.target.value.toUpperCase() }))}
                    maxLength={20}
                  />
                  <p className="text-gray-600 text-[10px]">Tu pourras aussi générer des codes individuels depuis ton tableau de bord après publication.</p>
                </div>
              )}
            </div>

            <div>
              <label className="text-gray-500 text-xs mb-2 block">Genre musical</label>
              <div className="grid grid-cols-2 gap-2">
                {['Afrobeat', 'Rap', 'Électronique', 'R&B', 'Reggaeton', 'Dancehall', 'House', 'Autre'].map((g) => (
                  <button
                    key={g}
                    onClick={() => setCategory(g)}
                    className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${category === g ? 'border-[#d4af37] bg-[#d4af37]/10 text-[#d4af37]' : 'border-white/[0.07] text-gray-500 hover:border-white/[0.08]'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={() => validateAndNext(0)} className="btn-gold w-full">Suivant →</button>
          </div>
        )}

        {/* ── Step 1: Places & Prix ── */}
        {createStep === 1 && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h3 className="text-white font-semibold mb-1">Tes types de places</h3>
              <p className="text-gray-500 text-xs">Configure chaque type de place que tu veux proposer.</p>
            </div>

            {places.map((place, i) => (
              <div key={i} className="glass p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[#d4af37] text-xs uppercase tracking-wider">Place {i + 1}</p>
                  {i > 0 && (
                    <button onClick={() => setPlaces(places.filter((_, j) => j !== i))} className="text-red-400 text-xs">Supprimer</button>
                  )}
                </div>
                <div className={`grid gap-2 ${place.auction ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <div>
                    <label className="text-gray-500 text-xs mb-1 block">Nom du type *</label>
                    <input
                      className={`input-dark text-sm ${errors[`place_${i}`] ? 'border-red-500/60' : ''}`}
                      placeholder="Ex: Carré VIP"
                      value={place.type}
                      onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, type: e.target.value } : p))}
                    />
                    {errors[`place_${i}`] && <p className="text-red-400 text-xs mt-0.5">{errors[`place_${i}`]}</p>}
                  </div>
                  {!place.auction && (
                    <div>
                      <label className="text-gray-500 text-xs mb-1 block">Prix (€)</label>
                      <input
                        className="input-dark text-sm"
                        type="number"
                        placeholder="0 = gratuit"
                        value={place.price}
                        onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, price: e.target.value } : p))}
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-gray-500 text-xs mb-1 block">Quantité disponible</label>
                    <input
                      className="input-dark text-sm"
                      type="number"
                      placeholder="Ex: 100"
                      value={place.qty}
                      onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, qty: e.target.value } : p))}
                    />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs mb-1 block">Max/compte</label>
                    <input
                      className="input-dark text-sm"
                      type="number"
                      placeholder="0 = illimité"
                      min="0"
                      value={place.maxPerAccount || ''}
                      onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, maxPerAccount: e.target.value } : p))}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">Activer les enchères</p>
                    <p className="text-gray-600 text-xs">La place se vend au plus offrant</p>
                  </div>
                  <div
                    onClick={() => setPlaces(places.map((p, j) => j === i ? { ...p, auction: !p.auction, minBid: p.minBid || '' } : p))}
                    className={`w-11 h-6 rounded-full relative cursor-pointer transition-all flex-shrink-0 ${place.auction ? 'bg-[#d4af37]' : 'bg-white/[0.08]'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${place.auction ? 'left-6' : 'left-1'}`} />
                  </div>
                </div>
                {place.auction && (
                  <div className="animate-fade-in border-t border-[#d4af37]/20 pt-3 space-y-3">
                    <div>
                      <label className="text-[#d4af37] text-xs mb-1.5 block">🔨 Prix de départ (€)</label>
                      <input
                        className="input-dark text-sm"
                        type="number"
                        placeholder="Ex: 50"
                        value={place.price}
                        onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, price: e.target.value } : p))}
                      />
                      <p className="text-gray-600 text-xs mt-1">Montant minimum pour commencer à enchérir</p>
                    </div>
                    <div>
                      <label className="text-[#d4af37] text-xs mb-1.5 block">📈 Incrément minimum (€)</label>
                      <input
                        className="input-dark text-sm"
                        type="number"
                        placeholder="Ex: 20"
                        value={place.minBid || ''}
                        onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, minBid: e.target.value } : p))}
                      />
                    </div>
                  </div>
                )}

                {/* Group type toggle */}
                <div className="flex items-center justify-between border-t border-white/[0.05] pt-3">
                  <div>
                    <p className="text-gray-400 text-sm">Place de groupe</p>
                    <p className="text-gray-600 text-xs">Réservation pour plusieurs personnes</p>
                  </div>
                  <div
                    onClick={() => setPlaces(places.map((p, j) => j === i ? { ...p, groupType: p.groupType === 'group' ? 'solo' : 'group' } : p))}
                    className={`w-11 h-6 rounded-full relative cursor-pointer transition-all flex-shrink-0 ${place.groupType === 'group' ? 'bg-[#d4af37]' : 'bg-white/[0.08]'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${place.groupType === 'group' ? 'left-6' : 'left-1'}`} />
                  </div>
                </div>
                {place.groupType === 'group' && (
                  <div className="animate-fade-in space-y-2">
                    <p className="text-blue-400 text-xs font-semibold">👥 Capacité du groupe</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-gray-500 text-xs mb-1 block">Min personnes</label>
                        <input
                          className="input-dark text-sm"
                          type="number"
                          min="2"
                          placeholder="Ex: 8"
                          value={place.groupMin || ''}
                          onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, groupMin: e.target.value } : p))}
                        />
                      </div>
                      <div>
                        <label className="text-gray-500 text-xs mb-1 block">Max personnes</label>
                        <input
                          className="input-dark text-sm"
                          type="number"
                          min="2"
                          placeholder="Ex: 12"
                          value={place.groupMax || ''}
                          onChange={e => setPlaces(places.map((p, j) => j === i ? { ...p, groupMax: e.target.value } : p))}
                        />
                      </div>
                    </div>
                    <p className="text-gray-700 text-[10px]">Validé dès le min atteint · accepté jusqu'au max avec marge</p>
                  </div>
                )}
              </div>
            ))}

            <button onClick={() => setPlaces(p => [...p, { type: '', price: 0, qty: 50, auction: false }])} className="btn-outline w-full text-sm">
              + Ajouter un type de place
            </button>
            <button onClick={() => validateAndNext(1)} className="btn-gold w-full">Suivant →</button>
          </div>
        )}

        {/* ── Step 2: Lieu & Infos pratiques ── */}
        {createStep === 2 && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <h3 className="text-white font-semibold">Lieu & Infos pratiques</h3>
              <p className="text-gray-500 text-xs mt-1">Indique où se déroulera ton événement.</p>
            </div>

            <div className="space-y-3">
              {[
                { key: 'name', label: 'Nom du lieu', placeholder: 'Ex: Club Le Baroque, Salle des Fêtes...' },
                { key: 'address', label: 'Adresse', placeholder: 'Ex: 12 rue de la Paix' },
                { key: 'city', label: 'Ville *', placeholder: 'Ex: Paris, Lomé, Abidjan...' },
                { key: 'country', label: 'Pays', placeholder: "Ex: France, Togo, Côte d'Ivoire..." },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-gray-500 text-xs mb-1.5 block">{f.label}</label>
                  <input
                    className={`input-dark ${f.key === 'city' && errors.city ? 'border-red-500/60' : ''}`}
                    placeholder={f.placeholder}
                    value={venue[f.key]}
                    onChange={e => setVenue(v => ({ ...v, [f.key]: e.target.value }))}
                  />
                  {f.key === 'city' && errors.city && <p className="text-red-400 text-xs mt-1">{errors.city}</p>}
                </div>
              ))}
            </div>

            <div className="flex items-start gap-3 p-4 rounded-2xl border border-[#d4af37]/20 bg-[#d4af37]/5">
              <span className="text-xl flex-shrink-0">🎤</span>
              <div>
                <p className="text-[#d4af37] text-sm font-semibold">Tu cherches une salle ou des prestataires ?</p>
                <p className="text-gray-500 text-xs mt-0.5">DJs, artistes, sono, lumières — tout est disponible dans l'onglet Services.</p>
              </div>
            </div>

            <button onClick={() => validateAndNext(2)} className="btn-gold w-full">Suivant →</button>
          </div>
        )}

        {/* ── Step 3: Options avancées ── */}
        {createStep === 3 && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="text-white font-semibold">Options avancées</h3>
            {[
              { key: 'playlist', label: 'Playlist interactive', desc: '1 son par ticket — vote par likes' },
              { key: 'preorder', label: 'Précommande de consommations', desc: "Clients commandent à l'avance" },
              { key: 'qr', label: 'QR Code billet', desc: "Billet numérique unique envoyé par email — scanné à l'entrée" },
            ].map((opt) => (
              <div key={opt.key} className="flex items-start justify-between p-4 glass rounded-xl">
                <div className="pr-4">
                  <p className="text-white text-sm font-semibold">{opt.label}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{opt.desc}</p>
                </div>
                <div
                  onClick={() => setOptions(o => ({ ...o, [opt.key]: !o[opt.key] }))}
                  className={`w-11 h-6 rounded-full relative cursor-pointer transition-all flex-shrink-0 ${options[opt.key] ? 'bg-[#d4af37]' : 'bg-white/[0.08]'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${options[opt.key] ? 'left-6' : 'left-1'}`} />
                </div>
              </div>
            ))}
            {/* Custom menu when preorder enabled */}
            {options.preorder && (
              <div className="space-y-3 animate-fade-in">
                <div className="border-t border-[#d4af37]/20 pt-4">
                  <h4 className="text-[#d4af37] text-xs uppercase tracking-widest mb-1">Définir ta carte / menu</h4>
                  <p className="text-gray-500 text-xs mb-3">Ajoute les articles que tes clients pourront précommander.</p>
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
                    onClick={() => setMenuItems(m => [...m, { name: '', emoji: '🍹', imageUrl: null, price: '', category: 'Boissons', description: '', hasShow: false, showOptions: [] }])}
                    className="btn-outline w-full text-xs"
                  >
                    + Ajouter un article
                  </button>
                </div>
              </div>
            )}

            <button onClick={() => setCreateStep(4)} className="btn-gold w-full">Suivant →</button>
          </div>
        )}

        {/* ── Step 4: Récapitulatif & Publier ── */}
        {createStep === 4 && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="text-white font-semibold">Récapitulatif & Publication</h3>

            {imagePreview && (
              <div className="rounded-2xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                <img src={imagePreview} alt="affiche" className="w-full h-full object-cover" />
              </div>
            )}

            <div className="space-y-2">
              {[
                { label: 'Événement', val: form.name || '—' },
                { label: 'Date', val: formatDateDisplay(form.date) || '—' },
                { label: 'Horaires', val: form.timeStart ? `${form.timeStart} → ${form.timeEnd || '?'}` : '—' },
                { label: 'DJ / Artiste', val: artists.filter(a => a.name?.trim()).map(a => a.name.trim()).join(', ') || user?.name || '—' },
                { label: 'Visibilité', val: eventType === 'private' ? '🔒 Privé (codes requis)' : '🌍 Public' },
                { label: 'Genre musical', val: category || 'Autre' },
                { label: 'Types de places', val: `${places.length} type(s)` },
                { label: 'Lieu', val: venue.name ? `📍 ${venue.name}, ${venue.city}` : venue.city ? `📍 ${venue.city}` : '—' },
                { label: 'Playlist interactive', val: options.playlist ? '✓ Activée' : '✕ Désactivée' },
                { label: 'Places aux enchères', val: places.filter(p => p.auction).length > 0 ? `✓ ${places.filter(p => p.auction).length} type(s)` : '✕ Aucune' },
                { label: 'Précommande conso', val: options.preorder ? `✓ Activée (${menuItems.filter(i => i.name.trim()).length} articles)` : '✕ Désactivée' },
                { label: 'QR Code billet', val: options.qr ? '✓ Activé' : '✕ Désactivé' },
              ].map((r) => (
                <div key={r.label} className="flex justify-between p-3 glass rounded-xl">
                  <span className="text-gray-500 text-sm">{r.label}</span>
                  <span className="text-white text-sm font-semibold">{r.val}</span>
                </div>
              ))}
            </div>

            <button className="btn-gold w-full" onClick={handlePublish}>
              {editingEventId ? '✓ Enregistrer les modifications' : '🚀 Publier mon événement'}
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
    const newOpt = { id: 'so_' + Date.now(), label: '', requiresInfo: false, infoPrompt: '' }
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
    <div className="glass p-3 rounded-xl mb-2 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-gray-500 text-xs">Article {index + 1}</p>
        {onRemove && <button onClick={onRemove} className="text-red-400 text-xs hover:text-red-300">✕</button>}
      </div>

      {/* Photo / Emoji toggle */}
      <div className="flex items-center gap-2">
        {item.imageUrl ? (
          <div className="relative flex-shrink-0">
            <img src={item.imageUrl} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/[0.08]" />
            <button
              onClick={() => u('imageUrl', null)}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center"
            >✕</button>
          </div>
        ) : (
          <input
            className="input-dark text-sm text-center w-14 flex-shrink-0"
            placeholder="🍾"
            value={item.emoji}
            onChange={e => u('emoji', e.target.value)}
            maxLength={4}
          />
        )}
        <button
          onClick={() => photoRef.current?.click()}
          className="text-[10px] text-gray-500 border border-white/[0.07] px-2 py-1 rounded-lg hover:border-[#d4af37]/30 hover:text-gray-400 transition-colors"
        >
          {item.imageUrl ? '📷 Changer photo' : '📷 Ajouter photo'}
        </button>
        <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
        <div className="flex-1 min-w-0">
          <input
            className="input-dark text-sm w-full"
            placeholder="Nom de l'article"
            value={item.name}
            onChange={e => u('name', e.target.value)}
          />
        </div>
      </div>

      {/* Price + Category */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-gray-600 text-[10px] mb-1 block">Prix (€)</label>
          <input className="input-dark text-sm" type="number" placeholder="0" min="0" value={item.price} onChange={e => u('price', Math.max(0, parseFloat(e.target.value) || 0))} />
        </div>
        <div>
          <label className="text-gray-600 text-[10px] mb-1 block">Catégorie</label>
          <select className="input-dark text-sm" value={item.category} onChange={e => u('category', e.target.value)}>
            {['Boissons', 'Snacks', 'VIP', 'Autre'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Description toggle */}
      {!showDesc ? (
        <button onClick={() => setShowDesc(true)} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
          + Ajouter une description
        </button>
      ) : (
        <div>
          <label className="text-gray-600 text-[10px] mb-1 block">Description (optionnelle)</label>
          <textarea
            className="input-dark text-xs resize-none"
            rows={2}
            placeholder="Ex: Bouteille 75cl servie avec glaçons et pailles dorées..."
            value={item.description}
            onChange={e => u('description', e.target.value)}
          />
        </div>
      )}

      {/* Show toggle */}
      <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
        <div>
          <p className="text-white text-xs font-semibold">🎆 Option Show</p>
          <p className="text-gray-600 text-[10px]">Mise en scène spéciale à la livraison</p>
        </div>
        <button
          onClick={() => u('hasShow', !item.hasShow)}
          className={`w-10 h-5 rounded-full transition-all flex items-center ${item.hasShow ? 'bg-[#d4af37] justify-end' : 'bg-white/[0.08] justify-start'}`}
        >
          <span className="w-4 h-4 rounded-full bg-white mx-0.5 block" />
        </button>
      </div>

      {/* Show options editor */}
      {item.hasShow && (
        <div className="space-y-2 pl-2 border-l-2 border-[#d4af37]/20">
          <p className="text-gray-500 text-[10px]">Définis les shows disponibles pour cet article :</p>
          {(item.showOptions || []).map(opt => (
            <div key={opt.id} className="bg-[#08080f] border border-white/[0.05] rounded-xl p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 bg-[#0e0e18] border border-white/[0.07] text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#d4af37]/40 placeholder-gray-600"
                  placeholder="Ex: Pancartes + feu d'artifices"
                  value={opt.label}
                  onChange={e => updateShowOption(opt.id, 'label', e.target.value)}
                />
                <button onClick={() => removeShowOption(opt.id)} className="text-red-400 text-xs flex-shrink-0 hover:text-red-300">✕</button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-gray-600 text-[10px]">Nécessite des infos client</p>
                <button
                  onClick={() => updateShowOption(opt.id, 'requiresInfo', !opt.requiresInfo)}
                  className={`w-8 h-4 rounded-full transition-all flex items-center ${opt.requiresInfo ? 'bg-[#d4af37] justify-end' : 'bg-white/[0.08] justify-start'}`}
                >
                  <span className="w-3 h-3 rounded-full bg-white mx-0.5 block" />
                </button>
              </div>
              {opt.requiresInfo && (
                <input
                  className="w-full bg-[#0e0e18] border border-white/[0.07] text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#d4af37]/40 placeholder-gray-600"
                  placeholder="Question à poser au client (ex: Prénom sur la pancarte ?)"
                  value={opt.infoPrompt}
                  onChange={e => updateShowOption(opt.id, 'infoPrompt', e.target.value)}
                />
              )}
            </div>
          ))}
          <button
            onClick={addShowOption}
            className="w-full py-1.5 text-[10px] text-[#d4af37] border border-[#d4af37]/20 rounded-xl hover:bg-[#d4af37]/5 transition-colors"
          >
            + Ajouter un show
          </button>
        </div>
      )}

      {/* Place exclusion */}
      {placeTypes.length > 1 && (
        <div className="pt-2 border-t border-white/[0.05] space-y-1.5">
          <p className="text-gray-600 text-[10px]">Exclure de certaines places (cet article n'y apparaîtra pas) :</p>
          <div className="flex flex-wrap gap-1.5">
            {placeTypes.map(pt => {
              const isExcluded = (item.excludedPlaces || []).includes(pt)
              return (
                <button
                  key={pt}
                  onClick={() => {
                    const excl = item.excludedPlaces || []
                    u('excludedPlaces', isExcluded ? excl.filter(x => x !== pt) : [...excl, pt])
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    isExcluded
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : 'bg-[#08080f] border-white/[0.07] text-gray-500 hover:border-white/[0.08] hover:text-gray-400'
                  }`}
                >
                  {isExcluded ? '✕ ' : ''}{pt}
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

  // Group by place type
  const byPlace = eventBookings.reduce((acc, b) => {
    if (!acc[b.place]) acc[b.place] = []
    acc[b.place].push(b)
    return acc
  }, {})

  // Item totals
  const itemTotals = {}
  eventBookings.forEach(b => {
    if (b.preorderSummary?.length) {
      b.preorderSummary.forEach(item => {
        const qty = b.preorderItems?.[item.name] || 0
        if (!itemTotals[item.name]) itemTotals[item.name] = { emoji: item.emoji, qty: 0, shows: {} }
        itemTotals[item.name].qty += qty
        // Count shows
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
    <div className="fixed inset-0 z-50 flex flex-col bg-[#04040b]">
      {/* Header */}
      <div className="px-4 py-4 border-b border-white/[0.05] flex items-center gap-3">
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1">←</button>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-bold text-sm truncate">{event.name}</h2>
          <p className="text-gray-500 text-xs">Réservations · {eventBookings.length} billet{eventBookings.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {eventBookings.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm">Aucune réservation pour l'instant.</p>
          </div>
        ) : (
          <>
            {/* Summary by place */}
            <div className="space-y-2">
              <p className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold">Résumé par type de place</p>
              {Object.entries(byPlace).map(([place, bks]) => (
                <div key={place} className="flex items-center justify-between p-3 glass rounded-xl">
                  <span className="text-white text-sm font-semibold">{place}</span>
                  <span className="text-[#d4af37] text-sm font-bold">{bks.length} billet{bks.length !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>

            {/* Item totals + shows */}
            {Object.keys(itemTotals).length > 0 && (
              <div className="space-y-2">
                <p className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold">Précommandes (stock à prévoir)</p>
                {Object.entries(itemTotals).map(([name, data]) => (
                  <div key={name} className="glass p-3 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm font-semibold">{data.emoji} {name}</span>
                      <span className="text-[#d4af37] font-bold text-sm">×{data.qty}</span>
                    </div>
                    {Object.entries(data.shows).map(([showLabel, showData]) => (
                      <div key={showLabel} className="pl-3 border-l-2 border-[#d4af37]/20">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 text-xs">🎆 {showLabel}</span>
                          <span className="text-gray-500 text-xs">×{showData.count}</span>
                        </div>
                        {showData.infos.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {showData.infos.map((info, idx) => (
                              <span key={idx} className="text-[10px] bg-[#d4af37]/10 text-[#d4af37] border border-[#d4af37]/20 px-2 py-0.5 rounded-full">
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
            <div className="space-y-2">
              <p className="text-[#d4af37] text-xs uppercase tracking-widest font-semibold">Détail par billet</p>
              {eventBookings.map((b, idx) => (
                <div key={b.id || idx} className="glass p-3 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-xs font-bold font-mono">{b.ticketCode}</p>
                      <p className="text-gray-500 text-[10px]">{b.place} · {b.placePrice}€</p>
                      {b.userName && <p className="text-gray-600 text-[10px]">👤 {b.userName}</p>}
                    </div>
                    <span className="text-[#d4af37] text-xs font-bold">{b.totalPrice}€</span>
                  </div>
                  {b.preorderSummary?.length > 0 && (
                    <div className="space-y-1 pl-2 border-l-2 border-white/[0.05]">
                      {b.preorderSummary.map(item => {
                        const sel = b.preorderShowSelections?.[item.name]
                        return (
                          <div key={item.name}>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">{item.emoji} {item.name}</span>
                              <span className="text-gray-600">×{b.preorderItems?.[item.name]}</span>
                            </div>
                            {sel?.showLabel && (
                              <p className="text-[10px] text-[#d4af37] pl-2">
                                🎆 {sel.showLabel}{sel.showInfo ? ` — ${sel.showInfo}` : ''}
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
