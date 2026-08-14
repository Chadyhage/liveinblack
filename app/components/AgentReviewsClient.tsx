'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, Flag, RefreshCw, Search, ShieldCheck, Star, StickyNote, Trash2 } from 'lucide-react'
import { Stars } from '@/app/components/StarRating'
import { REVIEW_REPORT_REASONS } from '@/lib/shared/reviews'
import { Button, Card, Input, Modal, Pagination, SkeletonRow, pagedSlice, EmptyState, ToastViewport } from '@/app/components/ui'
import { useQueryParamState, useSetQueryParams } from '@/lib/client/useQueryParamState'
import styles from './AgentReviewsClient.module.css'

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

const STATUS_META: Record<ReviewStatus, { label: string; className: string }> = {
  published: { label: 'Publié', className: styles.statusPublished },
  hidden: { label: 'Masqué', className: styles.statusHidden },
  deleted: { label: 'Supprimé', className: styles.statusDeleted },
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
  const publishedCount = useMemo(() => reviews.filter((r) => r.status === 'published').length, [reviews])
  const averageRating = useMemo(() => {
    const visibleReviews = reviews.filter((review) => review.status !== 'deleted')
    if (!visibleReviews.length) return '—'
    return (visibleReviews.reduce((sum, review) => sum + review.rating, 0) / visibleReviews.length).toFixed(1)
  }, [reviews])

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
  const deleteReview = reviews.find((review) => review.id === confirmDeleteId) ?? null
  const noteReview = reviews.find((review) => review.id === noteForId) ?? null

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
    <main className={`lb-dashboard-page lb-agent-screen lb-agent-screen--reviews ${styles.page}`}>
      <div className={styles.stack}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={loadList} className={styles.refresh} icon={<RefreshCw size={16} aria-hidden="true" />}>
            Actualiser
          </Button>
        </div>

        {listError && (
          <Card accent="rgba(255,143,178,.35)" className={styles.error}>
            <div><strong>Impossible de charger les avis</strong><p>Réessaie maintenant ou reconnecte-toi si le problème persiste.</p></div>
            <Button variant="secondary" onClick={loadList}>
              Recharger
            </Button>
          </Card>
        )}

        <section className={styles.metrics} aria-label="Résumé des avis">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={statusFilter === 'all'}
            className={`${styles.metric}${statusFilter === 'all' ? ` ${styles.metricActive}` : ''}`}
            style={{ display: 'grid', ...(statusFilter === 'all' ? { borderColor: 'rgba(184,243,74,.42)', background: 'linear-gradient(145deg,rgba(184,243,74,.1),rgba(255,255,255,.045))' } : {}) }}
            onClick={() => setQueryParams({ status: null, page: null })}
          >
            <span className={styles.metricIcon}><Star size={18} aria-hidden="true" /></span><strong>{reviews.length}</strong><span>Tous les avis</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={statusFilter === 'reported'}
            className={`${styles.metric}${statusFilter === 'reported' ? ` ${styles.metricActive} ${styles.metricUrgent}` : ''}`}
            style={{ display: 'grid', ...(statusFilter === 'reported' ? { borderColor: 'rgba(255,143,178,.38)', background: 'linear-gradient(145deg,rgba(255,143,178,.1),rgba(255,255,255,.045))' } : {}) }}
            onClick={() => setQueryParams({ status: 'reported', page: null })}
          >
            <span className={`${styles.metricIcon} ${styles.urgentIcon}`}><Flag size={18} aria-hidden="true" /></span><strong>{reportedCount}</strong><span>À examiner</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={statusFilter === 'published'}
            className={`${styles.metric}${statusFilter === 'published' ? ` ${styles.metricActive}` : ''}`}
            style={{ display: 'grid', ...(statusFilter === 'published' ? { borderColor: 'rgba(184,243,74,.42)', background: 'linear-gradient(145deg,rgba(184,243,74,.1),rgba(255,255,255,.045))' } : {}) }}
            onClick={() => setQueryParams({ status: 'published', page: null })}
          >
            <span className={styles.metricIcon}><CheckCircle2 size={18} aria-hidden="true" /></span><strong>{publishedCount}</strong><span>Publiés</span>
          </Button>
          <div className={styles.metric}>
            <span className={styles.metricIcon}><Star size={18} aria-hidden="true" /></span><strong>{averageRating}</strong><span>Note moyenne</span>
          </div>
        </section>

        <section className={styles.workspace}>
          <div className={styles.controls}>
            <Input
              aria-label="Rechercher dans les avis"
              placeholder="Rechercher un prestataire, un auteur ou un avis"
              leftIcon={<Search size={17} aria-hidden="true" />}
              value={search}
              onChange={(e) => setQueryParams({ q: e.target.value === '' ? null : e.target.value, page: null })}
              containerStyle={{ flex: '1 1 auto', minWidth: 0 }}
              className={styles.search}
            />
            <span className={styles.resultCount}>{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
          </div>

          <div className={styles.filterBlock}>
            <div className={styles.segmented} aria-label="Filtrer par statut">
              {([
                { key: 'all' as const, label: 'Tous' },
                { key: 'reported' as const, label: 'Signalés' },
                { key: 'published' as const, label: 'Publiés' },
                { key: 'hidden' as const, label: 'Masqués' },
                { key: 'deleted' as const, label: 'Supprimés' },
              ]).map((filter) => (
                <Button key={filter.key} variant="ghost" aria-pressed={statusFilter === filter.key} onClick={() => setQueryParams({ status: filter.key === 'all' ? null : filter.key, page: null })}>
                  {filter.label}
                </Button>
              ))}
            </div>
            <div className={styles.ratingFilter} aria-label="Filtrer par note">
              {(['all', '5', '4', '3', '2', '1'] as const).map((rating) => (
                <Button key={rating} variant="ghost" aria-pressed={ratingFilter === rating} onClick={() => setQueryParams({ rating: rating === 'all' ? null : rating, page: null })}>
                  {rating === 'all' ? 'Toutes les notes' : <><Star size={13} aria-hidden="true" /> {rating}</>}
                </Button>
              ))}
            </div>
          </div>

          {listLoading ? (
            <div className={styles.loadingGrid}>{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} columns={2} />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState title={reviews.length === 0 ? 'Aucun avis pour le moment' : 'Aucun avis ne correspond aux filtres'} />
          ) : (
            <div className={styles.grid}>
              {pageItems.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  busy={busyId === review.id}
                  onOpenConfirmDelete={() => setConfirmDeleteId(review.id)}
                  onOpenNote={() => { setNoteForId(review.id); setNoteText(review.adminNote || '') }}
                  onAction={act}
                />
              ))}
            </div>
          )}

          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} totalItems={filtered.length} pageSize={PAGE_SIZE} />
        </section>
      </div>

      {noteReview ? (
        <Modal
          onClose={() => { if (!busyId) { setNoteForId(null); setNoteText('') } }}
          maxWidth={460}
          dismissible={!busyId}
          title="Note interne"
          subtitle={noteReview.providerName ? `À propos de l’avis de ${noteReview.authorName} sur ${noteReview.providerName}.` : `À propos de l’avis de ${noteReview.authorName}.`}
          actions={<><Button variant="secondary" onClick={() => { setNoteForId(null); setNoteText('') }} disabled={Boolean(busyId)}>Annuler</Button><Button variant="primary" onClick={() => act(noteReview, 'note', noteText.trim())} disabled={Boolean(busyId) || !noteText.trim()} loading={busyId === noteReview.id} loadingText="Enregistrement…">Enregistrer</Button></>}
        >
          <label className={styles.modalLabel} htmlFor="review-admin-note">Visible uniquement par les agents</label>
          <Input id="review-admin-note" value={noteText} onChange={(event) => setNoteText(event.target.value.slice(0, 500))} placeholder="Ajouter un contexte de modération" autoFocus />
          <p className={styles.characterCount}>{noteText.length}/500</p>
        </Modal>
      ) : null}

      {deleteReview ? (
        <Modal
          onClose={() => { if (!busyId) setConfirmDeleteId(null) }}
          maxWidth={420}
          hideClose
          dismissible={!busyId}
          title="Supprimer cet avis ?"
          subtitle="Cette action est définitive et retirera l’avis de la note du prestataire."
          actions={<><Button variant="secondary" onClick={() => setConfirmDeleteId(null)} disabled={Boolean(busyId)}>Annuler</Button><Button variant="danger" onClick={() => act(deleteReview, 'delete')} disabled={Boolean(busyId)} loading={busyId === deleteReview.id} loadingText="Suppression…">Supprimer</Button></>}
        >
          <div className={styles.deletePreview}><Trash2 size={18} aria-hidden="true" /><p>« {deleteReview.comment} »</p></div>
        </Modal>
      ) : null}

      <ToastViewport items={toast ? [{ id: 'avis', message: toast.message, kind: toast.kind === 'success' ? 'success' : 'error' }] : []} />
    </main>
  )
}

function ReviewCard({
  review,
  busy,
  onOpenConfirmDelete,
  onOpenNote,
  onAction,
}: {
  review: AgentReviewView
  busy: boolean
  onOpenConfirmDelete: () => void
  onOpenNote: () => void
  onAction: (review: AgentReviewView, op: ModerationOp, note?: string) => void
}) {
  const meta = STATUS_META[review.status]
  const isReported = review.reportCount > 0 && review.status !== 'deleted'

  return (
    <Card className={`${styles.reviewCard}${isReported ? ` ${styles.reviewReported}` : ''}`}>
      <div className={styles.cardTop}>
        <div className={styles.identity}>
          <div className={styles.identityIcon}>{review.authorName.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{review.providerName || 'Prestataire'}</strong>
            <span>Avis de {review.authorName}</span>
          </div>
        </div>
        <div className={styles.badges}>
          {isReported ? <span className={styles.reportBadge}><Flag size={12} aria-hidden="true" /> {review.reportCount}</span> : null}
          <span className={`${styles.status} ${meta.className}`}>{meta.label}</span>
          {review.hiddenBy === 'auto' ? <span className={styles.autoBadge}>Auto</span> : null}
        </div>
      </div>

      <div className={styles.ratingLine}>
            <Stars value={review.rating} size={16} />
        {review.verified ? <span><ShieldCheck size={13} aria-hidden="true" /> Vérifié</span> : null}
        <time dateTime={review.createdAt}>{fmtDate(review.createdAt)}</time>
      </div>

      <p className={styles.comment}>{review.comment}</p>

      {review.reply?.text && (
        <div className={styles.reply}><strong>Réponse du prestataire</strong><p>{review.reply.text}</p></div>
      )}

      {review.reports.length > 0 && (
        <div className={styles.reports}>
          <strong className={styles.reportsTitle}><Flag size={14} aria-hidden="true" /> Signalements</strong>
          {review.reports.map((rep) => (
            <p key={rep.id}>
              <strong>{REASON_LABEL[rep.reason] || rep.reason}</strong> — {rep.reporterName || 'Membre'} · {fmtDate(rep.createdAt)}
              {rep.status !== 'open' && <span> · traité</span>}
              {rep.details ? (
                <>
                  <br />
                  <span>« {rep.details} »</span>
                </>
              ) : null}
            </p>
          ))}
        </div>
      )}

      {review.adminNote ? <div className={styles.adminNote}><StickyNote size={14} aria-hidden="true" /><span>{review.adminNote}</span></div> : null}

      <div className={styles.cardActions}>
        {review.status === 'published' ? <Button variant="secondary" icon={<EyeOff size={15} aria-hidden="true" />} onClick={() => onAction(review, 'hide')} disabled={busy} loading={busy} loadingText="Masquage…">Masquer</Button> : null}
        {review.status === 'hidden' ? <Button variant="primary" icon={<Eye size={15} aria-hidden="true" />} onClick={() => onAction(review, 'publish')} disabled={busy} loading={busy} loadingText="Publication…">Republier</Button> : null}
        <Button variant="ghost" icon={<StickyNote size={15} aria-hidden="true" />} onClick={onOpenNote} disabled={busy}>Note</Button>
        {review.status !== 'deleted' ? <Button variant="ghost" className={styles.deleteAction} icon={<Trash2 size={15} aria-hidden="true" />} onClick={onOpenConfirmDelete} disabled={busy}>Supprimer</Button> : null}
      </div>
    </Card>
  )
}
