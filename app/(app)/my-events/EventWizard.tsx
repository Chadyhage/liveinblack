'use client'

import { useEffect, useRef, useState } from 'react'
import { regions } from '@/lib/shared/regions'
import { regionToCurrency, currencySymbol, payRailLabel } from '@/lib/shared/money'
import MenuItemEditor, { emptyMenuItem, type MenuItemRow } from './MenuItemEditor'

// Port du wizard de création/édition d'événement en 5 étapes
// (src/pages/MesEvenementsPage.jsx, vue 'create' — lignes ~2140-3274 pour le
// wizard lui-même, ~3281-3542 pour MenuItemEditor). #77 phase 7 migration.
//
// Différences volontaires par rapport au legacy (documentées aussi dans le
// rapport de tâche) :
// - Pas de cropper interactif (react-easy-crop + canvas) : l'affiche et les
//   photos de place sont juste redimensionnées côté client (canvas, 1280px
//   max, JPEG q0.85) puis uploadées telles quelles.
// - La vidéo d'aperçu est plafonnée à ~8 Mo (contrainte de
//   `uploadDataUri` côté serveur, phase antérieure) au lieu de 30 Mo en
//   legacy.
// - Upload immédiat à la sélection du fichier (affiche/vidéo/photos), comme
//   l'avatar de profil déjà porté — pas d'upload différé à la publication.
// - Pas d'avertissement d'encaissement (Stripe/Momo) dans le wizard : déjà
//   surfacé en agrégat sur le tableau de bord, éviter un aller-retour API
//   redondant par événement.
// - Pas de champ `subtitle` indépendant : ce wizard le régénère toujours à
//   partir des 60 premiers caractères de `description` (voir buildPayload) et
//   ne lit jamais `ev.subtitle` au chargement. Assumé — un `subtitle` défini
//   par une autre voie sera écrasé à la prochaine sauvegarde depuis ce wizard.

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
  artists: { name: string; role: string }[]
  dj: string
  performers: string[]
  minAge: number
  isPrivate: boolean
  hasPrivateCode: boolean
  publishAt: string | null
  closingDate: string | null
  cancelled: boolean
  postponedFrom: { date: string; time: string } | null
  locked: boolean
  totalSold: number
}

interface EventFormPlace {
  id: string
  type: string
  price: number
  total: number
  icon?: string
  maxPerAccount?: number
  groupType?: 'solo' | 'group'
  groupMin?: number
  groupMax?: number
  photos?: string[]
  included?: { name: string; qty: number }[]
}

interface EventFormInput {
  name: string
  subtitle?: string
  description?: string
  category?: string
  tags?: string[]
  eventType?: string
  musicStyles?: string[]
  ambiances?: string[]
  date: string
  time?: string
  endTime?: string
  location?: string
  city: string
  region: string
  imageUrl?: string | null
  videoUrl?: string | null
  places: EventFormPlace[]
  playlist?: boolean
  preorder?: boolean
  menu?: MenuItemRow[] | null
  artists?: { name: string; role?: string }[]
  dj?: string
  performers?: string[]
  minAge?: number
  isPrivate?: boolean
  privateCode?: string | null
  publishAt?: string | null
  closingDate?: string | null
}

interface ArtistRow {
  name: string
  role: string
}

interface PlaceRow {
  key: string // clé React locale uniquement — jamais envoyée au serveur
  id: string // '' pour une nouvelle place, sinon id stable serveur
  type: string
  price: number
  qty: number
  sold: number
  maxPerAccount: number
  groupType: 'solo' | 'group'
  groupMin: number
  groupMax: number
  photos: string[]
  included: { name: string; qty: number }[]
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
  card: {
    background: 'var(--surface)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  } as React.CSSProperties,
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
  } as React.CSSProperties,
  label: {
    fontFamily: 'Inter, sans-serif',
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
    display: 'block',
    marginBottom: 6,
  } as React.CSSProperties,
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
  } as React.CSSProperties,
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
  } as React.CSSProperties,
}

// ─────────────────────────────────────────────────────────────────────────
// Petits composants UI réutilisés dans tout le wizard
// ─────────────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(200,169,110,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11 V7 a4 4 0 0 1 8 0 V11" />
    </svg>
  )
}

function IconClose({ size = 12, color = 'rgba(255,255,255,0.5)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function Spinner({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block' }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={3} />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

function Toggle({ value, onChange, disabled = false }: { value: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onChange()
        }
      }}
      role="switch"
      aria-checked={value}
      tabIndex={disabled ? -1 : 0}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: value ? 'var(--teal)' : 'rgba(255,255,255,0.08)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 4,
          width: 16,
          height: 16,
          background: 'white',
          borderRadius: '50%',
          transition: 'left 0.2s',
          left: value ? 24 : 4,
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
      />
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
  style,
  min,
  max,
  locked = false,
}: {
  label?: string
  value: string | number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  type?: string
  error?: string
  style?: React.CSSProperties
  min?: string | number
  max?: string | number
  locked?: boolean
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      {label && (
        <label style={{ ...S.label, display: 'flex', alignItems: 'center', gap: 6 }}>
          {label}
          {locked && <LockIcon />}
        </label>
      )}
      <input
        type={type}
        min={min}
        max={max}
        disabled={locked}
        title={locked ? 'Verrouillé — billets déjà vendus' : undefined}
        style={{
          ...S.inputBase,
          borderColor: error ? 'rgba(220,50,50,0.6)' : focused ? 'var(--teal)' : locked ? 'rgba(200,169,110,0.18)' : 'rgba(255,255,255,0.10)',
          boxShadow: focused && !locked ? '0 0 0 3px rgba(78,232,200,0.06)' : 'none',
          opacity: locked ? 0.55 : 1,
          cursor: locked ? 'not-allowed' : 'text',
          background: locked ? 'rgba(200,169,110,0.04)' : S.inputBase.background,
          ...style,
        }}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={() => !locked && setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {error && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{error}</p>}
    </div>
  )
}

function Pill({
  label,
  active,
  onClick,
  disabled = false,
  accent = 'var(--teal)',
}: {
  label: string
  active: boolean
  onClick: () => void
  disabled?: boolean
  accent?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Verrouillé — billets déjà vendus' : undefined}
      style={{
        padding: '8px 12px',
        borderRadius: 999,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        border: active ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.10)',
        background: active ? `${accent}22` : 'transparent',
        color: active ? accent : 'rgba(255,255,255,0.5)',
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers purs
// ─────────────────────────────────────────────────────────────────────────

function makeLocalKey(): string {
  return 'k' + Math.random().toString(36).slice(2, 9)
}

function defaultPlaceRow(): PlaceRow {
  return {
    key: makeLocalKey(),
    id: '',
    type: 'Entrée libre',
    price: 0,
    qty: 100,
    sold: 0,
    maxPerAccount: 0,
    groupType: 'solo',
    groupMin: 0,
    groupMax: 0,
    photos: [],
    included: [],
  }
}

function newPlaceRow(): PlaceRow {
  return {
    key: makeLocalKey(),
    id: '',
    type: '',
    price: 0,
    qty: 50,
    sold: 0,
    maxPerAccount: 0,
    groupType: 'solo',
    groupMin: 0,
    groupMax: 0,
    photos: [],
    included: [],
  }
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocalValue(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

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
  isPrivate: 0,
  privateCode: 0,
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

export default function EventWizard({ eventId, onClose, onSaved }: { eventId: string | null; onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(!!eventId)
  const [loadError, setLoadError] = useState('')
  const [cancelled, setCancelled] = useState(false)
  const [locked, setLocked] = useState(false)
  const [totalSold, setTotalSold] = useState(0)
  const [hasPrivateCodeServer, setHasPrivateCodeServer] = useState(false)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── Step 0 : Bases ──
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [timeStart, setTimeStart] = useState('')
  const [timeEnd, setTimeEnd] = useState('')
  const [showArtistSection, setShowArtistSection] = useState(false)
  const [artists, setArtists] = useState<ArtistRow[]>([])
  const [visibility, setVisibility] = useState<'public' | 'private' | null>(null)
  const [privateCodeInput, setPrivateCodeInput] = useState('')
  const [category, setCategory] = useState('')
  const [customGenre, setCustomGenre] = useState('')
  const [partyType, setPartyType] = useState('')
  const [musicStyles, setMusicStyles] = useState<string[]>([])
  const [ambiances, setAmbiances] = useState<string[]>([])
  const [minAge, setMinAge] = useState(18)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
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
  const [region, setRegion] = useState('')

  // ── Step 3 : Options avancées ──
  const [playlist, setPlaylist] = useState(false)
  const [preorder, setPreorder] = useState(false)
  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([emptyMenuItem()])
  const [publishAt, setPublishAt] = useState('')
  const [closingDate, setClosingDate] = useState('')

  // ── Suivi des modifications non enregistrées (confirmation à la fermeture) ──
  function snapshotForm() {
    return JSON.stringify({
      name,
      description,
      dateStr,
      timeStart,
      timeEnd,
      artists,
      visibility,
      privateCodeInput,
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
    setDescription(ev.description || '')
    setDateStr(ev.date || '')
    setTimeStart(ev.time || '')
    setTimeEnd(ev.endTime || '')
    const filteredArtists = (ev.artists || []).filter((a) => a.name?.trim())
    setArtists(filteredArtists.map((a) => ({ name: a.name, role: a.role || 'DJ' })))
    setShowArtistSection(filteredArtists.length > 0)
    setVisibility(ev.isPrivate ? 'private' : 'public')
    setHasPrivateCodeServer(!!ev.hasPrivateCode)
    setPrivateCodeInput('')
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
    setMenuItems(ev.menu && ev.menu.length > 0 ? ev.menu : [emptyMenuItem()])
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
    if (isFormDirty() && !window.confirm('Quitter sans enregistrer ? Les modifications en cours seront perdues.')) return
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
    setPosterUploading(true)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const resized = await resizeImageDataUrl(dataUrl, 1280, 0.85)
      setImagePreview(resized)
      const url = await uploadMedia(resized)
      setImageUrl(url)
      setImagePreview(url)
    } catch {
      setErrors((err) => ({ ...err, image: "L'envoi de l'affiche a échoué — réessaie." }))
    } finally {
      setPosterUploading(false)
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
    if (file.size > 8 * 1024 * 1024) {
      setErrors((err) => ({ ...err, video: 'Vidéo trop lourde — 8 Mo maximum dans cette version.' }))
      return
    }
    setErrors((err) => ({ ...err, video: '' }))
    setVideoUploading(true)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setVideoPreview(dataUrl)
      setVideoName(file.name || 'Vidéo d’aperçu')
      const url = await uploadMedia(dataUrl)
      setVideoUrl(url)
      setVideoPreview(url)
    } catch {
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
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Le nom est obligatoire'
    if (!dateStr) {
      errs.date = 'La date est obligatoire'
    } else if (!locked) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const picked = new Date(dateStr + 'T00:00:00')
      if (picked < today) errs.date = 'La date que tu as choisie est déjà passée'
    }
    if (timeStart && timeEnd && timeStart === timeEnd) {
      errs.timeEnd = "L'heure de fin doit être différente de l'heure de début"
    }
    if (!visibility) errs.visibility = "Choisis un type d'événement"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function validateStep1(): boolean {
    const errs: Record<string, string> = {}
    places.forEach((p) => {
      if (!p.type.trim()) errs[`place_${p.key}`] = 'Donne un nom à cette place'
      else if (p.groupType === 'group' && (Number(p.price) || 0) <= 0) errs[`place_${p.key}`] = 'Une table de groupe doit avoir un prix (supérieur à 0)'
    })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function validateStep2(): boolean {
    const errs: Record<string, string> = {}
    if (!city.trim()) errs.city = 'La ville est obligatoire'
    if (!region) errs.region = 'Choisis une région'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const validMenuItemsForGate = menuItems.filter((i) => i.name.trim() && i.price > 0)
  const canProceedStep3 = !preorder || validMenuItemsForGate.length > 0

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
    const finalCategory = category === 'Autre' ? customGenre.trim() || 'Autre' : category
    const tags = [partyType, ...musicStyles, ...ambiances].filter(Boolean).slice(0, 6)
    const filteredArtists = artists.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), role: a.role }))
    const dj = filteredArtists.length > 0 ? filteredArtists.map((a) => a.name).join(', ') : ''
    const validMenuItems = menuItems.filter((i) => i.name.trim() && i.price > 0)
    const menuNameSet = new Set(validMenuItems.map((i) => i.name.trim()))
    const anyIncluded = places.some((p) => p.included.length > 0)

    function sanitizeIncluded(list: { name: string; qty: number }[]) {
      return list
        .map((inc) => ({ name: inc.name.trim(), qty: Math.max(1, Number(inc.qty) || 1) }))
        .filter((inc) => inc.name && menuNameSet.has(inc.name))
    }

    const locationValue = [venueName.trim(), address.trim()].filter(Boolean).join(', ')

    const trimmedCode = privateCodeInput.trim().toUpperCase()
    let privateCodeValue: string | null | undefined
    if (trimmedCode) privateCodeValue = trimmedCode
    else if (eventId === null) privateCodeValue = null
    // sinon (édition, champ laissé vide) : on n'inclut pas la clé → le
    // serveur conserve le code déjà configuré (jamais exposé au client).

    return {
      name: name.trim(),
      subtitle: description.trim().slice(0, 60),
      description: description.trim(),
      category: finalCategory,
      tags,
      eventType: partyType,
      musicStyles,
      ambiances,
      date: dateStr,
      time: timeStart || '22:00',
      endTime: timeEnd || '05:00',
      location: locationValue,
      city: city.trim(),
      region,
      imageUrl,
      videoUrl,
      places: places.map((p) => ({
        id: p.id,
        type: p.type.trim() || 'Entrée',
        price: Number(p.price) || 0,
        total: Number(p.qty) || 0,
        icon: '',
        maxPerAccount: p.groupType === 'group' ? 1 : Number(p.maxPerAccount) || 0,
        groupType: p.groupType,
        groupMin: Number(p.groupMin) || 0,
        groupMax: Number(p.groupMax) || 0,
        photos: p.photos,
        included: sanitizeIncluded(p.included),
      })),
      playlist,
      preorder,
      menu: preorder || anyIncluded ? validMenuItems : null,
      artists: filteredArtists,
      dj,
      performers: [],
      minAge,
      isPrivate: visibility === 'private',
      ...(privateCodeValue !== undefined ? { privateCode: privateCodeValue } : {}),
      publishAt: fromDatetimeLocalValue(publishAt),
      closingDate: fromDatetimeLocalValue(closingDate),
    }
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
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 20px', display: 'flex', justifyContent: 'center' }}>
        <Spinner size={22} color="var(--gold)" />
      </main>
    )
  }

  if (loadError) {
    return (
      <main style={{ maxWidth: 640, margin: '80px auto', padding: '0 20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--pink)', fontSize: 14, marginBottom: 18 }}>{loadError}</p>
        <button
          onClick={onClose}
          style={{ padding: '12px 22px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
        >
          Retour au tableau de bord
        </button>
      </main>
    )
  }

  if (cancelled) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '30px 20px 100px' }}>
        <div
          style={{
            background: 'var(--surface-2)',
            border: '1px solid rgba(224,90,170,0.5)',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            marginBottom: 20,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(220,100,100,0.95)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <circle cx="12" cy="16" r="0.6" fill="rgba(220,100,100,0.95)" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(220,100,100,0.95)', margin: '0 0 4px' }}>
              Événement annulé
            </p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6 }}>
              Cet événement a été annulé. Les modifications sont désactivées. Pour relancer un événement similaire, crée-en un nouveau depuis ton tableau de bord.
            </p>
          </div>
        </div>
        <button onClick={onClose} style={S.btnPrimary}>
          Retour au tableau de bord
        </button>
      </main>
    )
  }

  const currency = regionToCurrency(region)

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 100px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => (step === 0 ? requestClose() : setStep((s) => s - 1))}
          style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.93)', margin: 0 }}>
            {eventId ? "Modifier l'événement" : 'Créer un événement'}
          </p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
            Étape {step + 1}/{STEP_NAMES.length} — {STEP_NAMES[step]}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 4 }}>
        {STEP_NAMES.map((s, i) => (
          <div key={s} style={{ flex: 1, height: 2, borderRadius: 2, background: i <= step ? 'var(--gold)' : 'rgba(255,255,255,0.06)', transition: 'background 0.3s' }} />
        ))}
      </div>

      {/* Bannière verrouillage post-vente */}
      {locked && (
        <div
          style={{
            background: 'var(--surface-2)',
            border: '1px solid rgba(200,169,110,0.35)',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11 V7 a4 4 0 0 1 8 0 V11" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 4px' }}>
              {totalSold} billet{totalSold > 1 ? 's' : ''} déjà vendu{totalSold > 1 ? 's' : ''}
            </p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
              Pour ne pas léser les acheteurs, certains champs sont verrouillés (date, heures, lieu, prix existants, type d&apos;événement, âge minimum, options, date de publication). Tu peux toujours modifier la description, l&apos;affiche, les artistes et la date de clôture.
            </p>
          </div>
        </div>
      )}

      {/* Erreur de sauvegarde — visible quelle que soit l'étape courante,
          car une erreur de validation serveur peut ramener l'utilisateur à
          une étape antérieure à celle du récapitulatif (étape 4). */}
      {saveError && <p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--pink)', fontSize: 12.5, margin: 0 }}>{saveError}</p>}

      {/* ── Step 0 : Bases ── */}
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Affiche */}
          <div>
            <label style={S.label}>Affiche / Photo de l&apos;événement</label>
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              style={{
                position: 'relative',
                display: 'block',
                width: '100%',
                padding: 0,
                borderRadius: 12,
                overflow: 'hidden',
                cursor: 'pointer',
                aspectRatio: '16/9',
                border: imagePreview ? '1px solid rgba(200,169,110,0.35)' : '2px dashed rgba(255,255,255,0.14)',
                background: '#0b0c12',
              }}
            >
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="Aperçu affiche" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Clique pour ajouter l&apos;affiche</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Format recommandé : 1200 × 630 px</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>JPG, PNG ou WEBP — 5 Mo maximum</p>
                </div>
              )}
              {posterUploading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,11,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spinner size={20} />
                </div>
              )}
            </button>
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePoster} />
            {errors.image && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{errors.image}</p>}
          </div>

          {/* Vidéo d'aperçu */}
          <div>
            <label style={S.label}>
              Vidéo d&apos;aperçu au survol <span style={{ color: 'rgba(255,255,255,0.5)' }}>(optionnel)</span>
            </label>
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
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: 'var(--teal)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{videoName || 'Vidéo d’aperçu'}</p>
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '3px 0 0' }}>Elle se lance après 1 seconde de survol sur les cartes événement.</p>
                    </div>
                    <button onClick={clearVideo} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(224,90,170,0.55)', background: 'rgba(224,90,170,0.14)', color: '#ff9ed2', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Retirer
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => videoInputRef.current?.click()}
                  style={{ width: '100%', minHeight: 118, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 13, padding: 16, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ width: 42, height: 42, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(78,232,200,0.10)', border: '1px solid rgba(78,232,200,0.28)', color: 'var(--teal)', flexShrink: 0 }}>
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Ajouter une courte vidéo</span>
                    <span style={{ display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginTop: 4 }}>MP4, WEBM ou MOV · 8 Mo maximum. Idéal : 6 à 12 secondes en 720p.</span>
                  </span>
                </button>
              )}
              {videoUploading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,4,11,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Spinner size={20} />
                </div>
              )}
            </div>
            <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: 'none' }} onChange={handleVideo} />
            {errors.video && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{errors.video}</p>}
          </div>

          {/* Champs de base */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <InputField label="Nom de l'événement *" placeholder="Ex: NEON NIGHT Vol.3" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
            <InputField label="Date *" type="date" value={dateStr} min={locked ? undefined : new Date().toISOString().split('T')[0]} onChange={(e) => setDateStr(e.target.value)} error={errors.date} locked={locked} />
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <InputField label="Heure début" type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} locked={locked} />
                <InputField label="Heure fin" type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} locked={locked} />
              </div>
              {errors.timeEnd && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{errors.timeEnd}</p>}
            </div>

            <div>
              <label style={S.label}>Description courte</label>
              <textarea
                style={{ ...S.inputBase, resize: 'none', height: 80 }}
                placeholder="Décris ta soirée en deux ou trois phrases…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* DJs / Artistes */}
            <div style={{ ...S.card, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showArtistSection ? 12 : 0 }}>
                <div>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.93)' }}>DJs / Artistes</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Affiché sur la playlist et la fiche événement</p>
                </div>
                <Toggle value={showArtistSection} onChange={() => setShowArtistSection((v) => !v)} />
              </div>
              {showArtistSection && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {artists.map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <select
                        value={a.role}
                        onChange={(e) => setArtists((prev) => prev.map((x, xi) => (xi === i ? { ...x, role: e.target.value } : x)))}
                        style={{ ...S.inputBase, width: 'auto', flexShrink: 0 }}
                      >
                        {ARTIST_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <input
                        style={{ ...S.inputBase, flex: 1 }}
                        placeholder="Nom de l'artiste"
                        value={a.name}
                        onChange={(e) => setArtists((prev) => prev.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                      />
                      <button onClick={() => setArtists((prev) => prev.filter((_, xi) => xi !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', padding: 4 }}>
                        <IconClose size={13} color="rgba(220,100,100,0.9)" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setArtists((prev) => [...prev, { name: '', role: 'DJ' }])}
                    style={{ padding: '10px', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, background: 'rgba(255,255,255,0.08)', cursor: 'pointer' }}
                  >
                    + Ajouter un DJ / artiste
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Type d'événement (public/privé) */}
          <div>
            <label style={{ ...S.label, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              Type d&apos;événement * {locked && <LockIcon />}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['public', 'private'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    if (locked) return
                    setVisibility(t)
                    setErrors((e) => ({ ...e, visibility: '' }))
                  }}
                  title={locked ? 'Verrouillé — billets déjà vendus' : undefined}
                  style={{
                    ...S.card,
                    padding: 12,
                    textAlign: 'center',
                    cursor: locked ? 'not-allowed' : 'pointer',
                    opacity: locked && visibility !== t ? 0.4 : 1,
                    borderColor: visibility === t ? 'rgba(200,169,110,0.55)' : 'rgba(255,255,255,0.08)',
                    background: visibility === t ? 'rgba(200,169,110,0.08)' : 'var(--surface)',
                  }}
                >
                  <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
                    {t === 'public' ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={visibility === t ? 'var(--gold)' : 'rgba(255,255,255,0.42)'} strokeWidth="1.5" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={visibility === t ? 'var(--gold)' : 'rgba(255,255,255,0.42)'} strokeWidth="1.5" aria-hidden="true">
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                    )}
                  </div>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: visibility === t ? 'var(--gold)' : 'rgba(255,255,255,0.93)' }}>{t === 'public' ? 'Public' : 'Privé'}</p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{t === 'public' ? 'Visible par tous' : 'Accès par code'}</p>
                </button>
              ))}
            </div>
            {errors.visibility && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', marginTop: 4 }}>{errors.visibility}</p>}
            {visibility === 'private' && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <InputField
                  label="Code d'accès maître (optionnel)"
                  placeholder={hasPrivateCodeServer ? 'Un code est déjà configuré' : 'Ex: NEON2026'}
                  value={privateCodeInput}
                  onChange={(e) => setPrivateCodeInput(e.target.value.toUpperCase())}
                  locked={locked}
                  style={{ fontFamily: 'Inter, sans-serif', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                />
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                  {hasPrivateCodeServer
                    ? 'Un code est déjà configuré — laisse vide pour le conserver, ou saisis-en un nouveau pour le remplacer.'
                    : 'Tu pourras aussi générer des codes individuels depuis ton tableau de bord après publication.'}
                </p>
              </div>
            )}
          </div>

          {/* Genre musical */}
          <div>
            <label style={{ ...S.label, marginBottom: 8 }}>Genre musical</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => {
                    setCategory(g)
                    if (g !== 'Autre') setCustomGenre('')
                  }}
                  style={{
                    padding: '10px',
                    borderRadius: 10,
                    border: category === g ? '1px solid rgba(200,169,110,0.55)' : '1px solid rgba(255,255,255,0.10)',
                    background: category === g ? 'rgba(200,169,110,0.10)' : 'var(--surface)',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 12,
                    fontWeight: 600,
                    color: category === g ? 'var(--gold)' : 'rgba(255,255,255,0.6)',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
            {category === 'Autre' && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  autoFocus
                  type="text"
                  maxLength={40}
                  placeholder="Précise le genre (ex : Afropop, Jazz, Amapiano…)"
                  value={customGenre}
                  onChange={(e) => setCustomGenre(e.target.value)}
                  style={{ ...S.inputBase, padding: '9px 14px', border: customGenre.trim() ? '1px solid rgba(200,169,110,0.45)' : '1px solid rgba(200,169,110,0.22)' }}
                />
              </div>
            )}
          </div>

          {/* Ciblage & recommandations */}
          <div>
            <label style={{ ...S.label, marginBottom: 4 }}>Ciblage & recommandations</label>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: '0 0 12px' }}>
              Optionnel mais recommandé : ta soirée sera proposée en priorité aux clients dont les goûts correspondent.
            </p>

            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', margin: '0 0 7px' }}>Type de soirée</p>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
              {EVENT_TYPES.map((t) => (
                <Pill key={t} label={t} active={partyType === t} onClick={() => setPartyType((cur) => (cur === t ? '' : t))} accent="var(--violet)" />
              ))}
            </div>

            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', margin: '0 0 7px' }}>Styles musicaux joués</p>
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

            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', margin: '0 0 7px' }}>Ambiance (3 max)</p>
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
                <button
                  key={value}
                  type="button"
                  disabled={locked}
                  title={locked ? 'Verrouillé — billets déjà vendus' : undefined}
                  onClick={() => setMinAge(value)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 10,
                    border: minAge === value ? '1px solid rgba(78,232,200,0.55)' : '1px solid rgba(255,255,255,0.10)',
                    background: minAge === value ? 'rgba(78,232,200,0.12)' : 'var(--surface)',
                    color: minAge === value ? 'var(--teal)' : 'rgba(255,255,255,0.6)',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    cursor: locked ? 'not-allowed' : 'pointer',
                    opacity: locked && minAge !== value ? 0.4 : 1,
                  }}
                >
                  {presetLabel}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
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
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{minAge === 0 ? 'Tout public' : `${minAge} ans minimum`}</span>
            </div>
          </div>

          <button onClick={() => goNext(0)} style={S.btnPrimary}>
            Suivant
          </button>
        </div>
      )}

      {/* ── Step 1 : Places & Prix ── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: '0 0 4px' }}>Places &amp; Prix</p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Configure chaque type de place que tu veux proposer.</p>
          </div>

          {(() => {
            const isXof = currency === 'XOF'
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${isXof ? 'var(--teal)' : 'var(--gold)'}` }}>
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
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.4 }}>
                  Tu fixes tes prix en <strong style={{ color: isXof ? 'var(--teal)' : 'var(--gold)' }}>{currencySymbol(currency)}</strong> — paiement par {payRailLabel(currency)}.
                </p>
              </div>
            )
          })()}

          {places.map((place, i) => {
            const placeHasSales = place.sold > 0
            const menuChoices = menuItems.filter((m) => m.name.trim() && m.price > 0)
            return (
              <div key={place.key} style={{ ...S.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, ...(placeHasSales ? { borderColor: 'rgba(200,169,110,0.25)' } : {}) }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>Place {i + 1}</p>
                    {placeHasSales && (
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--gold)', background: 'rgba(200,169,110,0.14)', border: '1px solid rgba(200,169,110,0.35)', borderRadius: 8, padding: '4px 10px' }}>
                        {place.sold} vendu{place.sold > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {places.length > 1 && (
                    <button
                      onClick={() => {
                        if (placeHasSales) return
                        setPlaces((prev) => prev.filter((p) => p.key !== place.key))
                      }}
                      disabled={placeHasSales}
                      title={placeHasSales ? 'Impossible — cette place a déjà été vendue' : undefined}
                      style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(224,90,170,0.14)', border: '1px solid rgba(224,90,170,0.55)', cursor: placeHasSales ? 'not-allowed' : 'pointer', opacity: placeHasSales ? 0.4 : 1, fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#ff9ed2' }}
                    >
                      Supprimer
                    </button>
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
                  <InputField
                    label={`Prix (${currencySymbol(currency)})`}
                    type="number"
                    placeholder="0 = gratuit"
                    value={place.price}
                    onChange={(e) => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, price: Number(e.target.value) || 0 } : p)))}
                    locked={placeHasSales}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <InputField
                      label="Quantité disponible"
                      type="number"
                      placeholder="Ex: 100"
                      value={place.qty}
                      min={placeHasSales ? place.sold : 0}
                      onChange={(e) => {
                        const newQty = parseInt(e.target.value, 10) || 0
                        if (placeHasSales && newQty < place.sold) return
                        setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, qty: newQty } : p)))
                      }}
                    />
                    {placeHasSales && (
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(200,169,110,0.85)', marginTop: 4 }}>
                        Minimum : {place.sold} (déjà vendu{place.sold > 1 ? 's' : ''})
                      </p>
                    )}
                  </div>
                  <div>
                    <InputField
                      label={place.groupType === 'group' ? 'Réservations de groupe/compte' : 'Max/compte'}
                      type="number"
                      placeholder="0 = illimité"
                      value={place.groupType === 'group' ? 1 : place.maxPerAccount}
                      onChange={(e) => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, maxPerAccount: Number(e.target.value) || 0 } : p)))}
                      locked={placeHasSales || place.groupType === 'group'}
                    />
                    {place.groupType === 'group' && (
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(78,232,200,0.75)', marginTop: 4 }}>Fixé à 1 réservation de groupe par compte</p>
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
                      <InputField
                        label="Min personnes"
                        type="number"
                        placeholder="Ex: 8"
                        value={place.groupMin || ''}
                        onChange={(e) => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, groupMin: Number(e.target.value) || 0 } : p)))}
                        locked={placeHasSales}
                      />
                      <InputField
                        label="Max personnes"
                        type="number"
                        placeholder="Ex: 12"
                        value={place.groupMax || ''}
                        onChange={(e) => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, groupMax: Number(e.target.value) || 0 } : p)))}
                        locked={placeHasSales}
                      />
                    </div>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>La réservation est validée dès le minimum atteint, jusqu&apos;au maximum indiqué.</p>
                  </div>
                )}

                {/* Photos */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                  <p style={S.label}>
                    Photos de cette place <span style={{ color: 'rgba(255,255,255,0.5)' }}>(optionnel)</span>
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {place.photos.map((ph, k) => (
                      <div key={k} style={{ position: 'relative', width: 66, height: 66, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', flexShrink: 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ph} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          onClick={() => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, photos: p.photos.filter((_, m) => m !== k) } : p)))}
                          title="Retirer"
                          style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, lineHeight: '15px', cursor: 'pointer', padding: 0 }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {place.photos.length < MAX_PLACE_PHOTOS && (
                      <label style={{ width: 66, height: 66, borderRadius: 8, border: '1px dashed rgba(200,169,110,0.4)', background: 'rgba(200,169,110,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer', color: 'var(--gold)', flexShrink: 0 }}>
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
                          <Spinner size={16} color="var(--gold)" />
                        ) : (
                          <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700 }}>Ajouter</span>
                          </>
                        )}
                      </label>
                    )}
                  </div>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8, lineHeight: 1.5 }}>
                    Montre le carré, la table, la vue… Le client les verra avant de réserver. 6 photos maximum.
                  </p>
                </div>

                {/* Options incluses */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                  <p style={S.label}>
                    Options incluses dans ce billet <span style={{ color: 'rgba(255,255,255,0.5)' }}>(optionnel)</span>
                  </p>
                  {menuChoices.length === 0 && place.included.length === 0 ? (
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8, lineHeight: 1.5 }}>
                      Tu pourras inclure des articles ici une fois que tu en auras ajouté dans Options avancées → Précommandes (étape suivante). Reviens sur cette étape après pour les rattacher à ce billet.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      {place.included.map((inc, k) => {
                        const stillInMenu = menuChoices.some((m) => m.name.trim() === inc.name)
                        return (
                          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: `1px solid ${stillInMenu ? 'rgba(78,232,200,0.22)' : 'rgba(220,100,100,0.35)'}`, background: 'rgba(255,255,255,0.04)' }}>
                            <select
                              value={inc.name}
                              onChange={(e) =>
                                setPlaces((prev) =>
                                  prev.map((p) => (p.key === place.key ? { ...p, included: p.included.map((x, m) => (m === k ? { ...x, name: e.target.value } : x)) } : p))
                                )
                              }
                              style={{ flex: 1, minWidth: 0, background: '#0b0c12', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.92)', fontFamily: 'Inter, sans-serif', fontSize: 12, padding: '8px 8px', outline: 'none' }}
                            >
                              {!stillInMenu && <option value={inc.name}>{inc.name} (retiré du menu)</option>}
                              {menuChoices.map((m) => (
                                <option key={m.name} value={m.name.trim()}>
                                  {m.emoji ? `${m.emoji} ` : ''}
                                  {m.name.trim()} · {m.price} {currencySymbol(currency)}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={1}
                              value={inc.qty || 1}
                              onChange={(e) =>
                                setPlaces((prev) =>
                                  prev.map((p) => (p.key === place.key ? { ...p, included: p.included.map((x, m) => (m === k ? { ...x, qty: Math.max(1, parseInt(e.target.value, 10) || 1) } : x)) } : p))
                                )
                              }
                              title="Quantité incluse"
                              style={{ width: 52, background: '#0b0c12', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.92)', fontFamily: 'Inter, sans-serif', fontSize: 12, padding: '8px 6px', textAlign: 'center', outline: 'none' }}
                            />
                            <span
                              title="Inclus gratuitement dans le billet"
                              style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 8, fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', border: '1px solid rgba(78,232,200,0.35)', background: 'rgba(78,232,200,0.14)', color: 'var(--teal)' }}
                            >
                              Offert
                            </span>
                            <button
                              onClick={() => setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, included: p.included.filter((_, m) => m !== k) } : p)))}
                              title="Retirer cette option"
                              style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: 'rgba(220,50,50,0.10)', border: '1px solid rgba(220,100,100,0.3)', color: 'rgba(255,150,150,0.9)', fontSize: 13, lineHeight: '20px', cursor: 'pointer', padding: 0 }}
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                      {menuChoices.length > 0 && (
                        <button
                          onClick={() =>
                            setPlaces((prev) => prev.map((p) => (p.key === place.key ? { ...p, included: [...p.included, { name: menuChoices[0].name.trim(), qty: 1 }] } : p)))
                          }
                          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, background: 'rgba(78,232,200,0.14)', border: '1px solid rgba(78,232,200,0.35)', color: 'var(--teal)', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          + Inclure un article du menu
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <button onClick={() => setPlaces((prev) => [...prev, newPlaceRow()])} style={S.btnGhost}>
            + Ajouter un type de place
          </button>
          <button onClick={() => goNext(1)} style={S.btnPrimary}>
            Suivant
          </button>
        </div>
      )}

      {/* ── Step 2 : Lieu & infos pratiques ── */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: '0 0 4px' }}>Lieu &amp; infos pratiques</p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Indique où se déroulera ton événement.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <InputField label="Nom du lieu" placeholder="Ex: Club Le Baroque, Salle des Fêtes..." value={venueName} onChange={(e) => setVenueName(e.target.value)} locked={locked} />
            <InputField label="Adresse" placeholder="Ex: 12 rue de la Paix" value={address} onChange={(e) => setAddress(e.target.value)} locked={locked} />
            <InputField label="Ville *" placeholder="Ex: Paris, Lomé, Abidjan..." value={city} onChange={(e) => setCity(e.target.value)} error={errors.city} locked={locked} />

            <div>
              <label style={{ ...S.label, marginBottom: 4 }}>Région *</label>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>Dans quelle région se déroule l&apos;événement ?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {regions.map((r) => (
                  <Pill key={r.id} label={`${r.flag} ${r.name}`} active={region === r.name} disabled={locked} onClick={() => setRegion(r.name)} accent="var(--teal)" />
                ))}
              </div>
              {errors.region && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(220,100,100,0.9)', marginTop: 6 }}>{errors.region}</p>}
            </div>
          </div>

          <button onClick={() => goNext(2)} style={S.btnPrimary}>
            Suivant
          </button>
        </div>
      )}

      {/* ── Step 3 : Options avancées ── */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: 0 }}>Options avancées</p>

          <div style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, borderColor: 'rgba(78,232,200,0.15)' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.93)' }}>QR code billet</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 1.6 }}>Billet numérique unique scanné à l&apos;entrée — obligatoire</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Inclus</span>
            </div>
          </div>

          <div style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, ...(locked ? { borderColor: 'rgba(200,169,110,0.18)' } : {}) }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.93)' }}>Playlist interactive</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 1.6 }}>1 son par ticket — vote par likes</p>
              {locked && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(200,169,110,0.85)', marginTop: 4 }}>Verrouillé — billets déjà vendus</p>}
            </div>
            <Toggle value={playlist} onChange={() => setPlaylist((v) => !v)} disabled={locked} />
          </div>

          <div style={{ ...S.card, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, ...(locked ? { borderColor: 'rgba(200,169,110,0.18)' } : {}) }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.93)' }}>Précommande de consommations</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 1.6 }}>Les clients peuvent commander à l&apos;avance.</p>
              {locked && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(200,169,110,0.85)', marginTop: 4 }}>Verrouillé — des précommandes existent</p>}
            </div>
            <Toggle value={preorder} onChange={() => setPreorder((v) => !v)} disabled={locked} />
          </div>

          {preorder && (
            <div style={{ borderTop: '1px solid rgba(200,169,110,0.15)', paddingTop: 16, ...(locked ? { opacity: 0.6, pointerEvents: 'none' } : {}) }}>
              <p style={{ ...S.label, color: 'var(--gold)', marginBottom: 4 }}>Définir ta carte / menu</p>
              {locked ? (
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(200,169,110,0.85)', marginBottom: 12 }}>Menu verrouillé — des précommandes existent.</p>
              ) : (
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>Ajoute les articles que tes clients pourront précommander.</p>
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
                  onRemove={i > 0 ? () => setMenuItems((prev) => prev.filter((_, j) => j !== i)) : undefined}
                />
              ))}
              <button onClick={() => setMenuItems((prev) => [...prev, emptyMenuItem()])} style={S.btnGhost} disabled={locked}>
                + Ajouter un article
              </button>
            </div>
          )}

          {preorder && validMenuItemsForGate.length === 0 && (
            <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(224,90,170,0.5)', borderRadius: 12, fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
              La précommande est activée mais aucun article n&apos;a été renseigné. Ajoute au moins un article avec un nom et un prix, ou désactive la précommande.
            </div>
          )}

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: 0 }}>Planification</p>
            <div>
              <label style={S.label}>
                Date de publication <span style={{ color: 'rgba(255,255,255,0.5)' }}>(optionnel — vide = maintenant)</span>
              </label>
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                disabled={locked}
                style={{ ...S.inputBase, colorScheme: 'dark', ...(locked ? { opacity: 0.55, cursor: 'not-allowed' } : {}) }}
              />
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: locked ? 'rgba(200,169,110,0.85)' : 'rgba(255,255,255,0.5)', marginTop: 5, lineHeight: 1.6 }}>
                {locked ? "Verrouillé — l'événement est déjà publié." : 'L’événement apparaîtra sur le site à cette date et heure. Laisse vide pour publier immédiatement.'}
              </p>
            </div>
            <div>
              <label style={S.label}>
                Date de clôture des réservations <span style={{ color: 'rgba(255,255,255,0.5)' }}>(optionnel)</span>
              </label>
              <input type="datetime-local" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} min={dateStr || undefined} style={{ ...S.inputBase, colorScheme: 'dark' }} />
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 5, lineHeight: 1.6 }}>Laisse vide pour fermer automatiquement à la date de l&apos;événement.</p>
            </div>
          </div>

          <button
            onClick={() => goNext(3)}
            disabled={!canProceedStep3}
            style={{ ...S.btnPrimary, ...(!canProceedStep3 ? { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: 'none', cursor: 'not-allowed' } : {}) }}
          >
            Suivant
          </button>
        </div>
      )}

      {/* ── Step 4 : Récapitulatif & publication ── */}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.93)', margin: 0 }}>Récapitulatif &amp; publication</p>

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
              { label: 'Visibilité', val: visibility === 'private' ? 'Privé' : 'Publique' },
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
              <div key={r.label} style={{ ...S.card, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{r.label}</span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.92)', textAlign: 'right' }}>{r.val}</span>
              </div>
            ))}
          </div>

          <button style={{ ...S.btnPrimary, cursor: saving ? 'wait' : 'pointer' }} onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <Spinner size={14} />
                {eventId ? 'Enregistrement…' : 'Publication…'}
              </span>
            ) : eventId ? (
              'Enregistrer les modifications'
            ) : (
              'Publier mon événement'
            )}
          </button>
        </div>
      )}
    </main>
  )
}
