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
import { IconCheck, IconAlert } from '../components/icons'
import { getProviderCategories } from '../utils/providerCategories'

// ─── Design tokens ─────────────────────────────────────────────────────────
const FONTS = {
  display: "Inter, sans-serif",
  mono: "Inter, sans-serif",
}
const COLORS = {
  teal:  '#4ee8c8',
  pink:  '#e05aaa',
  gold:  '#c8a96e',
  muted: 'rgba(255,255,255,0.55)',
  dim:   'rgba(255,255,255,0.4)',
}
const CARD = {
  background: '#0e0f16',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
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
  const fd = app.formData || {}
  const isOrg = app.type === 'organisateur'
  const approvedDate = new Date(app.approvedAt || Date.now()).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const refId      = app.id || '—'
  const approvedBy = app.auditLog?.slice().reverse().find(e => e.action === 'approved')?.byName || 'LIVEINBLACK'

  // ── Champs & libellés selon le rôle (organisateur ↔ prestataire) ──
  const orgName = isOrg
    ? (fd.nomCommercial || '—')
    : (fd.nomScene?.trim() || fd.nomCommercial?.trim() || [fd.prenom, fd.nom].filter(Boolean).join(' ') || '—')
  const emailPro = isOrg ? (fd.emailPro || app.email || '—') : (app.email || fd.emailPro || '—')
  const tel = isOrg
    ? ([fd.telephoneProCode, fd.telephonePro].filter(Boolean).join(' ') || '—')
    : ([fd.telephoneCode, fd.telephone].filter(Boolean).join(' ') || '—')
  const ville = fd.ville || '—'
  const typeEtab = isOrg
    ? (fd.typeEtablissement || 'Organisateur')
    : getProviderCategories(fd).map(category => category.singular).join(' · ')

  const roleWord   = isOrg ? 'organisateur' : 'prestataire'
  const subtitle   = isOrg ? "Dossier organisateur approuvé par l'équipe LIVEINBLACK" : "Dossier prestataire approuvé par l'équipe LIVEINBLACK"
  const roleDesc   = isOrg
    ? 'Est officiellement reconnu(e) comme <strong style="display:inline;font-size:inherit;font-family:inherit;font-weight:600">organisateur partenaire</strong> sur la plateforme LIVEINBLACK et est autorisé(e) à créer et publier des événements.'
    : 'Est officiellement référencé(e) comme <strong style="display:inline;font-size:inherit;font-family:inherit;font-weight:600">prestataire partenaire</strong> sur la plateforme LIVEINBLACK et est autorisé(e) à proposer ses services aux organisateurs.'
  const firstRowLabel = isOrg ? 'Organisation' : 'Nom / Nom de scène'
  const typeRowLabel  = isOrg ? "Type d'établissement" : 'Type de prestataire'

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Attestation — ${orgName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Inter, sans-serif;
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
      font-family: Inter, sans-serif;
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
      font-family: Inter, sans-serif;
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
      font-family: Inter, sans-serif;
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
      font-family: Inter, sans-serif;
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
      padding: 12px 24px; font-family: Inter, sans-serif;
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
      <div class="badge">Validé</div>
      <div style="margin-top:8px">Réf. ${refId}</div>
      <div>Émis le ${approvedDate}</div>
    </div>
  </div>

  <div class="title-section">
    <div class="label">Document officiel</div>
    <h1>Attestation de validation</h1>
    <div class="subtitle">${subtitle}</div>
  </div>

  <div class="seal">
    <div class="seal-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <div class="seal-text">
      <strong>${orgName}</strong>
      ${roleDesc}
    </div>
  </div>

  <table>
    <tr><td>${firstRowLabel}</td><td>${orgName}</td></tr>
    <tr><td>${typeRowLabel}</td><td>${typeEtab}</td></tr>
    <tr><td>${isOrg ? 'Email professionnel' : 'Email'}</td><td>${emailPro}</td></tr>
    <tr><td>Téléphone</td><td>${tel}</td></tr>
    <tr><td>Ville</td><td>${ville}</td></tr>
    <tr><td>Date de validation</td><td>${approvedDate}</td></tr>
    <tr><td>Validé par</td><td>${approvedBy} — Équipe LIVEINBLACK</td></tr>
    <tr><td>Référence dossier</td><td>${refId}</td></tr>
  </table>

  <div class="divider"></div>

  <p style="font-size:10px;color:#aaa;line-height:1.8;letter-spacing:0.03em">
    Ce document atteste que ${isOrg ? "l'organisation" : 'le prestataire'} mentionné${isOrg ? 'e' : ''} ci-dessus a soumis un dossier complet, vérifié et approuvé par l'équipe LIVEINBLACK.
    Cette attestation est valable jusqu'à révocation du statut de ${roleWord}.
    En cas de doute sur l'authenticité de ce document, contacter <strong style="color:#888">hagechady@liveinblack.com</strong>.
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

  <button class="print-btn" onclick="window.print()">Enregistrer en PDF</button>

</body>
</html>`

  const win = window.open('', '_blank')
  if (win) { win.document.write(html); win.document.close() }
}

function StatusBadge({ status }) {
  const cfg = APPLICATION_STATUSES[status] || { label: status, color: COLORS.muted, bg: 'rgba(255,255,255,0.06)' }
  const isHex = typeof cfg.color === 'string' && cfg.color.startsWith('#')
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 8,
      border: `1px solid ${isHex ? cfg.color + '59' : 'rgba(255,255,255,0.22)'}`,
      background: cfg.bg,
      color: cfg.color,
      fontFamily: FONTS.display, fontSize: 11, fontWeight: 700,
      letterSpacing: '0.04em', textTransform: 'uppercase',
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
        <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted }}>Complétude du dossier</span>
        <span style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700, color }}>{score}%</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          width: `${score}%`,
          background: color,
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
        const ringHex = typeof color === 'string' && color.startsWith('#')
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
              border: `1px solid ${ringHex ? color + '55' : 'rgba(255,255,255,0.18)'}`,
              background: ringHex ? color + '14' : 'rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: 1,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: '#fff', margin: '3px 0 2px', fontWeight: 600 }}>
                {statusCfg?.label || entry.action}
              </p>
              {entry.note && (
                <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, margin: '0 0 2px', wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                  {entry.note}
                </p>
              )}
              <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: 0 }}>
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
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: uploaded ? COLORS.teal : missing ? COLORS.pink : COLORS.dim,
      }}>
        {uploaded ? <IconCheck size={14} /> : missing ? <IconAlert size={14} /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'inline-block' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600, color: uploaded ? '#fff' : missing ? COLORS.pink : COLORS.muted, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}{missing && <span style={{ color: COLORS.pink }}> — requis</span>}
        </p>
        {entry?.name && (
          <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.name}
          </p>
        )}
      </div>
      {onUpload && (
        <label style={{ cursor: 'pointer', flexShrink: 0 }}>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
          <span style={{
            fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
            padding: '8px 14px', borderRadius: 10, cursor: 'pointer', display: 'inline-block',
            color: 'rgba(255,255,255,0.9)',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.14)',
          }}>
            {uploading
              ? <span className="lib-spin" style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', verticalAlign: '-2px' }} />
              : uploaded ? 'Modifier' : 'Ajouter'}
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
      showToast('Document enregistré')
    } else {
      setUploadStatus(s => ({ ...s, [docKey]: 'error' }))
      showToast('Le document n\'a pas pu être envoyé. Réessaie.', 'error')
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
      emailPro: user.email || '',
    }

    // Selon le rôle, on ne propose que l'option cohérente
    const canOrg   = !user.role || user.role === 'client' || user.role === 'organisateur'
    const canPrest = !user.role || user.role === 'client' || user.role === 'prestataire'

    return (
      <Layout>
        <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontFamily: FONTS.display, fontWeight: 700, fontSize: 20, color: '#fff', margin: '0 0 8px' }}>
              Aucun dossier trouvé
            </p>
            <p style={{ fontFamily: FONTS.mono, fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.5 }}>
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
                  minHeight: 44, padding: '12px 22px', borderRadius: 12, cursor: 'pointer',
                  background: '#c8a96e', border: '1px solid rgba(255,255,255,0.14)',
                  color: '#1c1405', fontFamily: FONTS.display, fontSize: 14, fontWeight: 700,
                }}>
                Dossier organisateur
              </button>
            )}
            {canPrest && (
              <button
                onClick={() => navigate('/onboarding-prestataire')}
                style={{
                  minHeight: 44, padding: '12px 22px', borderRadius: 12, cursor: 'pointer',
                  background: '#3ed6b5', border: '1px solid rgba(255,255,255,0.14)',
                  color: '#04120e', fontFamily: FONTS.display, fontSize: 14, fontWeight: 700,
                }}>
                Dossier prestataire
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

  const requiredDocs = getRequiredDocs(app.type, app.formData?.prestataireTypes || app.formData?.prestataireType)
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
            <p style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Mon dossier
            </p>
          </div>
          <h1 style={{ fontFamily: FONTS.display, fontWeight: 800, fontSize: 24, color: '#fff', margin: '0 0 4px', letterSpacing: '0.01em' }}>
            {app.type === 'organisateur' ? 'Dossier organisateur' : 'Dossier prestataire'}
          </h1>
          <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.dim, margin: 0 }}>
            Soumis le {formatDate(app.submittedAt)} · Réf. {app.id}
          </p>
        </div>

        {/* ── Status banner ── */}
        <div style={{
          ...CARD, padding: 16, marginBottom: 16,
          borderColor: (typeof statusCfg.color === 'string' && statusCfg.color.startsWith('#')) ? statusCfg.color + '44' : 'rgba(255,255,255,0.10)',
          borderLeft: `3px solid ${statusCfg.color || 'rgba(255,255,255,0.2)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
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
            borderLeft: '3px solid #f59e0b',
          }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
              Corrections requises
            </p>
            <p style={{ fontFamily: FONTS.mono, fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.5 }}>
              {app.requestedChanges}
            </p>
          </div>
        )}

        {app.status === 'rejected' && app.rejectionReason && (
          <div style={{
            ...CARD, padding: 16, marginBottom: 16,
            borderColor: 'rgba(224,90,170,0.40)',
            borderLeft: `3px solid ${COLORS.pink}`,
          }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, color: COLORS.pink, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
              Dossier refusé
            </p>
            <p style={{ fontFamily: FONTS.mono, fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: '0 0 12px', lineHeight: 1.5 }}>
              {app.rejectionReason}
            </p>
            <button
              onClick={() => navigate(editPath)}
              style={{
                minHeight: 44, padding: '11px 18px', borderRadius: 12, cursor: 'pointer',
                background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)', border: '1px solid rgba(255,255,255,0.14)',
                color: '#fff', fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
                boxShadow: '0 6px 20px rgba(122,59,242,0.35)',
              }}>
              Soumettre un nouveau dossier
            </button>
          </div>
        )}

        {app.status === 'approved' && (
          <div style={{
            ...CARD, padding: 16, marginBottom: 16,
            borderColor: 'rgba(34,197,94,0.35)',
            borderLeft: '3px solid #22c55e',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 13, color: '#22c55e', margin: 0, fontWeight: 700 }}>
                    Dossier approuvé
                  </p>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.dim, margin: '2px 0 0' }}>
                    Compte activé le {formatDate(app.approvedAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => openValidationReceipt(app)}
                title="Télécharger l'attestation"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 10, cursor: 'pointer', flexShrink: 0,
                  background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.45)',
                  color: '#4ade80', fontFamily: FONTS.display, fontSize: 12, fontWeight: 700,
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
              width: '100%', minHeight: 44, padding: '13px 0', borderRadius: 12, cursor: 'pointer',
              background: '#c8a96e',
              border: '1px solid rgba(255,255,255,0.14)',
              color: '#1c1405', fontFamily: FONTS.display, fontSize: 14, fontWeight: 700,
              marginBottom: 16,
            }}>
            {app.status === 'needs_changes' ? 'Corriger mon dossier' : 'Compléter mon dossier'}
          </button>
        )}

        {/* ── Info suivi (dossier soumis / en cours) ── */}
        {(app.status === 'submitted' || app.status === 'under_review') && (
          <div style={{
            ...CARD, padding: 14, marginBottom: 16,
            borderColor: 'rgba(78,232,200,0.25)',
            borderLeft: `3px solid ${COLORS.teal}`,
          }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.teal, margin: '0 0 4px', fontWeight: 700 }}>
              Dossier verrouillé — en attente de validation
            </p>
            <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, margin: 0, lineHeight: 1.6 }}>
              Notre équipe examine ton dossier. Le statut ci-dessus sera mis à jour dès qu&apos;une décision sera prise. Si des corrections sont nécessaires, tu pourras le modifier et le renvoyer.
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
                borderLeft: '3px solid #ef4444',
              }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                  Demande de suppression en cours
                </p>
                <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, margin: '0 0 12px', lineHeight: 1.5 }}>
                  Ta demande a été transmise à l&apos;équipe LIVEINBLACK le {new Date(deletionReq.requestedAt).toLocaleDateString('fr-FR')}. Tu recevras une réponse prochainement.
                </p>
                <button
                  onClick={() => { cancelDeletionRequest(deletionReq.id); setDeletionReq(null); setShowDeletionForm(false) }}
                  style={{
                    padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                    color: 'rgba(255,255,255,0.9)', fontFamily: FONTS.display, fontSize: 12, fontWeight: 600,
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
                  width: '100%', minHeight: 44, padding: '11px 0', borderRadius: 12, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.5)',
                  color: '#f87171', fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
                }}>
                Demander la suppression du compte
              </button>
            ) : (
              // Formulaire de demande
              <div style={{
                ...CARD, padding: 16,
                borderColor: 'rgba(239,68,68,0.30)',
                borderLeft: '3px solid #ef4444',
              }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
                  Demande de suppression de compte
                </p>
                <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, margin: '0 0 14px', lineHeight: 1.6 }}>
                  La suppression doit être validée par notre équipe. Une fois approuvée, tes données personnelles seront anonymisées. Les données transactionnelles (billets, paiements) restent archivées conformément aux obligations légales (10 ans).
                </p>

                {/* Résultats audit */}
                {auditResult && (auditResult.blockers.length > 0 || auditResult.warnings.length > 0) && (
                  <div style={{ marginBottom: 14 }}>
                    {auditResult.blockers.length > 0 && (
                      <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 7, marginBottom: 8 }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                          Points à résoudre (transmis à l&apos;équipe)
                        </p>
                        {auditResult.blockers.map((b, i) => (
                          <p key={i} style={{ fontFamily: FONTS.mono, fontSize: 12, color: 'rgba(239,68,68,0.85)', margin: '0 0 3px', lineHeight: 1.5 }}>
                            • {b.label}
                          </p>
                        ))}
                      </div>
                    )}
                    {auditResult.warnings.length > 0 && (
                      <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.22)', borderRadius: 7 }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                          Ce qui sera archivé
                        </p>
                        {auditResult.warnings.map((w, i) => (
                          <p key={i} style={{ fontFamily: FONTS.mono, fontSize: 12, color: 'rgba(245,158,11,0.85)', margin: '0 0 3px', lineHeight: 1.5 }}>
                            • {w.label}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Raison */}
                <label style={{ fontFamily: FONTS.display, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 6 }}>
                  Raison de la suppression <span style={{ color: COLORS.pink }}>*</span>
                </label>
                <textarea
                  value={deletionReason}
                  onChange={e => setDeletionReason(e.target.value)}
                  placeholder="Ex : je cesse mon activité, je n'utilise plus la plateforme…"
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: '#0b0c12', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10, padding: '12px 14px', resize: 'vertical',
                    fontFamily: FONTS.display, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.92)',
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
                      flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 12, cursor: deletionReason.trim() ? 'pointer' : 'not-allowed',
                      background: deletionReason.trim() ? '#c2347f' : 'rgba(255,255,255,0.07)',
                      border: `1px solid ${deletionReason.trim() ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}`,
                      color: deletionReason.trim() ? '#fff' : 'rgba(255,255,255,0.35)',
                      fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
                    }}>
                    {deletionLoading ? (
                      <>
                        <span className="lib-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', marginRight: 8, verticalAlign: '-2px' }} />
                        Envoi…
                      </>
                    ) : 'Envoyer la demande'}
                  </button>
                  <button
                    onClick={() => { setShowDeletionForm(false); setAuditResult(null); setDeletionReason('') }}
                    style={{
                      flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 12, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                      color: 'rgba(255,255,255,0.9)', fontFamily: FONTS.display, fontSize: 13, fontWeight: 600,
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
                width: '100%', minHeight: 44, padding: '11px 0', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.5)',
                color: '#f87171', fontFamily: FONTS.display, fontSize: 13, fontWeight: 700, marginBottom: 16,
              }}>
              Supprimer le dossier
            </button>
          ) : (
            <div style={{
              ...CARD, padding: 16, marginBottom: 16,
              borderColor: 'rgba(239,68,68,0.35)',
              borderLeft: '3px solid #ef4444',
            }}>
              <p style={{ fontFamily: FONTS.mono, fontSize: 14, color: '#fff', margin: '0 0 4px', fontWeight: 700 }}>
                Supprimer définitivement ce dossier ?
              </p>
              <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
                Cette action est irréversible. Tu devras soumettre un nouveau dossier pour candidater à nouveau.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleDelete}
                  style={{
                    flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 12, cursor: 'pointer',
                    background: '#c2347f', border: 'none',
                    color: '#fff', fontFamily: FONTS.display, fontSize: 13, fontWeight: 700,
                  }}>
                  Oui, supprimer
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    flex: 1, minHeight: 44, padding: '10px 0', borderRadius: 12, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
                    color: 'rgba(255,255,255,0.9)', fontFamily: FONTS.display, fontSize: 13, fontWeight: 600,
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
                flex: 1, padding: '11px 0',
                fontFamily: FONTS.display, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                background: 'none', cursor: 'pointer',
                borderBottom: tab === t.key ? `2px solid ${COLORS.gold}` : '2px solid transparent',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                color: tab === t.key ? '#fff' : 'rgba(255,255,255,0.5)',
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
              <p style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                Informations principales
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Nom commercial',  value: app.formData?.nomCommercial   },
                  { label: 'Email professionnel', value: app.formData?.emailPro   },
                  { label: 'Téléphone',        value: app.formData?.telephonePro  },
                  { label: 'Ville',            value: app.formData?.ville          },
                  app.type === 'organisateur'
                    ? { label: 'SIRET',        value: app.formData?.siret          }
                    : { label: 'Activités', value: getProviderCategories(app.formData || {}).map(category => category.singular).join(' · ') },
                ].filter(f => f?.value).map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.dim, flexShrink: 0 }}>{f.label}</span>
                    <span style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600, color: '#fff', textAlign: 'right' }}>{f.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stripe Connect status */}
            {app.type === 'organisateur' && app.stripe && (
              <div style={{ ...CARD, padding: 16 }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                  Paiements (Stripe Connect)
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Statut onboarding', value: app.stripe.onboarding_status || 'Non démarré' },
                    { label: 'Virements activés', value: app.stripe.payouts_enabled ? 'Oui' : 'Non' },
                    { label: 'Paiements activés', value: app.stripe.charges_enabled  ? 'Oui' : 'Non' },
                  ].map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.dim }}>{f.label}</span>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted }}>{f.value}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '10px 0 0' }}>
                  La configuration Stripe sera disponible après validation de ton dossier.
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
              <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, marginBottom: 12 }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, margin: 0 }}>
                  Dossier verrouillé — les documents ne peuvent plus être modifiés après soumission.
                </p>
              </div>
            )}

            {/* Docs requis manquants — alerte (seulement si éditable) */}
            {isEditable && requiredDocs.some(k => !app.documents?.[k]) && (
              <div style={{ padding: '10px 14px', background: 'rgba(224,90,170,0.08)', border: '1px solid rgba(224,90,170,0.3)', borderRadius: 12, marginBottom: 12 }}>
                <p style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600, color: COLORS.pink, margin: 0 }}>
                  Des documents obligatoires sont manquants. Ajoute-les pour que ton dossier puisse être traité.
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

            {/* Doc conditionnel : licence alcool (facultatif — responsabilité déléguée à l'organisateur) */}
            {app.formData?.alcool && (
              <DocRow
                docKey="alcohol_license"
                entry={app.documents?.alcohol_license}
                required={false}
                onUpload={isEditable ? (file => handleUpload('alcohol_license', file)) : undefined}
                uploading={uploadStatus.alcohol_license === 'uploading'}
              />
            )}

            {isEditable && (
              <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: '12px 0 0' }}>
                Formats acceptés : PDF, JPG, PNG
              </p>
            )}
          </div>
        )}

        {/* ── Tab: Historique ── */}
        {tab === 'history' && (
          <div style={{ ...CARD, padding: 16 }}>
            <p style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 600, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
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
          zIndex: 999, padding: '11px 20px', borderRadius: 12,
          background: 'rgba(12,12,22,0.96)',
          border: `1px solid ${toast.type === 'error' ? 'rgba(224,90,170,0.5)' : 'rgba(78,232,200,0.5)'}`,
          fontFamily: FONTS.display, fontSize: 13, fontWeight: 600,
          color: '#fff',
          whiteSpace: 'nowrap',
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        }}>
          {toast.msg}
        </div>
      )}
    </Layout>
  )
}
