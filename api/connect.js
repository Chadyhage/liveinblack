// Vercel Serverless Function — Stripe Connect (Express) d'un vendeur.
// Endpoint unifié (économise une fonction sur le plan Hobby, limité à 12) :
//   GET  /api/connect?uid=...                          → statut Connect
//   POST /api/connect { uid, returnPath?, country?, phoneCode? } → lien onboarding
//
// Prérequis : compte plateforme activé + Connect activé dans le Dashboard Stripe.

import Stripe from 'stripe'
import { getDb } from '../lib/firebaseAdmin.js'
import { isStripeConnectCountry, resolveCountryISO } from '../lib/fees.js'
import { requireAuthAsUid } from '../lib/verifyAuth.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

export default async function handler(req, res) {
  if (req.method === 'GET') return status(req, res)
  if (req.method === 'POST') return onboard(req, res)
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Method not allowed' })
}

// ─── Statut Connect (ex /api/connect-status) ─────────────────────────────────
async function status(req, res) {
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
    console.error('[/api/connect GET] error:', err)
    return res.status(500).json({ error: err.message || 'Stripe error' })
  }
}

// ─── Onboarding Connect (ex /api/connect-onboard) ────────────────────────────
async function onboard(req, res) {
  try {
    const { uid, returnPath = '/mon-dossier', country, phoneCode } = req.body || {}
    if (!uid) return res.status(400).json({ error: 'uid requis' })
    // Strict : on ne lance un onboarding Stripe QUE pour soi-même.
    const caller = await requireAuthAsUid(req, res, uid)
    if (!caller) return

    const db = getDb()
    const uSnap = await db.collection('users').doc(String(uid)).get()
    if (!uSnap.exists) return res.status(404).json({ error: 'Utilisateur introuvable' })
    const u = uSnap.data()

    const origin = req.headers.origin || `https://${req.headers.host}`
    const refresh_url = `${origin}${returnPath}?connect=refresh`
    const return_url = `${origin}${returnPath}?connect=done`

    // Compte déjà existant → nouveau lien (reprise d'onboarding).
    if (u.stripeAccountId) {
      const link = await stripe.accountLinks.create({
        account: u.stripeAccountId, refresh_url, return_url, type: 'account_onboarding',
      })
      return res.status(200).json({ url: link.url, accountId: u.stripeAccountId })
    }

    // Déterminer le pays ISO-2 du vendeur.
    let iso = resolveCountryISO({ country: country || u.stripeCountry || u.country, phoneCode })
    if (!iso) {
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
      account: account.id, refresh_url, return_url, type: 'account_onboarding',
    })
    return res.status(200).json({ url: link.url, accountId: account.id })
  } catch (err) {
    console.error('[/api/connect POST] error:', err)
    return res.status(500).json({ error: err.message || 'Stripe error' })
  }
}
