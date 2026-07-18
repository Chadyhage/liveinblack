// Section « Avis clients » d'une page publique prestataire : note moyenne,
// répartition, liste des avis publiés, publication/édition de SON avis,
// signalement. Publication directe (choix produit V1) — la modération se fait
// a posteriori (signalements + panneau admin).

import { useEffect, useState } from 'react'
import { Stars, StarInput } from './StarRating'
import {
  computeReviewStats,
  deleteOwnReview,
  fetchMyReviewFor,
  fetchPublishedReviews,
  reportReview,
  submitReview,
  REVIEW_COMMENT_MAX,
  REVIEW_COMMENT_MIN,
  REVIEW_REPORT_REASONS,
} from '../utils/reviews'

const FONT = 'Inter, system-ui, sans-serif'
const GOLD = '#c8a96e'
const TEAL = '#4ee8c8'

const card = { padding: 20, borderRadius: 16, background: '#0e0f16', border: '1px solid rgba(255,255,255,.08)', boxShadow: '0 8px 24px rgba(0,0,0,.35)' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, padding: '11px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,.14)', cursor: 'pointer', background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)', color: '#fff', fontFamily: FONT, fontSize: 13, fontWeight: 700, boxShadow: '0 6px 20px rgba(122,59,242,.35)' }
const ghostBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, padding: '11px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,.14)', cursor: 'pointer', background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.9)', fontFamily: FONT, fontSize: 13, fontWeight: 600 }
const disabledBtn = { background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.35)', border: '1px solid rgba(255,255,255,.06)', cursor: 'not-allowed', boxShadow: 'none' }
const spinner = { width: 14, height: 14, display: 'inline-block', borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', flexShrink: 0 }

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return '' }
}

function Sheet({ onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,.72)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: 'min(100%, 520px)', maxHeight: '88vh', overflowY: 'auto', borderRadius: '20px 20px 0 0', background: '#12131c', border: '1px solid rgba(255,255,255,.10)', boxShadow: '0 -26px 80px rgba(0,0,0,.65)', padding: '18px 18px 24px' }}>
        <div style={{ width: 44, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.18)', margin: '0 auto 16px' }} />
        {children}
      </div>
    </div>
  )
}

export default function ProviderReviews({ providerId, providerName, uid, user, openAuthModal, isSelf }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [myReview, setMyReview] = useState(null)

  // Formulaire « Laisser un avis »
  const [showForm, setShowForm] = useState(false)
  const [formRating, setFormRating] = useState(0)
  const [formComment, setFormComment] = useState('')
  const [formBusy, setFormBusy] = useState(false)
  const [formErr, setFormErr] = useState('')

  // Signalement
  const [reportTarget, setReportTarget] = useState(null) // avis en cours de signalement
  const [reportReason, setReportReason] = useState('')
  const [reportDetails, setReportDetails] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportDone, setReportDone] = useState(false)

  const [removeBusy, setRemoveBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function reload() {
    const [list, mine] = await Promise.all([
      fetchPublishedReviews(providerId),
      uid ? fetchMyReviewFor(providerId, uid) : Promise.resolve(null),
    ])
    setReviews(list)
    setMyReview(mine)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchPublishedReviews(providerId),
      uid ? fetchMyReviewFor(providerId, uid) : Promise.resolve(null),
    ]).then(([list, mine]) => {
      if (cancelled) return
      setReviews(list)
      setMyReview(mine)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [providerId, uid])

  const { avg, count, dist } = computeReviewStats(reviews)

  function openForm() {
    const seed = () => {
      setFormRating(myReview?.rating || 0)
      setFormComment(myReview?.comment || '')
      setFormErr('')
      setShowForm(true)
    }
    if (!user) {
      openAuthModal?.(`Connecte-toi pour laisser un avis sur ${providerName || 'ce prestataire'}.`, seed)
      return
    }
    seed()
  }

  async function handleSubmit() {
    if (formBusy) return
    const comment = formComment.trim()
    if (!formRating) { setFormErr('Choisis une note de 1 à 5 étoiles.'); return }
    if (comment.length < REVIEW_COMMENT_MIN) { setFormErr(`Ton commentaire doit faire au moins ${REVIEW_COMMENT_MIN} caractères.`); return }
    setFormBusy(true)
    setFormErr('')
    const res = await submitReview({ providerId, rating: formRating, comment })
    setFormBusy(false)
    if (!res.ok) { setFormErr(res.error); return }
    setShowForm(false)
    reload()
  }

  function openReport(review) {
    const seed = () => { setReportTarget(review); setReportReason(''); setReportDetails(''); setReportDone(false) }
    if (!user) {
      openAuthModal?.('Connecte-toi pour signaler cet avis.', seed)
      return
    }
    seed()
  }

  async function handleReport() {
    if (reportBusy || !reportTarget) return
    if (!reportReason) return
    setReportBusy(true)
    const res = await reportReview({ reviewId: reportTarget.id || reportTarget._docId, reason: reportReason, details: reportDetails.trim() })
    setReportBusy(false)
    // Doublon (409) = déjà transmis : même message de confirmation, pas d'erreur anxiogène.
    setReportDone(true)
    if (!res.ok && res.status !== 409) setReportDone(res.error || true)
  }

  async function handleRemoveOwn() {
    if (removeBusy || !myReview) return
    setRemoveBusy(true)
    const res = await deleteOwnReview(myReview.id || `${providerId}__${uid}`)
    setRemoveBusy(false)
    setConfirmRemove(false)
    if (res.ok) reload()
  }

  const hiddenMine = myReview?.status === 'hidden'

  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, letterSpacing: '-.3px', margin: 0 }}>Avis clients</h2>
        {count > 0 && <span style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.4)' }}>{count} avis</span>}
      </div>

      <div style={card}>
        {loading ? (
          <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.5)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="lib-spin" style={spinner} /> Chargement des avis…
          </p>
        ) : count === 0 ? (
          <div>
            <p style={{ fontFamily: FONT, fontSize: 14, color: 'rgba(255,255,255,.6)', lineHeight: 1.6, margin: 0 }}>
              {providerName || 'Ce prestataire'} n’a pas encore reçu d’avis.
              {!isSelf && ' Tu as travaillé avec lui ? Ton retour aidera les prochains clients.'}
            </p>
            {!isSelf && (
              <button onClick={openForm} style={{ ...primaryBtn, marginTop: 14 }}>Laisser un avis</button>
            )}
          </div>
        ) : (
          <>
            {/* ── Résumé : moyenne + répartition ── */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ textAlign: 'center', minWidth: 110 }}>
                <p style={{ fontFamily: FONT, fontSize: 40, fontWeight: 800, letterSpacing: '-1.5px', color: '#fff', margin: 0, lineHeight: 1 }}>
                  {String(avg).replace('.', ',')}<span style={{ fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,.4)' }}> / 5</span>
                </p>
                <div style={{ marginTop: 7 }}><Stars value={avg} size={17} /></div>
                <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.45)', margin: '6px 0 0' }}>
                  Basée sur {count} avis
                </p>
              </div>
              <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[5, 4, 3, 2, 1].map(n => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,.55)', width: 10, textAlign: 'right' }}>{n}</span>
                    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.44 6.2 20.5l1.1-6.47L2.6 9.45l6.5-.95z" fill={GOLD} /></svg>
                    <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                      <div style={{ width: `${count ? Math.round((dist[n] / count) * 100) : 0}%`, height: '100%', borderRadius: 999, background: GOLD }} />
                    </div>
                    <span style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,.4)', width: 22 }}>{dist[n]}</span>
                  </div>
                ))}
              </div>
            </div>

            {!isSelf && (
              <button onClick={openForm} style={{ ...ghostBtn, marginTop: 18 }}>
                {myReview && !hiddenMine ? 'Modifier mon avis' : 'Laisser un avis'}
              </button>
            )}

            {/* ── Liste des avis ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 8 }}>
              {reviews.map(review => {
                const isMine = uid && review.authorId === uid
                return (
                  <article key={review.id || review._docId} style={{ padding: '16px 0', borderTop: '1px solid rgba(255,255,255,.07)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <Stars value={review.rating} size={14} />
                      <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{review.authorName || 'Membre'}</span>
                      {review.verified && (
                        <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: TEAL, background: 'rgba(78,232,200,.10)', border: '1px solid rgba(78,232,200,.35)', borderRadius: 999, padding: '2px 8px' }}>
                          Avis vérifié
                        </span>
                      )}
                      <span style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.38)' }}>
                        {fmtDate(review.createdAt)}{review.edited ? ' · modifié' : ''}
                      </span>
                    </div>
                    <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,.72)', lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: '9px 0 0', wordBreak: 'break-word' }}>{review.comment}</p>

                    {review.reply?.text && (
                      <div style={{ marginTop: 11, padding: '10px 13px', borderRadius: 12, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)' }}>
                        <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: GOLD, margin: '0 0 5px' }}>
                          Réponse de {providerName || 'du prestataire'}
                        </p>
                        <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.66)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0, wordBreak: 'break-word' }}>{review.reply.text}</p>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 14, marginTop: 9 }}>
                      {isMine ? (
                        <>
                          <button onClick={openForm} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: TEAL }}>Modifier</button>
                          <button onClick={() => setConfirmRemove(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.38)' }}>Retirer</button>
                        </>
                      ) : (
                        <button onClick={() => openReport(review)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.38)' }}>
                          Signaler
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Modal « Laisser / modifier un avis » ── */}
      {showForm && (
        <Sheet onClose={() => !formBusy && setShowForm(false)}>
          <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: GOLD, margin: '0 0 7px' }}>Avis client</p>
          <h3 style={{ fontFamily: FONT, fontSize: 25, lineHeight: 1.08, letterSpacing: '-.7px', margin: '0 0 16px', color: '#fff' }}>
            {myReview && myReview.status === 'published' ? 'Modifier mon avis' : `Noter ${providerName || 'ce prestataire'}`}
          </h3>

          <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
            <StarInput value={formRating} onChange={setFormRating} />
            <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.45)', margin: '6px 0 0', minHeight: 16 }}>
              {['', 'Décevant', 'Moyen', 'Bien', 'Très bien', 'Excellent'][formRating] || 'Touche les étoiles pour noter'}
            </p>
          </div>

          <label style={{ display: 'block', fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', margin: '14px 0 8px' }}>Ton avis</label>
          <textarea
            value={formComment}
            onChange={e => setFormComment(e.target.value.slice(0, REVIEW_COMMENT_MAX))}
            rows={5}
            placeholder="Raconte ton expérience : qualité de la prestation, ponctualité, communication…"
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 120, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: '#0b0c12', color: 'rgba(255,255,255,.92)', outline: 'none', padding: 14, fontFamily: FONT, fontSize: 14, lineHeight: 1.55 }}
          />
          <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,.38)', margin: '7px 0 0', textAlign: 'right' }}>
            {formComment.trim().length} / {REVIEW_COMMENT_MAX}
          </p>
          <p style={{ fontFamily: FONT, fontSize: 11, lineHeight: 1.55, color: 'rgba(255,255,255,.42)', margin: '6px 0 14px' }}>
            Ton avis est publié avec ton nom d’affichage. Les avis contraires aux règles peuvent être retirés par la modération.
          </p>

          {formErr && (
            <p role="alert" style={{ fontFamily: FONT, fontSize: 12.5, color: '#ff8fb2', background: 'rgba(194,52,127,.12)', border: '1px solid rgba(194,52,127,.4)', borderRadius: 10, padding: '10px 12px', margin: '0 0 12px' }}>{formErr}</p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowForm(false)} disabled={formBusy} style={{ ...ghostBtn, flex: 1 }}>Annuler</button>
            <button onClick={handleSubmit} disabled={formBusy} style={{ ...primaryBtn, flex: 1.6, ...(formBusy ? disabledBtn : null) }}>
              {formBusy ? <><span className="lib-spin" style={spinner} /> Publication…</> : 'Publier mon avis'}
            </button>
          </div>
        </Sheet>
      )}

      {/* ── Modal « Signaler cet avis » ── */}
      {reportTarget && (
        <Sheet onClose={() => !reportBusy && setReportTarget(null)}>
          {reportDone ? (
            <div style={{ textAlign: 'center', padding: '14px 0 6px' }}>
              <h3 style={{ fontFamily: FONT, fontSize: 22, letterSpacing: '-.5px', margin: '0 0 8px', color: '#fff' }}>Merci</h3>
              <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,.6)', lineHeight: 1.6, margin: '0 0 18px' }}>
                {typeof reportDone === 'string' ? reportDone : 'Ton signalement a été transmis. Notre équipe va examiner cet avis.'}
              </p>
              <button onClick={() => setReportTarget(null)} style={{ ...primaryBtn, minWidth: 160 }}>Fermer</button>
            </div>
          ) : (
            <>
              <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#ff8fb2', margin: '0 0 7px' }}>Signalement</p>
              <h3 style={{ fontFamily: FONT, fontSize: 24, lineHeight: 1.1, letterSpacing: '-.6px', margin: '0 0 14px', color: '#fff' }}>Signaler cet avis</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
                {REVIEW_REPORT_REASONS.map(reason => (
                  <button
                    key={reason.id}
                    type="button"
                    onClick={() => setReportReason(reason.id)}
                    style={{
                      textAlign: 'left', minHeight: 44, padding: '11px 14px', borderRadius: 12, cursor: 'pointer',
                      fontFamily: FONT, fontSize: 13.5, fontWeight: 600,
                      background: reportReason === reason.id ? 'rgba(143,86,255,.16)' : 'rgba(255,255,255,.05)',
                      border: reportReason === reason.id ? '1px solid rgba(143,86,255,.6)' : '1px solid rgba(255,255,255,.10)',
                      color: reportReason === reason.id ? '#cdb4ff' : 'rgba(255,255,255,.78)',
                    }}
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
              <label style={{ display: 'block', fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', marginBottom: 8 }}>Ajouter une précision (facultatif)</label>
              <textarea
                value={reportDetails}
                onChange={e => setReportDetails(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="Explique en quelques mots ce qui pose problème…"
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 76, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: '#0b0c12', color: 'rgba(255,255,255,.92)', outline: 'none', padding: 12, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setReportTarget(null)} disabled={reportBusy} style={{ ...ghostBtn, flex: 1 }}>Annuler</button>
                <button onClick={handleReport} disabled={reportBusy || !reportReason} style={{ ...primaryBtn, flex: 1.4, ...((reportBusy || !reportReason) ? disabledBtn : null) }}>
                  {reportBusy ? <><span className="lib-spin" style={spinner} /> Envoi…</> : 'Envoyer le signalement'}
                </button>
              </div>
            </>
          )}
        </Sheet>
      )}

      {/* ── Confirmation « Retirer mon avis » ── */}
      {confirmRemove && (
        <Sheet onClose={() => !removeBusy && setConfirmRemove(false)}>
          <h3 style={{ fontFamily: FONT, fontSize: 22, letterSpacing: '-.5px', margin: '0 0 8px', color: '#fff' }}>Retirer ton avis ?</h3>
          <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,.6)', lineHeight: 1.6, margin: '0 0 18px' }}>
            Ton avis et ta note ne seront plus visibles sur la page de {providerName || 'ce prestataire'}.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setConfirmRemove(false)} disabled={removeBusy} style={{ ...ghostBtn, flex: 1 }}>Annuler</button>
            <button onClick={handleRemoveOwn} disabled={removeBusy} style={{ ...primaryBtn, flex: 1.2, background: '#c2347f', boxShadow: 'none', ...(removeBusy ? disabledBtn : null) }}>
              {removeBusy ? <><span className="lib-spin" style={spinner} /> Retrait…</> : 'Retirer mon avis'}
            </button>
          </div>
        </Sheet>
      )}
    </section>
  )
}
