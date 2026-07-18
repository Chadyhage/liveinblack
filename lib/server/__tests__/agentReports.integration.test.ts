// Tests d'INTÉGRATION (vraie base MongoDB) pour la revue agent des
// signalements d'utilisateurs (#9 phase agent/admin, tâche #103 —
// lib/server/agentReports.ts). Même convention que
// applicationsAgent.integration.test.ts.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'

import { listReportsForAgent, markReportHandled, type AgentCaller } from '../agentReports'
import Report from '../../models/Report'

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
  await Report.deleteMany({})
})

async function seedReport(overrides: Record<string, unknown> = {}) {
  return Report.create({
    fromId: 'user-from',
    fromName: 'Alice',
    targetId: 'user-target',
    targetName: 'Bob',
    reason: 'Comportement déplacé en messagerie',
    ...overrides,
  })
}

describeIntegration('agentReports (intégration, vraie base) — #9 phase agent/admin', () => {
  describe('listReportsForAgent', () => {
    it('liste tous les signalements sans filtre, plus récent en premier', async () => {
      const first = await seedReport()
      await new Promise((r) => setTimeout(r, 5))
      const second = await seedReport({ reason: 'Deuxième signalement' })

      const results = await listReportsForAgent()
      expect(results).toHaveLength(2)
      expect(results[0].id).toBe(String(second._id))
      expect(results[1].id).toBe(String(first._id))
      expect(results[0].handled).toBe(false)
    })

    it('filtre status=open exclut les signalements traités', async () => {
      const open = await seedReport()
      const handled = await seedReport({ reason: 'Déjà traité', handled: true, handledAt: new Date(), handledBy: 'Agent X' })

      const openResults = await listReportsForAgent({ status: 'open' })
      expect(openResults.map((r) => r.id)).toEqual([String(open._id)])

      const handledResults = await listReportsForAgent({ status: 'handled' })
      expect(handledResults.map((r) => r.id)).toEqual([String(handled._id)])
    })
  })

  describe('markReportHandled', () => {
    it('marque un signalement ouvert comme traité, avec agent et note', async () => {
      const report = await seedReport()

      const result = await markReportHandled(AGENT, String(report._id), 'Compte averti')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.report.handled).toBe(true)
      expect(result.report.handledBy).toBe('Agent Test')
      expect(result.report.handledNote).toBe('Compte averti')
      expect(result.report.handledAt).not.toBeNull()

      const fresh = await Report.findById(report._id).lean()
      expect(fresh?.handled).toBe(true)
      expect(fresh?.handledBy).toBe('Agent Test')
    })

    it('note optionnelle : absente si non fournie', async () => {
      const report = await seedReport()

      const result = await markReportHandled(AGENT, String(report._id))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.report.handledNote).toBe('')
    })

    it('409 si déjà traité', async () => {
      const report = await seedReport({ handled: true, handledAt: new Date(), handledBy: 'Agent Y' })

      const result = await markReportHandled(AGENT, String(report._id))
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(409)
      expect(result.error).toBe('already_handled')
    })

    it('404 si le signalement n’existe pas', async () => {
      const result = await markReportHandled(AGENT, new mongoose.Types.ObjectId().toString())
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
    })
  })
})
