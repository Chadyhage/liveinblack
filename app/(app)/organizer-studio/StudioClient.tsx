'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import NextImage from 'next/image'
import Link from 'next/link'
import { useQueryParamState } from '@/lib/client/useQueryParamState'
import {
  Check,
  Smartphone,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Sparkles,
  Camera,
  Trash2,
  Eye,
  EyeOff,
  Wallet,
  Users,
  Calendar,
  Layers,
  ShieldCheck,
  Plus,
  AlertCircle,
} from 'lucide-react'
import { SOCIAL_NETWORKS, type SocialNetworkKey } from '@/lib/shared/social'
import { regions } from '@/lib/shared/regions'
import { normalizeRegionIds, getRegionName } from '@/lib/shared/locations'
import { MOMO_REGIONS } from '@/lib/shared/payoutMomoValidation'
import { fmtMoney } from '@/lib/shared/money'
import ImageCropperModal from '@/app/components/ui/ImageCropperModal'
import { uploadPublicMedia } from '@/lib/client/publicMediaUpload'
import type { PublicMediaUploadReference } from '@/lib/shared/publicMediaUploads'
import { Button, Card, Input, Textarea, Radio, Select, Label, Modal } from '@/app/components/ui'

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
  
  const [tab, setTab] = useQueryParamState<'page' | 'media' | 'paiements'>('tab', 'page')

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
      setMessage({ type: 'success', text: kind === 'gallery' ? 'Média ajouté à ta galerie.' : 'Visuel mis à jour avec succès.' })
    } catch {
      setMessage({ type: 'error', text: 'Envoi impossible — réessaie.' })
    }
    setUploading('')
  }

  async function upload(kind: 'gallery', file: File) {
    const isVideo = file.type.startsWith('video/')
    if (isVideo) {
      if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
        return setMessage({ type: 'error', text: 'Format vidéo non supporté (MP4, WEBM ou MOV acceptés).' })
      }
      if (file.size > 30_000_000) return setMessage({ type: 'error', text: 'La vidéo doit faire 30 Mo maximum.' })
      await uploadData(kind, { upload: await uploadPublicMedia(file, 'organizer-gallery') })
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return setMessage({ type: 'error', text: 'Format image non supporté (JPG, PNG ou WEBP acceptés).' })
    }
    if (file.size > 10_000_000) return setMessage({ type: 'error', text: "L'image doit faire 10 Mo maximum." })
    await uploadData(kind, { dataUri: await resizeImageToDataUri(file) })
  }

  async function prepareCrop(kind: 'avatar' | 'banner', file: File) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setMessage({ type: 'error', text: 'Format d’image non supporté (JPG, PNG ou WEBP).' })
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
        .studio-root {
          width: 100%;
          max-width: 1140px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .studio-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 14px;
          padding: 6px 0 2px;
        }
        .studio-tabs-bar {
          display: inline-flex;
          align-items: center;
          background: var(--surface);
          padding: 4px;
          border-radius: 999px;
          border: 1px solid var(--border);
          gap: 4px;
        }
        .studio-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          border-radius: 999px;
          border: 0;
          font-size: var(--font-size-body-sm);
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--text-muted);
          background: transparent;
        }
        .studio-tab-btn.active {
          background: var(--primary);
          color: var(--primary-ink);
          box-shadow: 0 4px 14px rgba(var(--primary-rgb), 0.35);
        }
        .studio-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .studio-stat-card {
          padding: 16px 18px;
          border-radius: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .studio-grid-2col {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.95fr);
          gap: 16px;
          align-items: start;
        }
        .studio-banner-hero {
          position: relative;
          height: 190px;
          border-radius: 16px;
          overflow: hidden;
          background: var(--surface-2);
          border: 1px solid var(--border);
        }
        .studio-avatar-wrap {
          position: absolute;
          left: 20px;
          bottom: -32px;
          width: 86px;
          height: 86px;
          border-radius: 50%;
          border: 3px solid var(--surface);
          background: var(--surface-2);
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
          z-index: 2;
        }
        @media (max-width: 900px) {
          .studio-stats-grid { grid-template-columns: 1fr; }
          .studio-grid-2col { grid-template-columns: 1fr; }
          .studio-banner-hero { height: 150px; }
        }
      `}</style>

      <div className="studio-root">
        {/* En-tête principal & actions rapides */}
        <header className="studio-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, color: 'var(--text)', fontSize: 'clamp(24px,2.8vw,32px)', fontWeight: 800, letterSpacing: '-.03em' }}>
                Studio Organisateur
              </h1>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 'var(--font-size-caption)',
                  fontWeight: 700,
                  background: profile.status === 'public' ? 'rgba(var(--primary-rgb), 0.14)' : 'var(--surface-2)',
                  color: profile.status === 'public' ? 'var(--primary)' : 'var(--text-faint)',
                  border: `1px solid ${profile.status === 'public' ? 'rgba(var(--primary-rgb), 0.3)' : 'var(--border)'}`,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: profile.status === 'public' ? 'var(--primary)' : 'var(--text-faint)' }} />
                {profile.status === 'public' ? 'En ligne · Public' : 'Brouillon · Privé'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>
              Édite l’identité de ta marque, présente tes événements et configure tes versements.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(publicUrl)
                setLinkCopied(true)
                setTimeout(() => setLinkCopied(false), 2000)
              }}
              style={{
                minHeight: 38,
                padding: '0 14px',
                borderRadius: 999,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: 'var(--font-size-footnote)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              {linkCopied ? <Check size={14} color="var(--primary)" /> : <Copy size={14} />}
              {linkCopied ? 'Lien copié !' : 'Copier le lien public'}
            </button>

            {profile.status === 'public' && (
              <Link
                href={`/organizers/${slug}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  minHeight: 38,
                  padding: '0 16px',
                  borderRadius: 999,
                  background: 'var(--primary)',
                  color: 'var(--primary-ink)',
                  fontSize: 'var(--font-size-footnote)',
                  fontWeight: 750,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(var(--primary-rgb), 0.3)',
                }}
              >
                <ExternalLink size={14} />
                Voir ma page publique
              </Link>
            )}
          </div>
        </header>

        {/* Message de confirmation / alerte */}
        {message && (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: '12px 16px',
              borderRadius: 14,
              border: `1px solid ${message.type === 'success' ? 'rgba(var(--primary-rgb), 0.4)' : 'var(--danger-border)'}`,
              background: message.type === 'success' ? 'rgba(var(--primary-rgb), 0.10)' : 'var(--surface-2)',
              color: message.type === 'success' ? 'var(--primary)' : 'var(--danger)',
              fontSize: 'var(--font-size-callout)',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Barres d'onglets principales */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
          <div className="studio-tabs-bar" role="tablist" aria-label="Sections du studio">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'page'}
              onClick={() => setTab('page')}
              className={`studio-tab-btn ${tab === 'page' ? 'active' : ''}`}
            >
              <Sparkles size={15} />
              Identité & Profil
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'media'}
              onClick={() => setTab('media')}
              className={`studio-tab-btn ${tab === 'media' ? 'active' : ''}`}
            >
              <Layers size={15} />
              Galerie Média ({profile.media.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'paiements'}
              onClick={() => setTab('paiements')}
              className={`studio-tab-btn ${tab === 'paiements' ? 'active' : ''}`}
            >
              <Wallet size={15} />
              Encaissements
            </button>
          </div>
        </div>

        {/* ─────────────────── TAB 1: IDENTITÉ & PROFIL ─────────────────── */}
        {tab === 'page' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Statistiques clés en cartes épurées */}
            <div className="studio-stats-grid">
              <div className="studio-stat-card">
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(var(--primary-rgb), 0.12)', display: 'grid', placeItems: 'center', color: 'var(--primary)' }}>
                  <Users size={22} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-title-4)', fontWeight: 800, color: 'var(--text)' }}>{profile.followersCount}</p>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Abonnés fidèles</p>
                </div>
              </div>

              <div className="studio-stat-card">
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(var(--gold-rgb), 0.12)', display: 'grid', placeItems: 'center', color: 'var(--gold)' }}>
                  <Eye size={22} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-title-4)', fontWeight: 800, color: 'var(--text)' }}>{profile.viewsCount}</p>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Vues de la page</p>
                </div>
              </div>

              <div className="studio-stat-card">
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255, 255, 255, 0.07)', display: 'grid', placeItems: 'center', color: 'var(--text)' }}>
                  <Calendar size={22} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-title-4)', fontWeight: 800, color: 'var(--text)' }}>{profile.totalEventsCount}</p>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Événements créés</p>
                </div>
              </div>
            </div>

            <div className="studio-grid-2col">
              {/* Formulaire d'édition */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Visuels : Couverture & Avatar */}
                <Card style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: 'var(--font-size-headline)', fontWeight: 750, color: 'var(--text)', margin: 0 }}>
                      Visuels de marque
                    </h2>
                    <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-faint)' }}>Bannière 16:7 · Logo 1:1</span>
                  </div>

                  <div style={{ position: 'relative', marginBottom: 28 }}>
                    <div className="studio-banner-hero">
                      {profile.bannerUrl ? (
                        <NextImage src={profile.bannerUrl} alt={`Bannière de ${profile.publicName}`} fill style={{ objectFit: 'cover' }} sizes="(max-width: 900px) 100vw, 700px" />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, rgba(var(--primary-rgb), 0.22), rgba(0, 0, 0, 0.85))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote)' }}>Aucune bannière définie</span>
                        </div>
                      )}

                      <label
                        style={{
                          position: 'absolute',
                          top: 10,
                          right: 10,
                          padding: '6px 12px',
                          borderRadius: 999,
                          background: 'rgba(0, 0, 0, 0.75)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#FFFFFF',
                          fontSize: 'var(--font-size-caption-lg)',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                        }}
                      >
                        <Camera size={14} />
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
                    </div>

                    <div className="studio-avatar-wrap">
                      {profile.avatarUrl ? (
                        <NextImage src={profile.avatarUrl} alt={`Logo de ${profile.publicName}`} width={86} height={86} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'var(--surface-2)', color: 'var(--primary)', fontSize: 32, fontWeight: 800 }}>
                          {profile.publicName[0] || 'O'}
                        </div>
                      )}
                      <label
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0, 0, 0, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0,
                          transition: 'opacity 0.2s ease',
                          cursor: 'pointer',
                          color: '#fff',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0' }}
                        title="Changer l'avatar"
                      >
                        <Camera size={20} />
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
                    </div>
                  </div>
                </Card>

                {/* Coordonnées & Identité */}
                <Card style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <h2 style={{ fontSize: 'var(--font-size-headline)', fontWeight: 750, color: 'var(--text)', margin: 0 }}>
                    Informations publiques
                  </h2>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <div>
                      <Label style={{ fontWeight: 700, fontSize: 'var(--font-size-caption-lg)', marginBottom: 6 }}>Nom de marque / Organisateur</Label>
                      <Input aria-label="Nom public" value={profile.publicName} onChange={(e) => update({ publicName: e.target.value })} placeholder="Ex. Dream Events" />
                    </div>

                    <div>
                      <Label style={{ fontWeight: 700, fontSize: 'var(--font-size-caption-lg)', marginBottom: 6 }}>Identifiant / Slug d&rsquo;URL</Label>
                      <Input aria-label="Slug public" value={profile.slug} onChange={(e) => update({ slug: e.target.value })} placeholder="dreamevents" />
                    </div>

                    <div>
                      <Label style={{ fontWeight: 700, fontSize: 'var(--font-size-caption-lg)', marginBottom: 6 }}>Ville de base</Label>
                      <Input aria-label="Ville d’intervention" value={profile.city} onChange={(e) => update({ city: e.target.value })} placeholder="Ex. Lomé, Cotonou, Paris…" />
                    </div>
                  </div>

                  {/* Zones d'intervention */}
                  <div>
                    <Label style={{ fontWeight: 700, fontSize: 'var(--font-size-caption-lg)', marginBottom: 6 }}>Zones d&rsquo;intervention</Label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {ZONE_OPTIONS.map((r) => {
                        const sel = zones.includes(r.id)
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => toggleZone(r.id)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 999,
                              border: `1px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                              background: sel ? 'rgba(var(--primary-rgb), 0.16)' : 'var(--surface-2)',
                              color: sel ? 'var(--primary)' : 'var(--text-muted)',
                              fontSize: 'var(--font-size-footnote)',
                              fontWeight: sel ? 750 : 550,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span>{r.flag}</span>
                            <span>{r.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Devise contractuelle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'rgba(var(--gold-rgb), 0.08)', border: '1px solid rgba(var(--gold-rgb), 0.25)' }}>
                    <span style={{ color: 'var(--gold)' }}>{regionCurrency === 'XOF' ? <Smartphone size={20} /> : <CreditCard size={20} />}</span>
                    <div>
                      <p style={{ margin: 0, fontWeight: 750, fontSize: 'var(--font-size-body-sm)', color: 'var(--gold)' }}>
                        Devise de compte : {getRegionName(profile.regionId) || profile.country || 'International'} · {regionCurrency === 'XOF' ? 'FCFA (XOF)' : 'Euro (€)'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)' }}>
                        Fixée lors de ton inscription. Tes prix et reversements restent régis par cette devise de base.
                      </p>
                    </div>
                  </div>

                  {/* Description / Bio */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Label style={{ fontWeight: 700, fontSize: 'var(--font-size-caption-lg)', margin: 0 }}>Description publique</Label>
                      <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-faint)' }}>{profile.shortDescription.length}/500</span>
                    </div>
                    <Textarea
                      aria-label="Description publique"
                      rows={4}
                      maxLength={500}
                      value={profile.shortDescription}
                      onChange={(e) => update({ shortDescription: e.target.value })}
                      placeholder="Présente ton univers artistique, ton label ou ton collectif en quelques phrases captivantes."
                    />
                  </div>

                  {/* Réseaux sociaux */}
                  <div>
                    <Label style={{ fontWeight: 700, fontSize: 'var(--font-size-caption-lg)', marginBottom: 8 }}>Réseaux sociaux & Liens</Label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                      {SOCIAL_NETWORKS.map((net) => (
                        <div key={net.key}>
                          <Label style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)', marginBottom: 4 }}>{net.label}</Label>
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

                  <Button
                    onClick={save}
                    loading={saving}
                    loadingText="Enregistrement en cours…"
                    style={{
                      marginTop: 8,
                      minHeight: 46,
                      background: 'var(--primary)',
                      color: 'var(--primary-ink)',
                      fontWeight: 750,
                      fontSize: 'var(--font-size-body-sm)',
                      borderRadius: 12,
                      boxShadow: '0 4px 18px rgba(var(--primary-rgb), 0.35)',
                    }}
                  >
                    Enregistrer les modifications
                  </Button>
                </Card>
              </div>

              {/* Colonne latérale : Statut de publication & Aperçu en direct */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Statut de la page */}
                <Card style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h3 style={{ fontSize: 'var(--font-size-headline)', fontWeight: 750, color: 'var(--text)', margin: 0 }}>
                    Visibilité de la page
                  </h3>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    Choisis si ton profil d’organisateur apparaît dans les moteurs de recherche et sur le site public LIVEINBLACK.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    {(['public', 'draft'] as const).map((status) => {
                      const isSel = profile.status === status
                      return (
                        <div
                          key={status}
                          onClick={() => update({ status })}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 12,
                            border: `1px solid ${isSel ? 'var(--primary)' : 'var(--border)'}`,
                            background: isSel ? 'rgba(var(--primary-rgb), 0.10)' : 'var(--surface-2)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Radio checked={isSel} onChange={() => update({ status })} aria-label={status} />
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--font-size-body-sm)', color: isSel ? 'var(--text)' : 'var(--text-muted)' }}>
                              {status === 'public' ? 'Publique (En ligne)' : 'Privée (Brouillon)'}
                            </p>
                            <p style={{ margin: '2px 0 0', fontSize: 'var(--font-size-caption)', color: 'var(--text-faint)' }}>
                              {status === 'public'
                                ? 'Visible par tout le monde avec indexation et billetterie active.'
                                : 'Uniquement accessible par toi pour préparer tes événements.'}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <Button
                    onClick={save}
                    loading={saving}
                    loadingText="Enregistrement…"
                    style={{
                      marginTop: 4,
                      minHeight: 42,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontWeight: 700,
                      borderRadius: 12,
                    }}
                  >
                    Appliquer le statut
                  </Button>
                </Card>

                {/* Mockup d'aperçu live */}
                <Card style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: 'var(--font-size-headline)', fontWeight: 750, color: 'var(--text)', margin: 0 }}>
                      Aperçu live
                    </h3>
                    <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-faint)' }}>Rendu public</span>
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface-2)' }}>
                    <div
                      style={{
                        height: 90,
                        background: profile.bannerUrl
                          ? `url(${profile.bannerUrl}) center/cover no-repeat`
                          : 'linear-gradient(135deg, rgba(var(--primary-rgb), 0.25), var(--surface-2))',
                      }}
                    />
                    <div style={{ padding: '0 14px 14px', position: 'relative' }}>
                      <div
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: '50%',
                          border: '3px solid var(--surface-2)',
                          background: 'var(--surface)',
                          overflow: 'hidden',
                          marginTop: -26,
                          display: 'grid',
                          placeItems: 'center',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                        }}
                      >
                        {profile.avatarUrl ? (
                          <NextImage src={profile.avatarUrl} alt="" width={52} height={52} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{profile.publicName[0] || 'O'}</span>
                        )}
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <h4 style={{ margin: 0, fontSize: 'var(--font-size-body)', fontWeight: 800, color: 'var(--text)' }}>
                            {profile.publicName || 'Nom de marque'}
                          </h4>
                          {profile.isVerified && <ShieldCheck size={16} color="var(--primary)" />}
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: 'var(--font-size-caption)', color: 'var(--primary)', fontWeight: 650 }}>
                          {[profile.city, profile.country].filter(Boolean).join(' · ') || 'Ville · Pays'}
                        </p>
                        <p style={{ margin: '8px 0 0', fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                          {profile.shortDescription || 'Présentation de l’organisateur…'}
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                        <div>
                          <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: 'var(--font-size-body-sm)' }}>{profile.followersCount}</span>
                          <span style={{ color: 'var(--text-faint)', fontSize: 'var(--font-size-caption-2-lg)', marginLeft: 4 }}>abonnés</span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: 'var(--font-size-body-sm)' }}>{profile.totalEventsCount}</span>
                          <span style={{ color: 'var(--text-faint)', fontSize: 'var(--font-size-caption-2-lg)', marginLeft: 4 }}>soirées</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────── TAB 2: GALERIE MÉDIA ─────────────────── */}
        {tab === 'media' && (
          <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 'var(--font-size-title-5)', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                  Galerie Photos & Vidéos
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)' }}>
                  Montre l&rsquo;ambiance de tes soirées passées. Images jusqu&rsquo;à 10 Mo, vidéos jusqu&rsquo;à 30 Mo.
                </p>
              </div>

              <label
                style={{
                  minHeight: 40,
                  padding: '0 18px',
                  borderRadius: 999,
                  background: 'var(--primary)',
                  color: 'var(--primary-ink)',
                  fontSize: 'var(--font-size-body-sm)',
                  fontWeight: 750,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(var(--primary-rgb), 0.35)',
                }}
              >
                <Plus size={16} />
                {uploading === 'gallery' ? 'Ajout en cours…' : 'Ajouter un média'}
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
              <div style={{ textAlign: 'center', padding: '50px 20px', background: 'var(--surface-2)', borderRadius: 16, border: '1px dashed var(--border)' }}>
                <Layers size={42} color="var(--text-faint)" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ margin: 0, fontSize: 'var(--font-size-headline)', color: 'var(--text)' }}>Aucun média publié</h3>
                <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)' }}>
                  Ajoute des photos et vidéos pour donner envie aux spectateurs de rejoindre tes prochains événements.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                {profile.media.map((item, index) => (
                  <article
                    key={item.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      padding: 12,
                      background: 'var(--surface-2)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ height: 130, background: '#000', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                      {item.type === 'video' ? (
                        <video src={item.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <NextImage src={item.url} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 260px" />
                      )}
                      <span
                        style={{
                          position: 'absolute',
                          top: 8,
                          left: 8,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: 'rgba(0, 0, 0, 0.7)',
                          color: '#fff',
                          fontSize: 'var(--font-size-caption-2)',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        {item.type}
                      </span>
                    </div>

                    <Input
                      aria-label="Titre du média"
                      value={item.title}
                      onChange={(e) => setProfile((p) => ({ ...p, media: p.media.map((m) => (m.id === item.id ? { ...m, title: e.target.value } : m)) }))}
                      onBlur={(e) => void updateMedia(item.id, { title: e.target.value })}
                      placeholder="Titre facultatif"
                      style={{ fontSize: 'var(--font-size-caption-lg)' }}
                    />

                    <Select
                      aria-label="Événement lié au média"
                      value={item.eventId || ''}
                      onChange={(value) => void updateMedia(item.id, { eventId: value || null })}
                      placeholder="Aucun événement lié"
                      options={events.map((ev) => ({ value: ev.id, label: ev.name }))}
                      size="sm"
                    />

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                      <button
                        type="button"
                        onClick={() => void updateMedia(item.id, { visibility: item.visibility === 'public' ? 'hidden' : 'public' })}
                        style={{
                          background: 'transparent',
                          border: 0,
                          color: item.visibility === 'public' ? 'var(--primary)' : 'var(--text-faint)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 'var(--font-size-caption)',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {item.visibility === 'public' ? <Eye size={14} /> : <EyeOff size={14} />}
                        {item.visibility === 'public' ? 'Public' : 'Masqué'}
                      </button>

                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => void moveMedia(index, -1)}
                          disabled={index === 0}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-muted)',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: index === 0 ? 'not-allowed' : 'pointer',
                            opacity: index === 0 ? 0.4 : 1,
                          }}
                          aria-label="Monter"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void moveMedia(index, 1)}
                          disabled={index === profile.media.length - 1}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-muted)',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: index === profile.media.length - 1 ? 'not-allowed' : 'pointer',
                            opacity: index === profile.media.length - 1 ? 0.4 : 1,
                          }}
                          aria-label="Descendre"
                        >
                          <ChevronRight size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingConfirm({
                              title: 'Supprimer ce média',
                              message: 'Ce média sera retiré définitivement de ta galerie organisateur.',
                              confirmLabel: 'Supprimer',
                              onConfirm: () => { void removeMedia(item.id) },
                            })
                          }
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid var(--danger-border)',
                            background: 'rgba(var(--danger-rgb), 0.1)',
                            color: 'var(--danger)',
                            display: 'grid',
                            placeItems: 'center',
                            cursor: 'pointer',
                          }}
                          aria-label="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* ─────────────────── TAB 3: ENCAISSEMENTS ─────────────────── */}
        {tab === 'paiements' && (
          <PayoutSection initialStatus={initialPayoutStatus} initialMomos={initialMomos} />
        )}
      </div>

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
        const failedRegion = MOMO_REGIONS.find((r) => r.momoCountry && errorText.includes(r.name))
        setMomoErrorCountry(failedRegion?.momoCountry ?? null)
        setSavingMomos(false)
        return
      }
      setMomos(data.momos)
      const n = Object.keys(data.momos).length
      setMomoMessage(
        n
          ? 'Numéros enregistrés avec succès. Chaque événement est versé sur le numéro correspondant à son pays.'
          : "Aucun numéro enregistré — tes recettes Mobile Money resteront en attente jusqu'à l'ajout d'un compte."
      )
    } catch {
      setMomoMessage('Enregistrement impossible — vérifie ta connexion.')
    }
    setSavingMomos(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Solde à reverser & Encaissement automatique */}
      <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-title-5)', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
              Solde & Reversements
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--font-size-footnote)', color: 'var(--text-muted)' }}>
              Suivi de tes recettes de billetterie prêtes à être transférées sur tes comptes.
            </p>
          </div>
          {status.mode === 'manual' && due && (
            <Button
              onClick={requestPayout}
              loading={requesting}
              loadingText="Envoi en cours…"
              style={{
                minHeight: 40,
                padding: '0 18px',
                borderRadius: 999,
                background: 'var(--primary)',
                color: 'var(--primary-ink)',
                fontWeight: 750,
                boxShadow: '0 4px 14px rgba(var(--primary-rgb), 0.35)',
              }}
            >
              Demander un reversement
            </Button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 4 }}>
          <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p style={{ margin: 0, fontSize: 'var(--font-size-caption)', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Recettes en attente (EUR)</p>
            <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-title-3)', fontWeight: 850, color: 'var(--gold)' }}>
              {fmtMoney(status.amountDueCents / 100, 'EUR')}
            </p>
          </div>

          <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p style={{ margin: 0, fontSize: 'var(--font-size-caption)', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Recettes en attente (XOF)</p>
            <p style={{ margin: '6px 0 0', fontSize: 'var(--font-size-title-3)', fontWeight: 850, color: 'var(--primary)' }}>
              {fmtMoney(status.amountDueXOF, 'XOF')}
            </p>
          </div>
        </div>

        {payoutMessage && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 'var(--font-size-footnote)', color: 'var(--text)' }}>
            {payoutMessage}
          </div>
        )}
      </Card>

      {/* Stripe Connect (Paiements CB & Internationaux) */}
      <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99, 91, 255, 0.15)', color: '#7a73ff', display: 'grid', placeItems: 'center' }}>
            <CreditCard size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 'var(--font-size-headline)', fontWeight: 750, color: 'var(--text)' }}>
              Paiements par Carte Bancaire (Stripe Connect)
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-muted)' }}>
              Versements automatiques sur compte bancaire européen ou international sous 2 à 7 jours ouvrés.
            </p>
          </div>
        </div>

        {status.connected && status.chargesEnabled ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: 'rgba(var(--primary-rgb), 0.12)', border: '1px solid rgba(var(--primary-rgb), 0.3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />
            <p style={{ margin: 0, fontSize: 'var(--font-size-body-sm)', fontWeight: 700, color: 'var(--primary)' }}>
              Compte Stripe vérifié et actif
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p style={{ margin: 0, fontSize: 'var(--font-size-body-sm)', color: 'var(--text-muted)' }}>
              {status.connected
                ? 'Ton compte Stripe est en cours de vérification par les équipes de conformité.'
                : 'Connecte ton compte bancaire pour recevoir directement les ventes de billets.'}
            </p>
            <Button
              onClick={connect}
              loading={connecting}
              loadingText="Connexion Stripe…"
              style={{
                minHeight: 38,
                padding: '0 16px',
                borderRadius: 999,
                background: 'var(--primary)',
                color: 'var(--primary-ink)',
                fontWeight: 750,
              }}
            >
              {status.connected ? 'Vérifier mon statut' : 'Connecter un compte Stripe'}
            </Button>
          </div>
        )}
      </Card>

      {/* Mobile Money (Recettes locales Afrique de l'Ouest) */}
      <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(var(--gold-rgb), 0.15)', color: 'var(--gold)', display: 'grid', placeItems: 'center' }}>
              <Smartphone size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-headline)', fontWeight: 750, color: 'var(--text)' }}>
                Comptes Mobile Money (UEMOA / FCFA)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 'var(--font-size-caption-lg)', color: 'var(--text-muted)' }}>
                Renseigne les numéros de réception pour chaque pays où tu organises (T-Money, Flooz, MTN, Moov, Wave…).
              </p>
            </div>
          </div>

          {remaining.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={addSel}
                onChange={(e) => addCountry(e.target.value)}
                style={{
                  height: 38,
                  borderRadius: 999,
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  padding: '0 14px',
                  fontSize: 'var(--font-size-footnote)',
                }}
              >
                <option value="">+ Ajouter un pays</option>
                {remaining.map((r) => (
                  <option key={r.momoCountry} value={r.momoCountry || ''}>
                    {r.flag} {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {openCountries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 18px', background: 'var(--surface-2)', borderRadius: 12, border: '1px dashed var(--border)' }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)' }}>
              Aucun pays Mobile Money configuré pour le moment.
            </p>
            <p style={{ margin: '4px 0 0', color: 'var(--text-faint)', fontSize: 'var(--font-size-caption)' }}>
              Ajoute un pays ci-dessus pour recevoir les recettes de tes événements en FCFA.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {openCountries.map((c) => {
              const region = MOMO_REGIONS.find((r) => r.momoCountry === c)
              const hasErr = momoErrorCountry === c
              return (
                <div
                  key={c}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: `1px solid ${hasErr ? 'var(--danger-border)' : 'var(--border)'}`,
                    background: 'var(--surface-2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 18 }}>{region?.flag}</span>
                      <span style={{ fontWeight: 750, fontSize: 'var(--font-size-body-sm)', color: 'var(--text)' }}>{region?.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCountry(c)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: 'var(--text-faint)',
                        cursor: 'pointer',
                        padding: 4,
                      }}
                      title="Retirer ce pays"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <Input
                    aria-label={`Numéro Mobile Money pour ${region?.name}`}
                    placeholder="Ex. +228 90 00 00 00"
                    value={momos[c] || ''}
                    onChange={(e) => setMomos((m) => ({ ...m, [c]: e.target.value }))}
                    style={{ fontSize: 'var(--font-size-footnote)' }}
                  />
                  <span style={{ fontSize: 'var(--font-size-caption-2)', color: 'var(--text-faint)' }}>
                    {region?.momoOperators ? `Opérateurs acceptés : ${region.momoOperators.join(', ')}` : 'Opérateurs nationaux'}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {momoMessage && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 'var(--font-size-footnote)', color: 'var(--text)' }}>
            {momoMessage}
          </div>
        )}

        {openCountries.length > 0 && (
          <Button
            onClick={saveMomos}
            loading={savingMomos}
            loadingText="Enregistrement des numéros…"
            style={{
              alignSelf: 'flex-start',
              minHeight: 42,
              padding: '0 20px',
              borderRadius: 12,
              background: 'var(--primary)',
              color: 'var(--primary-ink)',
              fontWeight: 750,
              boxShadow: '0 4px 14px rgba(var(--primary-rgb), 0.3)',
            }}
          >
            Enregistrer mes numéros Mobile Money
          </Button>
        )}
      </Card>
    </div>
  )
}
