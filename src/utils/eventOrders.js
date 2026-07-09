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
  INCLUDED: 'included',            // inclus dans le type de place (billet)
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

// Index inversé « pour quels events suis-je staff ? » — le roster event_staff est
// indexé PAR event (non requêtable par user). staff_assignments/{eventId__uid} est
// une collection plate requêtable par uid → débloque l'accès scanner + la page
// « Mes soirées » du membre invité. Écrit en même temps que le roster.
const assignmentId = (eventId, staffUid) => `${eventId}__${staffUid}`

// Ajout/retrait de staff — réservé au manager (contrôlé côté appelant + ici).
// Awaitable : le roster ET l'index inversé doivent atteindre le serveur, sinon on
// remonte une erreur (sans quoi le membre serait dans le roster mais absent de
// l'index → jamais de « Mes soirées »/accès scanner, silencieusement).
export async function addEventStaff(eventId, staffUid, role, name, byUser, eventName = '') {
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
    localStorage.setItem('lib_event_staff', JSON.stringify(all)) // optimiste local
    const { syncDocAwaitable } = await import('./firestore-sync')
    // SÉQUENTIEL et dans cet ordre : le roster D'ABORD, car la règle Firestore de
    // staff_assignments croise get(event_staff).roster pour interdire l'affectation
    // d'un uid arbitraire. L'index ne peut donc être écrit qu'une fois le membre
    // réellement présent dans le roster côté serveur.
    const r1 = await syncDocAwaitable(`event_staff/${key}`, { roster })
    const r2 = r1?.ok
      ? await syncDocAwaitable(`staff_assignments/${assignmentId(key, staffUid)}`, {
          eventId: key, uid: staffUid, role, eventName: eventName || '',
          addedBy: byUser.uid || byUser.id, addedAt: now(),
        })
      : { ok: false }
    if (!r1?.ok || !r2?.ok) {
      // Le listener event_staff réconciliera le cache local depuis le serveur.
      return { ok: false, error: 'Ajout non confirmé côté serveur (hors-ligne ou droits). Réessaie.' }
    }
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

export async function removeEventStaff(eventId, staffUid, byUser) {
  if (!canManage(byUser?._staffRole)) return { ok: false, error: 'Réservé au manager.' }
  try {
    const key = String(eventId)
    // IMPORTANT : syncDoc = setDoc(merge:true) FUSIONNE les clés d'une map → il ne
    // supprime JAMAIS une clé du roster côté Firestore. On supprime précisément la clé
    // imbriquée avec deleteField(), et on AWAITE l'écriture : si elle échoue (droits /
    // hors-ligne), on le remonte pour que l'UI ne fasse pas croire à un retrait réussi.
    const { db } = await import('../firebase')
    const { doc, updateDoc, deleteField } = await import('firebase/firestore')
    await updateDoc(doc(db, 'event_staff', key), { [`roster.${staffUid}`]: deleteField() })
    // Cache local seulement APRÈS confirmation serveur.
    try {
      const all = readStaff()
      const roster = { ...(all[key]?.roster || {}) }
      delete roster[staffUid]
      all[key] = { roster }
      localStorage.setItem('lib_event_staff', JSON.stringify(all))
    } catch {}
    import('./firestore-sync').then(({ syncDelete }) => syncDelete(`staff_assignments/${assignmentId(key, staffUid)}`)).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.code === 'permission-denied' ? 'Droits insuffisants pour retirer ce membre.' : 'Retrait non confirmé (réseau ?). Réessaie.' }
  }
}

// ── Index inversé côté MEMBRE : « mes affectations staff » ────────────────────
// Cache local PAR UID (lib_my_staff_{uid}) = { [eventId]: assignment }. Le suffixe uid
// évite qu'un compte hérite des affectations d'un autre sur un appareil partagé
// (fuite d'accès scanner/nav au changement de compte).
function readMyStaff(uid) {
  if (!uid) return {}
  try { return JSON.parse(localStorage.getItem(`lib_my_staff_${uid}`) || '{}') } catch { return {} }
}
export function getMyStaffEvents(uid) { return Object.values(readMyStaff(uid)).filter(Boolean) }

// Listener temps réel des affectations de l'utilisateur (requête where uid==me).
// Met à jour le cache local (lu par la garde scanner + la nav) et renvoie la liste.
export function listenMyStaffAssignments(uid, cb) {
  if (!uid) { cb?.([]); return () => {} }
  let unsub = () => {}
  import('../firebase').then(({ db }) =>
    import('firebase/firestore').then(({ collection, query, where, onSnapshot }) => {
      const q = query(collection(db, 'staff_assignments'), where('uid', '==', uid))
      unsub = onSnapshot(q, snap => {
        const list = snap.docs.map(d => d.data()).filter(a => a && a.eventId)
        const map = {}
        list.forEach(a => { map[String(a.eventId)] = a })
        try { localStorage.setItem(`lib_my_staff_${uid}`, JSON.stringify(map)) } catch {}
        cb?.(list)
      }, (err) => { try { console.warn('[staff_assignments] listen échoué', err?.code || err) } catch {} })
    })
  ).catch(() => {})
  return () => unsub()
}

// ── Retrait sûr d'un serveur qui a des commandes en cours ─────────────────────
// Une ligne est « en cours » (active) si son auteur/serveur = staffUid, qu'elle
// n'est ni servie/annulée ni payée. Retirer un serveur ne les casse pas (uid figés)
// mais les laisse sans acteur habilité → on les réattribue avant de retirer.
function isTerminalLine(i) {
  return i.status === ONSITE_STATUS.SERVED || i.status === PREORDER_STATUS.SERVED
    || i.status === ONSITE_STATUS.CANCELLED || !!i.paid_at
}
export function getActiveOrdersForStaff(eventId, staffUid) {
  const sid = String(staffUid)
  return getOrders(eventId).filter(i =>
    (String(i.addedBy) === sid || String(i.served_by) === sid) && !isTerminalLine(i)
  )
}

// Réattribue les commandes actives du serveur retiré vers `toActor` (le manager en
// pratique), PUIS le retire du roster. La garde requireUnserved/requireUnpaid côté
// transaction empêche de réattribuer une ligne devenue servie/payée entre-temps.
export async function reassignAndRemoveStaff(eventId, staffUid, toActor, byUser) {
  if (!canManage(byUser?._staffRole)) return { ok: false, error: 'Réservé au manager.' }
  const active = getActiveOrdersForStaff(eventId, staffUid)
  const a = actorInfo(byUser)
  const toId = toActor?.uid || toActor?.id || a.actorId
  const toName = toActor?.name || a.actorName
  const toRole = toActor?._staffRole || 'manager'
  let reassigned = 0
  let serverReachFailed = false
  for (const item of active) {
    // Une ligne active a toujours addedBy === staffUid (served_by n'est posé qu'au
    // service, qui la rend terminale → exclue de getActiveOrdersForStaff). On ne
    // réattribue donc que addedBy.
    const set = { addedBy: toId, addedByName: toName, addedByRole: toRole }
    const reached = await commitPatch(eventId, item.id, set, { requireUnserved: true, requireUnpaid: true })
    if (!reached) { serverReachFailed = true; continue } // hors-ligne → écriture NON confirmée
    await logAction(eventId, { ...a, itemId: item.id, ticketId: item.ticketId, itemName: item.name, action: 'reassign', oldValue: item.addedByName || 'serveur retiré', newValue: toName })
    reassigned++
  }
  // Si une réattribution n'a pas atteint le serveur, NE PAS retirer le staff : sinon
  // il serait hors roster mais ses commandes resteraient à son nom côté serveur
  // (orphelines). On abandonne proprement et on demande de réessayer en ligne.
  if (serverReachFailed) {
    return { ok: false, error: 'Réattribution incomplète (hors-ligne ?) — le serveur n\'a pas été retiré. Réessaie une fois en ligne.' }
  }
  const res = await removeEventStaff(eventId, staffUid, byUser)
  return res.ok ? { ok: true, reassigned } : res
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
  // Vérité cross-device : transaction Firestore (anti-écrasement concurrent).
  // Renvoie true si l'écriture a bien atteint le serveur (→ le bar la verra), sinon
  // false (hors-ligne / règles non déployées) pour que l'UI puisse prévenir.
  try {
    const { mergeItemsById } = await import('./firestore-sync')
    const r = await mergeItemsById(`event_orders/${eventId}`, { field: 'items', idKey: 'id', upserts, removeIds })
    return r !== null
  } catch { return false }
}

// Patch de CHAMPS d'une ligne (garde serveur atomique). Optimiste en local, puis
// la transaction ne l'applique côté serveur que si la garde tient (non servi/payé)
// et en préservant les champs concurrents (ex. quantity édité ailleurs).
async function commitPatch(eventId, itemId, set, guards = {}) {
  const list = getOrders(eventId)
  if (list.some(i => String(i.id) === String(itemId))) {
    writeLocalOrders(eventId, list.map(i => String(i.id) === String(itemId) ? { ...i, ...set } : i))
  }
  try {
    const { mergeItemsById } = await import('./firestore-sync')
    const r = await mergeItemsById(`event_orders/${eventId}`, { field: 'items', idKey: 'id', patches: [{ id: itemId, set, ...guards }] })
    return r !== null // true = la transaction a atteint le serveur (sinon hors-ligne / règles)
  } catch { return false }
}

// Suppression gardée (ne retire côté serveur que si non servi/payé).
async function commitRemove(eventId, itemId, guards = {}) {
  writeLocalOrders(eventId, getOrders(eventId).filter(i => String(i.id) !== String(itemId)))
  try {
    const { mergeItemsById } = await import('./firestore-sync')
    await mergeItemsById(`event_orders/${eventId}`, { field: 'items', idKey: 'id', guardedRemoveIds: [{ id: itemId, ...guards }] })
  } catch {}
}

// Journal commun (historique) — append atomique + cache local optimiste.
async function logAction(eventId, entry) {
  const full = { id: 'log_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ts: now(), ...entry }
  // Optimiste local : l'historique reste consultable hors-ligne / instantanément.
  try {
    const all = JSON.parse(localStorage.getItem('lib_event_order_log') || '{}')
    const arr = Array.isArray(all[String(eventId)]) ? all[String(eventId)] : []
    all[String(eventId)] = [full, ...arr].sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
    localStorage.setItem('lib_event_order_log', JSON.stringify(all))
  } catch {}
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
  const synced = await commitItems(eventId, { upserts: [item] })
  await logAction(eventId, { ...a, itemId: item.id, ticketId: item.ticketId, itemName: item.name, action: 'add', newValue: `${item.name} ×${item.quantity}`, amount: Math.round(item.unitPrice * item.quantity * 100) / 100, note })
  return { ...item, _synced: synced }
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
  await commitPatch(eventId, itemId, clean, { requireUnserved: true, requireUnpaid: true })
  await logAction(eventId, { ...a, itemId, ticketId: cur.ticketId, itemName: cur.name, action: 'edit', oldValue: `×${cur.quantity}${cur.note ? ' · ' + cur.note : ''}`, newValue: `×${next.quantity}${next.note ? ' · ' + next.note : ''}` })
  return { ok: true }
}

// ── Transition de statut (accept / preparing) ────────────────────────────────
export async function setOnsiteStatus(eventId, itemId, status, actor) {
  const cur = getOrders(eventId).find(i => String(i.id) === String(itemId))
  if (!cur) return { ok: false, error: 'Introuvable.' }
  if (cur.status === ONSITE_STATUS.SERVED) return { ok: false, error: 'Déjà servie.' }
  const a = actorInfo(actor)
  await commitPatch(eventId, itemId, { status }, { requireUnserved: true })
  await logAction(eventId, { ...a, itemId, ticketId: cur.ticketId, itemName: cur.name, action: 'status', oldValue: cur.status, newValue: status })
  return { ok: true }
}

// ── Marquer servi (précommande OU sur place) — verrouille la ligne ───────────
export async function serveItem(eventId, itemId, actor) {
  const cur = getOrders(eventId).find(i => String(i.id) === String(itemId))
  if (!cur) return { ok: false, error: 'Introuvable.' }
  if (cur.status === ONSITE_STATUS.SERVED || cur.status === PREORDER_STATUS.SERVED) return { ok: false, error: 'Déjà servi.' }
  const a = actorInfo(actor)
  const set = { status: cur.source === ORDER_SOURCE.PREORDER ? PREORDER_STATUS.SERVED : ONSITE_STATUS.SERVED, served_at: now(), served_by: a.actorId, served_by_name: a.actorName }
  await commitPatch(eventId, itemId, set, { requireUnserved: true })
  await logAction(eventId, { ...a, itemId, ticketId: cur.ticketId, itemName: cur.name, action: 'serve', newValue: `${cur.name} ×${cur.quantity} servi` })
  return { ok: true }
}

// ── Annuler un service ou une ligne — MANAGER + justification (point 4) ──────
export async function cancelItem(eventId, itemId, reason, actor) {
  if (!canManage(actor?._staffRole)) return { ok: false, error: "Seul un manager peut annuler (avec motif)." }
  if (!reason || !reason.trim()) return { ok: false, error: 'Un motif est obligatoire.' }
  const cur = getOrders(eventId).find(i => String(i.id) === String(itemId))
  if (!cur) return { ok: false, error: 'Introuvable.' }
  const a = actorInfo(actor)
  const set = { status: ONSITE_STATUS.CANCELLED, cancelled_at: now(), cancelled_by: a.actorId, cancellation_reason: reason.trim() }
  await commitPatch(eventId, itemId, set, { requireUnpaid: true })
  await logAction(eventId, { ...a, itemId, ticketId: cur.ticketId, itemName: cur.name, action: 'cancel', oldValue: cur.status, newValue: 'cancelled', note: reason.trim() })
  return { ok: true }
}

// ── Retirer une ligne non servie (client/serveur) ────────────────────────────
export async function removeOnsiteItem(eventId, itemId, actor) {
  const cur = getOrders(eventId).find(i => String(i.id) === String(itemId))
  if (!cur) return { ok: false, error: 'Introuvable.' }
  if (cur.status === ONSITE_STATUS.SERVED || cur.paid_at) return { ok: false, error: 'Impossible : article servi/payé.' }
  const a = actorInfo(actor)
  await commitRemove(eventId, itemId, { requireUnserved: true, requireUnpaid: true })
  await logAction(eventId, { ...a, itemId, ticketId: cur.ticketId, itemName: cur.name, action: 'remove', oldValue: `${cur.name} ×${cur.quantity}`, amount: -Math.round(cur.unitPrice * cur.quantity * 100) / 100 })
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
  const stampSet = { paid_at: now(), paid_by: a.actorId, paid_by_name: a.actorName }
  const ids = new Set(items.map(i => String(i.id)))
  writeLocalOrders(eventId, getOrders(eventId).map(i => ids.has(String(i.id)) ? { ...i, ...stampSet } : i)) // optimiste
  try {
    const { mergeItemsById } = await import('./firestore-sync')
    await mergeItemsById(`event_orders/${eventId}`, { field: 'items', idKey: 'id', patches: items.map(i => ({ id: i.id, set: stampSet, requireUnpaid: true })) })
  } catch {}
  const total = Math.round(items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) * 100) / 100
  await logAction(eventId, { ...a, itemId: null, ticketId: String(ticketId), action: 'pay', newValue: `Addition réglée (${items.length} article${items.length > 1 ? 's' : ''})`, amount: total })
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

// ── Options incluses dans un type de place ────────────────────────────────────
// Résout place.included[] contre le menu de l'événement : seules les entrées
// dont l'article existe ENCORE au menu sont retenues (lien menu obligatoire).
// Toujours gratuites — comprises dans le prix du billet (aucun montant à
// régler sur place pour ces articles).
export function includedForPlace(event, placeType) {
  const place = (event?.places || []).find(p => String(p.type) === String(placeType))
  if (!place || !Array.isArray(place.included) || !place.included.length) return []
  const menu = Array.isArray(event?.menu) ? event.menu : []
  const byName = new Map(menu.filter(m => m && m.name).map(m => [String(m.name), m]))
  return place.included
    .map(inc => {
      const item = byName.get(String(inc?.name || ''))
      if (!item) return null
      return {
        name: item.name,
        emoji: item.emoji || '',
        qty: Math.max(1, Number(inc.qty) || 1),
      }
    })
    .filter(Boolean)
}

// Matérialise les options incluses d'un billet en lignes de commande (comme les
// précommandes) : au 1er scan en mode service, chaque option devient une ligne
// source 'included', à servir dans le même flux POS. Idempotent (id déterministe
// par billet + article) → impossible de « recréer » une option déjà servie, et
// la quantité incluse ne peut pas être dépassée.
export async function ensureIncludedMaterialized(eventId, ticketId, included, actor) {
  if (!Array.isArray(included) || !included.length) return
  const existing = new Set(getTicketOrders(eventId, ticketId).filter(i => i.source === ORDER_SOURCE.INCLUDED).map(i => i.id))
  const toAdd = included
    .map(inc => {
      const id = `inc_${ticketId}_${String(inc.name).replace(/\s+/g, '_')}`.slice(0, 90)
      if (existing.has(id)) return null
      return {
        id, eventId: String(eventId), ticketId: String(ticketId),
        menuItemId: inc.name, name: inc.name, emoji: inc.emoji || '',
        source: ORDER_SOURCE.INCLUDED, quantity: Math.max(1, Number(inc.qty) || 1),
        unitPrice: 0, // toujours gratuit — compris dans le prix du billet
        options: null, note: '', status: PREORDER_STATUS.TO_SERVE,
        addedBy: null, addedByRole: 'included', addedByName: 'Inclus billet', addedAt: now(),
        served_at: null, served_by: null,
        paid_at: now(), paid_by: 'included',
        cancelled_at: null, cancelled_by: null, cancellation_reason: null,
      }
    })
    .filter(Boolean)
  if (!toAdd.length) return
  const local = getOrders(eventId)
  const present = new Set(local.map(i => String(i.id)))
  const fresh = toAdd.filter(i => !present.has(String(i.id)))
  if (fresh.length) writeLocalOrders(eventId, [...local, ...fresh])
  // insertOnly : une option déjà servie/annulée côté serveur n'est jamais écrasée.
  try {
    const { mergeItemsById } = await import('./firestore-sync')
    await mergeItemsById(`event_orders/${eventId}`, { field: 'items', idKey: 'id', insertOnly: toAdd })
  } catch {}
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
  if (!toAdd.length) return
  // Optimiste local : insertion seulement (ne pas écraser une ligne locale existante)
  const local = getOrders(eventId)
  const present = new Set(local.map(i => String(i.id)))
  const fresh = toAdd.filter(i => !present.has(String(i.id)))
  if (fresh.length) writeLocalOrders(eventId, [...local, ...fresh])
  // Serveur : insertOnly → si la préco existe déjà (servie/annulée ailleurs), on n'y touche pas.
  try {
    const { mergeItemsById } = await import('./firestore-sync')
    await mergeItemsById(`event_orders/${eventId}`, { field: 'items', idKey: 'id', insertOnly: toAdd })
  } catch {}
}
