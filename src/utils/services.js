// ─── Prestataire Catalog ─────────────────────────────────────────────────────
// Gère le catalogue produits/services des prestataires
// et le système de commande avec commission

const CATALOG_KEY = uid => `lib_catalog_${uid}`
const ORDERS_KEY = 'lib_service_orders'
const COMMISSION_RATE = 0.10 // 10% pour LIVEINBLACK

// ── Catalog ──────────────────────────────────────────────────────────────────

export function getCatalog(userId) {
  try { return JSON.parse(localStorage.getItem(CATALOG_KEY(userId)) || '[]') } catch { return [] }
}

export function saveCatalog(userId, items) {
  localStorage.setItem(CATALOG_KEY(userId), JSON.stringify(items))
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
  const subtotal = items.reduce((s, i) => s + (i.price * i.qty), 0)
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
  return order
}

export function updateOrderStatus(orderId, status) {
  const orders = getAllOrders().map(o => o.id === orderId ? { ...o, status, updatedAt: Date.now() } : o)
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders))
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
  const all = getAllProviderProfiles()
  const idx = all.findIndex(p => p.userId === profile.userId)
  if (idx >= 0) all[idx] = profile
  else all.push(profile)
  localStorage.setItem(PROVIDER_PROFILES_KEY, JSON.stringify(all))
}

// ── Category labels ────────────────────────────────────────────────────────────

export const CATALOG_CATEGORIES = {
  supermarche: [
    'Alcools & Vins', 'Bières', 'Softs & Eaux', 'Jus & Sirops',
    'Snacks & Chips', 'Glaces', 'Fromages & Charcuterie', 'Autre',
  ],
  salle: ['Location salle', 'Offre formule', 'Service traiteur', 'Autre'],
  prestation: ['Prestation 1h', 'Prestation 2h', 'Soirée complète', 'Package', 'Autre'],
  materiel: ['Sono', 'Lumières', 'Scène / Structure', 'Mobilier', 'Autre'],
}

export const ORDER_STATUS_LABELS = {
  pending:   { label: 'En attente',   color: '#f59e0b' },
  confirmed: { label: 'Confirmée',    color: '#3b82f6' },
  ready:     { label: 'Prête',        color: '#8b5cf6' },
  done:      { label: 'Terminée',     color: '#22c55e' },
  cancelled: { label: 'Annulée',      color: '#ef4444' },
}
