// Tests d'INTÉGRATION (vraie base MongoDB) pour la section "Paramètres du
// compte" de ProfilePage.jsx (#6 phase profil — lib/server/profile.ts).
// Couvre : cooldown de 14 jours sur le changement de nom, démographie
// facultative, confidentialité, changement d'email en 2 temps (demande +
// confirmation par lien), mot de passe, suppression de compte (anonymisation
// plutôt que cascade — voir le commentaire d'en-tête de deleteAccount).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import {
  updateName,
  updateDemographics,
  updatePrivacy,
  requestEmailChange,
  cancelEmailChangeRequest,
  confirmEmailChange,
  changePassword,
  deleteAccount,
} from '../profile'
import { issueVerificationToken } from '../../auth/verification-tokens'
import User from '../../models/User'

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

describeIntegration('profile (intégration, vraie base) — paramètres du compte (#6)', () => {
  describe('updateName', () => {
    it('change le nom et pose nameChangedAt', async () => {
      const alice = await seedUser()
      const result = await updateName({ id: alice.id }, { firstName: 'Alicia', lastName: 'Dupont' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.firstName).toBe('Alicia')
      expect(result.lastName).toBe('Dupont')

      const fresh = await User.findById(alice.id).lean()
      expect(fresh?.firstName).toBe('Alicia')
      expect(fresh?.nameChangedAt).not.toBeNull()
    })

    it('refuse un second changement avant la fin du cooldown de 14 jours', async () => {
      const alice = await seedUser()
      await updateName({ id: alice.id }, { firstName: 'Alicia', lastName: 'Dupont' })

      const second = await updateName({ id: alice.id }, { firstName: 'Autre', lastName: 'Nom' })
      expect(second.ok).toBe(false)
      if (second.ok) return
      expect(second.status).toBe(403)
      expect(second.error).toBe('name_cooldown_active')

      // Le nom n'a pas bougé.
      const fresh = await User.findById(alice.id).lean()
      expect(fresh?.firstName).toBe('Alicia')
    })

    it('autorise un nouveau changement une fois le cooldown écoulé', async () => {
      const alice = await seedUser()
      await updateName({ id: alice.id }, { firstName: 'Alicia', lastName: 'Dupont' })

      // Recule artificiellement nameChangedAt de 15 jours pour simuler
      // l'écoulement du cooldown, sans dépendre du temps réel dans le test.
      await User.updateOne({ _id: alice.id }, { $set: { nameChangedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) } })

      const result = await updateName({ id: alice.id }, { firstName: 'Nouveau', lastName: 'Nom' })
      expect(result.ok).toBe(true)
    })

    it('refuse un nom vide', async () => {
      const alice = await seedUser()
      const result = await updateName({ id: alice.id }, { firstName: '  ', lastName: 'Nom' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('name_required')
    })
  })

  describe('updateDemographics', () => {
    it('enregistre birthYear et gender', async () => {
      const alice = await seedUser()
      const result = await updateDemographics({ id: alice.id }, { birthYear: 1995, gender: 'femme' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.birthYear).toBe(1995)
      expect(result.gender).toBe('femme')
    })

    it('refuse une année de naissance hors plage (ex: moins de 13 ans)', async () => {
      const alice = await seedUser()
      const thisYear = new Date().getFullYear()
      const result = await updateDemographics({ id: alice.id }, { birthYear: thisYear - 5 })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('invalid_birth_year')
    })

    it('efface explicitement la démographie avec null', async () => {
      const alice = await seedUser()
      await updateDemographics({ id: alice.id }, { birthYear: 1995, gender: 'femme' })
      const result = await updateDemographics({ id: alice.id }, { birthYear: null, gender: null })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.birthYear).toBeNull()
      expect(result.gender).toBeNull()
    })
  })

  describe('updatePrivacy', () => {
    it('toutes les préférences valent true par défaut, une mise à jour partielle ne change que les clés fournies', async () => {
      const alice = await seedUser()
      const first = await updatePrivacy({ id: alice.id }, { showOnline: false })
      expect(first.ok).toBe(true)
      if (!first.ok) return
      expect(first.privacy.showOnline).toBe(false)
      expect(first.privacy.readReceipts).toBe(true)
      expect(first.privacy.showAvatar).toBe(true)
      expect(first.privacy.personalizedRecommendations).toBe(true)
    })
  })

  describe('requestEmailChange / confirmEmailChange / cancelEmailChangeRequest', () => {
    it('pose pendingEmail sans changer email tout de suite', async () => {
      const alice = await seedUser()
      const result = await requestEmailChange({ id: alice.id }, { newEmail: 'nouvelle@test.com', currentPassword: 'correct-password' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.pendingEmail).toBe('nouvelle@test.com')

      const fresh = await User.findById(alice.id).lean()
      expect(fresh?.email).toBe(alice.email)
      expect(fresh?.pendingEmail).toBe('nouvelle@test.com')
    })

    it('refuse un mauvais mot de passe actuel', async () => {
      const alice = await seedUser()
      const result = await requestEmailChange({ id: alice.id }, { newEmail: 'nouvelle@test.com', currentPassword: 'mauvais-mdp' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(403)
      expect(result.error).toBe('invalid_password')
    })

    it('refuse un email déjà utilisé par un autre compte', async () => {
      const alice = await seedUser()
      const bob = await seedUser()
      const result = await requestEmailChange({ id: alice.id }, { newEmail: bob.email, currentPassword: 'correct-password' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(409)
      expect(result.error).toBe('email_taken')
    })

    it("confirmer avec un token valide applique réellement le changement d'email", async () => {
      const alice = await seedUser()
      const newEmail = 'confirmee@test.com'
      await requestEmailChange({ id: alice.id }, { newEmail, currentPassword: 'correct-password' })
      const token = await issueVerificationToken(newEmail)

      const result = await confirmEmailChange({ email: newEmail, token })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.email).toBe(newEmail)

      const fresh = await User.findById(alice.id).lean()
      expect(fresh?.email).toBe(newEmail)
      expect(fresh?.pendingEmail).toBeNull()
      expect(fresh?.emailVerifiedAt).not.toBeNull()
    })

    it('refuse un token invalide', async () => {
      const alice = await seedUser()
      const newEmail = 'confirmee2@test.com'
      await requestEmailChange({ id: alice.id }, { newEmail, currentPassword: 'correct-password' })

      const result = await confirmEmailChange({ email: newEmail, token: 'faux-token' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('invalid_or_expired_token')

      const fresh = await User.findById(alice.id).lean()
      expect(fresh?.email).toBe(alice.email)
    })

    it('cancelEmailChangeRequest efface pendingEmail sans toucher email', async () => {
      const alice = await seedUser()
      await requestEmailChange({ id: alice.id }, { newEmail: 'nouvelle@test.com', currentPassword: 'correct-password' })

      const result = await cancelEmailChangeRequest({ id: alice.id })
      expect(result.ok).toBe(true)

      const fresh = await User.findById(alice.id).lean()
      expect(fresh?.pendingEmail).toBeNull()
      expect(fresh?.email).toBe(alice.email)
    })
  })

  describe('changePassword', () => {
    it('change le mot de passe (le nouveau fonctionne, l’ancien non)', async () => {
      const alice = await seedUser()
      const result = await changePassword({ id: alice.id }, { currentPassword: 'correct-password', newPassword: 'nouveau-mdp-12' })
      expect(result.ok).toBe(true)

      const fresh = await User.findById(alice.id).lean()
      expect(await bcrypt.compare('nouveau-mdp-12', fresh!.passwordHash)).toBe(true)
      expect(await bcrypt.compare('correct-password', fresh!.passwordHash)).toBe(false)
    })

    it('refuse un mauvais mot de passe actuel', async () => {
      const alice = await seedUser()
      const result = await changePassword({ id: alice.id }, { currentPassword: 'mauvais-mdp', newPassword: 'nouveau-mdp-12' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('invalid_password')
    })

    it('refuse un nouveau mot de passe trop court', async () => {
      const alice = await seedUser()
      const result = await changePassword({ id: alice.id }, { currentPassword: 'correct-password', newPassword: 'court' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('password_too_short')
    })
  })

  describe('deleteAccount', () => {
    it('anonymise le compte : email/nom/téléphone vidés, ancien mot de passe définitivement inutilisable', async () => {
      const alice = await seedUser({ firstName: 'Alice', lastName: 'A', phone: '+33600000000' })
      const originalEmail = alice.email

      const result = await deleteAccount({ id: alice.id }, { currentPassword: 'correct-password' })
      expect(result.ok).toBe(true)

      const fresh = await User.findById(alice.id).lean()
      expect(fresh?.email).not.toBe(originalEmail)
      expect(fresh?.firstName).toBe('')
      expect(fresh?.lastName).toBe('')
      expect(fresh?.phone).toBe('')
      expect(await bcrypt.compare('correct-password', fresh!.passwordHash)).toBe(false)
    })

    it('refuse un mauvais mot de passe actuel (le compte reste intact)', async () => {
      const alice = await seedUser()
      const result = await deleteAccount({ id: alice.id }, { currentPassword: 'mauvais-mdp' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('invalid_password')

      const fresh = await User.findById(alice.id).lean()
      expect(fresh?.email).toBe(alice.email)
    })
  })
})
