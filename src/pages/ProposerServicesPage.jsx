import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { services } from '../data/events'
import { getUserId, createDirectConversation, sendMessage } from '../utils/messaging'
import { getBalance, deductFunds } from '../utils/wallet'
import {
  getCatalog, addCatalogItem, updateCatalogItem, deleteCatalogItem,
  getOrdersForSeller, getOrdersForBuyer, placeOrder, updateOrderStatus,
  getProviderProfile, saveProviderProfile, getAllProviderProfiles,
  CATALOG_CATEGORIES, ORDER_STATUS_LABELS,
} from '../utils/services'

const CATEGORIES = [
  {
    id: 'salle',
    icon: '🏛',
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
    icon: '🎤',
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
    icon: '🔊',
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
    icon: '🛒',
    title: 'Je suis un supermarché',
    color: '#d4af37',
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
    id: `salle_${s.id}`, type: 'salle', icon: '🏛', color: '#7b2fff',
    name: s.name, typeLabel: 'Salle / Lieu', description: s.description,
    price: s.price, location: `${s.owner} · ${s.location}`, capacity: `${s.capacity} pers.`,
    rating: s.rating, tags: s.tags, pending: false,
  })),
  ...services.prestations.map(p => ({
    id: `presta_${p.id}`, type: 'prestation', icon: '🎤', color: '#ff6b1a',
    name: p.name, typeLabel: p.type, description: '', price: p.price,
    location: '', rating: p.rating, tags: p.tags, pending: false,
  })),
]

function getCreatedProviders() {
  try { return JSON.parse(localStorage.getItem('lib_created_providers') || '[]') } catch { return [] }
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function ProposerServicesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const uid = getUserId(user)

  // If prestataire → show their dashboard
  if (user?.role === 'prestataire' || user?.role === 'organisateur') {
    return <PrestataireDashboard user={user} navigate={navigate} />
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
  const [tab, setTab] = useState('profil')
  const [catalog, setCatalog] = useState(() => getCatalog(uid))
  const [orders, setOrders] = useState(() => getOrdersForSeller(uid))
  const [profile, setProfile] = useState(() => getProviderProfile(uid))
  const [showAddItem, setShowAddItem] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [newItem, setNewItem] = useState({ name: '', price: '', category: '', unit: 'unité', description: '', available: true })
  const [toast, setToast] = useState(null)
  const photoInputRef = useRef(null)

  // If no profile yet, show the profile setup form
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
    showToast('Profil mis à jour ✓')
  }

  function handleAddItem() {
    if (!newItem.name.trim() || !newItem.price) return
    addCatalogItem(uid, { ...newItem, price: parseFloat(newItem.price) })
    setNewItem({ name: '', price: '', category: '', unit: 'unité', description: '', available: true })
    setShowAddItem(false)
    setCatalog(getCatalog(uid))
    showToast('Article ajouté ✓')
  }

  function handleSaveEdit() {
    if (!editItem) return
    updateCatalogItem(uid, editItem.id, editItem)
    setEditItem(null)
    setCatalog(getCatalog(uid))
    showToast('Modifié ✓')
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

  const pendingOrders = orders.filter(o => o.status === 'pending').length
  const revenue = orders.filter(o => o.status === 'done').reduce((s, o) => s + o.sellerReceives, 0)

  return (
    <Layout>
      <div className="px-4 py-5 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: catConfig.color + '22', border: `1px solid ${catConfig.color}44` }}>
            {catConfig.icon}
          </div>
          <div className="flex-1">
            <h2 className="text-white font-black text-lg">{profile?.name || user?.name}</h2>
            <p className="text-gray-500 text-xs">{catConfig.title.replace("J'ai", '').replace("Je suis", '').replace("Je donne des", '').trim()}</p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
            user?.status === 'active' ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
          }`}>
            {user?.status === 'active' ? 'Actif' : 'En attente'}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Articles', value: catalog.length, icon: '📦' },
            { label: 'Commandes', value: orders.length, icon: '📋', alert: pendingOrders },
            { label: 'Revenus', value: `${revenue.toFixed(0)}€`, icon: '💰' },
          ].map(s => (
            <div key={s.label} className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-xl p-3 text-center">
              <p className="text-lg">{s.icon}</p>
              <p className="text-white font-bold text-lg">{s.value}{s.alert > 0 && <span className="text-yellow-400 text-xs ml-1">+{s.alert}</span>}</p>
              <p className="text-gray-600 text-[10px]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#111] p-1 rounded-xl">
          {[
            { key: 'profil', label: 'Profil' },
            { key: 'catalogue', label: `Catalogue (${catalog.length})` },
            { key: 'commandes', label: `Commandes${pendingOrders > 0 ? ` ●` : ''}` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t.key ? 'bg-[#d4af37] text-black' : 'text-gray-500'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── PROFIL TAB ── */}
        {tab === 'profil' && (
          <div className="space-y-4">
            {profileFormMode ? (
              <div className="space-y-3">
                <p className="text-gray-400 text-sm font-semibold">Complète ton profil prestataire</p>
                <input className="input-dark" placeholder="Nom commercial / enseigne" value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))} />
                <textarea className="input-dark resize-none h-20 text-sm" placeholder="Description de tes services..." value={profileForm.description} onChange={e => setProfileForm(f => ({ ...f, description: e.target.value }))} />
                <input className="input-dark" placeholder="Adresse / Zone d'activité" value={profileForm.location} onChange={e => setProfileForm(f => ({ ...f, location: e.target.value }))} />
                <input className="input-dark" placeholder="Site web ou Instagram (optionnel)" value={profileForm.website} onChange={e => setProfileForm(f => ({ ...f, website: e.target.value }))} />
                <button onClick={handleSaveProfile} className="btn-gold w-full">Enregistrer le profil</button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-2xl p-4 space-y-3">
                  <p className="text-white font-semibold">{profile.name}</p>
                  {profile.description && <p className="text-gray-400 text-sm">{profile.description}</p>}
                  {profile.location && <p className="text-gray-500 text-xs">📍 {profile.location}</p>}
                  {profile.website && <p className="text-gray-500 text-xs">🔗 {profile.website}</p>}
                </div>
                <button onClick={() => setProfileFormMode(true)} className="w-full py-2.5 border border-[#333] text-gray-400 text-sm rounded-xl hover:border-[#d4af37]/40 hover:text-[#d4af37] transition-colors">
                  ✏ Modifier le profil
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── CATALOGUE TAB ── */}
        {tab === 'catalogue' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-gray-500 text-xs">{catalog.length} article{catalog.length !== 1 ? 's' : ''}</p>
              <button onClick={() => setShowAddItem(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#d4af37] text-black text-xs font-bold">
                + Ajouter
              </button>
            </div>

            {/* Add item form */}
            {showAddItem && (
              <div className="bg-[#0d0d0d] border border-[#d4af37]/30 rounded-2xl p-4 space-y-3">
                <p className="text-white font-semibold text-sm">Nouvel article</p>
                <input className="input-dark text-sm" placeholder="Nom du produit / service *" value={newItem.name} onChange={e => setNewItem(i => ({ ...i, name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="input-dark text-sm" type="number" placeholder="Prix (€) *" value={newItem.price} onChange={e => setNewItem(i => ({ ...i, price: e.target.value }))} />
                  <select className="input-dark text-sm" value={newItem.unit} onChange={e => setNewItem(i => ({ ...i, unit: e.target.value }))}>
                    {['unité', 'lot', 'kg', 'L', 'bouteille', 'caisse', 'heure', 'soirée', 'jour'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <select className="input-dark text-sm" value={newItem.category} onChange={e => setNewItem(i => ({ ...i, category: e.target.value }))}>
                  <option value="">Catégorie (optionnel)</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea className="input-dark text-sm resize-none h-16" placeholder="Description (optionnel)" value={newItem.description} onChange={e => setNewItem(i => ({ ...i, description: e.target.value }))} />
                <div className="flex gap-2">
                  <button onClick={handleAddItem} className="flex-1 py-2 bg-[#d4af37] text-black text-xs font-bold rounded-xl">Ajouter</button>
                  <button onClick={() => { setShowAddItem(false); setNewItem({ name: '', price: '', category: '', unit: 'unité', description: '', available: true }) }}
                    className="px-4 py-2 border border-[#333] text-gray-500 text-xs rounded-xl">Annuler</button>
                </div>
              </div>
            )}

            {/* Catalog items */}
            {catalog.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <p className="text-4xl">📦</p>
                <p className="text-white font-semibold text-sm">Catalogue vide</p>
                <p className="text-gray-600 text-xs">Ajoute tes produits ou services pour qu'ils apparaissent sur ton profil public.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {catalog.map(item => (
                  <div key={item.id}>
                    {editItem?.id === item.id ? (
                      <div className="bg-[#0d0d0d] border border-[#d4af37]/30 rounded-xl p-3 space-y-2">
                        <input className="input-dark text-sm" value={editItem.name} onChange={e => setEditItem(i => ({ ...i, name: e.target.value }))} />
                        <div className="grid grid-cols-2 gap-2">
                          <input className="input-dark text-sm" type="number" value={editItem.price} onChange={e => setEditItem(i => ({ ...i, price: parseFloat(e.target.value) }))} />
                          <select className="input-dark text-sm" value={editItem.unit} onChange={e => setEditItem(i => ({ ...i, unit: e.target.value }))}>
                            {['unité', 'lot', 'kg', 'L', 'bouteille', 'caisse', 'heure', 'soirée', 'jour'].map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleSaveEdit} className="flex-1 py-1.5 bg-[#d4af37] text-black text-xs font-bold rounded-lg">✓ Sauver</button>
                          <button onClick={() => setEditItem(null)} className="px-3 py-1.5 border border-[#333] text-gray-500 text-xs rounded-lg">Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.available ? 'bg-[#0d0d0d] border-[#1a1a1a]' : 'bg-[#080808] border-[#111] opacity-60'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-white text-sm font-semibold truncate">{item.name}</p>
                            {item.category && <span className="text-[10px] text-gray-500 bg-[#111] px-1.5 py-0.5 rounded-full flex-shrink-0">{item.category}</span>}
                          </div>
                          <p className="text-[#d4af37] text-xs font-bold">{item.price}€ <span className="text-gray-600 font-normal">/ {item.unit}</span></p>
                          {item.description && <p className="text-gray-600 text-[10px] truncate">{item.description}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button onClick={() => handleToggleAvailability(item)}
                            className={`w-8 h-5 rounded-full transition-all ${item.available ? 'bg-green-500' : 'bg-[#333]'}`}>
                            <div className={`w-3.5 h-3.5 bg-white rounded-full transition-all mx-auto ${item.available ? 'translate-x-1.5' : '-translate-x-1.5'}`} />
                          </button>
                          <button onClick={() => setEditItem({ ...item })} className="w-7 h-7 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-gray-500 hover:text-white">✏</button>
                          <button onClick={() => handleDeleteItem(item.id)} className="w-7 h-7 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-gray-600 hover:text-red-400">🗑</button>
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
          <div className="space-y-3">
            {orders.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <p className="text-4xl">📋</p>
                <p className="text-white font-semibold text-sm">Aucune commande</p>
                <p className="text-gray-600 text-xs">Les commandes passées depuis ton profil apparaîtront ici.</p>
              </div>
            ) : (
              orders.map(order => {
                const st = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: '#6b7280' }
                return (
                  <div key={order.id} className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-white font-semibold text-sm">{order.buyerName}</p>
                        <p className="text-gray-600 text-xs">{new Date(order.createdAt).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border font-semibold"
                        style={{ color: st.color, borderColor: st.color + '44', background: st.color + '11' }}>
                        {st.label}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {order.items.map((it, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-400">{it.name} × {it.qty}</span>
                          <span className="text-white">{(it.price * it.qty).toFixed(2)}€</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-[#111] flex items-center justify-between">
                      <div>
                        <p className="text-gray-500 text-xs">Commission LIVEINBLACK : <span className="text-red-400">{order.commission.toFixed(2)}€</span></p>
                        <p className="text-white font-bold text-sm">Tu reçois : {order.sellerReceives.toFixed(2)}€</p>
                      </div>
                      {order.status === 'pending' && (
                        <div className="flex gap-1.5">
                          <button onClick={() => { updateOrderStatus(order.id, 'confirmed'); setOrders(getOrdersForSeller(uid)) }}
                            className="px-3 py-1.5 bg-[#d4af37] text-black text-xs font-bold rounded-lg">Confirmer</button>
                          <button onClick={() => { updateOrderStatus(order.id, 'cancelled'); setOrders(getOrdersForSeller(uid)) }}
                            className="px-3 py-1.5 border border-red-500/30 text-red-400 text-xs rounded-lg">Refuser</button>
                        </div>
                      )}
                      {order.status === 'confirmed' && (
                        <button onClick={() => { updateOrderStatus(order.id, 'done'); setOrders(getOrdersForSeller(uid)) }}
                          className="px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg">Terminé</button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#d4af37] text-black px-4 py-2.5 rounded-2xl text-sm font-bold shadow-xl">
          {toast}
        </div>
      )}
    </Layout>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC SERVICES VIEW (for regular users)
// ══════════════════════════════════════════════════════════════════════════════

function PublicServicesView({ user, uid, navigate }) {
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
  const [contact, setContact] = useState({ open: false, provider: null, sent: false, name: '', message: '' })
  const [browseSearch, setBrowseSearch] = useState('')
  const [browseCat, setBrowseCat] = useState('tous')
  // Ordering
  const [orderModal, setOrderModal] = useState(null) // { provider }
  const [cart, setCart] = useState([]) // [{ item, qty }]
  const [orderSuccess, setOrderSuccess] = useState(false)

  const cat = CATEGORIES.find(c => c.id === selected)
  const allProviders = [...STATIC_PROVIDERS, ...createdProviders, ...getAllProviderProfiles().map(p => ({
    id: `account_${p.userId}`, userId: p.userId,
    type: p.prestataireType, icon: CATEGORIES.find(c => c.id === p.prestataireType)?.icon || '🎤',
    color: CATEGORIES.find(c => c.id === p.prestataireType)?.color || '#d4af37',
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
  function startRegister(catId) {
    setSelected(catId); setStep(1); setFormValues({}); setExtras([]);
    setPhotoPreviews([]); setFormErrors({}); setShowCustomInput(false); setCustomOptionInput('')
    setMode('register')
  }

  // ── Cart helpers ──
  function cartQty(itemId) { return cart.find(c => c.item.id === itemId)?.qty || 0 }
  function setCartQty(item, qty) {
    if (qty <= 0) { setCart(c => c.filter(ci => ci.item.id !== item.id)); return }
    setCart(c => { const ex = c.find(ci => ci.item.id === item.id); return ex ? c.map(ci => ci.item.id === item.id ? { ...ci, qty } : ci) : [...c, { item, qty }] })
  }
  const cartTotal = cart.reduce((s, ci) => s + ci.item.price * ci.qty, 0)
  const commission = Math.round(cartTotal * 0.1 * 100) / 100

  function handlePlaceOrder() {
    if (!orderModal || cart.length === 0) return
    const balance = getBalance(uid)
    if (balance < cartTotal) { alert(`Solde insuffisant (${balance.toFixed(0)}€ disponible, ${cartTotal.toFixed(2)}€ requis)`); return }
    deductFunds(uid, cartTotal, `Commande chez ${orderModal.name}`)
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
        <div className="px-4 py-6 space-y-5">
          <div>
            <h2 className="text-3xl font-black uppercase" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              Services <span className="text-[#d4af37]">& Prestataires</span>
            </h2>
            <p className="text-gray-500 text-sm mt-1">Marketplace des professionnels de l'événementiel</p>
          </div>
          <button onClick={() => setMode('browse')} className="w-full text-left">
            <div className="relative overflow-hidden rounded-2xl border border-[#d4af37]/30 bg-gradient-to-r from-[#d4af37]/10 to-transparent p-5 hover:border-[#d4af37]/60 transition-all">
              <p className="text-[#d4af37] text-xs uppercase tracking-widest mb-1">Annuaire</p>
              <p className="text-white text-lg font-bold">Parcourir les prestataires</p>
              <p className="text-gray-500 text-sm mt-1">{allProviders.length} profil{allProviders.length > 1 ? 's' : ''} · Salles, DJs, artistes, matériel...</p>
              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-4xl opacity-20">🔍</span>
            </div>
          </button>
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-3">Tu veux rejoindre la marketplace ?</p>
            <div className="space-y-3">
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => startRegister(cat.id)} className="w-full text-left">
                  <div className="p-4 rounded-2xl border transition-all hover:scale-[1.01] active:scale-[0.99]" style={{ borderColor: cat.color + '33', background: cat.color + '08' }}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: cat.color + '22', border: `1px solid ${cat.color}44` }}>{cat.icon}</div>
                      <div className="flex-1">
                        <p className="text-white font-semibold text-sm">{cat.title}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{cat.desc}</p>
                      </div>
                      <span style={{ color: cat.color }} className="text-lg">›</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  // ── BROWSE ──
  if (mode === 'browse') {
    const BROWSE_CATS = [
      { id: 'tous', label: 'Tous' }, { id: 'salle', label: '🏛 Salles' },
      { id: 'prestation', label: '🎤 Prestataires' }, { id: 'materiel', label: '🔊 Matériel' },
      { id: 'supermarche', label: '🛒 Supermarché' },
    ]
    const filteredProviders = allProviders.filter(p => {
      const matchSearch = !browseSearch || p.name.toLowerCase().includes(browseSearch.toLowerCase()) || p.typeLabel?.toLowerCase().includes(browseSearch.toLowerCase()) || p.tags?.some(t => t.toLowerCase().includes(browseSearch.toLowerCase()))
      const matchCat = browseCat === 'tous' || p.type === browseCat
      return matchSearch && matchCat
    })

    return (
      <Layout>
        <div className="px-4 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setMode('landing')} className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-gray-400">‹</button>
            <div>
              <h2 className="text-white font-bold">Prestataires</h2>
              <p className="text-gray-600 text-xs">{filteredProviders.length} profil(s)</p>
            </div>
          </div>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600">🔍</span>
            <input className="input-dark pl-10" placeholder="Recherche par nom, type, tags..."
              value={browseSearch} onChange={e => setBrowseSearch(e.target.value)} />
            {browseSearch && <button onClick={() => setBrowseSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white">✕</button>}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {BROWSE_CATS.map(bc => (
              <button key={bc.id} onClick={() => setBrowseCat(bc.id)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${browseCat === bc.id ? 'bg-[#d4af37] text-black border-[#d4af37]' : 'border-[#222] text-gray-500 hover:border-gray-500'}`}>
                {bc.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {filteredProviders.length === 0 ? (
              <div className="text-center py-16 text-gray-600"><p className="text-4xl mb-3">🔎</p><p>Aucun prestataire trouvé</p></div>
            ) : filteredProviders.map(prov => {
              const provCatalog = prov.userId ? getCatalog(prov.userId).filter(i => i.available) : []
              return (
                <div key={prov.id} className="card-dark p-4 rounded-2xl space-y-3">
                  {prov.photos?.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {prov.photos.map((src, i) => <img key={i} src={src} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />)}
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: (prov.color || '#d4af37') + '22', border: `1px solid ${(prov.color || '#d4af37')}44` }}>{prov.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-white font-semibold text-sm">{prov.name}</h3>
                        {prov.rating > 0 && <span className="text-[#d4af37] text-xs flex-shrink-0">★ {prov.rating}</span>}
                      </div>
                      <p className="text-gray-500 text-xs">{prov.typeLabel}</p>
                      {prov.location && <p className="text-gray-600 text-xs mt-0.5">📍 {prov.location}</p>}
                      {prov.capacity && <p className="text-gray-600 text-xs">👥 {prov.capacity}</p>}
                    </div>
                  </div>
                  {prov.description ? <p className="text-gray-400 text-xs leading-relaxed">{prov.description}</p> : null}
                  {prov.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {prov.tags.map(t => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border text-gray-400 border-[#333]">{t}</span>)}
                    </div>
                  )}

                  {/* Catalog preview (supermarchés only) */}
                  {provCatalog.length > 0 && (
                    <div className="bg-[#111] rounded-xl p-3 space-y-1.5">
                      <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-2">Aperçu du catalogue</p>
                      {provCatalog.slice(0, 3).map(item => (
                        <div key={item.id} className="flex justify-between text-xs">
                          <span className="text-gray-400 truncate">{item.name}</span>
                          <span className="text-[#d4af37] font-semibold flex-shrink-0 ml-2">{item.price}€/{item.unit}</span>
                        </div>
                      ))}
                      {provCatalog.length > 3 && <p className="text-gray-600 text-[10px]">+{provCatalog.length - 3} autres articles</p>}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-[#1a1a1a] gap-2">
                    <span className="text-white font-semibold text-sm truncate">{prov.price || ''}</span>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => setContact({ open: true, provider: prov, sent: false, name: '', message: '' })}
                        className="border border-[#333] text-gray-400 text-xs py-1.5 px-3 rounded-xl hover:border-white/20 hover:text-white transition-all">
                        Contacter
                      </button>
                      {(prov.userId || prov.type === 'supermarche') && (
                        <button onClick={() => { setOrderModal(prov); setCart([]); setOrderSuccess(false) }}
                          className="btn-gold text-xs py-1.5 px-3">
                          {prov.type === 'supermarche' ? '🛒 Commander' : '📅 Réserver'}
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
          <div className="fixed inset-0 bg-black/80 z-50 flex items-end" onClick={e => e.target === e.currentTarget && setContact(c => ({ ...c, open: false }))}>
            <div className="w-full bg-[#0d0d0d] rounded-t-3xl p-6 space-y-4 border-t border-[#222]" style={{ maxWidth: 480, margin: '0 auto' }}>
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold">Contacter {contact.provider?.name}</h3>
                <button onClick={() => setContact(c => ({ ...c, open: false }))} className="text-gray-500 text-xl w-8 h-8 flex items-center justify-center">✕</button>
              </div>
              {contact.sent ? (
                <div className="text-center py-6">
                  <p className="text-4xl mb-3">✉️</p>
                  <p className="text-white font-semibold">Message envoyé !</p>
                  <p className="text-gray-400 text-sm mt-1">Le prestataire recevra ta demande sous 24-48h.</p>
                  <button onClick={() => setContact(c => ({ ...c, open: false }))} className="btn-gold mt-4 text-sm">Fermer</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <input className="input-dark" placeholder="Ton nom" value={contact.name} onChange={e => setContact(c => ({ ...c, name: e.target.value }))} />
                  <textarea className="input-dark resize-none h-28 text-sm" placeholder="Décris ton événement, ta date, tes besoins..." value={contact.message} onChange={e => setContact(c => ({ ...c, message: e.target.value }))} />
                  <button onClick={() => {
                    if (!contact.name || !contact.message) return
                    const myName = user?.name || contact.name
                    const providerId = `provider_${contact.provider?.id || 'unknown'}`
                    const conv = createDirectConversation(uid, myName, providerId, contact.provider?.name || 'Prestataire')
                    if (conv) sendMessage(conv.id, uid, myName, 'text', contact.message)
                    navigate('/messagerie')
                  }} className={`btn-gold w-full ${(!contact.name || !contact.message) ? 'opacity-50' : ''}`}>
                    Envoyer la demande
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Order Modal */}
        {orderModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => { if (!orderSuccess) { setOrderModal(null); setCart([]) } }} />
            <div className="relative w-full max-w-lg bg-[#0d0d0d] border border-[#1a1a1a] rounded-t-3xl max-h-[85vh] overflow-y-auto pb-8">
              <div className="p-4 border-b border-[#1a1a1a] sticky top-0 bg-[#0d0d0d] z-10">
                <div className="w-10 h-1 bg-[#333] rounded-full mx-auto mb-3" />
                {orderSuccess ? (
                  <div className="text-center py-4 space-y-3">
                    <p className="text-4xl">✅</p>
                    <p className="text-white font-bold">Commande envoyée !</p>
                    <p className="text-gray-400 text-sm">Ta commande a été transmise à <span className="text-white">{orderModal.name}</span>. Tu seras notifié(e) dès confirmation.</p>
                    <p className="text-[#d4af37] text-sm font-bold">{cartTotal.toFixed(2)}€ débités de ton portefeuille</p>
                    <button onClick={() => { setOrderModal(null); setCart([]) }} className="btn-gold w-full mt-2">Fermer</button>
                  </div>
                ) : (
                  <>
                    <h3 className="text-white font-bold text-center">{orderModal.type === 'supermarche' ? '🛒 Commander' : '📅 Réserver'} — {orderModal.name}</h3>
                  </>
                )}
              </div>

              {!orderSuccess && (
                <div className="p-4 space-y-4">
                  {/* Catalog items */}
                  {orderModal.userId ? (
                    <>
                      {getCatalog(orderModal.userId).filter(i => i.available).length === 0 ? (
                        <p className="text-gray-600 text-sm text-center py-8">Catalogue vide pour le moment.</p>
                      ) : (
                        <div className="space-y-2">
                          {getCatalog(orderModal.userId).filter(i => i.available).map(item => (
                            <div key={item.id} className="flex items-center gap-3 p-3 bg-[#111] rounded-xl">
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-semibold truncate">{item.name}</p>
                                <p className="text-[#d4af37] text-xs">{item.price}€ / {item.unit}</p>
                                {item.category && <p className="text-gray-600 text-[10px]">{item.category}</p>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {cartQty(item.id) > 0 && (
                                  <>
                                    <button onClick={() => setCartQty(item, cartQty(item.id) - 1)} className="w-7 h-7 rounded-lg bg-[#1a1a1a] text-white font-bold flex items-center justify-center">−</button>
                                    <span className="text-white font-bold text-sm w-5 text-center">{cartQty(item.id)}</span>
                                  </>
                                )}
                                <button onClick={() => setCartQty(item, cartQty(item.id) + 1)} className="w-7 h-7 rounded-lg bg-[#d4af37] text-black font-bold flex items-center justify-center">+</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="bg-[#111] rounded-xl p-4 space-y-2">
                      <p className="text-gray-400 text-sm">Décris ta demande de prestation</p>
                      <textarea className="input-dark resize-none h-20 text-sm" placeholder="Date, durée, type d'événement, budget..." />
                    </div>
                  )}

                  {/* Cart summary */}
                  {cart.length > 0 && (
                    <div className="bg-[#111] rounded-2xl p-4 space-y-2 border border-[#d4af37]/20">
                      <p className="text-gray-500 text-xs uppercase tracking-wider">Récapitulatif</p>
                      {cart.map((ci, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-400">{ci.item.name} × {ci.qty}</span>
                          <span className="text-white">{(ci.item.price * ci.qty).toFixed(2)}€</span>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-[#1a1a1a] space-y-1">
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>Commission LIVEINBLACK (10%)</span>
                          <span>{commission.toFixed(2)}€</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold">
                          <span className="text-white">Total à payer</span>
                          <span className="text-[#d4af37]">{cartTotal.toFixed(2)}€</span>
                        </div>
                        <p className="text-gray-700 text-[10px]">Solde disponible : {getBalance(uid).toFixed(0)}€</p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handlePlaceOrder}
                    disabled={cart.length === 0}
                    className="btn-gold w-full disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {cart.length === 0 ? 'Ajoute des articles pour commander' : `Confirmer la commande — ${cartTotal.toFixed(2)}€`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Layout>
    )
  }

  // ── REGISTER FLOW ──
  return (
    <Layout>
      <div className="px-4 py-5 space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : setMode('landing')}
            className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-gray-400 hover:text-white transition-colors">‹</button>
          <div>
            <h2 className="text-white font-bold text-sm">{cat?.title}</h2>
            <p className="text-gray-600 text-xs">Étape {step}/4</p>
          </div>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4].map(s => <div key={s} className="flex-1 h-1 rounded-full transition-all" style={{ background: s <= step ? cat?.color : '#222' }} />)}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-white font-semibold">Documents légaux requis</h3>
              <p className="text-gray-500 text-xs mt-1">Pour garantir la sécurité de tous.</p>
            </div>
            <div className="space-y-3">
              {cat?.legalDocs.map(doc => (
                <div key={doc} className="flex items-start gap-3 p-3 glass rounded-xl">
                  <span style={{ color: cat.color }} className="mt-0.5 flex-shrink-0">✓</span>
                  <p className="text-gray-300 text-sm">{doc}</p>
                </div>
              ))}
            </div>
            <div className="glass p-4 rounded-xl border border-yellow-500/20">
              <p className="text-yellow-400 text-xs">⚠ Ton profil sera visible après validation sous 48h.</p>
            </div>
            <button onClick={() => setStep(2)} className="btn-gold w-full" style={{ background: cat?.color }}>
              J'ai compris — Continuer
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-white font-semibold">Tes informations</h3>
            <div className="space-y-3">
              {cat?.fields.map(field => (
                <div key={field.label}>
                  <label className="text-gray-500 text-xs mb-1.5 block">{field.label} {field.required && <span className="text-red-400">*</span>}</label>
                  {field.type === 'textarea' ? (
                    <textarea className={`input-dark resize-none h-24 ${formErrors[field.label] ? 'border-red-500/60' : ''}`}
                      placeholder={field.placeholder} value={formValues[field.label] || ''}
                      onChange={e => setFormValues(v => ({ ...v, [field.label]: e.target.value }))} />
                  ) : (
                    <input className={`input-dark ${formErrors[field.label] ? 'border-red-500/60' : ''}`}
                      type={field.type} placeholder={field.placeholder} value={formValues[field.label] || ''}
                      onChange={e => setFormValues(v => ({ ...v, [field.label]: e.target.value }))} />
                  )}
                  {formErrors[field.label] && <p className="text-red-400 text-xs mt-0.5">{formErrors[field.label]}</p>}
                </div>
              ))}
            </div>
            <button onClick={() => { if (validateStep2()) setStep(3) }} className="btn-gold w-full">Suivant →</button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-white font-semibold">Options & photos</h3>
              <p className="text-gray-500 text-xs mt-1">Sélectionne ce qui s'applique.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {cat?.extras.map(ex => (
                <button key={ex} onClick={() => toggleExtra(ex)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${extras.includes(ex) ? 'text-white border-transparent' : 'text-gray-500 border-[#222] hover:border-gray-500'}`}
                  style={extras.includes(ex) ? { background: cat.color, borderColor: cat.color } : {}}>
                  {ex}
                </button>
              ))}
              {extras.filter(e => !cat?.extras.includes(e)).map(ex => (
                <button key={ex} onClick={() => toggleExtra(ex)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border text-white"
                  style={{ background: cat?.color + 'cc', borderColor: cat?.color }}>
                  {ex} ✕
                </button>
              ))}
              {showCustomInput ? (
                <div className="flex items-center gap-2 w-full mt-1">
                  <input className="input-dark flex-1 text-sm" placeholder="Option personnalisée..." value={customOptionInput}
                    onChange={e => setCustomOptionInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomOption()} autoFocus />
                  <button onClick={addCustomOption} className="px-3 py-2 rounded-xl text-xs font-bold text-white" style={{ background: cat?.color }}>Ajouter</button>
                  <button onClick={() => { setShowCustomInput(false); setCustomOptionInput('') }} className="text-gray-500">✕</button>
                </div>
              ) : (
                <button onClick={() => setShowCustomInput(true)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-[#444] text-gray-500 hover:border-gray-400">
                  + Ajouter une option
                </button>
              )}
            </div>
            <div>
              <label className="text-gray-500 text-xs mb-2 block">Photos (profil / portfolio)</label>
              <div className="flex gap-2 flex-wrap">
                {photoPreviews.map((src, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setPhotoPreviews(prev => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full text-white text-[10px] flex items-center justify-center">✕</button>
                  </div>
                ))}
                {photoPreviews.length < 5 && (
                  <div className="w-20 h-20 rounded-xl border-2 border-dashed border-[#222] flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-[#444] flex-shrink-0"
                    onClick={() => photoInputRef.current?.click()}>
                    <p className="text-xl">📸</p>
                    <p className="text-[10px] text-gray-600">Ajouter</p>
                  </div>
                )}
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
              <p className="text-gray-700 text-[10px] mt-1">JPG, PNG — max 5 photos · 5 MB</p>
            </div>
            <button onClick={handlePublishProvider} className="btn-gold w-full">Créer mon profil →</button>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-8 space-y-4">
            <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-4xl"
              style={{ background: cat?.color + '22', border: `2px solid ${cat?.color}` }}>
              {cat?.icon}
            </div>
            <h3 className="text-white text-xl font-bold">Inscription envoyée !</h3>
            <p className="text-gray-400 text-sm">Notre équipe valide les documents sous <strong className="text-white">48h</strong>.</p>
            <button onClick={() => setMode('browse')} className="btn-gold w-full">Voir les prestataires →</button>
            <button onClick={() => { setMode('landing'); setStep(1) }} className="btn-outline w-full">Proposer un autre service</button>
          </div>
        )}
      </div>
    </Layout>
  )
}
