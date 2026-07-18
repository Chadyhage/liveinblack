// Avis clients sur les prestataires — pendant client d'api/provider-reviews.js.
// Lectures : Firestore direct (les avis publiés sont publics, comme providers/).
// Écritures : TOUJOURS via l'API (Admin SDK) — les règles refusent le write
// client, donc note/statut/badge vérifié ne peuvent pas être forgés.

import { authHeaders } from './apiAuth'

export const REVIEW_REPORT_REASONS = [
  { id: 'faux_avis', label: 'Faux avis' },
  { id: 'insultant', label: 'Contenu insultant' },
  { id: 'discriminatoire', label: 'Contenu discriminatoire' },
  { id: 'spam', label: 'Spam' },
  { id: 'info_personnelle', label: 'Information personnelle publiée' },
  { id: 'hors_sujet', label: 'Avis hors sujet' },
  { id: 'autre', label: 'Autre' },
]

export const REVIEW_COMMENT_MIN = 10
export const REVIEW_COMMENT_MAX = 1000

// ── Lectures ──────────────────────────────────────────────────────────────────

// Avis PUBLIÉS d'un prestataire (page publique). Tri : plus récents d'abord.
export async function fetchPublishedReviews(providerId) {
  if (!providerId) return []
  const { loadCollection } = await import('./firestore-sync')
  const { where } = await import('firebase/firestore')
  const items = await loadCollection('provider_reviews', [
    where('providerId', '==', providerId),
    where('status', '==', 'published'),
  ])
  return items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
}

// Tous les avis reçus par MOI (dashboard prestataire) — publiés + masqués.
export async function fetchMyProviderReviews(providerId) {
  if (!providerId) return { ok: false, items: [] }
  const { loadCollectionStrict } = await import('./firestore-sync')
  const { where } = await import('firebase/firestore')
  const res = await loadCollectionStrict('provider_reviews', [
    where('providerId', '==', providerId),
  ])
  return {
    ...res,
    items: res.items
      .filter(r => r.status !== 'deleted')
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
  }
}

// L'avis que J'AI laissé sur ce prestataire (pré-remplissage « Modifier mon avis »).
export async function fetchMyReviewFor(providerId, uid) {
  if (!providerId || !uid) return null
  const { loadDoc } = await import('./firestore-sync')
  const doc = await loadDoc(`provider_reviews/${providerId}__${uid}`)
  return doc && doc.status !== 'deleted' ? doc : null
}

// ── Statistiques ──────────────────────────────────────────────────────────────

export function computeReviewStats(reviews) {
  const list = (reviews || []).filter(r => Number(r.rating) >= 1 && Number(r.rating) <= 5)
  const count = list.length
  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  list.forEach(r => { dist[Math.round(Number(r.rating))] += 1 })
  const avg = count ? Math.round((list.reduce((s, r) => s + Number(r.rating), 0) / count) * 10) / 10 : 0
  return { avg, count, dist }
}

// ── Écritures (API serveur) ───────────────────────────────────────────────────

async function callReviewsApi(payload) {
  try {
    const r = await fetch('/api/provider-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(payload),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, status: r.status, error: data.error || 'Une erreur est survenue.' }
    return { ok: true, ...data }
  } catch {
    return { ok: false, status: 0, error: 'Connexion impossible — vérifie ton réseau et réessaie.' }
  }
}

export function submitReview({ providerId, rating, comment }) {
  return callReviewsApi({ action: 'create', providerId, rating, comment })
}

export function reportReview({ reviewId, reason, details }) {
  return callReviewsApi({ action: 'report', reviewId, reason, details })
}

export function replyToReview({ reviewId, text }) {
  return callReviewsApi({ action: 'reply', reviewId, text })
}

export function deleteOwnReview(reviewId) {
  return callReviewsApi({ action: 'delete_own', reviewId })
}

export function adminModerateReview({ reviewId, op, note }) {
  return callReviewsApi({ action: 'admin_moderate', reviewId, op, note })
}
