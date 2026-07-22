// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/organizerPayouts.ts
// (#7 phase organisateur — port de api/connect.js + PayoutPanel.jsx, côté
// Stripe Connect EUR uniquement). Stripe est mocké : aucune vraie clé de test
// n'est configurée dans cet environnement (même convention que Cloudinary
// ailleurs dans cette suite).
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'

const accountsCreate = vi.fn()
const accountLinksCreate = vi.fn()

vi.mock('../stripeClient', () => ({
  default: {
    accounts: { create: (...args: unknown[]) => accountsCreate(...args) },
    accountLinks: { create: (...args: unknown[]) => accountLinksCreate(...args) },
  },
}))

import { getPayoutStatus, startStripeConnectOnboarding, requestManualPayout } from '../organizerPayouts'
import User from '../../models/User'
import Application from '../../models/Application'
import SellerBalance from '../../models/SellerBalance'
import PayoutRequest from '../../models/PayoutRequest'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

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
  if (!RUN_INTEGRATION) return
  await User.deleteMany({})
  await Application.deleteMany({})
  await SellerBalance.deleteMany({})
  await PayoutRequest.deleteMany({})
  accountsCreate.mockReset()
  accountLinksCreate.mockReset()
})

async function seedUser(overrides: Partial<Record<string, unknown>> = {}) {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId().toString()}@test.com`,
    passwordHash: 'x',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    ...overrides,
  })
  return String(user._id)
}

describeIntegration('organizerPayouts (intégration, vraie base) — Stripe Connect + statut (#7)', () => {
  it('renvoie mode "none" pour un compte sans pays ni compte Stripe connu', async () => {
    const userId = await seedUser()
    const result = await getPayoutStatus({ id: userId })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.view.mode).toBe('none')
    expect(result.view.connected).toBe(false)
    expect(result.view.amountDueCents).toBe(0)
  })

  it('crée un compte Stripe Express pour un pays éligible, sans jamais écrire chargesEnabled', async () => {
    const userId = await seedUser()
    await Application.create({ userId, type: 'organisateur', status: 'approved', formData: { pays: 'France' } })
    accountsCreate.mockResolvedValue({ id: 'acct_123' })
    accountLinksCreate.mockResolvedValue({ url: 'https://connect.stripe.test/onboarding/acct_123' })

    const result = await startStripeConnectOnboarding({ id: userId }, {})
    expect(result.ok).toBe(true)
    if (!result.ok || 'manual' in result) return
    expect(result.url).toBe('https://connect.stripe.test/onboarding/acct_123')
    expect(accountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'express', country: 'FR', metadata: { uid: userId }, business_type: 'individual' })
    )
    expect(accountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh_url: 'https://liveinblack.com/my-events?connect=refresh',
        return_url: 'https://liveinblack.com/my-events?connect=done',
      })
    )

    const user = await User.findById(userId).lean()
    expect(user?.stripeAccountId).toBe('acct_123')
    expect(user?.stripeCountry).toBe('FR')
    // Jamais écrit ici — réservé au webhook account.updated.
    expect(user?.stripeChargesEnabled).toBe(false)

    const status = await getPayoutStatus({ id: userId })
    expect(status.ok).toBe(true)
    if (status.ok) expect(status.view.mode).toBe('connect')
  })

  it('bascule en mode manuel pour un pays hors zone Stripe, sans jamais appeler Stripe', async () => {
    const userId = await seedUser()
    await Application.create({ userId, type: 'organisateur', status: 'approved', formData: { pays: 'Togo' } })

    const result = await startStripeConnectOnboarding({ id: userId }, {})
    expect(result.ok).toBe(true)
    if (!result.ok || !('manual' in result)) return
    expect(result.manual).toBe(true)
    expect(result.country).toBe('TG')
    expect(accountsCreate).not.toHaveBeenCalled()

    const user = await User.findById(userId).lean()
    expect(user?.stripeAccountId).toBeFalsy()
    expect(user?.stripeCountry).toBe('TG')

    const status = await getPayoutStatus({ id: userId })
    expect(status.ok).toBe(true)
    if (status.ok) expect(status.view.mode).toBe('manual')
  })

  it("réutilise le compte Stripe existant pour reprendre l'onboarding (nouveau lien, pas un second compte)", async () => {
    const userId = await seedUser({ stripeAccountId: 'acct_existing', stripeCountry: 'FR' })
    accountLinksCreate.mockResolvedValue({ url: 'https://connect.stripe.test/resume' })

    const result = await startStripeConnectOnboarding({ id: userId }, { returnPath: '/organizer-studio' })
    expect(result.ok).toBe(true)
    if (!result.ok || 'manual' in result) return
    expect(result.url).toBe('https://connect.stripe.test/resume')
    expect(accountsCreate).not.toHaveBeenCalled()
    expect(accountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        account: 'acct_existing',
        refresh_url: 'https://liveinblack.com/organizer-studio?connect=refresh',
        return_url: 'https://liveinblack.com/organizer-studio?connect=done',
      })
    )
  })

  it('refuse une demande de reversement manuel si rien n’est dû', async () => {
    const userId = await seedUser()
    const result = await requestManualPayout({ id: userId })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('nothing_due')
  })

  it('crée une demande de reversement à partir du solde AUTORITATIF (jamais un montant fourni par le client)', async () => {
    const userId = await seedUser()
    await SellerBalance.create({ sellerUid: userId, amountDueCents: 5000, amountDueXOF: 0 })

    const result = await requestManualPayout({ id: userId })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.amountDueCents).toBe(5000)

    const requests = await PayoutRequest.find({ sellerUid: userId }).lean()
    expect(requests).toHaveLength(1)
    expect(requests[0].status).toBe('pending')
    expect(requests[0].amountDueCents).toBe(5000)
  })

  it('refuse une seconde demande tant qu’une demande est déjà en attente', async () => {
    const userId = await seedUser()
    await SellerBalance.create({ sellerUid: userId, amountDueCents: 5000, amountDueXOF: 0 })

    const first = await requestManualPayout({ id: userId })
    expect(first.ok).toBe(true)

    const second = await requestManualPayout({ id: userId })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error).toBe('request_already_pending')
  })
})
