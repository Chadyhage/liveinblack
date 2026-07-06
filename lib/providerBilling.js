import Stripe from 'stripe'

const CANCELLABLE_STATUSES = new Set([
  'active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused',
])

export function subscriptionNeedsCancellation(subscription) {
  return Boolean(subscription?.id && CANCELLABLE_STATUSES.has(String(subscription.status || '')))
}

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY manquante')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' })
}

async function findProviderSubscriptions(stripe, uid, profile = {}) {
  const byId = new Map()

  if (profile.stripeSubscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId)
      byId.set(subscription.id, subscription)
    } catch (error) {
      if (error?.code !== 'resource_missing') throw error
    }
  }

  if (profile.stripeCustomerId) {
    const list = await stripe.subscriptions.list({ customer: profile.stripeCustomerId, status: 'all', limit: 100 })
    list.data.forEach(subscription => {
      if (subscription.metadata?.type === 'prestataire_subscription'
        || String(subscription.metadata?.uid || '') === String(uid)) {
        byId.set(subscription.id, subscription)
      }
    })
  }

  // Filet de sécurité pour les anciens comptes dont le webhook n'avait pas
  // encore enregistré stripeSubscriptionId / stripeCustomerId.
  if (!byId.size) {
    const sessions = await stripe.checkout.sessions.list({ client_reference_id: String(uid), limit: 100 })
    for (const session of sessions.data) {
      if (session.mode !== 'subscription' || session.metadata?.type !== 'prestataire_subscription') continue
      const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
      if (!subId || byId.has(subId)) continue
      try {
        const subscription = await stripe.subscriptions.retrieve(subId)
        byId.set(subscription.id, subscription)
      } catch (error) {
        if (error?.code !== 'resource_missing') throw error
      }
    }
  }

  return [...byId.values()]
}

// Annule toute facturation récurrente AVANT la suppression du compte.
// Le tombstone bloque les webhooks tardifs afin qu'ils ne recréent jamais users/{uid}.
export async function cancelProviderBillingBeforeDeletion(db, uid, actor = {}) {
  const userRef = db.collection('users').doc(String(uid))
  const tombstoneRef = db.collection('deleted_accounts').doc(String(uid))
  const snap = await userRef.get()
  const profile = snap.exists ? snap.data() : {}
  const billingExpected = Boolean(
    profile.prestataireSubActive
    || profile.stripeSubscriptionId
    || profile.stripeCustomerId
  )

  await tombstoneRef.set({
    uid: String(uid),
    blockBillingWrites: true,
    deletionInProgress: true,
    requestedAt: Date.now(),
    requestedBy: actor.uid || null,
    requestedByEmail: actor.email || null,
  }, { merge: true })

  try {
    const stripe = stripeClient()
    const subscriptions = await findProviderSubscriptions(stripe, uid, profile)
    const cancellable = subscriptions.filter(subscriptionNeedsCancellation)

    if (billingExpected && subscriptions.length === 0) {
      const error = new Error('Abonnement actif signalé mais référence Stripe introuvable. Suppression bloquée pour éviter un prélèvement orphelin.')
      error.code = 'billing_reference_missing'
      throw error
    }

    const canceledIds = []
    for (const subscription of cancellable) {
      try {
        await stripe.subscriptions.cancel(subscription.id)
        canceledIds.push(subscription.id)
      } catch (error) {
        if (error?.code !== 'resource_missing') throw error
      }
    }

    await tombstoneRef.set({
      deletionInProgress: false,
      billingCancelled: true,
      billingCancelledAt: Date.now(),
      canceledStripeSubscriptionIds: canceledIds,
      stripeCustomerId: profile.stripeCustomerId || null,
    }, { merge: true })

    return { canceledIds, hadBilling: billingExpected || subscriptions.length > 0 }
  } catch (error) {
    // La suppression n'a pas encore eu lieu : on rend les écritures webhook au
    // compte existant, puis on bloque l'opération côté appelant.
    await tombstoneRef.delete().catch(() => {})
    throw error
  }
}

