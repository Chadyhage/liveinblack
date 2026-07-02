// ─── Commandes en soirée (mini-POS) — fondation data ────────────────────────
// Brief « scan QR + commandes ». Modèle write-through : localStorage pour les
// lectures instantanées, Firestore pour la vérité cross-device + temps réel.
//
// Collections Firestore :
//   event_staff/{eventId}   → { roster: { [uid]: { role, name, addedBy, addedAt } } }
//   event_orders/{eventId}  → { items: [OrderItem] }           (précos + sur place)
//   event_order_log/{eventId} → { entries: [LogEntry] }        (historique commun)
//
// Concurrence (2 serveurs en même temps, point 8 du brief) : toute écriture
// passe par mergeItemsById() (transaction Firestore, upsert par id) — jamais un
// overwrite. Deux serveurs qui touchent des lignes différentes ne s'écrasent pas.

// ── Rôles staff (par événement) ──────────────────────────────────────────────
// 'manager' > 'serveur' > 'scan'. L'organisateur propriétaire et les agents
// plateforme sont managers implicites de l'événement, sans être dans le roster.
export const STAFF_ROLES = { SCAN: 'scan', SERVEUR: 'serveur', MANAGER: 'manager' }
const ROLE_RANK = { scan: 1, serveur: 2, manager: 3 }

// ── Sources d'une ligne de commande ──────────────────────────────────────────
export const ORDER_SOURCE = {
  PREORDER: 'preorder',            // commandé avant l'event, payé au checkout
  ONSITE_CLIENT: 'onsite_client',  // ajouté par le client pendant la soirée
  ONSITE_STAFF: 'onsite_staff',    // ajouté par un serveur
  ONSITE_MANAGER: 'onsite_manager',// ajouté par un manager
}

// ── Statuts ───────────────────────────────────────────────────────────────────
// Précommandes : payées d'avance → on ne gère que le service.
export const PREORDER_STATUS = { TO_SERVE: 'to_serve', SERVED: 'served', CANCELLED: 'cancelled' }
// Commandes sur place : cycle complet (V1 = paiement manuel au bar).
export const ONSITE_STATUS = {
  SENT: 'sent',            // envoyée (client) / créée
  ACCEPTED: 'accepted',    // acceptée par le staff
  PREPARING: 'preparing',  // en préparation
  SERVED: 'served',        // servie
  CANCELLED: 'cancelled',  // retirée / annulée
}

export const ONSITE_STATUS_LABEL = {
  sent: 'Envoyée', accepted: 'Acceptée', preparing: 'En préparation',
  served: 'Servie', cancelled: 'Annulée',
}
export const ONSITE_STATUS_COLOR = {
  sent: '#8b5cf6', accepted: '#4ee8c8', preparing: '#c8a96e',
  served: '#22c55e', cancelled: '#e05aaa',
}

const now = () => new Date().toISOString()
const uid = () => 'oi_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

// ═══════════════════════════ RÔLES / PERMISSIONS ════════════════════════════

function readStaff() { try { return JSON.parse(localStorage.getItem('lib_event_staff') || '{}') } catch { return {} } }
export function getEventStaff(eventId) { return readStaff()[String(eventId)]?.roster || {} }

// Rôle EFFECTIF d'un utilisateur sur un événement (le plus fort qui s'applique).
// user = objet session ; event = doc de l'événement (pour la propriété).
export function getStaffRole(eventId, user, event) {
  if (!user) return null
  const uid = user.uid || user.id
  if (user.role === 'agent') return 'manager'
  if (event && (String(event.organizerId || '') === String(uid) || String(event.createdBy || '') === String(uid))) return 'manager'
  const r = getEventStaff(eventId)[uid]?.role
  return r || null
}

export const canScan   = (role) => (ROLE_RANK[role] || 0) >= 1
export const canServe  = (role) => (ROLE_RANK[role] || 0) >= 2
export const canManage = (role) => role === 'manager'

// Ajout/retrait de staff — réservé au manager (contrôlé côté appelant + ici).
export function addEventStaff(eventId, staffUid, role, name, byUser) {
  // byUser._staffRole est résolu par l'UI via getStaffRole(eventId, user, event).
  if (!canManage(byUser?._staffRole)) return { ok: false, error: 'Réservé au manager de l\'événement.' }
  if (!staffUid || !STAFF_ROLES[Object.keys(STAFF_ROLES).find(k => STAFF_ROLES[k] === role)]) {
    return { ok: false, error: 'Utilisateur ou rôle invalide.' }
  }
  try {
    const all = readStaff()
    const key = String(eventId)
    const roster = { ...(all[key]?.roster || {}) }
    roster[staffUid] = { role, name: name || staffUid, addedBy: byUser.uid || byUser.id, addedAt: now() }
    all[key] = { roster }
    localStorage.setItem('lib_event_staff', JSON.stringify(all))
    import('./firestore-sync').then(({ syncDoc }) => syncDoc(`event_staff/${key}`, { roster })).catch(() => {})
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

export function removeEventStaff(eventId, staffUid, byUser) {
  if (!canManage(byUser?._staffRole)) return { ok: false, error: 'Réservé au manager.' }
  try {
    const all = readStaff()
    const key = String(eventId)
    const roster = { ...(all[key]?.roster || {}) }
    delete roster[staffUid]
    all[key] = { roster }
    localStorage.setItem('lib_event_staff', JSON.stringify(all))
    import('./firestore-sync').then(({ syncDoc }) => syncDoc(`event_staff/${key}`, { roster })).catch(() => {})
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

export function listenEventStaff(eventId, cb) {
  let unsub = () => {}
  import('./firestore-sync').then(({ listenDoc }) => {
    unsub = listenDoc(`event_staff/${eventId}`, data => {
      const roster = data?.roster || {}
      const all = readStaff(); all[String(eventId)] = { roster }
      try { localStorage.setItem('lib_event_staff', JSON.stringify(all)) } catch {}
      cb(roster)
    })
  }).catch(() => {})
  return () => unsub()
}

// ═══════════════════════════ COMMANDES ══════════════════════════════════════

function readOrders() { try { return JSON.parse(localStorage.getItem('lib_event_orders') || '{}') } catch { return {} } }
export function getOrders(eventId) { return readOrders()[String(eventId)] || [] }
export function getTicketOrders(eventId, ticketId) {
  return getOrders(eventId).filter(i => String(i.ticketId) === String(ticketId))
}

function writeLocalOrders(eventId, items) {
  const all = readOrders(); all[String(eventId)] = items
  try { localStorage.setItem('lib_event_orders', JSON.stringify(all)) } catch {}
}

// Écriture ATOMIQUE d'une (ou plusieurs) ligne(s) + mise à jour optimiste locale.
// upserts : lignes à créer/mettre à jour (par id). removeIds : lignes à retirer.
async function commitItems(eventId, { upserts = [], removeIds = [] }) {
  // Optimiste : reflète tout de suite en local pour l'UI de CE device
  const cur = getOrders(eventId)
  const byId = new Map(cur.map(i => [String(i.id), i]))
  for (const u of upserts) byId.set(String(u.id), u)
  for (const r of removeIds) byId.delete(String(r))
  writeLocalOrders(eventId, [...byId.values()])
  // Vérité cross-device : transaction Firestore (anti-écrasement concurrent)
  try {
    const { mergeItemsById } = await import('./firestore-sync')
    await mergeItemsById(`event_orders/${eventId}`, { field: 'items', idKey: 'id', upserts, removeIds })
  } catch {}
}

// Journal commun (historique) — append atomique.
async function logAction(eventId, entry) {
  const full = { id: 'log_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: now(), ...entry }
  try {
    const { mergeItemsById } = await import('./firestore-sync')
    await mergeItemsById(`event_order_log/${eventId}`, { field: 'entries', idKey: 'id', upserts: [full] })
  } catch {}
  return full
}

function actorInfo(actor) {
  return { actorId: actor?.uid || actor?.id || null, actorName: actor?.name || 'Staff', actorRole: actor?._staffRole || 'staff' }
}

// ── Ajouter un article sur place ─────────────────────────────────────────────
// menuItem : { name, emoji, price, ... } (issu de event.menu). actor : { uid,
// name, _staffRole } ou le client. isClient : ajouté par le client lui-même.
export async function addOnsiteItem(eventId, { ticketId, menuItem, qty = 1, note = '', options = null }, actor, isClient = false) {
  const source = isClient ? ORDER_SOURCE.ONSITE_CLIENT
    : actor?._staffRole === 'manager' ? ORDER_SOURCE.ONSITE_MANAGER : ORDER_SOURCE.ONSITE_STAFF
  const a = actorInfo(actor)
  const item = {
    id: uid(), eventId: String(eventId), ticketId: String(ticketId),
    menuItemId: menuItem.id || menuItem.name, name: menuItem.name, emoji: menuItem.emoji || '',
    source, quantity: Math.max(1, Number(qty) || 1), unitPrice: Number(menuItem.price) || 0,
    options: options || null, note: note || '',
    status: ONSITE_STATUS.SENT,
    addedBy: a.actorId, addedByRole: isClient ? 'client' : a.actorRole, addedByName: isClient ? (actor?.name || 'Client') : a.actorName, addedAt: now(),
    served_at: null, served_by: null, paid_at: null, paid_by: null,
    cancelled_at: null, cancelled_by: null, cancellation_reason: null,
  }
  await commitItems(eventId, { upserts: [item] })
  await logAction(eventId, { ...a, itemId: item.id, action: 'add', newValue: `${item.name} ×${item.quantity}`, note })
  return item
}

// ── Modifier une ligne (qty/note/options) — interdit si servie/payée ─────────
export async function updateOnsiteItem(eventId, itemId, patch, actor) {
  const cur = getOrders(eventId).find(i => String(i.id) === String(itemId))
  if (!cur) return { ok: false, error: 'Introuvable.' }
  if (cur.status === ONSITE_STATUS.SERVED || cur.paid_at) return { ok: false, error: 'Article déjà servi/payé — modification interdite.' }
  const a = actorInfo(actor)
  const clean = {}
  if (patch.quantity != null) clean.quantity = Math.max(1, Number(patch.quantity) || 1)
  if (patch.note != null) clean.note = String(patch.note)
  if (patch.options !== undefined) clean.options = patch.options
  const next = { ...cur, ...clean }
  await commitItems(eventId, { upserts: [next] })
  await logAction(eventId, { ...a, itemId, action: 'edit', oldValue: `×${cur.quantity}${cur.note ? ' · ' + cur.note : ''}`, newValue: `×${next.quantity}${next.note ? ' · ' + next.note : ''}` })
  return { ok: true }
}

// ── Transition de statut (accept / preparing) ────────────────────────────────
export async function setOnsiteStatus(eventId, itemId, status, actor) {
  const cur = getOrders(eventId).find(i => String(i.id) === String(itemId))
  if (!cur) return { ok: false, error: 'Introuvable.' }
  if (cur.status === ONSITE_STATUS.SERVED) return { ok: false, error: 'Déjà servie.' }
  const a = actorInfo(actor)
  const next = { ...cur, status }
  await commitItems(eventId, { upserts: [next] })
  await logAction(eventId, { ...a, itemId, action: 'status', oldValue: cur.status, newValue: status })
  return { ok: true }
}

// ── Marquer servi (précommande OU sur place) — verrouille la ligne ───────────
export async function serveItem(eventId, itemId, actor) {
  const cur = getOrders(eventId).find(i => String(i.id) === String(itemId))
  if (!cur) return { ok: false, error: 'Introuvable.' }
  if (cur.status === ONSITE_STATUS.SERVED || cur.status === PREORDER_STATUS.SERVED) return { ok: false, error: 'Déjà servi.' }
  const a = actorInfo(actor)
  const next = { ...cur, status: cur.source === ORDER_SOURCE.PREORDER ? PREORDER_STATUS.SERVED : ONSITE_STATUS.SERVED, served_at: now(), served_by: a.actorId, served_by_name: a.actorName }
  await commitItems(eventId, { upserts: [next] })
  await logAction(eventId, { ...a, itemId, action: 'serve', newValue: `${cur.name} ×${cur.quantity} servi` })
  return { ok: true }
}

// ── Annuler un service ou une ligne — MANAGER + justification (point 4) ──────
export async function cancelItem(eventId, itemId, reason, actor) {
  if (!canManage(actor?._staffRole)) return { ok: false, error: "Seul un manager peut annuler (avec motif)." }
  if (!reason || !reason.trim()) return { ok: false, error: 'Un motif est obligatoire.' }
  const cur = getOrders(eventId).find(i => String(i.id) === String(itemId))
  if (!cur) return { ok: false, error: 'Introuvable.' }
  const a = actorInfo(actor)
  const next = { ...cur, status: ONSITE_STATUS.CANCELLED, cancelled_at: now(), cancelled_by: a.actorId, cancellation_reason: reason.trim() }
  await commitItems(eventId, { upserts: [next] })
  await logAction(eventId, { ...a, itemId, action: 'cancel', oldValue: cur.status, newValue: 'cancelled', note: reason.trim() })
  return { ok: true }
}

// ── Retirer une ligne non servie (client/serveur) ────────────────────────────
export async function removeOnsiteItem(eventId, itemId, actor) {
  const cur = getOrders(eventId).find(i => String(i.id) === String(itemId))
  if (!cur) return { ok: false, error: 'Introuvable.' }
  if (cur.status === ONSITE_STATUS.SERVED || cur.paid_at) return { ok: false, error: 'Impossible : article servi/payé.' }
  const a = actorInfo(actor)
  await commitItems(eventId, { removeIds: [itemId] })
  await logAction(eventId, { ...a, itemId, action: 'remove', oldValue: `${cur.name} ×${cur.quantity}` })
  return { ok: true }
}

// ── Addition : total des consos SUR PLACE non payées d'un billet ─────────────
export function ticketAddition(eventId, ticketId) {
  const items = getTicketOrders(eventId, ticketId)
    .filter(i => i.source !== ORDER_SOURCE.PREORDER && i.status !== ONSITE_STATUS.CANCELLED && !i.paid_at)
  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  return { items, total: Math.round(total * 100) / 100 }
}

// ── Marquer l'addition payée (V1 : au bar, hors Stripe) — verrouille ─────────
export async function markTicketPaid(eventId, ticketId, actor) {
  if (!canServe(actor?._staffRole)) return { ok: false, error: 'Non autorisé.' }
  const { items } = ticketAddition(eventId, ticketId)
  if (!items.length) return { ok: false, error: 'Rien à encaisser.' }
  const a = actorInfo(actor)
  const stamped = items.map(i => ({ ...i, paid_at: now(), paid_by: a.actorId, paid_by_name: a.actorName }))
  await commitItems(eventId, { upserts: stamped })
  const total = Math.round(items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) * 100) / 100
  await logAction(eventId, { ...a, itemId: null, action: 'pay', newValue: `Addition ${total}€ marquée payée (${items.length} article${items.length > 1 ? 's' : ''})` })
  return { ok: true, total }
}

// ── Listeners temps réel (client ET staff écoutent le même doc) ──────────────
export function listenOrders(eventId, cb) {
  let unsub = () => {}
  import('./firestore-sync').then(({ listenDoc }) => {
    unsub = listenDoc(`event_orders/${eventId}`, data => {
      const items = Array.isArray(data?.items) ? data.items : []
      writeLocalOrders(eventId, items)
      cb(items)
    })
  }).catch(() => {})
  return () => unsub()
}

export function getOrderLog(eventId) {
  try { return JSON.parse(localStorage.getItem('lib_event_order_log') || '{}')[String(eventId)] || [] } catch { return [] }
}
export function listenOrderLog(eventId, cb) {
  let unsub = () => {}
  import('./firestore-sync').then(({ listenDoc }) => {
    unsub = listenDoc(`event_order_log/${eventId}`, data => {
      const entries = (Array.isArray(data?.entries) ? data.entries : []).slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
      try { const all = JSON.parse(localStorage.getItem('lib_event_order_log') || '{}'); all[String(eventId)] = entries; localStorage.setItem('lib_event_order_log', JSON.stringify(all)) } catch {}
      cb(entries)
    })
  }).catch(() => {})
  return () => unsub()
}

// ── Matérialiser les précommandes d'un billet en lignes de commande ──────────
// Appelé au 1er scan d'un billet en mode service : injecte ses précos (source
// 'preorder', déjà payées) dans event_orders si absentes, pour les servir/tracer
// dans le même flux que les commandes sur place. Idempotent (id déterministe).
export async function ensurePreordersMaterialized(eventId, ticketId, preorders, actor) {
  if (!Array.isArray(preorders) || !preorders.length) return
  const existing = new Set(getTicketOrders(eventId, ticketId).filter(i => i.source === ORDER_SOURCE.PREORDER).map(i => i.id))
  const a = actorInfo(actor)
  const toAdd = preorders
    .map(p => {
      const id = `pre_${ticketId}_${String(p.name).replace(/\s+/g, '_')}`.slice(0, 90)
      if (existing.has(id)) return null
      return {
        id, eventId: String(eventId), ticketId: String(ticketId),
        menuItemId: p.name, name: p.name, emoji: p.emoji || '',
        source: ORDER_SOURCE.PREORDER, quantity: Number(p.qty) || 1, unitPrice: Number(p.priceEUR) || 0,
        options: null, note: '', status: PREORDER_STATUS.TO_SERVE,
        addedBy: null, addedByRole: 'preorder', addedByName: 'Précommande', addedAt: now(),
        served_at: null, served_by: null, paid_at: p.priceEUR != null ? now() : null, paid_by: 'stripe',
        cancelled_at: null, cancelled_by: null, cancellation_reason: null,
      }
    })
    .filter(Boolean)
  if (toAdd.length) await commitItems(eventId, { upserts: toAdd })
}
