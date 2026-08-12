'use client'

import { useEffect, useMemo, useState } from 'react'
import { Stars } from '@/app/components/StarRating'
import { REVIEW_REPORT_REASONS } from '@/lib/shared/reviews'
import { Button, Card, Input, Pagination, SkeletonRow, pagedSlice, EmptyState, ToastViewport } from '@/app/components/ui'
import { useQueryParamState, useSetQueryParams } from '@/lib/client/useQueryParamState'

const PAGE_SIZE = 15

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
  published: { label: 'Publié', color: 'var(--primary)', bg: 'rgba(184, 243, 74,.10)', border: 'rgba(184, 243, 74,.35)' },
  hidden: { label: 'Masqué', color: '#ff8fb2', bg: 'rgba(194,52,127,.12)', border: 'rgba(194,52,127,.4)' },
  deleted: { label: 'Supprimé', color: 'var(--text-faint)', bg: 'rgba(255,255,255,.06)', border: 'rgba(255,255,255,.16)' },
}

const TOAST_LABEL: Record<ModerationOp, string> = {
  hide: 'Avis masqué.',
  publish: 'Avis republié.',
  delete: 'Avis supprimé.',
  note: 'Note enregistrée.',
}

// Codes bruts renvoyés par POST /api/agent/reviews/[id]/moderate (voir
// moderateReview dans lib/server/providerReviews.ts) — jamais affichés tels
// quels à l'agent.
const MODERATE_ERROR_LABELS: Record<string, string> = {
  forbidden: 'Action réservée aux agents.',
  invalid_body: 'Requête invalide — réessaie.',
  note_required: 'La note ne peut pas être vide.',
  review_not_found: 'Cet avis est introuvable (déjà traité ailleurs ?).',
}

const btnBase: React.CSSProperties = { minHeight: 36, padding: '8px 13px', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }

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

  const [statusFilter] = useQueryParamState<'all' | 'reported' | ReviewStatus>('status', 'all')
  const [ratingFilter] = useQueryParamState<'all' | '1' | '2' | '3' | '4' | '5'>('rating', 'all')
  const [search] = useQueryParamState<string>('q', '')
  const [pageParam, setPageParam] = useQueryParamState<string>('page', '1')
  const page = Number(pageParam)
  const setPage = (n: number) => setPageParam(String(n))
  // Filtres/recherche + reset de page doivent être écrits dans l'URL en une
  // seule fois (voir useSetQueryParams) — deux setValue() successifs
  // écrasent l'un l'autre.
  const setQueryParams = useSetQueryParams()

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

  const { pageItems, pageCount } = useMemo(() => pagedSlice(filtered, page, PAGE_SIZE), [filtered, page])

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
        showToast(MODERATE_ERROR_LABELS[data.error] || 'Action impossible.', 'error')
        return
      }
      setConfirmDeleteId(null)
      setNoteForId(null)
      setNoteText('')
      showToast(TOAST_LABEL[op], 'success')
      await loadList()
    } catch {
      showToast('Connexion impossible — réessaie.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="lb-dashboard-page lb-agent-screen lb-agent-screen--reviews">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="lb-agent-page-header" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div><span className="lb-agent-kicker">Qualité de la communauté</span><h1 className="font-display lb-dashboard-title">Avis</h1><p className="lb-dashboard-description">Publiez, masquez ou supprimez les avis en conservant une trace interne.</p></div>
          {reportedCount > 0 && (
            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(224,90,170,0.16)', color: '#e05aaa', fontSize: 12, fontWeight: 700 }}>
              {reportedCount} signalé{reportedCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {listError && (
          <Card accent="rgba(224,90,170,0.35)" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible. Recharge la page ; si ça persiste, reconnecte-toi (droits agent).</p>
            <Button variant="secondary" onClick={loadList} style={btnBase}>
              Recharger
            </Button>
          </Card>
        )}

        <Input
          placeholder="Rechercher (prestataire, auteur, texte...)"
          value={search}
          onChange={(e) => setQueryParams({ q: e.target.value === '' ? null : e.target.value, page: null })}
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
            <Button
              key={f.key}
              variant="ghost"
              onClick={() => setQueryParams({ status: f.key === 'all' ? null : f.key, page: null })}
              style={{
                padding: '7px 12px',
                borderRadius: 999,
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                border: statusFilter === f.key ? '1px solid rgba(184, 243, 74,0.45)' : '1px solid var(--border)',
                background: statusFilter === f.key ? 'rgba(184, 243, 74,0.15)' : 'var(--surface)',
                color: statusFilter === f.key ? 'var(--gold)' : 'var(--text-faint)',
              }}
            >
              {f.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', '5', '4', '3', '2', '1'] as const).map((n) => (
            <Button
              key={n}
              variant="ghost"
              onClick={() => setQueryParams({ rating: n === 'all' ? null : n, page: null })}
              style={{
                padding: '7px 12px',
                borderRadius: 999,
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                border: ratingFilter === n ? '1px solid rgba(184, 243, 74,0.45)' : '1px solid var(--border)',
                background: ratingFilter === n ? 'rgba(184, 243, 74,0.15)' : 'var(--surface)',
                color: ratingFilter === n ? 'var(--gold)' : 'var(--text-faint)',
              }}
            >
              {n === 'all' ? 'Toutes notes' : `${n} étoile${n !== '1' ? 's' : ''}`}
            </Button>
          ))}
        </div>

        {listLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} columns={2} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title={reviews.length === 0 ? 'Aucun avis pour le moment' : 'Aucun avis ne correspond aux filtres'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pageItems.map((review) => (
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

        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
      </div>

      <ToastViewport items={toast ? [{ id: 'avis', message: toast.message, kind: toast.kind === 'success' ? 'success' : 'error' }] : []} />
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
    <Card
      accent={isReported ? 'rgba(224,90,170,.35)' : undefined}
      style={{ padding: 16, ...(isReported ? { borderLeft: '3px solid rgba(224,90,170,.6)' } : null) }}
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
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, margin: '8px 0 0', paddingLeft: 12, borderLeft: '2px solid rgba(184, 243, 74,.35)' }}>
          <strong style={{ color: 'var(--gold)' }}>Réponse presta :</strong> {review.reply.text}
        </p>
      )}

      {review.reports.length > 0 && (
        <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 10, background: 'rgba(224,90,170,.06)', border: '1px solid rgba(224,90,170,.22)' }}>
          <p style={{ fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', color: '#e05aaa', fontFamily: 'var(--font-display), sans-serif', margin: '0 0 6px' }}>Signalements</p>
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
          <Input value={noteText} onChange={(e) => onChangeNote(e.target.value.slice(0, 500))} placeholder="Note interne (visible des agents uniquement)" />
          <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
            <Button variant="secondary" onClick={onCancelNote} disabled={busy} style={btnBase}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => onAction(review, 'note', noteText.trim())}
              disabled={busy || !noteText.trim()}
              style={{ ...btnBase, background: 'var(--primary-strong)', color: '#04120e', opacity: busy || !noteText.trim() ? 0.5 : 1 }}
            >
              Enregistrer
            </Button>
          </div>
        </div>
      ) : confirmDelete ? (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(194,52,127,.08)', border: '1px solid rgba(194,52,127,.35)' }}>
          <p style={{ fontSize: 12.5, color: '#fff', margin: '0 0 10px' }}>Supprimer définitivement cet avis ? Il ne comptera plus dans la note du prestataire.</p>
          <div style={{ display: 'flex', gap: 7 }}>
            <Button variant="secondary" onClick={onCancelConfirmDelete} disabled={busy} style={btnBase}>
              Annuler
            </Button>
            <Button variant="danger" onClick={() => onAction(review, 'delete')} disabled={busy} loading={busy} loadingText="…" style={{ ...btnBase, background: '#c2347f' }}>
              Confirmer la suppression
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
          {review.status === 'published' && (
            <Button variant="danger" onClick={() => onAction(review, 'hide')} disabled={busy} loading={busy} loadingText="…" style={{ ...btnBase, color: '#ff9ed2', border: '1px solid rgba(224,90,170,.5)', background: 'rgba(224,90,170,.12)' }}>
              Masquer
            </Button>
          )}
          {review.status === 'hidden' && (
            <Button variant="primary" onClick={() => onAction(review, 'publish')} disabled={busy} loading={busy} loadingText="…" style={{ ...btnBase, background: 'var(--primary-strong)', color: '#04120e' }}>
              Republier
            </Button>
          )}
          {review.status !== 'deleted' && (
            <Button variant="danger" onClick={onOpenConfirmDelete} disabled={busy} style={{ ...btnBase, color: '#ff8fb2', border: '1px solid rgba(194,52,127,.5)', background: 'rgba(194,52,127,.12)' }}>
              Supprimer
            </Button>
          )}
          <Button variant="secondary" onClick={onOpenNote} disabled={busy} style={btnBase}>
            Note admin
          </Button>
        </div>
      )}
    </Card>
  )
}
