// Vercel Serverless Function — Notifie l'organisateur d'une réservation GRATUITE.
// Endpoint : POST /api/notify-sale  { eventId, qty, place, buyerId }
//
// Pourquoi un endpoint : les règles Firestore interdisent à un client d'écrire
// dans notifications/{autreUid} (anti-spam). Seul un contexte serveur (Admin
// SDK, qui contourne les règles) peut notifier l'organisateur. Les ventes
// PAYÉES sont déjà notifiées par le webhook Stripe ; cet endpoint couvre les
// réservations gratuites (guestlist).

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { requireAuth } from '../lib/verifyAuth.js'

function getDb() {
  if (!getApps().length) {
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      throw new Error('Firebase Admin credentials missing')
    }
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    })
  }
  return getFirestore()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  // Auth requise : sans ça, n'importe qui pouvait spammer de fausses notifs de
  // vente à n'importe quel organisateur (buyerId falsifiable) — faille audit n°3.
  const caller = await requireAuth(req, res)
  if (!caller) return

  try {
    const { eventId, qty = 1, place = '', buyerId = '' } = req.body || {}
    if (!eventId) return res.status(400).json({ error: 'eventId requis' })

    const db = getDb()
    // On lit l'event réel pour trouver l'organisateur (on ne fait pas confiance
    // au client pour désigner le destinataire de la notification).
    const evSnap = await db.collection('events').doc(String(eventId)).get()
    if (!evSnap.exists) return res.status(404).json({ error: 'Événement introuvable' })
    const ev = evSnap.data()
    const organizerUid = ev.organizerId || ev.createdBy
    if (!organizerUid || organizerUid === buyerId) {
      return res.status(200).json({ ok: true, skipped: 'no-organizer-or-self' })
    }

    const notif = {
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      type: 'new_order',
      title: '🎫 Nouvelle réservation',
      body: `${Math.max(1, Number(qty) || 1)} × ${place || 'place'} — ${ev.name || 'ton événement'}`,
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
    console.error('[/api/notify-sale] error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
