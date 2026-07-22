'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { SOCIAL_NETWORKS, type SocialNetworkKey } from '@/lib/shared/social'
import { regions } from '@/lib/shared/regions'
import { normalizeRegionIds, getRegionName } from '@/lib/shared/locations'
import { MOMO_REGIONS } from '@/lib/shared/payoutMomoValidation'
import { fmtMoney } from '@/lib/shared/money'
import ImageCropperModal from '@/app/components/ImageCropperModal'
import { uploadPublicMedia } from '@/lib/client/publicMediaUpload'
import type { PublicMediaUploadReference } from '@/lib/shared/publicMediaUploads'

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
  const [crop, setCrop] = useState<{ kind: 'avatar' | 'banner'; src: string } | null>(null)

  useEffect(() => {
    fetch('/api/organizer-events')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setEvents(data.events.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })))
      })
      .catch(() => {})
  }, [])

  const slug = profile.slug
  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/organizers/${slug}` : `/organizers/${slug}`
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
        .studio-profile-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr); gap: 16px; margin-bottom: 16px; }
        @media (max-width: 720px) {
          .studio-profile-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 20px 100px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ font: '300 40px Inter, sans-serif', color: '#fff', margin: 0 }}>Ma page publique</h1>
          <p style={{ color: 'var(--text-muted)', margin: '8px 0 0', fontSize: 14 }}>Présente ton univers, tes événements et construis ton audience.</p>
        </div>
        <span
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: profile.status === 'public' ? '1px solid rgba(78,232,200,0.35)' : '1px solid var(--border-strong)',
            background: profile.status === 'public' ? 'rgba(78,232,200,0.1)' : 'rgba(255,255,255,0.05)',
            color: profile.status === 'public' ? 'var(--teal)' : 'var(--text-muted)',
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          {profile.status === 'public' ? '● Page publique activée' : '○ Page privée — visible par toi seulement'}
        </span>
      </header>

      {message && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '12px 14px',
            marginBottom: 14,
            borderRadius: 12,
            border: `1px solid ${message.type === 'success' ? 'rgba(78,232,200,0.5)' : 'rgba(224,90,170,0.5)'}`,
            background: 'rgba(12,12,22,0.96)',
            color: message.type === 'success' ? 'var(--teal)' : 'var(--pink)',
            fontSize: 13,
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: 18, borderRight: '1px solid var(--border)' }}>
          <p style={{ font: '600 28px Inter, sans-serif', color: '#fff', margin: 0 }}>{profile.followersCount}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 0' }}>Abonnés</p>
        </div>
        <div style={{ padding: 18 }}>
          <p style={{ font: '600 28px Inter, sans-serif', color: '#fff', margin: 0 }}>{profile.viewsCount}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 0' }}>Vues de la page</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 220, fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{publicUrl}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(publicUrl)
            setLinkCopied(true)
            setTimeout(() => setLinkCopied(false), 2000)
          }}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 11.5, cursor: 'pointer' }}
        >
          {linkCopied ? 'Copié ✓' : 'Copier le lien'}
        </button>
        {profile.status === 'public' && (
          <Link href={`/organizers/${slug}`} style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--gold)', color: 'var(--obsidian)', fontSize: 11.5, fontWeight: 700, textDecoration: 'none' }}>
            Voir ma page
          </Link>
        )}
      </div>

      <div className="studio-profile-grid">
        {/* Informations publiques */}
        <section style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', padding: 20 }}>
          <h2 style={{ font: '600 20px Inter, sans-serif', color: '#fff', margin: '0 0 16px' }}>Informations publiques</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 14, marginBottom: 18 }}>
            <div>
              <div style={{ width: 100, height: 100, borderRadius: '50%', overflow: 'hidden', background: '#12151d', display: 'grid', placeItems: 'center' }}>
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt={`Logo de ${profile.publicName}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 32, color: 'var(--teal)' }}>{profile.publicName[0] || 'O'}</span>
                )}
              </div>
              <label style={{ display: 'inline-block', marginTop: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
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
              <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: '4px 0 0' }}>Image 10 Mo max.</p>
            </div>
            <div>
              <div style={{ height: 100, borderRadius: 8, overflow: 'hidden', background: '#10131d' }}>
                {profile.bannerUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.bannerUrl} alt={`Bannière de ${profile.publicName}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
              <label style={{ display: 'inline-block', marginTop: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
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
              <p style={{ fontSize: 10, color: 'var(--text-faint)', margin: '4px 0 0' }}>Image 10 Mo max.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ font: '600 11px Inter, sans-serif', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nom public</span>
              <input value={profile.publicName} onChange={(e) => update({ publicName: e.target.value })} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ font: '600 11px Inter, sans-serif', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Slug public</span>
              <input value={profile.slug} onChange={(e) => update({ slug: e.target.value })} style={inputStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ font: '600 11px Inter, sans-serif', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ville d&rsquo;intervention</span>
              <input value={profile.city} onChange={(e) => update({ city: e.target.value })} placeholder="Ta ville de base" style={inputStyle} />
            </label>
            <div />
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ font: '600 11px Inter, sans-serif', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pays / régions d&rsquo;intervention</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {ZONE_OPTIONS.map((r) => {
                  const sel = zones.includes(r.id)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleZone(r.id)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 20,
                        border: `1px solid ${sel ? 'var(--teal)' : 'var(--border)'}`,
                        background: sel ? 'rgba(78,232,200,0.14)' : 'rgba(255,255,255,0.06)',
                        color: sel ? 'var(--teal)' : 'var(--text-muted)',
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {r.flag} {r.name}
                    </button>
                  )
                })}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
                Sélectionne tous les pays où tu organises — les visiteurs pourront te trouver en cherchant l&rsquo;un d&rsquo;eux. C&rsquo;est du marketing : ça ne change JAMAIS ta devise ni ton mode de paiement. Choisir un pays précis désélectionne « International » (les deux ne se cumulent pas).
              </p>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, border: '1px solid rgba(200,169,110,0.28)', background: 'rgba(200,169,110,0.06)' }}>
                <span aria-hidden="true" style={{ fontSize: 18 }}>{regionCurrency === 'XOF' ? '📱' : '💳'}</span>
                <div>
                  <p style={{ font: '700 12.5px Inter, sans-serif', color: 'var(--gold)', margin: 0 }}>
                    {getRegionName(profile.regionId) || profile.country || '—'} · {regionCurrency === 'XOF' ? 'FCFA (XOF)' : 'Euro (€)'}
                  </p>
                  <p style={{ font: '500 11px Inter, sans-serif', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    Fixée à ton inscription. Tes prix et versements sont TOUJOURS dans cette devise, indépendamment des pays d&rsquo;intervention ci-dessus.
                  </p>
                </div>
              </div>
            </div>
            <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
              <span style={{ font: '600 11px Inter, sans-serif', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</span>
              <textarea
                rows={4}
                maxLength={500}
                value={profile.shortDescription}
                onChange={(e) => update({ shortDescription: e.target.value })}
                placeholder="Présente ton univers en quelques phrases."
                style={inputStyle}
              />
              <span style={{ fontSize: 10.5, color: 'var(--text-faint)', justifySelf: 'end' }}>{profile.shortDescription.length}/500</span>
            </label>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={{ font: '600 11px Inter, sans-serif', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Réseaux sociaux</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
                {SOCIAL_NETWORKS.map((net) => (
                  <label key={net.key} style={{ display: 'grid', gap: 5 }}>
                    <span style={{ font: '600 10.5px Inter, sans-serif', color: 'var(--text-faint)', textTransform: 'uppercase' }}>{net.label}</span>
                    <input
                      value={profile.socialLinks[net.key] || ''}
                      onChange={(e) => update({ socialLinks: { ...profile.socialLinks, [net.key]: e.target.value } })}
                      placeholder={net.placeholder}
                      style={inputStyle}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>

          <button onClick={save} disabled={saving} style={saveButtonStyle(saving)}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </section>

        {/* Aperçu + statut */}
        <aside style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', padding: 20 }}>
          <h2 style={{ font: '600 20px Inter, sans-serif', color: '#fff', margin: '0 0 16px' }}>Aperçu de ma page</h2>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#0b0c12' }}>
            <div style={{ height: 100, background: profile.bannerUrl ? `url(${profile.bannerUrl}) center/cover` : 'linear-gradient(135deg, rgba(78,232,200,0.12), rgba(200,169,110,0.12))' }} />
            <div style={{ padding: 16 }}>
              <div style={{ width: 64, height: 64, marginTop: -32, borderRadius: '50%', overflow: 'hidden', border: '3px solid #0b0d14', background: '#111', display: 'grid', placeItems: 'center' }}>
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 26, color: 'var(--teal)' }}>{profile.publicName[0] || 'O'}</span>
                )}
              </div>
              <h3 style={{ font: '600 22px Inter, sans-serif', color: '#fff', margin: '10px 0 0' }}>{profile.publicName || 'Ton nom public'}</h3>
              <p style={{ font: '600 11px Inter, sans-serif', color: 'var(--gold)', margin: '4px 0 0' }}>{[profile.city, profile.country].filter(Boolean).join(' · ') || 'Ville · Pays'}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: '8px 0 0' }}>{profile.shortDescription || 'Ta description apparaîtra ici.'}</p>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <p style={{ font: '600 11px Inter, sans-serif', color: 'var(--text-muted)', textTransform: 'uppercase', margin: '0 0 8px' }}>Statut de la page</p>
            {(['draft', 'public'] as const).map((status) => (
              <label key={status} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
                <input type="radio" checked={profile.status === status} onChange={() => update({ status })} />
                {status === 'public' ? 'Publique — visible par tout le monde' : 'Privée — visible par toi seulement'}
              </label>
            ))}
          </div>
          <button onClick={save} disabled={saving} style={saveButtonStyle(saving)}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <p style={{ fontSize: 10.5, color: 'var(--text-faint)', textAlign: 'center', margin: '6px 0 0' }}>Enregistre l&rsquo;ensemble de ton profil, y compris les informations publiques.</p>
        </aside>
      </div>

      {/* Galerie */}
      <section style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h2 style={{ font: '600 20px Inter, sans-serif', color: '#fff', margin: '0 0 4px' }}>Galerie photos & vidéos</h2>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>Images 10 Mo max. Vidéos 8 Mo max. 12 médias au maximum recommandé pour une page lisible (non bloquant).</p>
          </div>
          <label style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--gold)', color: 'var(--obsidian)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
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
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Tu n&rsquo;as encore ajouté aucun média.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
            {profile.media.map((item, index) => (
              <article key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 9, background: 'rgba(255,255,255,0.04)' }}>
                <div style={{ height: 125, background: '#111', borderRadius: 8, overflow: 'hidden' }}>
                  {item.type === 'video' ? (
                    <video src={item.url} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                <input
                  value={item.title}
                  onChange={(e) => setProfile((p) => ({ ...p, media: p.media.map((m) => (m.id === item.id ? { ...m, title: e.target.value } : m)) }))}
                  onBlur={(e) => void updateMedia(item.id, { title: e.target.value })}
                  placeholder="Titre facultatif"
                  style={{ ...inputStyle, marginTop: 8 }}
                />
                <select
                  value={item.eventId || ''}
                  onChange={(e) => void updateMedia(item.id, { eventId: e.target.value || null })}
                  style={{ ...inputStyle, marginTop: 7 }}
                >
                  <option value="">Aucun événement lié</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
                <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={item.visibility !== 'hidden'}
                    onChange={(e) => void updateMedia(item.id, { visibility: e.target.checked ? 'public' : 'hidden' })}
                  />
                  Visible publiquement
                </label>
                <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                  <button onClick={() => void moveMedia(index, -1)} disabled={index === 0} aria-label="Déplacer vers la gauche" style={mediaActionStyle}>
                    ←
                  </button>
                  <button onClick={() => void moveMedia(index, 1)} disabled={index === profile.media.length - 1} aria-label="Déplacer vers la droite" style={mediaActionStyle}>
                    →
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Supprimer définitivement ce média de ta page ?')) void removeMedia(item.id)
                    }}
                    style={{ ...mediaActionStyle, color: 'var(--pink)' }}
                  >
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <PayoutSection initialStatus={initialPayoutStatus} initialMomos={initialMomos} />
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
    </>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 13px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: '#0b0c12',
  color: 'rgba(255,255,255,0.92)',
  outline: 'none',
  fontSize: 13,
}

function saveButtonStyle(saving: boolean): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 46,
    padding: 13,
    background: 'var(--gold)',
    border: '1px solid var(--gold)',
    borderRadius: 12,
    color: 'var(--obsidian)',
    fontSize: 13,
    fontWeight: 700,
    cursor: saving ? 'wait' : 'pointer',
    marginTop: 16,
  }
}

const mediaActionStyle: React.CSSProperties = {
  flex: 1,
  padding: '7px 6px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.7)',
  fontSize: 11,
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
    <section style={{ border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', padding: 20, display: 'grid', gap: 16 }} id="encaissement">
      <h2 style={{ font: '600 20px Inter, sans-serif', color: '#fff', margin: 0 }}>Encaissement</h2>

      <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12, background: 'rgba(255,255,255,0.02)' }}>
        {status.mode === 'manual' ? (
          <>
            <p style={{ fontSize: 13, color: '#fff', margin: '0 0 8px' }}>Réglé par virement / mobile money (hors Stripe Connect).</p>
            {due ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  {status.amountDueCents > 0 && <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--gold)', margin: 0 }}>{fmtMoney(status.amountDueCents / 100, 'EUR')}</p>}
                  {status.amountDueXOF > 0 && <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--teal)', margin: 0 }}>{fmtMoney(status.amountDueXOF, 'XOF')}</p>}
                </div>
                <button onClick={requestPayout} disabled={requesting} style={{ ...saveButtonStyle(requesting), width: 'auto', padding: '10px 18px', marginTop: 0 }}>
                  {requesting ? 'Envoi…' : 'Demander un reversement'}
                </button>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>Aucun solde à reverser pour l&rsquo;instant.</p>
            )}
          </>
        ) : status.connected && status.chargesEnabled ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(78,232,200,0.15)', color: 'var(--teal)', fontSize: 11, fontWeight: 700 }}>Compte connecté</span>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Les paiements sont versés automatiquement sur ton compte bancaire (2-7 jours ouvrés).</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: '#fff', margin: '0 0 10px' }}>
              {status.connected ? 'Ton compte Stripe est en cours de vérification.' : 'Connecte ton compte bancaire via Stripe pour être payé automatiquement.'}
            </p>
            <button onClick={connect} disabled={connecting} style={{ ...saveButtonStyle(connecting), width: 'auto', padding: '10px 18px', marginTop: 0 }}>
              {connecting ? 'Redirection…' : 'Connecter mon compte bancaire'}
            </button>
          </>
        )}
        {payoutMessage && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>{payoutMessage}</p>}
      </div>

      <div>
        <p style={{ font: '600 12px Inter, sans-serif', color: '#fff', margin: '0 0 4px' }}>Mobile Money — un numéro par pays</p>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 12px' }}>
          Chaque événement est payé automatiquement sur le numéro du <strong style={{ color: 'var(--gold)' }}>pays de l&rsquo;événement</strong>. Ajoute un numéro pour chaque pays où tu organises.
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          {openCountries.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Aucun pays encore. Ajoute-en un ci-dessous.</p>}
          {openCountries.map((code) => {
            const region = MOMO_REGIONS.find((r) => r.momoCountry === code)
            if (!region) return null
            const hasError = momoErrorCountry === code
            return (
              <div key={code} style={{ border: hasError ? '1px solid var(--pink)' : '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                    {region.flag} {region.name}
                  </span>
                  <button
                    onClick={() => {
                      if (!momos[code]?.trim() || window.confirm(`Retirer ${region.name} ? Le numéro saisi pour ce pays sera perdu.`)) removeCountry(code)
                    }}
                    aria-label="Retirer"
                    style={{ background: 'none', border: 0, color: 'var(--text-faint)', fontSize: 18, cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>
                <input
                  type="tel"
                  placeholder={`${region.dial} 90 00 00 00`}
                  value={momos[code] || ''}
                  onChange={(e) => setMomos((m) => ({ ...m, [code]: e.target.value }))}
                  style={{ ...inputStyle, ...(hasError ? { borderColor: 'var(--pink)' } : {}) }}
                />
              </div>
            )
          })}
        </div>
        {remaining.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <select value={addSel} onChange={(e) => setAddSel(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              <option value="">Ajouter un pays…</option>
              {remaining.map((r) => (
                <option key={r.momoCountry} value={r.momoCountry ?? ''}>
                  {r.flag} {r.name}
                </option>
              ))}
            </select>
            <button onClick={() => addCountry(addSel)} disabled={!addSel} style={{ padding: '0 16px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: addSel ? 'pointer' : 'not-allowed' }}>
              Ajouter
            </button>
          </div>
        )}
        {momoMessage && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>{momoMessage}</p>}
        <button onClick={saveMomos} disabled={savingMomos} style={{ ...saveButtonStyle(savingMomos), width: '100%' }}>
          {savingMomos ? 'Enregistrement…' : 'Enregistrer mes numéros'}
        </button>
      </div>
    </section>
  )
}
