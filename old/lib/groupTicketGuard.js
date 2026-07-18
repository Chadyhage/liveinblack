// ─── Garde « 1 place de groupe par compte et par événement » ─────────────────
// RÈGLE MÉTIER : pour un même événement, un utilisateur ne peut être lié qu'à
// UNE SEULE place de groupe (carré / table / pack), quel que soit son rôle :
//   - acheteur / hôte d'une table (tickets.hostUid === uid)
//   - membre titulaire d'un siège attribué (tickets.userId === uid + tableId)
// Le blocage ne regarde donc PAS seulement qui a payé : il regarde tous les
// utilisateurs déjà associés à une place de groupe via le registre tickets/
// (source de vérité anti-fraude, écrite par les webhooks Admin SDK).
//
// Utilisée par : api/checkout.js (Stripe), api/fedapay.js (achat de table) et
// api/tickets.js (attribution d'un siège à un invité).

/**
 * Cherche une place de groupe déjà liée à `uid` pour `eventId`.
 * Deux requêtes d'égalité (aucun index composite requis) :
 *   tickets où eventId==E et hostUid==U   → il est hôte d'une table
 *   tickets où eventId==E et userId==U    → il est titulaire d'un siège
 * On ne retient que les billets de table (tableId) non révoqués.
 *
 * @returns {Promise<{role:'host'|'member', tableId:string, place:string, ticketCode:string}|null>}
 */
export async function findGroupTieForEvent(db, eventId, uid) {
  if (!db || !eventId || !uid) return null
  const col = db.collection('tickets')
  const [asHost, asHolder] = await Promise.all([
    col.where('eventId', '==', String(eventId)).where('hostUid', '==', String(uid)).get(),
    col.where('eventId', '==', String(eventId)).where('userId', '==', String(uid)).get(),
  ])
  const firstGroupTicket = (snap) =>
    snap.docs.map(d => d.data()).find(t => t && t.tableId && t.revoked !== true) || null

  const hostTie = firstGroupTicket(asHost)
  if (hostTie) {
    return { role: 'host', tableId: String(hostTie.tableId), place: hostTie.place || '', ticketCode: hostTie.ticketCode || '' }
  }
  const memberTie = firstGroupTicket(asHolder)
  if (memberTie) {
    return { role: 'member', tableId: String(memberTie.tableId), place: memberTie.place || '', ticketCode: memberTie.ticketCode || '' }
  }
  return null
}

/** Message utilisateur (achat) selon le rôle déjà occupé. */
export function groupTieBuyMessage(tie) {
  const placeLabel = tie?.place ? ` (${tie.place})` : ''
  return tie?.role === 'host'
    ? `Tu as déjà réservé une place de groupe pour cet événement${placeLabel}. Une seule place de groupe par compte et par événement.`
    : `Tu fais déjà partie d'une place de groupe pour cet événement${placeLabel} — une place t'y a été attribuée. Une seule place de groupe par compte et par événement.`
}
