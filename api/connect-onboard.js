// Vercel Serverless Function — Onboarding Stripe Connect (Express) d'un vendeur.
// Endpoint : POST /api/connect-onboard  { uid, returnPath?, country?, phoneCode? }
//
// Crée (si besoin) un compte Stripe Express pour le vendeur (organisateur/prestataire)
// et renvoie un lien d'onboarding hébergé par Stripe (KYC + IBAN gérés par Stripe).
// Si le pays du vendeur n'est PAS supporté par Stripe (Afrique de l'Ouest…), on NE crée
// PAS de compte (sinon Stripe lève une erreur) : on bascule en mode "manuel" (ledger +
// reversement à la main) et on le signale au client.
//
// Prérequis : compte plateforme activé + Connect activé dans le Dashboard Stripe.

import Stripe from 'stripe'
import { getDb } from '../lib/firebaseAdmin.js'
import { isStripeConnectCountry, resolveCountryISO } from '../lib/fees.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const { uid, returnPath = '/mon-dossier', country, phoneCode } = req.body || {}
    if (!uid) return res.status(400).json({ error: 'uid requis' })

    const db = getDb()
    const uSnap = await db.collection('users').doc(String(uid)).get()
    if (!uSnap.exists) return res.status(404).json({ error: 'Utilisateur introuvable' })
    const u = uSnap.data()

    const origin = req.headers.origin || `https://${req.headers.host}`
    const refresh_url = `${origin}${returnPath}?connect=refresh`
    const return_url = `${origin}${returnPath}?connect=done`

    // Si un compte existe déjà → on renvoie juste un nouveau lien (reprise d'onboarding).
    if (u.stripeAccountId) {
      const link = await stripe.accountLinks.create({
        account: u.stripeAccountId,
        refresh_url, return_url,
        type: 'account_onboarding',
      })
      return res.status(200).json({ url: link.url, accountId: u.stripeAccountId })
    }

    // Déterminer le pays ISO-2 du vendeur.
    let iso = resolveCountryISO({ country: country || u.stripeCountry || u.country, phoneCode })
    if (!iso) {
      // Repli : lire le dernier dossier du vendeur (pays / indicatif tel collectés à l'onboarding).
      try {
        const apps = await db.collection('applications').where('uid', '==', String(uid)).get()
        let best = null
        apps.forEach(d => { const a = d.data(); if (!best || (a.updatedAt || 0) > (best.updatedAt || 0)) best = a })
        const fd = best?.formData || {}
        iso = resolveCountryISO({ country: fd.pays, phoneCode: fd.telephoneCode })
      } catch {}
    }
    if (!iso) iso = 'FR' // défaut prudent (marché principal)

    // Pays hors zone Stripe → mode manuel (pas de compte Connect possible).
    if (!isStripeConnectCountry(iso)) {
      await db.collection('users').doc(String(uid)).set({ payoutMode: 'manual', stripeCountry: iso }, { merge: true })
      return res.status(200).json({ manual: true, country: iso })
    }

    // Créer le compte Express et stocker son id.
    const account = await stripe.accounts.create({
      type: 'express',
      country: iso,
      email: u.email || undefined,
      business_type: u.businessType === 'company' ? 'company' : 'individual',
      metadata: { uid: String(uid) },
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
    })
    await db.collection('users').doc(String(uid)).set({
      stripeAccountId: account.id,
      stripeCountry: iso,
      payoutMode: 'connect',
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
    }, { merge: true })

    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url, return_url,
      type: 'account_onboarding',
    })
    return res.status(200).json({ url: link.url, accountId: account.id })
  } catch (err) {
    console.error('[/api/connect-onboard] error:', err)
    return res.status(500).json({ error: err.message || 'Stripe error' })
  }
}
