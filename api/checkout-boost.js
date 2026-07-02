// Vercel Serverless Function — Stripe Checkout pour booster un événement
// Endpoint : POST /api/checkout-boost
//
// Body attendu :
// { eventId, eventName, position (1-3), days, priceEUR, region, userId, boostId }

import Stripe from 'stripe'
import { getDb } from '../lib/firebaseAdmin.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      eventId,
      eventName,
      position,           // 1, 2 ou 3
      days,               // durée en jours (1-30)
      priceEUR,           // prix EUR
      region = '',
      userId,
      userEmail,
      boostId,            // identifiant local pour rapprocher
    } = req.body || {}

    if (!eventId || !eventName || !position || !days || !priceEUR || !boostId) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const cents = Math.round(Number(priceEUR) * 100)
    if (cents <= 0) {
      return res.status(400).json({ error: 'Montant invalide' })
    }

    // ── Anti double-vente ────────────────────────────────────────────────────
    // Un boost démarre immédiatement : si un boost ACTIF occupe déjà la même
    // position dans la même région, les deux périodes se chevauchent forcément.
    // Vendre quand même = deux organisateurs paient le même créneau, un seul
    // est affiché (publicité mensongère / rupture contractuelle). On refuse
    // AVANT le paiement — jamais de remboursement à gérer.
    try {
      const db = getDb()
      const snap = await db.collection('boosts')
        .where('region', '==', String(region || ''))
        .where('position', '==', Number(position))
        .get()
      const now = Date.now()
      const conflict = snap.docs
        .map(d => d.data())
        .find(b => { try { return new Date(b.expiresAt).getTime() > now } catch { return false } })
      if (conflict) {
        const until = new Date(conflict.expiresAt)
        const untilStr = until.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
        return res.status(409).json({
          error: `Le créneau Top ${position}${region ? ` (${region})` : ''} est déjà réservé jusqu'au ${untilStr}. Choisis une autre position ou réessaie après cette date.`,
          conflictUntil: conflict.expiresAt,
        })
      }
    } catch (dbErr) {
      // Firestore indisponible : on ne bloque pas la vente (dégradé), le webhook
      // journalisera un éventuel conflit résiduel.
      console.warn('[/api/checkout-boost] collision check skipped:', dbErr.message)
    }

    const origin = req.headers.origin || `https://${req.headers.host}`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Boost Top ${position} — ${days} jour${days > 1 ? 's' : ''}`,
            description: `Mise en avant de "${eventName}"${region ? ` (${region})` : ''}`,
          },
          unit_amount: cents,
        },
        quantity: 1,
      }],
      ...(userEmail ? { customer_email: userEmail } : {}),
      success_url: `${origin}/boost-active?session_id={CHECKOUT_SESSION_ID}&boost_id=${encodeURIComponent(boostId)}`,
      cancel_url: `${origin}/evenements/${encodeURIComponent(eventId)}?boost_cancelled=1`,
      metadata: {
        intent: 'boost',
        eventId: String(eventId),
        eventName: String(eventName).slice(0, 200),
        position: String(position),
        days: String(days),
        region: String(region || ''),
        userId: String(userId || ''),
        boostId: String(boostId),
      },
      locale: 'fr',
    })

    return res.status(200).json({ url: session.url, sessionId: session.id })
  } catch (err) {
    console.error('[/api/checkout-boost] error:', err)
    return res.status(500).json({ error: err.message || 'Stripe error' })
  }
}
