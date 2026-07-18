// Tests d'INTÉGRATION (vraie base MongoDB) pour le dossier de candidature
// prestataire (#8 phase prestataire — lib/server/applications.ts). Miroir de
// applications.integration.test.ts (dossier organisateur) — mêmes
// conventions (Cloudinary mocké, pas de test réseau réel).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

vi.mock('../cloudinary', () => ({
  uploadDataUri: vi.fn(async (dataUri: string, folder: string) => ({ ok: true, url: `https://res.cloudinary.test/${folder}/mock.png` })),
}))

import { getMyApplication, saveApplicationDraft, submitPrestataireApplication, registerAndSubmitPrestataireApplication, type DocumentEntryInput } from '../applications'
import { validatePrestataireFormData, getRequiredDocs, type PrestataireFormData } from '../../shared/applicationValidation'
import User from '../../models/User'
import Application from '../../models/Application'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function baseForm(overrides: Partial<PrestataireFormData> = {}): PrestataireFormData {
  return {
    prestataireType: 'photo_video',
    prestataireTypes: ['photo_video'],
    prenom: 'Ada',
    nom: 'Lovelace',
    telephoneCode: '+228',
    telephone: '90000000',
    ville: 'Lomé',
    pays: 'Togo',
    nomCommercial: '',
    nomScene: '',
    siret: '',
    zonesIntervention: [],
    description: '',
    specialitesLibre: '',
    typeArtiste: '',
    styles: '',
    anneesExperience: '',
    statutFacturation: '',
    portfolio: '',
    instagram: '',
    besoinstechniques: '',
    adresseLieu: '',
    capaciteLieu: null,
    typeLieu: '',
    equipements: '',
    horairesAutorises: '',
    reglesDuLieu: '',
    categoriesMateriel: '',
    inventaire: '',
    conditionsLocation: '',
    politiqueCaution: '',
    typeActiviteFood: '',
    menuBase: '',
    alcoolFood: false,
    alcoolFoodAtteste: false,
    tarifMin: null,
    tarifMax: null,
    tarifType: '',
    tarifDevis: false,
    ...overrides,
  }
}

const IDENTITY_ONLY_DOCS: Record<string, DocumentEntryInput[]> = {
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

describe('validatePrestataireFormData / getRequiredDocs (unitaire, pur)', () => {
  it('valide un formulaire minimal complet', () => {
    expect(validatePrestataireFormData(baseForm())).toEqual({ ok: true })
  })
  it('refuse sans prénom', () => {
    expect(validatePrestataireFormData(baseForm({ prenom: '' })).ok).toBe(false)
  })
  it('refuse sans téléphone valide', () => {
    expect(validatePrestataireFormData(baseForm({ telephone: '' })).ok).toBe(false)
  })
  it("exige l'attestation alcool si alcoolFood=true", () => {
    const result = validatePrestataireFormData(baseForm({ alcoolFood: true, alcoolFoodAtteste: false }))
    expect(result.ok).toBe(false)
  })
  it('accepte alcoolFood=true avec attestation', () => {
    const result = validatePrestataireFormData(baseForm({ alcoolFood: true, alcoolFoodAtteste: true }))
    expect(result.ok).toBe(true)
  })
  it('n’exige PAS typeArtiste même pour un artiste (fidèle au legacy, jamais vérifié)', () => {
    const result = validatePrestataireFormData(baseForm({ prestataireTypes: ['artiste'], typeArtiste: '' }))
    expect(result.ok).toBe(true)
  })

  it('getRequiredDocs organisateur = identity uniquement', () => {
    expect(getRequiredDocs('organisateur', ['salle'])).toEqual(['identity'])
  })
  it('getRequiredDocs prestataire sans catégorie = identity uniquement', () => {
    expect(getRequiredDocs('prestataire', [])).toEqual(['identity'])
  })
  it('getRequiredDocs prestataire "artiste" ajoute billing_proof', () => {
    const docs = getRequiredDocs('prestataire', ['artiste'])
    expect(docs).toEqual(expect.arrayContaining(['identity', 'billing_proof']))
    expect(docs).not.toContain('business_doc')
  })
  it('getRequiredDocs prestataire "salle" ajoute business_doc + insurance + exploitation_proof', () => {
    const docs = getRequiredDocs('prestataire', ['salle'])
    expect(docs.sort()).toEqual(['business_doc', 'exploitation_proof', 'identity', 'insurance'])
  })
  it('getRequiredDocs cumule pour un prestataire multi-catégories', () => {
    const docs = getRequiredDocs('prestataire', ['artiste', 'salle'])
    expect(docs.sort()).toEqual(['billing_proof', 'business_doc', 'exploitation_proof', 'identity', 'insurance'])
  })
})

describeIntegration('applications (intégration, vraie base + Cloudinary) — dossier prestataire (#8)', () => {
  describe('getMyApplication / saveApplicationDraft (type prestataire)', () => {
    it('renvoie null si aucun dossier', async () => {
      const alice = await seedUser()
      const app = await getMyApplication({ id: alice.id }, 'prestataire')
      expect(app).toBeNull()
    })

    it('crée un brouillon et le relit', async () => {
      const alice = await seedUser()
      const result = await saveApplicationDraft({ id: alice.id }, 'prestataire', { prenom: 'Brouillon' })
      expect(result.ok).toBe(true)

      const app = await getMyApplication({ id: alice.id }, 'prestataire')
      expect(app?.status).toBe('draft')
      expect(app?.formData.prenom).toBe('Brouillon')
    })
  })

  describe('submitPrestataireApplication (mode connecté)', () => {
    it('refuse sans document d’identité', async () => {
      const alice = await seedUser()
      const result = await submitPrestataireApplication({ id: alice.id }, { formData: baseForm(), documents: {} })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('missing_required_documents')
    })

    it('refuse une catégorie "salle" sans business_doc/insurance/exploitation_proof même avec identity fourni', async () => {
      const alice = await seedUser()
      const result = await submitPrestataireApplication(
        { id: alice.id },
        { formData: baseForm({ prestataireTypes: ['salle'] }), documents: IDENTITY_ONLY_DOCS }
      )
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('missing_required_documents')
    })

    it('accepte une catégorie sans exigence spécifique (photo_video) avec identity seul', async () => {
      const alice = await seedUser()
      const result = await submitPrestataireApplication({ id: alice.id }, { formData: baseForm(), documents: IDENTITY_ONLY_DOCS })
      expect(result.ok).toBe(true)
    })

    it('refuse un formulaire invalide', async () => {
      const alice = await seedUser()
      const result = await submitPrestataireApplication({ id: alice.id }, { formData: baseForm({ prenom: '' }), documents: IDENTITY_ONLY_DOCS })
      expect(result.ok).toBe(false)
    })

    it('soumet avec succès : bascule le rôle actif et pose prestStatus=pending', async () => {
      const alice = await seedUser()
      const result = await submitPrestataireApplication({ id: alice.id }, { formData: baseForm(), documents: IDENTITY_ONLY_DOCS })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.application.status).toBe('submitted')
      expect(result.application.documents.identity).toHaveLength(1)

      const fresh = await User.findById(alice.id).lean()
      expect(fresh?.roles).toContain('prestataire')
      expect(fresh?.activeRole).toBe('prestataire')
      expect(fresh?.prestStatus).toBe('pending')
    })

    it('un organisateur déjà actif qui candidate en prestataire ne perd pas orgStatus=active', async () => {
      const alice = await seedUser({ roles: ['organisateur'], activeRole: 'organisateur', orgStatus: 'active' })
      const result = await submitPrestataireApplication({ id: alice.id }, { formData: baseForm(), documents: IDENTITY_ONLY_DOCS })
      expect(result.ok).toBe(true)

      const fresh = await User.findById(alice.id).lean()
      expect(fresh?.orgStatus).toBe('active')
      expect(fresh?.roles).toEqual(expect.arrayContaining(['organisateur', 'prestataire']))
      expect(fresh?.prestStatus).toBe('pending')
    })

    it('resoumission après needs_changes passe le statut à resubmitted', async () => {
      const alice = await seedUser()
      await submitPrestataireApplication({ id: alice.id }, { formData: baseForm(), documents: IDENTITY_ONLY_DOCS })
      await Application.updateOne({ userId: alice.id, type: 'prestataire' }, { $set: { status: 'needs_changes', requestedChanges: 'Précise ta zone.' } })

      const result = await submitPrestataireApplication({ id: alice.id }, { formData: baseForm(), documents: IDENTITY_ONLY_DOCS, candidateNote: 'Corrigé.' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.application.status).toBe('resubmitted')
    })
  })

  describe('registerAndSubmitPrestataireApplication (mode anonyme)', () => {
    it('crée le compte ET la candidature en un seul appel', async () => {
      const email = `anon-${Date.now()}@test.com`
      const result = await registerAndSubmitPrestataireApplication({ email, password: 'Test1234!', formData: baseForm(), documents: IDENTITY_ONLY_DOCS })
      expect(result.ok).toBe(true)
      if (!result.ok) return

      const user = await User.findById(result.userId).lean()
      expect(user?.email).toBe(email)
      expect(user?.firstName).toBe('Ada')
      expect(user?.lastName).toBe('Lovelace')
      expect(user?.roles).toEqual(['prestataire'])
      expect(user?.activeRole).toBe('prestataire')
      expect(user?.prestStatus).toBe('pending')
      expect(await bcrypt.compare('Test1234!', user!.passwordHash)).toBe(true)

      const app = await Application.findOne({ userId: result.userId, type: 'prestataire' }).lean()
      expect(app?.status).toBe('submitted')
    })

    it('refuse un email déjà utilisé', async () => {
      const existing = await seedUser()
      const result = await registerAndSubmitPrestataireApplication({ email: existing.email, password: 'Test1234!', formData: baseForm(), documents: IDENTITY_ONLY_DOCS })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('email_taken')
    })

    it('refuse un mot de passe trop court', async () => {
      const result = await registerAndSubmitPrestataireApplication({ email: `short-${Date.now()}@test.com`, password: 'short', formData: baseForm(), documents: IDENTITY_ONLY_DOCS })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('password_too_short')
    })

    it('ne crée aucun compte si le formulaire est invalide', async () => {
      const email = `invalid-${Date.now()}@test.com`
      const result = await registerAndSubmitPrestataireApplication({ email, password: 'Test1234!', formData: baseForm({ prenom: '' }), documents: IDENTITY_ONLY_DOCS })
      expect(result.ok).toBe(false)
      const user = await User.findOne({ email }).lean()
      expect(user).toBeNull()
    })

    it('ne crée aucun compte si les documents requis manquent (catégorie "salle")', async () => {
      const email = `missingdocs-${Date.now()}@test.com`
      const result = await registerAndSubmitPrestataireApplication({
        email,
        password: 'Test1234!',
        formData: baseForm({ prestataireTypes: ['salle'] }),
        documents: IDENTITY_ONLY_DOCS,
      })
      expect(result.ok).toBe(false)
      const user = await User.findOne({ email }).lean()
      expect(user).toBeNull()
    })
  })
})
