// Vercel Serverless Function — Ajuste le stock d'un type de place sur un événement.
// Endpoint : POST /api/event-stock  { eventId, placeType, qty, action: 'reserve' | 'release' }
//
// Pourquoi un endpoint : les règles Firestore n'autorisent que l'organisateur (ou un
// agent) à écrire dans events/{id} — un acheteur qui réserve une place gratuite n'a
// pas ce droit. Seul l'Admin SDK (ce serveur) peut décrémenter le stock pour N'IMPORTE
// QUEL acheteur, de façon atomique (transaction) pour empêcher la survente entre deux
// acheteurs concurrents.
//
// 'reserve' (delta négatif) : utilisé par la réservation gratuite (EventDetailPage).
//   Le tunnel payant (api/checkout.js) fait son propre décrément avant la session Stripe.
// 'release' (delta positif) : utilisé par /paiement-annule pour restocker une réservation
//   payante abandonnée.
//
// 'event_not_found' / 'place_not_found' ne bloquent jamais l'appelant (events de démo
// statiques sans doc Firestore, ou config legacy) — seul un stock réellement insuffisant
// renvoie une erreur.
//
// action:'notify' (fusionné depuis l'ex /api/notify-sale) : notifie l'organisateur
// d'une réservation GRATUITE. Les règles Firestore interdisent à un client d'écrire
// dans notifications/{autreUid} (anti-spam) → seul l'Admin SDK peut le faire. Les
// ventes PAYÉES sont déjà notifiées par les webhooks Stripe/FedaPay.

import { getDb, FieldValue } from '../lib/firebaseAdmin.js'
import { requireAuth } from '../lib/verifyAuth.js'

// Cap anti-abus : un seul appel ne peut jamais déplacer plus de 20 places.
const MAX_QTY_PER_CALL = 20

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth obligatoire (faille audit n°3) : sans ça, n'importe qui pouvait vider
  // le stock d'un event (reserve en boucle) ou provoquer une survente (release).
  const caller = await requireAuth(req, res)
  if (!caller) return

  const { eventId, placeType, qty, action } = req.body || {}

  // ─── Validation d'un code promo (UX du récap d'achat) ───────────────────────
  // L'acheteur saisit un code → on répond valide/invalide + la définition de la
  // réduction pour l'affichage. L'application AUTORITAIRE (prix réellement payé)
  // se fait dans api/checkout.js / api/fedapay.js — jamais côté client. Les
  // codes ne sont pas énumérables : il faut connaître le code exact.
  if (action === 'validate_promo') {
    if (!eventId) return res.status(400).json({ error: 'eventId requis' })
    try {
      const db = getDb()
      const { resolvePromo, promoUnitDiscount, promoLabel } = await import('../lib/promos.js')
      // Même quantité que le checkout : la validation UX reflète alors exactement
      // le plafond par quantité (#69) — pas de « valide » ici puis refus au paiement.
      const wantUses = Math.max(1, Math.min(20, Math.floor(Number(qty)) || 1))
      const result = await resolvePromo(db, eventId, req.body?.code, wantUses)
      if (!result.ok) return res.status(200).json({ valid: false, reason: result.reason, message: result.message })
      const promo = result.promo
      // Réduction par billet calculée sur le PRIX SERVEUR de la place (si fournie),
      // pour que l'affichage du client colle exactement à ce que le checkout fera.
      let unitDiscount = null
      let currency = 'EUR'
      if (placeType) {
        const evSnap = await db.collection('events').doc(String(eventId)).get()
        if (evSnap.exists) {
          const ev = evSnap.data()
          currency = String(ev.currency || '').toUpperCase() === 'XOF' ? 'XOF' : 'EUR'
          const place = (ev.places || []).find(p => p.type === placeType)
          if (place && place.price != null) {
            const minor = currency === 'XOF' ? 1 : 100
            const unitSmallest = Math.round(Number(place.price) * minor) || 0
            const disc = promoUnitDiscount(promo, unitSmallest, minor)
            // Un code qui rend le billet 100% gratuit n'est pas pris en charge
            // par le paiement en ligne (minimums Stripe/mobile money) — pour
            // offrir des places, l'organisateur utilise la guestlist.
            if (unitSmallest > 0 && disc >= unitSmallest) {
              return res.status(200).json({ valid: false, reason: 'free_not_supported', message: 'Ce code rend le billet gratuit — non pris en charge pour le paiement en ligne.' })
            }
            unitDiscount = disc
          }
        }
      }
      return res.status(200).json({
        valid: true,
        code: promo.code,
        type: promo.type,
        value: Number(promo.value) || 0,
        label: promoLabel(promo, currency),
        unitDiscount, // plus petite unité (centimes EUR / FCFA entiers), null si place inconnue
        currency,
      })
    } catch (err) {
      console.error('[/api/event-stock validate_promo] error:', err)
      return res.status(500).json({ error: err.message || 'Internal error' })
    }
  }

  // ─── Commandes de soirée (POS) — mutations SERVEUR-AUTORITAIRES (#7) ─────────
  // AVANT : toute la caisse écrivait event_orders/{eventId} en DIRECT côté client →
  // n'importe quel connecté pouvait se marquer « payé », mettre un prix à 0, ou
  // effacer les commandes d'autrui. Désormais toute mutation passe ici (les règles
  // bloquent l'écriture client directe). On dérive le rôle RÉEL de l'appelant
  // (propriétaire / staff du roster / client) et on valide :
  //  · unitPrice vient TOUJOURS du menu SERVEUR (jamais du client → fini le prix à 0) ;
  //  · paid_at / served_at / cancelled réservés au staff/propriétaire (pas d'auto-payé) ;
  //  · un non-staff ne touche QUE ses propres lignes non servies/non payées.
  if (action === 'order') {
    if (!eventId) return res.status(400).json({ error: 'eventId requis' })
    const ops = req.body?.ops || {}
    try {
      const db = getDb()
      const evSnap = await db.collection('events').doc(String(eventId)).get()
      if (!evSnap.exists) return res.status(404).json({ error: 'Événement introuvable' })
      const ev = evSnap.data()
      const isOwner = ev.createdBy === caller.uid || ev.organizerId === caller.uid
      let staffRole = null
      try {
        const st = await db.collection('event_staff').doc(String(eventId)).get()
        staffRole = st.exists ? ((st.data().roster || {})[caller.uid] || null) : null
      } catch {}
      const isStaff = isOwner || !!staffRole
      const isManager = isOwner || staffRole === 'manager'
      const menu = Array.isArray(ev.menu) ? ev.menu : []
      // Prix autoritaire : depuis le menu serveur. Menu configuré mais article inconnu → invalide.
      const menuPrice = (item) => {
        if (!menu.length) return Number(item.unitPrice) || 0 // pas de menu → aucun enjeu prix
        const m = menu.find(x => String(x.id || x.name) === String(item.menuItemId) || String(x.name) === String(item.name))
        return m ? (Number(m.price) || 0) : null
      }
      const STAFF_ONLY = ['paid_at', 'paid_by', 'paid_by_name', 'served_at', 'served_by', 'served_by_name', 'cancelled_at', 'cancelled_by', 'cancellation_reason']
      const isServed = (it) => it && (it.status === 'served' || it.served_at)

      const upserts = Array.isArray(ops.upserts) ? ops.upserts : []
      // insertOnly = matérialisation des options INCLUSES au billet + des PRÉCOMMANDES
      // (déjà payées / gratuites, pas des consos de bar facturables) → insérées telles
      // quelles si absentes, sans override de prix.
      const insertOnly = Array.isArray(ops.insertOnly) ? ops.insertOnly : []
      const patches = Array.isArray(ops.patches) ? ops.patches : []
      const removeIds = Array.isArray(ops.removeIds) ? ops.removeIds : []
      const guardedRemoveIds = Array.isArray(ops.guardedRemoveIds) ? ops.guardedRemoveIds : []

      const ref = db.collection('event_orders').doc(String(eventId))
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const remote = (snap.exists && Array.isArray(snap.data().items)) ? snap.data().items : []
        const byId = new Map(remote.map(it => [String(it.id), it]))
        const deny = (reason) => { const e = new Error('DENIED'); e.reason = reason; throw e }

        for (const raw of upserts) {
          const existing = byId.get(String(raw.id))
          const price = menuPrice(raw)
          if (price === null) deny('unknown_menu_item')
          let item = { ...raw, unitPrice: price }
          if (!isStaff) {
            for (const k of STAFF_ONLY) delete item[k]
            item.addedBy = caller.uid
            item.addedByRole = 'client'
            if (existing && (existing.addedBy !== caller.uid || isServed(existing) || existing.paid_at)) deny('not_your_item')
          }
          byId.set(String(item.id), existing ? { ...existing, ...item } : item)
        }
        for (const raw of insertOnly) {
          if (byId.has(String(raw.id))) continue
          byId.set(String(raw.id), { ...raw, addedBy: raw.addedBy || caller.uid })
        }
        for (const p of patches) {
          const cur = byId.get(String(p.id)); if (!cur) continue
          if (p.requireUnserved && isServed(cur)) continue
          if (p.requireUnpaid && cur.paid_at) continue
          const set = p.set || {}
          if (STAFF_ONLY.some(k => k in set) && !isStaff) deny('staff_only')
          if (('cancelled_at' in set) && !isManager) deny('manager_only')
          if (!isStaff && cur.addedBy !== caller.uid) deny('not_your_item')
          byId.set(String(p.id), { ...cur, ...set })
        }
        const doRemove = (id, guards) => {
          const cur = byId.get(String(id)); if (!cur) return
          if (guards.requireUnserved && isServed(cur)) return
          if (guards.requireUnpaid && cur.paid_at) return
          if (!isStaff && cur.addedBy !== caller.uid) deny('not_your_item')
          byId.delete(String(id))
        }
        for (const id of removeIds) doRemove(id, {})
        for (const g of guardedRemoveIds) doRemove(g.id, g)

        tx.set(ref, { items: [...byId.values()], updatedAt: new Date().toISOString() }, { merge: true })
      })
      return res.status(200).json({ ok: true })
    } catch (err) {
      if (err?.message === 'DENIED') return res.status(403).json({ error: err.reason || 'forbidden' })
      console.error('[/api/event-stock order] error:', err)
      return res.status(500).json({ error: err.message || 'Internal error' })
    }
  }

  // ─── Notification de réservation gratuite (ex /api/notify-sale) ─────────────
  if (action === 'notify') {
    if (!eventId) return res.status(400).json({ error: 'eventId requis' })
    try {
      const db = getDb()
      // On lit l'event réel pour trouver l'organisateur (on ne fait jamais
      // confiance au client pour désigner le destinataire de la notification).
      const evSnap = await db.collection('events').doc(String(eventId)).get()
      if (!evSnap.exists) return res.status(404).json({ error: 'Événement introuvable' })
      const ev = evSnap.data()
      const organizerUid = ev.organizerId || ev.createdBy
      // buyerId falsifiable → on n'auto-notifie pas, mais on compare tout de même
      // pour éviter qu'un organisateur se notifie lui-même.
      if (!organizerUid || organizerUid === caller.uid || organizerUid === req.body?.buyerId) {
        return res.status(200).json({ ok: true, skipped: 'no-organizer-or-self' })
      }
      // Libellé de place reconstruit depuis l'EVENT (jamais le texte libre du
      // client : sinon n'importe quel connecté injectait un contenu arbitraire
      // dans la cloche de l'organisateur).
      const requested = String(placeType || req.body?.place || '').trim().toLowerCase()
      const knownPlace = (Array.isArray(ev.places) ? ev.places : [])
        .find(p => String(p?.type || p?.name || '').trim().toLowerCase() === requested)
      const placeLabel = knownPlace ? (knownPlace.type || knownPlace.name) : 'place'
      const notif = {
        id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
        type: 'new_order',
        title: 'Nouvelle réservation',
        body: `${Math.max(1, Math.min(50, Number(qty) || 1))} × ${placeLabel} — ${ev.name || 'ton événement'}`,
        data: { eventId: String(eventId) },
        read: false,
        createdAt: Date.now(),
      }
      const ref = db.collection('notifications').doc(String(organizerUid))
      const cur = await ref.get()
      const items = cur.exists ? (cur.data().items || []) : []
      await ref.set({ items: [notif, ...items].slice(0, 50), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      return res.status(200).json({ ok: true })
    } catch (err) {
      console.error('[/api/event-stock notify] error:', err)
      return res.status(500).json({ error: err.message || 'Internal error' })
    }
  }

  const q = Math.max(1, Math.min(MAX_QTY_PER_CALL, Math.floor(Number(qty)) || 1))
  if (!eventId || !placeType || (action !== 'reserve' && action !== 'release')) {
    return res.status(400).json({ error: 'Paramètres invalides' })
  }
  const delta = action === 'reserve' ? -q : q

  // Clé de restock partagée avec le webhook checkout.session.expired
  // (stock_releases/{sessionId}) : rend le 'release' IDEMPOTENT entre la page
  // d'annulation et le webhook → plus de double restock / survente (audit #6).
  const releaseKey = action === 'release' ? String(req.body?.releaseKey || '') : ''

  try {
    const db = getDb()
    const ref = db.collection('events').doc(String(eventId))
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) {
        const err = new Error('event_not_found'); err.code = 'event_not_found'; throw err
      }
      // Restock déjà effectué pour cette session (par le webhook OU un autre
      // appel) → ne pas restocker une 2e fois. Lecture DANS la transaction.
      let relRef = null
      if (releaseKey) {
        relRef = db.collection('stock_releases').doc(releaseKey)
        const relSnap = await tx.get(relRef)
        if (relSnap.exists) return
      }
      const places = snap.data().places || []
      const idx = places.findIndex(p => p.type === placeType)
      if (idx === -1) {
        const err = new Error('place_not_found'); err.code = 'place_not_found'; throw err
      }
      const available = Number(places[idx].available) || 0
      if (delta < 0 && available < -delta) {
        const err = new Error('insufficient_stock'); err.code = 'insufficient_stock'; throw err
      }
      const total = Number(places[idx].total) || 0
      const nextAvailable = Math.max(0, Math.min(total || Infinity, available + delta))
      const nextPlaces = places.map((p, i) => i === idx ? { ...p, available: nextAvailable } : p)
      tx.update(ref, { places: nextPlaces })
      if (relRef) tx.set(relRef, { sessionId: releaseKey, eventId: String(eventId), placeType: String(placeType), qty: q, releasedAt: FieldValue.serverTimestamp(), via: 'cancel_page' }, { merge: true })
    })
    return res.status(200).json({ ok: true })
  } catch (e) {
    if (e.code === 'insufficient_stock') {
      return res.status(409).json({ error: 'Il ne reste plus assez de places disponibles pour cette quantité.' })
    }
    if (e.code === 'event_not_found' || e.code === 'place_not_found') {
      return res.status(200).json({ ok: true, skipped: e.code })
    }
    console.error('[/api/event-stock] error:', e)
    return res.status(500).json({ error: e.message || 'Erreur serveur' })
  }
}
