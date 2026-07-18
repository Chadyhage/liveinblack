// Tests d'INTÉGRATION (vraie base MongoDB) pour la config éditoriale
// « Actualité » de l'accueil (#9 phase agent/admin, lib/server/agentHomepageConfig.ts
// — port de src/utils/homepageConfig.js + ActualiteAdminPanel.jsx). Même
// convention que applicationsAgent.integration.test.ts : describeIntegration
// skip tant que MONGODB_URI n'est pas fourni.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'

import {
  getHomepageConfig,
  getPublicHomepageConfig,
  updateHomepageConfig,
  listCandidateEventsForActualite,
  resolveActualiteEventLabels,
  type AgentCaller,
} from '../agentHomepageConfig'
import HomepageConfig from '../../models/HomepageConfig'
import Event from '../../models/Event'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

const AGENT: AgentCaller = { id: 'agent-1' }

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
  await HomepageConfig.deleteMany({})
  await Event.deleteMany({})
})

function futureDate(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86400000)
  return d.toISOString().slice(0, 10)
}

async function seedEvent(overrides: Record<string, unknown> = {}) {
  return Event.create({
    name: 'Soirée Test',
    date: futureDate(10),
    time: '23:00',
    endTime: '05:00',
    city: 'Paris',
    createdBy: 'organizer-1',
    organizerId: 'organizer-1',
    ...overrides,
  })
}

describeIntegration('agentHomepageConfig (intégration, vraie base) — #9 phase agent/admin', () => {
  describe('getHomepageConfig / getPublicHomepageConfig', () => {
    it('renvoie la config par défaut quand aucun document n’existe', async () => {
      const cfg = await getHomepageConfig()
      expect(cfg).toEqual({
        active: false,
        title: "L'actu du moment",
        subtitle: 'Les temps forts à ne pas manquer',
        accent: 'teal',
        eventIds: [],
        updatedAt: null,
        updatedBy: '',
      })
    })

    it('lecture agent et lecture publique renvoient la même config', async () => {
      const ev = await seedEvent()
      await updateHomepageConfig(AGENT, { active: true, title: 'Le week-end', eventIds: [String(ev._id)] })

      const agentView = await getHomepageConfig()
      const publicView = await getPublicHomepageConfig()
      expect(publicView).toEqual(agentView)
      expect(publicView.active).toBe(true)
      expect(publicView.title).toBe('Le week-end')
    })
  })

  describe('updateHomepageConfig', () => {
    it('normalise à l’enregistrement : trim/cap le titre, cap le sous-titre, contraint l’accent', async () => {
      const cfg = await updateHomepageConfig(AGENT, {
        active: true,
        title: `  ${'x'.repeat(90)}  `,
        subtitle: 'y'.repeat(200),
        accent: 'not-a-real-accent',
        eventIds: [],
      })
      expect(cfg.title).toHaveLength(80)
      expect(cfg.title.startsWith('x')).toBe(true)
      expect(cfg.subtitle).toHaveLength(140)
      expect(cfg.accent).toBe('teal')
      expect(cfg.updatedBy).toBe('agent-1')
      expect(cfg.updatedAt).not.toBeNull()
    })

    it('un titre vide retombe sur le titre par défaut', async () => {
      const cfg = await updateHomepageConfig(AGENT, { title: '   ' })
      expect(cfg.title).toBe("L'actu du moment")
    })

    it('déduplique et plafonne eventIds à 12', async () => {
      const ids = Array.from({ length: 20 }, (_, i) => `evt-${i % 15}`)
      const cfg = await updateHomepageConfig(AGENT, { eventIds: ids })
      expect(cfg.eventIds.length).toBe(12)
      expect(new Set(cfg.eventIds).size).toBe(cfg.eventIds.length)
    })

    it('upsert : un second appel met à jour le même document singleton (jamais de doublon)', async () => {
      await updateHomepageConfig(AGENT, { active: true })
      await updateHomepageConfig(AGENT, { active: false })
      const count = await HomepageConfig.countDocuments({})
      expect(count).toBe(1)
    })
  })

  describe('listCandidateEventsForActualite', () => {
    it('ne propose que les événements découvrables : jamais annulé, jamais privé', async () => {
      const visible = await seedEvent({ name: 'Visible' })
      await seedEvent({ name: 'Annulé', cancelled: true })
      await seedEvent({ name: 'Privé', isPrivate: true })

      const candidates = await listCandidateEventsForActualite()
      expect(candidates.map((c) => c.id)).toEqual([String(visible._id)])
    })

    it('trie les candidats par date la plus proche', async () => {
      const later = await seedEvent({ name: 'Plus tard', date: futureDate(30) })
      const sooner = await seedEvent({ name: 'Bientôt', date: futureDate(5) })

      const candidates = await listCandidateEventsForActualite()
      expect(candidates.map((c) => c.id)).toEqual([String(sooner._id), String(later._id)])
    })
  })

  describe('resolveActualiteEventLabels', () => {
    it('résout le libellé d’un événement curé même s’il n’est plus découvrable (annulé)', async () => {
      const cancelledEvent = await seedEvent({ name: 'Devenu annulé', cancelled: true })
      const labels = await resolveActualiteEventLabels([String(cancelledEvent._id)])
      expect(labels[String(cancelledEvent._id)]?.name).toBe('Devenu annulé')
    })

    it('un id sans événement correspondant est absent de la map (« introuvable » côté UI)', async () => {
      const labels = await resolveActualiteEventLabels([new mongoose.Types.ObjectId().toString()])
      expect(Object.keys(labels)).toHaveLength(0)
    })

    it('renvoie un objet vide pour une liste d’ids vide, sans requête inutile', async () => {
      const labels = await resolveActualiteEventLabels([])
      expect(labels).toEqual({})
    })
  })
})
