// Tests d'INTÉGRATION (vraie base MongoDB) pour lib/server/providerReviews.ts
// (#8 phase prestataire — port de api/provider-reviews.js, actions 'create' |
// 'report' | 'reply' | 'delete_own'). La modération agent est hors périmètre
// (phase 9), voir le commentaire d'en-tête du module.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import {
  createReview,
  reportReview,
  replyToReview,
  deleteOwnReview,
  getPublishedReviews,
  getMyProviderReviews,
  getMyReviewFor,
} from '../providerReviews'
import Review from '../../models/Review'
import ReviewReport from '../../models/ReviewReport'
import ProviderProfile from '../../models/ProviderProfile'
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
  await Review.deleteMany({})
  await ReviewReport.deleteMany({})
  await ProviderProfile.deleteMany({})
  await User.deleteMany({})
})

async function seedUser(overrides: Record<string, unknown> = {}) {
  const user = await User.create({
    email: `${new mongoose.Types.ObjectId().toString()}@test.com`,
    passwordHash: 'x',
    firstName: 'Ada',
    lastName: 'Lovelace',
    roles: ['client'],
    activeRole: 'client',
    ...overrides,
  })
  return String(user._id)
}

async function seedProvider(userId: string, overrides: Record<string, unknown> = {}) {
  return ProviderProfile.create({ userId, name: 'DJ Kayo', subscriptionActive: true, ...overrides })
}

const VALID_COMMENT = 'Super prestation, très professionnel et à l’écoute.'

describeIntegration('createReview', () => {
  it('refuse de se noter soi-même', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const result = await createReview({ id: providerId }, { providerId, rating: 5, comment: VALID_COMMENT })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('cannot_review_self')
  })

  it('refuse une note hors 1-5 ou non entière', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()
    const result = await createReview({ id: buyerId }, { providerId, rating: 4.5, comment: VALID_COMMENT })
    expect(result.ok).toBe(false)
  })

  it('refuse un commentaire trop court', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()
    const result = await createReview({ id: buyerId }, { providerId, rating: 5, comment: 'top' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('comment_too_short')
  })

  it('refuse si le prestataire est introuvable', async () => {
    const buyerId = await seedUser()
    const result = await createReview({ id: buyerId }, { providerId: 'does-not-exist', rating: 5, comment: VALID_COMMENT })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('provider_not_found')
  })

  it('publie un avis, verified toujours false, et recalcule la moyenne du prestataire', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()

    const result = await createReview({ id: buyerId }, { providerId, rating: 4, comment: VALID_COMMENT })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.review.status).toBe('published')
    expect(result.review.verified).toBe(false)
    expect(result.review.edited).toBe(false)

    const profile = await ProviderProfile.findOne({ userId: providerId }).lean()
    expect(profile?.ratingAvg).toBe(4)
    expect(profile?.ratingCount).toBe(1)
  })

  it('un second appel du même auteur MODIFIE son avis existant (edited=true, createdAt conservé)', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()

    const first = await createReview({ id: buyerId }, { providerId, rating: 3, comment: VALID_COMMENT })
    if (!first.ok) throw new Error('setup failed')

    const second = await createReview({ id: buyerId }, { providerId, rating: 5, comment: `${VALID_COMMENT} Édité.` })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.review.id).toBe(first.review.id)
    expect(second.review.edited).toBe(true)
    expect(second.review.createdAt).toBe(first.review.createdAt)
    expect(second.review.rating).toBe(5)

    expect(await Review.countDocuments({ providerId, authorId: buyerId })).toBe(1)
  })

  it('refuse de réécrire un avis masqué par la modération', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()
    const created = await createReview({ id: buyerId }, { providerId, rating: 1, comment: VALID_COMMENT })
    if (!created.ok) throw new Error('setup failed')
    await Review.updateOne({ _id: created.review.id }, { $set: { status: 'hidden' } })

    const result = await createReview({ id: buyerId }, { providerId, rating: 5, comment: VALID_COMMENT })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('review_hidden')
  })

  it('reposter après suppression de son propre avis repart à zéro (pas un "edit")', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()
    const created = await createReview({ id: buyerId }, { providerId, rating: 2, comment: VALID_COMMENT })
    if (!created.ok) throw new Error('setup failed')
    await deleteOwnReview({ id: buyerId }, created.review.id)

    const result = await createReview({ id: buyerId }, { providerId, rating: 5, comment: VALID_COMMENT })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.review.edited).toBe(false)
  })
})

describeIntegration('reportReview', () => {
  it('refuse de signaler son propre avis', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()
    const created = await createReview({ id: buyerId }, { providerId, rating: 3, comment: VALID_COMMENT })
    if (!created.ok) throw new Error('setup failed')

    const result = await reportReview({ id: buyerId }, { reviewId: created.review.id, reason: 'spam' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('cannot_report_own_review')
  })

  it('refuse un second signalement de la même personne (dédup)', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()
    const reporterId = await seedUser()
    const created = await createReview({ id: buyerId }, { providerId, rating: 3, comment: VALID_COMMENT })
    if (!created.ok) throw new Error('setup failed')

    const first = await reportReview({ id: reporterId }, { reviewId: created.review.id, reason: 'spam' })
    expect(first.ok).toBe(true)
    const second = await reportReview({ id: reporterId }, { reviewId: created.review.id, reason: 'insultant' })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error).toBe('already_reported')
  })

  it('masque automatiquement un avis à 3 signalements distincts et recalcule la moyenne', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()
    const created = await createReview({ id: buyerId }, { providerId, rating: 1, comment: VALID_COMMENT })
    if (!created.ok) throw new Error('setup failed')

    for (let i = 0; i < 3; i++) {
      const reporterId = await seedUser()
      const result = await reportReview({ id: reporterId }, { reviewId: created.review.id, reason: 'spam' })
      expect(result.ok).toBe(true)
    }

    const fresh = await Review.findById(created.review.id).lean()
    expect(fresh?.status).toBe('hidden')
    expect(fresh?.hiddenBy).toBe('auto')

    const profile = await ProviderProfile.findOne({ userId: providerId }).lean()
    expect(profile?.ratingCount).toBe(0)
  })
})

describeIntegration('replyToReview', () => {
  it('seul le prestataire concerné peut répondre', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()
    const stranger = await seedUser()
    const created = await createReview({ id: buyerId }, { providerId, rating: 4, comment: VALID_COMMENT })
    if (!created.ok) throw new Error('setup failed')

    const result = await replyToReview({ id: stranger }, { reviewId: created.review.id, text: 'Merci !' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('forbidden')
  })

  it('publie puis modifie la réponse (une seule, éditable)', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()
    const created = await createReview({ id: buyerId }, { providerId, rating: 4, comment: VALID_COMMENT })
    if (!created.ok) throw new Error('setup failed')

    const first = await replyToReview({ id: providerId }, { reviewId: created.review.id, text: 'Merci beaucoup !' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const createdAt = first.reply.createdAt

    const second = await replyToReview({ id: providerId }, { reviewId: created.review.id, text: 'Merci beaucoup, à bientôt !' })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.reply.text).toBe('Merci beaucoup, à bientôt !')
    expect(second.reply.createdAt).toBe(createdAt)
  })
})

describeIntegration('deleteOwnReview', () => {
  it("seul l'auteur peut retirer son avis", async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()
    const stranger = await seedUser()
    const created = await createReview({ id: buyerId }, { providerId, rating: 4, comment: VALID_COMMENT })
    if (!created.ok) throw new Error('setup failed')

    const result = await deleteOwnReview({ id: stranger }, created.review.id)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('forbidden')
  })

  it('retire un avis et exclut sa note de la moyenne recalculée', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()
    const created = await createReview({ id: buyerId }, { providerId, rating: 2, comment: VALID_COMMENT })
    if (!created.ok) throw new Error('setup failed')

    const result = await deleteOwnReview({ id: buyerId }, created.review.id)
    expect(result.ok).toBe(true)

    const profile = await ProviderProfile.findOne({ userId: providerId }).lean()
    expect(profile?.ratingCount).toBe(0)
  })
})

describeIntegration('Lectures', () => {
  it('getPublishedReviews ne retourne que les avis publiés, plus récents en premier', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyer1 = await seedUser()
    const buyer2 = await seedUser()
    const r1 = await createReview({ id: buyer1 }, { providerId, rating: 3, comment: VALID_COMMENT })
    const r2 = await createReview({ id: buyer2 }, { providerId, rating: 5, comment: VALID_COMMENT })
    if (!r1.ok || !r2.ok) throw new Error('setup failed')
    await deleteOwnReview({ id: buyer1 }, r1.review.id)

    const published = await getPublishedReviews(providerId)
    expect(published).toHaveLength(1)
    expect(published[0].id).toBe(r2.review.id)
  })

  it('getMyProviderReviews inclut les avis masqués mais exclut les supprimés', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyer1 = await seedUser()
    const buyer2 = await seedUser()
    const r1 = await createReview({ id: buyer1 }, { providerId, rating: 1, comment: VALID_COMMENT })
    const r2 = await createReview({ id: buyer2 }, { providerId, rating: 5, comment: VALID_COMMENT })
    if (!r1.ok || !r2.ok) throw new Error('setup failed')
    await Review.updateOne({ _id: r1.review.id }, { $set: { status: 'hidden' } })
    const buyer3 = await seedUser()
    const r3 = await createReview({ id: buyer3 }, { providerId, rating: 2, comment: VALID_COMMENT })
    if (!r3.ok) throw new Error('setup failed')
    await deleteOwnReview({ id: buyer3 }, r3.review.id)

    const mine = await getMyProviderReviews({ id: providerId })
    expect(mine.map((r) => r.id).sort()).toEqual([r1.review.id, r2.review.id].sort())
  })

  it('getMyReviewFor retrouve l’avis laissé par cet acheteur sur ce prestataire', async () => {
    const providerId = await seedUser()
    await seedProvider(providerId)
    const buyerId = await seedUser()
    const created = await createReview({ id: buyerId }, { providerId, rating: 4, comment: VALID_COMMENT })
    if (!created.ok) throw new Error('setup failed')

    const mine = await getMyReviewFor({ id: buyerId }, providerId)
    expect(mine?.id).toBe(created.review.id)

    const other = await seedUser()
    expect(await getMyReviewFor({ id: other }, providerId)).toBeNull()
  })
})
