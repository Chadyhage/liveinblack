import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import {
  addCatalogItem,
  adoptRemoteCatalog,
  deleteCatalogItem,
  getCatalog,
  getCatalogUpdatedAt,
  getProviderProfile,
  saveCatalog,
  saveProviderProfile,
  updateCatalogItem,
  CATALOG_CATEGORIES,
} from '../utils/services'
import { PROVIDER_CATEGORIES, getPrimaryProviderType, getProviderCategory, normalizeProviderTypes } from '../utils/providerCategories'
import MyProviderReviews from '../components/MyProviderReviews'
import { subPresentation, subPriceLabel } from '../utils/providerSub'
import { fmtMoney, regionToCurrency } from '../utils/money'
import { regions } from '../data/regions'
import { getRegionName, inferRegionIdFromCity, normalizeRegionId, normalizeRegionIds, REGION_OPTIONS } from '../utils/locations'
import { SOCIAL_NETWORKS } from '../utils/social'

const FONT = 'Inter, system-ui, sans-serif'
const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', pink: '#e05aaa' }

const card = {
  background: '#0e0f16',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 16,
  boxShadow: '0 8px 24px rgba(0,0,0,.35)',
}
const input = {
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

const primaryButton = {
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

const secondaryButton = {
  ...primaryButton,
  background: 'rgba(255,255,255,.08)',
  border: '1px solid rgba(255,255,255,.14)',
  color: 'rgba(255,255,255,.9)',
  fontWeight: 600,
  boxShadow: 'none',
}

const disabledButton = {
  background: 'rgba(255,255,255,.07)',
  color: 'rgba(255,255,255,.35)',
  border: '1px solid rgba(255,255,255,.06)',
  cursor: 'not-allowed',
  boxShadow: 'none',
}

const spinner = {
  width: 14,
  height: 14,
  display: 'inline-block',
  borderRadius: '50%',
  border: '2px solid rgba(255,255,255,.3)',
  borderTopColor: '#fff',
  flexShrink: 0,
}

function Field({ label, helper, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,.7)', marginBottom: 7 }}>{label}</span>
      {children}
      {helper && <span style={{ display: 'block', fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.45)', lineHeight: 1.5, marginTop: 6 }}>{helper}</span>}
    </label>
  )
}

function getOfferMedia(item) {
  if (Array.isArray(item?.media)) return item.media.filter(media => media?.url)
  return item?.mediaUrl ? [{ url: item.mediaUrl, type: item.mediaType || 'image' }] : []
}

function OfferMediaField({ media, uploading, onSelect, onRemove }) {
  const inputRef = useRef(null)
  return (
    <div>
      <span style={{ display: 'block', fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,.7)', marginBottom: 7 }}>Photo ou vidéo</span>
      {media.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginBottom: 8 }}>
          {media.map((entry, index) => (
            <div key={`${entry.url}-${index}`} style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: '#05060b' }}>
              {entry.type === 'video'
                ? <video src={entry.url} controls preload="metadata" style={{ display: 'block', width: '100%', aspectRatio: '16 / 10', objectFit: 'cover' }} />
                : <img src={entry.url} alt={`Aperçu ${index + 1}`} style={{ display: 'block', width: '100%', aspectRatio: '16 / 10', objectFit: 'cover' }} />}
              <button type="button" aria-label={`Supprimer le média ${index + 1}`} onClick={() => onRemove(index)} disabled={uploading} style={{ position: 'absolute', top: 7, right: 7, width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,.18)', background: 'rgba(4,4,11,.82)', color: '#fff', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
          ))}
        </div>
      )}
      {media.length < 4 && (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} style={{ width: '100%', minHeight: 104, borderRadius: 13, border: '1px dashed rgba(255,255,255,.18)', background: 'rgba(255,255,255,.04)', color: uploading ? C.gold : 'rgba(255,255,255,.55)', cursor: uploading ? 'wait' : 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700 }}>
          {uploading ? 'Envoi du média…' : `+ Ajouter une photo ou une vidéo${media.length ? ` (${media.length}/4)` : ''}`}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" hidden onChange={event => { onSelect(event.target.files?.[0]); event.target.value = '' }} />
      <span style={{ display: 'block', fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.45)', lineHeight: 1.5, marginTop: 6 }}>JPG, PNG ou WEBP jusqu’à 8 Mo · MP4, WEBM ou MOV jusqu’à 35 Mo.</span>
    </div>
  )
}

function EmptyCatalog({ onAdd }) {
  return (
    <div style={{ ...card, padding: '42px 22px', textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, borderRadius: 15, margin: '0 auto 14px', display: 'grid', placeItems: 'center', color: C.gold, background: 'rgba(200,169,110,.09)', border: '1px solid rgba(200,169,110,.22)' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5"/></svg>
      </div>
      <h2 style={{ fontFamily: FONT, fontSize: 21, margin: 0 }}>Ton catalogue est vide</h2>
      <p style={{ maxWidth: 410, margin: '9px auto 17px', fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.5)', lineHeight: 1.6 }}>Ajoute les services, formules ou équipements que les visiteurs pourront découvrir sur ta page.</p>
      <button onClick={onAdd} style={primaryButton}>Ajouter ma première offre</button>
    </div>
  )
}

function providerProfileForm(profile, fallbackName = '', fallbackTypes = []) {
  const regionId = normalizeRegionId(profile?.regionId || profile?.country || profile?.zonesIntervention?.[0]) || inferRegionIdFromCity(profile?.city || profile?.location) || 'france'
  const normalizedZones = normalizeRegionIds(profile?.zonesIntervention)
  const hasProfileCategories = !!profile && (Array.isArray(profile.prestataireTypes) || !!profile.prestataireType)
  const prestataireTypes = hasProfileCategories
    ? normalizeProviderTypes(profile.prestataireTypes, profile.prestataireType)
    : normalizeProviderTypes(fallbackTypes)
  return {
    name: profile?.name || fallbackName,
    headline: profile?.headline || '',
    description: profile?.description || '',
    city: profile?.city || profile?.location || '',
    regionId,
    website: profile?.website || '',
    socialLinks: profile?.socialLinks || (profile?.website ? { website: profile.website } : {}),
    zonesIntervention: normalizedZones.length ? normalizedZones : [regionId],
    photoUrl: profile?.photoUrl || '',
    coverUrl: profile?.coverUrl || '',
    prestataireTypes,
  }
}

function comparableProfileForm(form) {
  return {
    name: (form?.name || '').trim(),
    headline: (form?.headline || '').trim(),
    description: (form?.description || '').trim(),
    city: (form?.city || '').trim(),
    regionId: normalizeRegionId(form?.regionId) || 'france',
    website: (form?.website || '').trim(),
    socialLinks: SOCIAL_NETWORKS.reduce((acc, network) => {
      const value = (form?.socialLinks?.[network.key] || '').trim()
      if (value) acc[network.key] = value
      return acc
    }, {}),
    photoUrl: form?.photoUrl || '',
    coverUrl: form?.coverUrl || '',
    prestataireTypes: normalizeProviderTypes(form?.prestataireTypes),
    zonesIntervention: normalizeRegionIds(form?.zonesIntervention),
  }
}

export default function ProposerServicesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = getUserId(user)
  const accountTypes = normalizeProviderTypes(user?.prestataireTypes, user?.prestataireType)
  const [tab, setTab] = useState('profil')
  const [profile, setProfile] = useState(() => getProviderProfile(uid))
  const [catalog, setCatalog] = useState(() => getCatalog(uid))
  const [profileForm, setProfileForm] = useState(() => providerProfileForm(profile, user?.name || '', accountTypes))
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [newItem, setNewItem] = useState({ name: '', price: '', currency: '', unit: '', category: '', description: '', available: true, media: [] })
  const [uploading, setUploading] = useState(null)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [toast, setToast] = useState('')
  const [renewing, setRenewing] = useState(false)
  const [billing, setBilling] = useState({ loading: true, regionId: '', currency: '', canChange: false })
  const avatarInputRef = useRef(null)
  const coverInputRef = useRef(null)
  const providerTypes = normalizeProviderTypes(profileForm.prestataireTypes)
  const type = getPrimaryProviderType({ prestataireTypes: providerTypes })
  const category = getProviderCategory(type)
  const billingRegion = regions.find(region => region.id === billing.regionId) || null
  const subCurrency = billing.currency
  const catalogDefaultCurrency = regionToCurrency(profileForm.regionId)
  const savedProfileForm = useMemo(
    () => providerProfileForm(profile, user?.name || '', accountTypes),
    [profile, user?.name, user?.prestataireType, user?.prestataireTypes]
  )
  const hasUnsavedProfileChanges = useMemo(
    () => JSON.stringify(comparableProfileForm(profileForm)) !== JSON.stringify(comparableProfileForm(savedProfileForm)),
    [profileForm, savedProfileForm]
  )

  useEffect(() => {
    if (!uid) return undefined
    let cancelled = false
    import('../utils/apiAuth').then(async ({ authHeaders }) => {
      const response = await fetch('/api/provider-billing-region', { headers: await authHeaders() })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Impossible de charger la facturation.')
      if (!cancelled) setBilling({ loading: false, regionId: data.billingRegionId || '', currency: data.currency || '', canChange: data.canChange === true })
    }).catch(() => {
      if (!cancelled) setBilling({ loading: false, regionId: '', currency: '', canChange: false })
    })
    return () => { cancelled = true }
  }, [uid])

  useEffect(() => {
    if (!uid) return undefined
    let unlistenProfile = () => {}
    let unlistenCatalog = () => {}
    import('../utils/firestore-sync').then(({ listenDoc }) => {
      unlistenProfile = listenDoc(`providers/${uid}`, remoteProfile => {
        if (!remoteProfile) return
        setProfile(remoteProfile)
        setProfileForm(providerProfileForm(remoteProfile, user?.name || '', accountTypes))
      })
      unlistenCatalog = listenDoc(`catalogs/${uid}`, data => {
        if (!data?.items) return
        const local = getCatalog(uid)
        const localTs = getCatalogUpdatedAt(uid)
        const remoteTs = data.updatedAt || ''
        // Garde anti-écrasement : un snapshot distant plus VIEUX que notre
        // dernière écriture (ou vide sans horodatage comparable) ne doit pas
        // effacer le travail local — on re-pousse le local pour réparer le serveur.
        const remoteIsStale = (remoteTs && localTs)
          ? remoteTs < localTs
          : (data.items.length === 0 && local.length > 0)
        if (remoteIsStale) {
          saveCatalog(uid, local)
          return
        }
        adoptRemoteCatalog(uid, data.items, remoteTs)
        setCatalog(data.items)
      })
    }).catch(() => {})
    return () => {
      unlistenProfile()
      unlistenCatalog()
    }
  }, [uid, user?.name])

  if (user?.role !== 'prestataire') return <Navigate to="/prestataires" replace />

  const catalogCategories = [...new Set((providerTypes.length ? providerTypes : [type]).flatMap(providerType => CATALOG_CATEGORIES[providerType] || CATALOG_CATEGORIES.autre || []))]

  function notify(message) {
    setToast(message)
    setTimeout(() => setToast(''), 2400)
  }

  // Retour depuis FedaPay (?sub=retour) : le webhook fait autorité et prolonge
  // l'abonnement ; le listener providers/{uid} mettra le statut à jour. On informe
  // juste que la confirmation peut prendre quelques secondes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('sub') === 'retour') {
      notify('Paiement reçu — ta visibilité est mise à jour dans quelques secondes.')
      window.history.replaceState({}, '', '/proposer')
    }
  }, [])

  // Lance le renouvellement : paiement ponctuel FedaPay (redirection). Aucun
  // prélèvement automatique — le prestataire déclenche lui-même.
  async function handleRenew() {
    if (renewing) return
    setRenewing(true)
    try {
      const { authHeaders } = await import('../utils/apiAuth')
      const res = await fetch('/api/fedapay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'subscribe', email: user?.email || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) {
        setRenewing(false)
        notify(data.error || 'Impossible de démarrer le paiement. Réessaie.')
        return
      }
      window.location.href = data.url
    } catch {
      setRenewing(false)
      notify('Erreur réseau. Réessaie dans un instant.')
    }
  }

  // Zone EUR : abonnement Stripe (récurrent auto). (Ré)abonnement via checkout.
  async function handleStripeSubscribe() {
    if (renewing) return
    setRenewing(true)
    try {
      const { authHeaders } = await import('../utils/apiAuth')
      const res = await fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.alreadyActive) { setRenewing(false); notify('Ton abonnement est déjà actif.'); return }
      if (res.ok && data.url) { window.location.href = data.url; return }
      setRenewing(false)
      notify(data.error || 'Impossible de démarrer le paiement. Réessaie.')
    } catch {
      setRenewing(false)
      notify('Erreur réseau. Réessaie dans un instant.')
    }
  }

  function handleSaveProfile() {
    if (!profileForm.name.trim()) {
      notify('Ajoute le nom de ta page.')
      return
    }
    const saved = saveProviderProfile({
      ...(profile || {}),
      ...profileForm,
      name: profileForm.name.trim(),
      headline: profileForm.headline.trim(),
      description: profileForm.description.trim(),
      city: profileForm.city.trim(),
      location: profileForm.city.trim(),
      country: getRegionName(profileForm.regionId),
      regionId: profileForm.regionId,
      website: (profileForm.socialLinks?.website || profileForm.website || '').trim(),
      socialLinks: SOCIAL_NETWORKS.reduce((acc, network) => {
        const value = (profileForm.socialLinks?.[network.key] || '').trim()
        if (value) acc[network.key] = value
        return acc
      }, {}),
      zonesIntervention: profileForm.zonesIntervention,
      userId: uid,
      prestataireType: type,
      prestataireTypes: providerTypes,
      updatedAt: Date.now(),
    })
    setProfile(saved)
    setProfileForm(providerProfileForm(saved, user?.name || '', accountTypes))
    import('../utils/firestore-sync').then(({ syncDoc }) => {
      syncDoc(`users/${uid}`, { prestataireType: type, prestataireTypes: providerTypes })
    }).catch(() => {})
    notify('Ta page a été enregistrée.')
  }

  function toggleProviderCategory(categoryId) {
    setProfileForm(current => {
      const selected = normalizeProviderTypes(current.prestataireTypes)
      const prestataireTypes = selected.includes(categoryId)
        ? selected.filter(value => value !== categoryId)
        : categoryId === 'autre'
          ? ['autre']
          : [...selected.filter(value => value !== 'autre'), categoryId]
      return { ...current, prestataireTypes }
    })
  }

  function toggleInterventionRegion(regionId) {
    setProfileForm(current => {
      const selected = current.zonesIntervention || []
      if (regionId === 'international') {
        return { ...current, zonesIntervention: selected.includes(regionId) ? [current.regionId] : ['international'] }
      }
      const withoutInternational = selected.filter(value => value !== 'international')
      const zonesIntervention = withoutInternational.includes(regionId)
        ? withoutInternational.filter(value => value !== regionId)
        : [...withoutInternational, regionId]
      return { ...current, zonesIntervention: zonesIntervention.length ? zonesIntervention : [current.regionId] }
    })
  }

  function handlePrimaryRegionChange(regionId) {
    setProfileForm(current => {
      const currentZones = normalizeRegionIds(current.zonesIntervention)
      const zonesIntervention = currentZones.includes('international')
        ? currentZones
        : [...new Set([regionId, ...currentZones.filter(value => value !== current.regionId)])]
      return { ...current, regionId, zonesIntervention: zonesIntervention.length ? zonesIntervention : [regionId] }
    })
  }

  function handleImage(field, file) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      notify('Utilise une image JPG, PNG ou WEBP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('L’image doit faire moins de 5 Mo.')
      return
    }
    const reader = new FileReader()
    reader.onload = async event => {
      const dataUrl = event.target.result
      setProfileForm(current => ({ ...current, [field]: dataUrl }))
      setUploading(field)
      try {
        const { uploadProviderPhoto } = await import('../utils/uploadImage')
        const url = await uploadProviderPhoto(uid, dataUrl)
        setProfileForm(current => ({ ...current, [field]: url }))
      } catch {
        try {
          const { compressDataUrl } = await import('../utils/uploadImage')
          const compressed = await compressDataUrl(dataUrl, field === 'coverUrl' ? 1100 : 500, 0.65)
          setProfileForm(current => ({ ...current, [field]: compressed }))
        } catch {}
      }
      setUploading(null)
    }
    reader.readAsDataURL(file)
  }

  function resetItemForm() {
    setNewItem({ name: '', price: '', currency: '', unit: '', category: '', description: '', available: true, media: [] })
    setShowItemForm(false)
  }

  async function handleOfferMedia(file, update) {
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    const maxSize = isVideo ? 35 * 1024 * 1024 : 8 * 1024 * 1024
    if (!isImage && !isVideo) {
      notify('Utilise une photo JPG, PNG, WEBP ou une vidéo MP4, WEBM, MOV.')
      return
    }
    if (file.size > maxSize) {
      notify(isVideo ? 'La vidéo doit faire moins de 35 Mo.' : 'La photo doit faire moins de 8 Mo.')
      return
    }
    setMediaUploading(true)
    try {
      const { uploadProviderMedia } = await import('../utils/uploadImage')
      const media = await uploadProviderMedia(uid, file)
      update(current => {
        // Migration des anciens champs mediaUrl/mediaType vers media[] par
        // RETRAIT des clés (jamais `undefined` : Firestore rejette la valeur
        // et ferait échouer la sync du catalogue entier).
        const { mediaUrl, mediaType, ...rest } = current
        return { ...rest, media: [...getOfferMedia(current), { url: media.mediaUrl, type: media.mediaType }].slice(0, 4) }
      })
      notify('Média ajouté à l’offre.')
    } catch {
      notify('Le média n’a pas pu être envoyé. Réessaie.')
    } finally {
      setMediaUploading(false)
    }
  }

  function handleAddItem() {
    if (!newItem.name.trim()) {
      notify('Donne un nom à cette offre.')
      return
    }
    addCatalogItem(uid, {
      ...newItem,
      name: newItem.name.trim(),
      description: newItem.description.trim(),
      price: newItem.price === '' ? null : Number(newItem.price),
      currency: newItem.currency === 'XOF' ? 'XOF' : catalogDefaultCurrency,
    })
    setCatalog(getCatalog(uid))
    resetItemForm()
    notify('Offre ajoutée au catalogue.')
  }

  function saveEditedItem() {
    if (!editingItem?.name?.trim()) return
    updateCatalogItem(uid, editingItem.id, {
      ...editingItem,
      name: editingItem.name.trim(),
      description: editingItem.description?.trim() || '',
      price: editingItem.price === '' || editingItem.price == null ? null : Number(editingItem.price),
      currency: editingItem.currency === 'XOF' ? 'XOF' : catalogDefaultCurrency,
    })
    setCatalog(getCatalog(uid))
    setEditingItem(null)
    notify('Offre modifiée.')
  }

  function toggleItem(item) {
    updateCatalogItem(uid, item.id, { available: item.available === false })
    setCatalog(getCatalog(uid))
  }

  function removeItem(item) {
    if (!window.confirm(`Supprimer « ${item.name} » du catalogue ?`)) return
    deleteCatalogItem(uid, item.id)
    setCatalog(getCatalog(uid))
    notify('Offre supprimée.')
  }

  return (
    <Layout>
      <style>{`
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
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 20V8l8-4 8 4v12"/><path d="M8 20v-5h8v5"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontFamily: FONT, fontSize: 25, letterSpacing: '-.5px', margin: 0 }}>Mon espace prestataire</h1>
            <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.45)', margin: '4px 0 0' }}>{category.singular} · Ta page et ton catalogue</p>
          </div>
          {profile?.userId && <button onClick={() => navigate(`/prestataires/${encodeURIComponent(uid)}`)} style={secondaryButton}>Voir ma page publique</button>}
        </header>

        {billing.loading ? (
          <section style={{ ...card, padding: 16, marginTop: 18 }}>
            <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.55)', margin: 0 }}>Chargement de tes informations de facturation...</p>
          </section>
        ) : subCurrency === 'EUR' ? (() => {
          const active = profile?.subscriptionActive === true
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
                  {active
                    ? 'Ton profil est visible. Renouvellement automatique chaque mois par carte bancaire.'
                    : 'Ton profil n\'est pas visible publiquement. Active ton abonnement pour le mettre en ligne.'}
                </p>
                <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.38)', margin: '4px 0 0' }}>9,99 € / mois · carte bancaire (Stripe) · renouvellement automatique</p>
              </div>
              {!active && (
                <button onClick={handleStripeSubscribe} disabled={renewing} style={{ ...primaryButton, ...(renewing ? disabledButton : null), whiteSpace: 'nowrap' }}>
                  {renewing ? <><span className="lib-spin" style={spinner} /> Redirection…</> : 'Activer mon abonnement'}
                </button>
              )}
            </section>
          )
        })() : (() => {
          const p = subPresentation(profile)
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
              <button onClick={handleRenew} disabled={renewing} style={{ ...primaryButton, ...(renewing ? disabledButton : null), whiteSpace: 'nowrap' }}>
                {renewing ? <><span className="lib-spin" style={spinner} /> Redirection…</> : p.cta}
              </button>
            </section>
          )
        })()}

        {!billing.loading && (
          <button onClick={() => navigate('/profil', { state: { panel: 'settings' } })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, background: 'none', border: 'none', color: C.teal, fontFamily: FONT, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            Pays de facturation : {billingRegion ? `${billingRegion.flag} ${billingRegion.name}` : 'à renseigner'} →
          </button>
        )}

        {/* Lien vers la page détaillée de l'abonnement (durée, historique, reçus). */}
        <button onClick={() => navigate('/mon-abonnement')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, background: 'none', border: 'none', color: C.teal, fontFamily: FONT, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          Détails et historique de mon abonnement →
        </button>

        <div style={{ display: 'flex', gap: 6, margin: '22px 0 16px', padding: 4, borderRadius: 13, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
          {[
            { id: 'profil', label: 'Ma page publique' },
            { id: 'catalogue', label: `Catalogue (${catalog.length})` },
            { id: 'avis', label: 'Mes avis' },
          ].map(item => (
            <button key={item.id} onClick={() => setTab(item.id)} style={{ flex: 1, minHeight: 42, borderRadius: 10, border: '1px solid transparent', background: tab === item.id ? 'rgba(255,255,255,.10)' : 'transparent', color: tab === item.id ? '#fff' : 'rgba(255,255,255,.5)', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700 }}>{item.label}</button>
          ))}
        </div>

        {tab === 'profil' && (
          <div className="provider-profile-grid">
            <section style={{ ...card, padding: 18 }}>
              <h2 style={{ fontFamily: FONT, fontSize: 20, margin: '0 0 5px' }}>Informations publiques</h2>
              <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.42)', lineHeight: 1.5, margin: '0 0 18px' }}>Ce sont les informations que les clients et organisateurs verront.</p>
              {hasUnsavedProfileChanges && (
                <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 13px', margin: '0 0 16px', borderRadius: 13, background: 'rgba(200,169,110,.10)', border: '1px solid rgba(200,169,110,.38)', color: 'rgba(255,255,255,.88)' }}>
                  <span style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', flexShrink: 0, color: C.gold, background: 'rgba(200,169,110,.12)', border: '1px solid rgba(200,169,110,.28)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
                  </span>
                  <div>
                    <strong style={{ display: 'block', fontFamily: FONT, fontSize: 13.5, color: C.gold, marginBottom: 3 }}>Modifications non enregistrées</strong>
                    <p style={{ fontFamily: FONT, fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,255,255,.64)', margin: 0 }}>Clique sur « Enregistrer ma page » pour que ces changements soient visibles sur ta page publique.</p>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Nom de la page">
                  <input style={input} value={profileForm.name} onChange={event => setProfileForm(current => ({ ...current, name: event.target.value }))} placeholder="Nom commercial ou nom de scène" />
                </Field>
                <Field label="Accroche professionnelle" helper="Une phrase courte visible en haut de ta page : spécialité, style ou promesse principale.">
                  <input style={input} maxLength={120} value={profileForm.headline} onChange={event => setProfileForm(current => ({ ...current, headline: event.target.value }))} placeholder="Ex. DJ afro-house pour soirées privées et clubs" />
                </Field>
                <Field label="Mes activités" helper="Tu peux en choisir plusieurs et les modifier à tout moment. La première sélectionnée est utilisée comme catégorie principale.">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {PROVIDER_CATEGORIES.map(item => {
                      const selected = providerTypes.includes(item.id)
                      return (
                        <button key={item.id} type="button" onClick={() => toggleProviderCategory(item.id)} style={{ padding: '8px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: selected ? item.color : 'rgba(255,255,255,.62)', background: selected ? `${item.color}18` : 'rgba(255,255,255,.04)', border: `1px solid ${selected ? `${item.color}88` : 'rgba(255,255,255,.12)'}` }}>
                          {item.singular}
                        </button>
                      )
                    })}
                  </div>
                </Field>
                <Field label="Présentation">
                  <textarea style={{ ...input, minHeight: 125, resize: 'vertical' }} value={profileForm.description} onChange={event => setProfileForm(current => ({ ...current, description: event.target.value }))} placeholder="Présente ton activité, ton style et ce qui te différencie." />
                </Field>
                <div className="provider-fields-two">
                  <Field label="Ville de base" helper="La ville depuis laquelle tu travailles le plus souvent. Elle est affichée sur ta page publique.">
                    <input style={input} value={profileForm.city} onChange={event => setProfileForm(current => ({ ...current, city: event.target.value }))} placeholder="Paris, Lomé, Cotonou…" />
                  </Field>
                  <Field label="Site principal" helper="Optionnel. Tu peux aussi le renseigner dans les réseaux sociaux plus bas.">
                    <input style={input} value={profileForm.socialLinks?.website || profileForm.website || ''} onChange={event => setProfileForm(current => ({ ...current, website: event.target.value, socialLinks: { ...(current.socialLinks || {}), website: event.target.value } }))} placeholder="https://tonsite.com" />
                  </Field>
                </div>
                <Field label="Pays de base" helper="Affiché avec ta ville sur ta page publique. Il ne modifie jamais ta facturation.">
                  <select style={input} value={profileForm.regionId} onChange={event => handlePrimaryRegionChange(event.target.value)}>
                    {regions.map(region => <option key={region.id} value={region.id}>{region.flag} {region.name}</option>)}
                  </select>
                </Field>
                <Field label="Pays / régions d’intervention" helper="Sélectionne tous les pays où tu peux te déplacer ou fournir ta prestation. Les visiteurs pourront te trouver en cherchant l’une de ces zones.">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {REGION_OPTIONS.map(region => {
                      const selected = profileForm.zonesIntervention.includes(region.id)
                      return <button key={region.id} type="button" onClick={() => toggleInterventionRegion(region.id)} style={{ padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 12, color: selected ? C.teal : 'rgba(255,255,255,.62)', background: selected ? 'rgba(78,232,200,.1)' : 'rgba(255,255,255,.04)', border: `1px solid ${selected ? 'rgba(78,232,200,.55)' : 'rgba(255,255,255,.12)'}` }}>{region.flag} {region.name}</button>
                    })}
                  </div>
                </Field>
                <Field label="Réseaux sociaux" helper="Colle un lien complet ou juste ton @pseudo. Les visiteurs verront uniquement les champs remplis.">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
                    {SOCIAL_NETWORKS.filter(network => network.key !== 'website').map(network => (
                      <label key={network.key} style={{ display: 'grid', gap: 5 }}>
                        <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,.48)' }}>{network.label}</span>
                        <input style={input} value={profileForm.socialLinks?.[network.key] || ''} onChange={event => setProfileForm(current => ({ ...current, socialLinks: { ...(current.socialLinks || {}), [network.key]: event.target.value } }))} placeholder={network.placeholder} />
                      </label>
                    ))}
                  </div>
                </Field>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={handleSaveProfile} disabled={!!uploading} style={{ ...primaryButton, alignSelf: 'flex-start', ...(uploading ? disabledButton : null) }}>{uploading ? <><span className="lib-spin" style={spinner} /> Envoi de l’image…</> : 'Enregistrer ma page'}</button>
                  {hasUnsavedProfileChanges && <span style={{ fontFamily: FONT, fontSize: 12, color: C.gold }}>À enregistrer pour publier les changements</span>}
                </div>
              </div>
            </section>

            <aside style={{ ...card, overflow: 'hidden', alignSelf: 'start' }}>
              <button type="button" onClick={() => coverInputRef.current?.click()} style={{ width: '100%', height: 150, position: 'relative', display: 'block', padding: 0, border: 0, cursor: 'pointer', background: profileForm.coverUrl ? `url(${profileForm.coverUrl}) center/cover` : `linear-gradient(135deg,${category.color}55,rgba(8,10,20,.95))` }} aria-label="Modifier la photo de couverture">
                <span style={{ position: 'absolute', right: 10, top: 10, padding: '6px 9px', borderRadius: 8, background: 'rgba(4,4,11,.82)', color: '#fff', fontFamily: FONT, fontSize: 11, fontWeight: 700 }}>Modifier la couverture</span>
              </button>
              <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { handleImage('coverUrl', event.target.files?.[0]); event.target.value = '' }} />
              <div style={{ padding: '0 18px 19px', marginTop: -38, position: 'relative' }}>
                <button type="button" onClick={() => avatarInputRef.current?.click()} style={{ width: 78, height: 78, borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center', padding: 0, border: '4px solid #090b14', background: category.color, color: C.obsidian, cursor: 'pointer', fontFamily: FONT, fontSize: 28, fontWeight: 900 }} aria-label="Modifier la photo de profil">
                  {profileForm.photoUrl ? <img src={profileForm.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : profileForm.name?.charAt(0)?.toUpperCase() || '?'}
                </button>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { handleImage('photoUrl', event.target.files?.[0]); event.target.value = '' }} />
                <h3 style={{ fontFamily: FONT, fontSize: 20, margin: '11px 0 0' }}>{profileForm.name || 'Nom de ta page'}</h3>
                {profileForm.headline && <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,.82)', lineHeight: 1.4, margin: '7px 0 0' }}>{profileForm.headline}</p>}
                <p style={{ fontFamily: FONT, fontSize: 12, fontWeight: 800, color: category.color, margin: '5px 0 0' }}>
                  {(providerTypes.length ? providerTypes : ['autre']).map(value => getProviderCategory(value).singular).join(' · ')}
                </p>
                <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.5)', lineHeight: 1.55, margin: '12px 0 0' }}>{profileForm.description || 'Ta présentation apparaîtra ici.'}</p>
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
              {!showItemForm && <button onClick={() => setShowItemForm(true)} style={primaryButton}>Ajouter une offre</button>}
            </div>

            {showItemForm && (
              <div style={{ ...card, padding: 18, marginBottom: 14 }}>
                <h3 style={{ fontFamily: FONT, fontSize: 18, margin: '0 0 14px' }}>Nouvelle offre</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Field label="Nom de l’offre">
                    <input style={input} value={newItem.name} onChange={event => setNewItem(current => ({ ...current, name: event.target.value }))} placeholder="DJ set 3 heures, location de salle…" />
                  </Field>
                  <div className="provider-fields-two">
                    <Field label="Tarif indicatif" helper="Laisse vide pour afficher « Tarif sur demande ».">
                      <input type="number" min="0" style={input} value={newItem.price} onChange={event => setNewItem(current => ({ ...current, price: event.target.value }))} placeholder="Optionnel" />
                    </Field>
                    <Field label="Devise">
                      <select style={input} value={newItem.currency || catalogDefaultCurrency} onChange={event => setNewItem(current => ({ ...current, currency: event.target.value }))}>
                        <option value="EUR">Euro (€)</option>
                        <option value="XOF">Franc CFA (FCFA)</option>
                      </select>
                    </Field>
                    <Field label="Unité">
                      <select style={input} value={newItem.unit} onChange={event => setNewItem(current => ({ ...current, unit: event.target.value }))}>
                        <option value="">Aucune</option>
                        {['heure', 'soirée', 'jour', 'personne', 'unité', 'lot', 'forfait'].map(value => <option key={value} value={value}>par {value}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Catégorie">
                    <select style={input} value={newItem.category} onChange={event => setNewItem(current => ({ ...current, category: event.target.value }))}>
                      <option value="">Sans catégorie</option>
                      {catalogCategories.map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </Field>
                  <Field label="Description">
                    <textarea style={{ ...input, minHeight: 96, resize: 'vertical' }} value={newItem.description} onChange={event => setNewItem(current => ({ ...current, description: event.target.value }))} placeholder="Ce qui est inclus, durée, conditions principales…" />
                  </Field>
                  <OfferMediaField
                    media={getOfferMedia(newItem)}
                    uploading={mediaUploading}
                    onSelect={file => handleOfferMedia(file, setNewItem)}
                    onRemove={index => setNewItem(current => ({ ...current, media: getOfferMedia(current).filter((_, mediaIndex) => mediaIndex !== index) }))}
                  />
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={handleAddItem} disabled={mediaUploading} style={{ ...primaryButton, ...(mediaUploading ? disabledButton : null) }}>Publier dans le catalogue</button>
                    <button onClick={resetItemForm} disabled={mediaUploading} style={secondaryButton}>Annuler</button>
                  </div>
                </div>
              </div>
            )}

            {catalog.length === 0 && !showItemForm ? <EmptyCatalog onAdd={() => setShowItemForm(true)} /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {catalog.map(item => editingItem?.id === item.id ? (
                  <div key={item.id} style={{ ...card, padding: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input style={input} value={editingItem.name} onChange={event => setEditingItem(current => ({ ...current, name: event.target.value }))} />
                      <div className="provider-fields-two">
                        <input type="number" min="0" style={input} value={editingItem.price ?? ''} onChange={event => setEditingItem(current => ({ ...current, price: event.target.value }))} placeholder="Tarif sur demande" />
                        <select style={input} value={editingItem.currency || catalogDefaultCurrency} onChange={event => setEditingItem(current => ({ ...current, currency: event.target.value }))} aria-label="Devise du tarif">
                          <option value="EUR">€</option>
                          <option value="XOF">FCFA</option>
                        </select>
                        <select style={input} value={editingItem.unit || ''} onChange={event => setEditingItem(current => ({ ...current, unit: event.target.value }))}>
                          <option value="">Aucune unité</option>
                          {['heure', 'soirée', 'jour', 'personne', 'unité', 'lot', 'forfait'].map(value => <option key={value} value={value}>par {value}</option>)}
                        </select>
                      </div>
                      <textarea style={{ ...input, minHeight: 86, resize: 'vertical' }} value={editingItem.description || ''} onChange={event => setEditingItem(current => ({ ...current, description: event.target.value }))} />
                      <OfferMediaField
                        media={getOfferMedia(editingItem)}
                        uploading={mediaUploading}
                        onSelect={file => handleOfferMedia(file, setEditingItem)}
                        onRemove={index => setEditingItem(current => { const { mediaUrl, mediaType, ...rest } = current; return { ...rest, media: getOfferMedia(current).filter((_, mediaIndex) => mediaIndex !== index) } })}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={saveEditedItem} disabled={mediaUploading} style={{ ...primaryButton, ...(mediaUploading ? disabledButton : null) }}>Enregistrer</button>
                        <button onClick={() => setEditingItem(null)} disabled={mediaUploading} style={secondaryButton}>Annuler</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <article key={item.id} className="provider-catalog-item" style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', gap: 14, opacity: item.available === false ? .58 : 1 }}>
                    {getOfferMedia(item)[0] && (
                      getOfferMedia(item)[0].type === 'video'
                        ? <video src={getOfferMedia(item)[0].url} preload="metadata" muted playsInline style={{ width: 96, height: 74, borderRadius: 10, objectFit: 'cover', background: '#05060b', flexShrink: 0 }} />
                        : <img src={getOfferMedia(item)[0].url} alt="" style={{ width: 96, height: 74, borderRadius: 10, objectFit: 'cover', background: '#05060b', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ fontFamily: FONT, fontSize: 17, margin: 0 }}>{item.name}</h3>
                        <span style={{ padding: '3px 9px', borderRadius: 8, fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: item.available === false ? 'rgba(255,255,255,.5)' : C.teal, background: item.available === false ? 'rgba(255,255,255,.07)' : 'rgba(78,232,200,.12)', border: `1px solid ${item.available === false ? 'rgba(255,255,255,.14)' : 'rgba(78,232,200,.35)'}` }}>{item.available === false ? 'Masquée' : 'Publiée'}</span>
                      </div>
                      <p style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 800, color: C.gold, margin: '6px 0 0' }}>{Number(item.price) > 0 ? `${fmtMoney(Number(item.price), item.currency || catalogDefaultCurrency)}${item.unit ? ` / ${item.unit}` : ''}` : 'Tarif sur demande'}</p>
                      {item.description && <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.46)', lineHeight: 1.5, margin: '6px 0 0' }}>{item.description}</p>}
                    </div>
                    <div className="provider-catalog-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button onClick={() => toggleItem(item)} style={secondaryButton}>{item.available === false ? 'Publier' : 'Masquer'}</button>
                      <button onClick={() => setEditingItem({ ...item })} style={secondaryButton}>Modifier</button>
                      <button onClick={() => removeItem(item)} style={{ ...secondaryButton, color: '#ff9ed2', border: '1px solid rgba(224,90,170,.55)', background: 'rgba(224,90,170,.14)' }}>Supprimer</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'avis' && <MyProviderReviews uid={uid} />}
      </main>

      {toast && <div role="status" style={{ position: 'fixed', zIndex: 100, left: '50%', bottom: 84, transform: 'translateX(-50%)', maxWidth: 'calc(100vw - 32px)', padding: '11px 16px', borderRadius: 12, background: 'rgba(12,12,22,.96)', border: '1px solid rgba(200,169,110,.5)', color: '#fff', fontFamily: FONT, fontSize: 12.5, boxShadow: '0 16px 44px rgba(0,0,0,.4)' }}>{toast}</div>}
    </Layout>
  )
}
