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
  // encore enregistré stripeSubscriptionId / stripeCustomerId. Recherche par
  // metadata.uid (posé par create-subscription sur l'abonnement lui-même) —
  // checkout.sessions.list ne sait PAS filtrer par client_reference_id
  // (« Received unknown parameter »), d'où la Search API.
  if (!byId.size) {
    const search = await stripe.subscriptions.search({
      query: `metadata['uid']:'${String(uid).replace(/'/g, '')}'`,
      limit: 100,
    })
    search.data.forEach(subscription => byId.set(subscription.id, subscription))
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
  // Seul Stripe prélève de façon RÉCURRENTE. L'abonnement FedaPay (rail XOF)
  // est une facture ponctuelle par période : rien à résilier, ne doit jamais
  // bloquer une suppression. Un compte client sans aucune référence de
  // facturation ne doit même pas toucher Stripe (sinon la suppression de
  // n'importe quel client dépend de la config/disponibilité Stripe).
  const hasStripeRefs = Boolean(profile.stripeSubscriptionId || profile.stripeCustomerId)
  const stripeBillingExpected = hasStripeRefs
    || (Boolean(profile.prestataireSubActive) && profile.prestataireSubRail !== 'fedapay')

  await tombstoneRef.set({
    uid: String(uid),
    blockBillingWrites: true,
    deletionInProgress: true,
    requestedAt: Date.now(),
    requestedBy: actor.uid || null,
    requestedByEmail: actor.email || null,
  }, { merge: true })

  try {
    if (!stripeBillingExpected) {
      await tombstoneRef.set({
        deletionInProgress: false,
        billingCancelled: true,
        billingCancelledAt: Date.now(),
        canceledStripeSubscriptionIds: [],
        stripeCustomerId: null,
      }, { merge: true })
      return { canceledIds: [], hadBilling: Boolean(profile.prestataireSubActive) }
    }

    const stripe = stripeClient()
    const subscriptions = await findProviderSubscriptions(stripe, uid, profile)
    const cancellable = subscriptions.filter(subscriptionNeedsCancellation)

    // Abonnement signalé ACTIF mais aucun abonnement retrouvé (avec ou sans
    // refs — une ref périmée ne prouve pas qu'il n'y a rien à résilier) :
    // on bloque plutôt que de risquer un prélèvement orphelin.
    if (subscriptions.length === 0
      && Boolean(profile.prestataireSubActive)
      && profile.prestataireSubRail !== 'fedapay') {
      const error = new Error('Abonnement actif signalé mais référence Stripe introuvable. Suppression bloquée pour éviter un prélèvement orphelin — vérifie dans le Dashboard Stripe.')
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

    return { canceledIds, hadBilling: stripeBillingExpected || subscriptions.length > 0 }
  } catch (error) {
    // La suppression n'a pas encore eu lieu : on rend les écritures webhook au
    // compte existant, puis on bloque l'opération côté appelant.
    await tombstoneRef.delete().catch(() => {})
    throw error
  }
}

