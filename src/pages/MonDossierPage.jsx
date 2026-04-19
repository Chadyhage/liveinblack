import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getApplicationByUser,
  APPLICATION_STATUSES,
  DOCUMENT_LABELS,
  getRequiredDocs,
  getCompleteness,
  uploadDocument,
  deleteApplication,
} from '../utils/applications'
import Layout from '../components/Layout'

// ─── Design tokens ─────────────────────────────────────────────────────────
const FONTS = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'DM Mono', 'Fira Mono', monospace",
}
const COLORS = {
  teal:  '#4ee8c8',
  pink:  '#e05aaa',
  gold:  '#c8a96e',
  muted: 'rgba(255,255,255,0.42)',
  dim:   'rgba(255,255,255,0.22)',
}
const CARD = {
  background: 'rgba(8,10,20,0.55)',
  backdropFilter: 'blur(22px) saturate(1.6)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 12,
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function StatusBadge({ status }) {
  const cfg = APPLICATION_STATUSES[status] || { label: status, color: COLORS.muted, bg: 'transparent' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 5,
      border: `1px solid ${cfg.color}55`,
      background: cfg.bg,
      color: cfg.color,
      fontFamily: FONTS.mono, fontSize: 10, fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>
      {cfg.label}
    </span>
  )
}

function CompletenessBar({ score }) {
  const color = score >= 80 ? COLORS.teal : score >= 50 ? COLORS.gold : COLORS.pink
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim }}>Complétude du dossier</span>
        <span style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color }}>{score}%</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          width: `${score}%`,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  )
}

// ─── Audit log timeline ─────────────────────────────────────────────────────
function AuditLog({ log }) {
  if (!log?.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {[...log].reverse().map((entry, i) => {
        const statusCfg = APPLICATION_STATUSES[entry.action]
        const color = statusCfg?.color || COLORS.dim
        return (
          <div key={i} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: i < log.length - 1 ? 16 : 0 }}>
            {/* line */}
            {i < log.length - 1 && (
              <div style={{
                position: 'absolute', left: 11, top: 22, bottom: 0,
                width: 1, background: 'rgba(255,255,255,0.06)',
              }} />
            )}
            {/* dot */}
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              border: `1px solid ${color}55`,
              background: color + '14',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: 1,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#fff', margin: '3px 0 2px', fontWeight: 600 }}>
                {statusCfg?.label || entry.action}
              </p>
              {entry.note && (
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '0 0 2px' }}>
                  {entry.note}
                </p>
              )}
              <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: 0 }}>
                {entry.byName} · {formatDate(entry.at)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Document row ───────────────────────────────────────────────────────────
function DocRow({ docKey, entry, required, onUpload, uploading }) {
  const label    = DOCUMENT_LABELS[docKey]?.label || docKey
  const uploaded = !!entry
  const missing  = required && !uploaded
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 8, marginBottom: 6,
      background: uploaded ? 'rgba(78,232,200,0.04)' : missing ? 'rgba(224,90,170,0.04)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${uploaded ? 'rgba(78,232,200,0.18)' : missing ? 'rgba(224,90,170,0.22)' : 'rgba(255,255,255,0.07)'}`,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
        background: uploaded ? 'rgba(78,232,200,0.10)' : missing ? 'rgba(224,90,170,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${uploaded ? 'rgba(78,232,200,0.25)' : missing ? 'rgba(224,90,170,0.25)' : 'rgba(255,255,255,0.08)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
        color: uploaded ? COLORS.teal : missing ? COLORS.pink : COLORS.dim,
        fontWeight: 700,
      }}>
        {uploaded ? '✓' : missing ? '!' : '○'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: uploaded ? '#fff' : missing ? COLORS.pink : COLORS.dim, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}{missing && <span style={{ color: COLORS.pink }}> — requis</span>}
        </p>
        {entry?.name && (
          <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.name}
          </p>
        )}
      </div>
      {onUpload && (
        <label style={{ cursor: 'pointer', flexShrink: 0 }}>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
          <span style={{
            fontFamily: FONTS.mono, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '4px 9px', borderRadius: 4, cursor: 'pointer',
            color: uploaded ? COLORS.teal : COLORS.pink,
            border: `1px solid ${uploaded ? 'rgba(78,232,200,0.3)' : 'rgba(224,90,170,0.4)'}`,
          }}>
            {uploading ? '…' : uploaded ? 'Modifier' : 'Ajouter'}
          </span>
        </label>
      )}
    </div>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────
export default function MonDossierPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [app, setApp] = useState(null)
  const [tab, setTab] = useState('status')
  const [uploadStatus, setUploadStatus] = useState({}) // { [docKey]: 'uploading'|'done'|'error' }
  const [toast, setToast] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleUpload(docKey, file) {
    if (!app || !file) return
    setUploadStatus(s => ({ ...s, [docKey]: 'uploading' }))
    const res = await uploadDocument(app.id, docKey, file)
    if (res.ok) {
      setUploadStatus(s => ({ ...s, [docKey]: 'done' }))
      setApp(getApplicationByUser(user.uid, app.type))
      showToast('Document enregistré ✓')
    } else {
      setUploadStatus(s => ({ ...s, [docKey]: 'error' }))
      showToast('Erreur lors de l\'upload', 'error')
    }
  }

  async function handleDelete() {
    if (!app) return
    await deleteApplication(app.id)
    navigate('/')
  }

  useEffect(() => {
    if (!user) { navigate('/connexion'); return }
    // Show localStorage version immediately (fast render, no flash)
    const orgApp   = getApplicationByUser(user.uid, 'organisateur')
    const prestApp = getApplicationByUser(user.uid, 'prestataire')
    const found = orgApp || prestApp
    if (found) setApp(found)

    // Always also fetch from Firestore to get admin updates (status, corrections, etc.)
    // The admin writes to Firestore — the candidate must read from there to get changes
    import('../utils/applications').then(({ fetchApplicationsFromFirestore }) => {
      fetchApplicationsFromFirestore().then(apps => {
        const remote = apps.find(a => a.uid === user.uid)
        if (!remote) return
        // Use Firestore version if it's newer (or nothing was in localStorage)
        if (!found || (remote.updatedAt || 0) > (found.updatedAt || 0)) {
          setApp(remote)
        }
      }).catch(() => {})
    }).catch(() => {})
  }, [user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null

  if (!app) {
    // Préfill minimal depuis le compte existant (nom + email)
    const nameParts  = (user.name || '').trim().split(' ').filter(Boolean)
    const prefillOrg = {
      responsableNom:    nameParts[0] || '',
      responsablePrenom: nameParts.slice(1).join(' ') || '',
      emailPro:          user.email || '',
    }

    // Selon le rôle, on ne propose que l'option cohérente
    const canOrg   = !user.role || user.role === 'client' || user.role === 'organisateur'
    const canPrest = !user.role || user.role === 'client' || user.role === 'prestataire'

    return (
      <Layout>
        <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 20 }}>
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke={COLORS.dim} strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 22, color: '#fff', margin: '0 0 8px' }}>
              Aucun dossier trouvé
            </p>
            <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: 0 }}>
              {user.role === 'organisateur'
                ? 'Ton dossier organisateur a été supprimé. Tu peux en soumettre un nouveau.'
                : user.role === 'prestataire'
                ? 'Ton dossier prestataire a été supprimé. Tu peux en soumettre un nouveau.'
                : 'Tu n\'as pas encore soumis de candidature.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
            {canOrg && (
              <button
                onClick={() => navigate('/onboarding-organisateur', { state: { prefill: prefillOrg } })}
                style={{
                  padding: '11px 22px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(200,169,110,0.10)', border: '1px solid rgba(200,169,110,0.35)',
                  color: COLORS.gold, fontFamily: FONTS.mono, fontSize: 11,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                Dossier Organisateur
              </button>
            )}
            {canPrest && (
              <button
                onClick={() => navigate('/onboarding-prestataire')}
                style={{
                  padding: '11px 22px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.28)',
                  color: COLORS.teal, fontFamily: FONTS.mono, fontSize: 11,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                Dossier Prestataire
              </button>
            )}
          </div>
        </div>
      </Layout>
    )
  }

  const statusCfg  = APPLICATION_STATUSES[app.status] || {}
  const score      = getCompleteness(app)
  const isEditable = app.status === 'draft' || app.status === 'needs_changes'
  const editPath   = app.type === 'organisateur' ? '/onboarding-organisateur' : '/onboarding-prestataire'

  const requiredDocs = getRequiredDocs(app.type, app.formData?.prestataireType)
  const allDocKeys   = [...new Set([...requiredDocs, ...Object.keys(app.documents || {})])]

  return (
    <Layout>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 16px 8px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <button
              onClick={() => navigate(-1)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.dim, fontSize: 18, padding: 0, lineHeight: 1 }}>
              ←
            </button>
            <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
              Mon dossier
            </p>
          </div>
          <h1 style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 26, color: '#fff', margin: '0 0 4px', letterSpacing: '0.05em' }}>
            {app.type === 'organisateur' ? 'Dossier Organisateur' : 'Dossier Prestataire'}
          </h1>
          <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: 0 }}>
            Soumis le {formatDate(app.submittedAt)} · Réf. {app.id}
          </p>
        </div>

        {/* ── Status banner ── */}
        <div style={{
          ...CARD, padding: 16, marginBottom: 16,
          borderColor: statusCfg.color ? statusCfg.color + '44' : 'rgba(255,255,255,0.10)',
          background: statusCfg.bg || 'rgba(8,10,20,0.55)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
              Statut du dossier
            </p>
            <StatusBadge status={app.status} />
          </div>
          <CompletenessBar score={score} />
        </div>

        {/* ── Alert banners ── */}
        {app.status === 'needs_changes' && app.requestedChanges && (
          <div style={{
            ...CARD, padding: 16, marginBottom: 16,
            borderColor: 'rgba(245,158,11,0.40)',
            background: 'rgba(245,158,11,0.06)',
          }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>
              ⚠ Corrections requises
            </p>
            <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.5 }}>
              {app.requestedChanges}
            </p>
          </div>
        )}

        {app.status === 'rejected' && app.rejectionReason && (
          <div style={{
            ...CARD, padding: 16, marginBottom: 16,
            borderColor: 'rgba(224,90,170,0.40)',
            background: 'rgba(224,90,170,0.06)',
          }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.pink, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>
              ✕ Dossier refusé
            </p>
            <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px', lineHeight: 1.5 }}>
              {app.rejectionReason}
            </p>
            <button
              onClick={() => navigate(editPath)}
              style={{
                padding: '9px 18px', borderRadius: 5, cursor: 'pointer',
                background: 'rgba(224,90,170,0.12)', border: '1px solid rgba(224,90,170,0.35)',
                color: COLORS.pink, fontFamily: FONTS.mono, fontSize: 10,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
              Soumettre un nouveau dossier →
            </button>
          </div>
        )}

        {app.status === 'approved' && (
          <div style={{
            ...CARD, padding: 16, marginBottom: 16,
            borderColor: 'rgba(34,197,94,0.35)',
            background: 'rgba(34,197,94,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#22c55e', margin: 0, fontWeight: 600 }}>
                  Dossier approuvé
                </p>
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '2px 0 0' }}>
                  Votre compte a été activé le {formatDate(app.approvedAt)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── CTA edit (brouillon / corrections) ── */}
        {isEditable && (
          <button
            onClick={() => navigate(editPath)}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 8, cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(200,169,110,0.20), rgba(200,169,110,0.06))',
              border: '1px solid rgba(200,169,110,0.45)',
              color: COLORS.gold, fontFamily: FONTS.mono, fontSize: 12,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              marginBottom: 16,
            }}>
            {app.status === 'needs_changes' ? '✏  Corriger mon dossier' : '✏  Compléter mon dossier'}
          </button>
        )}

        {/* ── Info suivi (dossier soumis / en cours) ── */}
        {(app.status === 'submitted' || app.status === 'under_review') && (
          <div style={{
            ...CARD, padding: 14, marginBottom: 16,
            borderColor: 'rgba(78,232,200,0.18)',
            background: 'rgba(78,232,200,0.04)',
          }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.teal, margin: '0 0 4px', fontWeight: 600 }}>
              Dossier verrouillé — en attente de validation
            </p>
            <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: 0, lineHeight: 1.6 }}>
              Notre équipe examine ton dossier. Le statut ci-dessus sera mis à jour dès qu&apos;une décision sera prise. Si des corrections sont nécessaires, tu pourras modifier et renvoyer.
            </p>
          </div>
        )}

        {/* ── Supprimer le dossier ── */}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 8, cursor: 'pointer',
              background: 'transparent',
              border: '1px solid rgba(239,68,68,0.22)',
              color: 'rgba(239,68,68,0.55)', fontFamily: FONTS.mono, fontSize: 10,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              marginBottom: 16,
            }}>
            Supprimer le dossier
          </button>
        ) : (
          <div style={{
            ...CARD, padding: 16, marginBottom: 16,
            borderColor: 'rgba(239,68,68,0.35)',
            background: 'rgba(239,68,68,0.06)',
          }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#fff', margin: '0 0 4px', fontWeight: 600 }}>
              Supprimer définitivement ce dossier ?
            </p>
            <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
              Cette action est irréversible. Tu devras soumettre un nouveau dossier pour candidater à nouveau.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleDelete}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.45)',
                  color: '#ef4444', fontFamily: FONTS.mono, fontSize: 10,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                Oui, supprimer
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                  color: COLORS.dim, fontFamily: FONTS.mono, fontSize: 10,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{
          display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.07)',
          marginBottom: 20,
        }}>
          {[
            { key: 'status',    label: 'Résumé'    },
            { key: 'documents', label: 'Documents' },
            { key: 'history',   label: 'Historique' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '10px 0',
                fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.07em', textTransform: 'uppercase',
                background: 'none', cursor: 'pointer',
                borderBottom: tab === t.key ? `2px solid ${COLORS.gold}` : '2px solid transparent',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                color: tab === t.key ? COLORS.gold : COLORS.dim,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Résumé ── */}
        {tab === 'status' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Key info */}
            <div style={{ ...CARD, padding: 16 }}>
              <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px' }}>
                Informations principales
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Nom commercial',  value: app.formData?.nomCommercial   },
                  { label: 'Email professionnel', value: app.formData?.emailPro   },
                  { label: 'Téléphone',        value: app.formData?.telephonePro  },
                  { label: 'Responsable',      value: app.formData?.responsableNom },
                  { label: 'Ville',            value: app.formData?.ville          },
                  app.type === 'organisateur'
                    ? { label: 'SIRET',        value: app.formData?.siret          }
                    : { label: 'Type activité', value: app.formData?.prestataireType },
                ].filter(f => f?.value).map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, flexShrink: 0 }}>{f.label}</span>
                    <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: '#fff', textAlign: 'right' }}>{f.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stripe Connect status */}
            {app.stripe && (
              <div style={{ ...CARD, padding: 16 }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px' }}>
                  Paiements (Stripe Connect)
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Statut onboarding', value: app.stripe.onboarding_status || 'Non démarré' },
                    { label: 'Virements activés', value: app.stripe.payouts_enabled ? 'Oui' : 'Non' },
                    { label: 'Paiements activés', value: app.stripe.charges_enabled  ? 'Oui' : 'Non' },
                  ].map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim }}>{f.label}</span>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted }}>{f.value}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: 'rgba(255,255,255,0.18)', margin: '10px 0 0' }}>
                  La configuration Stripe sera disponible après validation de votre dossier.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Documents ── */}
        {tab === 'documents' && (
          <div>
            {/* Dossier verrouillé */}
            {!isEditable && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, marginBottom: 12 }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: 0, letterSpacing: '0.04em' }}>
                  🔒 Dossier verrouillé — les documents ne peuvent pas être modifiés après soumission.
                </p>
              </div>
            )}

            {/* Docs requis manquants — alerte (seulement si éditable) */}
            {isEditable && requiredDocs.some(k => !app.documents?.[k]) && (
              <div style={{ padding: '10px 14px', background: 'rgba(224,90,170,0.06)', border: '1px solid rgba(224,90,170,0.2)', borderRadius: 8, marginBottom: 12 }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.pink, margin: 0, letterSpacing: '0.04em' }}>
                  ⚠ Des documents obligatoires sont manquants. Ajoute-les pour que ton dossier puisse être traité.
                </p>
              </div>
            )}

            {/* Docs requis */}
            {requiredDocs.map(key => (
              <DocRow
                key={key}
                docKey={key}
                entry={app.documents?.[key]}
                required
                onUpload={isEditable ? (file => handleUpload(key, file)) : undefined}
                uploading={uploadStatus[key] === 'uploading'}
              />
            ))}

            {/* Doc optionnel : business_doc */}
            <DocRow
              docKey="business_doc"
              entry={app.documents?.business_doc}
              required={false}
              onUpload={isEditable ? (file => handleUpload('business_doc', file)) : undefined}
              uploading={uploadStatus.business_doc === 'uploading'}
            />

            {/* Doc conditionnel : licence alcool */}
            {app.formData?.alcool && (
              <DocRow
                docKey="alcohol_license"
                entry={app.documents?.alcohol_license}
                required
                onUpload={isEditable ? (file => handleUpload('alcohol_license', file)) : undefined}
                uploading={uploadStatus.alcohol_license === 'uploading'}
              />
            )}

            {isEditable && (
              <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '12px 0 0', letterSpacing: '0.04em' }}>
                Formats acceptés : PDF, JPG, PNG
              </p>
            )}
          </div>
        )}

        {/* ── Tab: Historique ── */}
        {tab === 'history' && (
          <div style={{ ...CARD, padding: 16 }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 16px' }}>
              Journal d&apos;activité
            </p>
            <AuditLog log={app.auditLog} />
          </div>
        )}

      </div>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 999, padding: '10px 20px', borderRadius: 8,
          background: toast.type === 'error' ? 'rgba(224,90,170,0.15)' : 'rgba(78,232,200,0.12)',
          border: `1px solid ${toast.type === 'error' ? 'rgba(224,90,170,0.4)' : 'rgba(78,232,200,0.35)'}`,
          backdropFilter: 'blur(16px)',
          fontFamily: FONTS.mono, fontSize: 11,
          color: toast.type === 'error' ? COLORS.pink : COLORS.teal,
          letterSpacing: '0.04em', whiteSpace: 'nowrap',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          {toast.msg}
        </div>
      )}
    </Layout>
  )
}
