import { getRegionName, normalizeRegionId, normalizeRegionIds } from './locations.js'

// ─── Prestataire Catalog ─────────────────────────────────────────────────────
// Gère le catalogue public des prestataires.
// Les anciennes fonctions de commande restent lisibles pour compatibilité avec
// les données historiques, mais le produit actuel repose sur la mise en relation
// et la messagerie : aucun nouveau paiement de prestation n'est créé ici.

const CATALOG_KEY = uid => `lib_catalog_${uid}`
const CATALOG_TS_KEY = uid => `lib_catalog_ts_${uid}`
const ORDERS_KEY = 'lib_service_orders'
const COMMISSION_RATE = 0.10 // 10% pour LIVEINBLACK

// ── Catalog ──────────────────────────────────────────────────────────────────

export function getCatalog(userId) {
  try { return JSON.parse(localStorage.getItem(CATALOG_KEY(userId)) || '[]') } catch { return [] }
}

export function saveCatalog(userId, items) {
  if (!userId) return
  // Round-trip JSON : retire les champs undefined que Firestore rejette (une
  // seule valeur undefined ferait échouer la sync du catalogue ENTIER).
  const clean = JSON.parse(JSON.stringify(items))
  const updatedAt = new Date().toISOString()
  localStorage.setItem(CATALOG_KEY(userId), JSON.stringify(clean))
  localStorage.setItem(CATALOG_TS_KEY(userId), updatedAt)
  // Sync to Firestore so the catalog is visible cross-device
  import('./firestore-sync').then(({ syncDoc }) => {
    syncDoc(`catalogs/${userId}`, { items: clean, updatedAt })
  }).catch(() => {})
}

// Horodatage de la dernière écriture LOCALE du catalogue — sert de garde
// anti-écrasement : un snapshot distant plus vieux ne doit pas effacer le local.
export function getCatalogUpdatedAt(userId) {
  return localStorage.getItem(CATALOG_TS_KEY(userId)) || ''
}

// Adopte un catalogue reçu du serveur (listener/login) sans re-déclencher de sync.
export function adoptRemoteCatalog(userId, items, updatedAt) {
  if (!userId) return
  localStorage.setItem(CATALOG_KEY(userId), JSON.stringify(items || []))
  if (updatedAt) localStorage.setItem(CATALOG_TS_KEY(userId), updatedAt)
}

export function addCatalogItem(userId, item) {
  const catalog = getCatalog(userId)
  const newItem = { ...item, id: 'item-' + Date.now(), available: true, createdAt: Date.now() }
  catalog.push(newItem)
  saveCatalog(userId, catalog)
  return newItem
}

export function updateCatalogItem(userId, itemId, patch) {
  const catalog = getCatalog(userId).map(i => i.id === itemId ? { ...i, ...patch } : i)
  saveCatalog(userId, catalog)
}

export function deleteCatalogItem(userId, itemId) {
  const catalog = getCatalog(userId).filter(i => i.id !== itemId)
  saveCatalog(userId, catalog)
}

// ── Orders ────────────────────────────────────────────────────────────────────

export function getAllOrders() {
  try { return JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]') } catch { return [] }
}

export function getOrdersForSeller(userId) {
  return getAllOrders().filter(o => o.sellerId === userId)
}

export function getOrdersForBuyer(userId) {
  return getAllOrders().filter(o => o.buyerId === userId)
}

export function placeOrder({ buyerId, buyerName, sellerId, sellerName, sellerType, items }) {
  const subtotal = items.reduce((s, i) => s + ((+i.price || 0) * (+i.qty || 0)), 0)
  const commission = Math.round(subtotal * COMMISSION_RATE * 100) / 100
  const sellerReceives = Math.round((subtotal - commission) * 100) / 100

  const order = {
    id: 'ord-' + Date.now(),
    buyerId, buyerName,
    sellerId, sellerName, sellerType,
    items,
    subtotal,
    commission,
    sellerReceives,
    status: 'pending',
    createdAt: Date.now(),
  }

  const orders = getAllOrders()
  orders.push(order)
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders))
  // Sync to Firestore so seller sees the order immediately on any device
  import('./firestore-sync').then(({ syncDoc }) => {
    syncDoc(`service_orders/${order.id}`, order)
  }).catch(() => {})
  return order
}

export function updateOrderStatus(orderId, status) {
  const updatedAt = Date.now()
  const orders = getAllOrders().map(o => o.id === orderId ? { ...o, status, updatedAt } : o)
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders))
  // Sync updated status to Firestore
  const updated = orders.find(o => o.id === orderId)
  if (updated) {
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`service_orders/${orderId}`, updated)
    }).catch(() => {})
  } else {
    // Order not in local cache (e.g. new device) — patch Firestore directly
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`service_orders/${orderId}`, { status, updatedAt })
    }).catch(() => {})
  }
}

// ── Provider profile linked to account ────────────────────────────────────────

const PROVIDER_PROFILES_KEY = 'lib_provider_profiles'

export function getAllProviderProfiles() {
  try { return JSON.parse(localStorage.getItem(PROVIDER_PROFILES_KEY) || '[]') } catch { return [] }
}

export function getProviderProfile(userId) {
  return getAllProviderProfiles().find(p => p.userId === userId) || null
}

export function saveProviderProfile(profile) {
  const regionId = normalizeRegionId(profile.regionId || profile.country || profile.zonesIntervention?.[0])
  const normalizedZones = normalizeRegionIds(profile.zonesIntervention)
  const city = (profile.city || profile.location || '').trim()
  const normalized = {
    ...profile,
    city,
    location: city,
    regionId,
    country: getRegionName(regionId) || profile.country || '',
    zonesIntervention: normalizedZones.length ? normalizedZones : (profile.zonesIntervention || []),
  }
  const all = getAllProviderProfiles()
  const idx = all.findIndex(p => p.userId === normalized.userId)
  if (idx >= 0) all[idx] = normalized
  else all.push(normalized)
  localStorage.setItem(PROVIDER_PROFILES_KEY, JSON.stringify(all))
  // Sync to Firestore
  if (normalized.userId) {
    import('./firestore-sync').then(({ syncDoc }) => {
      syncDoc(`providers/${normalized.userId}`, normalized)
    }).catch(() => {})
  }
  return normalized
}

// ── Category labels ────────────────────────────────────────────────────────────

export const CATALOG_CATEGORIES = {
  supermarche: [
    'Alcools & Vins', 'Bières', 'Softs & Eaux', 'Jus & Sirops',
    'Snacks & Chips', 'Glaces', 'Fromages & Charcuterie', 'Autre',
  ],
  salle: ['Location salle', 'Offre formule', 'Service traiteur', 'Autre'],
  prestation: ['Prestation 1h', 'Prestation 2h', 'Soirée complète', 'Package', 'Autre'],
  artiste: ['DJ set', 'Concert / live', 'Animation', 'Performance', 'Package', 'Autre'],
  materiel: ['Sono', 'Lumières', 'Scène / Structure', 'Mobilier', 'Autre'],
  food: ['Traiteur', 'Boissons', 'Bar / cocktails', 'Food truck', 'Pâtisserie', 'Autre'],
}

export const ORDER_STATUS_LABELS = {
  pending:   { label: 'En attente',   color: '#f59e0b' },
  confirmed: { label: 'Confirmée',    color: '#3b82f6' },
  ready:     { label: 'Prête',        color: '#8b5cf6' },
  done:      { label: 'Terminée',     color: '#22c55e' },
  cancelled: { label: 'Annulée',      color: '#ef4444' },
}
