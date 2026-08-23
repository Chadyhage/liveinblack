// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/providerProfile.ts
// (#8 phase prestataire — port ÉCRITURE de ProposerServicesPage.jsx, profil +
// catalogue). Cloudinary est mocké (même convention que
// organizerProfile.integration.test.ts).
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'

vi.mock('../cloudinary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cloudinary')>()),
  uploadDataUri: vi.fn(async (dataUri: string, folder: string) => ({ ok: true, url: `https://res.cloudinary.test/${folder}/mock.jpg` })),
}))

// Session mockée pour les tests de route ci-dessous (canProposeServices lit
// activeRole/status/prestStatus depuis session.user) — voir mockSessionUser.
let mockSessionUser: { id: string; activeRole: string; status: string; prestStatus?: string } | null = null
vi.mock('@/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}))

import {
  getOrCreateMyProviderProfile,
  updateProviderProfile,
  uploadProviderProfileMedia,
  addCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  addCatalogItemMedia,
  removeCatalogItemMedia,
} from '../provider/providerProfile'
import ProviderProfile from '@/lib/models/ProviderProfile'
import Application from '@/lib/models/Application'
import User from '@/lib/models/User'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

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
  await Application.deleteMany({})
  await User.deleteMany({})
  mockSessionUser = null
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId().toString()}@test.com`,
    passwordHash: 'x',
    firstName: 'Ada',
    lastName: 'Lovelace',
    roles: ['prestataire'],
    activeRole: 'prestataire',
    providerBillingRegionId: 'france',
    ...overrides,
  })
  return String(user._id)
}

describeIntegration('providerProfile (intégration, vraie base) — profil + catalogue (#8)', () => {
  it('crée un profil brouillon au premier accès, à partir du dossier de candidature', async () => {
    const userId = await seedUser()
    await Application.create({
      userId,
      type: 'prestataire',
      status: 'approved',
      formData: { nomCommercial: 'DJ Kayo', ville: 'Lomé', pays: 'Togo', description: 'DJ événementiel.', prestataireTypes: ['artiste'] },
    })

    const result = await getOrCreateMyProviderProfile({ id: userId })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.name).toBe('DJ Kayo')
    expect(result.profile.city).toBe('Lomé')
    expect(result.profile.prestataireTypes).toEqual(['artiste'])
    expect(result.profile.prestataireType).toBe('artiste')
    expect(result.profile.subscriptionActive).toBe(false)
    // billing region déjà 'france' sur le compte → devise EUR dérivée pour le catalogue.
    expect(result.profile.catalogCurrency).toBe('EUR')
  })

  it('retombe sur le prénom/nom du compte si aucun dossier prestataire', async () => {
    const userId = await seedUser()
    const result = await getOrCreateMyProviderProfile({ id: userId })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.name).toBe('Ada Lovelace')
  })

  it('ne recrée pas de profil au second appel (idempotent)', async () => {
    const userId = await seedUser()
    const first = await getOrCreateMyProviderProfile({ id: userId })
    const second = await getOrCreateMyProviderProfile({ id: userId })
    expect(first.ok && second.ok && first.profile.userId === second.profile.userId).toBe(true)
    expect(await ProviderProfile.countDocuments({ userId })).toBe(1)
  })
})

describeIntegration('updateProviderProfile', () => {
  it('refuse un nom vide', async () => {
    const userId = await seedUser()
    await getOrCreateMyProviderProfile({ id: userId })
    const result = await updateProviderProfile({ id: userId }, { name: '   ' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('name_required')
  })

  it('garde regionId dans zonesIntervention même si absent de la sélection', async () => {
    const userId = await seedUser()
    await Application.create({ userId, type: 'prestataire', status: 'approved', formData: { pays: 'Togo' } })
    await getOrCreateMyProviderProfile({ id: userId })

    const result = await updateProviderProfile({ id: userId }, { zonesIntervention: ['senegal'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.zonesIntervention).toEqual(expect.arrayContaining(['togo', 'senegal']))
  })

  it('change regionId ("Pays de base") et resynchronise zonesIntervention avec le NOUVEAU pays', async () => {
    const userId = await seedUser()
    await Application.create({ userId, type: 'prestataire', status: 'approved', formData: { pays: 'Togo' } })
    await getOrCreateMyProviderProfile({ id: userId })

    const result = await updateProviderProfile({ id: userId }, { regionId: 'senegal', zonesIntervention: ['senegal'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.regionId).toBe('senegal')
    expect(result.profile.country).toBe('Sénégal')
    expect(result.profile.zonesIntervention).toEqual(['senegal'])
  })

  it('double-écrit website et socialLinks.website en synchronisation (compat legacy)', async () => {
    const userId = await seedUser()
    await getOrCreateMyProviderProfile({ id: userId })

    const result = await updateProviderProfile({ id: userId }, { website: 'https://djkayo.com' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.website).toBe('https://djkayo.com')
    expect(result.profile.socialLinks.website).toBe('https://djkayo.com')
  })

  it('normalise les handles sociaux en URLs cliquables et resynchronise website depuis socialLinks.website', async () => {
    const userId = await seedUser()
    await getOrCreateMyProviderProfile({ id: userId })

    const result = await updateProviderProfile({
      id: userId,
      socialLinks: {
        instagram: '@djkayo',
        website: 'djkayo.com',
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.socialLinks.instagram).toBe('https://instagram.com/djkayo')
    expect(result.profile.socialLinks.website).toBe('https://djkayo.com')
    expect(result.profile.website).toBe('https://djkayo.com')
  })

  it('collapse les zones sur "international" quand ce choix est présent', async () => {
    const userId = await seedUser()
    await Application.create({ userId, type: 'prestataire', status: 'approved', formData: { pays: 'Togo' } })
    await getOrCreateMyProviderProfile({ id: userId })

    const result = await updateProviderProfile({ id: userId }, { zonesIntervention: ['senegal', 'international'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.zonesIntervention).toEqual(['international'])
  })

  it('recalcule prestataireType (primaire) quand prestataireTypes change', async () => {
    const userId = await seedUser()
    await getOrCreateMyProviderProfile({ id: userId })

    const result = await updateProviderProfile({ id: userId }, { prestataireTypes: ['salle', 'materiel'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.prestataireType).toBe('salle')
    expect(result.profile.prestataireTypes).toEqual(['salle', 'materiel'])
  })
})

describeIntegration('uploadProviderProfileMedia', () => {
  it('pose photoUrl pour avatar et coverUrl pour cover', async () => {
    const userId = await seedUser()
    await getOrCreateMyProviderProfile({ id: userId })

    const avatar = await uploadProviderProfileMedia({ id: userId }, 'avatar', TINY_PNG)
    expect(avatar.ok).toBe(true)
    if (avatar.ok) expect(avatar.profile.photoUrl).toContain('https://res.cloudinary.test')

    const cover = await uploadProviderProfileMedia({ id: userId }, 'cover', TINY_PNG)
    expect(cover.ok).toBe(true)
    if (cover.ok) expect(cover.profile.coverUrl).toContain('https://res.cloudinary.test')
  })
})

describeIntegration('Catalogue', () => {
  it('ajoute un article avec la devise dérivée du pays de facturation par défaut', async () => {
    const userId = await seedUser({ providerBillingRegionId: 'france' })
    await getOrCreateMyProviderProfile({ id: userId })

    const result = await addCatalogItem({ id: userId }, { name: 'Set DJ 3h', price: 300 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.catalog).toHaveLength(1)
    expect(result.profile.catalog[0].currency).toBe('EUR')
    expect(result.profile.catalog[0].available).toBe(true)
  })

  it("ne retient une devise EXPLICITE que si c'est littéralement 'XOF' (quirk legacy)", async () => {
    const userId = await seedUser({ providerBillingRegionId: 'france' })
    await getOrCreateMyProviderProfile({ id: userId })

    const xof = await addCatalogItem({ id: userId }, { name: 'Set DJ (tarif FCFA)', price: 200000, currency: 'XOF' })
    expect(xof.ok).toBe(true)
    if (xof.ok) expect(xof.profile.catalog[0].currency).toBe('XOF')

    const eurExplicit = await addCatalogItem({ id: userId }, { name: 'Autre article', price: 100, currency: 'EUR' })
    expect(eurExplicit.ok).toBe(true)
    if (eurExplicit.ok) expect(eurExplicit.profile.catalog[1].currency).toBe('EUR')
  })

  it('refuse un nom vide', async () => {
    const userId = await seedUser()
    await getOrCreateMyProviderProfile({ id: userId })
    const result = await addCatalogItem({ id: userId }, { name: '  ' })
    expect(result.ok).toBe(false)
  })

  it('met à jour et bascule la disponibilité', async () => {
    const userId = await seedUser()
    await getOrCreateMyProviderProfile({ id: userId })
    const created = await addCatalogItem({ id: userId }, { name: 'Article' })
    if (!created.ok) throw new Error('setup failed')
    const itemId = created.profile.catalog[0].id

    const result = await updateCatalogItem({ id: userId }, itemId, { available: false, price: 50 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.catalog[0].available).toBe(false)
    expect(result.profile.catalog[0].price).toBe(50)
  })

  it('supprime un article', async () => {
    const userId = await seedUser()
    await getOrCreateMyProviderProfile({ id: userId })
    const created = await addCatalogItem({ id: userId }, { name: 'Article' })
    if (!created.ok) throw new Error('setup failed')
    const itemId = created.profile.catalog[0].id

    const result = await deleteCatalogItem({ id: userId }, itemId)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.profile.catalog).toHaveLength(0)
  })

  it('ajoute jusqu’à 4 médias par article puis refuse le 5e', async () => {
    const userId = await seedUser()
    await getOrCreateMyProviderProfile({ id: userId })
    const created = await addCatalogItem({ id: userId }, { name: 'Article' })
    if (!created.ok) throw new Error('setup failed')
    const itemId = created.profile.catalog[0].id

    for (let i = 0; i < 4; i++) {
      const r = await addCatalogItemMedia({ id: userId }, itemId, { dataUri: TINY_PNG })
      expect(r.ok).toBe(true)
    }
    const fifth = await addCatalogItemMedia({ id: userId }, itemId, { dataUri: TINY_PNG })
    expect(fifth.ok).toBe(false)
    if (fifth.ok) return
    expect(fifth.error).toBe('media_limit_reached')
  })

  it('retire un média par position', async () => {
    const userId = await seedUser()
    await getOrCreateMyProviderProfile({ id: userId })
    const created = await addCatalogItem({ id: userId }, { name: 'Article' })
    if (!created.ok) throw new Error('setup failed')
    const itemId = created.profile.catalog[0].id
    await addCatalogItemMedia({ id: userId }, itemId, { dataUri: TINY_PNG })
    await addCatalogItemMedia({ id: userId }, itemId, { dataUri: TINY_PNG })

    const result = await removeCatalogItemMedia({ id: userId }, itemId, 0)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.profile.catalog[0].media).toHaveLength(1)
  })

  it('rejette un index média invalide', async () => {
    const userId = await seedUser()
    await getOrCreateMyProviderProfile({ id: userId })
    const created = await addCatalogItem({ id: userId }, { name: 'Article' })
    if (!created.ok) throw new Error('setup failed')
    const itemId = created.profile.catalog[0].id
    await addCatalogItemMedia({ id: userId }, itemId, { dataUri: TINY_PNG })

    const result = await removeCatalogItemMedia({ id: userId }, itemId, 4)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid_media_index')
  })
})

// Régression : ces 3 routes ne vérifiaient auparavant QUE
// `roles.includes('prestataire')`, jamais `prestStatus` — un prestataire
// `rejected` pouvait donc continuer à gérer son catalogue public. Corrigé en
// remplaçant ce check par `canProposeServices` (lib/server/permissions.ts),
// qui bloque `rejected` mais autorise explicitement `pending` (décision
// produit confirmée par permissions.test.ts).
describeIntegration('POST /api/providers/me/catalog — garde canProposeServices au niveau route', () => {
  it('401 si non authentifié', async () => {
    mockSessionUser = null
    const { POST } = await import('../../../app/api/providers/me/catalog/route')
    const req = new Request('http://localhost/api/providers/me/catalog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Article' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("403 pour un prestataire dont le dossier est rejeté (prestStatus='rejected')", async () => {
    const userId = await seedUser({ prestStatus: 'rejected' })
    mockSessionUser = { id: userId, activeRole: 'prestataire', status: 'active', prestStatus: 'rejected' }
    const { POST } = await import('../../../app/api/providers/me/catalog/route')
    const req = new Request('http://localhost/api/providers/me/catalog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Article' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('forbidden')

    const profile = await ProviderProfile.findOne({ userId }).lean()
    expect(profile?.catalog ?? []).toHaveLength(0)
  })

  it("200 pour un prestataire encore en attente (prestStatus='pending') — comportement produit voulu", async () => {
    const userId = await seedUser({ prestStatus: 'pending' })
    await getOrCreateMyProviderProfile({ id: userId })
    mockSessionUser = { id: userId, activeRole: 'prestataire', status: 'active', prestStatus: 'pending' }
    const { POST } = await import('../../../app/api/providers/me/catalog/route')
    const req = new Request('http://localhost/api/providers/me/catalog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Article' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const profile = await ProviderProfile.findOne({ userId }).lean()
    expect(profile?.catalog ?? []).toHaveLength(1)
  })

  it("403 pour un rôle actif différent de 'prestataire', même si roles[] le contient", async () => {
    const userId = await seedUser({ activeRole: 'client', roles: ['client', 'prestataire'] })
    mockSessionUser = { id: userId, activeRole: 'client', status: 'active' }
    const { POST } = await import('../../../app/api/providers/me/catalog/route')
    const req = new Request('http://localhost/api/providers/me/catalog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Article' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})
