'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import NextImage from 'next/image'
import Link from 'next/link'
import { useQueryParamState } from '@/lib/client/useQueryParamState'
import { Check, Smartphone, CreditCard, ChevronLeft, ChevronRight } from 'lucide-react'
import { SOCIAL_NETWORKS, type SocialNetworkKey } from '@/lib/shared/social'
import { regions } from '@/lib/shared/regions'
import { normalizeRegionIds, getRegionName } from '@/lib/shared/locations'
import { MOMO_REGIONS } from '@/lib/shared/payoutMomoValidation'
import { fmtMoney } from '@/lib/shared/money'
import ImageCropperModal from '@/app/components/ui/ImageCropperModal'
import { uploadPublicMedia } from '@/lib/client/publicMediaUpload'
import type { PublicMediaUploadReference } from '@/lib/shared/publicMediaUploads'
import { Button, Card, Input, Textarea, Checkbox, Radio, Select, Label, Modal } from '@/app/components/ui'

// Port de OrganizerPublicStudio.jsx + PayoutPanel.jsx + MomoPayoutManager.jsx
// (#7 phase organisateur, tâche #81). Avatar et bannière passent par le
// recadrage partagé avant l'upload ; la galerie conserve son format libre.

export interface OrganizerProfileView {
  publicName: string
  slug: string
  city: string
  country: string
  regionId: string
  shortDescription: string
  socialLinks: Record<SocialNetworkKey, string>
  zonesIntervention: string[]
  avatarUrl: string | null
  bannerUrl: string | null
  status: string
  isVerified: boolean
  followersCount: number
  totalEventsCount: number
  viewsCount: number
  media: {
    id: string
    url: string
    type: string
    title: string
    description: string
    eventId: string | null
    visibility: string
    displayOrder: number
  }[]
}

export interface PayoutStatusView {
  mode: 'connect' | 'manual' | 'none'
  connected: boolean
  chargesEnabled: boolean
  country: string | null
  amountDueCents: number
  amountDueXOF: number
}

const ZONE_OPTIONS = [{ id: 'international', name: 'International', flag: '🌍' }, ...regions]
const subscribeToNothing = () => () => {}

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

export default function StudioClient({
  initialProfile,
  initialPayoutStatus,
  initialMomos,
}: {
  initialProfile: OrganizerProfileView
  initialPayoutStatus: PayoutStatusView
  initialMomos: Record<string, string>
}) {
  const [profile, setProfile] = useState(initialProfile)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'avatar' | 'banner' | 'gallery' | ''>('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [events, setEvents] = useState<{ id: string; name: string }[]>([])
  const [linkCopied, setLinkCopied] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null)
  const publicOrigin = useSyncExternalStore(subscribeToNothing, () => window.location.origin, () => '')
  const [crop, setCrop] = useState<{ kind: 'avatar' | 'banner'; src: string } | null>(null)
  // Page publique (profil, galerie) et Encaissement (Stripe Connect + Mobile
  // Money, PayoutSection ci-dessous) sont deux métiers distincts qui
  // partageaient une seule page à défilement — d'où le libellé de sidebar
  // "Ma page & paiements" qui devait déjà nommer les deux. Séparés en onglets
  // reflétés dans l'URL (?tab=paiements) — toute page/onglet du site doit
  // rester partageable par lien direct, pas seulement un état React.
  const [tab, setTab] = useQueryParamState<'page' | 'paiements'>('tab', 'page')

  // #encaissement (ancien lien de compatibilité, avant le passage en
  // ?tab=paiements) : redirige une seule fois vers le nouveau paramètre.
  // Même chose pour ?connect=done/refresh — Stripe Connect ramène toujours
  // l'organisateur sur /organizer-studio nu (lib/server/organizerPayouts.ts
  // ne peut pas transmettre l'onglet cible sans élargir la liste blanche de
  // chemins de retour, une surface de sécurité qu'on préfère ne pas toucher
  // ici) : forcer l'onglet Paiements côté client si ce paramètre est présent,
  // sinon l'organisateur revient sur la page publique sans jamais voir le
  // statut de connexion qui vient d'être établi.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#encaissement') setTab('paiements')
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('connect')) setTab('paiements')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetch('/api/organizer-events')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setEvents(data.events.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })))
      })
      .catch(() => {})
  }, [])

  const slug = profile.slug
  const publicPath = `/organizers/${slug}`
  const publicUrl = publicOrigin ? `${publicOrigin}${publicPath}` : publicPath
  const zones = normalizeRegionIds(profile.zonesIntervention.length ? profile.zonesIntervention : [profile.regionId]).filter(Boolean)

  function update(patch: Partial<OrganizerProfileView>) {
    setProfile((current) => ({ ...current, ...patch }))
  }

  function toggleZone(id: string) {
    const has = zones.includes(id)
    let next: string[]
    if (id === 'international') next = has ? [] : ['international']
    else {
      const withoutIntl = zones.filter((z) => z !== 'international')
      next = has ? withoutIntl.filter((z) => z !== id) : [...withoutIntl, id]
    }
    update({ zonesIntervention: next })
  }

  async function save() {
    if (!profile.publicName.trim()) {
      setMessage({ type: 'error', text: 'Le nom public est obligatoire.' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/organizers/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicName: profile.publicName,
          slug: profile.slug,
          city: profile.city,
          zonesIntervention: zones,
          shortDescription: profile.shortDescription,
          socialLinks: profile.socialLinks,
          status: profile.status === 'public' ? 'public' : 'draft',
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        const errors: Record<string, string> = {
          name_required: 'Le nom public est obligatoire.',
          slug_taken: 'Cette adresse personnalisée est déjà prise. Choisis-en une autre.',
        }
        setMessage({ type: 'error', text: errors[data.error] || data.error || 'Enregistrement impossible.' })
        setSaving(false)
        return
      }
      setProfile(data.profile)
      setMessage({ type: 'success', text: 'Ta page publique a bien été enregistrée.' })
    } catch {
      setMessage({ type: 'error', text: 'Enregistrement impossible — vérifie ta connexion.' })
    }
    setSaving(false)
  }

  async function uploadData(
    kind: 'avatar' | 'banner' | 'gallery',
    media: { dataUri: string } | { upload: PublicMediaUploadReference }
  ) {
    setUploading(kind)
    setMessage(null)
    try {
      const res = await fetch('/api/organizers/me/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ...media }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'upload_failed')
      setProfile(data.profile)
      setMessage({ type: 'success', text: kind === 'gallery' ? 'Média ajouté et enregistré sur ta page.' : 'Image enregistrée sur ta page.' })
    } catch {
      setMessage({ type: 'error', text: 'Envoi impossible — réessaie.' })
    }
    setUploading('')
  }

  async function upload(kind: 'gallery', file: File) {
    const isVideo = file.type.startsWith('video/')
    if (isVideo) {
      if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
        return setMessage({ type: 'error', text: 'Utilise une vidéo MP4, WEBM ou MOV.' })
      }
      if (file.size > 30_000_000) return setMessage({ type: 'error', text: 'La vidéo doit faire 30 Mo maximum.' })
      await uploadData(kind, { upload: await uploadPublicMedia(file, 'organizer-gallery') })
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return setMessage({ type: 'error', text: 'Utilise une image JPG, PNG ou WEBP.' })
    }
    if (file.size > 10_000_000) return setMessage({ type: 'error', text: "L'image doit faire 10 Mo maximum." })
    await uploadData(kind, { dataUri: await resizeImageToDataUri(file) })
  }

  async function prepareCrop(kind: 'avatar' | 'banner', file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setMessage({ type: 'error', text: 'Utilise une image JPG, PNG ou WEBP.' })
    if (file.size > 5 * 1024 * 1024) return setMessage({ type: 'error', text: "L'image doit faire moins de 5 Mo." })
    setCrop({ kind, src: await readAsDataUri(file) })
  }

  async function updateMedia(id: string, patch: { title?: string; eventId?: string | null; visibility?: 'public' | 'hidden' }) {
    const res = await fetch(`/api/organizers/me/media/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    const data = await res.json()
    if (res.ok && data.ok) setProfile(data.profile)
  }

  async function removeMedia(id: string) {
    const res = await fetch(`/api/organizers/me/media/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok && data.ok) setProfile(data.profile)
  }

  async function moveMedia(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= profile.media.length) return
    const next = [...profile.media]
    ;[next[index], next[target]] = [next[target], next[index]]
    const res = await fetch('/api/organizers/me/media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: next.map((m) => m.id) }) })
    const data = await res.json()
    if (res.ok && data.ok) setProfile(data.profile)
  }

  const regionCurrency = regions.find((r) => r.id === profile.regionId)?.currency ?? 'EUR'

  return (
    <>
      <style>{`
        .studio-profile-grid { display: grid; grid-template-columns: minmax(0, 1.38fr) minmax(240px, 0.62fr); gap: 10px; margin-bottom: 10px; }
        @media (max-width: 720px) {
          .studio-profile-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <main className="lb-dashboard-page">
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, color: 'var(--text)', fontSize: 'clamp(22px,2.6vw,30px)', fontWeight: 720, letterSpacing: '-.045em' }}>Ma page organisateur</h1>
        <p style={{ maxWidth: 650, margin: '7px 0 0', color: 'var(--text-faint)', fontSize: 'var(--font-size-footnote-lg)', lineHeight: 1.4 }}>Présente ton univers, publie tes médias et configure tes encaissements.</p>
      </header>
      <div role="tablist" aria-label="Sections du studio" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 10 }}>
        {(['page', 'paiements'] as const).map((t) => (
          <Button
            key={t}
            variant="ghost"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-control)',
              border: `1px solid ${tab === t ? 'var(--gold)' : 'var(--border)'}`,
              background: tab === t ? 'var(--primary-a14)' : 'var(--surface)',
              color: tab === t ? 'var(--gold)' : 'var(--text-muted)',
              fontSize: 'var(--font-size-body-sm)',
              fontWeight: 700,
              textTransform: 'none',
              letterSpacing: 'normal',
            }}
          >
            {t === 'page' ? 'Ma page publique' : 'Encaissement'}
          </Button>
        ))}
      </div>

      {message && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '10px 12px',
            marginBottom: 10,
            borderRadius: 12,
            border: `1px solid ${message.type === 'success' ? 'var(--primary-a05)' : 'var(--danger-border)'}`,
            background: 'var(--surface-2)',
            color: message.type === 'success' ? 'var(--teal)' : 'var(--pink)',
            fontSize: 'var(--font-size-callout)',
          }}
        >
          {message.text}
        </div>
      )}

      {tab === 'page' && (
      <>
      <Card style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0, padding: 0, marginBottom: 10, overflow: 'hidden' }}>
        <div style={{ padding: 12, borderRight: '1px solid var(--border)' }}>
          <p style={{ font: '600 24px var(--font-open-sans)', color: 'var(--text)', margin: 0 }}>{profile.followersCount}</p>
          <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 0' }}>Abonnés</p>
        </div>
        <div style={{ padding: 12 }}>
          <p style={{ font: '600 24px var(--font-open-sans)', color: 'var(--text)', margin: 0 }}>{profile.viewsCount}</p>
          <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 0' }}>Vues de la page</p>
        </div>
      </Card>

      <Card style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 220, fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{publicUrl}</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            navigator.clipboard?.writeText(publicUrl)
            setLinkCopied(true)
            setTimeout(() => setLinkCopied(false), 2000)
          }}
          style={{ fontSize: 'var(--font-size-caption-lg)' }}
        >
          {linkCopied ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Copié <Check size={13} /></span> : 'Copier le lien'}
        </Button>
        {profile.status === 'public' && (
          <Link href={`/organizers/${slug}`} style={{ minHeight: 'var(--density-action-min)', display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 'var(--radius-control)', background: 'var(--gold)', color: 'var(--obsidian)', fontSize: 'var(--font-size-body-sm)', fontWeight: 700, textDecoration: 'none' }}>
            Voir ma page
          </Link>
        )}
      </Card>

      <div className="studio-profile-grid">
        {/* Informations publiques */}
        <Card>
          <h2 style={{ fontSize: 'var(--font-size-callout)', fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3px', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 10px' }}>Informations publiques</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ width: 88, height: 88, borderRadius: '50%', overflow: 'hidden', background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}>
                {profile.avatarUrl ? (
                  <NextImage src={profile.avatarUrl} alt={`Logo de ${profile.publicName}`} width={88} height={88} style={{ objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 'var(--font-size-title-5)', color: 'var(--teal)' }}>{profile.publicName[0] || 'O'}</span>
                )}
              </div>
              <label style={{ minHeight: 'var(--density-action-min)', display: 'inline-flex', alignItems: 'center', marginTop: 8, padding: '0 12px', borderRadius: 'var(--radius-control)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--font-size-body)', cursor: 'pointer' }}>
                {uploading === 'avatar' ? 'Envoi…' : 'Changer le logo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={Boolean(uploading)}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void prepareCrop('avatar', file)
                  }}
                  style={{ display: 'none' }}
                />
              </label>
              <p style={{ fontSize: 'var(--font-size-caption-2)', color: 'var(--text-faint)', margin: '4px 0 0' }}>Image 10 Mo max.</p>
            </div>
            <div>
              <div style={{ height: 88, borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2)', position: 'relative' }}>
                {profile.bannerUrl && (
                  <NextImage src={profile.bannerUrl} alt={`Bannière de ${profile.publicName}`} fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 400px" />
                )}
              </div>
              <label style={{ minHeight: 'var(--density-action-min)', display: 'inline-flex', alignItems: 'center', marginTop: 8, padding: '0 12px', borderRadius: 'var(--radius-control)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--font-size-body)', cursor: 'pointer' }}>
                {uploading === 'banner' ? 'Envoi…' : 'Changer la bannière'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={Boolean(uploading)}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void prepareCrop('banner', file)
                  }}
                  style={{ display: 'none' }}
                />
              </label>
              <p style={{ fontSize: 'var(--font-size-caption-2)', color: 'var(--text-faint)', margin: '4px 0 0' }}>Image 10 Mo max.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <div>
              <Label style={{ font: '600 11px var(--font-open-sans)', textTransform: 'uppercase', marginBottom: 6 }}>Nom public</Label>
              <Input aria-label="Nom public" value={profile.publicName} onChange={(e) => update({ publicName: e.target.value })} />
            </div>
            <div>
              <Label style={{ font: '600 11px var(--font-open-sans)', textTransform: 'uppercase', marginBottom: 6 }}>Slug public</Label>
              <Input aria-label="Slug public" value={profile.slug} onChange={(e) => update({ slug: e.target.value })} />
            </div>
            <div>
              <Label style={{ font: '600 11px var(--font-open-sans)', textTransform: 'uppercase', marginBottom: 6 }}>Ville d&rsquo;intervention</Label>
              <Input aria-label="Ville d’intervention" value={profile.city} onChange={(e) => update({ city: e.target.value })} placeholder="Ta ville de base" />
            </div>
            <div />
            <div style={{ gridColumn: '1 / -1' }}>
              <Label style={{ font: '600 11px var(--font-open-sans)', textTransform: 'uppercase', marginBottom: 0 }}>Pays / régions d&rsquo;intervention</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {ZONE_OPTIONS.map((r) => {
                  const sel = zones.includes(r.id)
                  return (
                    <Button
                      key={r.id}
                      variant="ghost"
                      onClick={() => toggleZone(r.id)}
                      style={{
                        padding: '7px 11px',
                        borderRadius: 20,
                        border: `1px solid ${sel ? 'var(--teal)' : 'var(--border)'}`,
                        background: sel ? 'var(--primary-a14)' : 'var(--surface)',
                        color: sel ? 'var(--teal)' : 'var(--text-muted)',
                        fontSize: 'var(--font-size-footnote-lg)',
                        fontWeight: 600,
                      }}
                    >
                      {r.flag} {r.name}
                    </Button>
                  )
                })}
              </div>
              <p style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-faint)', marginTop: 6 }}>
                Sélectionne tous les pays où tu organises — les visiteurs pourront te trouver en cherchant l&rsquo;un d&rsquo;eux. C&rsquo;est du marketing : ça ne change JAMAIS ta devise ni ton mode de paiement. Choisir un pays précis désélectionne « International » (les deux ne se cumulent pas).
              </p>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 12, border: '1px solid var(--focus-ring-color)', background: 'var(--primary-a06)' }}>
                <span aria-hidden="true" style={{ fontSize: 'var(--font-size-title-5)', display: 'inline-flex', alignItems: 'center', color: 'var(--gold)' }}>{regionCurrency === 'XOF' ? <Smartphone size={17} /> : <CreditCard size={17} />}</span>
                <div>
                  <p style={{ font: '700 12.5px var(--font-open-sans)', color: 'var(--gold)', margin: 0 }}>
                    {getRegionName(profile.regionId) || profile.country || '—'} · {regionCurrency === 'XOF' ? 'FCFA (XOF)' : 'Euro (€)'}
                  </p>
                  <p style={{ font: '500 11px var(--font-open-sans)', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    Fixée à ton inscription. Tes prix et versements sont TOUJOURS dans cette devise, indépendamment des pays d&rsquo;intervention ci-dessus.
                  </p>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <Label style={{ font: '600 11px var(--font-open-sans)', textTransform: 'uppercase', marginBottom: 0 }}>Description</Label>
              <Textarea
                aria-label="Description publique"
                rows={4}
                maxLength={500}
                value={profile.shortDescription}
                onChange={(e) => update({ shortDescription: e.target.value })}
                placeholder="Présente ton univers en quelques phrases."
              />
              <span style={{ fontSize: 'var(--font-size-caption-2-lg)', color: 'var(--text-faint)', justifySelf: 'end' }}>{profile.shortDescription.length}/500</span>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Label style={{ font: '600 11px var(--font-open-sans)', textTransform: 'uppercase', marginBottom: 0 }}>Réseaux sociaux</Label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 6 }}>
                {SOCIAL_NETWORKS.map((net) => (
                  <div key={net.key} style={{ display: 'grid', gap: 5 }}>
                    <Label style={{ font: '600 10.5px var(--font-open-sans)', textTransform: 'uppercase', marginBottom: 0 }}>{net.label}</Label>
                    <Input
                      aria-label={net.label}
                      value={profile.socialLinks[net.key] || ''}
                      onChange={(e) => update({ socialLinks: { ...profile.socialLinks, [net.key]: e.target.value } })}
                      placeholder={net.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Button onClick={save} loading={saving} loadingText="Enregistrement…" fullWidth style={{ ...saveButtonStyle(saving), background: 'var(--gold)', color: 'var(--obsidian)', border: '1px solid var(--gold)' }}>
            Enregistrer
          </Button>
        </Card>

        {/* Aperçu + statut */}
        <Card>
          <h2 style={{ fontSize: 'var(--font-size-callout)', fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3px', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 10px' }}>Aperçu de ma page</h2>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)' }}>
            <div style={{ height: 84, background: profile.bannerUrl ? `url(${profile.bannerUrl}) center/cover` : 'linear-gradient(135deg, var(--primary-a12), var(--primary-a12))' }} />
            <div style={{ padding: 12 }}>
              <div style={{ width: 48, height: 48, marginTop: -24, borderRadius: '50%', overflow: 'hidden', border: '3px solid var(--surface-2)', background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}>
                {profile.avatarUrl ? (
                  <NextImage src={profile.avatarUrl} alt="" width={48} height={48} style={{ objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 'var(--font-size-title-5)', color: 'var(--teal)' }}>{profile.publicName[0] || 'O'}</span>
                )}
              </div>
              <h3 style={{ font: '600 18px var(--font-open-sans)', color: 'var(--text)', margin: '8px 0 0' }}>{profile.publicName || 'Ton nom public'}</h3>
              <p style={{ font: '600 11px var(--font-open-sans)', color: 'var(--gold)', margin: '4px 0 0' }}>{[profile.city, profile.country].filter(Boolean).join(' · ') || 'Ville · Pays'}</p>
              <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)', lineHeight: 1.6, margin: '8px 0 0' }}>{profile.shortDescription || 'Ta description apparaîtra ici.'}</p>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <p style={{ font: '600 11px var(--font-open-sans)', color: 'var(--text-muted)', textTransform: 'uppercase', margin: '0 0 8px' }}>Statut de la page</p>
            {(['draft', 'public'] as const).map((status) => (
              <Radio
                key={status}
                checked={profile.status === status}
                onChange={() => update({ status })}
                label={status === 'public' ? 'Publique — visible par tout le monde' : 'Privée — visible par toi seulement'}
                style={{ padding: '9px 0', fontSize: 'var(--font-size-callout)', color: 'var(--text)' }}
              />
            ))}
          </div>
          <Button onClick={save} loading={saving} loadingText="Enregistrement…" fullWidth style={{ ...saveButtonStyle(saving), background: 'var(--gold)', color: 'var(--obsidian)', border: '1px solid var(--gold)' }}>
            Enregistrer
          </Button>
          <p style={{ fontSize: 'var(--font-size-caption-2-lg)', color: 'var(--text-faint)', textAlign: 'center', margin: '6px 0 0' }}>Enregistre l&rsquo;ensemble de ton profil, y compris les informations publiques.</p>
        </Card>
      </div>

      {/* Galerie */}
      <Card style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-callout)', fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3px', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 4px' }}>Galerie photos & vidéos</h2>
            <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', margin: 0 }}>Images 10 Mo max. Vidéos 8 Mo max. 12 médias au maximum recommandé pour une page lisible (non bloquant).</p>
          </div>
          <label style={{ padding: '8px 13px', borderRadius: 3, background: 'var(--gold)', color: 'var(--obsidian)', fontSize: 'var(--font-size-caption-lg)', fontWeight: 500, textTransform: 'none', letterSpacing: 'normal', cursor: 'pointer' }}>
            {uploading === 'gallery' ? 'Envoi…' : '+ Ajouter un média'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              disabled={Boolean(uploading)}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void upload('gallery', file)
              }}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        {profile.media.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-callout)' }}>Tu n&rsquo;as encore ajouté aucun média.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            {profile.media.map((item, index) => (
              <article key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 9, background: 'var(--card-bg)' }}>
                <div style={{ height: 108, background: 'var(--surface-2)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                  {item.type === 'video' ? (
                    <video src={item.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <NextImage src={item.url} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 210px" />
                  )}
                </div>
                <Input
                  aria-label="Titre du média"
                  value={item.title}
                  onChange={(e) => setProfile((p) => ({ ...p, media: p.media.map((m) => (m.id === item.id ? { ...m, title: e.target.value } : m)) }))}
                  onBlur={(e) => void updateMedia(item.id, { title: e.target.value })}
                  placeholder="Titre facultatif"
                  style={{ marginTop: 8 }}
                />
                <Select
                  aria-label="Événement lié au média"
                  value={item.eventId || ''}
                  onChange={(value) => void updateMedia(item.id, { eventId: value || null })}
                  placeholder="Aucun événement lié"
                  options={events.map((ev) => ({ value: ev.id, label: ev.name }))}
                  size="sm"
                />
                <Checkbox
                  checked={item.visibility !== 'hidden'}
                  onChange={(e) => void updateMedia(item.id, { visibility: e.target.checked ? 'public' : 'hidden' })}
                  label="Visible publiquement"
                  style={{ gap: 7, fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)', marginTop: 8 }}
                />
                <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                  <Button variant="ghost" onClick={() => void moveMedia(index, -1)} disabled={index === 0} aria-label="Déplacer vers la gauche" style={mediaActionStyle}>
                    <ChevronLeft size={14} />
                  </Button>
                  <Button variant="ghost" onClick={() => void moveMedia(index, 1)} disabled={index === profile.media.length - 1} aria-label="Déplacer vers la droite" style={mediaActionStyle}>
                    <ChevronRight size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setPendingConfirm({
                        title: 'Supprimer ce média',
                        message: 'Ce média sera retiré définitivement de ta page organisateur.',
                        confirmLabel: 'Supprimer',
                        onConfirm: () => { void removeMedia(item.id) },
                      })
                    }
                    style={{ ...mediaActionStyle, color: 'var(--pink)' }}
                  >
                    Supprimer
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
      </>
      )}

      {tab === 'paiements' && <PayoutSection initialStatus={initialPayoutStatus} initialMomos={initialMomos} />}
      </main>
      {crop && (
        <ImageCropperModal
          key={`${crop.kind}-${crop.src.slice(-24)}`}
          src={crop.src}
          title={crop.kind === 'avatar' ? 'Recadrer le logo' : 'Recadrer la bannière'}
          aspect={crop.kind === 'avatar' ? 1 : 16 / 7}
          outputWidth={crop.kind === 'avatar' ? 640 : 1280}
          circular={crop.kind === 'avatar'}
          onCancel={() => setCrop(null)}
          onConfirm={async (dataUri) => { await uploadData(crop.kind, { dataUri }); setCrop(null) }}
        />
      )}
      {pendingConfirm && (
        <Modal onClose={() => setPendingConfirm(null)} dismissible ariaLabel={pendingConfirm.title} contentStyle={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ fontSize: 'var(--font-size-title-5)', letterSpacing: '-.4px', margin: 0, color: 'var(--text)' }}>{pendingConfirm.title}</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)', lineHeight: 1.55 }}>{pendingConfirm.message}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={() => setPendingConfirm(null)} style={{ flex: 1 }}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const run = pendingConfirm.onConfirm
                setPendingConfirm(null)
                run()
              }}
              style={{ flex: 1 }}
            >
              {pendingConfirm.confirmLabel}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

function saveButtonStyle(saving: boolean): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 'var(--density-action-min)',
    padding: '10px 14px',
    background: 'var(--gold)',
    border: '1px solid var(--gold)',
    borderRadius: 'var(--radius-control)',
    color: 'var(--obsidian)',
    fontSize: 'var(--font-size-body-sm)',
    fontWeight: 500,
    textTransform: 'none',
    letterSpacing: 'normal',
    cursor: saving ? 'wait' : 'pointer',
    marginTop: 12,
  }
}

const mediaActionStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 'var(--density-action-min)',
  padding: '10px 8px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-muted)',
  fontSize: 'var(--font-size-callout)',
  cursor: 'pointer',
}

// ───────────────────────── Encaissement (Stripe Connect + Mobile Money) ─────

function PayoutSection({ initialStatus, initialMomos }: { initialStatus: PayoutStatusView; initialMomos: Record<string, string> }) {
  const [status, setStatus] = useState(initialStatus)
  const [connecting, setConnecting] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [payoutMessage, setPayoutMessage] = useState('')

  const [momos, setMomos] = useState(initialMomos)
  const [openCountries, setOpenCountries] = useState<string[]>(Object.keys(initialMomos))
  const [addSel, setAddSel] = useState('')
  const [savingMomos, setSavingMomos] = useState(false)
  const [momoMessage, setMomoMessage] = useState('')
  const [momoErrorCountry, setMomoErrorCountry] = useState<string | null>(null)

  const due = status.amountDueCents > 0 || status.amountDueXOF > 0

  async function connect() {
    setConnecting(true)
    setPayoutMessage('')
    try {
      const res = await fetch('/api/organizers/me/payouts/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnPath: '/organizer-studio' }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error()
      if (data.url) {
        window.location.assign(data.url)
        return
      }
      if (data.manual) {
        setStatus((s) => ({ ...s, mode: 'manual', country: data.country }))
        setPayoutMessage('Ton pays est réglé par virement / mobile money — pas de compte Stripe à connecter.')
      }
    } catch {
      setPayoutMessage('Impossible de lancer la connexion Stripe — réessaie.')
    }
    setConnecting(false)
  }

  async function requestPayout() {
    setRequesting(true)
    setPayoutMessage('')
    try {
      const res = await fetch('/api/organizers/me/payouts/request', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setPayoutMessage(data.error === 'request_already_pending' ? 'Une demande est déjà en attente de traitement.' : 'Demande impossible — réessaie.')
        setRequesting(false)
        return
      }
      setPayoutMessage("Demande de reversement envoyée. L'équipe LIVEINBLACK va la traiter.")
    } catch {
      setPayoutMessage('Demande impossible — vérifie ta connexion.')
    }
    setRequesting(false)
  }

  const remaining = useMemo(() => MOMO_REGIONS.filter((r) => r.momoCountry && !openCountries.includes(r.momoCountry)), [openCountries])

  function addCountry(code: string) {
    if (!code) return
    setOpenCountries((o) => [...new Set([...o, code])])
    setAddSel('')
  }

  function removeCountry(code: string) {
    setOpenCountries((o) => o.filter((c) => c !== code))
    setMomos((m) => {
      const next = { ...m }
      delete next[code]
      return next
    })
  }

  async function saveMomos() {
    setSavingMomos(true)
    setMomoMessage('')
    setMomoErrorCountry(null)
    const payload: Record<string, string> = {}
    for (const c of openCountries) if (momos[c]?.trim()) payload[c] = momos[c].trim()
    try {
      const res = await fetch('/api/organizers/me/payout-momos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ momos: payload }) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        const errorText = typeof data.error === 'string' ? data.error : 'Numéro invalide.'
        setMomoMessage(errorText)
        // Le message serveur cite le nom du pays en échec (ex. "Numéro
        // invalide pour Togo...") — on le retrouve pour surligner le bon
        // encart quand plusieurs pays sont ouverts en même temps.
        const failedRegion = MOMO_REGIONS.find((r) => r.momoCountry && errorText.includes(r.name))
        setMomoErrorCountry(failedRegion?.momoCountry ?? null)
        setSavingMomos(false)
        return
      }
      setMomos(data.momos)
      const n = Object.keys(data.momos).length
      setMomoMessage(
        n
          ? 'Numéros enregistrés. Chaque événement est payé sur le numéro de son pays. Les versements en attente pour ces pays repartent automatiquement.'
          : "Aucun numéro enregistré — tes recettes FCFA seront en attente jusqu'à ce que tu en ajoutes un."
      )
    } catch {
      setMomoMessage('Enregistrement impossible — vérifie ta connexion.')
    }
    setSavingMomos(false)
  }

  return (
    <Card style={{ display: 'grid', gap: 10 }} id="encaissement">
      <h2 style={{ fontSize: 'var(--font-size-callout)', fontWeight: 400, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '3px', fontFamily: 'var(--font-display), sans-serif', margin: 0 }}>Encaissement</h2>

      <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}>
        {status.mode === 'manual' ? (
          <>
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text)', margin: '0 0 8px' }}>Réglé par virement / mobile money (hors Stripe Connect).</p>
            {due ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  {status.amountDueCents > 0 && <p style={{ fontSize: 'var(--font-size-headline)', fontWeight: 800, color: 'var(--gold)', margin: 0 }}>{fmtMoney(status.amountDueCents / 100, 'EUR')}</p>}
                  {status.amountDueXOF > 0 && <p style={{ fontSize: 'var(--font-size-headline)', fontWeight: 800, color: 'var(--teal)', margin: 0 }}>{fmtMoney(status.amountDueXOF, 'XOF')}</p>}
                </div>
                <Button
                  onClick={requestPayout}
                  loading={requesting}
                  loadingText="Envoi…"
                  style={{ ...saveButtonStyle(requesting), background: 'var(--gold)', color: 'var(--obsidian)', border: '1px solid var(--gold)', width: 'auto', padding: '8px 14px', marginTop: 0 }}
                >
                  Demander un reversement
                </Button>
              </div>
            ) : (
              <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', margin: 0 }}>Aucun solde à reverser pour l&rsquo;instant.</p>
            )}
          </>
        ) : status.connected && status.chargesEnabled ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'var(--primary-a14)', color: 'var(--teal)', fontSize: 'var(--font-size-caption)', fontWeight: 700 }}>Compte connecté</span>
            <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-muted)', margin: 0 }}>Les paiements sont versés automatiquement sur ton compte bancaire (2-7 jours ouvrés).</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 'var(--font-size-callout)', color: 'var(--text)', margin: '0 0 10px' }}>
              {status.connected ? 'Ton compte Stripe est en cours de vérification.' : 'Connecte ton compte bancaire via Stripe pour être payé automatiquement.'}
            </p>
            <Button
              onClick={connect}
              loading={connecting}
              loadingText="Redirection…"
              style={{ ...saveButtonStyle(connecting), background: 'var(--gold)', color: 'var(--obsidian)', border: '1px solid var(--gold)', width: 'auto', padding: '8px 14px', marginTop: 0 }}
            >
              Connecter mon compte bancaire
            </Button>
          </>
        )}
        {payoutMessage && <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)', marginTop: 10 }}>{payoutMessage}</p>}
      </div>

      <div>
        <p style={{ font: '600 12px var(--font-open-sans)', color: 'var(--text)', margin: '0 0 4px' }}>Mobile Money — un numéro par pays</p>
        <p style={{ fontSize: 'var(--font-size-footnote-lg)', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 10px' }}>
          Chaque événement est payé automatiquement sur le numéro du <strong style={{ color: 'var(--gold)' }}>pays de l&rsquo;événement</strong>. Ajoute un numéro pour chaque pays où tu organises.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {openCountries.length === 0 && <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-faint)', gridColumn: '1 / -1' }}>Aucun pays encore. Ajoute-en un ci-dessous.</p>}
          {openCountries.map((code) => {
            const region = MOMO_REGIONS.find((r) => r.momoCountry === code)
            if (!region) return null
            const hasError = momoErrorCountry === code
            return (
              <div key={code} style={{ border: hasError ? '1px solid var(--pink)' : '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 'var(--font-size-callout)', fontWeight: 700, color: 'var(--text)' }}>
                    {region.flag} {region.name}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (!momos[code]?.trim()) removeCountry(code)
                      else if (window.confirm(`Le numéro Mobile Money saisi pour ${region.name} sera perdu sur cet écran.`)) removeCountry(code)
                    }}
                    aria-label="Retirer"
                    style={{ color: 'var(--text-faint)', fontSize: 'var(--font-size-headline-lg)', padding: 0 }}
                  >
                    ×
                  </Button>
                </div>
                <Input
                  type="tel"
                  placeholder={`${region.dial} 90 00 00 00`}
                  value={momos[code] || ''}
                  onChange={(e) => setMomos((m) => ({ ...m, [code]: e.target.value }))}
                  invalid={hasError}
                />
              </div>
            )
          })}
        </div>
        {remaining.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <Select
                value={addSel}
                onChange={(value) => setAddSel(value)}
                placeholder="Ajouter un pays…"
                options={remaining.map((r) => ({ value: r.momoCountry ?? '', label: `${r.flag} ${r.name}` }))}
              />
            </div>
            <Button variant="secondary" onClick={() => addCountry(addSel)} disabled={!addSel} style={{ padding: '0 14px', borderRadius: 10, fontSize: 'var(--font-size-callout)' }}>
              Ajouter
            </Button>
          </div>
        )}
        {momoMessage && <p style={{ fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)', marginTop: 12 }}>{momoMessage}</p>}
        <Button
          onClick={saveMomos}
          loading={savingMomos}
          loadingText="Enregistrement…"
          fullWidth
          style={{ ...saveButtonStyle(savingMomos), background: 'var(--gold)', color: 'var(--obsidian)', border: '1px solid var(--gold)' }}
        >
          Enregistrer mes numéros
        </Button>
      </div>
    </Card>
  )
}
