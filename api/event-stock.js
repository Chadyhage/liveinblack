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
      const notif = {
        id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
        type: 'new_order',
        title: '🎫 Nouvelle réservation',
        body: `${Math.max(1, Number(qty) || 1)} × ${placeType || req.body?.place || 'place'} — ${ev.name || 'ton événement'}`,
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

  try {
    const db = getDb()
    const ref = db.collection('events').doc(String(eventId))
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) {
        const err = new Error('event_not_found'); err.code = 'event_not_found'; throw err
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
