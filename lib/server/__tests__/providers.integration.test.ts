// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/providers.ts —
// listPublicProviders (filtrage annuaire public : abonnement actif +
// "non-fantôme") et getProviderByUserId (page publique, visibilité par
// viewer). isProviderVisible est déjà couverte en unitaire pur dans
// providers.test.ts — ce fichier couvre isNonGhost (privée, non exportée)
// indirectement via listPublicProviders, et le comportement de bout en bout
// contre une vraie base.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { listPublicProviders, getProviderByUserId } from '../provider/providers'
import ProviderProfile from '@/lib/models/ProviderProfile'

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
  await ProviderProfile.deleteMany({})
})

describeIntegration('listPublicProviders (intégration, vraie base) — annuaire public prestataires', () => {
  it('exclut un profil sans abonnement actif, même avec du contenu complet', async () => {
    await ProviderProfile.create({
      userId: 'prov-1', name: 'DJ Complet', subscriptionActive: false,
      photoUrl: 'https://res.cloudinary.test/p.jpg', city: 'Lomé',
    })
    const list = await listPublicProviders()
    expect(list).toHaveLength(0)
  })

  it('exclut un profil "fantôme" (abonnement actif mais aucun contenu ni catalogue visible)', async () => {
    await ProviderProfile.create({ userId: 'prov-2', name: 'Profil Vide', subscriptionActive: true })
    const list = await listPublicProviders()
    expect(list).toHaveLength(0)
  })

  it('inclut un profil actif avec au moins un basique renseigné (photo/description/ville/zone)', async () => {
    await ProviderProfile.create({
      userId: 'prov-3', name: 'DJ Actif', subscriptionActive: true, city: 'Lomé',
    })
    const list = await listPublicProviders()
    expect(list.map((p) => p.userId)).toEqual(['prov-3'])
  })

  it('inclut un profil actif sans aucun basique MAIS avec au moins un item de catalogue visible', async () => {
    await ProviderProfile.create({
      userId: 'prov-4', name: 'Sans description', subscriptionActive: true,
      catalog: [{ id: 'c1', name: 'Set DJ', available: true }],
    })
    const list = await listPublicProviders()
    expect(list.map((p) => p.userId)).toEqual(['prov-4'])
  })

  it('exclut un profil actif dont le seul item de catalogue est indisponible (available:false)', async () => {
    await ProviderProfile.create({
      userId: 'prov-5', name: 'Catalogue caché', subscriptionActive: true,
      catalog: [{ id: 'c1', name: 'Set DJ', available: false }],
    })
    const list = await listPublicProviders()
    expect(list).toHaveLength(0)
  })
})

describeIntegration('getProviderByUserId (intégration, vraie base) — visibilité par viewer', () => {
  it('renvoie null si le profil n’existe pas', async () => {
    expect(await getProviderByUserId('inconnu')).toBeNull()
  })

  it('cache un profil sans abonnement actif à un visiteur anonyme', async () => {
    await ProviderProfile.create({ userId: 'prov-6', name: 'Inactif', subscriptionActive: false })
    expect(await getProviderByUserId('prov-6')).toBeNull()
  })

  it('le propriétaire voit toujours sa propre page, même sans abonnement actif', async () => {
    await ProviderProfile.create({ userId: 'prov-7', name: 'Inactif', subscriptionActive: false })
    const result = await getProviderByUserId('prov-7', { id: 'prov-7' })
    expect(result?.userId).toBe('prov-7')
  })

  it('un agent voit toujours n’importe quelle page, même sans abonnement actif', async () => {
    await ProviderProfile.create({ userId: 'prov-8', name: 'Inactif', subscriptionActive: false })
    const result = await getProviderByUserId('prov-8', { activeRole: 'agent', id: 'agent-1' })
    expect(result?.userId).toBe('prov-8')
  })

  it('un autre utilisateur connecté (ni agent ni propriétaire) ne voit pas un profil inactif', async () => {
    await ProviderProfile.create({ userId: 'prov-9', name: 'Inactif', subscriptionActive: false })
    const result = await getProviderByUserId('prov-9', { activeRole: 'client', id: 'someone-else' })
    expect(result).toBeNull()
  })
})
