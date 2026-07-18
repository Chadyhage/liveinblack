// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/organizerProfile.ts
// (#7 phase organisateur — port ÉCRITURE de OrganizerPublicStudio.jsx, "Ma page
// publique"). Cloudinary est mocké (identique à applications.integration.test.ts) :
// les credentials sont invalides dans cet environnement.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'

vi.mock('../cloudinary', () => ({
  uploadDataUri: vi.fn(async (dataUri: string, folder: string) => ({ ok: true, url: `https://res.cloudinary.test/${folder}/mock.jpg` })),
}))

import {
  getOrCreateMyOrganizerProfile,
  updateOrganizerProfile,
  uploadOrganizerProfileMedia,
  updateOrganizerMediaItem,
  removeOrganizerMedia,
  reorderOrganizerMedia,
} from '../organizerProfile'
import OrganizerProfile from '../../models/OrganizerProfile'
import Application from '../../models/Application'
import User from '../../models/User'
import Event from '../../models/Event'

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
  await OrganizerProfile.deleteMany({})
  await Application.deleteMany({})
  await User.deleteMany({})
  await Event.deleteMany({})
})

async function seedUser(overrides: Partial<Record<string, unknown>> = {}) {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId().toString()}@test.com`,
    passwordHash: 'x',
    firstName: 'Ada',
    lastName: 'Lovelace',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    ...overrides,
  })
  return String(user._id)
}

describeIntegration('organizerProfile (intégration, vraie base) — studio "Ma page publique" (#7)', () => {
  it("crée un profil brouillon au premier accès, à partir du dossier de candidature", async () => {
    const userId = await seedUser()
    await Application.create({
      userId,
      type: 'organisateur',
      status: 'approved',
      formData: { nomCommercial: 'Le Loft', ville: 'Lomé', pays: 'Togo', description: 'Le meilleur club de Lomé.' },
    })

    const result = await getOrCreateMyOrganizerProfile({ id: userId })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.publicName).toBe('Le Loft')
    expect(result.profile.slug).toBe('le-loft')
    expect(result.profile.city).toBe('Lomé')
    expect(result.profile.regionId).toBe('togo')
    expect(result.profile.zonesIntervention).toEqual(['togo'])
    expect(result.profile.status).toBe('draft')

    // Un second appel ne recrée pas de doublon.
    const again = await getOrCreateMyOrganizerProfile({ id: userId })
    expect(again.ok).toBe(true)
    const count = await OrganizerProfile.countDocuments({ userId })
    expect(count).toBe(1)
  })

  it('auto-suffixe le slug seed en cas de collision avec un autre organisateur', async () => {
    const userA = await seedUser()
    await OrganizerProfile.create({ userId: userA, publicName: 'Le Loft', slug: 'le-loft', status: 'public' })

    const userB = await seedUser()
    const result = await getOrCreateMyOrganizerProfile({ id: userB })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Pas de candidature pour userB → fallback sur le nom du compte, mais on
    // vérifie surtout que la collision de slug est résolue automatiquement.
    expect(result.profile.slug).not.toBe('le-loft')
  })

  it('refuse un nom public vide', async () => {
    const userId = await seedUser()
    await getOrCreateMyOrganizerProfile({ id: userId })

    const result = await updateOrganizerProfile({ id: userId }, { publicName: '   ' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('name_required')
  })

  it('refuse un slug réservé ou déjà pris par un autre organisateur', async () => {
    const userA = await seedUser()
    await OrganizerProfile.create({ userId: userA, publicName: 'Existant', slug: 'existant', status: 'public' })

    const userB = await seedUser()
    await getOrCreateMyOrganizerProfile({ id: userB })

    const reserved = await updateOrganizerProfile({ id: userB }, { slug: 'admin' })
    expect(reserved.ok).toBe(false)
    if (!reserved.ok) expect(reserved.error).toMatch(/réservée/)

    const taken = await updateOrganizerProfile({ id: userB }, { slug: 'existant' })
    expect(taken.ok).toBe(false)
    if (!taken.ok) expect(taken.error).toBe('slug_taken')
  })

  it('normalise les zones d’intervention et garantit que regionId y figure toujours', async () => {
    const userId = await seedUser()
    await OrganizerProfile.create({ userId, publicName: 'Le Loft', slug: 'le-loft', regionId: 'togo', status: 'draft' })

    const result = await updateOrganizerProfile({ id: userId }, { zonesIntervention: ['benin'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.zonesIntervention).toEqual(expect.arrayContaining(['togo', 'benin']))
  })

  it('collapse les zones sur "international" si sélectionné', async () => {
    const userId = await seedUser()
    await OrganizerProfile.create({ userId, publicName: 'Le Loft', slug: 'le-loft', regionId: 'togo', status: 'draft' })

    const result = await updateOrganizerProfile({ id: userId }, { zonesIntervention: ['benin', 'international'] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.zonesIntervention).toEqual(['international'])
  })

  it('efface la description longue quand la description courte est modifiée', async () => {
    const userId = await seedUser()
    await OrganizerProfile.create({ userId, publicName: 'Le Loft', slug: 'le-loft', longDescription: 'Ancien texte long', status: 'draft' })

    const result = await updateOrganizerProfile({ id: userId }, { shortDescription: 'Nouvelle description' })
    expect(result.ok).toBe(true)
    const doc = await OrganizerProfile.findOne({ userId }).lean()
    expect(doc?.longDescription).toBe('')
  })

  it('relève totalEventsCount au nombre réel d’événements possédés, jamais à la baisse', async () => {
    const userId = await seedUser()
    await OrganizerProfile.create({ userId, publicName: 'Le Loft', slug: 'le-loft', totalEventsCount: 5, status: 'draft' })
    await Event.create([
      { name: 'Soirée 1', date: '2030-01-01', city: 'Lomé', region: 'Togo', organizerId: userId, createdBy: userId, places: [] },
      { name: 'Soirée 2', date: '2030-02-01', city: 'Lomé', region: 'Togo', organizerId: userId, createdBy: userId, places: [] },
    ])

    const result = await updateOrganizerProfile({ id: userId }, { city: 'Lomé' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // 2 événements réels < 5 déjà enregistrés → le plafond historique est conservé.
    expect(result.profile.totalEventsCount).toBe(5)
  })

  it('upload avatar/banner et persiste immédiatement', async () => {
    const userId = await seedUser()
    await OrganizerProfile.create({ userId, publicName: 'Le Loft', slug: 'le-loft', status: 'draft' })

    const avatar = await uploadOrganizerProfileMedia({ id: userId }, { kind: 'avatar', dataUri: 'data:image/jpeg;base64,AAA' })
    expect(avatar.ok).toBe(true)
    if (avatar.ok) expect(avatar.profile.avatarUrl).toContain('organizer-media')

    const doc = await OrganizerProfile.findOne({ userId }).lean()
    expect(doc?.avatarUrl).toContain('mock.jpg')
  })

  it('ajoute un média galerie, le modifie, le réordonne puis le supprime', async () => {
    const userId = await seedUser()
    await OrganizerProfile.create({ userId, publicName: 'Le Loft', slug: 'le-loft', status: 'draft' })

    const first = await uploadOrganizerProfileMedia({ id: userId }, { kind: 'gallery', dataUri: 'data:image/jpeg;base64,AAA' })
    const second = await uploadOrganizerProfileMedia({ id: userId }, { kind: 'gallery', dataUri: 'data:video/mp4;base64,BBB' })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.profile.media).toHaveLength(2)
    expect(second.profile.media[1].type).toBe('video')

    const [id1, id2] = second.profile.media.map((m) => m.id)
    const patched = await updateOrganizerMediaItem({ id: userId }, id1, { title: 'Ambiance', visibility: 'hidden' })
    expect(patched.ok).toBe(true)
    if (patched.ok) {
      const item = patched.profile.media.find((m) => m.id === id1)
      expect(item?.title).toBe('Ambiance')
      expect(item?.visibility).toBe('hidden')
    }

    const reordered = await reorderOrganizerMedia({ id: userId }, [id2, id1])
    expect(reordered.ok).toBe(true)
    if (reordered.ok) expect(reordered.profile.media.map((m) => m.id)).toEqual([id2, id1])

    const removed = await removeOrganizerMedia({ id: userId }, id1)
    expect(removed.ok).toBe(true)
    if (removed.ok) expect(removed.profile.media.map((m) => m.id)).toEqual([id2])
  })

  it('rejette un ordre de réorganisation incomplet ou invalide', async () => {
    const userId = await seedUser()
    await OrganizerProfile.create({ userId, publicName: 'Le Loft', slug: 'le-loft', status: 'draft' })
    await uploadOrganizerProfileMedia({ id: userId }, { kind: 'gallery', dataUri: 'data:image/jpeg;base64,AAA' })
    await uploadOrganizerProfileMedia({ id: userId }, { kind: 'gallery', dataUri: 'data:image/jpeg;base64,BBB' })

    const result = await reorderOrganizerMedia({ id: userId }, ['id-inexistant'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid_order')
  })

  it('ne modifie jamais le profil d’un autre organisateur', async () => {
    const userA = await seedUser()
    const userB = await seedUser()
    await OrganizerProfile.create({ userId: userA, publicName: 'Le Loft', slug: 'le-loft', status: 'draft' })

    const result = await updateOrganizerProfile({ id: userB }, { publicName: 'Piraté' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('profile_not_found')

    const untouched = await OrganizerProfile.findOne({ userId: userA }).lean()
    expect(untouched?.publicName).toBe('Le Loft')
  })
})
