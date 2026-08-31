'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Stars, StarInput } from '@/app/components/ui/StarRating'
import { computeReviewStats, REVIEW_COMMENT_MIN, REVIEW_COMMENT_MAX, REVIEW_REPORT_REASONS } from '@/lib/shared/reviews'
import { Button, Card, Textarea, Label, Modal, SlideOverModal } from '@/app/components/ui'

// Port de src/components/ProviderReviews.jsx — section "Avis clients" d'une
// page publique prestataire. Contrairement au legacy (modale d'auth inline
// via openAuthModal), l'absence de session redirige vers /connexion?next=...
// — même convention que OrganizerFollowButtonClient.tsx (pas de modale d'auth
// globale dans ce port). Après une mutation, l'état local est mis à jour
// directement depuis la réponse de l'API plutôt que de tout re-fetcher (pas
// de route GET publique dédiée — la lecture initiale vient du Server
// Component, voir app/(public)/prestataires/[id]/page.tsx).
const GOLD = 'var(--primary)'
const TEAL = 'var(--primary)'

const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 38, padding: '8px 13px', borderRadius: 'var(--radius-pill)', border: '1px solid transparent', cursor: 'pointer', background: 'var(--primary)', color: 'var(--primary-ink)', fontSize: 12, fontWeight: 800, textTransform: 'none', letterSpacing: 'normal', boxShadow: '0 6px 20px var(--border)' }
const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 38, padding: '8px 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', cursor: 'pointer', background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.9)', fontSize: 12, fontWeight: 600 }
const disabledBtn: React.CSSProperties = { background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.35)', border: '1px solid rgba(255,255,255,.06)', cursor: 'not-allowed', boxShadow: 'none' }

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

function Sheet({ onClose, title, subtitle, children, compact = false }: { onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; compact?: boolean }) {
  if (compact) return <Modal onClose={onClose} zIndex={3200} title={title} subtitle={subtitle}>{children}</Modal>
  return <SlideOverModal onClose={onClose} zIndex={3200} title={title} subtitle={subtitle}>{children}</SlideOverModal>
}

export interface PublicReviewView {
  id: string
  authorId: string
  authorName: string
  rating: number
  comment: string
  status: 'published' | 'hidden' | 'deleted'
  verified: boolean
  reply: { text: string } | null
  edited: boolean
  createdAt: string
}

export default function ProviderReviewsClient({
  providerId,
  providerName,
  isAuthenticated,
  isSelf,
  initialReviews,
  initialMyReview,
}: {
  providerId: string
  providerName: string
  isAuthenticated: boolean
  isSelf: boolean
  initialReviews: PublicReviewView[]
  initialMyReview: PublicReviewView | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [reviews, setReviews] = useState(initialReviews)
  const [myReview, setMyReview] = useState(initialMyReview)

  const [showForm, setShowForm] = useState(false)
  const [formRating, setFormRating] = useState(0)
  const [formComment, setFormComment] = useState('')
  const [formBusy, setFormBusy] = useState(false)
  const [formErr, setFormErr] = useState('')

  const [reportTarget, setReportTarget] = useState<PublicReviewView | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportDetails, setReportDetails] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportDone, setReportDone] = useState<string | boolean>(false)

  const [removeBusy, setRemoveBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const { avg, count, dist } = computeReviewStats(reviews)

  function goToLogin() {
    router.push(`/login?next=${encodeURIComponent(pathname)}`)
  }

  function openForm() {
    if (!isAuthenticated) return goToLogin()
    setFormRating(myReview?.rating || 0)
    setFormComment(myReview?.comment || '')
    setFormErr('')
    setShowForm(true)
  }

  async function handleSubmit() {
    if (formBusy) return
    const comment = formComment.trim()
    if (!formRating) return setFormErr('Choisis une note de 1 à 5 étoiles.')
    if (comment.length < REVIEW_COMMENT_MIN) return setFormErr(`Ton commentaire doit faire au moins ${REVIEW_COMMENT_MIN} caractères.`)
    setFormBusy(true)
    setFormErr('')
    try {
      const res = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId, rating: formRating, comment }) })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setFormErr('Publication impossible — réessaie.')
        setFormBusy(false)
        return
      }
      const review: PublicReviewView = data.review
      setMyReview(review)
      setReviews((current) => {
        const exists = current.some((r) => r.id === review.id)
        return exists ? current.map((r) => (r.id === review.id ? review : r)) : [review, ...current]
      })
      setShowForm(false)
    } catch {
      setFormErr('Publication impossible — vérifie ta connexion.')
    }
    setFormBusy(false)
  }

  function openReport(review: PublicReviewView) {
    if (!isAuthenticated) return goToLogin()
    setReportTarget(review)
    setReportReason('')
    setReportDetails('')
    setReportDone(false)
  }

  async function handleReport() {
    if (reportBusy || !reportTarget || !reportReason) return
    setReportBusy(true)
    try {
      const res = await fetch(`/api/reviews/${reportTarget.id}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reportReason, details: reportDetails.trim() }) })
      const data = await res.json()
      setReportDone(res.ok || data.error === 'already_reported' ? true : 'Signalement impossible — réessaie.')
    } catch {
      setReportDone('Signalement impossible — vérifie ta connexion.')
    }
    setReportBusy(false)
  }

  async function handleRemoveOwn() {
    if (removeBusy || !myReview) return
    setRemoveBusy(true)
    try {
      const res = await fetch(`/api/reviews/${myReview.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.ok) {
        setReviews((current) => current.filter((r) => r.id !== myReview.id))
        setMyReview(null)
      }
    } catch {
      // best-effort — l'utilisateur peut réessayer
    }
    setRemoveBusy(false)
    setConfirmRemove(false)
  }

  const hiddenMine = myReview?.status === 'hidden'

  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.3px', margin: 0 }}>Avis clients</h2>
        {count > 0 && <span style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>{count} avis</span>}
      </div>

      <Card style={{ padding: 14, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
        {count === 0 ? (
          <div>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,.6)', lineHeight: 1.6, margin: 0 }}>
              {`${providerName || 'Ce prestataire'} n’a pas encore reçu d’avis.${!isSelf ? ' Tu as travaillé avec ce prestataire ? Ton retour aidera les prochains clients.' : ''}`}
            </p>
            {!isSelf && (
              <Button onClick={openForm} style={{ ...primaryBtn, marginTop: 14 }}>
                Laisser un avis
              </Button>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ textAlign: 'center', minWidth: 88 }}>
                <p style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-1.5px', color: '#fff', margin: 0, lineHeight: 1 }}>
                  {String(avg).replace('.', ',')}
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.4)' }}> / 5</span>
                </p>
                <div style={{ marginTop: 5 }}>
                  <Stars value={avg} size={15} />
                </div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', margin: '4px 0 0' }}>Basée sur {count} avis</p>
              </div>
              <div style={{ flex: '1 1 190px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {([5, 4, 3, 2, 1] as const).map((n) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,.55)', width: 10, textAlign: 'right' }}>{n}</span>
                    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.44 6.2 20.5l1.1-6.47L2.6 9.45l6.5-.95z" fill={GOLD} />
                    </svg>
                    <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                      <div style={{ width: `${count ? Math.round((dist[n] / count) * 100) : 0}%`, height: '100%', borderRadius: 999, background: GOLD }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', width: 22 }}>{dist[n]}</span>
                  </div>
                ))}
              </div>
            </div>

            {!isSelf && (
              <Button variant="secondary" onClick={openForm} style={{ ...ghostBtn, marginTop: 18 }}>
                {myReview && !hiddenMine ? 'Modifier mon avis' : 'Laisser un avis'}
              </Button>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginTop: 8, alignItems: 'start' }}>
              {reviews.map((review) => {
                const isMine = Boolean(myReview) && myReview!.id === review.id
                return (
                  <article key={review.id} style={{ padding: 12, borderRadius: 11, border: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <Stars value={review.rating} size={13} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>{review.authorName || 'Membre'}</span>
                      {review.verified && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: TEAL, background: 'var(--primary-a10)', border: '1px solid var(--primary-a35)', borderRadius: 999, padding: '2px 8px' }}>
                          Avis vérifié
                        </span>
                      )}
                      <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.38)' }}>
                        {fmtDate(review.createdAt)}
                        {review.edited ? ' · modifié' : ''}
                      </span>
                    </div>
                    <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,.72)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: '7px 0 0', wordBreak: 'break-word' }}>{review.comment}</p>

                    {review.reply?.text && (
                      <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: GOLD, margin: '0 0 5px' }}>Réponse de {providerName || 'du prestataire'}</p>
                        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,.66)', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0, wordBreak: 'break-word' }}>{review.reply.text}</p>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, marginTop: 7 }}>
                      {isMine ? (
                        <>
                          <Button variant="link" onClick={openForm} style={{ fontSize: 11.5, fontWeight: 700, color: TEAL, textDecoration: 'none' }}>
                            Modifier
                          </Button>
                          <Button variant="link" onClick={() => setConfirmRemove(true)} style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.38)', textDecoration: 'none' }}>
                            Retirer
                          </Button>
                        </>
                      ) : (
                        <Button variant="link" onClick={() => openReport(review)} style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.38)', textDecoration: 'none' }}>
                          Signaler
                        </Button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </Card>

      {showForm && (
        <Sheet
          onClose={() => !formBusy && setShowForm(false)}
          title={myReview && myReview.status === 'published' ? 'Modifier mon avis' : `Noter ${providerName || 'ce prestataire'}`}
          subtitle="Partagez une expérience utile, précise et respectueuse."
        >

          <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.45)', margin: '0 0 6px' }}>Note (obligatoire)</p>
            <StarInput value={formRating} onChange={setFormRating} />
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', margin: '6px 0 0', minHeight: 16 }}>{['', 'Décevant', 'Moyen', 'Bien', 'Très bien', 'Excellent'][formRating] || 'Touche les étoiles pour noter'}</p>
          </div>

          <Label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', margin: '14px 0 8px' }}>Ton avis</Label>
          <Textarea
            value={formComment}
            onChange={(e) => setFormComment(e.target.value.slice(0, REVIEW_COMMENT_MAX))}
            rows={5}
            placeholder="Raconte ton expérience : qualité de la prestation, ponctualité, communication…"
            style={{ minHeight: 120, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: '#0b0c12', color: 'rgba(255,255,255,.92)', padding: 14, fontSize: 14, lineHeight: 1.55 }}
          />
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,.38)', margin: '7px 0 0', textAlign: 'right' }}>
            {formComment.trim().length} / {REVIEW_COMMENT_MAX}
          </p>
          <p style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(255,255,255,.42)', margin: '6px 0 14px' }}>Ton avis est publié avec ton nom d&rsquo;affichage. Les avis contraires aux règles peuvent être retirés par la modération.</p>

          {formErr && (
            <p role="alert" style={{ fontSize: 12.5, color: '#e8d49e', background: 'rgba(255,123,123,.12)', border: '1px solid rgba(255,123,123,.4)', borderRadius: 10, padding: '10px 12px', margin: '0 0 12px' }}>
              {formErr}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={() => setShowForm(false)} disabled={formBusy} style={{ ...ghostBtn, flex: 1 }}>
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              loading={formBusy}
              loadingText="Publication…"
              style={{ ...primaryBtn, flex: 1.6, ...(formBusy ? disabledBtn : null) }}
            >
              Publier mon avis
            </Button>
          </div>
        </Sheet>
      )}

      {reportTarget && (
        <Sheet
          onClose={() => !reportBusy && setReportTarget(null)}
          title={reportDone ? 'Signalement transmis' : 'Signaler cet avis'}
          subtitle={reportDone ? undefined : 'Choisissez le motif qui décrit le mieux le problème.'}
        >
          {reportDone ? (
            <div style={{ textAlign: 'center', padding: '14px 0 6px' }}>
              <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,.6)', lineHeight: 1.6, margin: '0 0 18px' }}>{typeof reportDone === 'string' ? reportDone : 'Ton signalement a été transmis. Notre équipe va examiner cet avis.'}</p>
              <Button onClick={() => setReportTarget(null)} style={{ ...primaryBtn, minWidth: 160 }}>
                Fermer
              </Button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
                {REVIEW_REPORT_REASONS.map((reason) => (
                  <Button
                    key={reason.id}
                    variant="secondary"
                    type="button"
                    onClick={() => setReportReason(reason.id)}
                    style={{
                      textAlign: 'left',
                      justifyContent: 'flex-start',
                      minHeight: 44,
                      padding: '11px 14px',
                      borderRadius: 12,
                      fontSize: 13.5,
                      fontWeight: 600,
                      background: reportReason === reason.id ? 'rgba(200,169,110,.16)' : 'rgba(255,255,255,.05)',
                      border: reportReason === reason.id ? '1px solid rgba(200,169,110,.6)' : '1px solid rgba(255,255,255,.10)',
                      color: reportReason === reason.id ? '#cdb4ff' : 'rgba(255,255,255,.78)',
                    }}
                  >
                    {reason.label}
                  </Button>
                ))}
              </div>
              <Label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', marginBottom: 8 }}>Ajouter une précision (facultatif)</Label>
              <Textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Explique en quelques mots ce qui pose problème…"
                style={{ minHeight: 76, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: '#0b0c12', color: 'rgba(255,255,255,.92)', padding: 12, fontSize: 13.5, lineHeight: 1.5 }}
              />
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,.38)', margin: '7px 0 16px', textAlign: 'right' }}>
                {reportDetails.length} / 500
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" onClick={() => setReportTarget(null)} disabled={reportBusy} style={{ ...ghostBtn, flex: 1 }}>
                  Annuler
                </Button>
                <Button
                  onClick={handleReport}
                  disabled={!reportReason}
                  loading={reportBusy}
                  loadingText="Envoi…"
                  style={{ ...primaryBtn, flex: 1.4, ...(!reportReason ? disabledBtn : null) }}
                >
                  Envoyer le signalement
                </Button>
              </div>
            </>
          )}
        </Sheet>
      )}

      {confirmRemove && (
        <Sheet compact onClose={() => !removeBusy && setConfirmRemove(false)} title="Retirer votre avis ?">
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,.6)', lineHeight: 1.6, margin: '0 0 18px' }}>Ton avis et ta note ne seront plus visibles sur la page de {providerName || 'ce prestataire'}.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={() => setConfirmRemove(false)} disabled={removeBusy} style={{ ...ghostBtn, flex: 1 }}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={handleRemoveOwn}
              loading={removeBusy}
              loadingText="Retrait…"
              style={{ ...primaryBtn, flex: 1.2, background: '#ff7b7b', boxShadow: 'none' }}
            >
              Retirer mon avis
            </Button>
          </div>
        </Sheet>
      )}
    </section>
  )
}
