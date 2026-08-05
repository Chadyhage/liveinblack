import { getDb } from '../db/mongoose'
import Review, { type ReviewDoc } from '../models/Review'
import ReviewReport from '../models/ReviewReport'
import ProviderProfile from '../models/ProviderProfile'
import User from '../models/User'
import { REVIEW_COMMENT_MIN, REVIEW_COMMENT_MAX, type ReviewReportReason } from '../shared/reviews'

// Remplace api/provider-reviews.js (actions 'create' | 'report' | 'reply' |
// 'delete_own') — avis clients sur les pages prestataires. La modération
// agent ('admin_moderate') est HORS PÉRIMÈTRE de cette phase 8 : elle
// appartient à la phase 9 (outils agent/admin), pas encore construite dans
// cette migration ; le seuil AUTO_HIDE_REPORTS ci-dessous reste le seul
// filet de sécurité tant qu'elle n'existe pas.
//
// Notifications in-app ('review_received'/'review_reply'/'review_hidden'
// côté legacy) : cette migration n'a pas encore de centre de notifications
// in-app (même gap déjà noté dans organizerFollows.ts et
// providerSubscriptions.ts) — délibérément non reconstruites ici plutôt que
// d'inventer un canal (email) que le produit original n'utilisait pas pour
// cet événement.

export interface ReviewCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

const REPLY_MAX = 1000
const DETAILS_MAX = 500
const AUTO_HIDE_REPORTS = 3

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

// Caractères de contrôle retirés, lignes vides compressées — React échappe
// le HTML au rendu, on ne stocke juste jamais de bruit binaire.
function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

export interface ReviewView {
  id: string
  providerId: string
  providerName: string
  authorId: string
  authorName: string
  rating: number
  comment: string
  status: 'published' | 'hidden' | 'deleted'
  verified: boolean
  reply: { text: string; createdAt: string | null; updatedAt: string | null } | null
  reportCount: number
  edited: boolean
  createdAt: string
  updatedAt: string
}

function toReviewView(review: ReviewDoc & { _id: unknown }): ReviewView {
  const reply = review.reply?.text
    ? { text: review.reply.text, createdAt: review.reply.createdAt ? new Date(review.reply.createdAt).toISOString() : null, updatedAt: review.reply.updatedAt ? new Date(review.reply.updatedAt).toISOString() : null }
    : null
  return {
    id: String(review._id),
    providerId: review.providerId,
    providerName: review.providerName ?? '',
    authorId: review.authorId,
    authorName: review.authorName ?? '',
    rating: review.rating,
    comment: review.comment ?? '',
    status: review.status as ReviewView['status'],
    verified: Boolean(review.verified),
    reply,
    reportCount: review.reportCount ?? 0,
    edited: Boolean(review.edited),
    createdAt: new Date(review.createdAt as unknown as Date).toISOString(),
    updatedAt: new Date(review.updatedAt as unknown as Date).toISOString(),
  }
}

async function recomputeProviderRating(providerId: string): Promise<void> {
  const published = await Review.find({ providerId, status: 'published' }).select('rating').lean()
  const ratings = published.map((r) => Number(r.rating)).filter((r) => r >= 1 && r <= 5)
  const count = ratings.length
  const avg = count ? Math.round((ratings.reduce((s, r) => s + r, 0) / count) * 10) / 10 : 0
  await ProviderProfile.updateOne({ userId: providerId }, { $set: { ratingAvg: avg, ratingCount: count } })
}

// ── Lectures ──────────────────────────────────────────────────────────────────

export async function getPublishedReviews(providerId: string): Promise<ReviewView[]> {
  await getDb()
  const docs = await Review.find({ providerId, status: 'published' }).sort({ createdAt: -1 }).lean()
  return docs.map((d) => toReviewView(d as ReviewDoc & { _id: unknown }))
}

// Tous les avis REÇUS par moi (dashboard prestataire) — publiés + masqués,
// jamais les avis supprimés par leur auteur.
export async function getMyProviderReviews(caller: ReviewCaller): Promise<ReviewView[]> {
  await getDb()
  const docs = await Review.find({ providerId: caller.id, status: { $ne: 'deleted' } }).sort({ createdAt: -1 }).lean()
  return docs.map((d) => toReviewView(d as ReviewDoc & { _id: unknown }))
}

// L'avis que J'AI laissé sur ce prestataire — préremplissage "Modifier mon avis".
export async function getMyReviewFor(caller: ReviewCaller, providerId: string): Promise<ReviewView | null> {
  await getDb()
  const doc = await Review.findOne({ providerId, authorId: caller.id, status: { $ne: 'deleted' } }).lean()
  return doc ? toReviewView(doc as ReviewDoc & { _id: unknown }) : null
}

// ── Publier / modifier son avis ───────────────────────────────────────────────

export interface CreateReviewInput {
  providerId: string
  rating: number
  comment: string
}

export type CreateReviewResult = ErrResult | { ok: true; review: ReviewView }

export async function createReview(caller: ReviewCaller, input: CreateReviewInput): Promise<CreateReviewResult> {
  await getDb()

  const providerId = String(input.providerId || '')
  const rating = Number(input.rating)
  const comment = cleanText(input.comment, REVIEW_COMMENT_MAX)

  if (!providerId) return { ok: false, status: 400, error: 'provider_id_required' }
  if (providerId === caller.id) return { ok: false, status: 403, error: 'cannot_review_self' }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, status: 400, error: 'invalid_rating' }
  if (comment.length < REVIEW_COMMENT_MIN) return { ok: false, status: 400, error: 'comment_too_short' }

  const provider = await ProviderProfile.findOne({ userId: providerId }).lean()
  if (!provider) return { ok: false, status: 404, error: 'provider_not_found' }

  const author = await User.findById(caller.id).lean()
  const authorName = [author?.firstName, author?.lastName].filter(Boolean).join(' ').trim() || 'Membre LIVE IN BLACK'

  const existing = await Review.findOne({ providerId, authorId: caller.id })
  // Un avis masqué par la modération ne peut pas être "réécrit propre" par
  // son auteur — le masquage tomberait à la première édition.
  if (existing && existing.status === 'hidden') return { ok: false, status: 403, error: 'review_hidden' }

  const now = new Date()
  const isEdit = Boolean(existing) && existing!.status === 'published'

  if (existing) {
    existing.providerName = provider.name || 'Prestataire'
    existing.authorName = authorName
    existing.rating = rating
    existing.comment = comment
    existing.status = 'published'
    // Toujours false dans cette migration — voir le commentaire sur le champ
    // dans lib/models/Review.ts (aucun système de commande de prestation).
    existing.verified = false
    if (!isEdit) {
      existing.reply = { text: '', createdAt: null, updatedAt: null }
      existing.reportCount = 0
    }
    existing.edited = isEdit
    if (!isEdit) existing.createdAt = now
    await existing.save()
    await recomputeProviderRating(providerId)
    return { ok: true, review: toReviewView(existing.toObject()) }
  }

  const created = await Review.create({
    providerId,
    providerName: provider.name || 'Prestataire',
    authorId: caller.id,
    authorName,
    rating,
    comment,
    status: 'published',
    verified: false,
    edited: false,
  })
  await recomputeProviderRating(providerId)
  return { ok: true, review: toReviewView(created.toObject()) }
}

// ── Signaler un avis ──────────────────────────────────────────────────────────

export interface ReportReviewInput {
  reviewId: string
  reason: ReviewReportReason | string
  details?: string
}

export type ReportReviewResult = ErrResult | { ok: true }

export async function reportReview(caller: ReviewCaller, input: ReportReviewInput): Promise<ReportReviewResult> {
  await getDb()

  const reviewId = String(input.reviewId || '')
  if (!reviewId) return { ok: false, status: 400, error: 'review_id_required' }

  const review = await Review.findById(reviewId)
  if (!review) return { ok: false, status: 404, error: 'review_not_found' }
  if (review.status !== 'published') return { ok: false, status: 409, error: 'review_not_published' }
  if (review.authorId === caller.id) return { ok: false, status: 400, error: 'cannot_report_own_review' }

  const reporter = await User.findById(caller.id).select('firstName lastName').lean()
  const reporterName = [reporter?.firstName, reporter?.lastName].filter(Boolean).join(' ').trim() || 'Membre'

  try {
    await ReviewReport.create({
      reviewId,
      reporterId: caller.id,
      reporterName,
      reason: String(input.reason || ''),
      details: cleanText(input.details, DETAILS_MAX),
      status: 'open',
    })
  } catch (err) {
    if (isDuplicateKeyError(err)) return { ok: false, status: 409, error: 'already_reported' }
    throw err
  }

  // $inc puis lecture-conditionnelle du seuil : deux signalements concurrents
  // au pire comptent tous les deux (jamais perdus, l'index unique empêche
  // déjà le doublon d'UNE même personne) — au pire un masquage déclenché un
  // cran plus tard qu'idéal, jamais un avis qui reste visible à tort.
  const updated = await Review.findByIdAndUpdate(reviewId, { $inc: { reportCount: 1 } }, { new: true })
  if (updated && updated.reportCount >= AUTO_HIDE_REPORTS && updated.status === 'published') {
    updated.status = 'hidden'
    updated.hiddenAt = new Date()
    updated.hiddenBy = 'auto'
    await updated.save()
    await recomputeProviderRating(updated.providerId)
  }

  return { ok: true }
}

// ── Réponse du prestataire (une seule, modifiable) ────────────────────────────

export interface ReplyToReviewInput {
  reviewId: string
  text: string
}

export type ReplyToReviewResult = ErrResult | { ok: true; reply: { text: string; createdAt: string; updatedAt: string } }

export async function replyToReview(caller: ReviewCaller, input: ReplyToReviewInput): Promise<ReplyToReviewResult> {
  await getDb()

  const reviewId = String(input.reviewId || '')
  const text = cleanText(input.text, REPLY_MAX)
  if (!reviewId) return { ok: false, status: 400, error: 'review_id_required' }
  if (!text) return { ok: false, status: 400, error: 'reply_empty' }

  const review = await Review.findById(reviewId)
  if (!review) return { ok: false, status: 404, error: 'review_not_found' }
  if (review.providerId !== caller.id) return { ok: false, status: 403, error: 'forbidden' }
  if (review.status === 'deleted') return { ok: false, status: 409, error: 'review_deleted' }

  const now = new Date()
  review.reply = { text, createdAt: review.reply?.createdAt ?? now, updatedAt: now } as typeof review.reply
  await review.save()

  return { ok: true, reply: { text, createdAt: (review.reply!.createdAt as Date).toISOString(), updatedAt: now.toISOString() } }
}

// ── L'auteur retire son avis ──────────────────────────────────────────────────

export type DeleteOwnReviewResult = ErrResult | { ok: true }

export async function deleteOwnReview(caller: ReviewCaller, reviewId: string): Promise<DeleteOwnReviewResult> {
  await getDb()

  const review = await Review.findById(reviewId)
  if (!review) return { ok: false, status: 404, error: 'review_not_found' }
  if (review.authorId !== caller.id) return { ok: false, status: 403, error: 'forbidden' }

  review.status = 'deleted'
  review.deletedAt = new Date()
  await review.save()
  await recomputeProviderRating(review.providerId)

  return { ok: true }
}

// ──────────────────────────── Modération agent (#9 phase agent/admin) ───────
// Port de l'action 'admin_moderate' de api/provider-reviews.js — ferme le
// gap laissé ouvert par la tâche #89 (AUTO_HIDE_REPORTS restait le seul
// filet de sécurité). Le contrôle « l'appelant est bien un agent » se fait à
// la couche route (requireAgent, lib/server/agentGuard.ts), comme partout
// ailleurs dans ce port.
//
// Notification à l'auteur quand un avis est masqué par un agent
// ('review_hidden' côté legacy) : cette migration n'a toujours pas de centre
// de notifications in-app (même gap déjà noté dans providerSubscriptions.ts,
// organizerFollows.ts, et plus haut dans ce fichier pour
// 'review_received'/'review_reply') — délibérément non reconstruite ici.

export interface ReviewReportView {
  id: string
  reason: string
  details: string
  reporterName: string
  status: 'open' | 'dismissed' | 'action_taken'
  createdAt: string
}

export interface AgentReviewView extends ReviewView {
  adminNote: string
  hiddenBy: string | null
  deletedBy: string | null
  reports: ReviewReportView[]
}

function toReviewReportView(report: { _id: unknown; reason: string; details?: string; reporterName?: string; status: string; createdAt: unknown }): ReviewReportView {
  return {
    id: String(report._id),
    reason: report.reason,
    details: report.details ?? '',
    reporterName: report.reporterName ?? '',
    status: report.status as ReviewReportView['status'],
    createdAt: new Date(report.createdAt as unknown as Date).toISOString(),
  }
}

// Signalés (non supprimés) d'abord, puis plus récents — port fidèle du tri
// de AdminReviewsPanel.jsx (appliqué là-bas après filtrage côté client ; ici
// la liste agent est volontairement non filtrée côté serveur — même
// convention que listApplicationsForAgent, filtre/recherche/tri côté client
// pour permettre un compteur "signalés" global non affecté par le filtre actif).
function sortForAgent(views: AgentReviewView[]): AgentReviewView[] {
  return [...views].sort((a, b) => {
    const ra = a.status !== 'deleted' && a.reportCount > 0 ? 1 : 0
    const rb = b.status !== 'deleted' && b.reportCount > 0 ? 1 : 0
    if (ra !== rb) return rb - ra
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

export async function listReviewsForAgent(): Promise<AgentReviewView[]> {
  await getDb()

  const reviews = await Review.find({}).lean()
  const reviewIds = reviews.map((r) => String(r._id))
  const reports = await ReviewReport.find({ reviewId: { $in: reviewIds } }).sort({ createdAt: -1 }).lean()

  const reportsByReview = new Map<string, typeof reports>()
  for (const report of reports) {
    const list = reportsByReview.get(report.reviewId) ?? []
    list.push(report)
    reportsByReview.set(report.reviewId, list)
  }

  const views = reviews.map((review) => {
    const base = toReviewView(review as ReviewDoc & { _id: unknown })
    const reps = reportsByReview.get(String(review._id)) ?? []
    return {
      ...base,
      adminNote: review.adminNote ?? '',
      hiddenBy: review.hiddenBy ?? null,
      deletedBy: review.deletedBy ?? null,
      reports: reps.map(toReviewReportView),
    }
  })

  return sortForAgent(views)
}

export interface ReviewModerationCaller {
  id: string
}

export type ReviewModerationOp = 'hide' | 'publish' | 'delete' | 'note'

export type ModerateReviewResult = ErrResult | { ok: true; review: AgentReviewView }

export async function moderateReview(agent: ReviewModerationCaller, reviewId: string, op: ReviewModerationOp, note?: string): Promise<ModerateReviewResult> {
  await getDb()

  const trimmedNote = note !== undefined ? cleanText(note, DETAILS_MAX) : undefined
  if (op === 'note' && !trimmedNote) return { ok: false, status: 400, error: 'note_required' }

  const review = await Review.findById(reviewId)
  if (!review) return { ok: false, status: 404, error: 'review_not_found' }

  const now = new Date()

  switch (op) {
    case 'hide':
      review.status = 'hidden'
      review.hiddenAt = now
      review.hiddenBy = agent.id
      break
    case 'publish':
      review.status = 'published'
      review.hiddenAt = null
      review.hiddenBy = null
      break
    case 'delete':
      review.status = 'deleted'
      review.deletedAt = now
      review.deletedBy = agent.id
      break
    case 'note':
      break
  }
  if (trimmedNote !== undefined) review.adminNote = trimmedNote
  await review.save()

  if (op !== 'note') {
    // Un signalement ouvert se referme comme conséquence de la décision sur
    // l'avis — jamais d'action indépendante « traiter CE signalement » côté
    // legacy (voir recherche #98) : publier = signalements infondés
    // (dismissed), masquer/supprimer = signalements fondés (action_taken).
    await ReviewReport.updateMany(
      { reviewId, status: 'open' },
      { $set: { status: op === 'publish' ? 'dismissed' : 'action_taken', reviewedAt: now, reviewedBy: agent.id } }
    )
    await recomputeProviderRating(review.providerId)
  }

  const reports = await ReviewReport.find({ reviewId }).sort({ createdAt: -1 }).lean()
  return {
    ok: true,
    review: {
      ...toReviewView(review.toObject()),
      adminNote: review.adminNote ?? '',
      hiddenBy: review.hiddenBy ?? null,
      deletedBy: review.deletedBy ?? null,
      reports: reports.map(toReviewReportView),
    },
  }
}
