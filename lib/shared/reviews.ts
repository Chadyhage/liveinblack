// Port TypeScript de src/utils/reviews.js (partie PURE — la partie écriture
// réseau vit dans lib/server/providerReviews.ts, appelée par les Route
// Handlers plutôt que par fetch('/api/provider-reviews') côté client).
export const REVIEW_REPORT_REASONS = [
  { id: 'faux_avis', label: 'Faux avis' },
  { id: 'insultant', label: 'Contenu insultant' },
  { id: 'discriminatoire', label: 'Contenu discriminatoire' },
  { id: 'spam', label: 'Spam' },
  { id: 'info_personnelle', label: 'Information personnelle publiée' },
  { id: 'hors_sujet', label: 'Avis hors sujet' },
  { id: 'autre', label: 'Autre' },
] as const

export type ReviewReportReason = (typeof REVIEW_REPORT_REASONS)[number]['id']

export const REVIEW_COMMENT_MIN = 10
export const REVIEW_COMMENT_MAX = 1000

export interface ReviewStats {
  avg: number
  count: number
  dist: Record<1 | 2 | 3 | 4 | 5, number>
}

export function computeReviewStats(reviews: Array<{ rating?: number | null }> | null | undefined): ReviewStats {
  const list = (reviews ?? []).filter((r) => Number(r.rating) >= 1 && Number(r.rating) <= 5)
  const count = list.length
  const dist: ReviewStats['dist'] = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  list.forEach((r) => {
    const bucket = Math.round(Number(r.rating)) as 1 | 2 | 3 | 4 | 5
    dist[bucket] += 1
  })
  const avg = count ? Math.round((list.reduce((s, r) => s + Number(r.rating), 0) / count) * 10) / 10 : 0
  return { avg, count, dist }
}
