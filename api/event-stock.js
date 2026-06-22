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

import { getDb } from '../lib/firebaseAdmin.js'

// Cap anti-abus : un seul appel ne peut jamais déplacer plus de 20 places.
const MAX_QTY_PER_CALL = 20

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { eventId, placeType, qty, action } = req.body || {}
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
