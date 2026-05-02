import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { services } from '../data/events'
import { getUserId, createDirectConversation, sendMessage } from '../utils/messaging'
// Note : les commandes de services entre orga ↔ prestataire sont prises en charge
// via la messagerie. Le paiement réel sera ajouté en V2 via Stripe Connect.
import {
  getCatalog, addCatalogItem, updateCatalogItem, deleteCatalogItem,
  getOrdersForSeller, getOrdersForBuyer, placeOrder, updateOrderStatus,
  getProviderProfile, saveProviderProfile, getAllProviderProfiles,
  CATALOG_CATEGORIES, ORDER_STATUS_LABELS,
} from '../utils/services'
import { requestAdditionalRole, PRESTATAIRE_TYPES, cancelRoleRequest } from '../utils/accounts'
import { IconHourglass } from '../components/icons'

const CATEGORIES = [
  {
    id: 'salle',
    icon: 'building',
    title: "J'ai une salle / un lieu à louer",
    color: '#7b2fff',
    desc: "Propriétaires d'espaces, salles, terrains pour événements",
    fields: [
      { label: 'Nom du lieu', placeholder: 'Ex: Le Loft Parisien', type: 'text', required: true },
      { label: 'Adresse complète', placeholder: '12 rue de la Paix, Paris', type: 'text', required: true },
      { label: 'Capacité maximale', placeholder: 'Ex: 300 personnes', type: 'number', required: true },
      { label: 'Surface (m²)', placeholder: 'Ex: 450', type: 'number' },
      { label: 'Tarif de base (€/soir)', placeholder: 'Ex: 800', type: 'number', required: true },
      { label: 'Description du lieu', placeholder: 'Décris ton espace, les équipements...', type: 'textarea' },
    ],
    extras: ['Sono incluse', 'Parking', 'Cuisine pro', 'Climatisation', 'Sécurité incluse', 'Rooftop', 'Piste de danse'],
    legalDocs: ['Attestation propriété / bail commercial', 'Assurance responsabilité civile', 'Autorisation ERP si applicable'],
  },
  {
    id: 'prestation',
    icon: 'mic',
    title: 'Je donne des prestations',
    color: '#ff6b1a',
    desc: 'Artistes, animateurs, DJs, cracheurs de feu, comédiens...',
    fields: [
      { label: 'Nom ou nom de scène', placeholder: 'Ex: DJ Kass One', type: 'text', required: true },
      { label: 'Type de prestation', placeholder: 'Ex: DJ, Cracheur de feu, Danseur...', type: 'text', required: true },
      { label: "Ville(s) d'intervention", placeholder: 'Ex: Paris, Lyon, Marseille', type: 'text' },
      { label: 'Tarif à partir de (€)', placeholder: 'Ex: 300', type: 'number', required: true },
      { label: 'Bio / description', placeholder: 'Présente-toi, ton style, ton expérience...', type: 'textarea' },
      { label: 'Lien réseau social ou site', placeholder: 'Instagram, SoundCloud...', type: 'text' },
    ],
    extras: ['Disponible week-end', 'Matériel propre', 'Prestation extérieure', 'Équipe (groupe)', 'Vidéo available'],
    legalDocs: ["Pièce d'identité", 'SIRET ou statut auto-entrepreneur si applicable', "Attestation d'assurance"],
  },
  {
    id: 'materiel',
    icon: 'speaker',
    title: "J'ai du matériel à louer",
    color: '#00c9a7',
    desc: 'Sono, lumières, scènes, mobilier événementiel...',
    fields: [
      { label: 'Type de matériel', placeholder: 'Ex: Sono, Jeux de lumières, Tables...', type: 'text', required: true },
      { label: 'Marque / Modèle', placeholder: 'Ex: Pioneer CDJ-2000NXS2', type: 'text' },
      { label: 'Quantité disponible', placeholder: 'Ex: 2', type: 'number' },
      { label: 'Tarif de location (€/jour)', placeholder: 'Ex: 150', type: 'number', required: true },
      { label: 'Zone de livraison', placeholder: 'Ex: Île-de-France', type: 'text' },
      { label: 'Description', placeholder: "Décris le matériel, l'état, les conditions...", type: 'textarea' },
    ],
    extras: ['Livraison incluse', 'Installation comprise', 'Technicien fourni', 'Assurance incluse'],
    legalDocs: ['Justificatif de propriété', 'Assurance du matériel', 'SIRET si professionnel'],
  },
  {
    id: 'supermarche',
    icon: 'cart',
    title: 'Je suis un supermarché',
    color: '#c8a96e',
    desc: 'Fournisseurs de boissons, alcools, consommables événementiels',
    fields: [
      { label: "Nom de l'enseigne", placeholder: 'Ex: Nicolas, Carrefour Pro...', type: 'text', required: true },
      { label: 'Adresse', placeholder: 'Adresse complète', type: 'text', required: true },
      { label: 'Zone de livraison', placeholder: 'Ex: Paris intramuros, Île-de-France', type: 'text' },
      { label: 'Délai de livraison minimum', placeholder: "Ex: 48h avant l'événement", type: 'text' },
      { label: 'Description', placeholder: 'Présentation de votre enseigne...', type: 'textarea' },
    ],
    extras: ['Livraison à domicile', 'Réfrigération disponible', 'Glace incluse', 'Click & Collect', 'Alcool certifié'],
    legalDocs: ['Licence de débit de boissons', 'SIRET', 'Assurance professionnelle'],
  },
]

const STATIC_PROVIDERS = [
  ...services.salles.map(s => ({
    id: `salle_${s.id}`, type: 'salle', icon: 'building', color: '#7b2fff',
    name: s.name, typeLabel: 'Salle / Lieu', description: s.description,
    price: s.price, location: `${s.owner} · ${s.location}`, capacity: `${s.capacity} pers.`,
    rating: s.rating, tags: s.tags, pending: false,
  })),
  ...services.prestations.map(p => ({
    id: `presta_${p.id}`, type: 'prestation', icon: 'mic', color: '#ff6b1a',
    name: p.name, typeLabel: p.type, description: '', price: p.price,
    location: '', rating: p.rating, tags: p.tags, pending: false,
  })),
]

function getCreatedProviders() {
  try { return JSON.parse(localStorage.getItem('lib_created_providers') || '[]') } catch { return [] }
}

// ── Style tokens ───────────────────────────────────────────────────────────────
const S = {
  card: {
    background: 'rgba(8,10,20,0.55)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
  },
  inputBase: {
    background: 'rgba(6,8,16,0.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    padding: '10px 14px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  },
  label: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 9,
    letterSpacing: '0.35em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.28)',
    display: 'block',
    marginBottom: 6,
  },
  btnGold: {
    padding: '13px 28px',
    background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
    border: '1px solid rgba(200,169,110,0.45)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: '#c8a96e',
    cursor: 'pointer',
    width: '100%',
  },
  btnGhost: {
    padding: '13px 28px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
    width: '100%',
  },
  btnPrimary: {
    padding: '13px 28px',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 50%, rgba(78,232,200,0.12) 100%)',
    border: '1px solid rgba(255,255,255,0.28)',
    borderRadius: 4,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'white',
    cursor: 'pointer',
    width: '100%',
  },
}

// ── Eyebrow heading helper ──────────────────────────────────────────────────────
function Eyebrow({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ width: 28, height: 1, background: '#4ee8c8', flexShrink: 0 }} />
      <span style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: 9,
        letterSpacing: '0.4em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.25)',
      }}>{children}</span>
    </div>
  )
}

// ── SVG icon map ───────────────────────────────────────────────────────────────
function CatIcon({ id, color = 'currentColor', size = 22 }) {
  const icons = {
    building: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><rect x="2" y="3" width="20" height="18" rx="1"/><path d="M9 21V12h6v9"/><path d="M2 9h20"/></svg>,
    mic: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
    speaker: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><circle cx="12" cy="8" r="1" fill={color}/></svg>,
    cart: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/></svg>,
  }
  return icons[id] || icons.mic
}

function FocusInput({ style = {}, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      {...props}
      style={{
        ...S.inputBase,
        borderColor: focused ? '#4ee8c8' : 'rgba(255,255,255,0.10)',
        boxShadow: focused ? '0 0 0 3px rgba(78,232,200,0.06)' : 'none',
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 44, height: 24, borderRadius: 12,
        background: value ? '#4ee8c8' : 'rgba(255,255,255,0.08)',
        position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 4, width: 16, height: 16,
        background: 'white', borderRadius: '50%', transition: 'left 0.2s',
        left: value ? 24 : 4, boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════

export default function ProposerServicesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const uid = getUserId(user)

  if (user?.role === 'prestataire' || user?.role === 'organisateur') {
    return <PrestataireDashboard user={user} navigate={navigate} />
  }

  if (user?.role === 'agent') {
    return <PublicServicesView user={user} uid={uid} navigate={navigate} agentMode />
  }

  return <PublicServicesView user={user} uid={uid} navigate={navigate} />
}

// ══════════════════════════════════════════════════════════════════════════════
// PRESTATAIRE DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

function PrestataireDashboard({ user, navigate }) {
  const uid = getUserId(user)
  const prestType = user?.prestataireType || 'prestation'
  const catConfig = CATEGORIES.find(c => c.id === prestType) || CATEGORIES[1]
  const [tab, setTab] = useState('apercu')
  const [catalog, setCatalog] = useState(() => getCatalog(uid))
  const [orders, setOrders] = useState(() => getOrdersForSeller(uid))
  const [profile, setProfile] = useState(() => getProviderProfile(uid))
  const [showAddItem, setShowAddItem] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [orderFilter, setOrderFilter] = useState('all') // all | pending | confirmed | done | cancelled
  const [newItem, setNewItem] = useState({ name: '', price: '', category: '', unit: 'unité', description: '', available: true })
  const [toast, setToast] = useState(null)
  const photoInputRef = useRef(null)

  const [profileFormMode, setProfileFormMode] = useState(!profile)
  const [profileForm, setProfileForm] = useState(profile || {
    name: user?.name || '',
    type: prestType,
    description: '',
    location: '',
    phone: user?.phone || '',
    website: '',
    tags: [],
  })

  const categories = CATALOG_CATEGORIES[prestType] || CATALOG_CATEGORIES.prestation

  // Re-sync catalog + orders from Firestore on mount (syncOnLogin may complete after initial render)
  useEffect(() => {
    if (!uid) return
    // Direct Firestore fetch for this user's catalog
    import('../firebase').then(({ USE_REAL_FIREBASE, db }) => {
      if (!USE_REAL_FIREBASE) return
      import('firebase/firestore').then(({ doc, getDoc }) => {
        getDoc(doc(db, 'catalogs', uid)).then(snap => {
          if (snap.exists()) {
            const items = snap.data().items || []
            if (items.length > 0) {
              localStorage.setItem(`lib_catalog_${uid}`, JSON.stringify(items))
              setCatalog(items)
            }
          }
        }).catch(() => {})
      }).catch(() => {})
    }).catch(() => {})
    // Re-read orders after a short delay
    const t = setTimeout(() => setOrders(getOrdersForSeller(uid)), 1000)
    return () => clearTimeout(t)
  }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500) }

  function refreshData() {
    setCatalog(getCatalog(uid))
    setOrders(getOrdersForSeller(uid))
  }

  function handleSaveProfile() {
    const saved = { ...profileForm, userId: uid, prestataireType: prestType, updatedAt: Date.now() }
    saveProviderProfile(saved)
    setProfile(saved)
    setProfileFormMode(false)
    showToast('Profil mis à jour')
  }

  function handleAddItem() {
    if (!newItem.name.trim() || !newItem.price) return
    addCatalogItem(uid, { ...newItem, price: parseFloat(newItem.price) })
    setNewItem({ name: '', price: '', category: '', unit: 'unité', description: '', available: true })
    setShowAddItem(false)
    setCatalog(getCatalog(uid))
    showToast('Article ajouté')
  }

  function handleSaveEdit() {
    if (!editItem) return
    updateCatalogItem(uid, editItem.id, editItem)
    setEditItem(null)
    setCatalog(getCatalog(uid))
    showToast('Modifié')
  }

  function handleDeleteItem(itemId) {
    deleteCatalogItem(uid, itemId)
    setCatalog(getCatalog(uid))
    showToast('Supprimé')
  }

  function handleToggleAvailability(item) {
    updateCatalogItem(uid, item.id, { available: !item.available })
    setCatalog(getCatalog(uid))
  }

  // ── Métriques dashboard ──
  const pendingOrders = orders.filter(o => o.status === 'pending').length
  const confirmedOrders = orders.filter(o => o.status === 'confirmed').length
  const revenue = orders.filter(o => o.status === 'done').reduce((s, o) => s + o.sellerReceives, 0)
  // Revenus 30 derniers jours
  const monthAgo = Date.now() - 30 * 24 * 3600 * 1000
  const revenue30d = orders
    .filter(o => o.status === 'done' && o.createdAt >= monthAgo)
    .reduce((s, o) => s + o.sellerReceives, 0)
  // Actifs / publiés
  const availableItems = catalog.filter(i => i.available).length
  // Score de complétion du profil
  const profileCompletion = (() => {
    if (!profile) return 0
    let score = 0
    if (profile.name) score += 20
    if (profile.description && profile.description.length > 20) score += 30
    if (profile.location) score += 20
    if (profile.phone) score += 15
    if (catalog.length > 0) score += 15
    return Math.min(100, score)
  })()
  // Données 7 derniers jours pour mini-graph
  const last7Days = (() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - (6 - i))
      const dayStart = d.getTime()
      const dayEnd = dayStart + 24 * 3600 * 1000
      const dayRevenue = orders
        .filter(o => o.status === 'done' && o.createdAt >= dayStart && o.createdAt < dayEnd)
        .reduce((s, o) => s + o.sellerReceives, 0)
      return { date: d, revenue: dayRevenue, label: d.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 2).toUpperCase() }
    })
  })()
  const maxDayRevenue = Math.max(...last7Days.map(d => d.revenue), 1)
  const recentPendingOrders = orders.filter(o => o.status === 'pending').slice(0, 3)

  return (
    <Layout>
      <div style={{ position: 'relative', zIndex: 1, background: 'transparent', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 8,
            background: catConfig.color + '18', border: `1px solid ${catConfig.color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <CatIcon id={catConfig.icon} color={catConfig.color} size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
              {profile?.name || user?.name}
            </p>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.42)', marginTop: 2, margin: 0 }}>
              {catConfig.title.replace("J'ai", '').replace("Je suis", '').replace("Je donne des", '').trim()}
            </p>
          </div>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em',
            padding: '3px 10px', borderRadius: 3, border: '1px solid',
            ...(user?.status === 'active'
              ? { color: '#4ee8c8', borderColor: 'rgba(78,232,200,0.30)', background: 'rgba(78,232,200,0.06)' }
              : { color: '#c8a96e', borderColor: 'rgba(200,169,110,0.30)', background: 'rgba(200,169,110,0.06)' }),
          }}>
            {user?.status === 'active' ? 'ACTIF' : 'EN ATTENTE'}
          </span>
        </div>

        {/* Stats — 4 KPI cards (mois en cours mis en avant) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {/* Revenus 30 jours — la plus importante */}
          <div style={{ ...S.card, padding: 16, gridColumn: '1 / 3', borderColor: 'rgba(200,169,110,0.30)', background: 'linear-gradient(135deg, rgba(200,169,110,0.08), rgba(200,169,110,0.02))' }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(200,169,110,0.7)', margin: 0 }}>
              Revenus — 30 derniers jours
            </p>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 300, color: '#c8a96e', margin: '4px 0 0', lineHeight: 1 }}>
              {revenue30d.toFixed(2)} €
            </p>
            {revenue > 0 && (
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 4, margin: '4px 0 0' }}>
                Total cumulé : {revenue.toFixed(2)} €
              </p>
            )}
          </div>
          {/* Commandes en attente */}
          <div style={{ ...S.card, padding: 14, textAlign: 'center', borderColor: pendingOrders > 0 ? 'rgba(200,169,110,0.35)' : undefined }}>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: pendingOrders > 0 ? '#c8a96e' : 'rgba(255,255,255,0.90)', margin: 0 }}>
              {pendingOrders}
            </p>
            <p style={{ ...S.label, marginBottom: 0, marginTop: 4 }}>À traiter</p>
          </div>
          {/* Articles actifs */}
          <div style={{ ...S.card, padding: 14, textAlign: 'center' }}>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
              {availableItems}
              {availableItems !== catalog.length && (
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.32)' }}> /{catalog.length}</span>
              )}
            </p>
            <p style={{ ...S.label, marginBottom: 0, marginTop: 4 }}>Articles actifs</p>
          </div>
        </div>

        {/* Tabs (4 onglets — Aperçu en premier) */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(6,8,16,0.6)', padding: 4, borderRadius: 8 }}>
          {[
            { key: 'apercu', label: 'Aperçu' },
            { key: 'commandes', label: `Commandes${pendingOrders > 0 ? ' •' : ''}` },
            { key: 'catalogue', label: `Catalogue (${catalog.length})` },
            { key: 'profil', label: 'Profil' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '8px 4px', borderRadius: 4, border: 'none', cursor: 'pointer',
                fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.1em',
                transition: 'all 0.2s',
                ...(tab === t.key
                  ? { background: 'rgba(200,169,110,0.18)', color: '#c8a96e', border: '1px solid rgba(200,169,110,0.28)' }
                  : { background: 'transparent', color: 'rgba(255,255,255,0.42)' }),
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── APERÇU TAB ── */}
        {tab === 'apercu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Mini graphique 7 derniers jours */}
            <div style={{ ...S.card, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)', margin: 0 }}>
                  Activité — 7 derniers jours
                </p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.32)', margin: 0 }}>
                  {last7Days.reduce((s, d) => s + d.revenue, 0).toFixed(0)} €
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80, marginBottom: 8 }}>
                {last7Days.map((d, i) => {
                  const h = maxDayRevenue > 0 ? (d.revenue / maxDayRevenue) * 100 : 0
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: '100%', minHeight: 2,
                        height: `${Math.max(h, 4)}%`,
                        background: d.revenue > 0
                          ? 'linear-gradient(180deg, rgba(200,169,110,0.85) 0%, rgba(200,169,110,0.35) 100%)'
                          : 'rgba(255,255,255,0.06)',
                        borderRadius: 2,
                        transition: 'height 0.4s',
                      }} title={`${d.revenue.toFixed(2)}€`} />
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {last7Days.map((d, i) => (
                  <span key={i} style={{
                    flex: 1, textAlign: 'center',
                    fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em',
                    color: 'rgba(255,255,255,0.32)',
                  }}>{d.label}</span>
                ))}
              </div>
            </div>

            {/* À traiter — commandes pending immédiatement actionnables */}
            {recentPendingOrders.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(200,169,110,0.85)', margin: 0 }}>
                    À traiter maintenant
                  </p>
                  {pendingOrders > 3 && (
                    <button onClick={() => setTab('commandes')} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em',
                      textTransform: 'uppercase', color: '#c8a96e',
                    }}>
                      Tout voir ({pendingOrders}) →
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentPendingOrders.map(order => (
                    <div key={order.id} style={{ ...S.card, padding: '14px 16px', borderColor: 'rgba(200,169,110,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.92)', margin: 0 }}>
                          {order.buyerName}
                        </p>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', margin: '2px 0 0' }}>
                          {order.items.length} article{order.items.length > 1 ? 's' : ''} · <span style={{ color: '#c8a96e' }}>{order.sellerReceives.toFixed(2)} €</span>
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { updateOrderStatus(order.id, 'confirmed'); setOrders(getOrdersForSeller(uid)); showToast('Commande confirmée') }}
                          style={{ padding: '7px 12px', background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))', border: '1px solid rgba(200,169,110,0.45)', borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#c8a96e', cursor: 'pointer' }}>
                          ✓ Confirmer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Score de complétion du profil — call to action si < 100% */}
            {profileCompletion < 100 && (
              <div style={{ ...S.card, padding: 16, borderColor: 'rgba(78,232,200,0.20)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#4ee8c8', margin: 0 }}>
                    Profil à compléter
                  </p>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: '#4ee8c8', margin: 0, lineHeight: 1 }}>
                    {profileCompletion}%
                  </p>
                </div>
                {/* Barre de progression */}
                <div style={{ height: 4, background: 'rgba(78,232,200,0.10)', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{
                    height: '100%', width: `${profileCompletion}%`,
                    background: 'linear-gradient(90deg, #4ee8c8 0%, #c8a96e 100%)',
                    transition: 'width 0.5s',
                  }} />
                </div>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, margin: 0 }}>
                  Un profil complet apparaît plus haut dans les recherches des organisateurs et reçoit jusqu'à <strong style={{ color: '#c8a96e' }}>3× plus de commandes</strong>.
                </p>
                <button onClick={() => setTab('profil')} style={{ ...S.btnGhost, marginTop: 12, padding: '10px 16px' }}>
                  Compléter mon profil →
                </button>
              </div>
            )}

            {/* Empty states ciblés */}
            {orders.length === 0 && catalog.length === 0 && (
              <div style={{ ...S.card, padding: 20, textAlign: 'center' }}>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.78)', margin: 0 }}>
                  Bienvenue sur ton espace prestataire.
                </p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7, margin: '10px 0 16px' }}>
                  Première étape : ajoute tes premiers articles ou prestations au catalogue. Ils seront visibles par les organisateurs qui pourront te commander directement.
                </p>
                <button onClick={() => setTab('catalogue')} style={{ ...S.btnGold, padding: '12px 22px' }}>
                  + Créer mon catalogue
                </button>
              </div>
            )}

            {/* Résumé statique du compte */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ ...S.card, padding: 14 }}>
                <p style={{ ...S.label, margin: 0, marginBottom: 4 }}>Commandes en cours</p>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
                  {confirmedOrders}
                </p>
              </div>
              <div style={{ ...S.card, padding: 14 }}>
                <p style={{ ...S.label, margin: 0, marginBottom: 4 }}>Commandes terminées</p>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
                  {orders.filter(o => o.status === 'done').length}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── PROFIL TAB ── */}
        {tab === 'profil' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {profileFormMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Eyebrow>Profil prestataire</Eyebrow>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.05em', margin: 0 }}>Complète ton profil prestataire</p>
                <FocusInput placeholder="Nom commercial / enseigne" value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} />
                <textarea
                  style={{ ...S.inputBase, resize: 'none', height: 80 }}
                  placeholder="Description de tes services..."
                  value={profileForm.description}
                  onChange={e => setProfileForm(f => ({ ...f, description: e.target.value }))}
                  onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                />
                <FocusInput placeholder="Adresse / Zone d'activité" value={profileForm.location} onChange={e => setProfileForm(f => ({ ...f, location: e.target.value }))} />
                <FocusInput placeholder="Site web ou Instagram (optionnel)" value={profileForm.website} onChange={e => setProfileForm(f => ({ ...f, website: e.target.value }))} />
                <button onClick={handleSaveProfile} style={S.btnGold}>Enregistrer le profil</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ ...S.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>{profile.name}</p>
                  {profile.description && <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: 0 }}>{profile.description}</p>}
                  {profile.location && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.42)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', margin: 0 }}>{profile.location}</p>
                    </div>
                  )}
                  {profile.website && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.42)" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', margin: 0 }}>{profile.website}</p>
                    </div>
                  )}
                </div>
                <button onClick={() => setProfileFormMode(true)} style={S.btnGhost}>
                  Modifier le profil
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── CATALOGUE TAB ── */}
        {tab === 'catalogue' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.42)', margin: 0 }}>
                {catalog.length} article{catalog.length !== 1 ? 's' : ''}
              </p>
              <button onClick={() => setShowAddItem(true)}
                style={{
                  fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase',
                  padding: '6px 14px', borderRadius: 4,
                  background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                  border: '1px solid rgba(200,169,110,0.45)', color: '#c8a96e', cursor: 'pointer',
                }}>
                + Ajouter
              </button>
            </div>

            {showAddItem && (
              <div style={{ ...S.card, padding: 16, borderColor: 'rgba(200,169,110,0.20)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Nouvel article</p>
                <FocusInput placeholder="Nom du produit / service *" value={newItem.name} onChange={e => setNewItem(i => ({ ...i, name: e.target.value }))} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <FocusInput type="number" placeholder="Prix (€) *" value={newItem.price} onChange={e => setNewItem(i => ({ ...i, price: e.target.value }))} />
                  <select style={{ ...S.inputBase }} value={newItem.unit} onChange={e => setNewItem(i => ({ ...i, unit: e.target.value }))}>
                    {['unité', 'lot', 'kg', 'L', 'bouteille', 'caisse', 'heure', 'soirée', 'jour'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <select style={{ ...S.inputBase }} value={newItem.category} onChange={e => setNewItem(i => ({ ...i, category: e.target.value }))}>
                  <option value="">Catégorie (optionnel)</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea style={{ ...S.inputBase, resize: 'none', height: 64 }} placeholder="Description (optionnel)" value={newItem.description} onChange={e => setNewItem(i => ({ ...i, description: e.target.value }))}
                  onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleAddItem} style={{ ...S.btnGold, flex: 1 }}>Ajouter</button>
                  <button onClick={() => { setShowAddItem(false); setNewItem({ name: '', price: '', category: '', unit: 'unité', description: '', available: true }) }}
                    style={{ ...S.btnGhost, flex: '0 0 auto', width: 'auto', padding: '13px 16px' }}>Annuler</button>
                </div>
              </div>
            )}

            {catalog.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" style={{ marginBottom: 4 }}>
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                </svg>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: 'rgba(255,255,255,0.42)', margin: 0 }}>Catalogue vide</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.28)', lineHeight: 1.7, maxWidth: 240, textAlign: 'center', margin: 0 }}>
                  Ajoute tes produits ou services pour qu'ils apparaissent sur ton profil public.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {catalog.map(item => (
                  <div key={item.id}>
                    {editItem?.id === item.id ? (
                      <div style={{ ...S.card, padding: 12, borderColor: 'rgba(200,169,110,0.20)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <FocusInput value={editItem.name} onChange={e => setEditItem(i => ({ ...i, name: e.target.value }))} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <FocusInput type="number" value={editItem.price} onChange={e => setEditItem(i => ({ ...i, price: parseFloat(e.target.value) }))} />
                          <select style={{ ...S.inputBase }} value={editItem.unit} onChange={e => setEditItem(i => ({ ...i, unit: e.target.value }))}>
                            {['unité', 'lot', 'kg', 'L', 'bouteille', 'caisse', 'heure', 'soirée', 'jour'].map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={handleSaveEdit} style={{ ...S.btnGold, flex: 1, padding: '8px' }}>Sauver</button>
                          <button onClick={() => setEditItem(null)} style={{ ...S.btnGhost, flex: '0 0 auto', width: 'auto', padding: '8px 14px' }}>Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        ...S.card,
                        padding: '12px 14px',
                        display: 'flex', alignItems: 'center', gap: 12,
                        opacity: item.available ? 1 : 0.5,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.90)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{item.name}</p>
                            {item.category && (
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#4ee8c8', background: 'rgba(78,232,200,0.06)', border: '1px solid rgba(78,232,200,0.20)', padding: '1px 7px', borderRadius: 3, flexShrink: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{item.category}</span>
                            )}
                          </div>
                          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: '#c8a96e', marginTop: 3, margin: '3px 0 0' }}>
                            {item.price}€ <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.42)' }}>/ {item.unit}</span>
                          </p>
                          {item.description && <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px 0 0' }}>{item.description}</p>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <div
                            onClick={() => handleToggleAvailability(item)}
                            style={{
                              width: 32, height: 18, borderRadius: 9,
                              background: item.available ? '#4ee8c8' : 'rgba(255,255,255,0.08)',
                              position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                            }}
                          >
                            <div style={{
                              position: 'absolute', top: 3, width: 12, height: 12,
                              background: 'white', borderRadius: '50%', transition: 'left 0.2s',
                              left: item.available ? 17 : 3, boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            }} />
                          </div>
                          <button onClick={() => setEditItem({ ...item })} style={{ width: 28, height: 28, borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button onClick={() => handleDeleteItem(item.id)} style={{ width: 28, height: 28, borderRadius: 4, background: 'rgba(220,50,50,0.06)', border: '1px solid rgba(220,50,50,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(220,100,100,0.9)" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── COMMANDES TAB ── */}
        {tab === 'commandes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Filtres par statut — toujours visibles si au moins une commande */}
            {orders.length > 0 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {[
                  { key: 'all',       label: 'Toutes',     count: orders.length },
                  { key: 'pending',   label: 'À traiter',  count: pendingOrders, hot: true },
                  { key: 'confirmed', label: 'En cours',   count: confirmedOrders },
                  { key: 'done',      label: 'Terminées',  count: orders.filter(o => o.status === 'done').length },
                  { key: 'cancelled', label: 'Annulées',   count: orders.filter(o => o.status === 'cancelled').length },
                ].map(f => {
                  const active = orderFilter === f.key
                  const hot = f.hot && f.count > 0 && !active
                  return (
                    <button key={f.key} onClick={() => setOrderFilter(f.key)}
                      style={{
                        padding: '7px 12px', borderRadius: 999, cursor: 'pointer', flexShrink: 0,
                        fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase',
                        transition: 'all 0.18s',
                        ...(active
                          ? { background: 'rgba(200,169,110,0.18)', border: '1px solid rgba(200,169,110,0.45)', color: '#c8a96e' }
                          : hot
                            ? { background: 'rgba(200,169,110,0.06)', border: '1px solid rgba(200,169,110,0.25)', color: '#c8a96e' }
                            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' }),
                      }}>
                      {f.label}
                      {f.count > 0 && (
                        <span style={{
                          marginLeft: 6, padding: '1px 6px', borderRadius: 8, fontSize: 8,
                          background: active ? 'rgba(200,169,110,0.20)' : 'rgba(255,255,255,0.06)',
                          color: active ? '#c8a96e' : 'rgba(255,255,255,0.65)',
                        }}>{f.count}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" style={{ marginBottom: 4 }}>
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01"/>
                </svg>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: 'rgba(255,255,255,0.42)', margin: 0 }}>Aucune commande</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.28)', lineHeight: 1.7, maxWidth: 240, textAlign: 'center', margin: 0 }}>
                  Les commandes passées depuis ton profil apparaîtront ici.
                </p>
              </div>
            ) : (() => {
              const filtered = orderFilter === 'all' ? orders : orders.filter(o => o.status === orderFilter)
              if (filtered.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.32)', margin: 0 }}>
                      Aucune commande dans cette catégorie.
                    </p>
                  </div>
                )
              }
              return filtered.map(order => {
                const st = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: 'rgba(255,255,255,0.3)' }
                const statusStyle = order.status === 'pending'
                  ? { color: '#c8a96e', borderColor: 'rgba(200,169,110,0.44)', background: 'rgba(200,169,110,0.11)' }
                  : order.status === 'confirmed'
                  ? { color: '#4ee8c8', borderColor: 'rgba(78,232,200,0.44)', background: 'rgba(78,232,200,0.08)' }
                  : { color: 'rgba(255,255,255,0.3)', borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }
                return (
                  <div key={order.id} style={{ ...S.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>{order.buyerName}</p>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2, margin: '2px 0 0' }}>{new Date(order.createdAt).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <span style={{
                        fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em',
                        padding: '3px 10px', borderRadius: 3, border: '1px solid',
                        ...statusStyle,
                      }}>
                        {st.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {order.items.map((it, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{it.name} × {it.qty}</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)' }}>{(it.price * it.qty).toFixed(2)}€</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', margin: 0 }}>
                          Commission : <span style={{ color: 'rgba(220,100,100,0.8)' }}>{order.commission.toFixed(2)}€</span>
                        </p>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.90)', marginTop: 2, margin: '2px 0 0' }}>
                          Tu reçois : <span style={{ color: '#c8a96e' }}>{order.sellerReceives.toFixed(2)}€</span>
                        </p>
                      </div>
                      {order.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => { updateOrderStatus(order.id, 'confirmed'); setOrders(getOrdersForSeller(uid)) }}
                            style={{ padding: '7px 14px', background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))', border: '1px solid rgba(200,169,110,0.45)', borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', color: '#c8a96e', cursor: 'pointer' }}>
                            Confirmer
                          </button>
                          <button onClick={() => { updateOrderStatus(order.id, 'cancelled'); setOrders(getOrdersForSeller(uid)) }}
                            style={{ padding: '7px 14px', background: 'rgba(220,50,50,0.10)', border: '1px solid rgba(220,50,50,0.35)', borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', color: 'rgba(220,100,100,0.9)', cursor: 'pointer' }}>
                            Refuser
                          </button>
                        </div>
                      )}
                      {order.status === 'confirmed' && (
                        <button onClick={() => { updateOrderStatus(order.id, 'done'); setOrders(getOrdersForSeller(uid)) }}
                          style={{ padding: '7px 14px', background: 'rgba(78,232,200,0.10)', border: '1px solid rgba(78,232,200,0.35)', borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', color: '#4ee8c8', cursor: 'pointer' }}>
                          Terminé
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
          background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
          border: '1px solid rgba(200,169,110,0.45)', borderRadius: 4,
          padding: '10px 20px', fontFamily: "'DM Mono', monospace", fontSize: 11,
          color: '#c8a96e', letterSpacing: '0.15em', whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
    </Layout>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC SERVICES VIEW
// ══════════════════════════════════════════════════════════════════════════════

function PublicServicesView({ user, uid, navigate, agentMode }) {
  const { setUser } = useAuth()
  const photoInputRef = useRef(null)
  const [mode, setMode] = useState('landing')
  const [selected, setSelected] = useState(null)
  const [step, setStep] = useState(1)
  const [formValues, setFormValues] = useState({})
  const [extras, setExtras] = useState([])
  const [customOptionInput, setCustomOptionInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [photoPreviews, setPhotoPreviews] = useState([])
  const [formErrors, setFormErrors] = useState({})
  const [createdProviders, setCreatedProviders] = useState(getCreatedProviders)
  const [roleRequestState, setRoleRequestState] = useState('idle')
  const [roleRequestType, setRoleRequestType] = useState(null)
  const [roleRequestPrestType, setRoleRequestPrestType] = useState(null)
  const [contact, setContact] = useState({ open: false, provider: null, sent: false, name: '', message: '' })
  const [browseSearch, setBrowseSearch] = useState('')
  const [browseCat, setBrowseCat] = useState('tous')
  const [orderModal, setOrderModal] = useState(null)
  const [cart, setCart] = useState([])
  const [orderSuccess, setOrderSuccess] = useState(false)

  const cat = CATEGORIES.find(c => c.id === selected)
  const allProviders = [...STATIC_PROVIDERS, ...createdProviders, ...getAllProviderProfiles().map(p => ({
    id: `account_${p.userId}`, userId: p.userId,
    type: p.prestataireType, icon: CATEGORIES.find(c => c.id === p.prestataireType)?.icon || 'mic',
    color: CATEGORIES.find(c => c.id === p.prestataireType)?.color || '#c8a96e',
    name: p.name, typeLabel: CATEGORIES.find(c => c.id === p.prestataireType)?.title?.replace("J'ai ", '').replace("Je suis un ", '').replace("Je donne des ", '') || p.prestataireType,
    description: p.description, location: p.location, tags: [], rating: 0, pending: false,
    hasCatalog: getCatalog(p.userId).filter(i => i.available).length > 0,
  }))]

  function toggleExtra(ex) {
    setExtras(prev => prev.includes(ex) ? prev.filter(e => e !== ex) : [...prev, ex])
  }
  function addCustomOption() {
    const val = customOptionInput.trim()
    if (val && !extras.includes(val)) { setExtras(prev => [...prev, val]); setCustomOptionInput(''); setShowCustomInput(false) }
  }
  function handlePhotos(e) {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) return
      const reader = new FileReader()
      reader.onload = ev => setPhotoPreviews(prev => prev.length < 5 ? [...prev, ev.target.result] : prev)
      reader.readAsDataURL(file)
    })
  }
  function validateStep2() {
    const errs = {}
    cat.fields.filter(f => f.required).forEach(f => {
      if (!formValues[f.label]?.toString().trim()) errs[f.label] = 'Champ obligatoire'
    })
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }
  function handlePublishProvider() {
    const nameField = cat.fields[0]?.label
    const priceField = cat.fields.find(f => f.label.toLowerCase().includes('tarif'))?.label
    const newProvider = {
      id: Date.now(), type: selected, icon: cat.icon, color: cat.color,
      typeLabel: cat.id === 'salle' ? 'Salle / Lieu' : cat.id === 'prestation' ? formValues['Type de prestation'] || 'Prestation' : cat.id === 'materiel' ? 'Matériel' : 'Supermarché',
      name: formValues[nameField] || 'Nouveau prestataire',
      description: formValues[cat.fields.find(f => f.type === 'textarea')?.label] || '',
      price: priceField ? `À partir de ${formValues[priceField] || '?'}€` : '—',
      location: formValues['Adresse complète'] || formValues['Adresse'] || formValues["Ville(s) d'intervention"] || '',
      rating: 0, tags: extras, photos: photoPreviews, pending: true, userCreated: true,
    }
    localStorage.setItem('lib_created_providers', JSON.stringify([...getCreatedProviders(), newProvider]))
    setCreatedProviders(prev => [...prev, newProvider])
    setStep(4)
  }
  function startRoleRequest(catId) {
    if (!user) { navigate('/connexion?mode=register'); return }
    const isPending = catId === 'organisateur'
      ? user?.orgStatus === 'pending'
      : user?.prestStatus === 'pending'
    setRoleRequestType(catId === 'organisateur' ? 'organisateur' : 'prestataire')
    setRoleRequestPrestType(catId === 'organisateur' ? null : catId)
    setRoleRequestState(isPending ? 'already_pending' : 'confirming')
    setMode('request')
  }

  function cartQty(itemId) { return cart.find(c => c.item.id === itemId)?.qty || 0 }
  function setCartQty(item, qty) {
    if (qty <= 0) { setCart(c => c.filter(ci => ci.item.id !== item.id)); return }
    setCart(c => { const ex = c.find(ci => ci.item.id === item.id); return ex ? c.map(ci => ci.item.id === item.id ? { ...ci, qty } : ci) : [...c, { item, qty }] })
  }
  const cartTotal = cart.reduce((s, ci) => s + ci.item.price * ci.qty, 0)
  const commission = Math.round(cartTotal * 0.1 * 100) / 100

  function handlePlaceOrder() {
    if (!orderModal || cart.length === 0) return
    // Note : pour la V2, brancher Stripe Connect ici (split payment org → prestataire)
    const order = placeOrder({
      buyerId: uid, buyerName: user?.name || 'Utilisateur',
      sellerId: orderModal.userId || `static_${orderModal.id}`,
      sellerName: orderModal.name, sellerType: orderModal.type,
      items: cart.map(ci => ({ name: ci.item.name, price: ci.item.price, unit: ci.item.unit, qty: ci.qty })),
    })
    setCart([])
    setOrderSuccess(true)
  }

  // ── LANDING ──
  if (mode === 'landing') {
    return (
      <Layout>
        <div style={{ position: 'relative', zIndex: 1, background: 'transparent', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Page header */}
          <div>
            <p style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              letterSpacing: '0.4em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.25)',
              marginBottom: 8,
              margin: '0 0 8px',
            }}>Marketplace</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 38, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: '0 0 8px', lineHeight: 1.1 }}>
              Services <span style={{ color: '#c8a96e' }}>& Prestataires</span>
            </h2>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', margin: 0, letterSpacing: '0.04em' }}>
              Marketplace des professionnels de l'événementiel
            </p>
          </div>

          {/* Browse banner */}
          <button onClick={() => setMode('browse')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
            <div style={{
              position: 'relative', overflow: 'hidden', borderRadius: 12,
              border: '1px solid rgba(200,169,110,0.30)',
              background: 'linear-gradient(135deg, rgba(200,169,110,0.08) 0%, transparent 60%)',
              padding: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 28, height: 1, background: '#c8a96e' }} />
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.35em', textTransform: 'uppercase', color: '#c8a96e', margin: 0 }}>Annuaire</p>
              </div>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: '0 0 4px' }}>Parcourir les prestataires</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', margin: 0 }}>
                {allProviders.length} profil{allProviders.length > 1 ? 's' : ''} · Salles, DJs, artistes, matériel...
              </p>
              <div style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', opacity: 0.12 }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
            </div>
          </button>

          {/* Category list */}
          {!agentMode && (
            <div>
              <Eyebrow>Rejoindre la marketplace</Eyebrow>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Organisateur card */}
                <button onClick={() => startRoleRequest('organisateur')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <div style={{
                    padding: 16, borderRadius: 12,
                    border: '1px solid #3b82f628',
                    background: '#3b82f606',
                    display: 'flex', alignItems: 'center', gap: 16,
                  }}>
                    <div style={{ width: 48, height: 48, borderRadius: 8, background: '#3b82f618', border: '1px solid #3b82f635', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>
                      🎪
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)', fontWeight: 600, letterSpacing: '0.05em', margin: 0 }}>Je veux organiser des événements</p>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 3, lineHeight: 1.5, margin: '3px 0 0' }}>Crée et gère tes propres événements sur LIVEINBLACK</p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </button>
                {CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => startRoleRequest(cat.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <div style={{
                      padding: 16, borderRadius: 12,
                      border: `1px solid ${cat.color}28`,
                      background: cat.color + '06',
                      display: 'flex', alignItems: 'center', gap: 16,
                    }}>
                      <div style={{ width: 48, height: 48, borderRadius: 8, background: cat.color + '18', border: `1px solid ${cat.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <CatIcon id={cat.icon} color={cat.color} size={20} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)', fontWeight: 600, letterSpacing: '0.05em', margin: 0 }}>{cat.title}</p>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.42)', marginTop: 3, lineHeight: 1.5, margin: '3px 0 0' }}>{cat.desc}</p>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cat.color} strokeWidth="2" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Layout>
    )
  }

  // ── BROWSE ──
  if (mode === 'browse') {
    const BROWSE_CATS = [
      { id: 'tous', label: 'Tous' },
      { id: 'salle', label: 'Salles' },
      { id: 'prestation', label: 'Prestataires' },
      { id: 'materiel', label: 'Matériel' },
      { id: 'supermarche', label: 'Supermarché' },
    ]
    const filteredProviders = allProviders.filter(p => {
      const matchSearch = !browseSearch || p.name.toLowerCase().includes(browseSearch.toLowerCase()) || p.typeLabel?.toLowerCase().includes(browseSearch.toLowerCase()) || p.tags?.some(t => t.toLowerCase().includes(browseSearch.toLowerCase()))
      const matchCat = browseCat === 'tous' || p.type === browseCat
      return matchSearch && matchCat
    })

    return (
      <Layout>
        <div style={{ position: 'relative', zIndex: 1, background: 'transparent', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Browse header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setMode('landing')} style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Prestataires</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.42)', marginTop: 2, margin: '2px 0 0' }}>{filteredProviders.length} profil(s)</p>
            </div>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <FocusInput
              placeholder="Recherche par nom, type, tags..."
              value={browseSearch}
              onChange={e => setBrowseSearch(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
            {browseSearch && (
              <button onClick={() => setBrowseSearch('')} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.42)', fontSize: 16, lineHeight: 1 }}>×</button>
            )}
          </div>

          {/* Category filter pills */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {BROWSE_CATS.map(bc => (
              <button key={bc.id} onClick={() => setBrowseCat(bc.id)}
                style={{
                  flexShrink: 0, padding: '6px 14px', borderRadius: 4, cursor: 'pointer',
                  fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase',
                  border: '1px solid', transition: 'all 0.2s',
                  ...(browseCat === bc.id
                    ? { background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))', borderColor: 'rgba(200,169,110,0.45)', color: '#c8a96e' }
                    : { background: 'transparent', borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.42)' }),
                }}>
                {bc.label}
              </button>
            ))}
          </div>

          {/* Provider cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredProviders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0', color: 'rgba(255,255,255,0.28)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ margin: '0 auto 12px', display: 'block' }}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, margin: 0 }}>Aucun prestataire trouvé</p>
              </div>
            ) : filteredProviders.map(prov => {
              const provCatalog = prov.userId ? getCatalog(prov.userId).filter(i => i.available) : []
              return (
                <div key={prov.id} style={{ ...S.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {prov.photos?.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                      {prov.photos.map((src, i) => <img key={i} src={src} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />)}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 8, background: (prov.color || '#c8a96e') + '18', border: `1px solid ${(prov.color || '#c8a96e')}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CatIcon id={prov.icon} color={prov.color || '#c8a96e'} size={20} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{prov.name}</p>
                        {prov.rating > 0 && (
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#c8a96e', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="#c8a96e" stroke="#c8a96e" strokeWidth="1"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
                            {prov.rating}
                          </span>
                        )}
                      </div>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.42)', marginTop: 2, margin: '2px 0 0' }}>{prov.typeLabel}</p>
                      {prov.location && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: 0 }}>{prov.location}</p>
                        </div>
                      )}
                      {prov.capacity && (
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2, margin: '2px 0 0' }}>{prov.capacity}</p>
                      )}
                    </div>
                  </div>

                  {prov.description ? (
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, margin: 0 }}>{prov.description}</p>
                  ) : null}

                  {prov.tags?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {prov.tags.map(t => (
                        <span key={t} style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, padding: '2px 8px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.42)' }}>{t}</span>
                      ))}
                    </div>
                  )}

                  {provCatalog.length > 0 && (
                    <div style={{ ...S.card, padding: 12, background: 'rgba(6,8,16,0.6)' }}>
                      <Eyebrow>Aperçu du catalogue</Eyebrow>
                      {provCatalog.slice(0, 3).map(item => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.80)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#c8a96e', flexShrink: 0, marginLeft: 8 }}>{item.price}€/{item.unit}</span>
                        </div>
                      ))}
                      {provCatalog.length > 3 && (
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 4, margin: '4px 0 0' }}>+{provCatalog.length - 3} autres articles</p>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', gap: 8 }}>
                    <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, fontWeight: 300, color: 'rgba(255,255,255,0.90)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prov.price || ''}</span>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => setContact({ open: true, provider: prov, sent: false, name: '', message: '' })}
                        style={{ padding: '7px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                        Contacter
                      </button>
                      {(prov.userId || prov.type === 'supermarche') && (
                        <button onClick={() => { setOrderModal(prov); setCart([]); setOrderSuccess(false) }}
                          style={{
                            padding: '7px 14px', borderRadius: 4, cursor: 'pointer',
                            background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                            border: '1px solid rgba(200,169,110,0.45)',
                            fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.15em', color: '#c8a96e',
                          }}>
                          {prov.type === 'supermarche' ? 'Commander' : 'Réserver'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Contact Modal */}
        {contact.open && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            onClick={e => e.target === e.currentTarget && setContact(c => ({ ...c, open: false }))}
          >
            <div style={{ width: '100%', maxWidth: 480, background: 'rgba(8,10,20,0.98)', backdropFilter: 'blur(22px)', borderTop: '1px solid rgba(255,255,255,0.10)', borderRadius: '12px 12px 0 0', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Contacter {contact.provider?.name}</p>
                <button onClick={() => setContact(c => ({ ...c, open: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.42)', fontSize: 20, lineHeight: 1, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              {contact.sent ? (
                <div style={{ textAlign: 'center', padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="1"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Message envoyé</p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7, margin: 0 }}>Le prestataire recevra ta demande sous 24-48h.</p>
                  <button onClick={() => setContact(c => ({ ...c, open: false }))} style={{ ...S.btnGold, marginTop: 8 }}>Fermer</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <FocusInput placeholder="Ton nom" value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} />
                  <textarea
                    style={{ ...S.inputBase, resize: 'none', height: 112 }}
                    placeholder="Décris ton événement, ta date, tes besoins..."
                    value={contact.message}
                    onChange={e => setContact(c => ({ ...c, message: e.target.value }))}
                    onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                  />
                  <button onClick={() => {
                    if (!contact.name || !contact.message) return
                    const myName = user?.name || contact.name
                    const providerId = `provider_${contact.provider?.id || 'unknown'}`
                    const conv = createDirectConversation(uid, myName, providerId, contact.provider?.name || 'Prestataire')
                    if (conv) sendMessage(conv.id, uid, myName, 'text', contact.message)
                    navigate('/messagerie')
                  }}
                    style={{ ...S.btnGold, opacity: (!contact.name || !contact.message) ? 0.5 : 1 }}>
                    Envoyer la demande
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Order Modal */}
        {orderModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={() => { if (!orderSuccess) { setOrderModal(null); setCart([]) } }} />
            <div style={{ position: 'relative', width: '100%', maxWidth: 480, background: 'rgba(8,10,20,0.98)', backdropFilter: 'blur(22px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px 12px 0 0', maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ padding: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: 'rgba(8,10,20,0.98)', zIndex: 10 }}>
                <div style={{ width: 40, height: 3, background: 'rgba(255,255,255,0.12)', borderRadius: 2, margin: '0 auto 12px' }} />
                {orderSuccess ? (
                  <div style={{ textAlign: 'center', padding: '16px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="1.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Commande envoyée</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7, margin: 0 }}>
                      Ta commande a été transmise à <span style={{ color: 'rgba(255,255,255,0.90)' }}>{orderModal.name}</span>. Tu seras notifié(e) dès confirmation.
                    </p>
                    <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 300, color: '#c8a96e', margin: 0 }}>Total : {cartTotal.toFixed(2)}€</p>
                    <button onClick={() => { setOrderModal(null); setCart([]) }} style={{ ...S.btnGold, marginTop: 8 }}>Fermer</button>
                  </div>
                ) : (
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.90)', textAlign: 'center', margin: 0 }}>
                    {orderModal.type === 'supermarche' ? 'Commander' : 'Réserver'} — {orderModal.name}
                  </p>
                )}
              </div>

              {!orderSuccess && (
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {orderModal.userId ? (
                    <>
                      {getCatalog(orderModal.userId).filter(i => i.available).length === 0 ? (
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '32px 0', margin: 0 }}>Catalogue vide pour le moment.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {getCatalog(orderModal.userId).filter(i => i.available).map(item => (
                            <div key={item.id} style={{ ...S.card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.90)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{item.name}</p>
                                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: '#c8a96e', marginTop: 2, margin: '2px 0 0' }}>{item.price}€ / {item.unit}</p>
                                {item.category && (
                                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#4ee8c8', background: 'rgba(78,232,200,0.06)', border: '1px solid rgba(78,232,200,0.20)', padding: '1px 7px', borderRadius: 3, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'inline-block', marginTop: 3 }}>{item.category}</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                {cartQty(item.id) > 0 && (
                                  <>
                                    <button onClick={() => setCartQty(item, cartQty(item.id) - 1)}
                                      style={{ width: 28, height: 28, borderRadius: 4, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.90)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: 16 }}>−</button>
                                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: 'rgba(255,255,255,0.90)', width: 20, textAlign: 'center' }}>{cartQty(item.id)}</span>
                                  </>
                                )}
                                <button onClick={() => setCartQty(item, cartQty(item.id) + 1)}
                                  style={{ width: 28, height: 28, borderRadius: 4, background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))', border: '1px solid rgba(200,169,110,0.45)', color: '#c8a96e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: 16 }}>+</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ ...S.card, padding: 16 }}>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 10, margin: '0 0 10px' }}>Décris ta demande de prestation</p>
                      <textarea style={{ ...S.inputBase, resize: 'none', height: 80 }} placeholder="Date, durée, type d'événement, budget..."
                        onFocus={e => { e.target.style.borderColor = '#4ee8c8'; e.target.style.boxShadow = '0 0 0 3px rgba(78,232,200,0.06)' }}
                        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }} />
                    </div>
                  )}

                  {cart.length > 0 && (
                    <div style={{ ...S.card, padding: 16, borderColor: 'rgba(200,169,110,0.18)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <Eyebrow>Récapitulatif</Eyebrow>
                      {cart.map((ci, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{ci.item.name} × {ci.qty}</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.90)' }}>{(ci.item.price * ci.qty).toFixed(2)}€</span>
                        </div>
                      ))}
                      <div style={{ paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Commission LIVEINBLACK (10%)</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{commission.toFixed(2)}€</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'rgba(255,255,255,0.90)' }}>Total à payer</span>
                          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: '#c8a96e' }}>{cartTotal.toFixed(2)}€</span>
                        </div>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.32)', margin: 0, letterSpacing: '0.1em' }}>Paiement à régler directement avec le prestataire</p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handlePlaceOrder}
                    disabled={cart.length === 0}
                    style={{ ...S.btnGold, opacity: cart.length === 0 ? 0.4 : 1, cursor: cart.length === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    {cart.length === 0 ? 'Ajoute des articles' : `Confirmer — ${cartTotal.toFixed(2)}€`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Layout>
    )
  }

  // ── REQUEST ROLE FLOW ──
  if (mode === 'request') {
    const isOrg = roleRequestType === 'organisateur'
    const prestCat = PRESTATAIRE_TYPES.find(t => t.key === roleRequestPrestType)
    const roleColor = isOrg ? '#3b82f6' : (CATEGORIES.find(c => c.id === roleRequestPrestType)?.color || '#8b5cf6')
    const roleLabel = isOrg ? 'Organisateur' : `Prestataire — ${prestCat?.label || ''}`
    const roleIcon = isOrg ? '🎪' : prestCat?.icon
    const legalDocs = isOrg ? ["Pièce d'identité", 'Justificatif de domicile', 'RCS ou SIRET si applicable'] : CATEGORIES.find(c => c.id === roleRequestPrestType)?.legalDocs || []

    const contentBg = {
      background: 'rgba(4,4,11,0.72)',
      backdropFilter: 'blur(18px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
      borderRadius: 14,
      padding: '20px 16px',
    }

    return (
      <Layout>
        <div style={{ position: 'relative', zIndex: 1, padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => { setMode('landing'); setRoleRequestState('idle') }}
              style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'white', fontWeight: 600, letterSpacing: '0.05em', margin: 0 }}>Rejoindre la marketplace</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.42)', margin: '2px 0 0' }}>Demande de compte professionnel</p>
            </div>
          </div>

          {/* Already pending state */}
          {roleRequestState === 'already_pending' && (
            <div style={{ ...contentBg, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'rgba(200,169,110,0.10)', border: '1px solid rgba(200,169,110,0.32)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <IconHourglass size={26} color="#c8a96e" />
                </div>
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.9)', margin: 0 }}>Candidature en cours</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.6 }}>
                  Ta demande de compte <span style={{ color: '#c8a96e' }}>{roleLabel}</span> est en cours de traitement. Tu seras notifié(e) sous 24h.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => { setRoleRequestState('confirming') }}
                  style={{ ...S.btnGold }}>
                  Modifier ma candidature
                </button>
                <button
                  onClick={async () => {
                    await cancelRoleRequest(uid, roleRequestType)
                    // Mettre à jour le contexte utilisateur
                    try {
                      const updated = JSON.parse(localStorage.getItem('lib_user') || 'null')
                      if (updated) setUser(updated)
                    } catch {}
                    setMode('landing')
                    setRoleRequestState('idle')
                  }}
                  style={{ ...S.btnGhost, borderColor: 'rgba(220,50,50,0.3)', color: 'rgba(220,100,100,0.8)' }}>
                  Annuler ma candidature
                </button>
              </div>
            </div>
          )}

          {/* Done state */}
          {roleRequestState === 'done' && (
            <div style={{ ...contentBg, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 32 }}>✅</span>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.9)', margin: 0 }}>Candidature envoyée</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.6 }}>
                Ta demande de compte <span style={{ color: '#4ee8c8' }}>{roleLabel}</span> a été transmise. Ton compte Client reste actif. Tu recevras une confirmation sous <strong style={{ color: 'white' }}>24h</strong>.
              </p>
              <button onClick={() => { setMode('landing'); setRoleRequestState('idle') }} style={{ ...S.btnGold, maxWidth: 280, marginTop: 4 }}>Retour à la marketplace</button>
            </div>
          )}

          {/* Confirming / submitting state */}
          {(roleRequestState === 'confirming' || roleRequestState === 'submitting') && (
            <div style={{ ...contentBg, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Role badge */}
              <div style={{ padding: '14px', background: roleColor + '12', border: `1px solid ${roleColor}30`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, background: roleColor + '18', border: `1px solid ${roleColor}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                  {roleIcon}
                </div>
                <div>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'white', fontWeight: 600, letterSpacing: '0.05em', margin: 0 }}>{roleLabel}</p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: '3px 0 0' }}>
                    {isOrg ? 'Crée et gère tes propres événements' : CATEGORIES.find(c => c.id === roleRequestPrestType)?.desc || ''}
                  </p>
                </div>
              </div>

              {/* Validation notice */}
              <div style={{ padding: '12px 14px', background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.25)', borderRadius: 6 }}>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#c8a96e', margin: '0 0 4px' }}>
                  {isOrg ? '🎪 Espace Organisateur' : '🎤 Espace Prestataire'}
                </p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, margin: 0 }}>
                  Ton compte <span style={{ color: 'rgba(255,255,255,0.75)' }}>Client</span> reste actif. L'accès à l'espace <span style={{ color: '#c8a96e' }}>{isOrg ? 'Organisateur' : 'Prestataire'}</span> sera activé après validation par l'équipe LIVEINBLACK (généralement moins de 24h).
                </p>
              </div>

              {/* Documents à préparer */}
              {legalDocs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Eyebrow>Documents à préparer</Eyebrow>
                  {legalDocs.map(doc => (
                    <div key={doc} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={roleColor} strokeWidth="2" style={{ marginTop: 1, flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, margin: 0 }}>{doc}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Submit */}
              <button
                disabled={roleRequestState === 'submitting'}
                onClick={async () => {
                  setRoleRequestState('submitting')
                  try {
                    // Si modification d'une candidature existante, annuler l'ancienne d'abord
                    const isPrevPending = roleRequestType === 'organisateur'
                      ? user?.orgStatus === 'pending'
                      : user?.prestStatus === 'pending'
                    if (isPrevPending) await cancelRoleRequest(uid, roleRequestType)
                    await requestAdditionalRole(user, roleRequestType, roleRequestPrestType)
                    // Mettre à jour la session
                    try {
                      const updated = JSON.parse(localStorage.getItem('lib_user') || 'null')
                      if (updated) setUser(updated)
                    } catch {}
                    setRoleRequestState('done')
                  } catch {
                    setRoleRequestState('confirming')
                  }
                }}
                style={{ ...S.btnGold, background: roleColor + '22', borderColor: roleColor + '55', color: roleColor, opacity: roleRequestState === 'submitting' ? 0.6 : 1 }}>
                {roleRequestState === 'submitting' ? 'Envoi en cours…' : 'Envoyer ma candidature →'}
              </button>
            </div>
          )}
        </div>
      </Layout>
    )
  }
}
