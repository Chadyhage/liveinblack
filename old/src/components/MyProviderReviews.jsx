// Onglet « Mes avis » du dashboard prestataire (Mon Espace). Le prestataire
// consulte les avis reçus (publiés + masqués), voit sa moyenne, RÉPOND (une
// seule réponse, modifiable) et peut signaler un avis abusif. Il ne peut ni
// modifier ni supprimer les avis de ses clients — c'est la crédibilité du
// système.

import { useEffect, useState } from 'react'
import { Stars } from './StarRating'
import {
  computeReviewStats,
  fetchMyProviderReviews,
  replyToReview,
  reportReview,
  REVIEW_REPORT_REASONS,
} from '../utils/reviews'

const FONT = 'Inter, system-ui, sans-serif'
const GOLD = '#c8a96e'

const card = { background: '#0e0f16', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }
const primaryBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 40, padding: '9px 15px', borderRadius: 11, border: '1px solid rgba(255,255,255,.14)', cursor: 'pointer', background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)', color: '#fff', fontFamily: FONT, fontSize: 12.5, fontWeight: 700, boxShadow: '0 6px 20px rgba(122,59,242,.35)' }
const ghostBtn = { ...primaryBtn, background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.9)', fontWeight: 600, boxShadow: 'none' }
const disabledBtn = { background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.35)', border: '1px solid rgba(255,255,255,.06)', cursor: 'not-allowed', boxShadow: 'none' }
const spinner = { width: 13, height: 13, display: 'inline-block', borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', flexShrink: 0 }

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) } catch { return '' }
}

export default function MyProviderReviews({ uid }) {
  const [state, setState] = useState({ loading: true, ok: true, items: [] })
  const [replyFor, setReplyFor] = useState(null) // reviewId en cours de réponse
  const [replyText, setReplyText] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)
  const [replyErr, setReplyErr] = useState('')
  const [reportFor, setReportFor] = useState(null)
  const [reportReason, setReportReason] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportMsg, setReportMsg] = useState('')

  async function reload() {
    const res = await fetchMyProviderReviews(uid)
    setState({ loading: false, ok: res.ok, items: res.items })
  }

  useEffect(() => {
    let cancelled = false
    fetchMyProviderReviews(uid).then(res => {
      if (!cancelled) setState({ loading: false, ok: res.ok, items: res.items })
    })
    return () => { cancelled = true }
  }, [uid])

  const published = state.items.filter(r => r.status === 'published')
  const { avg, count, dist } = computeReviewStats(published)

  async function handleReply(review) {
    if (replyBusy) return
    const text = replyText.trim()
    if (!text) { setReplyErr('Ta réponse est vide.'); return }
    setReplyBusy(true)
    setReplyErr('')
    const res = await replyToReview({ reviewId: review.id || review._docId, text })
    setReplyBusy(false)
    if (!res.ok) { setReplyErr(res.error); return }
    setReplyFor(null)
    setReplyText('')
    reload()
  }

  async function handleReport(review) {
    if (reportBusy || !reportReason) return
    setReportBusy(true)
    const res = await reportReview({ reviewId: review.id || review._docId, reason: reportReason, details: '' })
    setReportBusy(false)
    setReportFor(null)
    setReportReason('')
    setReportMsg(res.ok || res.status === 409 ? 'Merci, ton signalement a été transmis à la modération.' : res.error)
    setTimeout(() => setReportMsg(''), 4000)
  }

  if (state.loading) {
    return (
      <div style={{ ...card, padding: 24, fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.5)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="lib-spin" style={spinner} /> Chargement de tes avis…
      </div>
    )
  }

  if (!state.ok) {
    return (
      <div style={{ ...card, padding: 24 }}>
        <p style={{ fontFamily: FONT, fontSize: 13.5, color: '#ff8fb2', margin: 0, lineHeight: 1.6 }}>
          Lecture impossible — recharge la page ; si ça persiste, reconnecte-toi.
        </p>
      </div>
    )
  }

  return (
    <section>
      {reportMsg && (
        <div role="status" style={{ ...card, padding: '12px 16px', marginBottom: 12, borderColor: 'rgba(78,232,200,.35)' }}>
          <p style={{ fontFamily: FONT, fontSize: 12.5, color: '#4ee8c8', margin: 0 }}>{reportMsg}</p>
        </div>
      )}

      {count === 0 && state.items.length === 0 ? (
        <div style={{ ...card, padding: 28 }}>
          <h2 style={{ fontFamily: FONT, fontSize: 20, margin: '0 0 8px' }}>Pas encore d’avis</h2>
          <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,.55)', lineHeight: 1.65, margin: 0 }}>
            Les clients qui ont travaillé avec toi pourront laisser une note et un commentaire sur ta page publique.
            Les avis renforcent la confiance : n’hésite pas à inviter tes clients satisfaits à en laisser un.
          </p>
        </div>
      ) : (
        <>
          {/* ── Résumé ── */}
          <div style={{ ...card, padding: 20, marginBottom: 14, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ textAlign: 'center', minWidth: 100 }}>
              <p style={{ fontFamily: FONT, fontSize: 36, fontWeight: 800, letterSpacing: '-1.5px', color: '#fff', margin: 0, lineHeight: 1 }}>
                {String(avg).replace('.', ',')}<span style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,.4)' }}> / 5</span>
              </p>
              <div style={{ marginTop: 6 }}><Stars value={avg} size={15} /></div>
              <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.45)', margin: '5px 0 0' }}>{count} avis publié{count > 1 ? 's' : ''}</p>
            </div>
            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[5, 4, 3, 2, 1].map(n => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.55)', width: 10, textAlign: 'right' }}>{n}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                    <div style={{ width: `${count ? Math.round((dist[n] / count) * 100) : 0}%`, height: '100%', borderRadius: 999, background: GOLD }} />
                  </div>
                  <span style={{ fontFamily: FONT, fontSize: 10.5, color: 'rgba(255,255,255,.4)', width: 20 }}>{dist[n]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Liste ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {state.items.map(review => {
              const rid = review.id || review._docId
              const hidden = review.status === 'hidden'
              return (
                <article key={rid} style={{ ...card, padding: 18, ...(hidden ? { opacity: 0.75, borderColor: 'rgba(224,90,170,.3)' } : null) }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Stars value={review.rating} size={14} />
                    <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{review.authorName || 'Membre'}</span>
                    {review.verified && (
                      <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: '#4ee8c8', background: 'rgba(78,232,200,.10)', border: '1px solid rgba(78,232,200,.35)', borderRadius: 999, padding: '2px 8px' }}>Avis vérifié</span>
                    )}
                    {hidden && (
                      <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: '#ff8fb2', background: 'rgba(194,52,127,.12)', border: '1px solid rgba(194,52,127,.4)', borderRadius: 999, padding: '2px 8px' }}>
                        Masqué par la modération
                      </span>
                    )}
                    <span style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.38)' }}>{fmtDate(review.createdAt)}</span>
                  </div>
                  <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,.72)', lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: '9px 0 0', wordBreak: 'break-word' }}>{review.comment}</p>

                  {review.reply?.text && replyFor !== rid && (
                    <div style={{ marginTop: 11, padding: '10px 13px', borderRadius: 12, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)' }}>
                      <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: GOLD, margin: '0 0 5px' }}>Ta réponse</p>
                      <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.66)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0, wordBreak: 'break-word' }}>{review.reply.text}</p>
                    </div>
                  )}

                  {replyFor === rid ? (
                    <div style={{ marginTop: 12 }}>
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value.slice(0, 1000))}
                        rows={3}
                        placeholder="Réponds publiquement à ce client — reste courtois et professionnel."
                        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 76, borderRadius: 12, border: '1px solid rgba(255,255,255,.12)', background: '#0b0c12', color: 'rgba(255,255,255,.92)', outline: 'none', padding: 12, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.5 }}
                      />
                      {replyErr && <p role="alert" style={{ fontFamily: FONT, fontSize: 12, color: '#ff8fb2', margin: '7px 0 0' }}>{replyErr}</p>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                        <button onClick={() => { setReplyFor(null); setReplyErr('') }} disabled={replyBusy} style={ghostBtn}>Annuler</button>
                        <button onClick={() => handleReply(review)} disabled={replyBusy} style={{ ...primaryBtn, ...(replyBusy ? disabledBtn : null) }}>
                          {replyBusy ? <><span className="lib-spin" style={spinner} /> Envoi…</> : 'Publier ma réponse'}
                        </button>
                      </div>
                    </div>
                  ) : reportFor === rid ? (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', margin: '0 0 8px' }}>Motif du signalement</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                        {REVIEW_REPORT_REASONS.map(reason => (
                          <button key={reason.id} type="button" onClick={() => setReportReason(reason.id)} style={{ padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: 600, background: reportReason === reason.id ? 'rgba(143,86,255,.16)' : 'rgba(255,255,255,.05)', border: reportReason === reason.id ? '1px solid rgba(143,86,255,.6)' : '1px solid rgba(255,255,255,.10)', color: reportReason === reason.id ? '#cdb4ff' : 'rgba(255,255,255,.7)' }}>
                            {reason.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setReportFor(null); setReportReason('') }} disabled={reportBusy} style={ghostBtn}>Annuler</button>
                        <button onClick={() => handleReport(review)} disabled={reportBusy || !reportReason} style={{ ...primaryBtn, ...((reportBusy || !reportReason) ? disabledBtn : null) }}>
                          {reportBusy ? <><span className="lib-spin" style={spinner} /> Envoi…</> : 'Signaler cet avis'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                      {review.status !== 'deleted' && (
                        <button onClick={() => { setReplyFor(rid); setReplyText(review.reply?.text || ''); setReplyErr('') }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: '#4ee8c8' }}>
                          {review.reply?.text ? 'Modifier ma réponse' : 'Répondre'}
                        </button>
                      )}
                      {!hidden && (
                        <button onClick={() => { setReportFor(rid); setReportReason('') }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,.38)' }}>
                          Signaler
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
