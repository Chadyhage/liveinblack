// Vercel Serverless Function — Abonnement mensuel PRESTATAIRE (Stripe Billing).
// Endpoint : POST /api/create-subscription
//
// Modèle : un prestataire paie 9,99 €/mois pour être présent sur LIVEINBLACK
// (annuaire, profil, contact organisateurs). Il paie AVANT de remplir son dossier ;
// l'agent valide ensuite. AUCUNE commission sur les prestations (les paiements
// prestataire ↔ client se font en direct, hors plateforme).
//
// Sécurité : uid + email sont pris du TOKEN Firebase (jamais du body) → l'abonnement
// est rattaché au vrai compte de l'appelant. Le webhook (stripe-webhook.js) est la
// SOURCE DE VÉRITÉ du statut (activation/résiliation), jamais le client.
//
// Config requise : STRIPE_SECRET_KEY (+ Firebase Admin pour la vérif du token).

import Stripe from 'stripe'
import { SUBSCRIPTION } from '../lib/fees.js'
import { requireAuth } from '../lib/verifyAuth.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const caller = await requireAuth(req, res)
  if (!caller) return
  try {
    const uid = caller.uid
    const email = caller.email || undefined
    const plan = SUBSCRIPTION.PRESTATAIRE
    const origin = req.headers.origin || `https://${req.headers.host}`

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      ...(email ? { customer_email: email } : {}),
      client_reference_id: uid,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: plan.currency,
          product_data: { name: plan.label, description: plan.description },
          unit_amount: plan.amountCents,
          recurring: { interval: plan.interval },
        },
      }],
      // uid dupliqué sur la session ET l'abonnement → le webhook mappe uid ↔ sub
      // sur tous les événements (checkout.session.completed, customer.subscription.*).
      metadata: { uid: String(uid), type: 'prestataire_subscription' },
      subscription_data: { metadata: { uid: String(uid), type: 'prestataire_subscription' } },
      success_url: `${origin}/inscription-prestataire?sub=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/inscription-prestataire?sub=cancel`,
      allow_promotion_codes: true,
      locale: 'fr',
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[/api/create-subscription] error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
