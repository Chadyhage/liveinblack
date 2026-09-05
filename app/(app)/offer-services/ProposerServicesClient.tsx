'use client'

import NextImage from 'next/image'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { regions } from '@/lib/shared/regions'
import { INTERNATIONAL_REGION_ID } from '@/lib/shared/locations'
import { SOCIAL_NETWORKS, type SocialNetworkKey } from '@/lib/shared/social'
import { PROVIDER_CATEGORIES, getPrimaryProviderType, getProviderCategory } from '@/lib/shared/providerCategories'
import { fmtMoney } from '@/lib/shared/money'
import { REVIEW_REPORT_REASONS, computeReviewStats } from '@/lib/shared/reviews'
import { Stars } from '@/app/components/ui/StarRating'
import ImageCropperModal from '@/app/components/ui/ImageCropperModal'
import { uploadPublicMedia } from '@/lib/client/publicMediaUpload'
import { useQueryParamState } from '@/lib/client/useQueryParamState'
import { Button, Input, Textarea, Select, Label, Card, Modal } from '@/app/components/ui'
import SubscriptionPanel from './SubscriptionPanel'
import {
  applyPrimaryRegionChange,
  catalogCategoriesForProviderTypes,
  comparableProviderProfile,
  toggleProviderCategorySelection,
  toggleProviderZoneSelection,
} from './providerProfileUtils'

// Port de ProposerServicesPage.jsx + MyProviderReviews.jsx (#8 phase
// prestataire, tâche #91). Contrairement au legacy (facturation chargée
// après montage via useEffect, écran "Chargement..."), tout est déjà résolu
// côté serveur (voir page.tsx) — aucun état de chargement initial ici.
// Avatar et couverture utilisent le recadrage partagé avant leur upload.
const C = { obsidian: 'var(--background)', teal: 'var(--primary)', gold: 'var(--primary)', pink: 'var(--pink)' }

const CARD_SHADOW = 'none'
const primaryButton: React.CSSProperties = {
  minHeight: 38,
  border: '1px solid var(--border-strong)',
  borderRadius: 3,
  background: 'var(--violet-cta)',
  color: 'var(--primary-ink)',
  fontSize: 'var(--font-size-callout)',
  fontWeight: 500,
  textTransform: 'none',
  letterSpacing: 'normal',
  boxShadow: 'none',
}
const secondaryButton: React.CSSProperties = { ...primaryButton, background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--text)', fontWeight: 600, boxShadow: 'none' }
const ghostButtonSmall: React.CSSProperties = { fontSize: 'var(--font-size-caption-lg)', fontWeight: 700 }

// Glyphe distinct par catégorie (PROVIDER_CATEGORIES[].icon) — auparavant un
// unique pictogramme maison/toit s'affichait pour toutes les catégories.
function CategoryIcon({ icon, size = 23 }: { icon: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (icon) {
    case 'mic':
      return (
        <svg {...common}>
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <path d="M12 19v3M8 22h8" />
        </svg>
      )
    case 'speaker':
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <circle cx="12" cy="15" r="4" />
          <circle cx="12" cy="7" r="1.2" />
        </svg>
      )
    case 'cart':
      return (
        <svg {...common}>
          <circle cx="9" cy="20" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="18" cy="20" r="1.3" fill="currentColor" stroke="none" />
          <path d="M2 3h2l2.4 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21 7H6" />
        </svg>
      )
    case 'camera':
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7l1.6-2.5A2 2 0 0 1 11.3 3.5h1.4a2 2 0 0 1 1.7 1L16 7" />
          <circle cx="12" cy="13.5" r="3.4" />
        </svg>
      )
    case 'sparkle':
      return (
        <svg {...common}>
          <path d="M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3z" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z" />
        </svg>
      )
    case 'truck':
      return (
        <svg {...common}>
          <path d="M3 7h11v9H3z" />
          <path d="M14 11h4l3 3v2h-7z" />
          <circle cx="7.5" cy="18" r="1.6" />
          <circle cx="17.5" cy="18" r="1.6" />
        </svg>
      )
    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <circle cx="17" cy="9" r="2.4" />
          <path d="M15.5 14a5 5 0 0 1 4.5 5" />
        </svg>
      )
    case 'megaphone':
      return (
        <svg {...common}>
          <path d="M3 10v4h3l7 4V6L6 10H3z" />
          <path d="M14 9a3 3 0 0 1 0 6" />
        </svg>
      )
    case 'heart':
      return (
        <svg {...common}>
          <path d="M12 20s-7-4.4-9.3-8.6A5 5 0 0 1 12 6a5 5 0 0 1 9.3 5.4C19 15.6 12 20 12 20z" />
        </svg>
      )
    case 'grid':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.4" />
          <rect x="14" y="3" width="7" height="7" rx="1.4" />
          <rect x="3" y="14" width="7" height="7" rx="1.4" />
          <rect x="14" y="14" width="7" height="7" rx="1.4" />
        </svg>
      )
    case 'building':
    default:
      return (
        <svg {...common}>
          <path d="M4 20V8l8-4 8 4v12" />
          <path d="M8 20v-5h8v5" />
        </svg>
      )
  }
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <Label style={{ display: 'block', fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 0 }}>
      <span style={{ display: 'block', marginBottom: 7 }}>{label}</span>
      {children}
      {helper && <span style={{ display: 'block', fontSize: 'var(--font-size-footnote)', fontWeight: 400, color: 'var(--text-faint)', lineHeight: 1.5, marginTop: 6 }}>{helper}</span>}
    </Label>
  )
}

function resizeImageToDataUri(file: File, maxDim = 1280, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode_failed'))
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas_failed'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

// ─────────────────────────────── Types ───────────────────────────────────

export interface CatalogItemView {
  id: string
  name: string
  description: string
  price: number | null
  currency: 'EUR' | 'XOF'
  unit: string
  category: string
  available: boolean
  media: { url: string; type: string }[]
  createdAt: string
}

export interface ProviderProfileView {
  userId: string
  name: string
  headline: string
  description: string
  city: string
  regionId: string
  country: string
  zonesIntervention: string[]
  website: string
  socialLinks: Record<SocialNetworkKey, string>
  photoUrl: string | null
  coverUrl: string | null
  prestataireType: string
  prestataireTypes: string[]
  phone: string
  catalogCurrency: 'EUR' | 'XOF'
  subscriptionActive: boolean
  subscriptionStatus: string
  subscriptionExpiresAt: string | null
  gracePeriodEndsAt: string | null
  ratingAvg: number
  ratingCount: number
  catalog: CatalogItemView[]
}

export interface SubscriptionOverview {
  billingRegionId: string
  currency: 'EUR' | 'XOF'
  canChangeBilling: boolean
  prestataireSubActive: boolean
  prestataireSubStatus: string | null
  prestataireSubEnd: string | null
  prestataireSubRail: 'stripe' | 'fedapay' | null
  payments: {
    id: string
    rail: 'stripe' | 'fedapay'
    amountMinor: number
    currency: 'EUR' | 'XOF'
    paidAt: string
    receiptUrl: string | null
  }[]
}

export interface ReviewView {
  id: string
  providerId: string
  providerName: string
  authorId: string
  authorName: string
  rating: number
  comment: string
  status: 'published' | 'hidden' | 'deleted'
  verified: boolean
  reply: { text: string; createdAt: string | null; updatedAt: string | null } | null
  reportCount: number
  edited: boolean
  createdAt: string
  updatedAt: string
}

type NewItemForm = { name: string; price: string; currency: string; unit: string; category: string; description: string; media: { url: string; type: string }[] }
const EMPTY_ITEM: NewItemForm = { name: '', price: '', currency: '', unit: '', category: '', description: '', media: [] }

// ─────────────────────────────── Composant ────────────────────────────────

export default function ProposerServicesClient({
  initialProfile,
  initialSubscription,
  initialReviews,
}: {
  initialProfile: ProviderProfileView
  initialSubscription: SubscriptionOverview
  initialReviews: ReviewView[]
}) {
  const router = useRouter()
  const [profile, setProfile] = useState(initialProfile)
  // Port de hasUnsavedProfileChanges (ProposerServicesPage.jsx) : baseline mise
  // à jour uniquement après une sauvegarde réussie (« Enregistrer ma page »)
  // ou un upload avatar/couverture (déjà persisté serveur), jamais à chaque frappe.
  const [savedProfile, setSavedProfile] = useState(initialProfile)
  const [subscription, setSubscription] = useState(initialSubscription)
  const [tab, setTab] = useQueryParamState<'profil' | 'catalogue' | 'avis' | 'abonnement'>('tab', 'profil')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'avatar' | 'cover' | ''>('')
  const [crop, setCrop] = useState<{ field: 'photoUrl' | 'coverUrl'; src: string } | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const [showItemForm, setShowItemForm] = useState(false)
  const [newItem, setNewItem] = useState<NewItemForm>(EMPTY_ITEM)
  // Fichiers choisis avant même que l'offre existe (id serveur pas encore
  // attribué) — on garde le File + une URL locale (createObjectURL) pour
  // la prévisualisation, révoquée à la fermeture/l'annulation du formulaire
  // ou à la publication. L'upload réel se fait après la création de l'offre
  // (handleAddItem), enchaîné dans le même clic sur « Publier ».
  const [newItemFiles, setNewItemFiles] = useState<{ file: File; url: string }[]>([])
  const [addingItem, setAddingItem] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<NewItemForm | null>(null)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<CatalogItemView | null>(null)
  const [confirmRemoveMedia, setConfirmRemoveMedia] = useState<{ itemId: string; mediaIndex: number } | null>(null)
  const [removingItem, setRemovingItem] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [togglingItemId, setTogglingItemId] = useState<string | null>(null)

  const [reviews, setReviews] = useState(initialReviews)
  const [replyFor, setReplyFor] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)
  const [replyErr, setReplyErr] = useState('')
  const [reportFor, setReportFor] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportMsg, setReportMsg] = useState('')

  const providerTypes = profile.prestataireTypes.length ? profile.prestataireTypes : ['autre']
  const type = getPrimaryProviderType({ prestataireTypes: providerTypes })
  const category = getProviderCategory(type)
  const catalogDefaultCurrency = subscription.currency
  const catalogCategories = catalogCategoriesForProviderTypes(providerTypes)
  const billingRegion = regions.find((r) => r.id === subscription.billingRegionId) || null

  const hasUnsavedProfileChanges = comparableProviderProfile(profile) !== comparableProviderProfile(savedProfile)

  function notify(text: string) {
    setMessage(text)
    setTimeout(() => setMessage(''), 3200)
  }

  // ── Profil ──
  function update(patch: Partial<ProviderProfileView>) {
    setProfile((current) => ({ ...current, ...patch }))
  }

  function toggleProviderCategory(categoryId: string) {
    setProfile((current) => {
      const prestataireTypes = toggleProviderCategorySelection(current.prestataireTypes, categoryId)
      return { ...current, prestataireTypes }
    })
  }

  function toggleZone(zoneId: string) {
    setProfile((current) => {
      const zonesIntervention = toggleProviderZoneSelection(current.zonesIntervention, zoneId, current.regionId)
      return { ...current, zonesIntervention: zonesIntervention.length ? zonesIntervention : [current.regionId] }
    })
  }

  function handlePrimaryRegionChange(regionId: string) {
    setProfile((current) => {
      const zones = applyPrimaryRegionChange(current.zonesIntervention, current.regionId, regionId)
      return { ...current, regionId, zonesIntervention: zones.length ? zones : [regionId] }
    })
  }

  async function handleImage(field: 'photoUrl' | 'coverUrl', file: File | undefined) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return notify('Utilise une image JPG, PNG ou WEBP.')
    if (file.size > 5 * 1024 * 1024) return notify("L'image doit faire moins de 5 Mo.")

    setCrop({ field, src: await readAsDataUri(file) })
  }

  async function uploadCroppedImage(field: 'photoUrl' | 'coverUrl', dataUri: string) {
    setUploading(field === 'photoUrl' ? 'avatar' : 'cover')
    try {
      const res = await fetch('/api/providers/me/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: field === 'photoUrl' ? 'avatar' : 'cover', dataUri }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error()
      setProfile(data.profile)
      setSavedProfile(data.profile)
      notify('Image enregistrée sur ta page.')
    } catch {
      notify('Envoi impossible — réessaie.')
    }
    setUploading('')
  }

  async function handleSaveProfile() {
    if (!profile.name.trim()) return notify('Ajoute le nom de ta page.')
    setSaving(true)
    try {
      const res = await fetch('/api/providers/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name,
          headline: profile.headline,
          description: profile.description,
          city: profile.city,
          regionId: profile.regionId,
          zonesIntervention: profile.zonesIntervention,
          website: profile.socialLinks.website || profile.website,
          socialLinks: profile.socialLinks,
          prestataireTypes: profile.prestataireTypes,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        notify(data.error === 'name_required' ? 'Ajoute le nom de ta page.' : 'Enregistrement impossible.')
        setSaving(false)
        return
      }
      setProfile(data.profile)
      setSavedProfile(data.profile)
      notify('Ta page a été enregistrée.')
    } catch {
      notify('Enregistrement impossible — vérifie ta connexion.')
    }
    setSaving(false)
  }

  // ── Abonnement ──
  async function handleBillingRegionChange(regionId: string) {
    try {
      const res = await fetch('/api/providers/me/billing-region', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingRegionId: regionId }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        notify('Changement impossible — réessaie.')
        return
      }
      setSubscription((s) => ({ ...s, billingRegionId: data.billingRegionId, currency: data.currency, canChangeBilling: data.canChange }))
    } catch {
      notify('Changement impossible — vérifie ta connexion.')
    }
  }

  // ── Catalogue ──
  function resetItemForm() {
    setNewItem(EMPTY_ITEM)
    setShowItemForm(false)
    newItemFiles.forEach((f) => URL.revokeObjectURL(f.url))
    setNewItemFiles([])
  }

  function addNewItemFiles(fileList: FileList | null) {
    if (!fileList || !fileList.length) return
    const accepted: { file: File; url: string }[] = []
    for (const file of Array.from(fileList)) {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      if (!isImage && !isVideo) {
        notify('Utilise une photo JPG, PNG, WEBP ou une vidéo MP4, WEBM, MOV.')
        continue
      }
      if (isVideo && !['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
        notify('Utilise une vidéo MP4, WEBM ou MOV.')
        continue
      }
      if (isVideo && file.size > 30_000_000) {
        notify('La vidéo doit faire 30 Mo maximum.')
        continue
      }
      if (isImage && file.size > 10_000_000) {
        notify("L'image doit faire 10 Mo maximum.")
        continue
      }
      accepted.push({ file, url: URL.createObjectURL(file) })
    }
    if (!accepted.length) return
    setNewItemFiles((current) => {
      const combined = [...current, ...accepted]
      if (combined.length > 4) {
        notify('Maximum 4 médias par offre.')
        combined.slice(4).forEach((f) => URL.revokeObjectURL(f.url))
      }
      return combined.slice(0, 4)
    })
  }

  function removeNewItemFile(index: number) {
    setNewItemFiles((current) => {
      const target = current[index]
      if (target) URL.revokeObjectURL(target.url)
      return current.filter((_, i) => i !== index)
    })
  }

  async function handleAddItem() {
    if (!newItem.name.trim()) return notify('Donne un nom à cette offre.')
    setAddingItem(true)
    try {
      const res = await fetch('/api/providers/me/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItem.name,
          description: newItem.description,
          price: newItem.price === '' ? null : Number(newItem.price),
          currency: newItem.currency,
          unit: newItem.unit,
          category: newItem.category,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        notify('Impossible d’ajouter cette offre.')
        setAddingItem(false)
        return
      }
      // L'API renvoie le profil avec l'offre ajoutée en fin de catalogue
      // (addCatalogItem fait un push) — c'est le seul moyen de récupérer
      // son id fraîchement généré côté serveur pour y attacher les médias.
      let profile: ProviderProfileView = data.profile
      const newItemId = profile.catalog[profile.catalog.length - 1]?.id

      if (newItemId && newItemFiles.length) {
        for (const { file } of newItemFiles) {
          try {
            const isVideo = file.type.startsWith('video/')
            const media = isVideo
              ? { upload: await uploadPublicMedia(file, 'provider-catalog') }
              : { dataUri: await resizeImageToDataUri(file, 1280) }
            const mediaRes = await fetch(`/api/providers/me/catalog/${newItemId}/media`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(media),
            })
            const mediaData = await mediaRes.json()
            if (!mediaRes.ok || !mediaData.ok) throw new Error(mediaData.error || 'upload_failed')
            profile = mediaData.profile
          } catch {
            // L'offre existe déjà côté serveur : on ne la perd pas, on
            // prévient juste que ses médias n'ont pas tous été envoyés.
            setProfile(profile)
            resetItemForm()
            notify('Offre créée, mais l’envoi des photos/vidéos a échoué. Modifie l’offre pour réessayer.')
            setAddingItem(false)
            return
          }
        }
      }

      setProfile(profile)
      resetItemForm()
      notify('Offre ajoutée au catalogue.')
    } catch {
      notify('Impossible d’ajouter cette offre.')
    }
    setAddingItem(false)
  }

  function startEdit(item: CatalogItemView) {
    setEditingItemId(item.id)
    setEditingItem({ name: item.name, price: item.price == null ? '' : String(item.price), currency: item.currency, unit: item.unit, category: item.category, description: item.description, media: item.media })
  }

  async function saveEditedItem() {
    if (!editingItemId || !editingItem?.name.trim() || savingEdit) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/providers/me/catalog/${editingItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingItem.name,
          description: editingItem.description,
          price: editingItem.price === '' ? null : Number(editingItem.price),
          currency: editingItem.currency,
          unit: editingItem.unit,
          category: editingItem.category,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        notify('Impossible d’enregistrer cette offre.')
        setSavingEdit(false)
        return
      }
      setProfile(data.profile)
      setEditingItemId(null)
      setEditingItem(null)
      notify('Offre modifiée.')
    } catch {
      notify('Impossible d’enregistrer cette offre.')
    }
    setSavingEdit(false)
  }

  async function toggleItem(item: CatalogItemView) {
    if (togglingItemId === item.id) return
    setTogglingItemId(item.id)
    try {
      const res = await fetch(`/api/providers/me/catalog/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: item.available === false }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        notify('Impossible de modifier la visibilité de cette offre.')
      } else {
        setProfile(data.profile)
      }
    } catch {
      notify('Impossible de modifier la visibilité de cette offre.')
    }
    setTogglingItemId(null)
  }

  async function confirmDeleteItem() {
    if (!confirmRemoveItem) return
    setRemovingItem(true)
    try {
      const res = await fetch(`/api/providers/me/catalog/${confirmRemoveItem.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        notify('Impossible de supprimer cette offre.')
        setRemovingItem(false)
        return
      }
      setProfile(data.profile)
      notify('Offre supprimée.')
    } catch {
      notify('Impossible de supprimer cette offre.')
      setRemovingItem(false)
      return
    }
    setRemovingItem(false)
    setConfirmRemoveItem(null)
  }

  async function handleOfferMedia(itemId: string | null, file: File | undefined) {
    if (!file || !itemId) return
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) return notify('Utilise une photo JPG, PNG, WEBP ou une vidéo MP4, WEBM, MOV.')
    if (isVideo && !['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) return notify('Utilise une vidéo MP4, WEBM ou MOV.')
    if (isVideo && file.size > 30_000_000) return notify('La vidéo doit faire 30 Mo maximum.')
    if (isImage && file.size > 10_000_000) return notify("L'image doit faire 10 Mo maximum.")
    setMediaUploading(true)
    try {
      const media = isVideo
        ? { upload: await uploadPublicMedia(file, 'provider-catalog') }
        : { dataUri: await resizeImageToDataUri(file, 1280) }
      const res = await fetch(`/api/providers/me/catalog/${itemId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(media),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'upload_failed')
      setProfile(data.profile)
      notify('Média ajouté à l’offre.')
    } catch (err) {
      notify(err instanceof Error && err.message === 'media_limit_reached' ? 'Maximum 4 médias par offre.' : 'Le média n’a pas pu être envoyé.')
    }
    setMediaUploading(false)
  }

  async function removeOfferMedia(itemId: string, mediaIndex: number) {
    setMediaUploading(true)
    try {
      const res = await fetch(`/api/providers/me/catalog/${itemId}/media`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaIndex }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'remove_failed')
      setProfile(data.profile)
      notify('Média supprimé.')
    } catch {
      notify('Le média n’a pas pu être supprimé.')
    }
    setMediaUploading(false)
  }

  // ── Avis ──
  async function handleReply(review: ReviewView) {
    if (replyBusy) return
    const text = replyText.trim()
    if (!text) return setReplyErr('Ta réponse est vide.')
    setReplyBusy(true)
    setReplyErr('')
    try {
      const res = await fetch(`/api/reviews/${review.id}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setReplyErr('Réponse impossible — réessaie.')
        setReplyBusy(false)
        return
      }
      setReviews((current) => current.map((r) => (r.id === review.id ? { ...r, reply: data.reply } : r)))
      setReplyFor(null)
      setReplyText('')
    } catch {
      setReplyErr('Réponse impossible — vérifie ta connexion.')
    }
    setReplyBusy(false)
  }

  async function handleReport(review: ReviewView) {
    if (reportBusy || !reportReason) return
    setReportBusy(true)
    try {
      const res = await fetch(`/api/reviews/${review.id}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reportReason }) })
      const data = await res.json()
      setReportMsg(res.ok || data.error === 'already_reported' ? 'Merci, ton signalement a été transmis à la modération.' : 'Signalement impossible.')
    } catch {
      setReportMsg('Signalement impossible — vérifie ta connexion.')
    }
    setReportBusy(false)
    setReportFor(null)
    setReportReason('')
    setTimeout(() => setReportMsg(''), 4000)
  }

  const published = reviews.filter((r) => r.status === 'published')
  const { avg, count, dist } = computeReviewStats(published)

  return (
    <>
      <style>{`
        @keyframes lib-spin { to { transform: rotate(360deg) } }
        .provider-workspace{max-width:1600px;margin:0 auto;padding:0 0 110px}
        .provider-workspace-header{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
        .provider-profile-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(260px,.85fr);gap:16px}
        .provider-fields-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        @media(max-width:720px){
          .provider-profile-grid,.provider-fields-two{grid-template-columns:1fr}
          .provider-workspace{padding-top:16px}
          .provider-catalog-item{flex-wrap:wrap}
          .provider-catalog-actions{width:100%;justify-content:flex-start!important}
        }
        .provider-tab-short{display:none}
        @media(max-width:480px){
          /* Le lecteur de musique flottant (AmbientMusicPlayer) reste fixed
             en bas à droite (right:14, bottom ~134px sur mobile) — on
             réserve assez de padding en bas de page pour qu'aucun contenu
             (champ de formulaire, bouton Supprimer d'une offre) ne se
             retrouve jamais derrière lui en fin de défilement. */
          .provider-workspace{padding-bottom:190px}
          .provider-tab-full{display:none}
          .provider-tab-short{display:inline}
          .provider-catalog-header{flex-direction:column;align-items:stretch!important}
          .provider-catalog-header button{width:100%}
        }
      `}</style>
      <main className="provider-workspace lb-dashboard-page">
        <div className="provider-workspace-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <header>
            <h1 style={{ margin: 0, color: 'var(--text)', fontSize: 'clamp(28px,3.6vw,38px)', fontWeight: 720, letterSpacing: '-.045em' }}>Mon espace prestataire</h1>
            <p style={{ maxWidth: 650, margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-body)', lineHeight: 1.45 }}>Présente tes services, gère ton catalogue et suis les avis reçus.</p>
          </header>
          <Button variant="secondary" onClick={() => router.push(`/providers/${encodeURIComponent(profile.userId)}`)} style={secondaryButton}>
            Voir ma page publique
          </Button>
        </div>

        {message && (
          // position:'sticky' — un message déclenché depuis un onglet
          // (ex. erreur de validation catalogue) reste visible même si
          // l'utilisateur a déjà scrollé, au lieu de rester bloqué en haut
          // de page hors du champ de vision.
          <Card role="status" accent="var(--primary-a35)" style={{ boxShadow: CARD_SHADOW, position: 'sticky', top: 12, zIndex: 30, padding: '12px 14px', marginTop: 12 }}>
            <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text)', margin: 0 }}>{message}</p>
          </Card>
        )}

        <div role="tablist" aria-label="Sections de l’espace prestataire" style={{ display: 'flex', gap: 6, margin: '22px 0 16px', padding: 4, borderRadius: 13, background: 'var(--surface-2)', border: '1px solid var(--surface-2)' }}>
          {[
            { id: 'profil' as const, label: 'Ma page publique', shortLabel: 'Ma page' },
            { id: 'catalogue' as const, label: `Catalogue (${profile.catalog.length})`, shortLabel: `Catalogue (${profile.catalog.length})` },
            { id: 'avis' as const, label: 'Mes avis', shortLabel: 'Avis' },
            { id: 'abonnement' as const, label: 'Abonnement', shortLabel: 'Abonnement' },
          ].map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              style={{ flex: 1, minHeight: 38, borderRadius: 12, border: '1px solid transparent', background: tab === item.id ? 'var(--border)' : 'transparent', color: tab === item.id ? 'var(--text)' : 'var(--text-muted)', fontSize: 'var(--font-size-callout)', fontWeight: 700 }}
            >
              <span className="provider-tab-full">{item.label}</span>
              <span className="provider-tab-short">{item.shortLabel}</span>
            </Button>
          ))}
        </div>

        {tab === 'profil' && (
          <div className="provider-profile-grid">
            <Card style={{ boxShadow: CARD_SHADOW, padding: 18 }}>
              <h2 style={{ fontFamily: 'var(--font-display), sans-serif', fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', margin: '0 0 5px' }}>Informations publiques</h2>
              <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-faint)', lineHeight: 1.5, margin: '0 0 18px' }}>Ce sont les informations que les clients et organisateurs verront.</p>
              {hasUnsavedProfileChanges && (
                <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 13px', margin: '0 0 16px', borderRadius: 13, background: 'var(--primary-a10)', border: '1px solid var(--primary-a35)', color: 'var(--text)' }}>
                  <span style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', flexShrink: 0, color: C.gold, background: 'var(--primary-a12)', border: '1px solid var(--focus-ring-color)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                    </svg>
                  </span>
                  <div>
                    <strong style={{ display: 'block', fontSize: 'var(--font-size-body)', color: C.gold, marginBottom: 3 }}>Modifications non enregistrées</strong>
                    <p style={{ fontSize: 'var(--font-size-footnote-lg)', lineHeight: 1.45, color: 'var(--text-muted)', margin: 0 }}>Clique sur « Enregistrer ma page » pour que ces changements soient visibles sur ta page publique.</p>
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <Field label="Nom de la page">
                  <Input value={profile.name} onChange={(e) => update({ name: e.target.value })} placeholder="Nom commercial ou nom de scène" />
                </Field>
                <Field label="Accroche professionnelle" helper="Une phrase courte visible en haut de ta page.">
                  <Input maxLength={120} value={profile.headline} onChange={(e) => update({ headline: e.target.value })} placeholder="Ex. DJ afro-house pour soirées privées et clubs" />
                </Field>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Mes activités" helper="Tu peux en choisir plusieurs. La première sélectionnée est la catégorie principale." >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {PROVIDER_CATEGORIES.map((item) => {
                      const selected = profile.prestataireTypes.includes(item.id)
                      return (
                        <Button
                          key={item.id}
                          variant="ghost"
                          onClick={() => toggleProviderCategory(item.id)}
                          style={{ padding: '8px 11px', borderRadius: 999, fontSize: 'var(--font-size-caption-lg)', fontWeight: 700, color: selected ? item.color : 'var(--text-muted)', background: selected ? `${item.color}18` : 'var(--surface-2)', border: `1px solid ${selected ? `${item.color}88` : 'var(--border)'}` }}
                        >
                          {item.singular}
                        </Button>
                      )
                    })}
                    </div>
                  </Field>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Présentation">
                    <Textarea style={{ minHeight: 125 }} value={profile.description} onChange={(e) => update({ description: e.target.value })} placeholder="Présente ton activité, ton style et ce qui te différencie." />
                  </Field>
                </div>
                <Field label="Ville de base">
                  <Input value={profile.city} onChange={(e) => update({ city: e.target.value })} placeholder="Paris, Lomé, Cotonou…" />
                </Field>
                <Field label="Site principal">
                  <Input value={profile.socialLinks.website || profile.website || ''} onChange={(e) => update({ website: e.target.value, socialLinks: { ...profile.socialLinks, website: e.target.value } })} placeholder="https://tonsite.com" />
                </Field>
                <Field label="Pays de base" helper="Un seul pays de référence, affiché avec ta ville (pas d'option « International » ici). Il ne modifie jamais ta facturation.">
                  <Select
                    value={profile.regionId}
                    onChange={handlePrimaryRegionChange}
                    options={regions.map((r) => ({ value: r.id, label: `${r.flag} ${r.name}` }))}
                  />
                </Field>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Pays / régions d'intervention" helper="Sélectionne tous les pays où tu peux te déplacer ou fournir ta prestation.">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {[{ id: INTERNATIONAL_REGION_ID, name: 'International', flag: '🌍' }, ...regions].map((r) => {
                        const selected = profile.zonesIntervention.includes(r.id)
                        return (
                          <Button key={r.id} variant="ghost" onClick={() => toggleZone(r.id)} style={{ padding: '8px 12px', borderRadius: 999, fontSize: 'var(--font-size-footnote)', color: selected ? C.teal : 'var(--text-muted)', background: selected ? 'var(--primary-a10)' : 'var(--surface-2)', border: `1px solid ${selected ? 'var(--primary-a55)' : 'var(--border)'}` }}>
                            {r.flag} {r.name}
                          </Button>
                        )
                      })}
                    </div>
                  </Field>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Réseaux sociaux" helper="Colle un lien complet ou juste ton @pseudo.">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                      {SOCIAL_NETWORKS.filter((n) => n.key !== 'website').map((network) => (
                        <Label key={network.key} style={{ display: 'grid', gap: 5, marginBottom: 0 }}>
                          <span style={{ fontSize: 'var(--font-size-caption-2-lg)', fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{network.label}</span>
                          <Input value={profile.socialLinks[network.key] || ''} onChange={(e) => update({ socialLinks: { ...profile.socialLinks, [network.key]: e.target.value } })} placeholder={network.placeholder} />
                        </Label>
                      ))}
                    </div>
                  </Field>
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Button onClick={handleSaveProfile} disabled={saving || Boolean(uploading)} loading={Boolean(uploading)} loadingText="Envoi de l’image…" style={{ ...primaryButton, alignSelf: 'flex-start' }}>
                    {saving ? 'Enregistrement…' : 'Enregistrer ma page'}
                  </Button>
                  {hasUnsavedProfileChanges && <span style={{ fontSize: 'var(--font-size-footnote)', color: C.gold }}>À enregistrer pour publier les changements</span>}
                </div>
              </div>
            </Card>

            <Card style={{ boxShadow: CARD_SHADOW, overflow: 'hidden', alignSelf: 'start' }}>
              <Button variant="ghost" onClick={() => coverInputRef.current?.click()} style={{ width: '100%', height: 150, position: 'relative', display: 'block', padding: 0, border: 0, borderRadius: 0, background: profile.coverUrl ? `url(${profile.coverUrl}) center/cover` : `linear-gradient(135deg,${category.color}55,var(--media-panel-deep))` }} aria-label="Modifier la photo de couverture">
                <span style={{ position: 'absolute', right: 10, top: 10, padding: '6px 9px', borderRadius: 8, background: 'var(--media-scrim)', color: 'var(--text)', fontSize: 'var(--font-size-caption)', fontWeight: 700 }}>Modifier la couverture</span>
              </Button>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  void handleImage('coverUrl', file)
                }}
              />
              <div style={{ padding: '0 18px 19px', marginTop: -38, position: 'relative' }}>
                <Button variant="ghost" onClick={() => avatarInputRef.current?.click()} style={{ width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center', padding: 0, border: '4px solid var(--media-canvas)', background: category.color, color: C.obsidian, fontSize: 'var(--font-size-title-4)', fontWeight: 900, position: 'relative' }} aria-label="Modifier la photo de profil">
                  {profile.photoUrl ? (
                    <NextImage src={profile.photoUrl} alt="" fill style={{ objectFit: 'cover' }} sizes="78px" />
                  ) : (
                    profile.name.charAt(0).toUpperCase() || '?'
                  )}
                </Button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    void handleImage('photoUrl', file)
                  }}
                />
                <h3 style={{ fontSize: 'var(--font-size-title-4)', margin: '10px 0 0' }}>{profile.name || 'Nom de ta page'}</h3>
                {profile.headline && <p style={{ fontSize: 'var(--font-size-callout)', fontWeight: 700, color: 'var(--text)', lineHeight: 1.4, margin: '7px 0 0' }}>{profile.headline}</p>}
                <p style={{ fontSize: 'var(--font-size-footnote)', fontWeight: 800, color: category.color, margin: '5px 0 0' }}>{providerTypes.map((v) => getProviderCategory(v).singular).join(' · ')}</p>
                <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-faint)', lineHeight: 1.55, margin: '12px 0 0' }}>{profile.description || 'Ta présentation apparaîtra ici.'}</p>
              </div>
            </Card>
          </div>
        )}

        {tab === 'catalogue' && (
          <section>
            <div className="provider-catalog-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 13 }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display), sans-serif', fontSize: 'var(--font-size-body-sm)', fontWeight: 400, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '3.2px', margin: 0 }}>Mon catalogue</h2>
                <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', margin: '4px 0 0' }}>Les tarifs sont indicatifs. Le client te contacte ensuite pour tout organiser avec toi.</p>
              </div>
              {!showItemForm && (
                <Button onClick={() => setShowItemForm(true)} style={primaryButton}>
                  Ajouter une offre
                </Button>
              )}
            </div>

            {showItemForm && (
              <Card style={{ boxShadow: CARD_SHADOW, padding: 18, marginBottom: 14 }}>
                <h3 style={{ fontSize: 'var(--font-size-title-4)', margin: '0 0 14px' }}>Nouvelle offre</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Field label="Nom de l'offre">
                      <Input value={newItem.name} onChange={(e) => setNewItem((c) => ({ ...c, name: e.target.value }))} placeholder="DJ set 3 heures, location de salle…" />
                    </Field>
                  </div>
                  <Field label="Tarif indicatif" helper="Laisse vide (ou saisis 0) pour afficher « Tarif sur demande ».">
                    <Input type="number" min="0" value={newItem.price} onChange={(e) => setNewItem((c) => ({ ...c, price: e.target.value }))} placeholder="Optionnel" />
                  </Field>
                  <Field label="Devise">
                    <Select
                      value={newItem.currency || catalogDefaultCurrency}
                      onChange={(value) => setNewItem((c) => ({ ...c, currency: value }))}
                      options={[
                        { value: 'EUR', label: 'Euro (€)' },
                        { value: 'XOF', label: 'Franc CFA (FCFA)' },
                      ]}
                    />
                  </Field>
                  <Field label="Unité">
                    <Select
                      value={newItem.unit}
                      onChange={(value) => setNewItem((c) => ({ ...c, unit: value }))}
                      options={[
                        { value: '', label: 'Aucune' },
                        ...['heure', 'soirée', 'jour', 'personne', 'unité', 'lot', 'forfait'].map((v) => ({ value: v, label: `par ${v}` })),
                      ]}
                    />
                  </Field>
                  <Field label="Catégorie">
                    <Select
                      value={newItem.category}
                      onChange={(value) => setNewItem((c) => ({ ...c, category: value }))}
                      options={[{ value: '', label: 'Sans catégorie' }, ...catalogCategories.map((v) => ({ value: v, label: v }))]}
                    />
                  </Field>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Field label="Description">
                      <Textarea style={{ minHeight: 72 }} value={newItem.description} onChange={(e) => setNewItem((c) => ({ ...c, description: e.target.value }))} placeholder="Ce qui est inclus, durée, conditions principales…" />
                    </Field>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ display: 'block', fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 7 }}>Photos / vidéos (optionnel)</span>
                    {newItemFiles.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginBottom: 8 }}>
                        {newItemFiles.map((f, i) => (
                          <div key={`${f.file.name}-${i}`} style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', aspectRatio: '16 / 10' }}>
                            {f.file.type.startsWith('video/') ? (
                              <video src={f.url} muted preload="metadata" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <NextImage src={f.url} alt="" fill unoptimized style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 50vw, 240px" />
                            )}
                            <Button variant="ghost" aria-label={`Retirer ${f.file.name}`} onClick={() => removeNewItemFile(i)} disabled={addingItem} style={{ position: 'absolute', top: 7, right: 7, width: 38, height: 38, minHeight: 38, minWidth: 38, borderRadius: '50%', border: '1px solid var(--border-strong)', background: 'var(--media-scrim)', color: 'var(--text)', fontSize: 'var(--font-size-title-4)', padding: 0 }}>
                              ×
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {newItemFiles.length < 4 && (
                      <Label style={{ display: 'block', width: '100%', minHeight: 64, borderRadius: 13, border: '1px dashed var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text-faint)', cursor: addingItem ? 'wait' : 'pointer', fontSize: 'var(--font-size-callout)', fontWeight: 700, textAlign: 'center', lineHeight: '64px', marginBottom: 0 }}>
                        {`+ Ajouter une photo ou une vidéo (${newItemFiles.length}/4)`}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                          multiple
                          hidden
                          disabled={addingItem}
                          onChange={(e) => {
                            addNewItemFiles(e.target.files)
                            e.target.value = ''
                          }}
                        />
                      </Label>
                    )}
                    <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-faint)', margin: '6px 0 0' }}>
                      JPG, PNG, WEBP, MP4, WEBM ou MOV. Envoyés dès la publication de l&rsquo;offre — tu pourras aussi en ajouter ou en retirer plus tard.
                    </p>
                  </div>

                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button onClick={handleAddItem} disabled={addingItem} loading={addingItem} loadingText="Publication…" style={primaryButton}>
                      Publier dans le catalogue
                    </Button>
                    <Button variant="secondary" onClick={resetItemForm} disabled={addingItem} style={secondaryButton}>
                      Annuler
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {profile.catalog.length === 0 && !showItemForm ? (
              <Card style={{ boxShadow: CARD_SHADOW, padding: '36px 20px', textAlign: 'center' }}>
                <h2 style={{ fontSize: 'var(--font-size-title-4)', margin: 0 }}>Ton catalogue est vide</h2>
                <p style={{ maxWidth: 410, margin: '8px auto 15px', fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-faint)', lineHeight: 1.55 }}>Ajoute les services, formules ou équipements que les visiteurs pourront découvrir sur ta page.</p>
                <Button onClick={() => setShowItemForm(true)} style={primaryButton}>
                  Ajouter ma première offre
                </Button>
              </Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {profile.catalog.map((item) =>
                  editingItemId === item.id && editingItem ? (
                    <Card key={item.id} style={{ boxShadow: CARD_SHADOW, padding: 14 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Input value={editingItem.name} onChange={(e) => setEditingItem((c) => (c ? { ...c, name: e.target.value } : c))} />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                          <Input type="number" min="0" value={editingItem.price} onChange={(e) => setEditingItem((c) => (c ? { ...c, price: e.target.value } : c))} placeholder="Tarif sur demande" />
                          <Label style={{ display: 'block' }}>
                            <span style={{ display: 'block', fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 7 }}>Devise</span>
                            <Select
                              value={editingItem.currency}
                              onChange={(value) => setEditingItem((c) => (c ? { ...c, currency: value } : c))}
                              options={[
                                { value: 'EUR', label: '€' },
                                { value: 'XOF', label: 'FCFA' },
                              ]}
                            />
                          </Label>
                          <Select
                            value={editingItem.unit}
                            onChange={(value) => setEditingItem((c) => (c ? { ...c, unit: value } : c))}
                            options={[
                              { value: '', label: 'Aucune unité' },
                              ...['heure', 'soirée', 'jour', 'personne', 'unité', 'lot', 'forfait'].map((v) => ({ value: v, label: `par ${v}` })),
                            ]}
                          />
                        </div>
                        <Textarea style={{ minHeight: 62 }} value={editingItem.description} onChange={(e) => setEditingItem((c) => (c ? { ...c, description: e.target.value } : c))} />

                        <div>
                          <span style={{ display: 'block', fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 7 }}>Photos / vidéos</span>
                          {item.media.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginBottom: 8 }}>
                              {item.media.map((m, i) => (
                                <div key={`${m.url}-${i}`} style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', aspectRatio: '16 / 10' }}>
                                  {m.type === 'video' ? (
                                    <video src={m.url} controls preload="metadata" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    <NextImage src={m.url} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 50vw, 240px" />
                                  )}
                                  <Button variant="ghost" aria-label={`Retirer le média ${i + 1}`} onClick={() => setConfirmRemoveMedia({ itemId: item.id, mediaIndex: i })} disabled={mediaUploading} style={{ position: 'absolute', top: 7, right: 7, width: 34, height: 34, minHeight: 34, minWidth: 34, borderRadius: '50%', border: '1px solid var(--border-strong)', background: 'var(--media-scrim)', color: 'var(--text)', fontSize: 'var(--font-size-headline-lg)', padding: 0 }}>
                                    ×
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                          {item.media.length < 4 && (
                            <Label style={{ display: 'block', width: '100%', minHeight: 58, borderRadius: 13, border: '1px dashed var(--border-strong)', background: 'var(--surface-2)', color: mediaUploading ? C.gold : 'var(--text-faint)', cursor: mediaUploading ? 'wait' : 'pointer', fontSize: 'var(--font-size-footnote-lg)', fontWeight: 700, textAlign: 'center', lineHeight: '58px', marginBottom: 0 }}>
                              {mediaUploading ? 'Envoi du média…' : `+ Ajouter une photo ou une vidéo (${item.media.length}/4)`}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                                hidden
                                disabled={mediaUploading}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  e.target.value = ''
                                  void handleOfferMedia(item.id, file)
                                }}
                              />
                            </Label>
                          )}
                          {item.media.length < 4 && !mediaUploading && (
                            <p style={{ fontSize: 'var(--font-size-caption-2-lg)', color: 'var(--text-faint)', margin: '5px 0 0' }}>
                              JPG, PNG, WEBP, MP4, WEBM ou MOV. Privilégie des fichiers légers pour un envoi rapide.
                            </p>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button onClick={saveEditedItem} disabled={savingEdit} loading={savingEdit} loadingText="Enregistrement…" style={primaryButton}>
                            Enregistrer
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={savingEdit}
                            onClick={() => {
                              setEditingItemId(null)
                              setEditingItem(null)
                            }}
                            style={secondaryButton}
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ) : (
                    <Card
                      key={item.id}
                      className="provider-catalog-item"
                      style={{ boxShadow: CARD_SHADOW, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}
                    >
                      {/* display:'contents' — l'opacité réduite d'une offre masquée ne
                          doit couvrir que la vignette/les infos, jamais les boutons
                          d'action (ex. « Publier » ne doit pas paraître désactivé). */}
                      <div style={{ display: 'contents', opacity: item.available === false ? 0.58 : 1 }}>
                        {item.media[0] ? (
                          item.media[0].type === 'video' ? (
                            <video src={item.media[0].url} preload="metadata" muted playsInline style={{ width: 80, height: 60, borderRadius: 10, objectFit: 'cover', background: 'var(--surface-2)', flexShrink: 0 }} />
                          ) : (
                            <NextImage src={item.media[0].url} alt="" width={86} height={64} style={{ borderRadius: 10, objectFit: 'cover', background: 'var(--surface-2)', flexShrink: 0 }} />
                          )
                        ) : (
                          <div style={{ width: 80, height: 60, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--border-strong)', flexShrink: 0 }}>
                            <CategoryIcon icon={category.icon} size={22} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: 'var(--font-size-headline-lg)', margin: 0, wordBreak: 'break-word' }}>{item.name}</h3>
                            <span style={{ padding: '3px 8px', borderRadius: 8, fontSize: 'var(--font-size-caption-2-lg)', fontWeight: 700, letterSpacing: '.04em', color: item.available === false ? 'var(--text-faint)' : C.teal, background: item.available === false ? 'var(--surface-2)' : 'var(--primary-a12)', border: `1px solid ${item.available === false ? 'var(--border-strong)' : 'var(--primary-a35)'}` }}>
                              {item.available === false ? 'Masquée' : 'Publiée'}
                            </span>
                          </div>
                          <p style={{ fontSize: 'var(--font-size-callout)', fontWeight: 800, color: C.gold, margin: '5px 0 0' }}>{Number(item.price) > 0 ? `${fmtMoney(Number(item.price), item.currency || catalogDefaultCurrency)}${item.unit ? ` / ${item.unit}` : ''}` : 'Tarif sur demande'}</p>
                          {item.description && <p style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-faint)', lineHeight: 1.45, margin: '5px 0 0' }}>{item.description}</p>}
                        </div>
                      </div>
                      <div className="provider-catalog-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <Button variant="secondary" disabled={togglingItemId === item.id} onClick={() => void toggleItem(item)} style={secondaryButton}>
                          {item.available === false ? 'Publier' : 'Masquer'}
                        </Button>
                        <Button variant="secondary" onClick={() => startEdit(item)} style={secondaryButton}>
                          Modifier
                        </Button>
                        <Button variant="danger" onClick={() => setConfirmRemoveItem(item)} style={{ ...secondaryButton, color: 'var(--danger)', border: '1px solid var(--danger-border)', background: 'var(--danger-fill)' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          </svg>
                          Supprimer
                        </Button>
                      </div>
                    </Card>
                  )
                )}
              </div>
            )}
          </section>
        )}

        {tab === 'avis' && (
          <section>
            {reportMsg && (
              <Card role="status" accent="var(--primary-a35)" style={{ boxShadow: CARD_SHADOW, padding: '12px 16px', marginBottom: 12 }}>
                <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--primary)', margin: 0 }}>{reportMsg}</p>
              </Card>
            )}

            {count === 0 && reviews.length === 0 ? (
              <Card style={{ boxShadow: CARD_SHADOW, padding: 24 }}>
                <h2 style={{ fontSize: 'var(--font-size-title-4)', margin: '0 0 7px' }}>Pas encore d&rsquo;avis</h2>
                <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-faint)', lineHeight: 1.55, margin: 0 }}>
                  Les clients qui ont travaillé avec toi pourront laisser une note et un commentaire sur ta page publique.
                </p>
              </Card>
            ) : (
              <>
                <Card style={{ boxShadow: CARD_SHADOW, padding: 18, marginBottom: 12, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center', minWidth: 100 }}>
                    <p style={{ fontSize: 'var(--font-size-title-5)', fontWeight: 800, letterSpacing: '-1.5px', color: 'var(--text)', margin: 0, lineHeight: 1 }}>
                      {String(avg).replace('.', ',')}
                      <span style={{ fontSize: 'var(--font-size-body-sm)', fontWeight: 600, color: 'var(--text-faint)' }}> / 5</span>
                    </p>
                    <div style={{ marginTop: 6 }}>
                      <Stars value={avg} size={15} />
                    </div>
                    <p style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-faint)', margin: '5px 0 0' }}>
                      {count} avis publié{count > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {([5, 4, 3, 2, 1] as const).map((n) => (
                      <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, color: 'var(--text-faint)', width: 10, textAlign: 'right' }}>{n}</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                          <div style={{ width: `${count ? Math.round((dist[n] / count) * 100) : 0}%`, height: '100%', borderRadius: 999, background: C.gold }} />
                        </div>
                        <span style={{ fontSize: 'var(--font-size-caption-2-lg)', color: 'var(--text-faint)', width: 20 }}>{dist[n]}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {reviews.map((review) => {
                    const hidden = review.status === 'hidden'
                    return (
                      <Card
                        key={review.id}
                        accent={hidden ? 'var(--danger-border)' : undefined}
                        style={{ boxShadow: CARD_SHADOW, padding: 18, opacity: hidden ? 0.75 : 1 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <Stars value={review.rating} size={14} />
                          <span style={{ fontSize: 'var(--font-size-body)', fontWeight: 700, color: 'var(--text)' }}>{review.authorName || 'Membre'}</span>
                          {review.verified && (
                            <span style={{ fontSize: 'var(--font-size-caption-2-lg)', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-a10)', border: '1px solid var(--primary-a35)', borderRadius: 999, padding: '2px 8px' }}>Avis vérifié</span>
                          )}
                          {hidden && (
                            <span style={{ fontSize: 'var(--font-size-caption-2-lg)', fontWeight: 700, color: 'var(--accent-text)', background: 'var(--danger-fill)', border: '1px solid var(--danger-border)', borderRadius: 999, padding: '2px 8px' }}>Masqué par la modération</span>
                          )}
                          <span style={{ fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-faint)' }}>{fmtDate(review.createdAt)}</span>
                        </div>
                        <p style={{ fontSize: 'var(--font-size-body)', color: 'var(--text-muted)', lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: '9px 0 0', wordBreak: 'break-word' }}>{review.comment}</p>

                        {review.reply?.text && replyFor !== review.id && (
                          <div style={{ marginTop: 11, padding: '10px 13px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--surface-2)' }}>
                            <p style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.gold, margin: '0 0 5px' }}>Ta réponse</p>
                            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0, wordBreak: 'break-word' }}>{review.reply.text}</p>
                          </div>
                        )}

                        {replyFor === review.id ? (
                          <div style={{ marginTop: 12 }}>
                            <Textarea
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value.slice(0, 1000))}
                              rows={3}
                              placeholder="Réponds publiquement à ce client — reste courtois et professionnel."
                              style={{ minHeight: 64, lineHeight: 1.5 }}
                            />
                            {replyErr && (
                              <p role="alert" style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--accent-text)', margin: '7px 0 0' }}>
                                {replyErr}
                              </p>
                            )}
                            <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setReplyFor(null)
                                  setReplyErr('')
                                }}
                                disabled={replyBusy}
                                style={secondaryButton}
                              >
                                Annuler
                              </Button>
                              <Button onClick={() => void handleReply(review)} disabled={replyBusy} loading={replyBusy} loadingText="Envoi…" style={primaryButton}>
                                Publier ma réponse
                              </Button>
                            </div>
                          </div>
                        ) : reportFor === review.id ? (
                          <div style={{ marginTop: 12 }}>
                            <p style={{ fontSize: 'var(--font-size-footnote)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 8px' }}>Motif du signalement</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                              {REVIEW_REPORT_REASONS.map((reason) => (
                                <Button key={reason.id} variant="ghost" onClick={() => setReportReason(reason.id)} style={{ padding: '8px 12px', borderRadius: 999, fontSize: 'var(--font-size-footnote)', fontWeight: 600, background: reportReason === reason.id ? 'var(--primary-a16)' : 'var(--surface-2)', border: reportReason === reason.id ? '1px solid var(--primary-a60)' : '1px solid var(--border)', color: reportReason === reason.id ? 'var(--accent-text)' : 'var(--text-muted)' }}>
                                  {reason.label}
                                </Button>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setReportFor(null)
                                  setReportReason('')
                                }}
                                disabled={reportBusy}
                                style={secondaryButton}
                              >
                                Annuler
                              </Button>
                              <Button onClick={() => void handleReport(review)} disabled={reportBusy || !reportReason} loading={reportBusy} loadingText="Envoi…" style={primaryButton}>
                                Signaler cet avis
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                            {review.status !== 'deleted' && (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setReplyFor(review.id)
                                  setReplyText(review.reply?.text || '')
                                  setReplyErr('')
                                }}
                                style={{ ...ghostButtonSmall, padding: 0, color: 'var(--primary)' }}
                              >
                                {review.reply?.text ? 'Modifier ma réponse' : 'Répondre'}
                              </Button>
                            )}
                            {!hidden && (
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setReportFor(review.id)
                                  setReportReason('')
                                }}
                                style={{ ...ghostButtonSmall, padding: 0, fontWeight: 600, color: 'var(--text-faint)' }}
                              >
                                Signaler
                              </Button>
                            )}
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        )}

        {tab === 'abonnement' && (
          <section>
            <SubscriptionPanel profile={profile} subscription={subscription} />
            <Card style={{ boxShadow: CARD_SHADOW, padding: 20, marginTop: 16 }}>
              <h2 style={{ margin: 0, fontSize: 'var(--font-size-title-4)', color: 'var(--text)' }}>Pays de facturation</h2>
              <p style={{ margin: '7px 0 14px', color: 'var(--text-muted)', fontSize: 'var(--font-size-body)', lineHeight: 1.55 }}>
                {billingRegion ? `${billingRegion.flag} ${billingRegion.name}` : 'Choisis ton pays pour afficher le bon tarif et le bon moyen de paiement.'}
              </p>
              {subscription.canChangeBilling ? (
                <Select
                  aria-label="Pays de facturation"
                  value={subscription.billingRegionId}
                  onChange={handleBillingRegionChange}
                  options={regions.map((region) => ({ value: region.id, label: `${region.flag} ${region.name}` }))}
                  style={{ maxWidth: 420 }}
                />
              ) : (
                <p style={{ margin: 0, color: 'var(--text-faint)', fontSize: 'var(--font-size-callout)' }}>Termine ou annule ton abonnement actuel pour changer de pays.</p>
              )}
            </Card>
          </section>
        )}
      </main>

      {crop && (
        <ImageCropperModal
          key={`${crop.field}-${crop.src.slice(-24)}`}
          src={crop.src}
          title={crop.field === 'photoUrl' ? 'Recadrer la photo' : 'Recadrer la couverture'}
          aspect={crop.field === 'photoUrl' ? 1 : 16 / 7}
          outputWidth={crop.field === 'photoUrl' ? 640 : 1280}
          circular={crop.field === 'photoUrl'}
          onCancel={() => setCrop(null)}
          onConfirm={async (dataUri) => { await uploadCroppedImage(crop.field, dataUri); setCrop(null) }}
        />
      )}

      {confirmRemoveItem && (
        <Modal onClose={() => setConfirmRemoveItem(null)} dismissible={!removingItem} zIndex={3200} hideClose ariaLabel="Supprimer l’offre">
                            <h3 style={{ fontSize: 'var(--font-size-title-4)', letterSpacing: '-.4px', margin: '0 0 8px', color: 'var(--text)' }}>Supprimer cette offre ?</h3>
            <p style={{ fontSize: 'var(--font-size-body)', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 18px' }}>
              « {confirmRemoveItem.name} » sera retirée de ton catalogue. Cette action est définitive.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" onClick={() => setConfirmRemoveItem(null)} disabled={removingItem} style={secondaryButton}>
                Annuler
              </Button>
              <Button variant="danger" onClick={() => void confirmDeleteItem()} disabled={removingItem} loading={removingItem} loadingText="Suppression…" style={{ ...primaryButton, background: 'var(--danger)', boxShadow: 'none' }}>
                Supprimer
              </Button>
            </div>
        </Modal>
      )}

      {confirmRemoveMedia && (
        <Modal onClose={() => !mediaUploading && setConfirmRemoveMedia(null)} dismissible={!mediaUploading} zIndex={3200} hideClose ariaLabel="Supprimer ce média">
          <h3 style={{ fontSize: 'var(--font-size-title-4)', letterSpacing: '-.4px', margin: '0 0 8px', color: 'var(--text)' }}>Supprimer ce média ?</h3>
          <p style={{ fontSize: 'var(--font-size-body)', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 18px' }}>
            Ce média sera retiré de ton offre immédiatement.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={() => setConfirmRemoveMedia(null)} disabled={mediaUploading} style={secondaryButton}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const target = confirmRemoveMedia
                if (!target) return
                void removeOfferMedia(target.itemId, target.mediaIndex)
                setConfirmRemoveMedia(null)
              }}
              disabled={mediaUploading}
              loading={mediaUploading}
              loadingText="Suppression…"
              style={{ ...primaryButton, background: 'var(--danger)', boxShadow: 'none' }}
            >
              Supprimer
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
