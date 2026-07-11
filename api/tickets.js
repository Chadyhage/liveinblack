// Vercel Serverless Function — Attribution des billets de TABLE (modèle « hôte »).
// Endpoint : POST /api/tickets
//   { action:'assign', ticketCode, toUid | toEmail }  → donne un siège à un ami
//   { action:'revoke', ticketCode }                   → reprend un siège attribué
//   { action:'checkin', ticketCode }                  → scan à l'entrée : marque le
//     billet utilisé ET crédite +1 point de fidélité au TITULAIRE courant. Le
//     point se gagne AU SCAN (pas à l'achat) : un siège révoqué avant l'entrée
//     n'a jamais donné de point, donc rien à reprendre.
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
import { findGroupTieForEvent } from '../lib/groupTicketGuard.js'
import { isAdminCaller } from '../lib/adminGuard.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const caller = await requireAuth(req, res)
  if (!caller) return

  const { action, ticketCode } = req.body || {}

  // Suppression d'événement en CASCADE — voir deleteEventCascade plus bas.
  if (action === 'delete_event') return deleteEventCascade(req, res, caller)

  // Annulation d'événement (remboursements) — voir cancelEventFlow plus bas.
  if (action === 'cancel_event') return cancelEventFlow(req, res, caller)

  // Report d'événement (nouvelle date, billets gardés) — voir postponeEventFlow.
  if (action === 'postpone_event') return postponeEventFlow(req, res, caller)

  // Check-in au scanner (+1 point au titulaire) — voir checkinTicket plus bas.
  if (action === 'checkin') return checkinTicket(req, res, caller)

  if (!ticketCode || (action !== 'assign' && action !== 'revoke')) {
    return res.status(400).json({ error: "Paramètres invalides (action 'assign' | 'revoke' | 'checkin' | 'delete_event' | 'cancel_event' | 'postpone_event')" })
  }

  try {
    const db = getDb()
    const host = caller.uid
    const tRef = db.collection('tickets').doc(String(ticketCode))
    const tSnap = await tRef.get()
    if (!tSnap.exists) return res.status(404).json({ error: 'Billet introuvable' })
    const ticket = tSnap.data()

    if (!ticket.tableId) return res.status(400).json({ error: "Ce billet ne fait pas partie d'une table." })
    if (ticket.paid !== true) return res.status(409).json({ error: 'Ce billet n\'est pas encore confirmé (paiement en attente).' })
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

    // ── RÈGLE « 1 place de groupe par compte et par événement » ───────────────
    // On ne peut pas attribuer un siège à quelqu'un qui est DÉJÀ lié à une place
    // de groupe pour ce même événement : hôte d'une (autre) table, ou membre
    // titulaire d'un siège (dans cette table ou une autre). Sans ça, une même
    // personne cumulerait plusieurs places de groupe sur un même événement.
    if (action === 'assign') {
      const tie = await findGroupTieForEvent(db, ticket.eventId, target)
      if (tie) {
        const who = targetName || 'Cette personne'
        return res.status(409).json({
          error: tie.tableId === String(ticket.tableId)
            ? `${who} a déjà une place dans cette table.`
            : `${who} est déjà lié(e) à une place de groupe pour cet événement${tie.place ? ` (${tie.place})` : ''} — une seule place de groupe par personne et par événement.`,
        })
      }
    }

    const assignedAt = action === 'assign' ? new Date().toISOString() : null

    try {
    await db.runTransaction(async (tx) => {
      // LIRE LE REGISTRE DANS LA TRANSACTION : re-dérive le titulaire courant et
      // re-valide. Comme on lit ET écrit tRef, Firestore sérialise deux
      // attributions concurrentes du même siège (la 2e re-tente automatiquement)
      // → pas de copie orpheline ni de siège dupliqué chez deux invités.
      const freshSnap = await tx.get(tRef)
      if (!freshSnap.exists) throw new Error('Billet disparu')
      const fresh = freshSnap.data()
      if (String(fresh.hostUid || '') !== host) { const e = new Error('not_host'); e.code = 'not_host'; throw e }
      if (fresh.checkedInAt) { const e = new Error('checked_in'); e.code = 'checked_in'; throw e }
      const curHolder = String(fresh.userId || host) // titulaire RÉEL au moment de la tx

      // seatVersion : incrémentée à CHAQUE attribution/révocation. Écrite dans le
      // registre ET dans les copies (hôte + invité) → le QR du nouveau titulaire
      // (régénéré depuis sa copie) porte cette version ; un QR émis AVANT cette
      // opération (screenshot d'un invité révoqué) devient périmé au scan.
      const newSeatVersion = (Number(fresh.seatVersion) || 0) + 1

      // Carnets distincts réellement concernés (basés sur le titulaire frais).
      const uids = [...new Set([host, target, curHolder])]
      const refByUid = {}
      uids.forEach(u => { refByUid[u] = db.collection('user_bookings').doc(u) })
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
      const hostSeatUpdated = { ...base, userId: host, assignedTo: action === 'assign' ? target : null, assignedName: targetName, assignedAt, seatVersion: newSeatVersion }
      delete hostSeatUpdated.token
      itemsByUid[host] = [...itemsByUid[host].filter(it => it.ticketCode !== ticketCode), hostSeatUpdated]

      // 2) Titulaire courant réel (si c'était un invité) : on lui retire sa copie.
      if (curHolder !== host) {
        itemsByUid[curHolder] = itemsByUid[curHolder].filter(it => it.ticketCode !== ticketCode)
      }

      // 3) Nouveau titulaire invité : on lui dépose sa copie personnelle.
      if (target !== host) {
        const guestCopy = { ...base, userId: target, assignedByHost: true, seatVersion: newSeatVersion }
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
        seatVersion: newSeatVersion,
      }, { merge: true })
    })
    } catch (txErr) {
      if (txErr.code === 'checked_in') return res.status(409).json({ error: "Ce billet a été scanné à l'entrée entre-temps — impossible de le déplacer." })
      if (txErr.code === 'not_host') return res.status(403).json({ error: "Tu n'es plus l'hôte de cette table." })
      throw txErr
    }

    // ── Notification à l'invité (best-effort) ────────────────────────────────
    try {
      if (action === 'assign') {
        const hostSnap = await db.collection('users').doc(host).get()
        const hostName = hostSnap.exists ? (hostSnap.data().name || hostSnap.data().displayName || 'Un ami') : 'Un ami'
        const notif = {
          id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
          type: 'ticket_assigned',
          title: "Un billet t'a été attribué",
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

// ── Suppression d'événement en CASCADE ────────────────────────────────────────
// POST /api/tickets { action:'delete_event', eventId }
//
// Corrige le bug des « billets fantômes » : supprimer un event côté client
// (syncDelete de events/{id}) laissait ses billets orphelins dans le registre
// tickets/ ET dans les carnets user_bookings/{uid} des acheteurs — que le
// client ne peut pas nettoyer lui-même (règles Firestore). Ces billets
// ressuscitaient dans « Mes billets » à chaque syncOnLogin.
//
// Règles :
//  - seul l'organisateur de l'event (createdBy/organizerId) peut supprimer ;
//  - s'il existe des billets PAYÉS non révoqués → 409 : l'event ne doit pas
//    être supprimé mais ANNULÉ (flux cancelEventWithMessage, remboursements).
//    Comble aussi l'angle mort « ventes faites depuis un autre appareil » que
//    le compteur local lib_bookings de l'organisateur ne voyait pas ;
//  - sinon : purge des carnets des détenteurs (transaction par carnet — un
//    billet concurrent d'un AUTRE event n'est jamais perdu), puis suppression
//    du registre tickets/ et du doc events/{id}.
async function deleteEventCascade(req, res, caller) {
  const eventId = String(req.body?.eventId || '')
  if (!eventId) return res.status(400).json({ error: 'eventId requis' })
  try {
    const db = getDb()
    const evRef = db.collection('events').doc(eventId)
    const evSnap = await evRef.get()
    if (!evSnap.exists) return res.status(404).json({ error: 'Événement introuvable (déjà supprimé ?)' })
    const ev = evSnap.data()
    if (ev.createdBy !== caller.uid && ev.organizerId !== caller.uid) {
      return res.status(403).json({ error: "Seul l'organisateur de cet événement peut le supprimer." })
    }

    const tSnap = await db.collection('tickets').where('eventId', '==', eventId).get()
    const tickets = tSnap.docs.map(d => ({ ref: d.ref, ...d.data() }))
    // Réservation BLOQUANTE = tout billet non révoqué d'un AUTRE compte que
    // l'organisateur, hors invitations guestlist. Payé OU gratuit : la règle
    // produit promet un message d'annulation à tout détenteur (le compteur
    // local de l'orga ne voit pas les réservations faites ailleurs). Les
    // billets de test de l'organisateur lui-même ne bloquent pas sa suppression.
    const blocking = tickets.filter(t =>
      !t.revoked && t.source !== 'guestlist' &&
      t.userId && String(t.userId) !== caller.uid
    )
    if (blocking.length > 0) {
      const paidCount = blocking.filter(t => t.paid === true).length
      return res.status(409).json({
        error: `${blocking.length} réservation${blocking.length > 1 ? 's' : ''} existe${blocking.length > 1 ? 'nt' : ''} pour cet événement — il doit être annulé, pas supprimé.`,
        bookingCount: blocking.length,
        paidCount,
      })
    }

    // Carnets des détenteurs (titulaire + hôte de table le cas échéant).
    // Par paquets de 10 en parallèle : une boucle strictement séquentielle
    // dépassait le timeout Vercel dès quelques dizaines de carnets.
    const uids = [...new Set(tickets.flatMap(t => [t.userId, t.hostUid]).filter(Boolean).map(String))]
    for (let i = 0; i < uids.length; i += 10) {
      await Promise.all(uids.slice(i, i + 10).map(uid => {
        const bRef = db.collection('user_bookings').doc(uid)
        return db.runTransaction(async (tx) => {
          const snap = await tx.get(bRef)
          if (!snap.exists) return
          const items = Array.isArray(snap.data().items) ? snap.data().items : []
          const kept = items.filter(it => String(it.eventId) !== eventId)
          if (kept.length === items.length) return
          tx.set(bRef, { items: kept, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        })
      }))
    }

    // Registre tickets/ + doc events/ — par lots (limite batch Firestore).
    const refs = [...tickets.map(t => t.ref), evRef]
    for (let i = 0; i < refs.length; i += 450) {
      const batch = db.batch()
      refs.slice(i, i + 450).forEach(r => batch.delete(r))
      await batch.commit()
    }

    return res.status(200).json({ ok: true, purgedTickets: tickets.length, cleanedUsers: uids.length })
  } catch (err) {
    console.error('[/api/tickets] delete_event error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

// ── Annulation d'événement (#71) ──────────────────────────────────────────────
// POST /api/tickets { action:'cancel_event', eventId, reason? }
//
// Marque l'événement ANNULÉ, rembourse les acheteurs (Stripe = automatique par
// API ; FedaPay = liste à traiter à la main car pas d'API de remboursement),
// annule les billets, libère le stock, journalise. Autorisé : organisateur de
// l'événement OU admin. IDEMPOTENT : rejouable sans double remboursement (garde
// dans lib/eventRefunds.js). L'entrée au scan est déjà refusée dès que
// ev.cancelled === true (ticketEntryEntitlement + ScannerPage), et le versement
// à l'organisateur est déjà bloqué (lib/eventPayouts.js).
async function cancelEventFlow(req, res, caller) {
  const eventId = String(req.body?.eventId || '')
  const reason = String(req.body?.reason || '').slice(0, 500)
  if (!eventId) return res.status(400).json({ error: 'eventId requis' })
  try {
    const db = getDb()
    const evRef = db.collection('events').doc(eventId)
    const evSnap = await evRef.get()
    if (!evSnap.exists) return res.status(404).json({ error: 'Événement introuvable' })
    const ev = evSnap.data()
    const isOwner = ev.createdBy === caller.uid || ev.organizerId === caller.uid
    if (!isOwner && !(await isAdminCaller(db, caller))) {
      return res.status(403).json({ error: "Seul l'organisateur de cet événement (ou un administrateur) peut l'annuler." })
    }

    // 1) Marquer l'événement annulé EN PREMIER : coupe immédiatement l'entrée au
    // scan et bloque le versement, même si la suite échoue partiellement (l'appel
    // est rejouable pour terminer les remboursements).
    await evRef.set({
      cancelled: true,
      cancelledAt: FieldValue.serverTimestamp(),
      cancelReason: reason || null,
      status: 'cancelled',
    }, { merge: true })

    // 2) Remboursements (Stripe auto / FedaPay worklist) — regroupés par paiement.
    const tSnap = await db.collection('tickets').where('eventId', '==', eventId).get()
    const tickets = tSnap.docs.map(d => ({ ref: d.ref, ...d.data() }))
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' })
    const { processEventRefunds } = await import('../lib/eventRefunds.js')
    const refunds = await processEventRefunds(stripe, db, FieldValue, { eventId, tickets })

    // 3) Annuler les billets (registre + carnets) : cancelled:true → « Mes
    // billets » affiche annulé + défense en profondeur au scan. Par lots.
    const toCancel = tickets.filter(t => t.cancelled !== true)
    for (let i = 0; i < toCancel.length; i += 450) {
      const batch = db.batch()
      toCancel.slice(i, i + 450).forEach(t => batch.set(t.ref, { cancelled: true, cancelledAt: FieldValue.serverTimestamp() }, { merge: true }))
      await batch.commit()
    }
    const uids = [...new Set(tickets.flatMap(t => [t.userId, t.hostUid]).filter(Boolean).map(String))]
    for (let i = 0; i < uids.length; i += 10) {
      await Promise.all(uids.slice(i, i + 10).map(uid => {
        const bRef = db.collection('user_bookings').doc(uid)
        return db.runTransaction(async (tx) => {
          const snap = await tx.get(bRef)
          if (!snap.exists) return
          const items = Array.isArray(snap.data().items) ? snap.data().items : []
          let changed = false
          const next = items.map(it => {
            if (String(it.eventId) === eventId && it.cancelled !== true) { changed = true; return { ...it, cancelled: true } }
            return it
          })
          if (changed) tx.set(bRef, { items: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        })
      }))
    }

    // 4) Libérer le stock (available = total) — cohérence d'affichage.
    if (Array.isArray(ev.places) && ev.places.length) {
      const released = ev.places.map(p => ({ ...p, available: Math.max(0, Number(p.total) || 0) }))
      await evRef.set({ places: released }, { merge: true })
    }

    // 5) Journal d'annulation (audit admin).
    const stripeRefundedCents = refunds.stripeRefunded.reduce((s, r) => s + (Number(r.amountCents) || 0), 0)
    await db.collection('event_cancellations').doc(eventId).set({
      eventId, eventName: ev.name || '', by: caller.uid,
      reason: reason || null,
      stripeRefundedCount: refunds.stripeRefunded.length,
      stripeRefundedCents,
      fedapayWorklistCount: refunds.fedapayWorklist.length,
      stripeFailedCount: refunds.stripeFailed.length,
      orphanCount: refunds.orphans.length,
      cancelledAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return res.status(200).json({
      ok: true,
      refunds,
      ticketsCancelled: toCancel.length,
      stripeRefundedCents,
    })
  } catch (err) {
    console.error('[/api/tickets] cancel_event error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

// ── Report d'événement (#71) ──────────────────────────────────────────────────
// POST /api/tickets { action:'postpone_event', eventId, newDate, newTime? }
//
// Reporte l'événement : nouvelle date/heure, billets + QR CONSERVÉS (le billet
// reste valide pour la nouvelle date), on garde l'ancienne date (postponedFrom).
// Aucun mouvement d'argent. Autorisé : organisateur OU admin.
async function postponeEventFlow(req, res, caller) {
  const eventId = String(req.body?.eventId || '')
  const newDate = String(req.body?.newDate || '')
  const newTime = req.body?.newTime != null ? String(req.body.newTime).slice(0, 5) : null
  if (!eventId || !newDate) return res.status(400).json({ error: 'eventId et newDate requis' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return res.status(400).json({ error: 'Date invalide (format attendu AAAA-MM-JJ)' })
  if (newTime != null && !/^\d{2}:\d{2}$/.test(newTime)) return res.status(400).json({ error: 'Heure invalide (format attendu HH:MM)' })
  try {
    const db = getDb()
    const evRef = db.collection('events').doc(eventId)
    const evSnap = await evRef.get()
    if (!evSnap.exists) return res.status(404).json({ error: 'Événement introuvable' })
    const ev = evSnap.data()
    const isOwner = ev.createdBy === caller.uid || ev.organizerId === caller.uid
    if (!isOwner && !(await isAdminCaller(db, caller))) {
      return res.status(403).json({ error: "Seul l'organisateur de cet événement (ou un administrateur) peut le reporter." })
    }
    if (ev.cancelled === true) return res.status(409).json({ error: 'Un événement annulé ne peut pas être reporté.' })

    const previousDate = ev.date || null
    const previousTime = ev.time || null
    await evRef.set({
      date: newDate,
      ...(newTime != null ? { time: newTime } : {}),
      status: 'postponed',
      postponedFrom: { date: previousDate, time: previousTime },
      postponedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return res.status(200).json({ ok: true, newDate, newTime, previousDate, previousTime })
  } catch (err) {
    console.error('[/api/tickets] postpone_event error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

// ── Check-in à l'entrée + point de fidélité ───────────────────────────────────
// POST /api/tickets { action:'checkin', ticketCode }
//
// Règle points : 1 billet scanné = +1 point pour le compte qui DÉTIENT le
// billet au moment du scan (tickets/{code}.userId). L'acheteur d'une table ne
// gagne donc qu'un point pour SON siège ; chaque invité gagne le sien en
// entrant. Aucun point n'est attribué à l'achat → assign/revoke n'ont jamais
// de point à reprendre (pas de farming attribution/révocation).
//
// Passe par l'Admin SDK car les règles Firestore interdisent au scanner
// d'écrire users/{titulaire}. Transaction idempotente : seul le PREMIER scan
// pose checkedInAt et crédite — un re-scan (2e porte, retry réseau) ne double
// jamais le point.
//
// Autorisation : agent plateforme, organisateur de l'événement (createdBy /
// organizerId, comme isEventOwnerOf des règles), OU membre du roster
// event_staff/{eventId} (rôle 'scan' et plus — le videur est du staff).
// Un billet donne droit à l'entrée UNIQUEMENT si l'une de ces conditions tient
// (le registre tickets/ est créable côté client avec paid:false → on ne fait
// JAMAIS confiance aux champs paid/source seuls) :
//   1. paid === true — billet réellement payé (posé par le webhook, Admin SDK) ;
//   2. source 'guestlist' ET figurant dans la liste OFFICIELLE guestlists/{eventId}
//      (write réservé à l'organisateur/agent) — un faux source:'guestlist' qui
//      n'y est pas est refusé ;
//   3. source 'free' ET la place correspondante de l'événement est réellement à 0
//      — sinon c'est un faux billet gratuit pour un événement/place PAYANT.
// Ferme la fraude « forger tickets/{code} {paid:false, source:'free'} pour un
// événement payant → entrée gratuite ».
async function ticketEntryEntitlement(db, ticket, ticketCode) {
  const eventId = String(ticket.eventId || '')
  if (!eventId) return { ok: false, msg: "Billet non rattaché à un événement — entrée refusée." }
  const evSnap = await db.collection('events').doc(eventId).get()
  const ev = evSnap.exists ? evSnap.data() : null
  // L'événement doit EXISTER et ne pas être ANNULÉ — vérifié AVANT le raccourci
  // paid:true (correctif audit #17 : un billet payé d'un événement SUPPRIMÉ donnait
  // l'entrée + un point de fidélité, car le raccourci « payé » passait d'abord ;
  // un événement annulé désactive les QR, ses acheteurs étant remboursés).
  if (!ev) return { ok: false, msg: 'Événement introuvable — entrée refusée.' }
  if (ev.cancelled === true) return { ok: false, msg: 'Événement annulé — billet non valide.' }
  if (ticket.paid === true) return { ok: true }

  if (ticket.source === 'guestlist') {
    const gSnap = await db.collection('guestlists').doc(eventId).get()
    const items = gSnap.exists ? (gSnap.data().items || []) : []
    const entry = items.find(i => String(i.ticketCode || i.id || '') === String(ticketCode))
    if (entry && !entry.revoked) return { ok: true }
    return { ok: false, msg: "Invitation non reconnue par l'organisateur — billet non valide." }
  }

  // Billet optimiste post-paiement (paid:false portant une référence de session).
  // On N'ADMET PAS sur la seule référence : le WEBHOOK (Admin SDK) est l'unique
  // autorité qui pose paid:true, en quelques secondes. Admettre sur la référence
  // rouvrirait la fraude « je paie 1 billet et j'en forge N avec la même session
  // pour le même événement » (la référence ne borne ni le ticketCode ni la
  // quantité). Un achat de dernière minute est donc admis dès que le webhook a
  // confirmé (le videur re-scanne) — comportement correct : pas d'entrée avant
  // paiement encaissé.
  if (ticket.stripeSessionId || ticket.fedapayTxnId) {
    return { ok: false, msg: 'Paiement en cours de confirmation — patiente puis re-scanne.', pending: true }
  }

  // Billet gratuit : la place précise du billet doit être réellement gratuite.
  // (le flux RSVP gratuit écrit `place` = un type exact de event.places → match sûr).
  const places = Array.isArray(ev.places) ? ev.places : []
  const place = places.find(p => String(p.type) === String(ticket.place))
  if (place && Number(place.price) === 0) return { ok: true }
  return { ok: false, msg: "Billet non payé pour un événement payant — entrée refusée." }
}

async function checkinTicket(req, res, caller) {
  const ticketCode = String(req.body?.ticketCode || '')
  if (!ticketCode) return res.status(400).json({ error: 'ticketCode requis' })
  try {
    const db = getDb()
    const tRef = db.collection('tickets').doc(ticketCode)
    const tSnap = await tRef.get()
    if (!tSnap.exists) return res.status(404).json({ error: 'Billet introuvable' })
    const ticket = tSnap.data()
    if (ticket.revoked) return res.status(409).json({ error: 'Billet révoqué — entrée refusée.' })

    let allowed = false
    const uSnap = await db.collection('users').doc(caller.uid).get()
    const u = uSnap.exists ? uSnap.data() : null
    if (u && (u.role === 'agent' || u.activeRole === 'agent' || (Array.isArray(u.enabledRoles) && u.enabledRoles.includes('agent')))) {
      allowed = true
    }
    const eventId = String(ticket.eventId || '')
    if (!allowed && eventId) {
      const evSnap = await db.collection('events').doc(eventId).get()
      const ev = evSnap.exists ? evSnap.data() : null
      if (ev && (ev.createdBy === caller.uid || ev.organizerId === caller.uid)) allowed = true
      if (!allowed) {
        const sSnap = await db.collection('event_staff').doc(eventId).get()
        const roster = sSnap.exists ? (sSnap.data().roster || {}) : {}
        // Le rôle 'dj' ne donne PAS accès au contrôle d'entrée (son outil est la
        // playlist) : sinon un DJ pouvait griller des billets à distance et
        // farmer les points fidélité. Seuls scan / serveur / manager valident.
        const entry = roster[caller.uid]
        if (entry && entry.role !== 'dj') allowed = true
      }
    }
    if (!allowed) {
      return res.status(403).json({ error: "Seul un agent, l'organisateur ou un membre du staff de l'événement peut valider une entrée." })
    }

    // Droit à l'entrée : le billet doit être payé, une invitation guestlist
    // officielle, ou un billet gratuit d'une place réellement gratuite. Sinon
    // c'est un faux (registre créable côté client) → entrée refusée, AUCUN point.
    const entitlement = await ticketEntryEntitlement(db, ticket, ticketCode)
    if (!entitlement.ok) {
      return res.status(403).json({ error: entitlement.msg || 'Billet non valide — entrée refusée.', notEntitled: true })
    }

    let first = false
    let holder = null
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(tRef)
      if (!fresh.exists) return
      const t = fresh.data()
      if (t.checkedInAt) return // déjà scanné (autre porte / retry) → no-op
      holder = t.userId ? String(t.userId) : null
      tx.set(tRef, { checkedInAt: new Date().toISOString(), checkedInBy: caller.uid }, { merge: true })
      // Titulaire sans compte (ex: invitation guestlist non réclamée) → pas de point.
      if (holder) {
        tx.set(db.collection('users').doc(holder), { points: FieldValue.increment(1) }, { merge: true })
      }
      first = true
    })

    return res.status(200).json({ ok: true, ticketCode, alreadyCheckedIn: !first, pointAwardedTo: first ? holder : null })
  } catch (err) {
    console.error('[/api/tickets] checkin error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
