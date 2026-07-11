// Vercel Serverless Function — Abonnement mensuel PRESTATAIRE (Stripe Billing).
// Endpoint : POST /api/create-subscription
//
// Modèle : un prestataire paie 9,99 €/mois pour être présent sur LIVEINBLACK
// (annuaire, profil, contact organisateurs). Il paie APRÈS avoir rempli son dossier ;
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
import { getDb } from '../lib/firebaseAdmin.js'
import { providerBillingCurrency } from '../lib/providerBillingRegion.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' })

function subscriptionIsActive(subscription) {
  return subscription && (subscription.status === 'active' || subscription.status === 'trialing')
}

async function persistVerifiedSubscription(db, uid, session) {
  if (!session || session.mode !== 'subscription' || session.payment_status !== 'paid') return null
  if (session.metadata?.type !== 'prestataire_subscription') return null
  const owner = session.metadata?.uid || session.client_reference_id
  if (String(owner || '') !== String(uid)) return null
  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  if (!subId) return null
  const subscription = await stripe.subscriptions.retrieve(subId)
  if (!subscriptionIsActive(subscription)) return null
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
  await db.collection('users').doc(String(uid)).set({
    prestataireSubActive: true,
    prestataireSubStatus: subscription.status,
    prestataireSubEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    prestataireSubRail: 'stripe',
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId || null,
    _syncedAt: Date.now(),
  }, { merge: true })
  return subscription
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const caller = await requireAuth(req, res)
  if (!caller) return
  try {
    const uid = caller.uid
    const email = caller.email || undefined
    const plan = SUBSCRIPTION.PRESTATAIRE
    const origin = req.headers.origin || `https://${req.headers.host}`
    const db = getDb()
    const deletion = await db.collection('deleted_accounts').doc(String(uid)).get()
    if (deletion.exists && deletion.data()?.blockBillingWrites === true) {
      return res.status(410).json({ error: 'account_deleted', message: 'Ce compte est en cours de suppression.' })
    }

    // Retour Checkout : confirmation synchrone auprès de Stripe. Cela évite de
    // remettre le candidat au début pendant les quelques secondes du webhook.
    if (req.method === 'GET') {
      const sessionId = String(req.query?.session_id || '')
      if (!sessionId) return res.status(400).json({ error: 'session_id_required' })
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      const subscription = await persistVerifiedSubscription(db, uid, session)
      if (!subscription) return res.status(409).json({ error: 'subscription_not_active', active: false })
      return res.status(200).json({ active: true, status: subscription.status })
    }

    const userRef = db.collection('users').doc(String(uid))
    const userSnap = await userRef.get()
    const profile = userSnap.exists ? userSnap.data() : {}
    const billingSnap = await db.collection('provider_billing').doc(String(uid)).get()
    const billing = billingSnap.exists ? billingSnap.data() : {}

    if (!billing.regionId || providerBillingCurrency(billing.regionId) !== 'EUR') {
      return res.status(409).json({ error: 'Ton pays de facturation utilise le paiement Mobile Money. Ouvre les paramètres du compte si cette information est erronée.' })
    }

    // Protection financière : ne jamais ouvrir un deuxième Checkout si un
    // abonnement actif existe déjà, même si l'interface locale est en retard.
    if (profile.prestataireSubActive) {
      return res.status(200).json({ alreadyActive: true, status: profile.prestataireSubStatus || 'active' })
    }
    if (profile.stripeSubscriptionId) {
      try {
        const existingSub = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId)
        if (subscriptionIsActive(existingSub)) {
          await userRef.set({ prestataireSubActive: true, prestataireSubStatus: existingSub.status, _syncedAt: Date.now() }, { merge: true })
          return res.status(200).json({ alreadyActive: true, status: existingSub.status })
        }
      } catch {}
    }

    // Un paiement peut avoir réussi avant que le webhook n'écrive Firestore.
    // On retrouve alors la session payée et on l'active au lieu de refacturer.
    // checkout.sessions.list ne sait PAS filtrer par client_reference_id
    // (« Received unknown parameter ») → on filtre par email de l'acheteur ;
    // persistVerifiedSubscription re-vérifie ensuite metadata.uid === uid.
    const previous = email
      ? await stripe.checkout.sessions.list({ customer_details: { email }, limit: 10 })
      : { data: [] }
    for (const oldSession of previous.data) {
      const verified = await persistVerifiedSubscription(db, uid, oldSession).catch(() => null)
      if (verified) return res.status(200).json({ alreadyActive: true, status: verified.status })
    }

    // Réutiliser une session ouverte empêche aussi les doubles clics de créer
    // plusieurs pages Checkout concurrentes.
    const openSession = previous.data.find(session =>
      session.mode === 'subscription'
      && session.status === 'open'
      && (session.metadata?.type === 'prestataire_subscription')
      // La liste est filtrée par EMAIL : une session ouverte peut appartenir à
      // un ANCIEN uid du même email (compte supprimé puis recréé). La réutiliser
      // ferait payer un abonnement rattaché au mauvais compte.
      && String(session.metadata?.uid || session.client_reference_id || '') === String(uid)
      && session.url
    )
    if (openSession) return res.status(200).json({ url: openSession.url, reused: true })

    // ── Verrou anti-double abonnement (audit #5) : sérialise la création de session
    // par uid. Un double-clic CONCURRENT (les deux requêtes passent la réutilisation
    // ci-dessus avant que la 1re n'ait créé sa session) créerait sinon DEUX
    // abonnements Stripe → l'utilisateur facturé deux fois. La 2e requête voit le
    // verrou frais et s'arrête ; l'utilisateur réessaie et retombe sur la session
    // ouverte de la 1re (réutilisée plus haut). Le verrou expire après 25 s.
    const lockRef = db.collection('subscription_locks').doc(String(uid))
    const gotLock = await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef)
      const claimedAt = snap.exists ? Number(snap.data().claimedAt) || 0 : 0
      if (Date.now() - claimedAt < 25000) return false
      tx.set(lockRef, { uid: String(uid), claimedAt: Date.now() }, { merge: true })
      return true
    })
    if (!gotLock) {
      return res.status(409).json({ error: 'Un abonnement est déjà en cours de création — patiente quelques secondes puis réessaie.' })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      ...(profile.stripeCustomerId
        ? { customer: profile.stripeCustomerId }
        : email ? { customer_email: email } : {}),
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
