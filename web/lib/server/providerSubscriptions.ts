// Remplace api/create-subscription.js (rail EUR/Stripe) + la branche
// `action:'subscribe'`/finalizeProviderSubscription de api/fedapay.js (rail
// XOF) + la partie "abonnements" de api/cron-subscriptions.js. Abonnement
// prestataire mensuel (annuaire/profil/contact organisateurs) — AUCUNE
// commission de service (les prestations se paient en direct, hors plateforme).
//
// Deux rails distincts, jamais mélangés (voir providerBillingCurrency) :
//  - EUR → Stripe Billing, abonnement RÉCURRENT, statut = la source de vérité
//    Stripe elle-même (webhook customer.subscription.*).
//  - XOF → FedaPay, paiement PONCTUEL, renouvellement MANUEL tous les
//    PROVIDER_SUB.periodDays jours (lib/shared/providerSubscription.ts).
import type Stripe from 'stripe'
import stripe from './stripeClient'
import { createTransaction, createToken, transactionAmountMatches } from './fedapayClient'
import { getDb } from '../db/mongoose'
import User from '../models/User'
import ProviderProfile from '../models/ProviderProfile'
import CronLock from '../models/CronLock'
import PaymentAlert from '../models/PaymentAlert'
import { SUBSCRIPTION } from '../shared/fees'
import { PROVIDER_SUB, computeRenewal, deriveSubStatus, dueReminders, cycleKey, type SubWindow } from '../shared/providerSubscription'
import { getProviderBillingContext } from './providerBilling'
import { sendEmail } from './email'
import { subscriptionReminderEmail } from './email-templates'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

function stripeSubIsActive(sub: Stripe.Subscription | null | undefined): boolean {
  return Boolean(sub) && (sub!.status === 'active' || sub!.status === 'trialing')
}

// Depuis l'API Stripe épinglée par ce projet, `current_period_end` a migré
// du Subscription vers chaque SubscriptionItem (support multi-item) — on lit
// le premier item, seul cas possible ici (un abonnement = un seul price).
function stripeSubPeriodEnd(sub: Stripe.Subscription): Date | null {
  const end = sub.items?.data?.[0]?.current_period_end
  return end ? new Date(end * 1000) : null
}

// ── Mirroring commun : User (source de vérité pour les gates qui ne chargent
// que User) + ProviderProfile SI il existe déjà (jamais de profil fantôme
// créé ici — voir lib/server/providerProfile.ts, création paresseuse #88). ──
async function mirrorStripeStatus(
  uid: string,
  { active, status, end, stripeSubscriptionId, stripeCustomerId }: { active: boolean; status: string; end: Date | null; stripeSubscriptionId: string | null; stripeCustomerId: string | null }
): Promise<void> {
  await User.updateOne(
    { _id: uid },
    {
      $set: {
        prestataireSubActive: active,
        prestataireSubStatus: status,
        prestataireSubEnd: end,
        prestataireSubRail: 'stripe',
        stripeSubscriptionId,
        stripeCustomerId,
      },
    }
  )
  // Le statut Stripe (active/trialing/past_due/unpaid/incomplete/paused/canceled)
  // n'est jamais forcé dans l'enum XOF de ProviderProfile (conçu pour la
  // machine à états à renouvellement manuel) — seul un statut binaire y est
  // reflété, `subscriptionActive` restant le VRAI gate de visibilité.
  await ProviderProfile.updateOne({ userId: uid }, { $set: { subscriptionActive: active, subscriptionStatus: active ? 'active' : 'expired' } })
}

async function mirrorFedapayStatus(uid: string, renewal: ReturnType<typeof computeRenewal>): Promise<void> {
  await User.updateOne(
    { _id: uid },
    {
      $set: {
        prestataireSubActive: true,
        prestataireSubStatus: 'active',
        prestataireSubEnd: new Date(renewal.subscriptionExpiresAt),
        prestataireSubRail: 'fedapay',
        pendingFedapaySubTxnId: null,
      },
    }
  )
  await ProviderProfile.updateOne(
    { userId: uid },
    {
      $set: {
        subscriptionActive: true,
        subscriptionStartedAt: new Date(renewal.subscriptionStartedAt),
        subscriptionExpiresAt: new Date(renewal.subscriptionExpiresAt),
        gracePeriodEndsAt: new Date(renewal.gracePeriodEndsAt),
        subscriptionStatus: 'active',
      },
    }
  )
}

// ── Lecture (dashboard prestataire) ──
export async function getMySubscriptionOverview(caller: { id: string }) {
  await getDb()
  const billing = await getProviderBillingContext(caller)
  const user = await User.findById(caller.id).lean()
  return {
    billingRegionId: billing.billingRegionId,
    currency: billing.currency,
    canChangeBilling: billing.canChange,
    prestataireSubActive: user?.prestataireSubActive === true,
    prestataireSubStatus: user?.prestataireSubStatus || null,
    prestataireSubEnd: user?.prestataireSubEnd ? new Date(user.prestataireSubEnd).toISOString() : null,
    prestataireSubRail: user?.prestataireSubRail || null,
  }
}

// ── Rail EUR (Stripe Billing) ──
export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: true; alreadyActive: true; status: string }
  | { ok: false; status: number; error: string }

export async function createStripeSubscriptionCheckout(caller: { id: string; email?: string | null }): Promise<CheckoutResult> {
  await getDb()
  const billing = await getProviderBillingContext(caller)
  if (billing.currency !== 'EUR') return { ok: false, status: 409, error: 'wrong_rail_use_fedapay' }

  const user = await User.findById(caller.id).lean()
  if (user?.prestataireSubActive) return { ok: true, alreadyActive: true, status: user.prestataireSubStatus || 'active' }

  if (user?.stripeSubscriptionId) {
    try {
      const existing = await stripe.subscriptions.retrieve(user.stripeSubscriptionId)
      if (stripeSubIsActive(existing)) {
        await mirrorStripeStatus(caller.id, {
          active: true,
          status: existing.status,
          end: stripeSubPeriodEnd(existing),
          stripeSubscriptionId: existing.id,
          stripeCustomerId: typeof existing.customer === 'string' ? existing.customer : existing.customer?.id || null,
        })
        return { ok: true, alreadyActive: true, status: existing.status }
      }
    } catch {
      // abonnement introuvable côté Stripe — on retente une nouvelle session ci-dessous.
    }
  }

  // Verrou anti-double-clic (25 s) — un CronLock générique sert ici de verrou
  // court plutôt que de créer un modèle dédié pour ce seul usage transitoire.
  const lockId = `sub_checkout_${caller.id}`
  try {
    await CronLock.create({ _id: lockId, lockedUntil: new Date(Date.now() + 25_000) })
  } catch {
    return { ok: false, status: 409, error: 'checkout_in_progress' }
  }

  try {
    const plan = SUBSCRIPTION.PRESTATAIRE
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      ...(user?.stripeCustomerId ? { customer: user.stripeCustomerId } : caller.email ? { customer_email: caller.email } : {}),
      client_reference_id: caller.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: plan.currency,
            product_data: { name: plan.label, description: plan.description },
            unit_amount: plan.amountCents,
            recurring: { interval: plan.interval },
          },
        },
      ],
      metadata: { uid: caller.id, type: 'prestataire_subscription' },
      subscription_data: { metadata: { uid: caller.id, type: 'prestataire_subscription' } },
      success_url: `${SITE}/proposer-services?sub=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/proposer-services?sub=cancel`,
      allow_promotion_codes: true,
      locale: 'fr',
    })
    return { ok: true, url: session.url! }
  } finally {
    await CronLock.deleteOne({ _id: lockId })
  }
}

export type ConfirmResult = { ok: true; active: true; status: string } | { ok: false; status: number; error: string }

export async function confirmStripeSubscriptionCheckout(caller: { id: string }, sessionId: string): Promise<ConfirmResult> {
  await getDb()
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  if (session.mode !== 'subscription' || session.payment_status !== 'paid') return { ok: false, status: 409, error: 'subscription_not_active' }
  if (session.metadata?.type !== 'prestataire_subscription') return { ok: false, status: 409, error: 'subscription_not_active' }
  const owner = session.metadata?.uid || session.client_reference_id
  if (String(owner || '') !== String(caller.id)) return { ok: false, status: 403, error: 'forbidden' }

  const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  if (!subId) return { ok: false, status: 409, error: 'subscription_not_active' }
  const subscription = await stripe.subscriptions.retrieve(subId)
  if (!stripeSubIsActive(subscription)) return { ok: false, status: 409, error: 'subscription_not_active' }

  await mirrorStripeStatus(caller.id, {
    active: true,
    status: subscription.status,
    end: stripeSubPeriodEnd(subscription),
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || null,
  })
  return { ok: true, active: true, status: subscription.status }
}

// Webhook checkout.session.completed (mode subscription) — activation immédiate
// au retour, avant même que customer.subscription.* n'affine le statut.
export async function handleStripeSubscriptionCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const uid = session.metadata?.uid || session.client_reference_id
  if (!uid) {
    console.warn('[providerSubscriptions] session abonnement sans uid', session.id)
    return
  }
  await mirrorStripeStatus(String(uid), {
    active: true,
    status: 'active',
    end: null,
    stripeSubscriptionId: (typeof session.subscription === 'string' ? session.subscription : session.subscription?.id) || null,
    stripeCustomerId: (typeof session.customer === 'string' ? session.customer : session.customer?.id) || null,
  })
}

// Webhook customer.subscription.created/updated/deleted — statut fin (source
// de vérité pour tout le cycle de vie après l'activation initiale).
export async function handleStripeSubscriptionEvent(sub: Stripe.Subscription, deleted: boolean): Promise<void> {
  const uid = sub.metadata?.uid
  if (!uid) {
    console.warn('[providerSubscriptions] event abonnement sans uid', sub.id)
    return
  }
  const status = deleted ? 'canceled' : sub.status || 'active'
  const active = !deleted && (status === 'active' || status === 'trialing')
  await mirrorStripeStatus(uid, {
    active,
    status,
    end: stripeSubPeriodEnd(sub),
    stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null,
  })
}

// ── Rail XOF (FedaPay, renouvellement manuel) ──
export type FedapayCheckoutResult = { ok: true; url: string; transactionId: string } | { ok: false; status: number; error: string }

export async function createFedapaySubscriptionCheckout(caller: { id: string; email?: string | null }): Promise<FedapayCheckoutResult> {
  await getDb()
  const billing = await getProviderBillingContext(caller)
  if (billing.currency !== 'XOF') return { ok: false, status: 409, error: 'wrong_rail_use_stripe' }

  const ref = `sub_${caller.id}_${Date.now().toString(36)}`
  let txn
  let payUrl: string | null
  try {
    txn = await createTransaction({
      description: `Abonnement prestataire LIVEINBLACK — ${PROVIDER_SUB.periodDays} jours`,
      amount: PROVIDER_SUB.price,
      callbackUrl: `${SITE}/proposer-services?sub=retour`,
      customer: caller.email ? { email: caller.email } : null,
      metadata: { kind: 'provider_subscription', uid: caller.id },
      reference: ref,
    })
    const tok = await createToken(txn.id)
    payUrl = tok.url
    if (!payUrl) return { ok: false, status: 502, error: 'fedapay_payment_link_missing' }
  } catch (err) {
    console.error('[providerSubscriptions] FedaPay checkout error:', err)
    return { ok: false, status: 502, error: 'fedapay_error' }
  }

  await User.updateOne({ _id: caller.id }, { $set: { pendingFedapaySubTxnId: String(txn.id) } })
  return { ok: true, url: payUrl, transactionId: String(txn.id) }
}

// Webhook FedaPay transaction.approved — prolongation après paiement CONFIRMÉ.
// `uid` est déjà résolu par l'appelant via User.pendingFedapaySubTxnId (voir
// app/api/webhooks/fedapay/route.ts) — jamais depuis les métadonnées brutes
// de l'événement (même prudence que le registre `fedapay_txns` du legacy).
export async function handleFedapaySubscriptionPayment(uid: string, entity: { id: number | string; amount?: number }): Promise<void> {
  await getDb()
  if (!transactionAmountMatches(entity.amount, PROVIDER_SUB.price)) {
    await PaymentAlert.updateOne(
      { key: `fedapay_sub_${entity.id}` },
      { $set: { reason: 'sub_amount_mismatch', sellerUid: uid, details: { paid: entity.amount, expected: PROVIDER_SUB.price } } },
      { upsert: true }
    )
    return
  }

  const profile = await ProviderProfile.findOne({ userId: uid }).lean()
  const user = await User.findById(uid).lean()
  const priorWindow: SubWindow = profile
    ? { subscriptionStartedAt: profile.subscriptionStartedAt, subscriptionExpiresAt: profile.subscriptionExpiresAt }
    : { subscriptionExpiresAt: user?.prestataireSubEnd || null }

  const renewal = computeRenewal(priorWindow, Date.now())
  await mirrorFedapayStatus(uid, renewal)
}

// ── Cron quotidien de rappels (rail XOF uniquement — Stripe se gère lui-même) ──
const SUB_REMINDER_LOCK_ID = 'provider_sub_reminders'
const SUB_REMINDER_LOCK_TTL_MS = 15 * 60 * 1000

// `subReminders.sent` est un Mongoose Map<String,Number> — `.lean()` renvoie
// tantôt un objet brut, tantôt une vraie Map selon le chemin de lecture (même
// prudence que momosToRecord dans organizerPayoutMomos.ts).
function sentToRecord(sent: unknown): Record<string, number> {
  if (sent instanceof Map) return Object.fromEntries(sent)
  return (sent as Record<string, number>) ?? {}
}

export async function runSubscriptionReminderCron(): Promise<{ scanned: number; reminders: number; emails: number; hidden: number }> {
  await getDb()
  const now = Date.now()

  let gotLock = false
  try {
    await CronLock.create({ _id: SUB_REMINDER_LOCK_ID, lockedUntil: new Date(now + SUB_REMINDER_LOCK_TTL_MS) })
    gotLock = true
  } catch {
    const res = await CronLock.updateOne(
      { _id: SUB_REMINDER_LOCK_ID, lockedUntil: { $lt: new Date(now) } },
      { $set: { lockedUntil: new Date(now + SUB_REMINDER_LOCK_TTL_MS) } }
    )
    gotLock = res.modifiedCount === 1
  }
  if (!gotLock) return { scanned: 0, reminders: 0, emails: 0, hidden: 0 }

  try {
    const profiles = await ProviderProfile.find({ subscriptionExpiresAt: { $ne: null } }).lean()
    let scanned = 0
    let reminders = 0
    let emails = 0
    let hidden = 0

    for (const profile of profiles) {
      scanned++
      const cycle = cycleKey(profile)
      const prevSent = profile.subReminders?.cycle === cycle ? sentToRecord(profile.subReminders.sent) : {}
      const due = dueReminders(profile, now, prevSent)
      const status = deriveSubStatus(profile, now)

      const patch: Record<string, unknown> = {}
      let changed = false

      if (status === 'expired' && profile.subscriptionActive === true) {
        patch.subscriptionActive = false
        patch.subscriptionStatus = status
        changed = true
        await User.updateOne({ _id: profile.userId }, { $set: { prestataireSubActive: false, prestataireSubStatus: 'expired' } })
      } else if (profile.subscriptionStatus !== status) {
        patch.subscriptionStatus = status
        changed = true
      }

      if (due.length) {
        const sent: Record<string, number> = { ...prevSent }
        // Contrairement au legacy (qui réserve l'email à 4 des 6 jalons et
        // s'appuie sur le in-app pour les autres), cette migration n'a pas
        // encore de centre de notifications in-app (#89+) — l'email est le
        // SEUL canal, donc chaque jalon dû est envoyé pour ne pas en perdre.
        const user = await User.findById(profile.userId).select('email').lean()
        for (const key of due) {
          if (user?.email) {
            const result = await sendEmail(user.email, subscriptionReminderEmail(key, `${SITE}/proposer-services`))
            if (result.ok) emails++
          }
          sent[key] = now
          reminders++
          if (key === 'hidden') hidden++
        }
        patch.subReminders = { cycle, sent }
        changed = true
      }

      if (changed) await ProviderProfile.updateOne({ _id: profile._id }, { $set: patch })
    }

    return { scanned, reminders, emails, hidden }
  } finally {
    await CronLock.deleteOne({ _id: SUB_REMINDER_LOCK_ID })
  }
}
