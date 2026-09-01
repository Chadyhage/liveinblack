'use client'

import NextImage from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { regions } from '@/lib/shared/regions'
import { regionToCurrency, currencySymbol, payRailLabel } from '@/lib/shared/money'
import ImageCropperModal from '@/app/components/ui/ImageCropperModal'
import MenuItemEditor, { emptyMenuItem, type MenuItemRow } from './MenuItemEditor'
import { uploadPublicMedia } from '@/lib/client/publicMediaUpload'
import { Button, Card, Input, Textarea, Select, Spinner, Modal } from '@/app/components/ui'
import { IconClose, InputField, LockIcon, NumberInputField, Pill, Toggle } from '@/app/components/features/organizer/WizardControls'
import {
  buildEventPayload,
  canProceedWizardAdvancedStep,
  defaultPlaceRow,
  getValidMenuItems,
  makeLocalKey,
  newPlaceRow,
  snapshotEventWizardForm,
  toDatetimeLocalValue,
  validateWizardBasics,
  validateWizardLocation,
  validateWizardPlaces,
  type ArtistRow,
  type EventFormInput,
  type PlaceRow,
} from './eventWizardUtils'

// Port du wizard de création/édition d'événement en 5 étapes
// (src/pages/MesEvenementsPage.jsx, vue 'create' — lignes ~2140-3274 pour le
// wizard lui-même, ~3281-3542 pour MenuItemEditor). #77 phase 7 migration.
//
// Différences volontaires par rapport au legacy (documentées aussi dans le
// rapport de tâche) :
// - Les photos de place sont redimensionnées côté client (canvas, 1280px
//   max, JPEG q0.85). L'affiche dispose du recadrage panoramique attendu.
// - La vidéo d'aperçu conserve la limite legacy de 30 Mo et part directement
//   vers Cloudinary via un upload signé pour ne pas traverser la limite de
//   corps des fonctions serveur.
// - Upload immédiat à la sélection du fichier (affiche/vidéo/photos), comme
//   l'avatar de profil déjà porté — pas d'upload différé à la publication.
// - Pas d'avertissement d'encaissement (Stripe/Momo) dans le wizard : déjà
//   surfacé en agrégat sur le tableau de bord, éviter un aller-retour API
//   redondant par événement.

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

interface ServerPlace {
  id: string
  type: string
  price: number
  total: number
  available: number
  sold: number
  icon: string
  maxPerAccount: number
  groupType: 'solo' | 'group'
  groupMin: number
  groupMax: number
  photos: string[]
  included: { name: string; qty: number }[]
}

interface ServerEventDetail {
  id: string
  name: string
  subtitle: string
  description: string
  category: string
  tags: string[]
  eventType: string
  musicStyles: string[]
  ambiances: string[]
  date: string
  dateDisplay: string
  time: string
  endTime: string
  location: string
  city: string
  region: string
  currency: 'EUR' | 'XOF'
  imageUrl: string | null
  videoUrl: string | null
  color: string
  accentColor: string
  places: ServerPlace[]
  playlist: boolean
  preorder: boolean
  menu: MenuItemRow[] | null
  artists: { name: string; role: string; providerId?: string | null }[]
  dj: string
  performers: string[]
  minAge: number
  publishAt: string | null
  closingDate: string | null
  cancelled: boolean
  postponedFrom: { date: string; time: string } | null
  locked: boolean
  totalSold: number
}

// ─────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────

const STEP_NAMES = ['Bases', 'Places & Prix', 'Lieu & infos pratiques', 'Options avancées', 'Récapitulatif & publication']
const GENRES = ['Afrobeat', 'Rap', 'Électronique', 'R&B', 'Reggaeton', 'Dancehall', 'House', 'Autre']
const ARTIST_ROLES = ['DJ', 'Artiste', 'MC', 'Live', 'Guest']
// Listes raisonnables (la liste exacte legacy EVENT_TYPES/MUSIC_STYLES/AMBIANCES
// n'était pas disponible pour ce port — voir rapport de tâche).
const EVENT_TYPES = ['Clubbing', 'Concert', 'Festival', 'Afterwork', 'Brunch', 'Rooftop', 'Privé']
const MUSIC_STYLES = ['Afrobeat', 'Amapiano', 'Hip-Hop', 'R&B', 'Dancehall', 'Reggaeton', 'House', 'Techno', 'Zouk', 'Coupé-décalé']
const AMBIANCES = ['Chic', 'Décontracté', 'Festif', 'Intimiste', 'Rooftop', 'Piscine', 'Plage', 'VIP']
const AGE_PRESETS: { label: string; value: number }[] = [
  { label: 'TOUT PUBLIC', value: 0 },
  { label: '16+', value: 16 },
  { label: '18+', value: 18 },
  { label: '21+', value: 21 },
]
const AMBIANCE_MAX = 3
const MAX_PLACE_PHOTOS = 6

// ─────────────────────────────────────────────────────────────────────────
// Styles partagés (mêmes tokens que le reste du dashboard organisateur)
// ─────────────────────────────────────────────────────────────────────────

const S = {
  inputBase: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-control)',
    fontSize: 'var(--font-size-body-sm)',
    fontWeight: 500,
    color: 'var(--text)',
    minHeight: 'var(--control-height-md)',
    padding: '10px 14px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  label: {
    fontSize: 'var(--font-size-footnote)',
    fontWeight: 600,
    color: 'var(--text-muted)',
    display: 'block',
    marginBottom: 6,
  } as React.CSSProperties,
  btnPrimary: {
    minHeight: 'var(--density-action-min)',
    padding: '10px 20px',
    background: 'var(--violet-cta)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-control)',
    fontSize: 'var(--font-size-body-sm)',
    fontWeight: 700,
    textTransform: 'none',
    letterSpacing: 'normal',
    color: 'var(--primary-ink)',
    cursor: 'pointer',
    boxShadow: 'none',
    width: '100%',
  } as React.CSSProperties,
  btnGhost: {
    minHeight: 'var(--density-action-min)',
    padding: '10px 18px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-control)',
    fontSize: 'var(--font-size-body-sm)',
    fontWeight: 600,
    color: 'var(--text)',
    cursor: 'pointer',
    width: '100%',
  } as React.CSSProperties,
}

// ─────────────────────────────────────────────────────────────────────────
// Petits composants UI réutilisés dans tout le wizard
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Helpers purs
// ─────────────────────────────────────────────────────────────────────────

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('read_failed'))
    reader.readAsDataURL(file)
  })
}

function resizeImageDataUrl(dataUrl: string, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas_unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = dataUrl
  })
}

async function uploadMedia(dataUri: string): Promise<string> {
  const res = await fetch('/api/organizer-events/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUri }),
  })
  const data = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null
  if (!res.ok || !data?.ok || !data.url) throw new Error(data?.error || 'upload_failed')
  return data.url
}

async function registerUploadedVideo(file: File): Promise<string> {
  const upload = await uploadPublicMedia(file, 'event')
  const res = await fetch('/api/organizer-events/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload }),
  })
  const data = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; error?: string } | null
  if (!res.ok || !data?.ok || !data.url) throw new Error(data?.error || 'upload_failed')
  return data.url
}

// Associe chaque champ de payload (clés de `buildPayload`) à l'étape du
// wizard où il est saisi, pour pouvoir ramener l'organisateur au bon endroit
// quand le serveur renvoie une erreur de validation par champ (`invalid_body`
// + `details.fieldErrors` — voir app/api/organizer-events/route.ts).
const FIELD_STEP: Record<string, number> = {
  name: 0,
  subtitle: 0,
  description: 0,
  category: 0,
  tags: 0,
  eventType: 0,
  musicStyles: 0,
  ambiances: 0,
  date: 0,
  time: 0,
  endTime: 0,
  artists: 0,
  dj: 0,
  performers: 0,
  minAge: 0,
  imageUrl: 0,
  videoUrl: 0,
  places: 1,
  location: 2,
  city: 2,
  region: 2,
  playlist: 3,
  preorder: 3,
  menu: 3,
  publishAt: 3,
  closingDate: 3,
}

const SAVE_ERROR_MESSAGES: Record<string, string> = {
  event_cancelled: 'Cet événement a été annulé — impossible de le modifier.',
  forbidden: "Tu n'as pas accès à cet événement.",
  event_not_found: 'Événement introuvable.',
  invalid_body: 'Vérifie les champs du formulaire.',
  auth_required: 'Ta session a expiré — reconnecte-toi.',
}

// ─────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────

export default function EventWizard({ eventId, initialRegion = '', onClose, onSaved }: { eventId: string | null; initialRegion?: string; onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(!!eventId)
  const [loadError, setLoadError] = useState('')
  const [cancelled, setCancelled] = useState(false)
  const [locked, setLocked] = useState(false)
  const [totalSold, setTotalSold] = useState(0)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── Step 0 : Bases ──
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [timeStart, setTimeStart] = useState('')
  const [timeEnd, setTimeEnd] = useState('')
  const [showArtistSection, setShowArtistSection] = useState(false)
  const [artists, setArtists] = useState<ArtistRow[]>([])
  // Recherche de prestataire à associer à une ligne du line-up (#E7,
  // confirmé en réunion live le 11/08/2026) — index de la ligne ouverte,
  // requête, résultats. Même seuil (2 caractères, 350ms) que la recherche
  // staff d'EventStaffModal.tsx.
  const [providerSearchFor, setProviderSearchFor] = useState<number | null>(null)
  const [providerQuery, setProviderQuery] = useState('')
  const [providerResults, setProviderResults] = useState<{ userId: string; name: string; headline?: string }[]>([])
  const [providerSearching, setProviderSearching] = useState(false)

  useEffect(() => {
    // Résultats trop courts/absents : dérivés directement au rendu via
    // `providerQuery.trim().length < 2` plus bas (aucun rendu de résultat
    // sous 2 caractères), donc pas besoin de reset ici — évite un setState
    // synchrone dans le corps de l'effet (même pattern qu'EventStaffModal.tsx).
    const q = providerQuery.trim()
    if (providerSearchFor === null || q.length < 2) return
    let cancelled = false
    const t = setTimeout(async () => {
      setProviderSearching(true)
      try {
        const res = await fetch(`/api/providers?q=${encodeURIComponent(q)}`)
        const data = await res.json().catch(() => null)
        if (!cancelled) setProviderResults(res.ok && data?.ok ? data.providers.slice(0, 6) : [])
      } catch {
        if (!cancelled) setProviderResults([])
      } finally {
        if (!cancelled) setProviderSearching(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [providerQuery, providerSearchFor])
  const [category, setCategory] = useState('')
  const [customGenre, setCustomGenre] = useState('')
  const [partyType, setPartyType] = useState('')
  const [musicStyles, setMusicStyles] = useState<string[]>([])
  const [ambiances, setAmbiances] = useState<string[]>([])
  const [minAge, setMinAge] = useState(18)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [posterCropSrc, setPosterCropSrc] = useState<string | null>(null)
  const [posterUploading, setPosterUploading] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoPreview, setVideoPreview] = useState<string | null>(null)
  const [videoName, setVideoName] = useState('')
  const [videoUploading, setVideoUploading] = useState(false)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // ── Step 1 : Places & Prix ──
  const [places, setPlaces] = useState<PlaceRow[]>([defaultPlaceRow()])
  const [placePhotoUploadingKeys, setPlacePhotoUploadingKeys] = useState<Set<string>>(new Set())

  // ── Step 2 : Lieu & infos pratiques ──
  const [venueName, setVenueName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState(initialRegion)

  // ── Step 3 : Options avancées ──
  const [playlist, setPlaylist] = useState(false)
  const [preorder, setPreorder] = useState(false)
  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([emptyMenuItem()])
  const [publishAt, setPublishAt] = useState('')
  const [closingDate, setClosingDate] = useState('')
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)

  // ── Suivi des modifications non enregistrées (confirmation à la fermeture) ──
  function snapshotForm() {
    return snapshotEventWizardForm({
      name,
      subtitle,
      description,
      dateStr,
      timeStart,
      timeEnd,
      artists,
      category,
      customGenre,
      partyType,
      musicStyles,
      ambiances,
      minAge,
      imageUrl,
      videoUrl,
      places,
      venueName,
      address,
      city,
      region,
      playlist,
      preorder,
      menuItems,
      publishAt,
      closingDate,
    })
  }
  const baselineSnapshotRef = useRef<string | null>(null)

  function hydrate(ev: ServerEventDetail) {
    setName(ev.name || '')
    setSubtitle(ev.subtitle || '')
    setDescription(ev.description || '')
    setDateStr(ev.date || '')
    setTimeStart(ev.time || '')
    setTimeEnd(ev.endTime || '')
    const filteredArtists = (ev.artists || []).filter((a) => a.name?.trim())
    setArtists(filteredArtists.map((a) => ({ name: a.name, role: a.role || 'DJ', providerId: a.providerId || null })))
    setShowArtistSection(filteredArtists.length > 0)
    if (ev.category && GENRES.includes(ev.category)) {
      setCategory(ev.category)
      setCustomGenre('')
    } else if (ev.category) {
      setCategory('Autre')
      setCustomGenre(ev.category)
    } else {
      setCategory('')
      setCustomGenre('')
    }
    setPartyType(ev.eventType || '')
    setMusicStyles(ev.musicStyles || [])
    setAmbiances(ev.ambiances || [])
    setMinAge(typeof ev.minAge === 'number' ? ev.minAge : 18)
    setImageUrl(ev.imageUrl || null)
    setImagePreview(ev.imageUrl || null)
    setVideoUrl(ev.videoUrl || null)
    setVideoPreview(ev.videoUrl || null)
    setVideoName(ev.videoUrl ? 'Vidéo d’aperçu' : '')
    setPlaces(
      ev.places && ev.places.length > 0
        ? ev.places.map((p) => ({
            key: p.id || makeLocalKey(),
            id: p.id,
            type: p.type,
            price: p.price,
            qty: p.total,
            sold: p.sold || 0,
            maxPerAccount: p.maxPerAccount || 0,
            groupType: p.groupType || 'solo',
            groupMin: p.groupMin || 0,
            groupMax: p.groupMax || 0,
            photos: Array.isArray(p.photos) ? p.photos : [],
            included: Array.isArray(p.included) ? p.included : [],
          }))
        : [defaultPlaceRow()]
    )
    // `location` est stocké côté serveur comme "Nom du lieu, Adresse" (voir
    // buildPayload ci-dessous) — on le reparse au chargement pour ne pas
    // vider le champ Adresse à chaque édition (sinon `buildPayload`
    // reconcatène et duplique/perd la valeur à la sauvegarde suivante).
    const [parsedVenueName, ...parsedAddressParts] = (ev.location || '').split(',')
    setVenueName((parsedVenueName || '').trim())
    setAddress(parsedAddressParts.join(',').trim())
    setCity(ev.city || '')
    setRegion(ev.region || '')
    setPlaylist(!!ev.playlist)
    setPreorder(!!ev.preorder)
    setMenuItems(ev.menu && ev.menu.length > 0 ? ev.menu.map((item) => ({ ...item, available: item.available !== false })) : [emptyMenuItem()])
    setPublishAt(toDatetimeLocalValue(ev.publishAt))
    setClosingDate(toDatetimeLocalValue(ev.closingDate))
    setCancelled(!!ev.cancelled)
    setLocked(!!ev.locked)
    setTotalSold(ev.totalSold || 0)
  }

  // ── Chargement (mode édition) — l'état initial de `loading` (!!eventId)
  // couvre déjà le cas création, donc pas de setState synchrone à faire ici
  // quand eventId est absent.
  useEffect(() => {
    if (!eventId) return
    let ignore = false
    fetch(`/api/organizer-events/${eventId}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { ok?: boolean; event?: ServerEventDetail; error?: string } | null
        if (ignore) return
        if (!res.ok || !data?.ok || !data.event) {
          setLoadError('Impossible de charger cet événement.')
          setLoading(false)
          return
        }
        hydrate(data.event)
        setLoading(false)
      })
      .catch(() => {
        if (!ignore) {
          setLoadError('Impossible de charger cet événement — vérifie ta connexion.')
          setLoading(false)
        }
      })
    return () => {
      ignore = true
    }
  }, [eventId])

  // Capture l'état de référence (création : formulaire vide ; édition : juste
  // après hydrate()) pour pouvoir détecter des modifications non enregistrées
  // avant de fermer le wizard sans confirmation.
  useEffect(() => {
    if (!loading) baselineSnapshotRef.current = snapshotForm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  function isFormDirty() {
    return baselineSnapshotRef.current !== null && baselineSnapshotRef.current !== snapshotForm()
  }

  function requestClose() {
    if (isFormDirty()) {
      setConfirmCloseOpen(true)
      return
    }
    onClose()
  }

  // ── Médias ──
  async function handlePoster(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors((err) => ({ ...err, image: 'Format invalide — JPG, PNG ou WEBP uniquement' }))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((err) => ({ ...err, image: 'Fichier trop lourd — 5 Mo maximum' }))
      return
    }
    setErrors((err) => ({ ...err, image: '' }))
    try {
      setPosterCropSrc(await readFileAsDataUrl(file))
    } catch {
      setErrors((err) => ({ ...err, image: "Impossible de lire l'affiche sélectionnée." }))
    }
  }

  async function uploadCroppedPoster(dataUrl: string) {
    setPosterUploading(true)
    try {
      setImagePreview(dataUrl)
      const url = await uploadMedia(dataUrl)
      setImageUrl(url)
      setImagePreview(url)
    } catch {
      setErrors((err) => ({ ...err, image: "L'envoi de l'affiche a échoué — réessaie." }))
    } finally {
      setPosterUploading(false)
      setPosterCropSrc(null)
    }
  }

  async function handleVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
      setErrors((err) => ({ ...err, video: 'Format invalide — MP4, WEBM ou MOV uniquement' }))
      return
    }
    if (file.size > 30_000_000) {
      setErrors((err) => ({ ...err, video: 'Vidéo trop lourde — 30 Mo maximum.' }))
      return
    }
    setErrors((err) => ({ ...err, video: '' }))
    setVideoUploading(true)
    const localPreview = URL.createObjectURL(file)
    try {
      setVideoPreview(localPreview)
      setVideoName(file.name || 'Vidéo d’aperçu')
      const url = await registerUploadedVideo(file)
      URL.revokeObjectURL(localPreview)
      setVideoUrl(url)
      setVideoPreview(url)
    } catch {
      URL.revokeObjectURL(localPreview)
      setVideoPreview(null)
      setVideoName('')
      setErrors((err) => ({ ...err, video: "L'envoi de la vidéo a échoué — réessaie." }))
    } finally {
      setVideoUploading(false)
    }
  }

  function clearVideo() {
    setVideoUrl(null)
    setVideoPreview(null)
    setVideoName('')
  }

  async function handlePlacePhotos(placeKey: string, fileList: FileList | null) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setPlacePhotoUploadingKeys((prev) => new Set(prev).add(placeKey))
    try {
      for (const file of files) {
        try {
          const dataUrl = await readFileAsDataUrl(file)
          const resized = await resizeImageDataUrl(dataUrl, 1280, 0.85)
          const url = await uploadMedia(resized)
          setPlaces((prev) =>
            prev.map((p) => (p.key === placeKey ? { ...p, photos: [...p.photos, url].slice(0, MAX_PLACE_PHOTOS) } : p))
          )
        } catch {
          // Une photo qui échoue ne bloque pas les suivantes.
        }
      }
    } finally {
      setPlacePhotoUploadingKeys((prev) => {
        const next = new Set(prev)
        next.delete(placeKey)
        return next
      })
    }
  }

  // ── Validation par étape ──
  function validateStep0(): boolean {
    const errs = validateWizardBasics({ name, dateStr, timeStart, timeEnd, locked })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function validateStep1(): boolean {
    const errs = validateWizardPlaces(places)
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function validateStep2(): boolean {
    const errs = validateWizardLocation({ city, region })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const canProceedStep3 = canProceedWizardAdvancedStep(preorder, menuItems)
  const validMenuItemsForGate = getValidMenuItems(menuItems)

  function goNext(current: number) {
    if (current === 0 && !validateStep0()) return
    if (current === 1 && !validateStep1()) return
    if (current === 2 && !validateStep2()) return
    if (current === 3 && !canProceedStep3) return
    setErrors({})
    setStep(current + 1)
  }

  // ── Construction de la charge utile & soumission ──
  function buildPayload(): EventFormInput {
    return buildEventPayload({
      name,
      subtitle,
      description,
      category,
      customGenre,
      partyType,
      musicStyles,
      ambiances,
      artists,
      minAge,
      imageUrl,
      videoUrl,
      places,
      venueName,
      address,
      city,
      region,
      playlist,
      preorder,
      menuItems,
      publishAt,
      closingDate,
      dateStr,
      timeStart,
      timeEnd,
    })
  }

  async function handleSubmit() {
    setSaving(true)
    setSaveError('')
    try {
      const payload = buildPayload()
      const url = eventId ? `/api/organizer-events/${eventId}` : '/api/organizer-events'
      const method = eventId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        details?: { fieldErrors?: Record<string, string[]> }
      } | null
      if (!res.ok || !data?.ok) {
        if (data?.error === 'invalid_body' && data.details?.fieldErrors) {
          const badField = Object.keys(data.details.fieldErrors).find((f) => f in FIELD_STEP)
          if (badField !== undefined) {
            setStep(FIELD_STEP[badField])
            setSaveError(`Vérifie le champ « ${badField} » à l'étape « ${STEP_NAMES[FIELD_STEP[badField]]} ».`)
            setSaving(false)
            return
          }
        }
        setSaveError(SAVE_ERROR_MESSAGES[data?.error || ''] || 'Vérifie les champs du formulaire.')
        setSaving(false)
        return
      }
      onSaved()
    } catch {
      setSaveError('Vérifie ta connexion et réessaie.')
      setSaving(false)
    }
  }

  // ── Rendu ──

  if (loading) {
    return (
      <main style={{ width: '100%', padding: 'var(--space-12) var(--page-gutter) 72px', display: 'flex', justifyContent: 'center' }}>
        <Spinner size={22} />
      </main>
    )
  }

  if (loadError) {
    return (
      <main style={{ width: '100%', padding: 'var(--space-12) var(--page-gutter) 56px', textAlign: 'center' }}>
        <p style={{ color: 'var(--pink)', fontSize: 'var(--font-size-body-sm)', marginBottom: 18 }}>{loadError}</p>
        <Button
          variant="secondary"
          onClick={onClose}
          style={{ padding: '12px 22px', borderRadius: 3, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text)', textTransform: 'none', letterSpacing: 'normal' }}
        >
          Retour au tableau de bord
        </Button>
      </main>
    )
  }

  if (cancelled) {
    return (
      <main style={{ width: '100%', padding: 'var(--space-8) var(--page-gutter) 100px' }}>
        <div
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--danger-border)',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            boxShadow: '0 8px 24px var(--scrim-mid)',
            marginBottom: 20,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <circle cx="12" cy="16" r="0.6" fill="var(--danger)" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 'var(--font-size-footnote)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--danger)', margin: '0 0 4px' }}>
              Événement annulé
            </p>
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-faint)', margin: 0, lineHeight: 1.6 }}>
              Cet événement a été annulé. Les modifications sont désactivées. Pour relancer un événement similaire, crée-en un nouveau depuis ton tableau de bord.
            </p>
          </div>
        </div>
        <Button variant="primary" onClick={onClose} style={S.btnPrimary}>
          Retour au tableau de bord
        </Button>
      </main>
    )
  }

  const currency = regionToCurrency(region)

  return (
    <main style={{ width: '100%', padding: 'var(--space-6) var(--page-gutter) 100px', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button
          variant="ghost"
          aria-label={step === 0 ? 'Fermer la création d’événement' : 'Revenir à l’étape précédente'}
          onClick={() => (step === 0 ? requestClose() : setStep((s) => s - 1))}
          style={{ width: 44, height: 44, minHeight: 44, minWidth: 44, padding: 0, borderRadius: 'var(--radius-control)', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Button>
        <div>
          <p className="font-display" style={{ fontSize: 'var(--font-size-title-5)', color: 'var(--text)', margin: 0 }}>
            {eventId ? "Modifier l'événement" : 'Créer un événement'}
          </p>
          <p style={{ fontSize: 'var(--font-size-footnote)', letterSpacing: '0.02em', color: 'var(--text-faint)', marginTop: 2 }}>
            Étape {step + 1}/{STEP_NAMES.length} — {STEP_NAMES[step]}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 4 }}>
        {STEP_NAMES.map((s, i) => (
          <div key={s} style={{ flex: 1, height: 2, borderRadius: 2, background: i <= step ? 'var(--gold)' : 'var(--surface-2)', transition: 'background 0.3s' }} />
        ))}
      </div>

      {/* Bannière verrouillage post-vente */}
      {locked && (
        <div
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--primary-a35)',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            boxShadow: '0 8px 24px var(--scrim-mid)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11 V7 a4 4 0 0 1 8 0 V11" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 'var(--font-size-footnote)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 4px' }}>
              {totalSold} billet{totalSold > 1 ? 's' : ''} déjà vendu{totalSold > 1 ? 's' : ''}
            </p>
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
              Pour ne pas léser les acheteurs, certains champs sont verrouillés (date, heures, lieu, prix existants, type d&apos;événement, âge minimum, options, date de publication). Tu peux toujours modifier la description, l&apos;affiche, les artistes et la date de clôture.
            </p>
          </div>
        </div>
      )}

      {/* Erreur de sauvegarde — visible quelle que soit l'étape courante,
          car une erreur de validation serveur peut ramener l'utilisateur à
          une étape antérieure à celle du récapitulatif (étape 4). */}
      {saveError && <p style={{ color: 'var(--pink)', fontSize: 'var(--font-size-footnote-lg)', margin: 0 }}>{saveError}</p>}

      {/* ── Step 0 : Bases ── */}
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Affiche */}
          <div>
            <label style={S.label}>Affiche / Photo de l&apos;événement</label>
            <Button
              variant="ghost"
              fullWidth
              onClick={() => imageInputRef.current?.click()}
              style={{
                position: 'relative',
                display: 'block',
                padding: 0,
                borderRadius: 12,
                overflow: 'hidden',
                aspectRatio: '16/9',
                border: imagePreview ? '1px solid var(--primary-a35)' : '2px dashed var(--border-strong)',
                background: 'var(--surface-2)',
              }}
            >
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="Aperçu affiche" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--border-strong)" strokeWidth="1" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <p style={{ fontSize: 'var(--font-size-callout)', fontWeight: 600, color: 'var(--text-muted)' }}>Clique pour ajouter l&apos;affiche</p>
                  <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)' }}>Format recommandé : 1200 × 630 px</p>
                  <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)' }}>JPG, PNG ou WEBP — 5 Mo maximum</p>
                </div>
              )}
              {posterUploading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--media-black-rgb), .55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spinner size={20} />
                </div>
              )}
            </Button>
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePoster} />
            {errors.image && <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--danger)', marginTop: 4 }}>{errors.image}</p>}
          </div>

          {/* Vidéo d'aperçu */}
          <div>
            <label style={S.label}>
              Vidéo d&apos;aperçu au survol <span style={{ color: 'var(--text-faint)' }}>(optionnel)</span>
            </label>
            <div
              style={{
                position: 'relative',
                minHeight: 118,
                borderRadius: 12,
                overflow: 'hidden',
                border: videoPreview ? '1px solid var(--primary-a32)' : '1px dashed var(--border-strong)',
                background: 'var(--surface-2)',
              }}
            >
              {videoPreview ? (
                <>
                  <video src={videoPreview} controls muted playsInline preload="metadata" style={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'cover', background: 'var(--surface-2)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--surface-2)' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, color: 'var(--teal)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{videoName || 'Vidéo d’aperçu'}</p>
                      <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', margin: '3px 0 0' }}>Elle se lance après 1 seconde de survol sur les cartes événement.</p>
                    </div>
                    <Button
                      variant="danger"
                      onClick={clearVideo}
                      style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--danger-border)', background: 'var(--danger-fill)', color: 'var(--danger)', fontSize: 'var(--font-size-footnote)' }}
                    >
                      Retirer
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={() => videoInputRef.current?.click()}
                  style={{ minHeight: 118, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 13, padding: 16, border: 0, background: 'transparent', textAlign: 'left' }}
                >
                  <span style={{ width: 42, height: 42, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--primary-a10)', border: '1px solid var(--focus-ring-color)', color: 'var(--teal)', flexShrink: 0 }}>
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--font-size-callout)', fontWeight: 700, color: 'var(--text)' }}>Ajouter une courte vidéo</span>
                    <span style={{ display: 'block', fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', lineHeight: 1.5, marginTop: 4 }}>MP4, WEBM ou MOV · 30 Mo maximum. Idéal : 6 à 12 secondes en 720p.</span>
                  </span>
                </Button>
              )}
              {videoUploading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--media-black-rgb), .55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spinner size={20} />
                </div>
              )}
            </div>
            <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: 'none' }} onChange={handleVideo} />
            {errors.video && <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--danger)', marginTop: 4 }}>{errors.video}</p>}
          </div>

          {/* Champs de base */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <InputField label="Nom de l'événement *" placeholder="Ex: NEON NIGHT Vol.3" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
            </div>
            <InputField label="Sous-titre" placeholder="Ex: Une nuit afro-house hors du temps" value={subtitle} maxLength={120} onChange={(e) => setSubtitle(e.target.value)} />
            <InputField label="Date *" type="date" value={dateStr} min={locked ? undefined : new Date().toISOString().split('T')[0]} onChange={(e) => setDateStr(e.target.value)} error={errors.date} locked={locked} />
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                <InputField label="Heure début" type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} locked={locked} />
                <InputField label="Heure fin" type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} locked={locked} />
              </div>
              {errors.timeEnd && <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--danger)', marginTop: 4 }}>{errors.timeEnd}</p>}
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Description courte</label>
              <Textarea
                style={{ ...S.inputBase, resize: 'none', height: 64 }}
                placeholder="Décris ta soirée en deux ou trois phrases…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* DJs / Artistes */}
            <Card style={{ padding: 12, gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showArtistSection ? 12 : 0 }}>
                <div>
                  <p style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 600, color: 'var(--text)' }}>DJs / Artistes</p>
                  <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', marginTop: 2 }}>Affiché sur la playlist et la fiche événement</p>
                </div>
                <Toggle value={showArtistSection} onChange={() => setShowArtistSection((v) => !v)} />
              </div>
              {showArtistSection && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {artists.map((a, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 130, flexShrink: 0 }}>
                          <Select
                            value={a.role}
                            onChange={(value) => setArtists((prev) => prev.map((x, xi) => (xi === i ? { ...x, role: value } : x)))}
                            options={ARTIST_ROLES.map((r) => ({ value: r, label: r }))}
                          />
                        </div>
                        <Input
                          style={{ ...S.inputBase, flex: 1 }}
                          placeholder="Nom de l'artiste"
                          value={a.name}
                          onChange={(e) => setArtists((prev) => prev.map((x, xi) => (xi === i ? { ...x, name: e.target.value, providerId: null } : x)))}
                        />
                        <Button
                          variant="ghost"
                          title={a.providerId ? 'Prestataire associé — cliquer pour changer' : 'Associer un profil prestataire existant'}
                          onClick={() => {
                            setProviderSearchFor(providerSearchFor === i ? null : i)
                            setProviderQuery('')
                          }}
                          style={{
                            flexShrink: 0,
                            width: 38,
                            height: 38,
                            minHeight: 38,
                            minWidth: 38,
                            borderRadius: 12,
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: a.providerId ? '1px solid var(--primary-a42)' : '1px solid var(--border-strong)',
                            background: a.providerId ? 'var(--primary-a14)' : 'var(--surface-2)',
                            color: a.providerId ? 'var(--teal)' : 'var(--text-muted)',
                            fontSize: 'var(--font-size-headline)',
                            fontWeight: 800,
                          }}
                        >
                          +
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setArtists((prev) => prev.filter((_, xi) => xi !== i))}
                          style={{ background: 'none', border: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', padding: 4 }}
                        >
                          <IconClose size={13} color="var(--danger)" />
                        </Button>
                      </div>
                      {a.providerId && (
                        <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--teal)', margin: '0 0 0 138px' }}>
                          Lié à un profil prestataire — alimentera son historique d&apos;événements.
                        </p>
                      )}
                      {providerSearchFor === i && (
                        <div style={{ margin: '0 0 4px 138px', padding: 10, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <Input
                            style={{ ...S.inputBase }}
                            placeholder="Rechercher un prestataire par nom…"
                            value={providerQuery}
                            onChange={(e) => setProviderQuery(e.target.value)}
                            autoFocus
                          />
                          {providerQuery.trim().length > 0 && providerQuery.trim().length < 2 ? (
                            <p style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-faint)', margin: 0 }}>Tape au moins 2 caractères.</p>
                          ) : providerQuery.trim().length >= 2 ? (
                            providerSearching ? (
                              <p style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-faint)', margin: 0 }}>Recherche…</p>
                            ) : providerResults.length === 0 ? (
                              <p style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-faint)', margin: 0 }}>Aucun prestataire trouvé.</p>
                            ) : (
                              providerResults.map((p) => (
                                <Button
                                  key={p.userId}
                                  variant="ghost"
                                  size="sm"
                                  fullWidth
                                  onClick={() => {
                                    setArtists((prev) => prev.map((x, xi) => (xi === i ? { ...x, name: p.name, providerId: p.userId } : x)))
                                    setProviderSearchFor(null)
                                  }}
                                  style={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--surface-2)', color: 'var(--text)', fontSize: 'var(--font-size-body-sm)' }}
                                >
                                  {p.name}
                                  {p.headline && <span style={{ color: 'var(--text-faint)' }}> · {p.headline}</span>}
                                </Button>
                              ))
                            )
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    onClick={() => setArtists((prev) => [...prev, { name: '', role: 'DJ' }])}
                    style={{ padding: '10px', fontSize: 'var(--font-size-callout)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 10, background: 'var(--surface-2)' }}
                  >
                    + Ajouter un DJ / artiste
                  </Button>
                </div>
              )}
            </Card>
          </div>

          {/* Genre musical */}
          <div>
            <label style={{ ...S.label, marginBottom: 8 }}>Genre musical</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {GENRES.map((g) => (
                <Button
                  key={g}
                  variant="ghost"
                  onClick={() => {
                    setCategory(g)
                    if (g !== 'Autre') setCustomGenre('')
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: 10,
                    display: 'block',
                    border: category === g ? '1px solid var(--primary-a55)' : '1px solid var(--border)',
                    background: category === g ? 'var(--primary-a10)' : 'var(--surface)',
                    fontSize: 'var(--font-size-footnote)',
                    fontWeight: 600,
                    color: category === g ? 'var(--gold)' : 'var(--text-muted)',
                    textAlign: 'center',
                  }}
                >
                  {g}
                </Button>
              ))}
            </div>
            {category === 'Autre' && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Input
                  autoFocus
                  type="text"
                  maxLength={40}
                  placeholder="Précise le genre (ex : Afropop, Jazz, Amapiano…)"
                  value={customGenre}
                  onChange={(e) => setCustomGenre(e.target.value)}
                  style={{ ...S.inputBase, padding: '9px 14px', border: customGenre.trim() ? '1px solid var(--primary-a42)' : '1px solid var(--primary-a20)' }}
                />
              </div>
            )}
          </div>

          {/* Ciblage & recommandations */}
          <div>
            <label style={{ ...S.label, marginBottom: 4 }}>Ciblage & recommandations</label>
            <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', lineHeight: 1.6, margin: '0 0 12px' }}>
              Optionnel mais recommandé : ta soirée sera proposée en priorité aux clients dont les goûts correspondent.
            </p>

            <p style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 7px' }}>Type de soirée</p>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
              {EVENT_TYPES.map((t) => (
                <Pill key={t} label={t} active={partyType === t} onClick={() => setPartyType((cur) => (cur === t ? '' : t))} accent="var(--violet)" />
              ))}
            </div>

            <p style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 7px' }}>Styles musicaux joués</p>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
              {MUSIC_STYLES.map((mstyle) => (
                <Pill
                  key={mstyle}
                  label={mstyle}
                  active={musicStyles.includes(mstyle)}
                  onClick={() => setMusicStyles((cur) => (cur.includes(mstyle) ? cur.filter((x) => x !== mstyle) : [...cur, mstyle]))}
                  accent="var(--teal)"
                />
              ))}
            </div>

            <p style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 7px' }}>Ambiance (3 max)</p>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {AMBIANCES.map((a) => {
                const active = ambiances.includes(a)
                const full = !active && ambiances.length >= AMBIANCE_MAX
                return (
                  <Pill
                    key={a}
                    label={a}
                    active={active}
                    disabled={full}
                    onClick={() => setAmbiances((cur) => (active ? cur.filter((x) => x !== a) : [...cur, a]))}
                    accent="var(--gold)"
                  />
                )
              })}
            </div>
          </div>

          {/* Âge minimum */}
          <div>
            <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 6 }}>
              Âge minimum requis {locked && <LockIcon />}
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {AGE_PRESETS.map(({ label: presetLabel, value }) => (
                <Button
                  key={value}
                  variant="ghost"
                  disabled={locked}
                  title={locked ? 'Verrouillé — billets déjà vendus' : undefined}
                  onClick={() => setMinAge(value)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 10,
                    border: minAge === value ? '1px solid var(--primary-a55)' : '1px solid var(--border)',
                    background: minAge === value ? 'var(--primary-a12)' : 'var(--surface)',
                    color: minAge === value ? 'var(--teal)' : 'var(--text-muted)',
                    fontSize: 'var(--font-size-footnote)',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    opacity: locked && minAge !== value ? 0.4 : 1,
                  }}
                >
                  {presetLabel}
                </Button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Input
                type="number"
                min={0}
                max={99}
                value={minAge === 0 ? '' : minAge}
                placeholder="Autre âge…"
                disabled={locked}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (e.target.value === '') {
                    setMinAge(0)
                    return
                  }
                  if (!Number.isNaN(v) && v >= 0 && v <= 99) setMinAge(v)
                }}
                style={{ ...S.inputBase, width: 130, padding: '8px 14px', opacity: locked ? 0.55 : 1, cursor: locked ? 'not-allowed' : 'text' }}
              />
              <span style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)' }}>{minAge === 0 ? 'Tout public' : `${minAge} ans minimum`}</span>
            </div>
          </div>

          <Button variant="primary" onClick={() => goNext(0)} style={S.btnPrimary}>
            Suivant
          </Button>
        </div>
      )}

      {/* ── Step 1 : Places & Prix ── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <p style={{ fontFamily: 'var(--font-display), sans-serif', fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3.2px', margin: '0 0 4px' }}>Places &amp; Prix</p>
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-faint)' }}>Configure chaque type de place que tu veux proposer.</p>
          </div>

          {(() => {
            const isXof = currency === 'XOF'
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--surface-2)', borderLeft: `3px solid ${isXof ? 'var(--teal)' : 'var(--gold)'}` }}>
                {isXof ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                    <rect x="7" y="2" width="10" height="20" rx="2" />
                    <line x1="11" y1="18" x2="13" y2="18" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                )}
                <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                  Tu fixes tes prix en <strong style={{ color: isXof ? 'var(--teal)' : 'var(--gold)' }}>{currencySymbol(currency)}</strong> — paiement par {payRailLabel(currency)}.
                </p>
              </div>
            )
          })()}

          {places.map((place, i) => {
            const placeHasSales = place.sold > 0
            const menuChoices = menuItems.filter((m) => m.name.trim() && m.price > 0)
            return (
              <Card key={place.key} accent={placeHasSales ? 'var(--primary-a24)' : undefined} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>Place {i + 1}</p>
                    {placeHasSales && (
                      <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--gold)', background: 'var(--primary-a14)', border: '1px solid var(--primary-a35)', borderRadius: 8, padding: '4px 10px' }}>
                        {place.sold} vendu{place.sold > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {places.length > 1 && (
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (placeHasSales) return
                        setPlaces((prev) => prev.filter((p) => p.key !== place.key))
                      }}
                      disabled={placeHasSales}
                      title={placeHasSales ? 'Impossible — cette place a déjà été vendue' : undefined}
                      style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--danger-fill)', border: '1px solid var(--danger-border)', opacity: placeHasSales ? 0.4 : 1, fontSize: 'var(--font-size-footnote)', color: 'var(--danger)' }}
                    >
                      Supprimer
                    </Button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <InputField
                    label="Nom du type *"
                    placeholder="Ex: Carré VIP"
                    value={place.type}
                    onChange={(e) => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, type: e.target.value } : p)))}
                    error={errors[`place_${place.key}`]}
                    locked={placeHasSales}
                  />
                  <NumberInputField
                    label={`Prix (${currencySymbol(currency)})`}
                    placeholder="0 = gratuit"
                    value={place.price}
                    min={0}
                    onChange={(v) => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, price: v } : p)))}
                    locked={placeHasSales}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <NumberInputField
                      label="Quantité disponible"
                      placeholder="Ex: 100"
                      value={place.qty}
                      min={placeHasSales ? place.sold : 0}
                      onChange={(v) => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, qty: v } : p)))}
                    />
                    {placeHasSales && (
                      <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--primary-a85)', marginTop: 4 }}>
                        Minimum : {place.sold} (déjà vendu{place.sold > 1 ? 's' : ''})
                      </p>
                    )}
                  </div>
                  <div>
                    <NumberInputField
                      label={place.groupType === 'group' ? 'Réservations de groupe/compte' : 'Max/compte'}
                      placeholder="0 = illimité"
                      value={place.groupType === 'group' ? 1 : place.maxPerAccount}
                      min={0}
                      onChange={(v) => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, maxPerAccount: v } : p)))}
                      locked={placeHasSales || place.groupType === 'group'}
                    />
                    {place.groupType === 'group' && (
                      <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--primary-a75)', marginTop: 4 }}>Fixé à 1 réservation de groupe par compte</p>
                    )}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--surface-2)', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 600, color: 'var(--text)' }}>Place de groupe</p>
                    <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', marginTop: 2 }}>Réservation pour plusieurs personnes</p>
                  </div>
                  <Toggle
                    value={place.groupType === 'group'}
                    disabled={placeHasSales}
                    onChange={() =>
                      setPlaces((prev) =>
                        prev.map((p) =>
                          p.key === place.key
                            ? { ...p, groupType: p.groupType === 'group' ? 'solo' : 'group', maxPerAccount: p.groupType !== 'group' ? 1 : p.maxPerAccount }
                            : p
                        )
                      )
                    }
                  />
                </div>
                {place.groupType === 'group' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ ...S.label, color: 'var(--teal)' }}>Capacité du groupe</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <NumberInputField
                        label="Min personnes"
                        placeholder="Ex: 8"
                        value={place.groupMin || 0}
                        min={0}
                        onChange={(v) => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, groupMin: v } : p)))}
                        locked={placeHasSales}
                      />
                      <NumberInputField
                        label="Max personnes"
                        placeholder="Ex: 12"
                        value={place.groupMax || 0}
                        // Jamais en dessous du min déjà saisi — évite de
                        // pouvoir enregistrer un groupMax < groupMin (bug
                        // confirmé, validé aussi côté serveur ci-dessous).
                        min={place.groupMin || 0}
                        onChange={(v) => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, groupMax: v } : p)))}
                        locked={placeHasSales}
                      />
                    </div>
                    <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)' }}>La réservation est validée dès le minimum atteint, jusqu&apos;au maximum indiqué.</p>
                  </div>
                )}

                {/* Photos */}
                <div style={{ borderTop: '1px solid var(--surface-2)', paddingTop: 12 }}>
                  <p style={S.label}>
                    Photos de cette place <span style={{ color: 'var(--text-faint)' }}>(optionnel)</span>
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {place.photos.map((ph, k) => (
                      <div key={k} style={{ position: 'relative', width: 66, height: 66, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                        <NextImage src={ph} alt="" fill style={{ objectFit: 'cover' }} sizes="66px" />
                        <Button
                          variant="ghost"
                          onClick={() => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, photos: p.photos.filter((_, m) => m !== k) } : p)))}
                          title="Retirer"
                          style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, minHeight: 18, minWidth: 18, borderRadius: '50%', background: 'var(--scrim-page)', border: '1px solid var(--border-strong)', color: 'var(--text)', fontSize: 'var(--font-size-footnote)', lineHeight: '15px', padding: 0 }}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                    {place.photos.length < MAX_PLACE_PHOTOS && (
                      <label style={{ width: 66, height: 66, borderRadius: 8, border: '1px dashed var(--primary-a04)', background: 'var(--primary-a05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer', color: 'var(--gold)', flexShrink: 0 }}>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            void handlePlacePhotos(place.key, e.target.files)
                            e.target.value = ''
                          }}
                        />
                        {placePhotoUploadingKeys.has(place.key) ? (
                          <Spinner size={16} />
                        ) : (
                          <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <span style={{ fontSize: 'var(--font-size-caption-2)', fontWeight: 700 }}>Ajouter</span>
                          </>
                        )}
                      </label>
                    )}
                  </div>
                  <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.5 }}>
                    Montre le carré, la table, la vue… Le client les verra avant de réserver. 6 photos maximum.
                  </p>
                </div>

                {/* Options incluses — deux façons de les renseigner : un texte
                    libre ("avantage inclus", ex. "Vestiaire offert",
                    demandé en réunion live le 11/08/2026, auparavant
                    impossible à saisir sans passer par le menu) OU un
                    article réel du menu/précommande (rattache un item
                    facturable existant, offert gratuitement sur ce billet).
                    Le champ modèle `included[].name` reste un simple texte
                    dans les deux cas — la distinction est purement une
                    facilité de saisie côté UI. */}
                <div style={{ borderTop: '1px solid var(--surface-2)', paddingTop: 12 }}>
                  <p style={S.label}>
                    Options incluses dans ce billet <span style={{ color: 'var(--text-faint)' }}>(optionnel)</span>
                  </p>
                  {place.included.length === 0 && (
                    <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.5 }}>
                      Ex. « Vestiaire offert », « Accès zone VIP »… ou rattache un article de ta précommande (Options avancées → Précommandes) pour l&apos;offrir gratuitement sur ce billet.
                    </p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {place.included.map((inc, k) => {
                      const stillInMenu = menuChoices.some((m) => m.name.trim() === inc.name)
                      return (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: `1px solid ${stillInMenu ? 'var(--primary-a20)' : 'var(--border)'}`, background: 'var(--surface-2)' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Input
                              value={inc.name}
                              placeholder="Ex: Vestiaire offert"
                              onChange={(e) =>
                                setPlaces((prev) =>
                                  prev.map((p) => (p.key === place.key ? { ...p, included: p.included.map((x, m) => (m === k ? { ...x, name: e.target.value } : x)) } : p))
                                )
                              }
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 'var(--font-size-footnote-lg)', padding: '8px 10px' }}
                            />
                            {stillInMenu && (
                              <p style={{ fontSize: 'var(--font-size-caption-2-lg)', color: 'var(--teal)', margin: '4px 0 0' }}>Correspond à un article de ta précommande.</p>
                            )}
                          </div>
                          <Input
                            type="number"
                            min={1}
                            value={inc.qty || 1}
                            onChange={(e) =>
                              setPlaces((prev) =>
                                prev.map((p) => (p.key === place.key ? { ...p, included: p.included.map((x, m) => (m === k ? { ...x, qty: Math.max(1, parseInt(e.target.value, 10) || 1) } : x)) } : p))
                              )
                            }
                            title="Quantité incluse"
                            style={{ width: 52, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 'var(--font-size-footnote)', padding: '8px 6px', textAlign: 'center' }}
                          />
                          <span
                            title="Inclus gratuitement dans le billet"
                            style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 8, fontSize: 'var(--font-size-caption)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', border: '1px solid var(--primary-a35)', background: 'var(--primary-a14)', color: 'var(--teal)' }}
                          >
                            Offert
                          </span>
                          <Button
                            variant="ghost"
                            onClick={() => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, included: p.included.filter((_, m) => m !== k) } : p)))}
                            title="Retirer cette option"
                            style={{ flexShrink: 0, width: 38, height: 38, minHeight: 38, minWidth: 38, borderRadius: '50%', background: 'var(--danger-fill)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 'var(--font-size-headline-lg)', lineHeight: 1, padding: 0 }}
                          >
                            ×
                          </Button>
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        variant="secondary"
                        onClick={() => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, included: [...p.included, { name: '', qty: 1 }] } : p)))}
                        style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--text)', fontSize: 'var(--font-size-footnote)' }}
                      >
                        + Ajouter un avantage
                      </Button>
                      {menuChoices.length > 0 && (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, included: [...p.included, { name: menuChoices[0].name.trim(), qty: 1 }] } : p)))
                          }
                          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, background: 'var(--primary-a14)', border: '1px solid var(--primary-a35)', color: 'var(--teal)', fontSize: 'var(--font-size-footnote)' }}
                        >
                          + Inclure un article du menu
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}

          <Button variant="secondary" onClick={() => setPlaces((prev) => [...prev, newPlaceRow()])} style={S.btnGhost}>
            + Ajouter un type de place
          </Button>
          <Button variant="primary" onClick={() => goNext(1)} style={S.btnPrimary}>
            Suivant
          </Button>
        </div>
      )}

      {/* ── Step 2 : Lieu & infos pratiques ── */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <p style={{ fontFamily: 'var(--font-display), sans-serif', fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3.2px', margin: '0 0 4px' }}>Lieu &amp; infos pratiques</p>
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-faint)' }}>Indique où se déroulera ton événement.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <InputField label="Nom du lieu" placeholder="Ex: Club Le Baroque, Salle des Fêtes..." value={venueName} onChange={(e) => setVenueName(e.target.value)} locked={locked} />
            <InputField label="Adresse" placeholder="Ex: 12 rue de la Paix" value={address} onChange={(e) => setAddress(e.target.value)} locked={locked} />
            <InputField label="Ville *" placeholder="Ex: Paris, Lomé, Abidjan..." value={city} onChange={(e) => setCity(e.target.value)} error={errors.city} locked={locked} />

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ ...S.label, marginBottom: 4 }}>Région *</label>
              <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', marginBottom: 10 }}>Dans quelle région se déroule l&apos;événement ?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {regions.map((r) => (
                  <Pill key={r.id} label={`${r.flag} ${r.name}`} active={region === r.name} disabled={locked} onClick={() => setRegion(r.name)} accent="var(--teal)" />
                ))}
              </div>
              {errors.region && <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--danger)', marginTop: 6 }}>{errors.region}</p>}
            </div>
          </div>

          <Button variant="primary" onClick={() => goNext(2)} style={S.btnPrimary}>
            Suivant
          </Button>
        </div>
      )}

      {/* ── Step 3 : Options avancées ── */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontFamily: 'var(--font-display), sans-serif', fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3.2px', margin: 0 }}>Options avancées</p>

          <Card accent="var(--primary-a14)" style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 600, color: 'var(--text)' }}>QR code billet</p>
              <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', marginTop: 4, lineHeight: 1.6 }}>Billet numérique unique scanné à l&apos;entrée — obligatoire</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Inclus</span>
            </div>
          </Card>

          <Card accent={locked ? 'var(--border)' : undefined} style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 600, color: 'var(--text)' }}>Playlist interactive</p>
              <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', marginTop: 4, lineHeight: 1.6 }}>1 son par ticket — vote par likes</p>
              {locked && <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--primary-a85)', marginTop: 4 }}>Verrouillé — billets déjà vendus</p>}
            </div>
            <Toggle value={playlist} onChange={() => setPlaylist((v) => !v)} disabled={locked} />
          </Card>

          <Card accent={locked ? 'var(--border)' : undefined} style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 600, color: 'var(--text)' }}>Précommande de consommations</p>
              <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', marginTop: 4, lineHeight: 1.6 }}>Les clients peuvent commander à l&apos;avance.</p>
              {locked && <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--primary-a85)', marginTop: 4 }}>Verrouillé — des précommandes existent</p>}
            </div>
            <Toggle value={preorder} onChange={() => setPreorder((v) => !v)} disabled={locked} />
          </Card>

          {preorder && (
            <div style={{ borderTop: '1px solid var(--primary-a14)', paddingTop: 16, ...(locked ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}>
              <p style={{ ...S.label, color: 'var(--gold)', marginBottom: 4 }}>Définir ta carte / menu</p>
              {locked ? (
                <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--primary-a85)', marginBottom: 12 }}>Menu verrouillé — des précommandes existent.</p>
              ) : (
                <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', marginBottom: 12 }}>Ajoute les articles que tes clients pourront précommander.</p>
              )}
              {menuItems.map((item, i) => (
                <MenuItemEditor
                  key={i}
                  item={item}
                  index={i}
                  currency={currency}
                  placeTypes={places.map((p) => p.type).filter(Boolean)}
                  disabled={locked}
                  onChange={(updated) => setMenuItems((prev) => prev.map((m, j) => (j === i ? updated : m)))}
                  onUploadImage={async (file) => {
                    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('invalid_type')
                    if (file.size > 5 * 1024 * 1024) throw new Error('too_large')
                    const dataUrl = await readFileAsDataUrl(file)
                    return uploadMedia(await resizeImageDataUrl(dataUrl, 800, 0.85))
                  }}
                  onRemove={i > 0 ? () => setMenuItems((prev) => prev.filter((_, j) => j !== i)) : undefined}
                />
              ))}
              <Button variant="secondary" onClick={() => setMenuItems((prev) => [...prev, emptyMenuItem()])} style={S.btnGhost} disabled={locked}>
                + Ajouter un article
              </Button>
            </div>
          )}

          {preorder && validMenuItemsForGate.length === 0 && (
            <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--danger-border)', borderRadius: 12, fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              La précommande est activée mais aucun article n&apos;a été renseigné. Ajoute au moins un article avec un nom et un prix, ou désactive la précommande.
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--surface-2)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: 0 }}>Planification</p>
            <div>
              <label style={S.label}>
                Date de publication <span style={{ color: 'var(--text-faint)' }}>(optionnel — vide = maintenant)</span>
              </label>
              <Input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                disabled={locked}
                style={{ ...S.inputBase, colorScheme: 'light dark', ...(locked ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
              />
              <p style={{ fontSize: 'var(--font-size-footnote)', color: locked ? 'var(--primary-a85)' : 'var(--text-faint)', marginTop: 5, lineHeight: 1.6 }}>
                {locked ? "Verrouillé — l'événement est déjà publié." : 'L’événement apparaîtra sur le site à cette date et heure. Laisse vide pour publier immédiatement.'}
              </p>
            </div>
            <div>
              <label style={S.label}>
                Date de clôture des réservations <span style={{ color: 'var(--text-faint)' }}>(optionnel)</span>
              </label>
              <Input type="datetime-local" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} min={dateStr || undefined} style={{ ...S.inputBase, colorScheme: 'light dark' }} />
              <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', marginTop: 5, lineHeight: 1.6 }}>Laisse vide pour fermer automatiquement à la date de l&apos;événement.</p>
            </div>
          </div>

          <Button
            variant="primary"
            onClick={() => goNext(3)}
            disabled={!canProceedStep3}
            style={{ ...S.btnPrimary, ...(!canProceedStep3 ? { background: 'var(--surface-2)', color: 'var(--text-faint)', border: '1px solid var(--surface-2)', boxShadow: 'none' } : {}) }}
          >
            Suivant
          </Button>
        </div>
      )}

      {/* ── Step 4 : Récapitulatif & publication ── */}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontFamily: 'var(--font-display), sans-serif', fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3.2px', margin: 0 }}>Récapitulatif &amp; publication</p>

          {imagePreview && (
            <div style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="affiche" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Événement', val: name || '—' },
              { label: 'Date', val: dateStr || '—' },
              { label: 'Horaires', val: timeStart ? `${timeStart} → ${timeEnd || '?'}` : '—' },
              { label: 'DJ / Artiste', val: artists.filter((a) => a.name?.trim()).map((a) => a.name.trim()).join(', ') || '—' },
              { label: 'Genre musical', val: category === 'Autre' ? customGenre.trim() || 'Autre' : category || 'Autre' },
              {
                label: 'Ciblage',
                val: [partyType, ...musicStyles, ...ambiances].filter(Boolean).join(', ') || 'Aucun tag (recommandations limitées)',
              },
              {
                label: 'Types de places',
                val: places.map((p) => `${p.type.trim() || 'Sans nom'} (${p.price} ${currencySymbol(currency)})`).join(', '),
              },
              { label: 'Lieu', val: venueName ? `${venueName}, ${city}` : city || '—' },
              { label: 'Région', val: regions.find((r) => r.name === region)?.name || region || '—' },
              { label: 'Playlist interactive', val: playlist ? 'Activée' : 'Désactivée' },
              { label: 'Précommande conso', val: preorder ? `Activée (${menuItems.filter((i) => i.name.trim()).length} articles)` : 'Désactivée' },
              { label: 'QR Code billet', val: 'Activé — obligatoire' },
            ].map((r) => (
              <Card key={r.label} style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', flexShrink: 0 }}>{r.label}</span>
                <span style={{ fontSize: 'var(--font-size-callout)', fontWeight: 500, color: 'var(--text)', textAlign: 'right' }}>{r.val}</span>
              </Card>
            ))}
          </div>

          <Button
            variant="primary"
            style={S.btnPrimary}
            onClick={handleSubmit}
            disabled={saving}
            loading={saving}
            loadingText={eventId ? 'Enregistrement…' : 'Publication…'}
          >
            {eventId ? 'Enregistrer les modifications' : 'Publier mon événement'}
          </Button>
        </div>
      )}
      {posterCropSrc && (
        <ImageCropperModal
          src={posterCropSrc}
          title="Recadrer l'affiche"
          aspect={16 / 9}
          outputWidth={1280}
          onCancel={() => setPosterCropSrc(null)}
          onConfirm={uploadCroppedPoster}
        />
      )}
      {confirmCloseOpen && (
        <Modal
          onClose={() => setConfirmCloseOpen(false)}
          ariaLabel="Quitter sans enregistrer"
          title="Quitter sans enregistrer"
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirmCloseOpen(false)}>
                Continuer l’édition
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmCloseOpen(false)
                  onClose()
                }}
              >
                Quitter
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: 'var(--font-size-body-sm)' }}>
            Les modifications en cours ne sont pas enregistrées et seront perdues si tu fermes maintenant.
          </p>
        </Modal>
      )}
    </main>
  )
}
