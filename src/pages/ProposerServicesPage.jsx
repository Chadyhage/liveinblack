import { useEffect, useRef, useState } from 'react'
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
import { getProviderCategory, normalizeProviderType } from '../utils/providerCategories'

const FONT = 'Inter, system-ui, sans-serif'
const C = { obsidian: '#04040b', teal: '#4ee8c8', gold: '#c8a96e', pink: '#e05aaa' }

const card = {
  background: 'rgba(8,10,20,.62)',
  border: '1px solid rgba(255,255,255,.09)',
  borderRadius: 16,
  backdropFilter: 'blur(20px)',
}
const input = {
  width: '100%',
  minHeight: 46,
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: 11,
  border: '1px solid rgba(255,255,255,.13)',
  background: 'rgba(255,255,255,.045)',
  color: '#fff',
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
  padding: '11px 17px',
  border: 'none',
  borderRadius: 11,
  cursor: 'pointer',
  background: `linear-gradient(135deg,${C.gold},#e0c48a)`,
  color: C.obsidian,
  fontFamily: FONT,
  fontSize: 13,
  fontWeight: 800,
}

const secondaryButton = {
  ...primaryButton,
  background: 'rgba(255,255,255,.05)',
  border: '1px solid rgba(255,255,255,.13)',
  color: 'rgba(255,255,255,.82)',
}

function Field({ label, helper, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,.7)', marginBottom: 7 }}>{label}</span>
      {children}
      {helper && <span style={{ display: 'block', fontFamily: FONT, fontSize: 10.5, color: 'rgba(255,255,255,.35)', lineHeight: 1.5, marginTop: 6 }}>{helper}</span>}
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
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} style={{ width: '100%', minHeight: 104, borderRadius: 13, border: '1px dashed rgba(255,255,255,.18)', background: 'rgba(255,255,255,.025)', color: uploading ? C.gold : 'rgba(255,255,255,.55)', cursor: uploading ? 'wait' : 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700 }}>
          {uploading ? 'Envoi du média…' : `+ Ajouter une photo ou une vidéo${media.length ? ` (${media.length}/4)` : ''}`}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" hidden onChange={event => { onSelect(event.target.files?.[0]); event.target.value = '' }} />
      <span style={{ display: 'block', fontFamily: FONT, fontSize: 10.5, color: 'rgba(255,255,255,.35)', lineHeight: 1.5, marginTop: 6 }}>JPG, PNG ou WEBP jusqu’à 8 Mo · MP4, WEBM ou MOV jusqu’à 35 Mo.</span>
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

export default function ProposerServicesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = getUserId(user)
  const type = normalizeProviderType(user?.prestataireType)
  const category = getProviderCategory(type)
  const [tab, setTab] = useState('profil')
  const [profile, setProfile] = useState(() => getProviderProfile(uid))
  const [catalog, setCatalog] = useState(() => getCatalog(uid))
  const [profileForm, setProfileForm] = useState(() => ({
    name: profile?.name || user?.name || '',
    description: profile?.description || '',
    location: profile?.location || '',
    website: profile?.website || '',
    zonesIntervention: profile?.zonesIntervention || [],
    photoUrl: profile?.photoUrl || '',
    coverUrl: profile?.coverUrl || '',
  }))
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [newItem, setNewItem] = useState({ name: '', price: '', unit: '', category: '', description: '', available: true, media: [] })
  const [uploading, setUploading] = useState(null)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [toast, setToast] = useState('')
  const avatarInputRef = useRef(null)
  const coverInputRef = useRef(null)

  useEffect(() => {
    if (!uid) return undefined
    let unlistenProfile = () => {}
    let unlistenCatalog = () => {}
    import('../utils/firestore-sync').then(({ listenDoc }) => {
      unlistenProfile = listenDoc(`providers/${uid}`, remoteProfile => {
        if (!remoteProfile) return
        setProfile(remoteProfile)
        setProfileForm({
          name: remoteProfile.name || user?.name || '',
          description: remoteProfile.description || '',
          location: remoteProfile.location || '',
          website: remoteProfile.website || '',
          zonesIntervention: remoteProfile.zonesIntervention || [],
          photoUrl: remoteProfile.photoUrl || '',
          coverUrl: remoteProfile.coverUrl || '',
        })
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

  const catalogCategories = CATALOG_CATEGORIES[type] || []

  function notify(message) {
    setToast(message)
    setTimeout(() => setToast(''), 2400)
  }

  function handleSaveProfile() {
    if (!profileForm.name.trim()) {
      notify('Ajoute le nom de ta page.')
      return
    }
    const saved = {
      ...(profile || {}),
      ...profileForm,
      name: profileForm.name.trim(),
      description: profileForm.description.trim(),
      location: profileForm.location.trim(),
      website: profileForm.website.trim(),
      zonesIntervention: profileForm.zonesIntervention,
      userId: uid,
      prestataireType: type,
      updatedAt: Date.now(),
    }
    saveProviderProfile(saved)
    setProfile(saved)
    notify('Ta page a été enregistrée.')
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
    setNewItem({ name: '', price: '', unit: '', category: '', description: '', available: true, media: [] })
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

        <div style={{ display: 'flex', gap: 6, margin: '22px 0 16px', padding: 4, borderRadius: 13, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)' }}>
          {[
            { id: 'profil', label: 'Ma page publique' },
            { id: 'catalogue', label: `Catalogue (${catalog.length})` },
          ].map(item => (
            <button key={item.id} onClick={() => setTab(item.id)} style={{ flex: 1, minHeight: 42, borderRadius: 9, border: tab === item.id ? `1px solid ${category.color}55` : '1px solid transparent', background: tab === item.id ? `${category.color}15` : 'transparent', color: tab === item.id ? category.color : 'rgba(255,255,255,.5)', cursor: 'pointer', fontFamily: FONT, fontSize: 12.5, fontWeight: 800 }}>{item.label}</button>
          ))}
        </div>

        {tab === 'profil' && (
          <div className="provider-profile-grid">
            <section style={{ ...card, padding: 18 }}>
              <h2 style={{ fontFamily: FONT, fontSize: 20, margin: '0 0 5px' }}>Informations publiques</h2>
              <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,.42)', lineHeight: 1.5, margin: '0 0 18px' }}>Ce sont les informations que les clients et organisateurs verront.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Nom de la page">
                  <input style={input} value={profileForm.name} onChange={event => setProfileForm(current => ({ ...current, name: event.target.value }))} placeholder="Nom commercial ou nom de scène" />
                </Field>
                <Field label="Présentation">
                  <textarea style={{ ...input, minHeight: 125, resize: 'vertical' }} value={profileForm.description} onChange={event => setProfileForm(current => ({ ...current, description: event.target.value }))} placeholder="Présente ton activité, ton style et ce qui te différencie." />
                </Field>
                <div className="provider-fields-two">
                  <Field label="Ville ou zone principale">
                    <input style={input} value={profileForm.location} onChange={event => setProfileForm(current => ({ ...current, location: event.target.value }))} placeholder="Paris, Lyon, France entière…" />
                  </Field>
                  <Field label="Site ou réseau social" helper="Optionnel. Le contact principal reste la messagerie LIVE IN BLACK.">
                    <input style={input} value={profileForm.website} onChange={event => setProfileForm(current => ({ ...current, website: event.target.value }))} placeholder="instagram.com/tonprofil" />
                  </Field>
                </div>
                <Field label="Zones d’intervention" helper="Sépare les zones par des virgules.">
                  <input style={input} value={profileForm.zonesIntervention.join(', ')} onChange={event => setProfileForm(current => ({ ...current, zonesIntervention: event.target.value.split(',').map(value => value.trim()).filter(Boolean) }))} placeholder="Île-de-France, Hauts-de-France…" />
                </Field>
                <button onClick={handleSaveProfile} disabled={!!uploading} style={{ ...primaryButton, alignSelf: 'flex-start', opacity: uploading ? .6 : 1 }}>{uploading ? 'Envoi de l’image…' : 'Enregistrer ma page'}</button>
              </div>
            </section>

            <aside style={{ ...card, overflow: 'hidden', alignSelf: 'start' }}>
              <button type="button" onClick={() => coverInputRef.current?.click()} style={{ width: '100%', height: 150, position: 'relative', display: 'block', padding: 0, border: 0, cursor: 'pointer', background: profileForm.coverUrl ? `url(${profileForm.coverUrl}) center/cover` : `linear-gradient(135deg,${category.color}55,rgba(8,10,20,.95))` }} aria-label="Modifier la photo de couverture">
                <span style={{ position: 'absolute', right: 10, top: 10, padding: '6px 9px', borderRadius: 8, background: 'rgba(4,4,11,.75)', color: '#fff', fontFamily: FONT, fontSize: 10.5, fontWeight: 700 }}>Modifier la couverture</span>
              </button>
              <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { handleImage('coverUrl', event.target.files?.[0]); event.target.value = '' }} />
              <div style={{ padding: '0 18px 19px', marginTop: -38, position: 'relative' }}>
                <button type="button" onClick={() => avatarInputRef.current?.click()} style={{ width: 78, height: 78, borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center', padding: 0, border: '4px solid #090b14', background: category.color, color: C.obsidian, cursor: 'pointer', fontFamily: FONT, fontSize: 28, fontWeight: 900 }} aria-label="Modifier la photo de profil">
                  {profileForm.photoUrl ? <img src={profileForm.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : profileForm.name?.charAt(0)?.toUpperCase() || '?'}
                </button>
                <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { handleImage('photoUrl', event.target.files?.[0]); event.target.value = '' }} />
                <h3 style={{ fontFamily: FONT, fontSize: 20, margin: '11px 0 0' }}>{profileForm.name || 'Nom de ta page'}</h3>
                <p style={{ fontFamily: FONT, fontSize: 12, fontWeight: 800, color: category.color, margin: '5px 0 0' }}>{category.singular}</p>
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
                    <button onClick={handleAddItem} disabled={mediaUploading} style={{ ...primaryButton, opacity: mediaUploading ? .6 : 1 }}>Publier dans le catalogue</button>
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
                        <button onClick={saveEditedItem} disabled={mediaUploading} style={{ ...primaryButton, opacity: mediaUploading ? .6 : 1 }}>Enregistrer</button>
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
                        <span style={{ padding: '3px 7px', borderRadius: 999, fontFamily: FONT, fontSize: 9.5, fontWeight: 800, color: item.available === false ? 'rgba(255,255,255,.45)' : C.teal, background: item.available === false ? 'rgba(255,255,255,.06)' : 'rgba(78,232,200,.08)' }}>{item.available === false ? 'Masquée' : 'Publiée'}</span>
                      </div>
                      <p style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 800, color: C.gold, margin: '6px 0 0' }}>{Number(item.price) > 0 ? `${Number(item.price).toLocaleString('fr-FR')} €${item.unit ? ` / ${item.unit}` : ''}` : 'Tarif sur demande'}</p>
                      {item.description && <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.46)', lineHeight: 1.5, margin: '6px 0 0' }}>{item.description}</p>}
                    </div>
                    <div className="provider-catalog-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button onClick={() => toggleItem(item)} style={secondaryButton}>{item.available === false ? 'Publier' : 'Masquer'}</button>
                      <button onClick={() => setEditingItem({ ...item })} style={secondaryButton}>Modifier</button>
                      <button onClick={() => removeItem(item)} style={{ ...secondaryButton, color: '#ff8aaa', borderColor: 'rgba(224,90,170,.28)' }}>Supprimer</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {toast && <div role="status" style={{ position: 'fixed', zIndex: 100, left: '50%', bottom: 84, transform: 'translateX(-50%)', maxWidth: 'calc(100vw - 32px)', padding: '11px 16px', borderRadius: 11, background: 'rgba(8,10,20,.96)', border: '1px solid rgba(200,169,110,.38)', color: '#fff', fontFamily: FONT, fontSize: 12.5, boxShadow: '0 16px 44px rgba(0,0,0,.4)' }}>{toast}</div>}
    </Layout>
  )
}
