'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { regions } from '@/lib/shared/regions'
import { INTERNATIONAL_REGION_ID } from '@/lib/shared/locations'
import { SOCIAL_NETWORKS, type SocialNetworkKey } from '@/lib/shared/social'
import { PROVIDER_CATEGORIES, CATALOG_CATEGORIES, getPrimaryProviderType, getProviderCategory } from '@/lib/shared/providerCategories'
import { subPresentation, subPriceLabel, type SubWindow } from '@/lib/shared/providerSubscription'
import { fmtMoney } from '@/lib/shared/money'
import { REVIEW_REPORT_REASONS, computeReviewStats } from '@/lib/shared/reviews'
import { Stars } from '@/app/components/StarRating'

// Port de ProposerServicesPage.jsx + MyProviderReviews.jsx (#8 phase
// prestataire, tâche #91). Contrairement au legacy (facturation chargée
// après montage via useEffect, écran "Chargement..."), tout est déjà résolu
// côté serveur (voir page.tsx) — aucun état de chargement initial ici.
// Avatar/couverture : redimensionnement client via canvas (même
// simplification déjà appliquée dans StudioClient.tsx — pas de cropper
// interactif react-easy-crop comme le legacy).

const FONT = 'Inter, system-ui, sans-serif'
const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', pink: '#e05aaa' }

const card: React.CSSProperties = { background: '#0e0f16', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }
const input: React.CSSProperties = {
  width: '100%',
  minHeight: 46,
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: 11,
  border: '1px solid rgba(255,255,255,.12)',
  background: '#0b0c12',
  color: 'rgba(255,255,255,.92)',
  outline: 'none',
  fontFamily: FONT,
  fontSize: 14,
}
const primaryButton: React.CSSProperties = {
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '11px 18px',
  border: '1px solid rgba(255,255,255,.14)',
  borderRadius: 12,
  cursor: 'pointer',
  background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)',
  color: '#fff',
  fontFamily: FONT,
  fontSize: 13.5,
  fontWeight: 700,
  boxShadow: '0 6px 20px rgba(122,59,242,.35)',
}
const secondaryButton: React.CSSProperties = { ...primaryButton, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)', color: 'rgba(255,255,255,.9)', fontWeight: 600, boxShadow: 'none' }
const disabledButton: React.CSSProperties = { background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.35)', border: '1px solid rgba(255,255,255,.06)', cursor: 'not-allowed', boxShadow: 'none' }
const spinnerStyle: React.CSSProperties = { width: 14, height: 14, display: 'inline-block', borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', flexShrink: 0, animation: 'lib-spin 0.7s linear infinite' }
const ghostButtonSmall: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 11.5, fontWeight: 700 }

function Spinner() {
  return <span style={spinnerStyle} />
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,.7)', marginBottom: 7 }}>{label}</span>
      {children}
      {helper && <span style={{ display: 'block', fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.45)', lineHeight: 1.5, marginTop: 6 }}>{helper}</span>}
    </label>
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
  prestataireSubRail: string | null
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
  const [subscription, setSubscription] = useState(initialSubscription)
  const [tab, setTab] = useState<'profil' | 'catalogue' | 'avis'>('profil')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'avatar' | 'cover' | ''>('')
  const [renewing, setRenewing] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const [showItemForm, setShowItemForm] = useState(false)
  const [newItem, setNewItem] = useState<NewItemForm>(EMPTY_ITEM)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<NewItemForm | null>(null)
  const [mediaUploading, setMediaUploading] = useState(false)

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
  const catalogCategories = [...new Set(providerTypes.flatMap((t) => CATALOG_CATEGORIES[t] || CATALOG_CATEGORIES.autre || []))]
  const billingRegion = regions.find((r) => r.id === subscription.billingRegionId) || null

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
      const selected = current.prestataireTypes
      const prestataireTypes = selected.includes(categoryId)
        ? selected.filter((v) => v !== categoryId)
        : categoryId === 'autre'
          ? ['autre']
          : [...selected.filter((v) => v !== 'autre'), categoryId]
      return { ...current, prestataireTypes }
    })
  }

  function toggleZone(zoneId: string) {
    setProfile((current) => {
      const selected = current.zonesIntervention
      if (zoneId === INTERNATIONAL_REGION_ID) {
        return { ...current, zonesIntervention: selected.includes(zoneId) ? [current.regionId] : [INTERNATIONAL_REGION_ID] }
      }
      const withoutIntl = selected.filter((v) => v !== INTERNATIONAL_REGION_ID)
      const zonesIntervention = withoutIntl.includes(zoneId) ? withoutIntl.filter((v) => v !== zoneId) : [...withoutIntl, zoneId]
      return { ...current, zonesIntervention: zonesIntervention.length ? zonesIntervention : [current.regionId] }
    })
  }

  function handlePrimaryRegionChange(regionId: string) {
    setProfile((current) => {
      const zones = current.zonesIntervention.includes(INTERNATIONAL_REGION_ID)
        ? current.zonesIntervention
        : [...new Set([regionId, ...current.zonesIntervention.filter((v) => v !== current.regionId)])]
      return { ...current, regionId, zonesIntervention: zones.length ? zones : [regionId] }
    })
  }

  async function handleImage(field: 'photoUrl' | 'coverUrl', file: File | undefined) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return notify('Utilise une image JPG, PNG ou WEBP.')
    if (file.size > 5 * 1024 * 1024) return notify("L'image doit faire moins de 5 Mo.")

    setUploading(field === 'photoUrl' ? 'avatar' : 'cover')
    try {
      const dataUri = await resizeImageToDataUri(file, field === 'coverUrl' ? 1280 : 640)
      const res = await fetch('/api/providers/me/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: field === 'photoUrl' ? 'avatar' : 'cover', dataUri }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error()
      setProfile(data.profile)
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
      notify('Ta page a été enregistrée.')
    } catch {
      notify('Enregistrement impossible — vérifie ta connexion.')
    }
    setSaving(false)
  }

  // ── Abonnement ──
  async function handleStripeSubscribe() {
    if (renewing) return
    setRenewing(true)
    try {
      const res = await fetch('/api/subscriptions/checkout', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.alreadyActive) {
        setRenewing(false)
        notify('Ton abonnement est déjà actif.')
        return
      }
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      setRenewing(false)
      notify('Impossible de démarrer le paiement. Réessaie.')
    } catch {
      setRenewing(false)
      notify('Erreur réseau. Réessaie dans un instant.')
    }
  }

  async function handleFedapaySubscribe() {
    if (renewing) return
    setRenewing(true)
    try {
      const res = await fetch('/api/subscriptions/checkout/fedapay', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setRenewing(false)
        notify(typeof data.error === 'string' ? data.error : 'Impossible de démarrer le paiement. Réessaie.')
        return
      }
      window.location.href = data.url
    } catch {
      setRenewing(false)
      notify('Erreur réseau. Réessaie dans un instant.')
    }
  }

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
  }

  async function handleAddItem() {
    if (!newItem.name.trim()) return notify('Donne un nom à cette offre.')
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
      if (!res.ok || !data.ok) return notify('Impossible d’ajouter cette offre.')
      setProfile(data.profile)
      resetItemForm()
      notify('Offre ajoutée au catalogue.')
    } catch {
      notify('Impossible d’ajouter cette offre.')
    }
  }

  function startEdit(item: CatalogItemView) {
    setEditingItemId(item.id)
    setEditingItem({ name: item.name, price: item.price == null ? '' : String(item.price), currency: item.currency, unit: item.unit, category: item.category, description: item.description, media: item.media })
  }

  async function saveEditedItem() {
    if (!editingItemId || !editingItem?.name.trim()) return
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
      if (!res.ok || !data.ok) return notify('Impossible d’enregistrer cette offre.')
      setProfile(data.profile)
      setEditingItemId(null)
      setEditingItem(null)
      notify('Offre modifiée.')
    } catch {
      notify('Impossible d’enregistrer cette offre.')
    }
  }

  async function toggleItem(item: CatalogItemView) {
    const res = await fetch(`/api/providers/me/catalog/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: item.available === false }),
    })
    const data = await res.json()
    if (res.ok && data.ok) setProfile(data.profile)
  }

  async function removeItem(item: CatalogItemView) {
    if (!window.confirm(`Supprimer « ${item.name} » du catalogue ?`)) return
    const res = await fetch(`/api/providers/me/catalog/${item.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok && data.ok) {
      setProfile(data.profile)
      notify('Offre supprimée.')
    }
  }

  async function handleOfferMedia(itemId: string | null, file: File | undefined) {
    if (!file || !itemId) return
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) return notify('Utilise une photo JPG, PNG, WEBP ou une vidéo MP4, WEBM, MOV.')
    setMediaUploading(true)
    try {
      const dataUri = isVideo ? await readAsDataUri(file) : await resizeImageToDataUri(file, 1280)
      const res = await fetch(`/api/providers/me/catalog/${itemId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUri }),
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
    const res = await fetch(`/api/providers/me/catalog/${itemId}/media`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaIndex }),
    })
    const data = await res.json()
    if (res.ok && data.ok) setProfile(data.profile)
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

  const subWindow: SubWindow = { subscriptionStartedAt: null, subscriptionExpiresAt: profile.subscriptionExpiresAt ? new Date(profile.subscriptionExpiresAt) : null, gracePeriodEndsAt: profile.gracePeriodEndsAt ? new Date(profile.gracePeriodEndsAt) : null }

  return (
    <>
      <style>{`
        @keyframes lib-spin { to { transform: rotate(360deg) } }
        .provider-workspace{max-width:920px;margin:0 auto;padding:22px 16px 110px}
        .provider-workspace-header{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
        .provider-profile-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(260px,.85fr);gap:16px}
        .provider-fields-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        @media(max-width:720px){
          .provider-profile-grid,.provider-fields-two{grid-template-columns:1fr}
          .provider-workspace{padding-top:16px}
          .provider-catalog-item{flex-wrap:wrap}
          .provider-catalog-actions{width:100%;justify-content:flex-start!important}
        }
      `}</style>
      <main className="provider-workspace">
        <header className="provider-workspace-header">
          <div style={{ width: 52, height: 52, borderRadius: 15, display: 'grid', placeItems: 'center', background: `${category.color}16`, border: `1px solid ${category.color}44`, color: category.color }}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M4 20V8l8-4 8 4v12" />
              <path d="M8 20v-5h8v5" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontFamily: FONT, fontSize: 25, letterSpacing: '-.5px', margin: 0 }}>Mon espace prestataire</h1>
            <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.45)', margin: '4px 0 0' }}>{category.singular} · Ta page et ton catalogue</p>
          </div>
          <button onClick={() => router.push(`/providers/${encodeURIComponent(profile.userId)}`)} style={secondaryButton}>
            Voir ma page publique
          </button>
        </header>

        {subscription.currency === 'EUR' ? (
          (() => {
            const active = profile.subscriptionActive
            const color = active ? '#4ee8c8' : '#e05aaa'
            return (
              <section style={{ ...card, padding: 16, marginTop: 18, borderColor: `${color}44`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ width: 8, alignSelf: 'stretch', minHeight: 40, borderRadius: 8, background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h2 style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, margin: 0, color }}>{active ? 'Abonnement actif' : 'Abonnement inactif'}</h2>
                    <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color, background: `${color}1e`, border: `1px solid ${color}55`, borderRadius: 999, padding: '2px 8px' }}>{active ? 'Actif' : 'Inactif'}</span>
                  </div>
                  <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.55)', margin: '5px 0 0', lineHeight: 1.45 }}>
                    {active ? 'Ton profil est visible. Renouvellement automatique chaque mois par carte bancaire.' : "Ton profil n'est pas visible publiquement. Active ton abonnement pour le mettre en ligne."}
                  </p>
                  <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.38)', margin: '4px 0 0' }}>9,99 € / mois · carte bancaire (Stripe) · renouvellement automatique</p>
                </div>
                {!active && (
                  <button onClick={handleStripeSubscribe} disabled={renewing} style={{ ...primaryButton, ...(renewing ? disabledButton : null), whiteSpace: 'nowrap' }}>
                    {renewing ? (
                      <>
                        <Spinner /> Redirection…
                      </>
                    ) : (
                      'Activer mon abonnement'
                    )}
                  </button>
                )}
              </section>
            )
          })()
        ) : (
          (() => {
            const p = subPresentation(subWindow)
            const dim = p.tone === 'off'
            return (
              <section style={{ ...card, padding: 16, marginTop: 18, borderColor: `${p.color}44`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ width: 8, alignSelf: 'stretch', minHeight: 40, borderRadius: 8, background: p.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h2 style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, margin: 0, color: dim ? 'rgba(255,255,255,.9)' : p.color }}>{p.title}</h2>
                    {p.status !== 'none' && (
                      <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: p.color, background: `${p.color}1e`, border: `1px solid ${p.color}55`, borderRadius: 999, padding: '2px 8px' }}>
                        {p.status === 'active' ? 'Actif' : p.status === 'expiring_soon' ? 'Expire bientôt' : p.status === 'grace' ? 'Grâce' : 'Expiré'}
                      </span>
                    )}
                  </div>
                  <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.55)', margin: '5px 0 0', lineHeight: 1.45 }}>{p.message}</p>
                  <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.38)', margin: '4px 0 0' }}>{subPriceLabel()} · Mobile Money (FedaPay) · renouvellement manuel</p>
                </div>
                <button onClick={handleFedapaySubscribe} disabled={renewing} style={{ ...primaryButton, ...(renewing ? disabledButton : null), whiteSpace: 'nowrap' }}>
                  {renewing ? (
                    <>
                      <Spinner /> Redirection…
                    </>
                  ) : (
                    p.cta
                  )}
                </button>
              </section>
            )
          })()
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.5)' }}>
            Pays de facturation : {billingRegion ? `${billingRegion.flag} ${billingRegion.name}` : 'à renseigner'}
          </span>
          {subscription.canChangeBilling ? (
            <select value={subscription.billingRegionId} onChange={(e) => handleBillingRegionChange(e.target.value)} style={{ ...input, minHeight: 32, width: 'auto', padding: '4px 10px', fontSize: 12 }}>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.flag} {r.name}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.35)' }}>Termine ou annule ton abonnement pour en changer.</span>
          )}
        </div>

        {message && (
          <div role="status" style={{ ...card, padding: '12px 14px', marginTop: 12, borderColor: 'rgba(200,169,110,.35)' }}>
            <p style={{ fontFamily: FONT, fontSize: 12.5, color: '#fff', margin: 0 }}>{message}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, margin: '22px 0 16px', padding: 4, borderRadius: 13, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
          {[
            { id: 'profil' as const, label: 'Ma page publique' },
            { id: 'catalogue' as const, label: `Catalogue (${profile.catalog.length})` },
            { id: 'avis' as const, label: 'Mes avis' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{ flex: 1, minHeight: 42, borderRadius: 10, border: '1px solid transparent', background: tab === item.id ? 'rgba(255,255,255,.10)' : 'transparent', color: tab === item.id ? '#fff' : 'rgba(255,255,255,.5)', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700 }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'profil' && (
          <div className="provider-profile-grid">
            <section style={{ ...card, padding: 18 }}>
              <h2 style={{ fontFamily: FONT, fontSize: 20, margin: '0 0 5px' }}>Informations publiques</h2>
              <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.42)', lineHeight: 1.5, margin: '0 0 18px' }}>Ce sont les informations que les clients et organisateurs verront.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Nom de la page">
                  <input style={input} value={profile.name} onChange={(e) => update({ name: e.target.value })} placeholder="Nom commercial ou nom de scène" />
                </Field>
                <Field label="Accroche professionnelle" helper="Une phrase courte visible en haut de ta page.">
                  <input style={input} maxLength={120} value={profile.headline} onChange={(e) => update({ headline: e.target.value })} placeholder="Ex. DJ afro-house pour soirées privées et clubs" />
                </Field>
                <Field label="Mes activités" helper="Tu peux en choisir plusieurs. La première sélectionnée est la catégorie principale.">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {PROVIDER_CATEGORIES.map((item) => {
                      const selected = profile.prestataireTypes.includes(item.id)
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleProviderCategory(item.id)}
                          style={{ padding: '8px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: selected ? item.color : 'rgba(255,255,255,.62)', background: selected ? `${item.color}18` : 'rgba(255,255,255,.04)', border: `1px solid ${selected ? `${item.color}88` : 'rgba(255,255,255,.12)'}` }}
                        >
                          {item.singular}
                        </button>
                      )
                    })}
                  </div>
                </Field>
                <Field label="Présentation">
                  <textarea style={{ ...input, minHeight: 125, resize: 'vertical' }} value={profile.description} onChange={(e) => update({ description: e.target.value })} placeholder="Présente ton activité, ton style et ce qui te différencie." />
                </Field>
                <div className="provider-fields-two">
                  <Field label="Ville de base">
                    <input style={input} value={profile.city} onChange={(e) => update({ city: e.target.value })} placeholder="Paris, Lomé, Cotonou…" />
                  </Field>
                  <Field label="Site principal">
                    <input style={input} value={profile.socialLinks.website || profile.website || ''} onChange={(e) => update({ website: e.target.value, socialLinks: { ...profile.socialLinks, website: e.target.value } })} placeholder="https://tonsite.com" />
                  </Field>
                </div>
                <Field label="Pays de base" helper="Affiché avec ta ville sur ta page publique. Il ne modifie jamais ta facturation.">
                  <select style={input} value={profile.regionId} onChange={(e) => handlePrimaryRegionChange(e.target.value)}>
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.flag} {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Pays / régions d'intervention" helper="Sélectionne tous les pays où tu peux te déplacer ou fournir ta prestation.">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {[{ id: INTERNATIONAL_REGION_ID, name: 'International', flag: '🌍' }, ...regions].map((r) => {
                      const selected = profile.zonesIntervention.includes(r.id)
                      return (
                        <button key={r.id} type="button" onClick={() => toggleZone(r.id)} style={{ padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 12, color: selected ? C.teal : 'rgba(255,255,255,.62)', background: selected ? 'rgba(78,232,200,.1)' : 'rgba(255,255,255,.04)', border: `1px solid ${selected ? 'rgba(78,232,200,.55)' : 'rgba(255,255,255,.12)'}` }}>
                          {r.flag} {r.name}
                        </button>
                      )
                    })}
                  </div>
                </Field>
                <Field label="Réseaux sociaux" helper="Colle un lien complet ou juste ton @pseudo.">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
                    {SOCIAL_NETWORKS.filter((n) => n.key !== 'website').map((network) => (
                      <label key={network.key} style={{ display: 'grid', gap: 5 }}>
                        <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,.48)' }}>{network.label}</span>
                        <input style={input} value={profile.socialLinks[network.key] || ''} onChange={(e) => update({ socialLinks: { ...profile.socialLinks, [network.key]: e.target.value } })} placeholder={network.placeholder} />
                      </label>
                    ))}
                  </div>
                </Field>
                <button onClick={handleSaveProfile} disabled={saving || Boolean(uploading)} style={{ ...primaryButton, alignSelf: 'flex-start', ...(saving || uploading ? disabledButton : null) }}>
                  {uploading ? (
                    <>
                      <Spinner /> Envoi de l&rsquo;image…
                    </>
                  ) : saving ? (
                    'Enregistrement…'
                  ) : (
                    'Enregistrer ma page'
                  )}
                </button>
              </div>
            </section>

            <aside style={{ ...card, overflow: 'hidden', alignSelf: 'start' }}>
              <button type="button" onClick={() => coverInputRef.current?.click()} style={{ width: '100%', height: 150, position: 'relative', display: 'block', padding: 0, border: 0, cursor: 'pointer', background: profile.coverUrl ? `url(${profile.coverUrl}) center/cover` : `linear-gradient(135deg,${category.color}55,rgba(8,10,20,.95))` }} aria-label="Modifier la photo de couverture">
                <span style={{ position: 'absolute', right: 10, top: 10, padding: '6px 9px', borderRadius: 8, background: 'rgba(4,4,11,.82)', color: '#fff', fontFamily: FONT, fontSize: 11, fontWeight: 700 }}>Modifier la couverture</span>
              </button>
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
                <button type="button" onClick={() => avatarInputRef.current?.click()} style={{ width: 78, height: 78, borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center', padding: 0, border: '4px solid #090b14', background: category.color, color: C.obsidian, cursor: 'pointer', fontFamily: FONT, fontSize: 28, fontWeight: 900 }} aria-label="Modifier la photo de profil">
                  {profile.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    profile.name.charAt(0).toUpperCase() || '?'
                  )}
                </button>
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
                <h3 style={{ fontFamily: FONT, fontSize: 20, margin: '11px 0 0' }}>{profile.name || 'Nom de ta page'}</h3>
                {profile.headline && <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.82)', lineHeight: 1.4, margin: '7px 0 0' }}>{profile.headline}</p>}
                <p style={{ fontFamily: FONT, fontSize: 12, fontWeight: 800, color: category.color, margin: '5px 0 0' }}>{providerTypes.map((v) => getProviderCategory(v).singular).join(' · ')}</p>
                <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.5)', lineHeight: 1.55, margin: '12px 0 0' }}>{profile.description || 'Ta présentation apparaîtra ici.'}</p>
              </div>
            </aside>
          </div>
        )}

        {tab === 'catalogue' && (
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 13 }}>
              <div>
                <h2 style={{ fontFamily: FONT, fontSize: 21, margin: 0 }}>Mon catalogue</h2>
                <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.42)', margin: '4px 0 0' }}>Les tarifs sont indicatifs. Le client te contacte ensuite pour tout organiser avec toi.</p>
              </div>
              {!showItemForm && (
                <button onClick={() => setShowItemForm(true)} style={primaryButton}>
                  Ajouter une offre
                </button>
              )}
            </div>

            {showItemForm && (
              <div style={{ ...card, padding: 18, marginBottom: 14 }}>
                <h3 style={{ fontFamily: FONT, fontSize: 18, margin: '0 0 14px' }}>Nouvelle offre</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Field label="Nom de l'offre">
                    <input style={input} value={newItem.name} onChange={(e) => setNewItem((c) => ({ ...c, name: e.target.value }))} placeholder="DJ set 3 heures, location de salle…" />
                  </Field>
                  <div className="provider-fields-two">
                    <Field label="Tarif indicatif" helper="Laisse vide pour « Tarif sur demande ».">
                      <input type="number" min="0" style={input} value={newItem.price} onChange={(e) => setNewItem((c) => ({ ...c, price: e.target.value }))} placeholder="Optionnel" />
                    </Field>
                    <Field label="Devise">
                      <select style={input} value={newItem.currency || catalogDefaultCurrency} onChange={(e) => setNewItem((c) => ({ ...c, currency: e.target.value }))}>
                        <option value="EUR">Euro (€)</option>
                        <option value="XOF">Franc CFA (FCFA)</option>
                      </select>
                    </Field>
                    <Field label="Unité">
                      <select style={input} value={newItem.unit} onChange={(e) => setNewItem((c) => ({ ...c, unit: e.target.value }))}>
                        <option value="">Aucune</option>
                        {['heure', 'soirée', 'jour', 'personne', 'unité', 'lot', 'forfait'].map((v) => (
                          <option key={v} value={v}>
                            par {v}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Catégorie">
                    <select style={input} value={newItem.category} onChange={(e) => setNewItem((c) => ({ ...c, category: e.target.value }))}>
                      <option value="">Sans catégorie</option>
                      {catalogCategories.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Description">
                    <textarea style={{ ...input, minHeight: 96, resize: 'vertical' }} value={newItem.description} onChange={(e) => setNewItem((c) => ({ ...c, description: e.target.value }))} placeholder="Ce qui est inclus, durée, conditions principales…" />
                  </Field>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={handleAddItem} style={primaryButton}>
                      Publier dans le catalogue
                    </button>
                    <button onClick={resetItemForm} style={secondaryButton}>
                      Annuler
                    </button>
                  </div>
                  <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.4)', margin: 0 }}>Tu pourras ajouter des photos/vidéos une fois l&rsquo;offre créée.</p>
                </div>
              </div>
            )}

            {profile.catalog.length === 0 && !showItemForm ? (
              <div style={{ ...card, padding: '42px 22px', textAlign: 'center' }}>
                <h2 style={{ fontFamily: FONT, fontSize: 21, margin: 0 }}>Ton catalogue est vide</h2>
                <p style={{ maxWidth: 410, margin: '9px auto 17px', fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.5)', lineHeight: 1.6 }}>Ajoute les services, formules ou équipements que les visiteurs pourront découvrir sur ta page.</p>
                <button onClick={() => setShowItemForm(true)} style={primaryButton}>
                  Ajouter ma première offre
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {profile.catalog.map((item) =>
                  editingItemId === item.id && editingItem ? (
                    <div key={item.id} style={{ ...card, padding: 16 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <input style={input} value={editingItem.name} onChange={(e) => setEditingItem((c) => (c ? { ...c, name: e.target.value } : c))} />
                        <div className="provider-fields-two">
                          <input type="number" min="0" style={input} value={editingItem.price} onChange={(e) => setEditingItem((c) => (c ? { ...c, price: e.target.value } : c))} placeholder="Tarif sur demande" />
                          <select style={input} value={editingItem.currency} onChange={(e) => setEditingItem((c) => (c ? { ...c, currency: e.target.value } : c))} aria-label="Devise du tarif">
                            <option value="EUR">€</option>
                            <option value="XOF">FCFA</option>
                          </select>
                          <select style={input} value={editingItem.unit} onChange={(e) => setEditingItem((c) => (c ? { ...c, unit: e.target.value } : c))}>
                            <option value="">Aucune unité</option>
                            {['heure', 'soirée', 'jour', 'personne', 'unité', 'lot', 'forfait'].map((v) => (
                              <option key={v} value={v}>
                                par {v}
                              </option>
                            ))}
                          </select>
                        </div>
                        <textarea style={{ ...input, minHeight: 86, resize: 'vertical' }} value={editingItem.description} onChange={(e) => setEditingItem((c) => (c ? { ...c, description: e.target.value } : c))} />

                        <div>
                          <span style={{ display: 'block', fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,.7)', marginBottom: 7 }}>Photos / vidéos</span>
                          {item.media.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginBottom: 8 }}>
                              {item.media.map((m, i) => (
                                <div key={`${m.url}-${i}`} style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: '#05060b' }}>
                                  {m.type === 'video' ? (
                                    <video src={m.url} controls preload="metadata" style={{ display: 'block', width: '100%', aspectRatio: '16 / 10', objectFit: 'cover' }} />
                                  ) : (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={m.url} alt="" style={{ display: 'block', width: '100%', aspectRatio: '16 / 10', objectFit: 'cover' }} />
                                  )}
                                  <button type="button" onClick={() => void removeOfferMedia(item.id, i)} disabled={mediaUploading} style={{ position: 'absolute', top: 7, right: 7, width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(4,4,11,.82)', color: '#fff', cursor: 'pointer', fontSize: 18 }}>
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {item.media.length < 4 && (
                            <label style={{ display: 'block', width: '100%', minHeight: 64, borderRadius: 13, border: '1px dashed rgba(255,255,255,.18)', background: 'rgba(255,255,255,.04)', color: mediaUploading ? C.gold : 'rgba(255,255,255,.55)', cursor: mediaUploading ? 'wait' : 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, textAlign: 'center', lineHeight: '64px' }}>
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
                            </label>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={saveEditedItem} style={primaryButton}>
                            Enregistrer
                          </button>
                          <button
                            onClick={() => {
                              setEditingItemId(null)
                              setEditingItem(null)
                            }}
                            style={secondaryButton}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <article key={item.id} className="provider-catalog-item" style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', gap: 14, opacity: item.available === false ? 0.58 : 1 }}>
                      {item.media[0] &&
                        (item.media[0].type === 'video' ? (
                          <video src={item.media[0].url} preload="metadata" muted playsInline style={{ width: 96, height: 74, borderRadius: 10, objectFit: 'cover', background: '#05060b', flexShrink: 0 }} />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.media[0].url} alt="" style={{ width: 96, height: 74, borderRadius: 10, objectFit: 'cover', background: '#05060b', flexShrink: 0 }} />
                        ))}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <h3 style={{ fontFamily: FONT, fontSize: 17, margin: 0 }}>{item.name}</h3>
                          <span style={{ padding: '3px 9px', borderRadius: 8, fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: item.available === false ? 'rgba(255,255,255,.5)' : C.teal, background: item.available === false ? 'rgba(255,255,255,.07)' : 'rgba(78,232,200,.12)', border: `1px solid ${item.available === false ? 'rgba(255,255,255,.14)' : 'rgba(78,232,200,.35)'}` }}>
                            {item.available === false ? 'Masquée' : 'Publiée'}
                          </span>
                        </div>
                        <p style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 800, color: C.gold, margin: '6px 0 0' }}>{Number(item.price) > 0 ? `${fmtMoney(Number(item.price), item.currency || catalogDefaultCurrency)}${item.unit ? ` / ${item.unit}` : ''}` : 'Tarif sur demande'}</p>
                        {item.description && <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.46)', lineHeight: 1.5, margin: '6px 0 0' }}>{item.description}</p>}
                      </div>
                      <div className="provider-catalog-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button onClick={() => void toggleItem(item)} style={secondaryButton}>
                          {item.available === false ? 'Publier' : 'Masquer'}
                        </button>
                        <button onClick={() => startEdit(item)} style={secondaryButton}>
                          Modifier
                        </button>
                        <button onClick={() => void removeItem(item)} style={{ ...secondaryButton, color: '#ff9ed2', border: '1px solid rgba(224,90,170,.55)', background: 'rgba(224,90,170,.14)' }}>
                          Supprimer
                        </button>
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
          </section>
        )}

        {tab === 'avis' && (
          <section>
            {reportMsg && (
              <div role="status" style={{ ...card, padding: '12px 16px', marginBottom: 12, borderColor: 'rgba(78,232,200,.35)' }}>
                <p style={{ fontFamily: FONT, fontSize: 12.5, color: '#4ee8c8', margin: 0 }}>{reportMsg}</p>
              </div>
            )}

            {count === 0 && reviews.length === 0 ? (
              <div style={{ ...card, padding: 28 }}>
                <h2 style={{ fontFamily: FONT, fontSize: 20, margin: '0 0 8px' }}>Pas encore d&rsquo;avis</h2>
                <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,.55)', lineHeight: 1.65, margin: 0 }}>
                  Les clients qui ont travaillé avec toi pourront laisser une note et un commentaire sur ta page publique.
                </p>
              </div>
            ) : (
              <>
                <div style={{ ...card, padding: 20, marginBottom: 14, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center', minWidth: 100 }}>
                    <p style={{ fontFamily: FONT, fontSize: 36, fontWeight: 800, letterSpacing: '-1.5px', color: '#fff', margin: 0, lineHeight: 1 }}>
                      {String(avg).replace('.', ',')}
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,.4)' }}> / 5</span>
                    </p>
                    <div style={{ marginTop: 6 }}>
                      <Stars value={avg} size={15} />
                    </div>
                    <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.45)', margin: '5px 0 0' }}>
                      {count} avis publié{count > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {([5, 4, 3, 2, 1] as const).map((n) => (
                      <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.55)', width: 10, textAlign: 'right' }}>{n}</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                          <div style={{ width: `${count ? Math.round((dist[n] / count) * 100) : 0}%`, height: '100%', borderRadius: 999, background: C.gold }} />
                        </div>
                        <span style={{ fontFamily: FONT, fontSize: 10.5, color: 'rgba(255,255,255,.4)', width: 20 }}>{dist[n]}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {reviews.map((review) => {
                    const hidden = review.status === 'hidden'
                    return (
                      <article key={review.id} style={{ ...card, padding: 18, ...(hidden ? { opacity: 0.75, borderColor: 'rgba(224,90,170,.3)' } : null) }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <Stars value={review.rating} size={14} />
                          <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{review.authorName || 'Membre'}</span>
                          {review.verified && (
                            <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: '#4ee8c8', background: 'rgba(78,232,200,.10)', border: '1px solid rgba(78,232,200,.35)', borderRadius: 999, padding: '2px 8px' }}>Avis vérifié</span>
                          )}
                          {hidden && (
                            <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: '#ff8fb2', background: 'rgba(194,52,127,.12)', border: '1px solid rgba(194,52,127,.4)', borderRadius: 999, padding: '2px 8px' }}>Masqué par la modération</span>
                          )}
                          <span style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.38)' }}>{fmtDate(review.createdAt)}</span>
                        </div>
                        <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,.72)', lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: '9px 0 0', wordBreak: 'break-word' }}>{review.comment}</p>

                        {review.reply?.text && replyFor !== review.id && (
                          <div style={{ marginTop: 11, padding: '10px 13px', borderRadius: 12, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)' }}>
                            <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.gold, margin: '0 0 5px' }}>Ta réponse</p>
                            <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.66)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0, wordBreak: 'break-word' }}>{review.reply.text}</p>
                          </div>
                        )}

                        {replyFor === review.id ? (
                          <div style={{ marginTop: 12 }}>
                            <textarea
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value.slice(0, 1000))}
                              rows={3}
                              placeholder="Réponds publiquement à ce client — reste courtois et professionnel."
                              style={{ ...input, minHeight: 76, resize: 'vertical', lineHeight: 1.5 }}
                            />
                            {replyErr && (
                              <p role="alert" style={{ fontFamily: FONT, fontSize: 12, color: '#ff8fb2', margin: '7px 0 0' }}>
                                {replyErr}
                              </p>
                            )}
                            <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                              <button
                                onClick={() => {
                                  setReplyFor(null)
                                  setReplyErr('')
                                }}
                                disabled={replyBusy}
                                style={secondaryButton}
                              >
                                Annuler
                              </button>
                              <button onClick={() => void handleReply(review)} disabled={replyBusy} style={{ ...primaryButton, ...(replyBusy ? disabledButton : null) }}>
                                {replyBusy ? (
                                  <>
                                    <Spinner /> Envoi…
                                  </>
                                ) : (
                                  'Publier ma réponse'
                                )}
                              </button>
                            </div>
                          </div>
                        ) : reportFor === review.id ? (
                          <div style={{ marginTop: 12 }}>
                            <p style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', margin: '0 0 8px' }}>Motif du signalement</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                              {REVIEW_REPORT_REASONS.map((reason) => (
                                <button key={reason.id} type="button" onClick={() => setReportReason(reason.id)} style={{ padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: 600, background: reportReason === reason.id ? 'rgba(143,86,255,.16)' : 'rgba(255,255,255,.05)', border: reportReason === reason.id ? '1px solid rgba(143,86,255,.6)' : '1px solid rgba(255,255,255,.10)', color: reportReason === reason.id ? '#cdb4ff' : 'rgba(255,255,255,.7)' }}>
                                  {reason.label}
                                </button>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={() => {
                                  setReportFor(null)
                                  setReportReason('')
                                }}
                                disabled={reportBusy}
                                style={secondaryButton}
                              >
                                Annuler
                              </button>
                              <button onClick={() => void handleReport(review)} disabled={reportBusy || !reportReason} style={{ ...primaryButton, ...(reportBusy || !reportReason ? disabledButton : null) }}>
                                {reportBusy ? (
                                  <>
                                    <Spinner /> Envoi…
                                  </>
                                ) : (
                                  'Signaler cet avis'
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                            {review.status !== 'deleted' && (
                              <button
                                onClick={() => {
                                  setReplyFor(review.id)
                                  setReplyText(review.reply?.text || '')
                                  setReplyErr('')
                                }}
                                style={{ ...ghostButtonSmall, color: '#4ee8c8' }}
                              >
                                {review.reply?.text ? 'Modifier ma réponse' : 'Répondre'}
                              </button>
                            )}
                            {!hidden && (
                              <button
                                onClick={() => {
                                  setReportFor(review.id)
                                  setReportReason('')
                                }}
                                style={{ ...ghostButtonSmall, fontWeight: 600, color: 'rgba(255,255,255,.38)' }}
                              >
                                Signaler
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </>
  )
}
