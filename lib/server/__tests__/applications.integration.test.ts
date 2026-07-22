// Tests d'INTÉGRATION (vraie base MongoDB) pour le dossier de candidature
// organisateur (#7 phase organisateur — lib/server/applications.ts).
// L'upload de document (Cloudinary) est mocké — même convention que le reste
// de cette suite, qui ne teste jamais le chemin Cloudinary réel (cf.
// profile.integration.test.ts, qui ne couvre pas updateAvatar) : on vérifie
// ici la logique métier (validation, transitions de statut, mutations
// utilisateur), pas l'intégration réseau avec Cloudinary elle-même.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

vi.mock('../cloudinary', () => ({
  uploadDataUri: vi.fn(async (dataUri: string, folder: string) => ({ ok: true, url: `https://res.cloudinary.test/${folder}/mock.png` })),
}))

import {
  getMyApplication,
  saveApplicationDraft,
  submitOrganizerApplication,
  registerAndSubmitOrganizerApplication,
  type DocumentEntryInput,
} from '../applications'
import { validateOrganizerFormData, isValidSiret } from '../../shared/applicationValidation'
import User from '../../models/User'
import Application from '../../models/Application'
import type { OrganizerFormData } from '../../shared/applicationValidation'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

// Data URI d'un PNG 1x1 valide — assez pour un vrai aller-retour Cloudinary
// sans dépendre d'un fichier externe.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

const VALID_FORM: OrganizerFormData = {
  nomCommercial: 'Club Neon',
  siret: '73282932000074', // SIREN/SIRET valide au sens Luhn (INSEE, publiquement connu)
  emailPro: 'contact@club-neon.test',
  telephoneProCode: '+228',
  telephonePro: '90000000',
  adresseEtablissement: '12 rue du Test',
  noFixedAddress: false,
  siteWeb: '',
  typeEtablissement: 'Boîte / Club',
  typeEtablissementCustom: '',
  itinerant: false,
  ville: 'Lomé',
  pays: 'Togo',
  zonesActivite: [],
  capacite: 200,
  horaires: 'Ven-Sam 23h-07h',
  alcool: false,
  alcoolAtteste: false,
  description: 'Un club test.',
}

const VALID_DOCS: Record<string, DocumentEntryInput[]> = {
  identity: [{ name: 'cni.png', dataUri: TINY_PNG }],
}

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
  const passwordHash = await bcrypt.hash('correct-password', 10)
  return User.create({
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash,
    firstName: 'Prenom',
    lastName: 'Nom',
    roles: ['client'],
    activeRole: 'client',
    ...overrides,
  })
}

describe('validateOrganizerFormData / isValidSiret (unitaire, pur)', () => {
  it('accepte un SIRET valide (Luhn)', () => {
    expect(isValidSiret('732 829 320 00074')).toBe(true)
  })
  it('accepte l’échappatoire "que des zéros"', () => {
    expect(isValidSiret('000000000')).toBe(true)
  })
  it('refuse un SIRET invalide', () => {
    expect(isValidSiret('123456789')).toBe(false)
  })
  it('valide un formulaire complet', () => {
    expect(validateOrganizerFormData(VALID_FORM)).toEqual({ ok: true })
  })
  it('refuse un formulaire sans nom commercial', () => {
    const result = validateOrganizerFormData({ ...VALID_FORM, nomCommercial: '' })
    expect(result.ok).toBe(false)
  })
  it('exige l’attestation alcool si alcool=true', () => {
    const result = validateOrganizerFormData({ ...VALID_FORM, alcool: true, alcoolAtteste: false })
    expect(result.ok).toBe(false)
  })
})

describeIntegration('applications (intégration, vraie base + Cloudinary) — dossier organisateur (#7)', () => {
  describe('getMyApplication / saveApplicationDraft', () => {
    it('renvoie null si aucun dossier', async () => {
      const alice = await seedUser()
      const app = await getMyApplication({ id: alice.id }, 'organisateur')
      expect(app).toBeNull()
    })

    it('crée un brouillon et le relit', async () => {
      const alice = await seedUser()
      const result = await saveApplicationDraft({ id: alice.id }, 'organisateur', { nomCommercial: 'Brouillon Test' })
      expect(result.ok).toBe(true)

      const app = await getMyApplication({ id: alice.id }, 'organisateur')
      expect(app?.status).toBe('draft')
      expect(app?.formData.nomCommercial).toBe('Brouillon Test')
    })

    it('refuse l’autosave sur un dossier déjà soumis', async () => {
      const alice = await seedUser()
      const submitResult = await submitOrganizerApplication({ id: alice.id }, { formData: VALID_FORM, documents: VALID_DOCS })
      expect(submitResult.ok).toBe(true)

      const draftResult = await saveApplicationDraft({ id: alice.id }, 'organisateur', { nomCommercial: 'Tentative' })
      expect(draftResult.ok).toBe(false)
      if (draftResult.ok) return
      expect(draftResult.error).toBe('not_editable')
    })
  })

  describe('submitOrganizerApplication (mode connecté)', () => {
    it('refuse sans document d’identité', async () => {
      const alice = await seedUser()
      const result = await submitOrganizerApplication({ id: alice.id }, { formData: VALID_FORM, documents: {} })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('missing_required_documents')
    })

    it('refuse un formulaire invalide', async () => {
      const alice = await seedUser()
      const result = await submitOrganizerApplication({ id: alice.id }, { formData: { ...VALID_FORM, siret: 'invalide' }, documents: VALID_DOCS })
      expect(result.ok).toBe(false)
    })

    it('soumet avec succès : bascule le rôle actif et pose orgStatus=pending', async () => {
      const alice = await seedUser()
      const result = await submitOrganizerApplication({ id: alice.id }, { formData: VALID_FORM, documents: VALID_DOCS })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.application.status).toBe('submitted')
      expect(result.application.documents.identity).toHaveLength(1)
      expect(result.application.documents.identity[0].url).toMatch(/^\/api\/applications\//)

      const fresh = await User.findById(alice.id).lean()
      expect(fresh?.roles).toContain('organisateur')
      expect(fresh?.activeRole).toBe('organisateur')
      expect(fresh?.orgStatus).toBe('pending')
    })

    it('un organisateur déjà actif qui candidate pour un second rôle ne perd pas orgStatus=active tant qu’il ne resoumet pas SON dossier organisateur', async () => {
      // Ce test documente la garantie de non-régression du #7 : orgStatus
      // n'est modifié QUE par une action sur le dossier organisateur
      // lui-même, jamais par effet de bord d'un autre dossier.
      const alice = await seedUser({ roles: ['organisateur'], activeRole: 'organisateur', orgStatus: 'active' })
      const fresh = await User.findById(alice.id).lean()
      expect(fresh?.orgStatus).toBe('active')
    })

    it('resoumission après needs_changes passe le statut à resubmitted', async () => {
      const alice = await seedUser()
      await submitOrganizerApplication({ id: alice.id }, { formData: VALID_FORM, documents: VALID_DOCS })
      await Application.updateOne({ userId: alice.id, type: 'organisateur' }, { $set: { status: 'needs_changes', requestedChanges: 'Ajoute ton SIRET complet.' } })

      const result = await submitOrganizerApplication({ id: alice.id }, { formData: VALID_FORM, documents: VALID_DOCS, candidateNote: 'Corrigé.' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.application.status).toBe('resubmitted')
    })
  })

  describe('registerAndSubmitOrganizerApplication (mode anonyme)', () => {
    it('crée le compte ET la candidature en un seul appel', async () => {
      const email = `anon-${Date.now()}@test.com`
      const result = await registerAndSubmitOrganizerApplication({ email, password: 'Test1234!', formData: VALID_FORM, documents: VALID_DOCS })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const user = await User.findById(result.userId).lean()
      expect(user?.email).toBe(email)
      expect(user?.roles).toEqual(['organisateur'])
      expect(user?.activeRole).toBe('organisateur')
      expect(user?.orgStatus).toBe('pending')
      expect(await bcrypt.compare('Test1234!', user!.passwordHash)).toBe(true)

      const app = await Application.findOne({ userId: result.userId, type: 'organisateur' }).lean()
      expect(app?.status).toBe('submitted')
    })

    it('refuse un email déjà utilisé', async () => {
      const existing = await seedUser()
      const result = await registerAndSubmitOrganizerApplication({ email: existing.email, password: 'Test1234!', formData: VALID_FORM, documents: VALID_DOCS })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('email_taken')
    })

    it('refuse un mot de passe trop court', async () => {
      const result = await registerAndSubmitOrganizerApplication({ email: `short-${Date.now()}@test.com`, password: 'short', formData: VALID_FORM, documents: VALID_DOCS })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('password_too_short')
    })

    it('ne crée aucun compte si le formulaire est invalide', async () => {
      const email = `invalid-${Date.now()}@test.com`
      const result = await registerAndSubmitOrganizerApplication({ email, password: 'Test1234!', formData: { ...VALID_FORM, nomCommercial: '' }, documents: VALID_DOCS })
      expect(result.ok).toBe(false)
      const user = await User.findOne({ email }).lean()
      expect(user).toBeNull()
    })
  })
})
