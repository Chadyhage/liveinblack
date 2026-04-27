// Vercel Serverless Function — Crée une session Stripe Checkout
// Endpoint : POST /api/checkout
//
// Body attendu :
// {
//   eventId, eventName, placeType, qty (number),
//   unitPriceEUR (number), preorderItems? [{ name, qty, priceEUR }],
//   userId, userEmail (optionnel mais recommandé), bookingId (id local généré côté client)
// }

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
      eventImage,
      placeType,
      qty = 1,
      unitPriceEUR = 0,
      preorderItems = [],
      userId,
      userEmail,
      bookingId,
    } = req.body || {}

    if (!eventId || !eventName || !placeType || !bookingId) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Construire les line_items pour Stripe (montants en CENTIMES)
    const line_items = []

    // Place principale (si payante — sinon on n'inclut pas, mais on doit avoir quelque chose à payer)
    const placeUnitCents = Math.round(Number(unitPriceEUR) * 100)
    if (placeUnitCents > 0 && qty > 0) {
      line_items.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: `${eventName} — ${placeType}`,
            ...(eventImage && eventImage.startsWith('http') ? { images: [eventImage] } : {}),
          },
          unit_amount: placeUnitCents,
        },
        quantity: qty,
      })
    }

    // Précommandes (consos)
    for (const it of preorderItems) {
      const cents = Math.round(Number(it.priceEUR || 0) * 100)
      const q = Number(it.qty || 0)
      if (cents > 0 && q > 0) {
        line_items.push({
          price_data: {
            currency: 'eur',
            product_data: { name: `${it.name} (précommande)` },
            unit_amount: cents,
          },
          quantity: q,
        })
      }
    }

    if (line_items.length === 0) {
      return res.status(400).json({ error: 'Aucun montant à payer (place gratuite ?)' })
    }

    // URL de retour — déduit l'origine de la requête
    const origin = req.headers.origin || `https://${req.headers.host}`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      ...(userEmail ? { customer_email: userEmail } : {}),
      success_url: `${origin}/paiement-reussi?session_id={CHECKOUT_SESSION_ID}&booking_id=${encodeURIComponent(bookingId)}`,
      cancel_url: `${origin}/paiement-annule?event_id=${encodeURIComponent(eventId)}`,
      metadata: {
        eventId: String(eventId),
        eventName: String(eventName).slice(0, 200),
        placeType: String(placeType),
        qty: String(qty),
        userId: String(userId || ''),
        bookingId: String(bookingId),
      },
      // Stripe collecte aussi le nom complet du payeur
      billing_address_collection: 'auto',
      // Désactive la collecte des frais d'expédition (event en présentiel)
      locale: 'fr',
    })

    return res.status(200).json({ url: session.url, sessionId: session.id })
  } catch (err) {
    console.error('[/api/checkout] error:', err)
    return res.status(500).json({ error: err.message || 'Stripe error' })
  }
}
