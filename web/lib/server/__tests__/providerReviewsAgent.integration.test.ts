// Tests d'INTÉGRATION (vraie base MongoDB) pour la modération agent des avis
// prestataires (#9 phase agent/admin — lib/server/providerReviews.ts,
// fonctions listReviewsForAgent/moderateReview). Modelé exactement sur
// applicationsAgent.integration.test.ts. Pas d'email envoyé pour cette
// fonctionnalité (voir l'en-tête de providerReviews.ts — gap noté,
// délibérément non reconstruit), donc rien à mocker ici.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'

import { listReviewsForAgent, moderateReview, type ReviewModerationCaller } from '../providerReviews'
import Review from '../../models/Review'
import ReviewReport from '../../models/ReviewReport'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

const AGENT: ReviewModerationCaller = { id: 'agent-1' }

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
  await Review.deleteMany({})
  await ReviewReport.deleteMany({})
})

async function seedReview(overrides: Record<string, unknown> = {}) {
  return Review.create({
    providerId: 'provider-1',
    providerName: 'DJ Nova',
    authorId: `author-${Math.random().toString(36).slice(2)}`,
    authorName: 'Client Test',
    rating: 4,
    comment: 'Très bonne prestation, ponctuel et pro.',
    status: 'published',
    verified: false,
    edited: false,
    ...overrides,
  })
}

async function seedReport(reviewId: string, overrides: Record<string, unknown> = {}) {
  return ReviewReport.create({
    reviewId,
    reporterId: `reporter-${Math.random().toString(36).slice(2)}`,
    reporterName: 'Membre Test',
    reason: 'insultant',
    details: '',
    status: 'open',
    ...overrides,
  })
}

describeIntegration('provider reviews agent (intégration, vraie base) — #9 phase agent/admin', () => {
  describe('listReviewsForAgent', () => {
    it('liste tous les avis, quel que soit leur statut', async () => {
      await seedReview({ status: 'published' })
      await seedReview({ status: 'hidden' })
      await seedReview({ status: 'deleted' })

      const results = await listReviewsForAgent()
      expect(results).toHaveLength(3)
    })

    it('inclut les signalements groupés par avis et trie les signalés-non-supprimés en tête', async () => {
      const untouched = await seedReview({ updatedAt: new Date('2026-01-01') })
      const reported = await seedReview({ reportCount: 2, updatedAt: new Date('2026-01-02') })
      await seedReport(String(reported._id), { reason: 'spam' })
      await seedReport(String(reported._id), { reason: 'faux_avis' })

      const results = await listReviewsForAgent()
      expect(results).toHaveLength(2)
      expect(results[0].id).toBe(String(reported._id))
      expect(results[0].reports).toHaveLength(2)
      expect(results[0].reports.map((r) => r.reason)).toEqual(expect.arrayContaining(['spam', 'faux_avis']))
      expect(results[1].id).toBe(String(untouched._id))
      expect(results[1].reports).toHaveLength(0)
    })

    it('un avis supprimé et signalé ne compte pas comme "signalé" pour le tri prioritaire', async () => {
      const deletedReported = await seedReview({ status: 'deleted', reportCount: 5, updatedAt: new Date('2026-01-01') })
      const publishedRecent = await seedReview({ status: 'published', reportCount: 0, updatedAt: new Date('2026-01-05') })

      const results = await listReviewsForAgent()
      expect(results[0].id).toBe(String(publishedRecent._id))
      expect(results[1].id).toBe(String(deletedReported._id))
    })
  })

  describe('moderateReview', () => {
    it('hide : passe le statut à hidden, pose hiddenBy=agent, referme les signalements ouverts en action_taken, recalcule la note', async () => {
      const review = await seedReview({ reportCount: 1 })
      await seedReport(String(review._id))

      const result = await moderateReview(AGENT, String(review._id), 'hide')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.review.status).toBe('hidden')
      expect(result.review.hiddenBy).toBe(AGENT.id)

      const freshReports = await ReviewReport.find({ reviewId: String(review._id) }).lean()
      expect(freshReports.every((r) => r.status === 'action_taken')).toBe(true)
      expect(freshReports[0].reviewedBy).toBe(AGENT.id)
    })

    it('publish : republie et referme les signalements ouverts en dismissed', async () => {
      const review = await seedReview({ status: 'hidden', hiddenAt: new Date(), hiddenBy: 'auto', reportCount: 1 })
      await seedReport(String(review._id))

      const result = await moderateReview(AGENT, String(review._id), 'publish')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.review.status).toBe('published')
      expect(result.review.hiddenBy).toBeNull()

      const freshReports = await ReviewReport.find({ reviewId: String(review._id) }).lean()
      expect(freshReports.every((r) => r.status === 'dismissed')).toBe(true)
    })

    it('delete : passe deleted, pose deletedBy=agent, referme les signalements ouverts en action_taken', async () => {
      const review = await seedReview({ reportCount: 1 })
      await seedReport(String(review._id))

      const result = await moderateReview(AGENT, String(review._id), 'delete')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.review.status).toBe('deleted')
      expect(result.review.deletedBy).toBe(AGENT.id)

      const freshReports = await ReviewReport.find({ reviewId: String(review._id) }).lean()
      expect(freshReports.every((r) => r.status === 'action_taken')).toBe(true)
    })

    it('note : écrit adminNote sans changer le statut ni toucher aux signalements ouverts', async () => {
      const review = await seedReview({ reportCount: 1 })
      await seedReport(String(review._id))

      const result = await moderateReview(AGENT, String(review._id), 'note', 'À surveiller.')
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.review.status).toBe('published')
      expect(result.review.adminNote).toBe('À surveiller.')

      const freshReports = await ReviewReport.find({ reviewId: String(review._id) }).lean()
      expect(freshReports[0].status).toBe('open')
    })

    it('note : exige une note non vide', async () => {
      const review = await seedReview()

      const empty = await moderateReview(AGENT, String(review._id), 'note', '   ')
      expect(empty.ok).toBe(false)
      if (empty.ok) return
      expect(empty.error).toBe('note_required')
    })

    it('404 si l’avis n’existe pas', async () => {
      const result = await moderateReview(AGENT, new mongoose.Types.ObjectId().toString(), 'hide')
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.status).toBe(404)
    })
  })
})
