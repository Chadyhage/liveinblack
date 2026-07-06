// Vercel Serverless Function — Attribution des billets de TABLE (modèle « hôte »).
// Endpoint : POST /api/tickets
//   { action:'assign', ticketCode, toUid | toEmail }  → donne un siège à un ami
//   { action:'revoke', ticketCode }                   → reprend un siège attribué
//
// Modèle « double copie » : l'HÔTE garde TOUS les sièges de sa table dans son
// carnet (chacun marqué « attribué à X » ou libre) → il peut toujours révoquer /
// réattribuer. Une COPIE personnelle du siège est déposée chez l'invité (son
// billet, avec son QR). Le registre anti-fraude tickets/{code}.userId pointe le
// TITULAIRE courant (celui qui entrera). Un ticketCode est unique → une seule
// entrée = un seul passage au scanner (premier scan = utilisé).
//
// Sécurité (aussi sensible qu'un paiement) : requireAuth ; seul l'hôte
// (ticket.hostUid === caller.uid) agit → un invité ne peut PAS re-transférer son
// billet (anti-marché noir) ; un billet déjà scanné (checkedInAt) est intouchable ;
// la cible doit être un vrai compte ; tout passe par l'Admin SDK.

import { getDb, FieldValue } from '../lib/firebaseAdmin.js'
import { requireAuth } from '../lib/verifyAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const caller = await requireAuth(req, res)
  if (!caller) return

  const { action, ticketCode } = req.body || {}
  if (!ticketCode || (action !== 'assign' && action !== 'revoke')) {
    return res.status(400).json({ error: "Paramètres invalides (action 'assign' | 'revoke' + ticketCode)" })
  }

  try {
    const db = getDb()
    const host = caller.uid
    const tRef = db.collection('tickets').doc(String(ticketCode))
    const tSnap = await tRef.get()
    if (!tSnap.exists) return res.status(404).json({ error: 'Billet introuvable' })
    const ticket = tSnap.data()

    if (!ticket.tableId) return res.status(400).json({ error: "Ce billet ne fait pas partie d'une table." })
    if (String(ticket.hostUid || '') !== host) {
      return res.status(403).json({ error: "Seul l'hôte de la table peut attribuer ou reprendre ce billet." })
    }
    if (ticket.checkedInAt) {
      return res.status(409).json({ error: "Ce billet a déjà été scanné à l'entrée — impossible de le déplacer." })
    }

    const prevHolder = String(ticket.userId || host) // titulaire courant (hôte ou invité)

    // ── Résolution de la cible ────────────────────────────────────────────────
    let target, targetName
    if (action === 'assign') {
      const { toUid, toEmail } = req.body
      if (toUid) {
        const uSnap = await db.collection('users').doc(String(toUid)).get()
        if (!uSnap.exists) return res.status(404).json({ error: "Ce compte n'existe pas." })
        target = String(toUid)
        targetName = uSnap.data().name || uSnap.data().displayName || 'Invité'
      } else if (toEmail) {
        // Recherche insensible à la casse : les emails peuvent être stockés tels
        // quels (majuscules) ou normalisés → on tente les deux variantes.
        const raw = String(toEmail).trim()
        let doc = null
        for (const val of [raw, raw.toLowerCase()]) {
          const q = await db.collection('users').where('email', '==', val).limit(1).get()
          if (!q.empty) { doc = q.docs[0]; break }
        }
        if (!doc) {
          return res.status(404).json({ error: "Cet ami n'a pas encore de compte LIVEINBLACK. Demande-lui d'en créer un, puis attribue-lui le billet." })
        }
        target = doc.id
        targetName = doc.data().name || doc.data().displayName || 'Invité'
      } else {
        return res.status(400).json({ error: 'toUid ou toEmail requis' })
      }
      if (target === host) return res.status(400).json({ error: 'Ce siège est déjà le tien — pas besoin de te l\'attribuer.' })
    } else {
      // revoke : le siège redevient libre (titulaire = hôte).
      if (prevHolder === host) return res.status(400).json({ error: 'Ce siège est déjà libre.' })
      target = host
      targetName = null
    }

    if (target === prevHolder) return res.status(200).json({ ok: true, skipped: 'already_holder' })

    const assignedAt = action === 'assign' ? new Date().toISOString() : null
    const hostRef = db.collection('user_bookings').doc(host)
    const targetRef = db.collection('user_bookings').doc(target)
    const prevRef = db.collection('user_bookings').doc(prevHolder)

    await db.runTransaction(async (tx) => {
      // Lire les carnets distincts concernés.
      const uids = [...new Set([host, target, prevHolder])]
      const refByUid = { [host]: hostRef, [target]: targetRef, [prevHolder]: prevRef }
      const snaps = await Promise.all(uids.map(u => tx.get(refByUid[u])))
      const itemsByUid = {}
      uids.forEach((u, i) => { itemsByUid[u] = (snaps[i].exists ? snaps[i].data().items : []) || [] })

      // Modèle de siège (repart de la copie de l'hôte si dispo — garde préco/prix).
      const hostSeat = itemsByUid[host].find(it => it.ticketCode === ticketCode)
      const base = hostSeat || {
        id: String(ticketCode).split('-').pop(),
        ticketCode, eventId: ticket.eventId, eventName: ticket.eventName,
        place: ticket.place, placePrice: ticket.placePrice, currency: ticket.currency || 'EUR',
        bookedAt: ticket.bookedAt || new Date().toISOString(), paid: true,
        tableId: ticket.tableId, seatIndex: ticket.seatIndex, hostUid: ticket.hostUid, tableSeats: ticket.tableSeats,
      }

      // 1) Carnet HÔTE : garde le siège, met à jour le pointeur d'attribution.
      const hostSeatUpdated = { ...base, userId: host, assignedTo: action === 'assign' ? target : null, assignedName: targetName, assignedAt }
      delete hostSeatUpdated.token
      itemsByUid[host] = [...itemsByUid[host].filter(it => it.ticketCode !== ticketCode), hostSeatUpdated]

      // 2) Ancien titulaire (si c'était un invité) : on lui retire sa copie.
      if (prevHolder !== host) {
        itemsByUid[prevHolder] = itemsByUid[prevHolder].filter(it => it.ticketCode !== ticketCode)
      }

      // 3) Nouveau titulaire invité : on lui dépose sa copie personnelle.
      if (target !== host) {
        const guestCopy = { ...base, userId: target, assignedByHost: true }
        delete guestCopy.token; delete guestCopy.assignedTo; delete guestCopy.assignedName
        itemsByUid[target] = [...itemsByUid[target].filter(it => it.ticketCode !== ticketCode), guestCopy]
      }

      // Écritures (une par carnet distinct).
      uids.forEach(u => {
        tx.set(refByUid[u], { items: itemsByUid[u], updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      })

      // 4) Registre anti-fraude : titulaire officiel = target.
      tx.set(tRef, {
        userId: target,
        assignedTo: action === 'assign' ? target : null,
        assignedName: action === 'assign' ? targetName : null,
        assignedAt,
      }, { merge: true })
    })

    // ── Notification à l'invité (best-effort) ────────────────────────────────
    try {
      if (action === 'assign') {
        const hostSnap = await db.collection('users').doc(host).get()
        const hostName = hostSnap.exists ? (hostSnap.data().name || hostSnap.data().displayName || 'Un ami') : 'Un ami'
        const notif = {
          id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
          type: 'ticket_assigned',
          title: "🎟 Un billet t'a été attribué",
          body: `${hostName} t'a donné une place — ${ticket.eventName || 'un événement'}`,
          data: { eventId: String(ticket.eventId || '') },
          read: false,
          createdAt: Date.now(),
        }
        const nRef = db.collection('notifications').doc(target)
        const cur = await nRef.get()
        const items = cur.exists ? (cur.data().items || []) : []
        await nRef.set({ items: [notif, ...items].slice(0, 50), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      }
    } catch (e) {
      console.warn('[/api/tickets] notif échouée (non bloquant):', e.message)
    }

    return res.status(200).json({ ok: true, ticketCode, holder: target, holderName: targetName })
  } catch (err) {
    console.error('[/api/tickets] error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
