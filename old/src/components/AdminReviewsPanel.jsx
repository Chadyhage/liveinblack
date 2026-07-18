// Panneau admin « Avis » (AgentPage) — modération des avis prestataires.
// Liste tous les avis (publiés / masqués / supprimés), filtres par statut,
// note et texte (prestataire, auteur, contenu), signalements en tête. Actions :
// masquer, republier, supprimer, note admin — toutes via api/provider-reviews
// (action admin_moderate, Admin SDK + journal admin_audit).

import { useEffect, useMemo, useState } from 'react'
import { Stars } from './StarRating'
import { adminModerateReview } from '../utils/reviews'

const FONT = 'Inter, system-ui, sans-serif'
const GOLD = '#c8a96e'
const PINK = '#e05aaa'

const CARD = { background: '#0e0f16', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }
const btn = { minHeight: 36, padding: '8px 13px', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.9)', fontFamily: FONT, fontSize: 12, fontWeight: 700 }
const inputStyle = { boxSizing: 'border-box', minHeight: 40, padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: '#0b0c12', color: 'rgba(255,255,255,.92)', outline: 'none', fontFamily: FONT, fontSize: 13 }

const STATUS_META = {
  published: { label: 'Publié', color: '#4ee8c8', bg: 'rgba(78,232,200,.10)', border: 'rgba(78,232,200,.35)' },
  hidden: { label: 'Masqué', color: '#ff8fb2', bg: 'rgba(194,52,127,.12)', border: 'rgba(194,52,127,.4)' },
  deleted: { label: 'Supprimé', color: 'rgba(255,255,255,.45)', bg: 'rgba(255,255,255,.06)', border: 'rgba(255,255,255,.16)' },
}

const REASON_LABELS = {
  faux_avis: 'Faux avis', insultant: 'Contenu insultant', discriminatoire: 'Contenu discriminatoire',
  spam: 'Spam', info_personnelle: 'Info personnelle', hors_sujet: 'Hors sujet', autre: 'Autre',
}

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

export default function AdminReviewsPanel() {
  const [reviews, setReviews] = useState([])
  const [reports, setReports] = useState([])
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all') // all | published | hidden | deleted | reported
  const [ratingFilter, setRatingFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [noteFor, setNoteFor] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [toast, setToast] = useState('')

  async function load() {
    setLoading(true)
    const { loadCollectionStrict } = await import('../utils/firestore-sync')
    const [revRes, repRes] = await Promise.all([
      loadCollectionStrict('provider_reviews'),
      loadCollectionStrict('provider_review_reports'),
    ])
    if (!revRes.ok) setLoadError('avis (' + (revRes.error || 'erreur') + ')')
    else setReviews(revRes.items)
    if (repRes.ok) setReports(repRes.items)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const reportsByReview = useMemo(() => {
    const map = {}
    reports.forEach(r => {
      const key = r.reviewId
      if (!map[key]) map[key] = []
      map[key].push(r)
    })
    return map
  }, [reports])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reviews
      .filter(r => {
        if (statusFilter === 'reported') return (r.reportCount || 0) > 0 && r.status !== 'deleted'
        if (statusFilter !== 'all') return (r.status || 'published') === statusFilter
        return true
      })
      .filter(r => ratingFilter === 'all' || Number(r.rating) === Number(ratingFilter))
      .filter(r => !q
        || (r.providerName || '').toLowerCase().includes(q)
        || (r.providerId || '').toLowerCase().includes(q)
        || (r.authorName || '').toLowerCase().includes(q)
        || (r.comment || '').toLowerCase().includes(q))
      .sort((a, b) => {
        // Signalés ouverts d'abord, puis plus récents.
        const ra = (a.status !== 'deleted' && (a.reportCount || 0) > 0) ? 1 : 0
        const rb = (b.status !== 'deleted' && (b.reportCount || 0) > 0) ? 1 : 0
        if (ra !== rb) return rb - ra
        return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
      })
  }, [reviews, statusFilter, ratingFilter, search])

  const reportedCount = reviews.filter(r => (r.reportCount || 0) > 0 && r.status !== 'deleted').length

  async function act(review, op, note) {
    const rid = review.id || review._docId
    if (busyId) return
    setBusyId(rid)
    const res = await adminModerateReview({ reviewId: rid, op, note })
    setBusyId(null)
    if (!res.ok) { setToast(res.error || 'Action impossible.'); setTimeout(() => setToast(''), 3500); return }
    setNoteFor(null)
    setNoteText('')
    setToast(op === 'hide' ? 'Avis masqué.' : op === 'publish' ? 'Avis republié.' : op === 'delete' ? 'Avis supprimé.' : 'Note enregistrée.')
    setTimeout(() => setToast(''), 2500)
    load()
  }

  return (
    <div style={{ padding: '16px 16px 40px', maxWidth: 680, margin: '0 auto' }}>
      <p style={{ fontFamily: FONT, fontSize: 10, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
        Modération des avis prestataires{reportedCount > 0 ? ` · ${reportedCount} signalé${reportedCount > 1 ? 's' : ''}` : ''}
      </p>

      {loadError && (
        <div style={{ ...CARD, padding: '12px 16px', marginBottom: 12, borderColor: 'rgba(224,90,170,0.4)', borderLeft: '3px solid rgba(224,90,170,0.7)' }}>
          <p style={{ fontFamily: FONT, fontSize: 12, color: '#fff', margin: 0 }}>Lecture impossible : {loadError} — recharge la page (droits admin).</p>
        </div>
      )}

      {/* ── Filtres ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher (prestataire, auteur, texte…)"
          style={{ ...inputStyle, flex: '1 1 200px' }}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inputStyle}>
          <option value="all">Tous statuts</option>
          <option value="reported">Signalés</option>
          <option value="published">Publiés</option>
          <option value="hidden">Masqués</option>
          <option value="deleted">Supprimés</option>
        </select>
        <select value={ratingFilter} onChange={e => setRatingFilter(e.target.value)} style={inputStyle}>
          <option value="all">Toutes notes</option>
          {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} étoile{n > 1 ? 's' : ''}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ ...CARD, padding: 28, textAlign: 'center' }}>
          <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.5)', margin: 0 }}>Chargement des avis…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...CARD, padding: 28, textAlign: 'center' }}>
          <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,.55)', margin: 0 }}>
            {reviews.length === 0 ? 'Aucun avis pour le moment' : 'Aucun avis ne correspond aux filtres'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(review => {
            const rid = review.id || review._docId
            const meta = STATUS_META[review.status] || STATUS_META.published
            const revReports = reportsByReview[rid] || []
            const isReported = (review.reportCount || 0) > 0 && review.status !== 'deleted'
            const busy = busyId === rid
            return (
              <article key={rid} style={{ ...CARD, padding: 16, ...(isReported ? { borderColor: 'rgba(224,90,170,.35)', borderLeft: '3px solid rgba(224,90,170,.6)' } : null) }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: FONT, fontSize: 14.5, fontWeight: 700, color: '#fff', margin: 0 }}>
                      {review.providerName || review.providerId}
                      <span style={{ fontWeight: 400, color: 'rgba(255,255,255,.42)', fontSize: 12 }}> — avis de {review.authorName || review.authorId}</span>
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                      <Stars value={review.rating} size={13} />
                      {review.verified && <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: '#4ee8c8' }}>vérifié</span>}
                      <span style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,.38)' }}>{fmtDate(review.createdAt)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {isReported && (
                      <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(224,90,170,0.12)', border: '1px solid rgba(224,90,170,0.4)', fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: PINK }}>
                        {review.reportCount} signalement{review.reportCount > 1 ? 's' : ''}
                      </span>
                    )}
                    <span style={{ padding: '3px 9px', borderRadius: 999, background: meta.bg, border: `1px solid ${meta.border}`, fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: meta.color }}>
                      {meta.label}{review.hiddenBy === 'auto' ? ' (auto)' : ''}
                    </span>
                  </div>
                </div>

                <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: '10px 0 0', wordBreak: 'break-word' }}>{review.comment}</p>

                {review.reply?.text && (
                  <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.5)', lineHeight: 1.55, margin: '8px 0 0', paddingLeft: 12, borderLeft: `2px solid ${GOLD}55` }}>
                    <strong style={{ color: GOLD }}>Réponse presta :</strong> {review.reply.text}
                  </p>
                )}

                {revReports.length > 0 && (
                  <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 10, background: 'rgba(224,90,170,.06)', border: '1px solid rgba(224,90,170,.22)' }}>
                    <p style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: PINK, margin: '0 0 6px' }}>Signalements</p>
                    {revReports.map(rep => (
                      <p key={rep.id || rep._docId} style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,.62)', margin: '0 0 4px', lineHeight: 1.5 }}>
                        <strong>{REASON_LABELS[rep.reason] || rep.reason}</strong> — {rep.reporterName || 'Membre'} · {fmtDate(rep.createdAt)}
                        {rep.status !== 'open' && <span style={{ color: 'rgba(255,255,255,.38)' }}> · traité</span>}
                        {rep.details ? <><br /><span style={{ color: 'rgba(255,255,255,.45)' }}>« {rep.details} »</span></> : null}
                      </p>
                    ))}
                  </div>
                )}

                {review.adminNote && (
                  <p style={{ fontFamily: FONT, fontSize: 11.5, color: GOLD, margin: '8px 0 0' }}>Note admin : {review.adminNote}</p>
                )}

                {/* ── Actions ── */}
                {noteFor === rid ? (
                  <div style={{ marginTop: 10 }}>
                    <input
                      value={noteText}
                      onChange={e => setNoteText(e.target.value.slice(0, 500))}
                      placeholder="Note interne (visible des agents uniquement)"
                      style={{ ...inputStyle, width: '100%' }}
                    />
                    <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
                      <button onClick={() => { setNoteFor(null); setNoteText('') }} style={btn}>Annuler</button>
                      <button onClick={() => act(review, 'note', noteText.trim())} disabled={busy || !noteText.trim()} style={{ ...btn, background: '#3ed6b5', color: '#04120e', border: '1px solid rgba(255,255,255,.14)', ...(busy || !noteText.trim() ? { opacity: .5, cursor: 'not-allowed' } : null) }}>Enregistrer</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
                    {review.status === 'published' && (
                      <button onClick={() => act(review, 'hide')} disabled={busy} style={{ ...btn, color: '#ff9ed2', border: '1px solid rgba(224,90,170,.5)', background: 'rgba(224,90,170,.12)' }}>{busy ? '…' : 'Masquer'}</button>
                    )}
                    {review.status === 'hidden' && (
                      <button onClick={() => act(review, 'publish')} disabled={busy} style={{ ...btn, background: '#3ed6b5', color: '#04120e' }}>{busy ? '…' : 'Republier'}</button>
                    )}
                    {review.status !== 'deleted' && (
                      <button onClick={() => { if (window.confirm('Supprimer définitivement cet avis ? Il ne comptera plus dans la note du prestataire.')) act(review, 'delete') }} disabled={busy} style={{ ...btn, color: '#ff8fb2', border: '1px solid rgba(194,52,127,.5)', background: 'rgba(194,52,127,.12)' }}>{busy ? '…' : 'Supprimer'}</button>
                    )}
                    <button onClick={() => { setNoteFor(rid); setNoteText(review.adminNote || '') }} disabled={busy} style={btn}>Note admin</button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {toast && (
        <div role="status" style={{ position: 'fixed', zIndex: 100, left: '50%', bottom: 84, transform: 'translateX(-50%)', maxWidth: 'calc(100vw - 32px)', padding: '11px 16px', borderRadius: 12, background: 'rgba(12,12,22,.96)', border: '1px solid rgba(200,169,110,.5)', color: '#fff', fontFamily: FONT, fontSize: 12.5, boxShadow: '0 16px 44px rgba(0,0,0,.4)' }}>{toast}</div>
      )}
    </div>
  )
}
