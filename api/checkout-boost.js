// Vercel Serverless Function — Stripe Checkout pour booster un événement
// Endpoint : POST /api/checkout-boost
//
// Body attendu :
// { eventId, eventName, position (1-3), days, priceEUR, region, userId, boostId }

import Stripe from 'stripe'

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
