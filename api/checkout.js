// Vercel Serverless Function — Crée une session Stripe Checkout
// Endpoint : POST /api/checkout
//
// Body attendu :
// {
//   eventId, eventName, placeType, qty (number),
//   unitPriceEUR (number), preorderItems? [{ name, qty, priceEUR }],
//   userId, userEmail (optionnel mais recommandé), bookingId (id local généré côté client)
// }
//
// Monétisation : un FRAIS DE SERVICE acheteur (lib/fees.js) est ajouté au paiement.
// Si l'organisateur a un compte Stripe Connect éligible (UE/zone Stripe), on reverse
// automatiquement (destination charge + application_fee = le frais). Sinon, la plateforme
// encaisse 100% et le webhook crédite un solde interne (seller_balances) à reverser à la main.

import Stripe from 'stripe'
import { computeTicketFeeCents, isStripeConnectCountry } from '../lib/fees.js'

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
      groupBookingId,
      isGroupShare,
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

    // ── Frais de service LIVEINBLACK (payé par l'acheteur) ──
    // Calculé côté SERVEUR (jamais reçu du client). Sur le prix unitaire du billet.
    const feeCents = computeTicketFeeCents(placeUnitCents, qty)
    if (feeCents > 0) {
      line_items.push({
        price_data: {
          currency: 'eur',
          product_data: { name: 'Frais de service LIVEINBLACK' },
          unit_amount: feeCents,
        },
        quantity: 1,
      })
    }

    // ── Routage du reversement vendeur (organisateur) ──
    // Best-effort : si Admin SDK indisponible, on encaisse 100% sans router (le fee
    // reste tout de même collecté). On résout le vendeur côté serveur (jamais le client).
    let sellerUid = ''
    let connectMode = 'none' // 'auto' (transfer Stripe) | 'ledger' (solde interne) | 'none'
    let paymentIntentData = null
    try {
      const { getDb } = await import('../lib/firebaseAdmin.js')
      const db = getDb()
      const evSnap = await db.collection('events').doc(String(eventId)).get()
      if (evSnap.exists) {
        const ev = evSnap.data()
        sellerUid = ev.organizerId || ev.createdBy || ''
        if (sellerUid && sellerUid !== userId) {
          const uSnap = await db.collection('users').doc(String(sellerUid)).get()
          const u = uSnap.exists ? uSnap.data() : {}
          const eligible = !!u.stripeAccountId && u.stripeChargesEnabled === true &&
            isStripeConnectCountry(u.stripeCountry || u.country)
          if (eligible && feeCents > 0) {
            // Destination charge : Stripe reverse (total - fee) au vendeur, la plateforme garde le fee.
            paymentIntentData = {
              transfer_data: { destination: u.stripeAccountId },
              application_fee_amount: feeCents,
              metadata: { sellerUid, feeCents: String(feeCents) },
            }
            connectMode = 'auto'
          } else {
            // Pas (encore) de Connect → la plateforme encaisse tout, on tracera la dette au webhook.
            connectMode = 'ledger'
          }
        }
      }
    } catch (e) {
      // Admin SDK indisponible → on n'empêche jamais l'encaissement, juste pas de routage.
      console.warn('[/api/checkout] seller resolution skipped:', e.message)
    }

    // URL de retour — déduit l'origine de la requête
    const origin = req.headers.origin || `https://${req.headers.host}`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      ...(paymentIntentData ? { payment_intent_data: paymentIntentData } : {}),
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
        // Monétisation : le webhook utilise feeCents + sellerUid + connectMode
        feeCents: String(feeCents),
        sellerUid: String(sellerUid || ''),
        connectMode,
        // Part de groupe : permet au webhook de marquer la part payée même si
        // le client ferme l'onglet avant de revenir sur /paiement-reussi
        ...(groupBookingId ? { groupBookingId: String(groupBookingId) } : {}),
        ...(isGroupShare ? { isGroupShare: '1' } : {}),
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
