// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/providerSubscriptions.ts
// — abonnement prestataire, rail EUR (Stripe Billing, récurrent) + rail XOF
// (FedaPay, renouvellement manuel). Stripe et FedaPay sont mockés (aucune
// vraie clé de test dans cet environnement, même convention que
// organizerPayouts.integration.test.ts) ; l'envoi d'email est mocké pour
// vérifier le comptage sans dépendre de RESEND_API_KEY.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'

const checkoutSessionsCreate = vi.fn()
const checkoutSessionsRetrieve = vi.fn()
const subscriptionsRetrieve = vi.fn()

vi.mock('../stripeClient', () => ({
  default: {
    checkout: { sessions: { create: (...a: unknown[]) => checkoutSessionsCreate(...a), retrieve: (...a: unknown[]) => checkoutSessionsRetrieve(...a) } },
    subscriptions: { retrieve: (...a: unknown[]) => subscriptionsRetrieve(...a) },
  },
}))

const createTransaction = vi.fn()
const createToken = vi.fn()

vi.mock('../fedapayClient', () => ({
  createTransaction: (...a: unknown[]) => createTransaction(...a),
  createToken: (...a: unknown[]) => createToken(...a),
  transactionAmountMatches: (paid: unknown, expected: unknown) => {
    const p = Math.round(Number(paid) || 0)
    const e = Math.round(Number(expected) || 0)
    return e > 0 && p === e
  },
}))

const sendEmail = vi.fn()
vi.mock('../email', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }))

import {
  getMySubscriptionOverview,
  createStripeSubscriptionCheckout,
  confirmStripeSubscriptionCheckout,
  handleStripeSubscriptionCheckoutCompleted,
  handleStripeSubscriptionEvent,
  createFedapaySubscriptionCheckout,
  handleFedapaySubscriptionPayment,
  runSubscriptionReminderCron,
} from '../providerSubscriptions'
import { PROVIDER_SUB } from '../../shared/providerSubscription'
import User from '../../models/User'
import ProviderProfile from '../../models/ProviderProfile'
import PaymentAlert from '../../models/PaymentAlert'
import CronLock from '../../models/CronLock'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''
const DAY = 24 * 60 * 60 * 1000

beforeAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connect(TEST_URI)
}, 20000)

afterAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

beforeEach(async () => {
  vi.clearAllMocks()
  if (!RUN_INTEGRATION) return
  await User.deleteMany({})
  await ProviderProfile.deleteMany({})
  await PaymentAlert.deleteMany({})
  await CronLock.deleteMany({})
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  return User.create({
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: 'x',
    firstName: 'Ada',
    lastName: 'Lovelace',
    roles: ['prestataire'],
    activeRole: 'prestataire',
    providerBillingRegionId: 'france',
    ...overrides,
  })
}

describeIntegration('getMySubscriptionOverview', () => {
  it('reflète un compte sans abonnement', async () => {
    const user = await seedUser()
    const overview = await getMySubscriptionOverview({ id: user.id })
    expect(overview.currency).toBe('EUR')
    expect(overview.prestataireSubActive).toBe(false)
    expect(overview.prestataireSubRail).toBeNull()
  })
})

describeIntegration('createStripeSubscriptionCheckout (rail EUR)', () => {
  it('refuse si le pays de facturation est XOF', async () => {
    const user = await seedUser({ providerBillingRegionId: 'togo' })
    const result = await createStripeSubscriptionCheckout({ id: user.id, email: user.email })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('wrong_rail_use_fedapay')
  })

  it('renvoie alreadyActive si déjà abonné', async () => {
    const user = await seedUser({ prestataireSubActive: true, prestataireSubStatus: 'active' })
    const result = await createStripeSubscriptionCheckout({ id: user.id, email: user.email })
    expect(result.ok).toBe(true)
    if (!result.ok || !('alreadyActive' in result)) throw new Error('expected alreadyActive')
    expect(result.status).toBe('active')
    expect(checkoutSessionsCreate).not.toHaveBeenCalled()
  })

  it('crée une session Checkout et ne mute pas prestataireSubActive avant paiement', async () => {
    const user = await seedUser()
    checkoutSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session_abc' })

    const result = await createStripeSubscriptionCheckout({ id: user.id, email: user.email })
    expect(result.ok).toBe(true)
    if (!result.ok || 'alreadyActive' in result) throw new Error('expected url result')
    expect(result.url).toBe('https://checkout.stripe.test/session_abc')

    const args = checkoutSessionsCreate.mock.calls[0][0]
    expect(args.mode).toBe('subscription')
    expect(args.metadata).toEqual({ uid: user.id, type: 'prestataire_subscription' })

    const fresh = await User.findById(user.id).lean()
    expect(fresh?.prestataireSubActive).toBe(false)
    // Le verrou anti-double-clic est bien libéré après l'appel.
    expect(await CronLock.findById(`sub_checkout_${user.id}`).lean()).toBeNull()
  })

  it('mirror actif si un stripeSubscriptionId existant est toujours actif côté Stripe', async () => {
    const user = await seedUser({ stripeSubscriptionId: 'sub_existing' })
    subscriptionsRetrieve.mockResolvedValue({ id: 'sub_existing', status: 'active', customer: 'cus_1', items: { data: [{ current_period_end: 1893456000 }] } })

    const result = await createStripeSubscriptionCheckout({ id: user.id, email: user.email })
    expect(result.ok).toBe(true)
    if (!result.ok || !('alreadyActive' in result)) throw new Error('expected alreadyActive')
    expect(checkoutSessionsCreate).not.toHaveBeenCalled()

    const fresh = await User.findById(user.id).lean()
    expect(fresh?.prestataireSubActive).toBe(true)
    expect(fresh?.prestataireSubStatus).toBe('active')
  })
})

describeIntegration('confirmStripeSubscriptionCheckout', () => {
  it('refuse si le propriétaire de la session ne correspond pas', async () => {
    const user = await seedUser()
    checkoutSessionsRetrieve.mockResolvedValue({
      mode: 'subscription', payment_status: 'paid',
      metadata: { type: 'prestataire_subscription', uid: 'someone-else' },
      client_reference_id: 'someone-else', subscription: 'sub_1',
    })
    const result = await confirmStripeSubscriptionCheckout({ id: user.id }, 'cs_test_1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('forbidden')
  })

  it('active l’abonnement quand la session est payée et la subscription active', async () => {
    const user = await seedUser()
    checkoutSessionsRetrieve.mockResolvedValue({
      mode: 'subscription', payment_status: 'paid',
      metadata: { type: 'prestataire_subscription', uid: user.id },
      client_reference_id: user.id, subscription: 'sub_1', customer: 'cus_1',
    })
    subscriptionsRetrieve.mockResolvedValue({ id: 'sub_1', status: 'active', customer: 'cus_1', items: { data: [{ current_period_end: 1893456000 }] } })

    const result = await confirmStripeSubscriptionCheckout({ id: user.id }, 'cs_test_1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.status).toBe('active')

    const fresh = await User.findById(user.id).lean()
    expect(fresh?.prestataireSubActive).toBe(true)
    expect(fresh?.prestataireSubRail).toBe('stripe')
    expect(fresh?.stripeSubscriptionId).toBe('sub_1')
  })
})

describeIntegration('webhook Stripe — checkout.session.completed (abonnement)', () => {
  it('active immédiatement au retour de checkout, avant customer.subscription.*', async () => {
    const user = await seedUser()
    await handleStripeSubscriptionCheckoutCompleted({
      id: 'cs_1', metadata: { uid: user.id, type: 'prestataire_subscription' },
      client_reference_id: user.id, subscription: 'sub_1', customer: 'cus_1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const fresh = await User.findById(user.id).lean()
    expect(fresh?.prestataireSubActive).toBe(true)
    expect(fresh?.prestataireSubStatus).toBe('active')
    expect(fresh?.stripeSubscriptionId).toBe('sub_1')
  })
})

describeIntegration('webhook Stripe — customer.subscription.*', () => {
  it('customer.subscription.deleted désactive et mirrore ProviderProfile si présent', async () => {
    const user = await seedUser({ prestataireSubActive: true, prestataireSubRail: 'stripe', stripeSubscriptionId: 'sub_1' })
    await ProviderProfile.create({ userId: user.id, name: 'DJ Test', subscriptionActive: true, subscriptionStatus: 'active' })

    await handleStripeSubscriptionEvent(
      { id: 'sub_1', status: 'canceled', customer: 'cus_1', metadata: { uid: user.id }, items: { data: [] } } as never,
      true
    )

    const freshUser = await User.findById(user.id).lean()
    expect(freshUser?.prestataireSubActive).toBe(false)
    expect(freshUser?.prestataireSubStatus).toBe('canceled')

    const freshProfile = await ProviderProfile.findOne({ userId: user.id }).lean()
    expect(freshProfile?.subscriptionActive).toBe(false)
    expect(freshProfile?.subscriptionStatus).toBe('expired')
  })
})

describeIntegration('createFedapaySubscriptionCheckout (rail XOF)', () => {
  it('refuse si le pays de facturation est EUR', async () => {
    const user = await seedUser({ providerBillingRegionId: 'france' })
    const result = await createFedapaySubscriptionCheckout({ id: user.id, email: user.email })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('wrong_rail_use_stripe')
  })

  it('crée une transaction FedaPay et pose le registre pendingFedapaySubTxnId', async () => {
    const user = await seedUser({ providerBillingRegionId: 'togo' })
    createTransaction.mockResolvedValue({ id: 999, status: 'pending', amount: PROVIDER_SUB.price })
    createToken.mockResolvedValue({ url: 'https://fedapay.test/pay/999', token: 'tok' })

    const result = await createFedapaySubscriptionCheckout({ id: user.id, email: user.email })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.url).toBe('https://fedapay.test/pay/999')
    expect(result.transactionId).toBe('999')

    const fresh = await User.findById(user.id).lean()
    expect(fresh?.pendingFedapaySubTxnId).toBe('999')
  })
})

describeIntegration('handleFedapaySubscriptionPayment', () => {
  it('crée une PaymentAlert et ne mirrore rien si le montant ne correspond pas', async () => {
    const user = await seedUser({ providerBillingRegionId: 'togo', pendingFedapaySubTxnId: '111' })
    await handleFedapaySubscriptionPayment(user.id, { id: 111, amount: 1 })

    const fresh = await User.findById(user.id).lean()
    expect(fresh?.prestataireSubActive).toBe(false)
    const alert = await PaymentAlert.findOne({ key: 'fedapay_sub_111' }).lean()
    expect(alert?.reason).toBe('sub_amount_mismatch')
  })

  it("prolonge l'abonnement de PROVIDER_SUB.periodDays jours pour un premier paiement (pas de ProviderProfile)", async () => {
    const user = await seedUser({ providerBillingRegionId: 'togo', pendingFedapaySubTxnId: '112' })
    const before = Date.now()
    await handleFedapaySubscriptionPayment(user.id, { id: 112, amount: PROVIDER_SUB.price })

    const fresh = await User.findById(user.id).lean()
    expect(fresh?.prestataireSubActive).toBe(true)
    expect(fresh?.prestataireSubRail).toBe('fedapay')
    expect(fresh?.pendingFedapaySubTxnId).toBeNull()
    expect(new Date(fresh!.prestataireSubEnd!).getTime()).toBeGreaterThan(before + (PROVIDER_SUB.periodDays - 1) * DAY)
  })

  it('prolonge depuis l’expiration actuelle (pas depuis maintenant) pour un renouvellement anticipé', async () => {
    const user = await seedUser({ providerBillingRegionId: 'togo', pendingFedapaySubTxnId: '113' })
    const futureExpiry = Date.now() + 10 * DAY
    await ProviderProfile.create({
      userId: user.id, name: 'DJ Test', subscriptionActive: true,
      subscriptionStartedAt: new Date(Date.now() - 20 * DAY),
      subscriptionExpiresAt: new Date(futureExpiry),
      gracePeriodEndsAt: new Date(futureExpiry + PROVIDER_SUB.graceDays * DAY),
      subscriptionStatus: 'active',
    })

    await handleFedapaySubscriptionPayment(user.id, { id: 113, amount: PROVIDER_SUB.price })

    const freshProfile = await ProviderProfile.findOne({ userId: user.id }).lean()
    const expectedExpiry = futureExpiry + PROVIDER_SUB.periodDays * DAY
    expect(freshProfile?.subscriptionExpiresAt?.getTime()).toBeCloseTo(expectedExpiry, -2)
  })
})

describeIntegration('runSubscriptionReminderCron', () => {
  it('envoie les rappels dus, masque les profils expirés et ne renvoie pas deux fois le même jalon', async () => {
    sendEmail.mockResolvedValue({ ok: true })

    const soonUser = await seedUser({ providerBillingRegionId: 'togo' })
    await ProviderProfile.create({
      userId: soonUser.id, name: 'Bientôt expiré', subscriptionActive: true,
      subscriptionExpiresAt: new Date(Date.now() + 2 * DAY),
      gracePeriodEndsAt: new Date(Date.now() + 5 * DAY),
      subscriptionStatus: 'active',
    })

    const expiredUser = await seedUser({ providerBillingRegionId: 'togo', prestataireSubActive: true })
    await ProviderProfile.create({
      userId: expiredUser.id, name: 'Expiré', subscriptionActive: true,
      subscriptionExpiresAt: new Date(Date.now() - 10 * DAY),
      gracePeriodEndsAt: new Date(Date.now() - 7 * DAY),
      subscriptionStatus: 'grace',
    })

    const result = await runSubscriptionReminderCron()
    expect(result.scanned).toBe(2)
    expect(result.hidden).toBe(1)
    expect(result.reminders).toBeGreaterThanOrEqual(2)
    expect(sendEmail).toHaveBeenCalled()

    const freshExpired = await ProviderProfile.findOne({ userId: expiredUser.id }).lean()
    expect(freshExpired?.subscriptionActive).toBe(false)
    const freshExpiredUser = await User.findById(expiredUser.id).lean()
    expect(freshExpiredUser?.prestataireSubActive).toBe(false)

    // Deuxième passage le même jour : les jalons déjà envoyés ce cycle ne repartent pas.
    sendEmail.mockClear()
    const second = await runSubscriptionReminderCron()
    expect(second.reminders).toBe(0)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
