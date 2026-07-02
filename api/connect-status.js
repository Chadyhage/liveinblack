// Vercel Serverless Function — Statut Stripe Connect d'un vendeur.
// Endpoint : GET /api/connect-status?uid=...
//
// Relit le compte Express auprès de Stripe et met à jour users/{uid}
// (source de vérité de l'éligibilité reversement). Utilisé par le front au
// retour de l'onboarding Stripe (?connect=done) pour rafraîchir l'état.

import Stripe from 'stripe'
import { getDb } from '../lib/firebaseAdmin.js'
import { requireAuthAsUid } from '../lib/verifyAuth.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const uid = req.query.uid
    if (!uid) return res.status(400).json({ error: 'uid requis' })
    // Strict : on ne consulte le statut Connect QUE pour soi-même.
    const caller = await requireAuthAsUid(req, res, uid)
    if (!caller) return

    const db = getDb()
    const uSnap = await db.collection('users').doc(String(uid)).get()
    const u = uSnap.exists ? uSnap.data() : {}

    // Vendeur en mode manuel (pays hors zone Stripe) → pas de compte à interroger.
    if (u.payoutMode === 'manual') {
      return res.status(200).json({ payoutMode: 'manual', chargesEnabled: false, payoutsEnabled: false })
    }
    if (!u.stripeAccountId) {
      return res.status(200).json({ payoutMode: u.payoutMode || 'none', chargesEnabled: false, payoutsEnabled: false })
    }

    const acct = await stripe.accounts.retrieve(u.stripeAccountId)
    const out = {
      payoutMode: 'connect',
      chargesEnabled: acct.charges_enabled === true,
      payoutsEnabled: acct.payouts_enabled === true,
      detailsSubmitted: acct.details_submitted === true,
    }
    await db.collection('users').doc(String(uid)).set({
      stripeChargesEnabled: out.chargesEnabled,
      stripePayoutsEnabled: out.payoutsEnabled,
      stripeDetailsSubmitted: out.detailsSubmitted,
    }, { merge: true })

    return res.status(200).json(out)
  } catch (err) {
    console.error('[/api/connect-status] error:', err)
    return res.status(500).json({ error: err.message || 'Stripe error' })
  }
}
