// Vercel Serverless Function — Vérifie une session Stripe Checkout
// Endpoint : GET /api/verify-session?session_id=cs_test_xxx
//
// Renvoie le statut de paiement + métadonnées pour confirmer la réservation
// après le redirect success de Stripe.

import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const sessionId = req.query?.session_id || req.query?.sessionId
  if (!sessionId) {
    return res.status(400).json({ error: 'session_id requis' })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'customer'],
    })

    return res.status(200).json({
      paid: session.payment_status === 'paid',
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
      customerEmail: session.customer_details?.email || null,
      customerName: session.customer_details?.name || null,
      metadata: session.metadata || {},
      receiptUrl: session.payment_intent?.charges?.data?.[0]?.receipt_url || null,
    })
  } catch (err) {
    console.error('[/api/verify-session] error:', err)
    return res.status(500).json({ error: err.message || 'Stripe error' })
  }
}
