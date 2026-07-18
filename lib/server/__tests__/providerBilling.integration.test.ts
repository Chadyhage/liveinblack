// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/providerBilling.ts
// — remplace api/provider-billing-region.js. Pays de facturation prestataire
// (rail EUR/Stripe vs XOF/FedaPay), un seul champ sur User (pas de collection
// séparée comme le legacy `provider_billing/{uid}`).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { getProviderBillingContext, setProviderBillingRegion } from '../providerBilling'
import User from '../../models/User'
import Application from '../../models/Application'

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
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  return User.create({
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash: 'x',
    firstName: 'Ada',
    lastName: 'Lovelace',
    roles: ['prestataire'],
    activeRole: 'prestataire',
    ...overrides,
  })
}

describeIntegration('getProviderBillingContext', () => {
  it("défaut à 'france'/EUR si aucun pays de facturation ni dossier prestataire", async () => {
    const user = await seedUser()
    const context = await getProviderBillingContext({ id: user.id })
    expect(context).toEqual({ billingRegionId: 'france', currency: 'EUR', canChange: true })

    const fresh = await User.findById(user.id).lean()
    expect(fresh?.providerBillingRegionId).toBe('france')
  })

  it('dérive le pays de facturation depuis le dernier dossier prestataire si présent', async () => {
    const user = await seedUser()
    await Application.create({ userId: user.id, type: 'prestataire', status: 'submitted', formData: { pays: 'Togo' } })

    const context = await getProviderBillingContext({ id: user.id })
    expect(context.billingRegionId).toBe('togo')
    expect(context.currency).toBe('XOF')
  })

  it('respecte un pays de facturation déjà posé sans le re-dériver', async () => {
    const user = await seedUser({ providerBillingRegionId: 'senegal' })
    await Application.create({ userId: user.id, type: 'prestataire', status: 'submitted', formData: { pays: 'Togo' } })

    const context = await getProviderBillingContext({ id: user.id })
    expect(context.billingRegionId).toBe('senegal')
  })

  it('canChange=false si un abonnement prestataire est actif', async () => {
    const user = await seedUser({ prestataireSubActive: true, providerBillingRegionId: 'france' })
    const context = await getProviderBillingContext({ id: user.id })
    expect(context.canChange).toBe(false)
  })
})

describeIntegration('setProviderBillingRegion', () => {
  it('change le pays de facturation quand aucun abonnement actif', async () => {
    const user = await seedUser({ providerBillingRegionId: 'france' })
    const result = await setProviderBillingRegion({ id: user.id }, 'togo')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.context).toEqual({ billingRegionId: 'togo', currency: 'XOF', canChange: true })

    const fresh = await User.findById(user.id).lean()
    expect(fresh?.providerBillingRegionId).toBe('togo')
  })

  it('refuse un pays de facturation invalide', async () => {
    const user = await seedUser()
    const result = await setProviderBillingRegion({ id: user.id }, 'atlantide')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('invalid_billing_region')
  })

  it('refuse un changement de pays tant que l’abonnement est actif', async () => {
    const user = await seedUser({ providerBillingRegionId: 'france', prestataireSubActive: true })
    const result = await setProviderBillingRegion({ id: user.id }, 'togo')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('subscription_active')

    const fresh = await User.findById(user.id).lean()
    expect(fresh?.providerBillingRegionId).toBe('france')
  })

  it('autorise de re-poser le MÊME pays même abonnement actif (aucun changement réel)', async () => {
    const user = await seedUser({ providerBillingRegionId: 'france', prestataireSubActive: true })
    const result = await setProviderBillingRegion({ id: user.id }, 'france')
    expect(result.ok).toBe(true)
  })
})
