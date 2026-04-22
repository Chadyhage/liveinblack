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
import {
  auditAccountForDeletion,
  createDeletionRequest,
  cancelDeletionRequest,
  getDeletionRequestByUser,
} from '../utils/accountDeletion'
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

// ─── Génération attestation de validation (ouverture dans un nouvel onglet → Ctrl+P pour PDF) ──
function openValidationReceipt(app) {
  const approvedDate = new Date(app.approvedAt || Date.now()).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const orgName    = app.formData?.nomCommercial || '—'
  const responsable = [app.formData?.responsablePrenom, app.formData?.responsableNom].filter(Boolean).join(' ') || '—'
  const emailPro   = app.formData?.emailPro || app.email || '—'
  const tel        = [app.formData?.telephoneProCode, app.formData?.telephonePro].filter(Boolean).join(' ') || '—'
  const ville      = app.formData?.ville || '—'
  const typeEtab   = app.formData?.typeEtablissement || '—'
  const refId      = app.id || '—'
  const approvedBy = app.auditLog?.slice().reverse().find(e => e.action === 'approved')?.byName || 'LIVEINBLACK'

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Attestation — ${orgName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=DM+Mono:wght@400;500&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Mono', monospace;
      background: #ffffff;
      color: #0a0a18;
      padding: 64px 80px;
      max-width: 760px;
      margin: 0 auto;
      line-height: 1.6;
    }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 48px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e0e0ec;
    }
    .logo {
      font-family: 'Cormorant Garamond', serif;
      font-size: 26px;
      font-weight: 300;
      letter-spacing: 0.12em;
      color: #0a0a18;
    }
    .logo span { font-style: italic; font-weight: 600; }
    .ref {
      font-size: 9px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #999;
      text-align: right;
      line-height: 1.8;
    }
    .badge {
      display: inline-block;
      background: #f0faf7;
      border: 1px solid #b8ead9;
      border-radius: 4px;
      padding: 3px 10px;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #1a9e72;
      font-weight: 500;
    }
    .title-section {
      margin-bottom: 36px;
    }
    .label {
      font-size: 9px;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: #aaa;
      margin-bottom: 8px;
    }
    h1 {
      font-family: 'Cormorant Garamond', serif;
      font-size: 36px;
      font-weight: 300;
      color: #0a0a18;
      margin-bottom: 8px;
      letter-spacing: 0.04em;
    }
    .subtitle {
      font-size: 11px;
      color: #888;
      letter-spacing: 0.06em;
    }
    .seal {
      background: linear-gradient(135deg, #f5f0e8, #fdf8ef);
      border: 1px solid #d4b896;
      border-radius: 8px;
      padding: 20px 24px;
      margin-bottom: 32px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .seal-icon {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, #c8a96e, #a87c3e);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: white;
      font-size: 20px;
    }
    .seal-text {
      font-size: 11px;
      color: #7a5c2e;
      letter-spacing: 0.04em;
      line-height: 1.7;
    }
    .seal-text strong {
      font-size: 13px;
      color: #4a3010;
      display: block;
      margin-bottom: 2px;
      font-family: 'Cormorant Garamond', serif;
      font-weight: 600;
      font-size: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }
    td {
      padding: 10px 0;
      border-bottom: 1px solid #f0f0f5;
      font-size: 11px;
      vertical-align: top;
    }
    td:first-child {
      color: #aaa;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-size: 9px;
      width: 180px;
      padding-top: 12px;
    }
    td:last-child { color: #0a0a18; font-size: 12px; }
    .divider {
      height: 1px;
      background: #e8e8f0;
      margin: 28px 0;
    }
    .footer {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid #e0e0ec;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .footer-left { font-size: 9px; color: #bbb; letter-spacing: 0.06em; line-height: 1.8; }
    .signature { text-align: right; }
    .signature .sig-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: 18px;
      font-weight: 300;
      font-style: italic;
      color: #c8a96e;
    }
    .signature .sig-title { font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: #aaa; margin-top: 2px; }
    .print-btn {
      position: fixed; bottom: 32px; right: 32px;
      background: #0a0a18; color: #fff;
      border: none; border-radius: 6px;
      padding: 12px 24px; font-family: 'DM Mono', monospace;
      font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase;
      cursor: pointer; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    }
    @media print {
      body { padding: 40px 48px; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="logo">L<span style="font-style:normal;font-weight:400">|</span>VE IN <span>BLACK</span></div>
    <div class="ref">
      <div class="badge">✓ Validé</div>
      <div style="margin-top:8px">Réf. ${refId}</div>
      <div>Émis le ${approvedDate}</div>
    </div>
  </div>

  <div class="title-section">
    <div class="label">Document officiel</div>
    <h1>Attestation de validation</h1>
    <div class="subtitle">Dossier organisateur approuvé par l&apos;équipe LIVEINBLACK</div>
  </div>

  <div class="seal">
    <div class="seal-icon">✓</div>
    <div class="seal-text">
      <strong>${orgName}</strong>
      Est officiellement reconnu(e) comme <strong style="display:inline;font-size:inherit;font-family:inherit;font-weight:600">organisateur partenaire</strong> sur la plateforme LIVEINBLACK et est autorisé(e) à créer et publier des événements.
    </div>
  </div>

  <table>
    <tr><td>Organisation</td><td>${orgName}</td></tr>
    <tr><td>Responsable</td><td>${responsable}</td></tr>
    <tr><td>Email professionnel</td><td>${emailPro}</td></tr>
    <tr><td>Téléphone</td><td>${tel}</td></tr>
    <tr><td>Ville</td><td>${ville}</td></tr>
    <tr><td>Type d'établissement</td><td>${typeEtab}</td></tr>
    <tr><td>Date de validation</td><td>${approvedDate}</td></tr>
    <tr><td>Validé par</td><td>${approvedBy} — Équipe LIVEINBLACK</td></tr>
    <tr><td>Référence dossier</td><td>${refId}</td></tr>
  </table>

  <div class="divider"></div>

  <p style="font-size:10px;color:#aaa;line-height:1.8;letter-spacing:0.03em">
    Ce document atteste que l'organisation mentionnée ci-dessus a soumis un dossier complet, vérifié et approuvé par l'équipe LIVEINBLACK.
    Cette attestation est valable jusqu'à révocation du statut d'organisateur.
    En cas de doute sur l'authenticité de ce document, contacter <strong style="color:#888">support@liveinblack.com</strong>.
  </p>

  <div class="footer">
    <div class="footer-left">
      LIVEINBLACK — Plateforme événementielle<br>
      liveinblack.com<br>
      Document généré le ${new Date().toLocaleDateString('fr-FR')}
    </div>
    <div class="signature">
      <div class="sig-name">LIVEINBLACK</div>
      <div class="sig-title">Équipe de validation</div>
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">↓ Enregistrer en PDF</button>

</body>
</html>`

  const win = window.open('', '_blank')
  if (win) { win.document.write(html); win.document.close() }
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
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '0 0 2px', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
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
  // ── Demande de suppression (comptes validés) ──
  const [deletionReq, setDeletionReq]         = useState(null)
  const [showDeletionForm, setShowDeletionForm] = useState(false)
  const [deletionReason, setDeletionReason]   = useState('')
  const [auditResult, setAuditResult]         = useState(null)   // { blockers, warnings }
  const [deletionLoading, setDeletionLoading] = useState(false)

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

    // Charger une éventuelle demande de suppression en cours
    setDeletionReq(getDeletionRequestByUser(user.uid))

    // Always also fetch from Firestore to get admin updates (status, corrections, etc.)
    // The admin writes to Firestore — the candidate must read from there to get changes
    import('../utils/applications').then(({ fetchApplicationsFromFirestore }) => {
      fetchApplicationsFromFirestore().then(apps => {
        const remote = apps.find(a => a.uid === user.uid || a.userId === user.uid)
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: '#22c55e', margin: 0, fontWeight: 600 }}>
                    Dossier approuvé
                  </p>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '2px 0 0' }}>
                    Compte activé le {formatDate(app.approvedAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => openValidationReceipt(app)}
                title="Télécharger l'attestation"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                  background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.30)',
                  color: '#22c55e', fontFamily: FONTS.mono, fontSize: 10,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <polyline points="9 15 12 18 15 15"/>
                </svg>
                Attestation
              </button>
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

        {/* ── Suppression : flux différent selon statut ── */}
        {app.status === 'approved' ? (
          // ── Compte validé : demande admin obligatoire ──
          <div style={{ marginBottom: 16 }}>
            {/* Demande déjà en cours */}
            {deletionReq ? (
              <div style={{
                ...CARD, padding: 16,
                borderColor: 'rgba(239,68,68,0.30)',
                background: 'rgba(239,68,68,0.05)',
              }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px' }}>
                  ⏳ Demande de suppression en cours
                </p>
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '0 0 12px', lineHeight: 1.5 }}>
                  Ta demande a été transmise à l&apos;équipe LIVEINBLACK le {new Date(deletionReq.requestedAt).toLocaleDateString('fr-FR')}. Tu recevras une réponse prochainement.
                </p>
                <button
                  onClick={() => { cancelDeletionRequest(deletionReq.id); setDeletionReq(null); setShowDeletionForm(false) }}
                  style={{
                    padding: '8px 16px', borderRadius: 5, cursor: 'pointer',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                    color: COLORS.dim, fontFamily: FONTS.mono, fontSize: 10,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                  Annuler la demande
                </button>
              </div>
            ) : !showDeletionForm ? (
              // Bouton d'ouverture
              <button
                onClick={() => {
                  setAuditResult(auditAccountForDeletion(user.uid, user.role))
                  setShowDeletionForm(true)
                }}
                style={{
                  width: '100%', padding: '11px 0', borderRadius: 8, cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(239,68,68,0.22)',
                  color: 'rgba(239,68,68,0.55)', fontFamily: FONTS.mono, fontSize: 10,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                Demander la suppression du compte
              </button>
            ) : (
              // Formulaire de demande
              <div style={{
                ...CARD, padding: 16,
                borderColor: 'rgba(239,68,68,0.30)',
                background: 'rgba(239,68,68,0.04)',
              }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
                  Demande de suppression de compte
                </p>
                <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '0 0 14px', lineHeight: 1.6 }}>
                  La suppression doit être validée par notre équipe. Une fois approuvée, tes données personnelles seront anonymisées. Les données transactionnelles (billets, paiements) restent archivées conformément aux obligations légales (10 ans).
                </p>

                {/* Résultats audit */}
                {auditResult && (auditResult.blockers.length > 0 || auditResult.warnings.length > 0) && (
                  <div style={{ marginBottom: 14 }}>
                    {auditResult.blockers.length > 0 && (
                      <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7, marginBottom: 8 }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                          ⚠ Points à résoudre (signalés à l&apos;admin)
                        </p>
                        {auditResult.blockers.map((b, i) => (
                          <p key={i} style={{ fontFamily: FONTS.mono, fontSize: 10, color: 'rgba(239,68,68,0.8)', margin: '0 0 3px', lineHeight: 1.5 }}>
                            • {b.label}
                          </p>
                        ))}
                      </div>
                    )}
                    {auditResult.warnings.length > 0 && (
                      <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.22)', borderRadius: 7 }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                          ℹ Ce qui sera archivé
                        </p>
                        {auditResult.warnings.map((w, i) => (
                          <p key={i} style={{ fontFamily: FONTS.mono, fontSize: 10, color: 'rgba(245,158,11,0.75)', margin: '0 0 3px', lineHeight: 1.5 }}>
                            • {w.label}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Raison */}
                <label style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
                  Raison de la suppression <span style={{ color: COLORS.pink }}>*</span>
                </label>
                <textarea
                  value={deletionReason}
                  onChange={e => setDeletionReason(e.target.value)}
                  placeholder="Ex : je cesse mon activité, je n'utilise plus la plateforme…"
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(6,8,16,0.7)', border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 5, padding: '9px 11px', resize: 'vertical',
                    fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(255,255,255,0.8)',
                    lineHeight: 1.6, outline: 'none', marginBottom: 12,
                  }}
                />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    disabled={deletionLoading || !deletionReason.trim()}
                    onClick={async () => {
                      if (!deletionReason.trim()) return
                      setDeletionLoading(true)
                      const req = createDeletionRequest({
                        uid:             user.uid,
                        userName:        user.name || '',
                        userEmail:       user.email || '',
                        userRole:        user.role  || '',
                        applicationId:   app.id,
                        applicationType: app.type,
                        reason:          deletionReason,
                        audit:           auditResult || { blockers: [], warnings: [] },
                      })
                      setDeletionReq(req)
                      setShowDeletionForm(false)
                      setDeletionReason('')
                      setDeletionLoading(false)
                      showToast('Demande envoyée — l\'équipe te répondra prochainement.')
                    }}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 6, cursor: deletionReason.trim() ? 'pointer' : 'not-allowed',
                      background: deletionReason.trim() ? 'rgba(239,68,68,0.16)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${deletionReason.trim() ? 'rgba(239,68,68,0.40)' : 'rgba(255,255,255,0.08)'}`,
                      color: deletionReason.trim() ? '#ef4444' : COLORS.dim,
                      fontFamily: FONTS.mono, fontSize: 10,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      opacity: deletionLoading ? 0.6 : 1,
                    }}>
                    {deletionLoading ? '…' : 'Envoyer la demande'}
                  </button>
                  <button
                    onClick={() => { setShowDeletionForm(false); setAuditResult(null); setDeletionReason('') }}
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
          </div>
        ) : (
          // ── Dossier non validé : suppression directe ──
          !confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 8, cursor: 'pointer',
                background: 'transparent', border: '1px solid rgba(239,68,68,0.22)',
                color: 'rgba(239,68,68,0.55)', fontFamily: FONTS.mono, fontSize: 10,
                letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16,
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
          )
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
