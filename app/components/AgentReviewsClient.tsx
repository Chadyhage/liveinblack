'use client'

import { useEffect, useMemo, useState } from 'react'
import { Stars } from '@/app/components/StarRating'
import { REVIEW_REPORT_REASONS } from '@/lib/shared/reviews'

// Port de src/components/AdminReviewsPanel.jsx (#9 phase agent/admin) —
// modération des avis prestataires. Voir lib/server/providerReviews.ts
// (listReviewsForAgent/moderateReview) pour la machine à états côté serveur,
// et lib/server/agentGuard.ts pour la garde d'accès (déjà vérifiée par la
// page serveur qui montera ce composant).
//
// Différence volontaire avec le legacy : la confirmation de suppression
// utilise un panneau inline (pas window.confirm) — même convention que
// AgentDossiersClient.tsx pour ses actions destructives.

type ReviewStatus = 'published' | 'hidden' | 'deleted'
type ReportStatus = 'open' | 'dismissed' | 'action_taken'
type ModerationOp = 'hide' | 'publish' | 'delete' | 'note'

interface ReviewReportView {
  id: string
  reason: string
  details: string
  reporterName: string
  status: ReportStatus
  createdAt: string
}

interface AgentReviewView {
  id: string
  providerId: string
  providerName: string
  authorId: string
  authorName: string
  rating: number
  comment: string
  status: ReviewStatus
  verified: boolean
  reply: { text: string; createdAt: string | null; updatedAt: string | null } | null
  reportCount: number
  edited: boolean
  createdAt: string
  updatedAt: string
  adminNote: string
  hiddenBy: string | null
  deletedBy: string | null
  reports: ReviewReportView[]
}

const REASON_LABEL: Record<string, string> = Object.fromEntries(REVIEW_REPORT_REASONS.map((r) => [r.id, r.label]))

const STATUS_META: Record<ReviewStatus, { label: string; color: string; bg: string; border: string }> = {
  published: { label: 'Publié', color: '#4ee8c8', bg: 'rgba(78,232,200,.10)', border: 'rgba(78,232,200,.35)' },
  hidden: { label: 'Masqué', color: '#ff8fb2', bg: 'rgba(194,52,127,.12)', border: 'rgba(194,52,127,.4)' },
  deleted: { label: 'Supprimé', color: 'var(--text-faint)', bg: 'rgba(255,255,255,.06)', border: 'rgba(255,255,255,.16)' },
}

const TOAST_LABEL: Record<ModerationOp, string> = {
  hide: 'Avis masqué.',
  publish: 'Avis republié.',
  delete: 'Avis supprimé.',
  note: 'Note enregistrée.',
}

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }
const inputStyle: React.CSSProperties = { boxSizing: 'border-box', width: '100%', minHeight: 40, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: '#fff', outline: 'none', fontSize: 13 }
const btnBase: React.CSSProperties = { minHeight: 36, padding: '8px 13px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'transparent', color: '#fff', fontSize: 12, fontWeight: 700 }

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// Réplique exacte de sortForAgent (lib/server/providerReviews.ts) — doit être
// réappliqué côté client après filtrage, la liste fetchée n'étant filtrée
// qu'en mémoire ici.
function sortForAgent(views: AgentReviewView[]): AgentReviewView[] {
  return [...views].sort((a, b) => {
    const ra = a.status !== 'deleted' && a.reportCount > 0 ? 1 : 0
    const rb = b.status !== 'deleted' && b.reportCount > 0 ? 1 : 0
    if (ra !== rb) return rb - ra
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

interface ToastState {
  message: string
  kind: 'success' | 'error'
}

export default function AgentReviewsClient() {
  const [reviews, setReviews] = useState<AgentReviewView[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState(false)

  const [statusFilter, setStatusFilter] = useState<'all' | 'reported' | ReviewStatus>('all')
  const [ratingFilter, setRatingFilter] = useState<'all' | '1' | '2' | '3' | '4' | '5'>('all')
  const [search, setSearch] = useState('')

  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [noteForId, setNoteForId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  const [toast, setToast] = useState<ToastState | null>(null)

  function showToast(message: string, kind: ToastState['kind']) {
    setToast({ message, kind })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadList() {
    setListLoading(true)
    setListError(false)
    try {
      const res = await fetch('/api/agent/reviews')
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error('load_failed')
      setReviews(data.reviews)
    } catch {
      setListError(true)
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function run() {
      setListLoading(true)
      setListError(false)
      try {
        const res = await fetch('/api/agent/reviews')
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) setReviews(data.reviews)
      } catch {
        if (!cancelled) setListError(true)
      } finally {
        if (!cancelled) setListLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const reportedCount = useMemo(() => reviews.filter((r) => r.reportCount > 0 && r.status !== 'deleted').length, [reviews])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = reviews
      .filter((r) => {
        if (statusFilter === 'reported') return r.reportCount > 0 && r.status !== 'deleted'
        if (statusFilter !== 'all') return r.status === statusFilter
        return true
      })
      .filter((r) => ratingFilter === 'all' || r.rating === Number(ratingFilter))
      .filter(
        (r) =>
          !q ||
          r.providerName.toLowerCase().includes(q) ||
          r.providerId.toLowerCase().includes(q) ||
          r.authorName.toLowerCase().includes(q) ||
          r.comment.toLowerCase().includes(q)
      )
    return sortForAgent(list)
  }, [reviews, statusFilter, ratingFilter, search])

  async function act(review: AgentReviewView, op: ModerationOp, note?: string) {
    if (busyId) return
    setBusyId(review.id)
    try {
      const res = await fetch(`/api/agent/reviews/${review.id}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op, note }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        showToast(data.error || 'Action impossible.', 'error')
        return
      }
      setConfirmDeleteId(null)
      setNoteForId(null)
      setNoteText('')
      showToast(TOAST_LABEL[op], 'success')
      await loadList()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '32px 16px 80px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0 }}>Modération des avis prestataires</h1>
          {reportedCount > 0 && (
            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(224,90,170,0.16)', color: '#e05aaa', fontSize: 12, fontWeight: 700 }}>
              {reportedCount} signalé{reportedCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {listError && (
          <div style={{ ...cardStyle, border: '1px solid rgba(224,90,170,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <button onClick={loadList} style={btnBase}>
              Recharger
            </button>
          </div>
        )}

        <input
          style={inputStyle}
          placeholder="Rechercher (prestataire, auteur, texte...)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(
            [
              { key: 'all' as const, label: 'Tous statuts' },
              { key: 'reported' as const, label: 'Signalés' },
              { key: 'published' as const, label: 'Publiés' },
              { key: 'hidden' as const, label: 'Masqués' },
              { key: 'deleted' as const, label: 'Supprimés' },
            ]
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              style={{
                padding: '7px 12px',
                borderRadius: 999,
                cursor: 'pointer',
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                border: statusFilter === f.key ? '1px solid rgba(200,169,110,0.45)' : '1px solid var(--border)',
                background: statusFilter === f.key ? 'rgba(200,169,110,0.15)' : 'var(--surface)',
                color: statusFilter === f.key ? 'var(--gold)' : 'var(--text-faint)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', '5', '4', '3', '2', '1'] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRatingFilter(n)}
              style={{
                padding: '7px 12px',
                borderRadius: 999,
                cursor: 'pointer',
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                border: ratingFilter === n ? '1px solid rgba(200,169,110,0.45)' : '1px solid var(--border)',
                background: ratingFilter === n ? 'rgba(200,169,110,0.15)' : 'var(--surface)',
                color: ratingFilter === n ? 'var(--gold)' : 'var(--text-faint)',
              }}
            >
              {n === 'all' ? 'Toutes notes' : `${n} étoile${n !== '1' ? 's' : ''}`}
            </button>
          ))}
        </div>

        {listLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Chargement des avis…</p>
        ) : filtered.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-muted)', margin: 0 }}>
              {reviews.length === 0 ? 'Aucun avis pour le moment' : 'Aucun avis ne correspond aux filtres'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                busy={busyId === review.id}
                confirmDelete={confirmDeleteId === review.id}
                onOpenConfirmDelete={() => setConfirmDeleteId(review.id)}
                onCancelConfirmDelete={() => setConfirmDeleteId(null)}
                noteOpen={noteForId === review.id}
                noteText={noteForId === review.id ? noteText : ''}
                onOpenNote={() => {
                  setNoteForId(review.id)
                  setNoteText(review.adminNote || '')
                }}
                onCancelNote={() => {
                  setNoteForId(null)
                  setNoteText('')
                }}
                onChangeNote={setNoteText}
                onAction={act}
              />
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '10px 18px',
            borderRadius: 10,
            background: 'var(--surface-2)',
            border: `1px solid ${toast.kind === 'success' ? 'var(--teal)' : '#e05aaa'}`,
            color: '#fff',
            fontSize: 13,
          }}
        >
          {toast.message}
        </div>
      )}
    </main>
  )
}

function ReviewCard({
  review,
  busy,
  confirmDelete,
  onOpenConfirmDelete,
  onCancelConfirmDelete,
  noteOpen,
  noteText,
  onOpenNote,
  onCancelNote,
  onChangeNote,
  onAction,
}: {
  review: AgentReviewView
  busy: boolean
  confirmDelete: boolean
  onOpenConfirmDelete: () => void
  onCancelConfirmDelete: () => void
  noteOpen: boolean
  noteText: string
  onOpenNote: () => void
  onCancelNote: () => void
  onChangeNote: (v: string) => void
  onAction: (review: AgentReviewView, op: ModerationOp, note?: string) => void
}) {
  const meta = STATUS_META[review.status]
  const isReported = review.reportCount > 0 && review.status !== 'deleted'

  return (
    <article
      style={{
        ...cardStyle,
        ...(isReported ? { border: '1px solid rgba(224,90,170,.35)', borderLeft: '3px solid rgba(224,90,170,.6)' } : null),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', margin: 0 }}>
            {review.providerName}
            <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: 12 }}> — avis de {review.authorName}</span>
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
            <Stars value={review.rating} size={16} />
            {review.verified && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--teal)' }}>vérifié</span>}
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fmtDate(review.createdAt)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {isReported && (
            <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(224,90,170,0.12)', border: '1px solid rgba(224,90,170,0.4)', fontSize: 10.5, fontWeight: 700, color: '#e05aaa' }}>
              {review.reportCount} signalement{review.reportCount > 1 ? 's' : ''}
            </span>
          )}
          <span style={{ padding: '3px 9px', borderRadius: 999, background: meta.bg, border: `1px solid ${meta.border}`, fontSize: 10.5, fontWeight: 700, color: meta.color }}>
            {meta.label}
          </span>
          {review.hiddenBy === 'auto' && (
            <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(139,92,246,0.14)', border: '1px solid rgba(139,92,246,0.4)', fontSize: 10.5, fontWeight: 700, color: 'var(--violet)' }}>
              auto
            </span>
          )}
        </div>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: '10px 0 0', wordBreak: 'break-word' }}>{review.comment}</p>

      {review.reply?.text && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, margin: '8px 0 0', paddingLeft: 12, borderLeft: '2px solid rgba(200,169,110,.35)' }}>
          <strong style={{ color: 'var(--gold)' }}>Réponse presta :</strong> {review.reply.text}
        </p>
      )}

      {review.reports.length > 0 && (
        <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 10, background: 'rgba(224,90,170,.06)', border: '1px solid rgba(224,90,170,.22)' }}>
          <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#e05aaa', margin: '0 0 6px' }}>Signalements</p>
          {review.reports.map((rep) => (
            <p key={rep.id} style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 4px', lineHeight: 1.5 }}>
              <strong>{REASON_LABEL[rep.reason] || rep.reason}</strong> — {rep.reporterName || 'Membre'} · {fmtDate(rep.createdAt)}
              {rep.status !== 'open' && <span style={{ color: 'var(--text-faint)' }}> · traité</span>}
              {rep.details ? (
                <>
                  <br />
                  <span style={{ color: 'var(--text-faint)' }}>« {rep.details} »</span>
                </>
              ) : null}
            </p>
          ))}
        </div>
      )}

      {review.adminNote && <p style={{ fontSize: 11.5, color: 'var(--gold)', margin: '8px 0 0' }}>Note admin : {review.adminNote}</p>}

      {noteOpen ? (
        <div style={{ marginTop: 10 }}>
          <input value={noteText} onChange={(e) => onChangeNote(e.target.value.slice(0, 500))} placeholder="Note interne (visible des agents uniquement)" style={inputStyle} />
          <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
            <button onClick={onCancelNote} disabled={busy} style={btnBase}>
              Annuler
            </button>
            <button
              onClick={() => onAction(review, 'note', noteText.trim())}
              disabled={busy || !noteText.trim()}
              style={{ ...btnBase, background: '#3ed6b5', color: '#04120e', opacity: busy || !noteText.trim() ? 0.5 : 1, cursor: busy || !noteText.trim() ? 'not-allowed' : 'pointer' }}
            >
              Enregistrer
            </button>
          </div>
        </div>
      ) : confirmDelete ? (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(194,52,127,.08)', border: '1px solid rgba(194,52,127,.35)' }}>
          <p style={{ fontSize: 12.5, color: '#fff', margin: '0 0 10px' }}>Supprimer définitivement cet avis ? Il ne comptera plus dans la note du prestataire.</p>
          <div style={{ display: 'flex', gap: 7 }}>
            <button onClick={onCancelConfirmDelete} disabled={busy} style={btnBase}>
              Annuler
            </button>
            <button onClick={() => onAction(review, 'delete')} disabled={busy} style={{ ...btnBase, background: '#c2347f', color: '#fff', border: 'none', opacity: busy ? 0.5 : 1 }}>
              {busy ? '…' : 'Confirmer la suppression'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
          {review.status === 'published' && (
            <button onClick={() => onAction(review, 'hide')} disabled={busy} style={{ ...btnBase, color: '#ff9ed2', border: '1px solid rgba(224,90,170,.5)', background: 'rgba(224,90,170,.12)' }}>
              {busy ? '…' : 'Masquer'}
            </button>
          )}
          {review.status === 'hidden' && (
            <button onClick={() => onAction(review, 'publish')} disabled={busy} style={{ ...btnBase, background: '#3ed6b5', color: '#04120e', border: 'none' }}>
              {busy ? '…' : 'Republier'}
            </button>
          )}
          {review.status !== 'deleted' && (
            <button onClick={onOpenConfirmDelete} disabled={busy} style={{ ...btnBase, color: '#ff8fb2', border: '1px solid rgba(194,52,127,.5)', background: 'rgba(194,52,127,.12)' }}>
              Supprimer
            </button>
          )}
          <button onClick={onOpenNote} disabled={busy} style={btnBase}>
            Note admin
          </button>
        </div>
      )}
    </article>
  )
}
