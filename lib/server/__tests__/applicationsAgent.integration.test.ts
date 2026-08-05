// Tests d'INTÉGRATION (vraie base MongoDB) pour la revue agent des dossiers
// de candidature (#9 phase agent/admin — lib/server/applications.ts,
// fonctions listApplicationsForAgent/getApplicationForAgent/moderateApplication/
// setApplicationAdminNote). L'envoi d'email est mocké — même convention que
// providerSubscriptions.integration.test.ts : on vérifie que le bon template
// est déclenché (via l'appel au mock), jamais l'intégration Resend réelle.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const sendEmail = vi.fn()
vi.mock('../email', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }))

import { listApplicationsForAgent, getApplicationForAgent, moderateApplication, setApplicationAdminNote, type AgentCaller } from '../applications'
import User from '../../models/User'
import Application from '../../models/Application'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

const AGENT: AgentCaller = { id: 'agent-1', name: 'Agent Test' }

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
  sendEmail.mockReset()
  sendEmail.mockResolvedValue({ ok: true })
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash('correct-password', 10)
  return User.create({
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    passwordHash,
    firstName: 'Prenom',
    lastName: 'Nom',
    phone: '+22890000000',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    orgStatus: 'pending',
    ...overrides,
  })
}

async function seedSubmittedApplication(userId: string, overrides: Record<string, unknown> = {}) {
  return Application.create({
    userId,
    type: 'organisateur',
    status: 'submitted',
    formData: { nomCommercial: 'Club Neon' },
    submittedAt: new Date(),
    auditLog: [{ action: 'submitted', by: userId, byName: 'Prenom Nom', at: new Date(), note: '' }],
    ...overrides,
  })
}

describeIntegration('applications agent (intégration, vraie base) — #9 phase agent/admin', () => {
  describe('listApplicationsForAgent', () => {
    it('liste tous les dossiers avec le nom/email de l’utilisateur', async () => {
      const alice = await seedUser()
      await seedSubmittedApplication(alice.id)

      const results = await listApplicationsForAgent()
      expect(results).toHaveLength(1)
      expect(results[0].userEmail).toBe(alice.email)
      expect(results[0].displayName).toBe('Club Neon')
      expect(results[0].status).toBe('submitted')
    })

    it('filtre par statut et par type', async () => {
      const alice = await seedUser()
      await seedSubmittedApplication(alice.id)
      const bob = await seedUser({ activeRole: 'prestataire', prestStatus: 'pending', roles: ['prestataire'] })
      await Application.create({ userId: bob.id, type: 'prestataire', status: 'approved', formData: { nomCommercial: 'DJ Bob' } })

      expect(await listApplicationsForAgent({ status: 'submitted' })).toHaveLength(1)
      expect(await listApplicationsForAgent({ type: 'prestataire' })).toHaveLength(1)
      expect(await listApplicationsForAgent({ status: 'approved', type: 'prestataire' })).toHaveLength(1)
    })

    it('filtre par recherche sur le nom/email affiché', async () => {
      const alice = await seedUser()
      await seedSubmittedApplication(alice.id)

      expect(await listApplicationsForAgent({ search: 'Neon' })).toHaveLength(1)
      expect(await listApplicationsForAgent({ search: 'introuvable' })).toHaveLength(0)
    })
  })

  describe('getApplicationForAgent', () => {
    it('renvoie une vue enrichie (email, téléphone, adminNote, auditLog) — jamais exposée au candidat', async () => {
      const alice = await seedUser()
      const app = await seedSubmittedApplication(alice.id)

      const result = await getApplicationForAgent(String(app._id))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.application.userEmail).toBe(alice.email)
      expect(result.application.userPhone).toBe('+22890000000')
      expect(result.application.auditLog).toHaveLength(1)
      expect(result.application.auditLog[0].action).toBe('submitted')
    })

    it('404 si le dossier n’existe pas', async () => {
      const result = await getApplicationForAgent(new mongoose.Types.ObjectId().toString())
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
    })
  })

  describe('moderateApplication', () => {
    it('approve : passe orgStatus=active, approvedAt posé, email envoyé, audit tracé', async () => {
      const alice = await seedUser()
      const app = await seedSubmittedApplication(alice.id)

      const result = await moderateApplication(AGENT, String(app._id), 'approve')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.application.status).toBe('approved')
      expect(result.application.approvedAt).not.toBeNull()

      const freshUser = await User.findById(alice.id).lean()
      expect(freshUser?.orgStatus).toBe('active')

      const freshApp = await Application.findById(app._id).lean()
      expect(freshApp?.auditLog.at(-1)?.action).toBe('approve')
      expect(freshApp?.auditLog.at(-1)?.by).toBe(AGENT.id)
      expect(sendEmail).toHaveBeenCalledTimes(1)
      expect(sendEmail.mock.calls[0][0]).toBe(alice.email)
    })

    it('reject : passe orgStatus=rejected, rejectionReason posé, email envoyé', async () => {
      const alice = await seedUser()
      const app = await seedSubmittedApplication(alice.id)

      const result = await moderateApplication(AGENT, String(app._id), 'reject', 'Documents illisibles')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.application.status).toBe('rejected')
      expect(result.application.rejectionReason).toBe('Documents illisibles')

      const freshUser = await User.findById(alice.id).lean()
      expect(freshUser?.orgStatus).toBe('rejected')
      expect(sendEmail).toHaveBeenCalledTimes(1)
    })

    it('request_changes : exige une note non vide', async () => {
      const alice = await seedUser()
      const app = await seedSubmittedApplication(alice.id)

      const empty = await moderateApplication(AGENT, String(app._id), 'request_changes', '   ')
      expect(empty.ok).toBe(false)
      if (empty.ok) return
      expect(empty.error).toBe('note_required')
      expect(sendEmail).not.toHaveBeenCalled()

      const result = await moderateApplication(AGENT, String(app._id), 'request_changes', 'Ajoute ton SIRET')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.application.status).toBe('needs_changes')
      expect(result.application.requestedChanges).toBe('Ajoute ton SIRET')
      expect(sendEmail).toHaveBeenCalledTimes(1)
    })

    it('under_review : transition sans email', async () => {
      const alice = await seedUser()
      const app = await seedSubmittedApplication(alice.id)

      const result = await moderateApplication(AGENT, String(app._id), 'under_review')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.application.status).toBe('under_review')
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('suspend puis reactivate : réutilise orgStatus=rejected/active, sans email', async () => {
      const alice = await seedUser({ orgStatus: 'active' })
      const app = await seedSubmittedApplication(alice.id, { status: 'approved', approvedAt: new Date() })

      const suspended = await moderateApplication(AGENT, String(app._id), 'suspend')
      expect(suspended.ok).toBe(true)
      if (!suspended.ok) return
      expect(suspended.application.status).toBe('suspended')
      let freshUser = await User.findById(alice.id).lean()
      expect(freshUser?.orgStatus).toBe('rejected')
      expect(sendEmail).not.toHaveBeenCalled()

      const reactivated = await moderateApplication(AGENT, String(app._id), 'reactivate')
      expect(reactivated.ok).toBe(true)
      if (!reactivated.ok) return
      expect(reactivated.application.status).toBe('approved')
      freshUser = await User.findById(alice.id).lean()
      expect(freshUser?.orgStatus).toBe('active')

      const freshApp = await Application.findById(app._id).lean()
      expect(freshApp?.auditLog.map((e) => e.action)).toEqual(expect.arrayContaining(['suspended', 'reactivated']))
    })

    it('refuse une transition invalide (ex: approve un dossier déjà rejeté)', async () => {
      const alice = await seedUser()
      const app = await seedSubmittedApplication(alice.id, { status: 'rejected', rejectedAt: new Date() })

      const result = await moderateApplication(AGENT, String(app._id), 'approve')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('invalid_status')
    })

    it('404 si le dossier n’existe pas', async () => {
      const result = await moderateApplication(AGENT, new mongoose.Types.ObjectId().toString(), 'approve')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
    })
  })

  describe('setApplicationAdminNote', () => {
    it('écrit la note interne sans la mêler à requestedChanges/rejectionReason', async () => {
      const alice = await seedUser()
      const app = await seedSubmittedApplication(alice.id)

      const result = await setApplicationAdminNote(String(app._id), 'À surveiller : deuxième candidature.')
      expect(result.ok).toBe(true)

      const freshApp = await Application.findById(app._id).lean()
      expect(freshApp?.adminNote).toBe('À surveiller : deuxième candidature.')
      expect(freshApp?.requestedChanges).toBe('')
    })

    it('404 si le dossier n’existe pas', async () => {
      const result = await setApplicationAdminNote(new mongoose.Types.ObjectId().toString(), 'note')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
    })
  })
})
