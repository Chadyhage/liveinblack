// Tests d'INTÉGRATION (vraie base MongoDB) pour la gestion des comptes côté
// agent (#9 phase agent/admin — lib/server/agentUsers.ts). Port de la section
// « Comptes » de src/pages/AgentPage.jsx + des actions Firebase Auth de
// api/admin-accounts.js (verify_email, set_disabled) adaptées à ce port
// (pas de couche Auth distincte — voir auth.ts:authorize).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

import {
  listUsersForAgent,
  getUserForAgent,
  setUserDisabled,
  forceVerifyEmail,
  updateUserEmail,
  updateUserFields,
  type AgentCaller,
} from '../agentUsers'
import User from '../../models/User'
import OrganizerProfile from '../../models/OrganizerProfile'
import ProviderProfile from '../../models/ProviderProfile'

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
  await OrganizerProfile.deleteMany({})
  await ProviderProfile.deleteMany({})
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash('correct-password', 10)
  return User.create({
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash,
    firstName: 'Prenom',
    lastName: 'Nom',
    phone: '+22890000000',
    roles: ['client'],
    activeRole: 'client',
    ...overrides,
  })
}

describeIntegration('agentUsers (intégration, vraie base) — #9 phase agent/admin', () => {
  describe('listUsersForAgent', () => {
    it('liste tous les comptes, plus récents en premier', async () => {
      await seedUser({ email: 'a@test.com' })
      await seedUser({ email: 'b@test.com' })

      const results = await listUsersForAgent()
      expect(results.users).toHaveLength(2)
      expect(results.total).toBe(2)
      expect(results.totalPages).toBe(1)
    })

    it('filtre par recherche sur nom/email/téléphone', async () => {
      await seedUser({ email: 'alice@test.com', firstName: 'Alice' })
      await seedUser({ email: 'bob@test.com', firstName: 'Bob' })

      expect((await listUsersForAgent({ search: 'alice' })).users).toHaveLength(1)
      expect((await listUsersForAgent({ search: 'introuvable' })).users).toHaveLength(0)
    })

    it('filtre par rôle', async () => {
      await seedUser({ activeRole: 'client', roles: ['client'] })
      await seedUser({ activeRole: 'organisateur', roles: ['organisateur'], orgStatus: 'active' })

      expect((await listUsersForAgent({ role: 'organisateur' })).users).toHaveLength(1)
      expect((await listUsersForAgent({ role: 'client' })).users).toHaveLength(1)
    })

    it('filtre par statut, y compris "disabled" (indépendant du champ status)', async () => {
      await seedUser({ status: 'pending' })
      const disabledUser = await seedUser({ status: 'active', disabled: true })

      expect((await listUsersForAgent({ status: 'pending' })).users).toHaveLength(1)
      const disabledResults = await listUsersForAgent({ status: 'disabled' })
      expect(disabledResults.users).toHaveLength(1)
      expect(disabledResults.users[0].id).toBe(String(disabledUser._id))
    })

    it('filtre "en ligne" sur lastSeenAt récent', async () => {
      await seedUser({ lastSeenAt: new Date() })
      await seedUser({ lastSeenAt: new Date(Date.now() - 60 * 60 * 1000) })

      const online = await listUsersForAgent({ onlineOnly: true })
      expect(online.users).toHaveLength(1)
      expect(online.users[0].online).toBe(true)
    })

    it('implémente la pagination par page et taille de page', async () => {
      for (let index = 0; index < 40; index += 1) await seedUser({ email: `u${index}@test.com` })

      const firstPage = await listUsersForAgent({ page: 1, pageSize: 15 })
      const secondPage = await listUsersForAgent({ page: 2, pageSize: 15 })

      expect(firstPage.users).toHaveLength(15)
      expect(secondPage.users).toHaveLength(15)
      expect(firstPage.page).toBe(1)
      expect(secondPage.page).toBe(2)
      expect(firstPage.total).toBe(40)
      expect(secondPage.totalPages).toBe(3)
      expect(firstPage.users[0].id).not.toBe(secondPage.users[0].id)
    })

    it('affiche le nom commercial (profil organisateur/prestataire) comme displayName', async () => {
      const org = await seedUser({ activeRole: 'organisateur', roles: ['organisateur'], orgStatus: 'active' })
      await OrganizerProfile.create({ userId: String(org._id), publicName: 'Club Neon', slug: 'club-neon' })

      const results = await listUsersForAgent({ role: 'organisateur' })
      expect(results.users[0].displayName).toBe('Club Neon')
      expect(results.users[0].personalName).toBe('Prenom Nom')
    })
  })

  describe('getUserForAgent', () => {
    it('renvoie une vue enrichie avec les activités prestataire', async () => {
      const prest = await seedUser({ activeRole: 'prestataire', roles: ['prestataire'], prestStatus: 'active' })
      await ProviderProfile.create({ userId: String(prest._id), name: 'DJ Bob', prestataireTypes: ['artiste', 'materiel'] })

      const result = await getUserForAgent(String(prest._id))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.user.displayName).toBe('DJ Bob')
      expect(result.user.prestataireTypes).toEqual(['artiste', 'materiel'])
    })

    it('404 si le compte n’existe pas', async () => {
      const result = await getUserForAgent(new mongoose.Types.ObjectId().toString())
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
    })
  })

  describe('setUserDisabled', () => {
    it('suspend puis réactive un compte', async () => {
      const agent: AgentCaller = { id: new mongoose.Types.ObjectId().toString() }
      const target = await seedUser()

      const disabled = await setUserDisabled(agent, String(target._id), true)
      expect(disabled.ok).toBe(true)
      if (!disabled.ok) return
      expect(disabled.user.disabled).toBe(true)

      const reactivated = await setUserDisabled(agent, String(target._id), false)
      expect(reactivated.ok).toBe(true)
      if (!reactivated.ok) return
      expect(reactivated.user.disabled).toBe(false)
    })

    it('refuse qu’un agent se suspende lui-même', async () => {
      const target = await seedUser()
      const agent: AgentCaller = { id: String(target._id) }

      const result = await setUserDisabled(agent, String(target._id), true)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('self_action')
    })

    it('refuse de suspendre un compte super-admin', async () => {
      const agent: AgentCaller = { id: new mongoose.Types.ObjectId().toString() }
      const target = await seedUser({ superAdmin: true })

      const result = await setUserDisabled(agent, String(target._id), true)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('protected_account')
    })

    it('404 si le compte n’existe pas', async () => {
      const agent: AgentCaller = { id: new mongoose.Types.ObjectId().toString() }
      const result = await setUserDisabled(agent, new mongoose.Types.ObjectId().toString(), true)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
    })
  })

  describe('forceVerifyEmail', () => {
    it('pose emailVerifiedAt', async () => {
      const target = await seedUser()
      expect(target.emailVerifiedAt).toBeFalsy()

      const result = await forceVerifyEmail(String(target._id))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.user.emailVerified).toBe(true)
      expect(result.user.emailVerifiedAt).not.toBeNull()
    })
  })

  describe('updateUserFields', () => {
    it('met à jour uniquement les champs fournis', async () => {
      const target = await seedUser({ firstName: 'Old', lastName: 'Name', phone: '+22890000000' })

      const result = await updateUserFields(String(target._id), { firstName: 'New' })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.user.firstName).toBe('New')
      expect(result.user.lastName).toBe('Name')
      expect(result.user.phone).toBe('+22890000000')
    })

    it('404 si le compte n’existe pas', async () => {
      const result = await updateUserFields(new mongoose.Types.ObjectId().toString(), { firstName: 'X' })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
    })
  })

  describe('updateUserEmail', () => {
    it('change l’identifiant, exige une nouvelle vérification et révoque les sessions', async () => {
      const target = await seedUser({
        email: 'ancienne@test.com',
        pendingEmail: 'attente@test.com',
        emailVerifiedAt: new Date(),
        sessionVersion: 2,
      })

      const result = await updateUserEmail(String(target._id), ' Nouvelle@Test.com ')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.user.email).toBe('nouvelle@test.com')
      expect(result.user.emailVerified).toBe(false)

      const fresh = await User.findById(target._id).lean()
      expect(fresh?.pendingEmail).toBeNull()
      expect(fresh?.sessionVersion).toBe(3)
    })

    it('refuse une adresse déjà utilisée', async () => {
      const target = await seedUser({ email: 'cible@test.com' })
      await seedUser({ email: 'prise@test.com' })

      const result = await updateUserEmail(String(target._id), 'prise@test.com')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('email_taken')
    })

    it('protège le compte super-admin', async () => {
      const target = await seedUser({ superAdmin: true })

      const result = await updateUserEmail(String(target._id), 'nouveau@test.com')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('protected_account')
    })
  })
})
