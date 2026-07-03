import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import PayoutPanel from '../components/PayoutPanel'
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
    extras: ['Disponible week-end', 'Matériel propre', 'Prestation extérieure', 'Équipe (groupe)', 'Vidéo disponible'],
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
      { label: 'Description', placeholder: 'Présentation de ton enseigne...', type: 'textarea' },
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
    rating: 0, tags: s.tags, pending: false,
  })),
  ...services.prestations.map(p => ({
    id: `presta_${p.id}`, type: 'prestation', icon: 'mic', color: '#ff6b1a',
    name: p.name, typeLabel: p.type, description: '', price: p.price,
    location: '', rating: 0, tags: p.tags, pending: false,
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

function ProviderInfo({ label, definition, formula, limitation }) {
  return (
    <details style={{ position: 'relative' }}>
      <summary aria-label={`Définition de ${label}`} style={{ listStyle: 'none', width: 15, height: 15, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.35)', display: 'grid', placeItems: 'center', cursor: 'pointer', fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,0.55)' }}>i</summary>
      <div style={{ position: 'absolute', zIndex: 20, top: 23, right: 0, width: 'min(280px, 76vw)', background: '#090b14', border: '1px solid rgba(78,232,200,0.28)', padding: 13, boxShadow: '0 18px 45px rgba(0,0,0,0.55)' }}>
        <strong style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'white' }}>{label}</strong>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, lineHeight: 1.55, color: 'rgba(255,255,255,0.68)', margin: '8px 0' }}>{definition}</p>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, lineHeight: 1.5, color: '#4ee8c8', margin: 0 }}>Calcul · {formula}</p>
        {limitation && <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, lineHeight: 1.5, color: '#c8a96e', margin: '7px 0 0' }}>{limitation}</p>}
      </div>
    </details>
  )
}

function ProviderMetric({ label, value, helper, tone = '#4ee8c8', definition, formula, limitation }) {
  return (
    <div style={{ ...S.card, padding: 14, borderColor: `${tone}55`, minHeight: 112, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.52)', lineHeight: 1.5 }}>{label}</span>
        <ProviderInfo label={label} definition={definition} formula={formula} limitation={limitation} />
      </div>
      <strong style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, fontWeight: 400, letterSpacing: '0.04em', color: tone, lineHeight: 1, marginTop: 12 }}>{value}</strong>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.36)', marginTop: 6 }}>{helper}</span>
    </div>
  )
}

function ProviderRequestsView({ orders, uid, onRefresh, showToast }) {
  const requests = orders.filter(order => order.status === 'pending')
  if (!requests.length) {
    return (
      <div style={{ ...S.card, padding: 30, textAlign: 'center' }}>
        <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.75)', margin: 0 }}>Aucune demande à traiter</p>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.65, margin: '9px auto 0', maxWidth: 360 }}>Les demandes des organisateurs apparaîtront ici avant de devenir des commandes confirmées. Complète ton profil et publie au moins une offre pour gagner en visibilité.</p>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <Eyebrow>Demandes entrantes</Eyebrow>
      {requests.map(order => (
        <article key={order.id} style={{ ...S.card, padding: 16, borderColor: 'rgba(200,169,110,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 17, color: 'rgba(255,255,255,0.9)', margin: 0 }}>{order.buyerName || 'Organisateur'}</p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.38)', margin: '5px 0 0' }}>{new Date(order.createdAt).toLocaleString('fr-FR')} · {order.items?.length || 0} offre{(order.items?.length || 0) > 1 ? 's' : ''}</p>
            </div>
            <strong style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 25, color: '#c8a96e', fontWeight: 400 }}>{Number(order.sellerReceives || 0).toFixed(2)} €</strong>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => { updateOrderStatus(order.id, 'confirmed'); onRefresh(); showToast('Demande acceptée') }} style={{ ...S.btnGold, flex: 1, padding: 10 }}>Accepter</button>
            <button onClick={() => { updateOrderStatus(order.id, 'cancelled'); onRefresh(); showToast('Demande refusée') }} style={{ ...S.btnGhost, flex: 1, padding: 10 }}>Refuser</button>
          </div>
        </article>
      ))}
    </div>
  )
}

function ProviderStatsView({ orders, catalog }) {
  const completed = orders.filter(order => order.status === 'done')
  const confirmed = orders.filter(order => ['confirmed', 'ready'].includes(order.status))
  const requests = orders.filter(order => order.status === 'pending')
  const gross = completed.reduce((sum, order) => sum + Number(order.subtotal || 0), 0)
  const net = completed.reduce((sum, order) => sum + Number(order.sellerReceives || 0), 0)
  const conversionBase = orders.filter(order => order.status !== 'pending').length
  const conversion = orders.length ? completed.length / orders.length * 100 : null
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - index))
    const end = date.getTime() + 86400000
    const value = completed.filter(order => order.createdAt >= date.getTime() && order.createdAt < end).reduce((sum, order) => sum + Number(order.sellerReceives || 0), 0)
    return { label: date.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 2), value }
  })
  const max = Math.max(...days.map(day => day.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <ProviderMetric label="Revenus nets" value={`${net.toFixed(0)} €`} helper="commandes terminées" definition="Montant estimé dû au prestataire après commission connue." formula="Somme(sellerReceives) des commandes terminées" limitation="À ne pas confondre avec le solde immédiatement disponible." />
        <ProviderMetric label="Revenus bruts" value={`${gross.toFixed(0)} €`} helper="avant commission" tone="#c8a96e" definition="Somme payée par les organisateurs avant déductions." formula="Somme(subtotal) des commandes terminées" limitation="Ce n’est pas le montant reversé." />
        <ProviderMetric label="Demandes à traiter" value={requests.length} helper="action requise" tone={requests.length ? '#e05aaa' : '#4ee8c8'} definition="Demandes qui attendent une décision du prestataire." formula="Nombre de demandes avec statut pending" limitation="À ne pas confondre avec les commandes confirmées." />
        <ProviderMetric label="Commandes à venir" value={confirmed.length} helper="confirmées" definition="Prestations acceptées qui ne sont pas encore terminées." formula="Statuts confirmed + ready" limitation="Les devis et demandes ne sont pas inclus." />
        <ProviderMetric label="Offres actives" value={catalog.filter(item => item.available).length} helper={`sur ${catalog.length} offre${catalog.length > 1 ? 's' : ''}`} tone="#c8a96e" definition="Offres visibles et disponibles dans la marketplace." formula="Nombre d’offres avec available = true" limitation="Une offre active peut rester indisponible à certaines dates." />
        <ProviderMetric label="Conversion demande" value={conversion == null ? '—' : `${Math.round(conversion)} %`} helper={`${conversionBase} demande${conversionBase > 1 ? 's' : ''} traitée${conversionBase > 1 ? 's' : ''}`} definition="Part des demandes reçues qui deviennent des commandes terminées." formula="Commandes terminées ÷ demandes reçues × 100" limitation="Le suivi actuel ne distingue pas encore tous les devis intermédiaires." />
      </div>
      <div style={{ ...S.card, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}><Eyebrow>Revenus nets · 7 jours</Eyebrow><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#c8a96e' }}>{days.reduce((sum, day) => sum + day.value, 0).toFixed(0)} €</span></div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, height: 130 }}>
          {days.map(day => <div key={day.label} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 7 }}><div title={`${day.value.toFixed(2)} €`} style={{ width: '100%', minHeight: 3, height: `${Math.max(3, day.value / max * 100)}%`, background: day.value ? 'linear-gradient(180deg,#4ee8c8,rgba(78,232,200,0.2))' : 'rgba(255,255,255,0.06)' }} /><span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{day.label}</span></div>)}
        </div>
      </div>
      <div style={{ padding: 13, borderLeft: '2px solid #c8a96e', background: 'rgba(200,169,110,0.05)', fontFamily: "'DM Mono', monospace", fontSize: 10, lineHeight: 1.6, color: 'rgba(255,255,255,0.48)' }}>Les vues du profil, visiteurs uniques, avis et temps de réponse apparaîtront lorsque leur collecte serveur sera disponible. LIVE IN BLACK affiche « non disponible » au lieu de fabriquer des zéros.</div>
    </div>
  )
}

function ProviderDocumentsView({ user, navigate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...S.card, padding: 20, borderColor: user?.status === 'active' ? 'rgba(78,232,200,0.28)' : 'rgba(200,169,110,0.28)' }}>
        <Eyebrow>Confiance et vérification</Eyebrow>
        <p style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.9)', margin: 0 }}>{user?.status === 'active' ? 'Profil validé' : 'Vérification en cours'}</p>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, lineHeight: 1.7, color: 'rgba(255,255,255,0.45)', margin: '8px 0 16px' }}>Les documents sensibles restent dans ton dossier de candidature. Ils ne sont jamais affichés sur ton profil public ; seuls les badges de validation sont visibles.</p>
        <button onClick={() => navigate('/mon-dossier')} style={S.btnGold}>Ouvrir mon dossier</button>
      </div>
      <div style={{ ...S.card, padding: 16 }}><p style={{ ...S.label, marginBottom: 8 }}>Badges publics</p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><span style={{ padding: '5px 9px', border: '1px solid rgba(78,232,200,0.25)', color: '#4ee8c8', fontFamily: "'DM Mono', monospace", fontSize: 9 }}>IDENTITÉ {user?.status === 'active' ? 'VALIDÉE' : 'EN ATTENTE'}</span><span style={{ padding: '5px 9px', border: '1px solid rgba(200,169,110,0.25)', color: '#c8a96e', fontFamily: "'DM Mono', monospace", fontSize: 9 }}>PAIEMENT À CONFIGURER</span></div></div>
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

  // Prestataire → son espace vendeur (catalogue, commandes, profil).
  if (user?.role === 'prestataire') {
    return <PrestataireDashboard user={user} navigate={navigate} />
  }

  // Organisateur & agent → la MARKETPLACE pour TROUVER et contacter des
  // prestataires (c'est la nav « Services » côté demande). agentMode cache la
  // section « Rejoindre la marketplace » et oriente vers la recherche.
  if (user?.role === 'organisateur' || user?.role === 'agent') {
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
  const [photoUploading, setPhotoUploading] = useState(false)
  const providerPhotoRef = useRef(null)
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

  function handleProviderPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { showToast('Format invalide (JPG/PNG/WEBP)'); return }
    if (file.size > 5 * 1024 * 1024) { showToast('Image trop lourde (max 5 Mo)'); return }
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result
      setProfileForm(f => ({ ...f, photoUrl: dataUrl })) // preview immédiate
      setPhotoUploading(true)
      try {
        const { uploadProviderPhoto } = await import('../utils/uploadImage')
        const url = await uploadProviderPhoto(uid, dataUrl)
        setProfileForm(f => ({ ...f, photoUrl: url }))
      } catch {
        // Secours si Storage échoue : compresser pour rester sous la limite
        // Firestore (1 Mo) puisque le profil providers/{uid} contient photoUrl.
        try {
          const { compressDataUrl } = await import('../utils/uploadImage')
          const small = await compressDataUrl(dataUrl, 400, 0.6)
          setProfileForm(f => ({ ...f, photoUrl: small }))
        } catch {}
      }
      setPhotoUploading(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleAddItem() {
    if (!newItem.name.trim() || !newItem.price) return
    addCatalogItem(uid, { ...newItem, price: parseFloat(newItem.price) })
    setNewItem({ name: '', price: '', category: '', unit: 'unité', description: '', available: true })
    setShowAddItem(false)
    setCatalog(getCatalog(uid))
    showToast('Offre ajoutée')
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
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
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
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 36, fontWeight: 300, color: '#c8a96e', margin: '4px 0 0', lineHeight: 1 }}>
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
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 30, fontWeight: 300, color: pendingOrders > 0 ? '#c8a96e' : 'rgba(255,255,255,0.90)', margin: 0 }}>
              {pendingOrders}
            </p>
            <p style={{ ...S.label, marginBottom: 0, marginTop: 4 }}>À traiter</p>
          </div>
          {/* Offres actives */}
          <div style={{ ...S.card, padding: 14, textAlign: 'center' }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 30, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
              {availableItems}
              {availableItems !== catalog.length && (
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.32)' }}> /{catalog.length}</span>
              )}
            </p>
            <p style={{ ...S.label, marginBottom: 0, marginTop: 4 }}>Offres actives</p>
          </div>
        </div>

        {/* Navigation métier — scrollable sur mobile */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(6,8,16,0.6)', padding: 4, borderRadius: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {[
            { key: 'apercu', label: 'Aperçu' },
            { key: 'demandes', label: `Demandes${pendingOrders > 0 ? ` (${pendingOrders})` : ''}` },
            { key: 'commandes', label: 'Commandes' },
            { key: 'catalogue', label: `Catalogue (${catalog.length})` },
            { key: 'statistiques', label: 'Statistiques' },
            { key: 'profil', label: 'Profil' },
            { key: 'documents', label: 'Documents' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                flex: '0 0 auto', minWidth: 94, padding: '9px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
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

        <div key={tab} className="lib-tab-content">
        {/* ── APERÇU TAB ── */}
        {tab === 'apercu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Reversements — connecter son compte / solde / demander un virement */}
            <PayoutPanel uid={uid} returnPath={typeof window !== 'undefined' ? window.location.pathname : '/'} />
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
                        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.92)', margin: 0 }}>
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
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 300, color: '#4ee8c8', margin: 0, lineHeight: 1 }}>
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
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.78)', margin: 0 }}>
                  Bienvenue sur ton espace prestataire.
                </p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7, margin: '10px 0 16px' }}>
                  Première étape : publie ta première offre au catalogue. Elle sera visible par les organisateurs, qui pourront t’envoyer une demande ou réserver.
                </p>
                <button onClick={() => setTab('catalogue')} style={{ ...S.btnGold, padding: '12px 22px' }}>
                  + Créer ma première offre
                </button>
              </div>
            )}

            {/* Résumé statique du compte */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ ...S.card, padding: 14 }}>
                <p style={{ ...S.label, margin: 0, marginBottom: 4 }}>Commandes en cours</p>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
                  {confirmedOrders}
                </p>
              </div>
              <div style={{ ...S.card, padding: 14 }}>
                <p style={{ ...S.label, margin: 0, marginBottom: 4 }}>Commandes terminées</p>
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>
                  {orders.filter(o => o.status === 'done').length}
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === 'demandes' && (
          <ProviderRequestsView orders={orders} uid={uid} onRefresh={refreshData} showToast={showToast} />
        )}

        {tab === 'statistiques' && (
          <ProviderStatsView orders={orders} catalog={catalog} />
        )}

        {tab === 'documents' && (
          <ProviderDocumentsView user={user} navigate={navigate} />
        )}

        {/* ── PROFIL TAB ── */}
        {tab === 'profil' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {profileFormMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Eyebrow>Profil prestataire</Eyebrow>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.05em', margin: 0 }}>Complète ton profil prestataire</p>
                {/* Photo de profil */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 6px' }}>
                  <button onClick={() => providerPhotoRef.current?.click()} disabled={photoUploading}
                    style={{ position: 'relative', width: 92, height: 92, borderRadius: '50%', overflow: 'hidden', cursor: photoUploading ? 'wait' : 'pointer', border: '1px solid rgba(78,232,200,0.30)', background: profileForm.photoUrl ? 'none' : 'rgba(78,232,200,0.06)', padding: 0 }}>
                    {profileForm.photoUrl
                      ? <img src={profileForm.photoUrl} alt="profil" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: photoUploading ? 0.5 : 1 }} />
                      : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 5 }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(78,232,200,0.7)" strokeWidth="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 7.5, color: 'rgba(78,232,200,0.7)', letterSpacing: '0.1em' }}>PHOTO</span>
                        </div>}
                    {photoUploading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 22, height: 22, border: '2px solid rgba(78,232,200,0.3)', borderTopColor: '#4ee8c8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>}
                  </button>
                  <input ref={providerPhotoRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleProviderPhoto} style={{ display: 'none' }} />
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {profile.photoUrl
                      ? <img src={profile.photoUrl} alt={profile.name} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(78,232,200,0.25)', flexShrink: 0 }} />
                      : <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(78,232,200,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "Inter, sans-serif", fontSize: 22, color: '#4ee8c8', flexShrink: 0 }}>{(profile.name || '?').charAt(0).toUpperCase()}</div>}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>{profile.name}</p>
                      {profile.verified && <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 8, letterSpacing: '0.1em', color: '#4ee8c8', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}><svg width="9" height="9" viewBox="0 0 24 24" fill="#4ee8c8"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>VÉRIFIÉ</span>}
                    </div>
                  </div>
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
                {catalog.length} offre{catalog.length !== 1 ? 's' : ''}
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
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Nouvelle offre</p>
                <FocusInput placeholder="Nom du service, pack, lieu ou matériel *" value={newItem.name} onChange={e => setNewItem(i => ({ ...i, name: e.target.value }))} />
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
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 300, color: 'rgba(255,255,255,0.42)', margin: 0 }}>Catalogue vide</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.28)', lineHeight: 1.7, maxWidth: 240, textAlign: 'center', margin: 0 }}>
                  Ajoute un service, un pack, un lieu ou du matériel pour apparaître sur ton profil public.
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
                            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.90)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{item.name}</p>
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
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 300, color: 'rgba(255,255,255,0.42)', margin: 0 }}>Aucune commande</p>
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
                        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>{order.buyerName}</p>
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
      </div>
    </Layout>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC SERVICES VIEW
// ══════════════════════════════════════════════════════════════════════════════

function PublicServicesView({ user, uid, navigate, agentMode }) {
  const { setUser } = useAuth()
  const [mode, setMode] = useState('landing')
  const [selected, setSelected] = useState(null)
  const [createdProviders] = useState(getCreatedProviders)
  const [roleRequestState, setRoleRequestState] = useState('idle')
  const [roleRequestType, setRoleRequestType] = useState(null)
  const [roleRequestPrestType, setRoleRequestPrestType] = useState(null)
  const [contact, setContact] = useState({ open: false, provider: null, sent: false, demo: false, name: '', message: '' })
  const [browseSearch, setBrowseSearch] = useState('')
  const [browseCat, setBrowseCat] = useState('tous')
  const [orderModal, setOrderModal] = useState(null)
  const [cart, setCart] = useState([])
  const [orderSuccess, setOrderSuccess] = useState(false)

  // Catalogues de TOUS les prestataires depuis Firestore (collection partagée
  // catalogs/). getCatalog() ne lit que le localStorage du user courant → les
  // catalogues des autres prestataires étaient invisibles cross-device. Même
  // correctif que les boosts Top 3.
  const [catalogsByUser, setCatalogsByUser] = useState({})
  useEffect(() => {
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenCatalogs }) => {
      unsub = listenCatalogs(setCatalogsByUser)
    }).catch(() => {})
    return () => unsub()
  }, [])
  // Helper : préfère la source Firestore (cross-device), retombe sur le local
  // (utile pour le prestataire qui consulte son propre catalogue hors-ligne).
  const catalogOf = (userId) => catalogsByUser[userId] || getCatalog(userId)

  // Annuaire des prestataires depuis Firestore (collection partagée providers/).
  // getAllProviderProfiles() ne lit que le localStorage → un prestataire créé
  // sur un autre device était invisible. On fusionne Firestore + local (dédup
  // par userId, Firestore prioritaire).
  const [remoteProviders, setRemoteProviders] = useState([])
  useEffect(() => {
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenProviders }) => {
      unsub = listenProviders(setRemoteProviders)
    }).catch(() => {})
    return () => unsub()
  }, [])
  const providerProfiles = (() => {
    const byId = {}
    for (const p of getAllProviderProfiles()) if (p.userId) byId[p.userId] = p
    for (const p of remoteProviders) if (p.userId) byId[p.userId] = p // Firestore gagne
    // Écarte les profils fantômes (doc providers/ vide, onboarding abandonné) :
    // sans photo, description, localisation NI catalogue → pas un vrai prestataire.
    return Object.values(byId).filter(p =>
      p.name && (p.photoUrl || p.description || p.location || catalogOf(p.userId).some(i => i.available))
    )
  })()

  const cat = CATEGORIES.find(c => c.id === selected)
  const allProviders = [...STATIC_PROVIDERS, ...createdProviders, ...providerProfiles.map(p => ({
    id: `account_${p.userId}`, userId: p.userId,
    type: p.prestataireType, icon: CATEGORIES.find(c => c.id === p.prestataireType)?.icon || 'mic',
    color: CATEGORIES.find(c => c.id === p.prestataireType)?.color || '#c8a96e',
    name: p.name, typeLabel: CATEGORIES.find(c => c.id === p.prestataireType)?.title?.replace("J'ai ", '').replace("Je suis un ", '').replace("Je donne des ", '') || p.prestataireType,
    description: p.description, location: p.location, tags: [], rating: 0, pending: false,
    photoUrl: p.photoUrl || null, verified: !!p.verified,
    hasCatalog: catalogOf(p.userId).filter(i => i.available).length > 0,
  }))]

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
            <h2 style={{ fontFamily: "Inter, sans-serif", fontSize: 38, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: '0 0 8px', lineHeight: 1.1 }}>
              Services <span style={{ color: '#c8a96e' }}>& Prestataires</span>
            </h2>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', margin: 0, letterSpacing: '0.04em' }}>
              Marketplace des professionnels de l'événementiel
            </p>
          </div>

          {/* Browse banner — entrée vers la communauté des prestataires */}
          <button onClick={() => setMode('browse')} className="lib-press lib-lift" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'transform 0.18s ease' }}>
            <div style={{
              position: 'relative', overflow: 'hidden', borderRadius: 18,
              border: '1px solid rgba(78,232,200,0.22)',
              background: 'linear-gradient(135deg, rgba(78,232,200,0.10) 0%, rgba(200,169,110,0.06) 55%, transparent 100%)',
              padding: 20,
            }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#4ee8c8', margin: '0 0 6px' }}>La communauté</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: '0 0 10px' }}>Explore les prestataires</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* pile d'avatars (aperçu) */}
                <div style={{ display: 'flex' }}>
                  {allProviders.slice(0, 4).map((p, i) => (
                    <div key={p.id} style={{ width: 30, height: 30, borderRadius: '50%', marginLeft: i ? -10 : 0, border: '2px solid #0b0d14', background: (p.color || '#c8a96e') + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {p.photoUrl ? <img src={p.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <CatIcon id={p.icon} color={p.color || '#c8a96e'} size={13} />}
                    </div>
                  ))}
                </div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                  {allProviders.length} profil{allProviders.length > 1 ? 's' : ''} · salles, DJs, artistes, matériel…
                </p>
              </div>
              <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: '50%', background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
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
            <button onClick={() => setMode('landing')} className="lib-press" style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: 0, lineHeight: 1.1 }}>Communauté</p>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.42)', margin: '2px 0 0' }}>{filteredProviders.length} prestataire{filteredProviders.length > 1 ? 's' : ''} à découvrir</p>
            </div>
          </div>

          {/* Search — pilule arrondie (même look que les messages) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              placeholder="Rechercher un nom, un style, une ville…"
              value={browseSearch}
              onChange={e => setBrowseSearch(e.target.value)}
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 14 }}
            />
            {browseSearch && (
              <button onClick={() => setBrowseSearch('')} className="lib-press" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.42)', fontSize: 15, lineHeight: 1 }}>✕</button>
            )}
          </div>

          {/* Category filter pills */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            {BROWSE_CATS.map(bc => (
              <button key={bc.id} onClick={() => setBrowseCat(bc.id)} className="lib-press"
                style={{
                  flexShrink: 0, padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600,
                  border: '1px solid', transition: 'all 0.2s',
                  ...(browseCat === bc.id
                    ? { background: 'rgba(78,232,200,0.12)', borderColor: 'rgba(78,232,200,0.5)', color: '#4ee8c8' }
                    : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.5)' }),
                }}>
                {bc.label}
              </button>
            ))}
          </div>

          {/* Provider cards — façon réseau social */}
          <div className={filteredProviders.length ? 'lib-stagger' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filteredProviders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0', color: 'rgba(255,255,255,0.35)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ margin: '0 auto 12px', display: 'block' }}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, margin: 0 }}>Aucun prestataire trouvé</p>
              </div>
            ) : filteredProviders.map(prov => {
              const provCatalog = prov.userId ? catalogOf(prov.userId).filter(i => i.available) : []
              const accent = prov.color || '#c8a96e'
              return (
                <div key={prov.id} className="lib-lift" style={{
                  borderRadius: 18, overflow: 'hidden', cursor: 'default',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  transition: 'transform 0.18s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                }}>
                  {/* Bandeau de couverture coloré (identité du prestataire) */}
                  <div style={{ height: 60, background: `linear-gradient(120deg, ${accent}33, ${accent}0a 70%)`, position: 'relative' }}>
                    {prov.photos?.length > 0 && (
                      <img src={prov.photos[0]} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />
                    )}
                    {/* Note masquée : aucun système d'avis réel n'existe encore.
                        On n'affiche PAS d'étoile tant qu'elle ne repose pas sur de
                        vrais avis (sinon = note trompeuse). À réactiver quand les
                        avis prestataires seront implémentés (moyenne calculée +
                        nombre d'avis), pas avec une valeur codée en dur. */}
                  </div>

                  <div style={{ padding: '0 16px 16px', marginTop: -26 }}>
                    {/* Avatar + nom */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 10 }}>
                      {prov.photoUrl
                        ? <img src={prov.photoUrl} alt={prov.name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '3px solid #0b0d14', background: '#0b0d14', flexShrink: 0 }} />
                        : <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#0b0d14', border: '3px solid #0b0d14', boxShadow: `inset 0 0 0 1px ${accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <CatIcon id={prov.icon} color={accent} size={22} />
                          </div>}
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 17, fontWeight: 800, letterSpacing: '-0.3px', color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prov.name}</p>
                          {prov.verified && <svg width="14" height="14" viewBox="0 0 24 24" fill="#4ee8c8" style={{ flexShrink: 0 }}><path d="M12 2l2.4 2.4 3.3-.6.6 3.3L21 12l-2.7 2.6.6 3.3-3.3.6L12 22l-2.6-2.7-3.3.6-.6-3.3L3 12l2.5-2.6-.6-3.3 3.3.6z"/><path d="M10.5 14.5L8 12l-1 1 3.5 3.5L17 9l-1-1z" fill="#04040b"/></svg>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 999, background: `${accent}1a`, border: `1px solid ${accent}44`, fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, color: accent }}>{prov.typeLabel}</span>
                          {prov.location && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                              {prov.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {prov.description && (
                      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 10px' }}>{prov.description}</p>
                    )}

                    {(prov.tags?.length > 0 || prov.capacity) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {prov.capacity && (
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' }}>{prov.capacity}</span>
                        )}
                        {prov.tags?.map(t => (
                          <span key={t} style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, padding: '3px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' }}>{t}</span>
                        ))}
                      </div>
                    )}

                    {provCatalog.length > 0 && (
                      <div style={{ borderRadius: 12, background: 'rgba(6,8,16,0.5)', border: '1px solid rgba(255,255,255,0.05)', padding: 12, marginBottom: 12 }}>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', margin: '0 0 8px' }}>Au catalogue</p>
                        {provCatalog.slice(0, 3).map(item => (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: '#e0c690', flexShrink: 0, marginLeft: 8 }}>{item.price}€<span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>/{item.unit}</span></span>
                          </div>
                        ))}
                        {provCatalog.length > 3 && (
                          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '6px 0 0' }}>+{provCatalog.length - 3} autres articles</p>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {prov.price && <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prov.price}</span>}
                      <button onClick={() => setContact({ open: true, provider: prov, sent: false, demo: false, name: '', message: '' })} className="lib-press"
                        style={{ marginLeft: prov.price ? 0 : 'auto', padding: '9px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
                        Contacter
                      </button>
                      {(prov.userId || prov.type === 'supermarche') && (
                        <button onClick={() => { setOrderModal(prov); setCart([]); setOrderSuccess(false) }} className="lib-press"
                          style={{
                            padding: '9px 18px', borderRadius: 999, cursor: 'pointer', border: 'none',
                            background: 'linear-gradient(135deg, #c8a96e, #e0c690)',
                            fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: '#04040b',
                            boxShadow: '0 6px 18px -6px rgba(200,169,110,0.5)',
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
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Contacter {contact.provider?.name}</p>
                <button onClick={() => setContact(c => ({ ...c, open: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.42)', fontSize: 20, lineHeight: 1, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
              {contact.demo ? (
                <div style={{ textAlign: 'center', padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13" strokeLinecap="round"/><circle cx="12" cy="16.5" r="0.6" fill="#c8a96e"/></svg>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Profil de démonstration</p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7, margin: 0 }}>Ce profil n'est pas encore relié à un compte réel — ton message ne peut pas être envoyé pour l'instant.</p>
                  <button onClick={() => setContact(c => ({ ...c, open: false }))} style={{ ...S.btnGold, marginTop: 8 }}>Fermer</button>
                </div>
              ) : contact.sent ? (
                <div style={{ textAlign: 'center', padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="1"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 400, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Message envoyé</p>
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
                    // VRAI uid du prestataire (compte réel) — pas un id fabriqué,
                    // sinon le message partait vers un utilisateur fantôme et le
                    // prestataire ne recevait jamais rien.
                    const providerId = contact.provider?.userId
                    if (!providerId) {
                      // Prestataire de démo sans compte réel → pas de conversation possible,
                      // on ne doit pas prétendre qu'un message a été envoyé.
                      setContact(c => ({ ...c, demo: true }))
                      return
                    }
                    const conv = createDirectConversation(uid, myName, providerId, contact.provider?.name || 'Prestataire')
                    // Le message arrive dans la boîte du prestataire (conversation
                    // + badge non-lu via son listener Firestore) — c'est le vrai
                    // mécanisme de notification in-app, sans surface de spam.
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
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 24, fontWeight: 300, color: 'rgba(255,255,255,0.90)', margin: 0 }}>Commande envoyée</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7, margin: 0 }}>
                      Ta commande a été transmise à <span style={{ color: 'rgba(255,255,255,0.90)' }}>{orderModal.name}</span>. Tu seras notifié(e) dès confirmation.
                    </p>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 20, fontWeight: 300, color: '#c8a96e', margin: 0 }}>Total : {cartTotal.toFixed(2)}€</p>
                    <button onClick={() => { setOrderModal(null); setCart([]) }} style={{ ...S.btnGold, marginTop: 8 }}>Fermer</button>
                  </div>
                ) : (
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.90)', textAlign: 'center', margin: 0 }}>
                    {orderModal.type === 'supermarche' ? 'Commander' : 'Réserver'} — {orderModal.name}
                  </p>
                )}
              </div>

              {!orderSuccess && (
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {orderModal.userId ? (
                    <>
                      {catalogOf(orderModal.userId).filter(i => i.available).length === 0 ? (
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '32px 0', margin: 0 }}>Catalogue vide pour le moment.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {catalogOf(orderModal.userId).filter(i => i.available).map(item => (
                            <div key={item.id} style={{ ...S.card, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.90)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{item.name}</p>
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
                          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 300, color: '#c8a96e' }}>{cartTotal.toFixed(2)}€</span>
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
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.9)', margin: 0 }}>Candidature en cours</p>
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
                      // Garde anti-race : ne pas écraser la session si l'utilisateur
                      // a changé de compte pendant l'await (croisement de compte)
                      if (updated && updated.uid === user?.uid) setUser(updated)
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
              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.9)', margin: 0 }}>Candidature envoyée</p>
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
                      // Garde anti-race : ne pas écraser la session d'un autre compte
                      if (updated && updated.uid === user?.uid) setUser(updated)
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
