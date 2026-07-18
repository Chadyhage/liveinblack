// Vercel Serverless Function — Avis clients sur les pages prestataires.
// Endpoint : POST /api/provider-reviews
//   { action:'create', providerId, rating, comment }        → publier / modifier SON avis
//   { action:'report', reviewId, reason, details? }         → signaler un avis publié
//   { action:'reply',  reviewId, text }                     → réponse du prestataire (1 seule, modifiable)
//   { action:'delete_own', reviewId }                       → l'auteur retire son avis
//   { action:'admin_moderate', reviewId, op, note? }        → agent : hide | publish | delete | note
//
// Modèle : provider_reviews/{providerId__authorUid} — l'ID composite garantit
// « un seul avis par compte et par prestataire » sans transaction. Toutes les
// écritures passent par l'Admin SDK (les règles Firestore refusent le write
// client) : la note, le statut et le badge « vérifié » ne sont jamais forgés
// côté client. Publication DIRECTE (choix produit V1) + signalement + modération
// admin ; 3 signalements distincts masquent l'avis automatiquement en attendant
// l'arbitrage d'un agent.
//
// Signalements : provider_review_reports/{reviewId__reporterUid} — collection
// séparée lisible uniquement par les agents. L'identité du signaleur ne doit
// JAMAIS être visible du prestataire ni de l'auteur (risque de représailles).
//
// La moyenne (ratingAvg/ratingCount sur providers/{uid}) est recalculée serveur
// à chaque changement de statut — seuls les avis 'published' comptent.

import { getDb, FieldValue } from '../lib/firebaseAdmin.js'
import { requireAuth } from '../lib/verifyAuth.js'
import { isAdminCaller } from '../lib/adminGuard.js'

const COMMENT_MIN = 10
const COMMENT_MAX = 1000
const REPLY_MAX = 1000
const DETAILS_MAX = 500
const AUTO_HIDE_REPORTS = 3

export const REPORT_REASONS = [
  'faux_avis', 'insultant', 'discriminatoire', 'spam',
  'info_personnelle', 'hors_sujet', 'autre',
]

// Nettoyage texte : caractères de contrôle retirés, lignes vides compressées.
// (React échappe le HTML au rendu — on ne stocke juste jamais de bruit binaire.)
function cleanText(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const caller = await requireAuth(req, res)
  if (!caller) return

  const { action } = req.body || {}
  try {
    const db = getDb()
    if (action === 'create') return await createReview(db, req, res, caller)
    if (action === 'report') return await reportReview(db, req, res, caller)
    if (action === 'reply') return await replyToReview(db, req, res, caller)
    if (action === 'delete_own') return await deleteOwnReview(db, req, res, caller)
    if (action === 'admin_moderate') return await adminModerate(db, req, res, caller)
    return res.status(400).json({ error: "Action invalide ('create' | 'report' | 'reply' | 'delete_own' | 'admin_moderate')" })
  } catch (err) {
    console.error('[/api/provider-reviews] error:', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

// ── Publier / modifier son avis ───────────────────────────────────────────────
async function createReview(db, req, res, caller) {
  const providerId = String(req.body?.providerId || '')
  const rating = Number(req.body?.rating)
  const comment = cleanText(req.body?.comment, COMMENT_MAX)

  if (!providerId) return res.status(400).json({ error: 'providerId requis' })
  if (providerId === caller.uid) {
    return res.status(403).json({ error: 'Tu ne peux pas noter ta propre page.' })
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'La note doit être un entier entre 1 et 5.' })
  }
  if (comment.length < COMMENT_MIN) {
    return res.status(400).json({ error: `Le commentaire doit faire au moins ${COMMENT_MIN} caractères.` })
  }

  const pSnap = await db.collection('providers').doc(providerId).get()
  if (!pSnap.exists) return res.status(404).json({ error: 'Prestataire introuvable.' })

  // Badge « Avis vérifié » = interaction réelle tracée sur la plateforme : une
  // commande de prestation acceptée/terminée. (La simple conversation ne suffit
  // pas — trop facile à fabriquer.)
  let verified = false
  try {
    const oSnap = await db.collection('service_orders')
      .where('buyerId', '==', caller.uid)
      .where('sellerId', '==', providerId)
      .limit(10).get()
    verified = oSnap.docs.some(d => ['confirmed', 'ready', 'done'].includes(d.data().status))
  } catch { /* index manquant → avis simplement non vérifié */ }

  let authorName = 'Membre LIVE IN BLACK'
  try {
    const uSnap = await db.collection('users').doc(caller.uid).get()
    if (uSnap.exists) authorName = uSnap.data().name || uSnap.data().displayName || authorName
  } catch {}

  const rRef = db.collection('provider_reviews').doc(`${providerId}__${caller.uid}`)
  const existing = await rRef.get()
  const prev = existing.exists ? existing.data() : null
  // Un avis masqué par la modération ne peut pas être « réécrit propre » par
  // son auteur : le masquage tomberait à la première édition.
  if (prev && prev.status === 'hidden') {
    return res.status(403).json({ error: 'Ton avis a été masqué par la modération — contacte le support si tu penses que c’est une erreur.' })
  }

  const now = new Date().toISOString()
  const isEdit = !!prev && prev.status === 'published'
  const review = {
    id: rRef.id,
    providerId,
    providerName: pSnap.data().name || 'Prestataire',
    authorId: caller.uid,
    authorName,
    rating,
    comment,
    status: 'published',
    verified,
    reply: isEdit ? (prev.reply || null) : null,
    reportCount: isEdit ? (prev.reportCount || 0) : 0,
    edited: isEdit,
    createdAt: isEdit ? (prev.createdAt || now) : now,
    updatedAt: now,
  }
  await rRef.set(review)
  await recomputeProviderRating(db, providerId)

  // Notification in-app au prestataire (best-effort, jamais bloquant).
  if (!isEdit) {
    await pushNotification(db, providerId, {
      type: 'review_received',
      title: 'Nouvel avis sur ta page',
      body: `${authorName} a laissé ${rating} étoile${rating > 1 ? 's' : ''} sur ta page prestataire.`,
      data: { reviewId: rRef.id },
    })
  }

  return res.status(200).json({ ok: true, review })
}

// ── Signaler un avis ──────────────────────────────────────────────────────────
async function reportReview(db, req, res, caller) {
  const reviewId = String(req.body?.reviewId || '')
  const reason = String(req.body?.reason || '')
  const details = cleanText(req.body?.details, DETAILS_MAX)
  if (!reviewId) return res.status(400).json({ error: 'reviewId requis' })
  if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ error: 'Motif de signalement invalide.' })

  const rRef = db.collection('provider_reviews').doc(reviewId)
  const rSnap = await rRef.get()
  if (!rSnap.exists) return res.status(404).json({ error: 'Avis introuvable.' })
  const review = rSnap.data()
  if (review.status !== 'published') return res.status(409).json({ error: 'Cet avis n’est plus publié.' })
  if (review.authorId === caller.uid) return res.status(400).json({ error: 'Tu ne peux pas signaler ton propre avis.' })

  let reporterName = 'Membre'
  try {
    const uSnap = await db.collection('users').doc(caller.uid).get()
    if (uSnap.exists) reporterName = uSnap.data().name || uSnap.data().displayName || reporterName
  } catch {}

  const repRef = db.collection('provider_review_reports').doc(`${reviewId}__${caller.uid}`)
  let autoHidden = false
  try {
    await db.runTransaction(async (tx) => {
      const dup = await tx.get(repRef)
      if (dup.exists) { const e = new Error('already_reported'); e.code = 'already_reported'; throw e }
      const fresh = await tx.get(rRef)
      if (!fresh.exists) { const e = new Error('gone'); e.code = 'gone'; throw e }
      const cur = fresh.data()
      const newCount = (cur.reportCount || 0) + 1
      tx.set(repRef, {
        id: repRef.id, reviewId, providerId: cur.providerId || '',
        reporterId: caller.uid, reporterName,
        reason, details: details || '',
        status: 'open', createdAt: new Date().toISOString(),
      })
      const patch = { reportCount: newCount, reportedAt: new Date().toISOString() }
      // Plusieurs signalements distincts → retrait préventif, l'agent tranche.
      if (newCount >= AUTO_HIDE_REPORTS && cur.status === 'published') {
        patch.status = 'hidden'
        patch.hiddenAt = new Date().toISOString()
        patch.hiddenBy = 'auto'
        autoHidden = true
      }
      tx.set(rRef, patch, { merge: true })
    })
  } catch (txErr) {
    if (txErr.code === 'already_reported') return res.status(409).json({ error: 'Tu as déjà signalé cet avis — il est en cours d’examen.' })
    if (txErr.code === 'gone') return res.status(404).json({ error: 'Avis introuvable.' })
    throw txErr
  }
  if (autoHidden) await recomputeProviderRating(db, review.providerId)

  return res.status(200).json({ ok: true })
}

// ── Réponse du prestataire (une seule, modifiable) ────────────────────────────
async function replyToReview(db, req, res, caller) {
  const reviewId = String(req.body?.reviewId || '')
  const text = cleanText(req.body?.text, REPLY_MAX)
  if (!reviewId) return res.status(400).json({ error: 'reviewId requis' })
  if (!text) return res.status(400).json({ error: 'La réponse est vide.' })

  const rRef = db.collection('provider_reviews').doc(reviewId)
  const rSnap = await rRef.get()
  if (!rSnap.exists) return res.status(404).json({ error: 'Avis introuvable.' })
  const review = rSnap.data()
  if (String(review.providerId) !== caller.uid) {
    return res.status(403).json({ error: 'Seul le prestataire concerné peut répondre à cet avis.' })
  }
  if (review.status === 'deleted') return res.status(409).json({ error: 'Cet avis a été supprimé.' })

  const now = new Date().toISOString()
  const reply = {
    text,
    createdAt: review.reply?.createdAt || now,
    updatedAt: now,
  }
  await rRef.set({ reply, updatedAt: now }, { merge: true })

  if (!review.reply) {
    await pushNotification(db, review.authorId, {
      type: 'review_reply',
      title: 'Le prestataire t’a répondu',
      body: `${review.providerName || 'Le prestataire'} a répondu à ton avis.`,
      data: { reviewId, providerId: review.providerId },
    })
  }
  return res.status(200).json({ ok: true, reply })
}

// ── L'auteur retire son avis ──────────────────────────────────────────────────
async function deleteOwnReview(db, req, res, caller) {
  const reviewId = String(req.body?.reviewId || '')
  if (!reviewId) return res.status(400).json({ error: 'reviewId requis' })
  const rRef = db.collection('provider_reviews').doc(reviewId)
  const rSnap = await rRef.get()
  if (!rSnap.exists) return res.status(404).json({ error: 'Avis introuvable.' })
  const review = rSnap.data()
  if (String(review.authorId) !== caller.uid) {
    return res.status(403).json({ error: 'Seul l’auteur peut retirer cet avis.' })
  }
  await rRef.set({ status: 'deleted', deletedAt: new Date().toISOString() }, { merge: true })
  await recomputeProviderRating(db, review.providerId)
  return res.status(200).json({ ok: true })
}

// ── Modération admin : hide | publish | delete | note ────────────────────────
async function adminModerate(db, req, res, caller) {
  if (!(await isAdminCaller(db, caller))) {
    return res.status(403).json({ error: 'Réservé aux agents.' })
  }
  const reviewId = String(req.body?.reviewId || '')
  const op = String(req.body?.op || '')
  const note = cleanText(req.body?.note, DETAILS_MAX)
  if (!reviewId || !['hide', 'publish', 'delete', 'note'].includes(op)) {
    return res.status(400).json({ error: "Paramètres invalides (op 'hide' | 'publish' | 'delete' | 'note')" })
  }
  const rRef = db.collection('provider_reviews').doc(reviewId)
  const rSnap = await rRef.get()
  if (!rSnap.exists) return res.status(404).json({ error: 'Avis introuvable.' })
  const review = rSnap.data()

  const now = new Date().toISOString()
  const patch = { updatedAt: now }
  if (note) patch.adminNote = note
  if (op === 'hide') { patch.status = 'hidden'; patch.hiddenAt = now; patch.hiddenBy = caller.uid }
  if (op === 'publish') { patch.status = 'published'; patch.hiddenAt = null; patch.hiddenBy = null }
  if (op === 'delete') { patch.status = 'deleted'; patch.deletedAt = now; patch.deletedBy = caller.uid }
  await rRef.set(patch, { merge: true })

  // Les signalements ouverts de cet avis sont considérés traités par l'action.
  if (op !== 'note') {
    try {
      const reps = await db.collection('provider_review_reports')
        .where('reviewId', '==', reviewId).where('status', '==', 'open').get()
      const batch = db.batch()
      reps.docs.forEach(d => batch.set(d.ref, {
        status: op === 'publish' ? 'dismissed' : 'action_taken',
        reviewedAt: now, reviewedBy: caller.uid,
      }, { merge: true }))
      await batch.commit()
    } catch (e) { console.warn('[provider-reviews] cloture signalements:', e.message) }
  }

  // Journal d'audit des actions admin.
  try {
    await db.collection('admin_audit').add({
      type: 'review_moderation', op, reviewId,
      providerId: review.providerId || '', authorId: review.authorId || '',
      adminUid: caller.uid, adminEmail: caller.email || '', note: note || '', at: now,
    })
  } catch (e) { console.warn('[provider-reviews] audit:', e.message) }

  if (op !== 'note') await recomputeProviderRating(db, review.providerId)

  if (op === 'hide') {
    await pushNotification(db, review.authorId, {
      type: 'review_hidden',
      title: 'Ton avis a été masqué',
      body: 'Un avis que tu as publié a été masqué par la modération.',
      data: { reviewId },
    })
  }
  return res.status(200).json({ ok: true, status: patch.status || review.status })
}

// ── Moyenne du prestataire (seuls les avis PUBLIÉS comptent) ─────────────────
async function recomputeProviderRating(db, providerId) {
  if (!providerId) return
  try {
    const snap = await db.collection('provider_reviews')
      .where('providerId', '==', providerId)
      .where('status', '==', 'published').get()
    const ratings = snap.docs.map(d => Number(d.data().rating)).filter(r => r >= 1 && r <= 5)
    const count = ratings.length
    const avg = count ? Math.round((ratings.reduce((s, r) => s + r, 0) / count) * 10) / 10 : 0
    await db.collection('providers').doc(providerId).set(
      { ratingAvg: avg, ratingCount: count },
      { merge: true },
    )
  } catch (e) { console.warn('[provider-reviews] recompute rating:', e.message) }
}

// ── Notification in-app (même modèle que api/tickets.js) ─────────────────────
async function pushNotification(db, uid, { type, title, body, data }) {
  if (!uid) return
  try {
    const notif = {
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      type, title, body, data: data || {},
      read: false, createdAt: Date.now(),
    }
    const nRef = db.collection('notifications').doc(String(uid))
    const cur = await nRef.get()
    const items = cur.exists ? (cur.data().items || []) : []
    await nRef.set({ items: [notif, ...items].slice(0, 50), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  } catch (e) { console.warn('[provider-reviews] notif échouée (non bloquant):', e.message) }
}
