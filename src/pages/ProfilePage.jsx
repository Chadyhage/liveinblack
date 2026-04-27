import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import { getWallet } from '../utils/wallet'
import { ROLES, updateAccount, deleteAccount } from '../utils/accounts'
import { getApplicationByUser, loadApplicationByUser } from '../utils/applications'
import { getOrdersForBuyer, ORDER_STATUS_LABELS } from '../utils/services'
import PlaylistSystem from '../components/PlaylistSystem'
import { events as staticEvents } from '../data/events'

// ─── Génération carte d'accréditation (organisateur + prestataire) ───────────
function openCredentialPDF(app, role) {
  if (!app) return
  const fd = app.formData || {}
  const approvedDate = new Date(app.approvedAt || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const approvedBy   = app.auditLog?.slice().reverse().find(e => e.action === 'approved')?.byName || 'LIVEINBLACK'
  const refId        = app.id || '—'
  const isOrg        = role === 'organisateur'

  // ── Infos affichées selon le rôle ──
  const displayName = isOrg
    ? (fd.nomCommercial || '—')
    : (fd.nomScene?.trim() || fd.nomCommercial?.trim() || [fd.prenom, fd.nom].filter(Boolean).join(' ') || '—')

  const typeLabel = isOrg
    ? (fd.typeEtablissement || 'Organisateur')
    : ({
        artiste:  'Artiste / Performeur',
        salle:    'Salle & Espace événementiel',
        materiel: 'Location de matériel',
        food:     'Restauration & Boissons',
      }[fd.prestataireType] || 'Prestataire')

  const roleLabel  = isOrg ? 'Organisateur Partenaire' : 'Prestataire Partenaire'
  const roleDesc   = isOrg
    ? 'Est officiellement reconnu(e) comme <strong style="font-family:inherit;font-weight:600">organisateur partenaire</strong> et est autorisé(e) à créer et publier des événements sur la plateforme LIVEINBLACK.'
    : 'Est officiellement référencé(e) comme <strong style="font-family:inherit;font-weight:600">prestataire partenaire</strong> et peut proposer ses services aux organisateurs de la plateforme LIVEINBLACK.'

  const rows = isOrg ? [
    ['Organisation',       displayName],
    ["Type d'établissement", typeLabel],
    ['Email professionnel', fd.emailPro || app.email || '—'],
    ['Téléphone',          [fd.telephoneProCode, fd.telephonePro].filter(Boolean).join(' ') || '—'],
    ['Ville',              fd.ville || '—'],
    ['Date de validation', approvedDate],
    ['Validé par',         approvedBy + ' — Équipe LIVEINBLACK'],
    ['Référence dossier',  refId],
  ] : [
    ['Nom / Nom de scène',  displayName],
    ['Type de prestataire', typeLabel],
    ...(fd.prestataireType === 'artiste' && fd.typeArtiste ? [['Spécialité', fd.typeArtiste]] : []),
    ['Email',               app.email || '—'],
    ['Téléphone',           [fd.telephoneCode, fd.telephone].filter(Boolean).join(' ') || '—'],
    ['Ville',               fd.ville || '—'],
    ...(fd.siret ? [['SIRET', fd.siret]] : []),
    ['Zones d\'intervention', Array.isArray(fd.zonesIntervention) && fd.zonesIntervention.length
      ? fd.zonesIntervention.map(id => ({
          'international': '🌍 International', 'france': '🇫🇷 France',
          'cote-divoire': "🇨🇮 Côte d'Ivoire", 'ghana': '🇬🇭 Ghana',
          'togo': '🇹🇬 Togo', 'benin': '🇧🇯 Bénin', 'amerique': '🌎 Amérique',
        }[id] || id)).join('  ·  ')
      : '—'],
    ['Date de validation',  approvedDate],
    ['Validé par',          approvedBy + ' — Équipe LIVEINBLACK'],
    ['Référence dossier',   refId],
  ]

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Carte d'accréditation — ${displayName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,600&family=DM+Mono:wght@400;500&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'DM Mono',monospace; background:#fff; color:#0a0a18; padding:64px 80px; max-width:760px; margin:0 auto; line-height:1.6; }
    .header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:48px; padding-bottom:24px; border-bottom:2px solid #0a0a18; }
    .logo { font-family:'Cormorant Garamond',serif; font-size:26px; font-weight:300; letter-spacing:0.12em; }
    .logo span { font-style:italic; font-weight:600; }
    .ref { font-size:9px; letter-spacing:0.18em; text-transform:uppercase; color:#999; text-align:right; line-height:1.8; }
    .badge { display:inline-block; background:#f0faf7; border:1px solid #b8ead9; border-radius:4px; padding:3px 10px; font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:#1a9e72; font-weight:500; }
    .hero { display:flex; gap:28px; align-items:flex-start; margin-bottom:40px; }
    .hero-icon { width:72px; height:72px; border-radius:12px; background:linear-gradient(135deg,#0a0a18,#2a1a4a); display:flex; align-items:center; justify-content:center; font-size:32px; flex-shrink:0; }
    .hero-text {}
    .hero-label { font-size:9px; letter-spacing:0.3em; text-transform:uppercase; color:#aaa; margin-bottom:6px; }
    .hero-name { font-family:'Cormorant Garamond',serif; font-size:38px; font-weight:300; color:#0a0a18; line-height:1.05; letter-spacing:0.02em; margin-bottom:6px; }
    .hero-type { font-size:10px; letter-spacing:0.16em; text-transform:uppercase; color:#c8a96e; }
    .seal { background:linear-gradient(135deg,#f5f0e8,#fdf8ef); border:1px solid #d4b896; border-radius:8px; padding:18px 22px; margin-bottom:32px; display:flex; align-items:center; gap:16px; }
    .seal-icon { width:40px; height:40px; border-radius:50%; background:linear-gradient(135deg,#c8a96e,#a87c3e); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:#fff; font-size:18px; }
    .seal-text { font-size:11px; color:#7a5c2e; letter-spacing:0.03em; line-height:1.7; }
    table { width:100%; border-collapse:collapse; margin-bottom:32px; }
    td { padding:10px 0; border-bottom:1px solid #f0f0f5; font-size:11px; vertical-align:top; }
    td:first-child { color:#aaa; letter-spacing:0.1em; text-transform:uppercase; font-size:9px; width:200px; padding-top:12px; }
    td:last-child { color:#0a0a18; font-size:12px; }
    .qr-row { display:flex; gap:24px; margin-bottom:32px; align-items:center; background:#fafafa; border:1px solid #eee; border-radius:8px; padding:20px; }
    .qr-box { width:80px; height:80px; background:#fff; border:1px solid #ddd; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:9px; color:#ccc; letter-spacing:0.08em; text-align:center; padding:4px; }
    .qr-info { flex:1; font-size:9px; color:#aaa; letter-spacing:0.06em; line-height:1.8; }
    .footer { margin-top:40px; padding-top:20px; border-top:1px solid #e0e0ec; display:flex; justify-content:space-between; align-items:flex-end; }
    .footer-left { font-size:9px; color:#bbb; letter-spacing:0.06em; line-height:1.8; }
    .sig-name { font-family:'Cormorant Garamond',serif; font-size:18px; font-weight:300; font-style:italic; color:#c8a96e; }
    .sig-title { font-size:9px; letter-spacing:0.12em; text-transform:uppercase; color:#aaa; margin-top:2px; }
    .print-btn { position:fixed; bottom:32px; right:32px; background:#0a0a18; color:#fff; border:none; border-radius:6px; padding:12px 24px; font-family:'DM Mono',monospace; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; cursor:pointer; box-shadow:0 4px 20px rgba(0,0,0,0.2); }
    @media print { body{padding:40px 48px;} .print-btn{display:none;} }
  </style>
</head>
<body>

  <div class="header">
    <div class="logo">L<span style="font-style:normal;font-weight:400">|</span>VE IN <span>BLACK</span></div>
    <div class="ref">
      <div class="badge">✓ ${roleLabel}</div>
      <div style="margin-top:8px">Réf. ${refId}</div>
      <div>Émis le ${new Date().toLocaleDateString('fr-FR')}</div>
    </div>
  </div>

  <div class="hero">
    <div class="hero-icon">${isOrg ? '🎪' : (fd.prestataireType === 'artiste' ? '🎤' : fd.prestataireType === 'salle' ? '🏛️' : fd.prestataireType === 'materiel' ? '🔊' : '🍽️')}</div>
    <div class="hero-text">
      <div class="hero-label">Carte d'accréditation officielle</div>
      <div class="hero-name">${displayName}</div>
      <div class="hero-type">${typeLabel}</div>
    </div>
  </div>

  <div class="seal">
    <div class="seal-icon">✓</div>
    <div class="seal-text">${roleDesc}</div>
  </div>

  <table>
    ${rows.map(([k,v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('\n    ')}
  </table>

  <div style="height:1px;background:#e8e8f0;margin:24px 0;"></div>
  <p style="font-size:10px;color:#aaa;line-height:1.9;letter-spacing:0.03em">
    Ce document atteste que le titulaire a soumis un dossier vérifié et approuvé par l'équipe LIVEINBLACK.
    Il est valable jusqu'à révocation du statut. Pour vérifier l'authenticité de ce document,
    contactez <strong style="color:#888">support@liveinblack.com</strong> en indiquant la référence dossier.
  </p>

  <div class="footer">
    <div class="footer-left">LIVEINBLACK — Plateforme événementielle<br>liveinblack.com<br>Document généré le ${new Date().toLocaleDateString('fr-FR')}</div>
    <div style="text-align:right">
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

function getAllEvents() {
  try {
    const created = JSON.parse(localStorage.getItem('lib_created_events') || '[]')
    return [...staticEvents, ...created]
  } catch { return staticEvents }
}

function getBookings() {
  try { return JSON.parse(localStorage.getItem('lib_bookings') || '[]') } catch { return [] }
}
const FAQ = [
  { q: "Comment réserver un billet ?", a: "Va sur l'onglet Événements, sélectionne la soirée de ton choix et clique sur Réservation. Choisis ton type de place et confirme." },
  { q: "Puis-je annuler ma réservation ?", a: "Les réservations sont fermes et définitives. En cas d'annulation d'événement par l'organisateur, un remboursement sera traité sous 5 jours ouvrés." },
  { q: "Comment utiliser mes points ?", a: "Tu gagnes 1 point par ticket ou carré acheté. Les points seront bientôt échangeables contre des avantages exclusifs (accès prioritaire, réductions, cadeaux)." },
  { q: "Comment créer un événement ?", a: "Rends-toi dans 'Mes Événements & Créations' via le menu. Tu peux créer et publier ton événement en 5 étapes simples." },
]

function getPasswordStrength(pwd) {
  if (!pwd) return null
  let score = 0
  if (pwd.length >= 8)  score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^a-zA-Z0-9]/.test(pwd)) score++
  if (score <= 1) return { label: 'FAIBLE', color: '#ef4444', pct: 25 }
  if (score <= 3) return { label: 'MOYEN',  color: '#f97316', pct: 60 }
  return               { label: 'FORT',   color: '#4ee8c8', pct: 100 }
}

function getProfileError(code) {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Mot de passe actuel incorrect'
    case 'auth/requires-recent-login': return 'Session expirée — déconnecte-toi et reconnecte-toi'
    case 'auth/email-already-in-use': return 'Cet e-mail est déjà utilisé par un autre compte'
    case 'auth/invalid-email': return 'Adresse e-mail invalide'
    case 'auth/weak-password': return 'Mot de passe trop faible (minimum 6 caractères)'
    case 'auth/too-many-requests': return 'Trop de tentatives, réessaie dans quelques minutes'
    default: return 'Une erreur est survenue, réessaie'
  }
}

// ── Eyebrow section label with teal accent line (matches HomePage style) ──────
function EyebrowLabel({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
      <div style={{ width: '28px', height: '1px', background: '#4ee8c8', flexShrink: 0 }} />
      <span style={{
        fontFamily: '"DM Mono", monospace',
        fontSize: '9px',
        letterSpacing: '0.4em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.25)',
      }}>{text}</span>
    </div>
  )
}

// ── Shared style tokens ───────────────────────────────────────────────────────
const S = {
  page: {
    position: 'relative',
    zIndex: 1,
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  card: {
    background: 'rgba(8,10,20,0.55)',
    backdropFilter: 'blur(22px) saturate(1.6)',
    WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '12px',
    padding: '16px',
  },
  label: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '9px',
    letterSpacing: '0.35em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.28)',
  },
  labelGold: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '9px',
    letterSpacing: '0.35em',
    textTransform: 'uppercase',
    color: '#c8a96e',
  },
  labelOrange: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '9px',
    letterSpacing: '0.35em',
    textTransform: 'uppercase',
    color: 'rgba(251,146,60,0.9)',
  },
  sectionTitle: {
    fontFamily: '"Cormorant Garamond", serif',
    fontWeight: 300,
    fontSize: '28px',
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.92)',
  },
  bodyText: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 1.6,
  },
  input: {
    width: '100%',
    background: 'rgba(6,8,16,0.6)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '4px',
    fontFamily: '"DM Mono", monospace',
    fontSize: '13px',
    color: 'rgba(255,255,255,0.9)',
    padding: '11px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.18s',
  },
  inputFocus: {
    borderColor: '#4ee8c8',
    boxShadow: '0 0 0 3px rgba(78,232,200,0.06)',
  },
  inputError: {
    borderColor: 'rgba(239,68,68,0.6)',
  },
  inputLabel: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '9px',
    letterSpacing: '0.3em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.28)',
    display: 'block',
    marginBottom: '7px',
  },
  btnPrimary: {
    width: '100%',
    padding: '13px 28px',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06), rgba(78,232,200,0.12))',
    border: '1px solid rgba(255,255,255,0.28)',
    borderRadius: '4px',
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.88)',
    cursor: 'pointer',
    transition: 'opacity 0.18s',
  },
  btnGold: {
    width: '100%',
    padding: '13px 28px',
    background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
    border: '1px solid rgba(200,169,110,0.45)',
    borderRadius: '4px',
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: '#c8a96e',
    cursor: 'pointer',
    transition: 'opacity 0.18s',
  },
  btnGhost: {
    flex: 1,
    padding: '11px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: '4px',
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    cursor: 'pointer',
  },
  backBtn: {
    background: 'transparent',
    border: 'none',
    color: 'rgba(255,255,255,0.38)',
    fontSize: '26px',
    lineHeight: 1,
    cursor: 'pointer',
    padding: '0 4px',
    transition: 'color 0.18s',
    flexShrink: 0,
  },
  divider: {
    height: '1px',
    background: 'rgba(255,255,255,0.06)',
    border: 'none',
    margin: '8px 0',
  },
  emptyIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    margin: '0 auto 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '11px',
    letterSpacing: '0.1em',
    color: 'rgba(255,255,255,0.22)',
  },
  emptySubText: {
    fontFamily: '"DM Mono", monospace',
    fontSize: '10px',
    color: 'rgba(255,255,255,0.15)',
    marginTop: '6px',
  },
}

export default function ProfilePage() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [panel, setPanel] = useState(null) // null | 'settings' | 'billets' | 'commandes' | 'service-orders' | 'support'
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Settings — nom du compte
  const [settingsForm, setSettingsForm] = useState({ name: user?.name || '' })
  const [settingsMsg, setSettingsMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  // Settings — changement d'e-mail (flux avec vérification)
  const [emailForm, setEmailForm] = useState({ newEmail: '', password: '' })
  const [emailMsg, setEmailMsg] = useState(null)
  const [sendingEmailVerif, setSendingEmailVerif] = useState(false)
  const [emailPending, setEmailPending] = useState(null) // nouvel e-mail en attente de vérification

  // Settings — changement de mot de passe
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' })
  const [passwordMsg, setPasswordMsg] = useState(null)
  const [savingPassword, setSavingPassword] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)

  // Support state
  const [openFaq, setOpenFaq] = useState(null)

  // Nom de l'organisation (organisateurs uniquement)
  const [orgName, setOrgName] = useState(null)
  // Dossier approuvé pour la carte d'accréditation (org + prestataire)
  const [credentialApp, setCredentialApp] = useState(null)
  useEffect(() => {
    if (!user?.uid) return
    const role = user.role
    if (role !== 'organisateur' && role !== 'prestataire') {
      setOrgName(null); setCredentialApp(null); return
    }
    // Async : localStorage d'abord, Firestore en fallback (cross-device)
    loadApplicationByUser(user.uid, role).then(app => {
      if (!app) return
      if (role === 'organisateur') setOrgName(app.formData?.nomCommercial || null)
      if (app.status === 'approved') setCredentialApp(app)
    }).catch(() => {})
  }, [user?.uid, user?.role])

  // ── Name change cooldown (1 fois toutes les 2 semaines) ──
  const NAME_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000 // 14 jours
  const nameChangedAt   = user?.nameChangedAt || null
  const nextNameChange  = nameChangedAt ? nameChangedAt + NAME_COOLDOWN_MS : null
  const nameOnCooldown  = nextNameChange ? Date.now() < nextNameChange : false
  const nameChanged     = settingsForm.name.trim() !== (user?.name || '')

  function formatNextDate(ts) {
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  // ── Sauvegarder le nom uniquement ────────────────────────────────────────
  async function saveName() {
    if (!settingsForm.name.trim()) {
      setSettingsMsg({ type: 'error', text: user?.role === 'organisateur' ? 'Le nom du responsable est obligatoire' : 'Le prénom / nom est obligatoire' })
      return
    }
    if (nameChanged && nameOnCooldown) {
      setSettingsMsg({ type: 'error', text: `Prochain changement de nom possible le ${formatNextDate(nextNameChange)}.` })
      return
    }
    setSaving(true)
    setSettingsMsg(null)
    try {
      const { USE_REAL_FIREBASE } = await import('../firebase')
      if (USE_REAL_FIREBASE) {
        const { auth } = await import('../firebase')
        const { updateProfile } = await import('firebase/auth')
        const currentUser = auth.currentUser
        if (currentUser && settingsForm.name.trim() !== user.name) {
          await updateProfile(currentUser, { displayName: settingsForm.name.trim() })
        }
      }
      const uid = getUserId(user)
      const now = Date.now()
      const nameWasChanged = settingsForm.name.trim() !== user.name
      const patch = { name: settingsForm.name.trim(), ...(nameWasChanged ? { nameChangedAt: now } : {}) }
      const updatedUser = { ...user, ...patch }
      setUser(updatedUser)
      updateAccount(uid, patch)
      try {
        const { syncUserProfile } = await import('../utils/firestore-sync')
        syncUserProfile(uid, updatedUser)
      } catch {}
      if (nameWasChanged) {
        try {
          const { USE_REAL_FIREBASE: fb } = await import('../firebase')
          if (fb) {
            const { db: firestoreDb } = await import('../firebase')
            const { doc, setDoc } = await import('firebase/firestore')
            await setDoc(doc(firestoreDb, 'users', uid), { nameChangedAt: now }, { merge: true })
          }
        } catch {}
      }
      setSettingsMsg({ type: 'success', text: 'Nom mis à jour' })
      setTimeout(() => setSettingsMsg(null), 3000)
    } catch (err) {
      setSettingsMsg({ type: 'error', text: getProfileError(err.code) })
    } finally {
      setSaving(false)
    }
  }

  // ── Envoyer le lien de vérification à la nouvelle adresse e-mail ──────────
  async function sendEmailVerif() {
    const newEmail = emailForm.newEmail.trim()
    if (!newEmail || !newEmail.includes('@')) {
      setEmailMsg({ type: 'error', text: 'Adresse e-mail invalide' })
      return
    }
    if (newEmail === user?.email) {
      setEmailMsg({ type: 'error', text: 'C\'est déjà ton adresse e-mail actuelle' })
      return
    }
    if (!emailForm.password) {
      setEmailMsg({ type: 'error', text: 'Saisis ton mot de passe actuel pour confirmer' })
      return
    }
    setSendingEmailVerif(true)
    setEmailMsg(null)
    try {
      const { USE_REAL_FIREBASE } = await import('../firebase')
      if (USE_REAL_FIREBASE) {
        const { auth } = await import('../firebase')
        const { verifyBeforeUpdateEmail, reauthenticateWithCredential, EmailAuthProvider } = await import('firebase/auth')
        const currentUser = auth.currentUser
        if (!currentUser) throw { code: 'auth/requires-recent-login' }
        const isEmailPassword = currentUser.providerData.some(p => p.providerId === 'password')
        if (!isEmailPassword) {
          setEmailMsg({ type: 'error', text: 'Connexion via Google/Apple — e-mail géré par ce service' })
          setSendingEmailVerif(false)
          return
        }
        const credential = EmailAuthProvider.credential(user.email, emailForm.password)
        await reauthenticateWithCredential(currentUser, credential)
        await verifyBeforeUpdateEmail(currentUser, newEmail)
      }
      setEmailPending(newEmail)
      setEmailForm({ newEmail: '', password: '' })
      setEmailMsg({
        type: 'success',
        text: `Un lien de vérification a été envoyé à ${newEmail}. Clique dessus pour confirmer le changement.`,
      })
    } catch (err) {
      setEmailMsg({ type: 'error', text: getProfileError(err.code) })
    } finally {
      setSendingEmailVerif(false)
    }
  }

  // ── Détecter si la vérification e-mail a été complétée (après retour dans l'app) ──
  // Firebase Auth met à jour currentUser.email dès que l'utilisateur clique sur le lien
  useEffect(() => {
    if (panel !== 'settings') return
    import('../firebase').then(({ USE_REAL_FIREBASE, auth }) => {
      if (!USE_REAL_FIREBASE || !auth.currentUser) return
      const firebaseEmail = auth.currentUser.email
      if (firebaseEmail && firebaseEmail !== user?.email) {
        // L'e-mail a été vérifié et mis à jour dans Firebase Auth
        const uid = getUserId(user)
        const patch = { email: firebaseEmail }
        const updatedUser = { ...user, ...patch }
        setUser(updatedUser)
        updateAccount(uid, patch)
        setEmailPending(null)
        setEmailMsg({ type: 'success', text: `E-mail mis à jour : ${firebaseEmail}` })
        setTimeout(() => setEmailMsg(null), 4000)
        // Sync dossier emailPro pour les organisateurs
        if (user?.role === 'organisateur') {
          import('../utils/applications').then(({ getApplicationByUser, updateApplication }) => {
            const app = getApplicationByUser(uid, 'organisateur')
            if (app) {
              const updatedFormData = { ...(app.formData || {}), emailPro: firebaseEmail }
              updateApplication(app.id, { formData: updatedFormData })
              import('../utils/firestore-sync').then(({ syncDoc }) => {
                syncDoc(`applications/${app.id}`, { formData: updatedFormData })
              }).catch(() => {})
            }
          }).catch(() => {})
        }
        // Sync Firestore users/{uid}
        import('../utils/firestore-sync').then(({ syncDoc }) => {
          syncDoc(`users/${uid}`, { email: firebaseEmail })
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [panel]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Changer le mot de passe ───────────────────────────────────────────────
  async function changePassword() {
    if (!passwordForm.current) {
      setPasswordMsg({ type: 'error', text: 'Saisis ton mot de passe actuel' })
      return
    }
    if (passwordForm.new.length < 8) {
      setPasswordMsg({ type: 'error', text: 'Le nouveau mot de passe doit faire au moins 8 caractères' })
      return
    }
    if (passwordForm.new !== passwordForm.confirm) {
      setPasswordMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas' })
      return
    }
    if (passwordForm.new === passwordForm.current) {
      setPasswordMsg({ type: 'error', text: 'Le nouveau mot de passe doit être différent de l\'actuel' })
      return
    }
    setSavingPassword(true)
    setPasswordMsg(null)
    try {
      const { USE_REAL_FIREBASE } = await import('../firebase')
      if (USE_REAL_FIREBASE) {
        const { auth } = await import('../firebase')
        const { updatePassword, reauthenticateWithCredential, EmailAuthProvider } = await import('firebase/auth')
        const currentUser = auth.currentUser
        if (!currentUser) throw { code: 'auth/requires-recent-login' }
        const isEmailPassword = currentUser.providerData.some(p => p.providerId === 'password')
        if (!isEmailPassword) {
          setPasswordMsg({ type: 'error', text: 'Connexion via Google/Apple — mot de passe géré par ce service' })
          setSavingPassword(false)
          return
        }
        const credential = EmailAuthProvider.credential(user.email, passwordForm.current)
        await reauthenticateWithCredential(currentUser, credential)
        await updatePassword(currentUser, passwordForm.new)
      }
      setPasswordForm({ current: '', new: '', confirm: '' })
      setPasswordMsg({ type: 'success', text: 'Mot de passe mis à jour avec succès' })
      setTimeout(() => setPasswordMsg(null), 4000)
    } catch (err) {
      setPasswordMsg({ type: 'error', text: getProfileError(err.code) })
    } finally {
      setSavingPassword(false)
    }
  }

  // ── Envoyer un e-mail de réinitialisation du mot de passe ─────────────────
  async function sendPasswordReset() {
    setSendingReset(true)
    setPasswordMsg(null)
    try {
      const { USE_REAL_FIREBASE } = await import('../firebase')
      if (USE_REAL_FIREBASE) {
        const { auth } = await import('../firebase')
        const { sendPasswordResetEmail } = await import('firebase/auth')
        await sendPasswordResetEmail(auth, user.email)
      }
      setPasswordMsg({ type: 'success', text: `E-mail de réinitialisation envoyé à ${user.email}` })
      setTimeout(() => setPasswordMsg(null), 6000)
    } catch (err) {
      setPasswordMsg({ type: 'error', text: getProfileError(err.code) })
    } finally {
      setSendingReset(false)
    }
  }

  async function handleDeleteAccount() {
    setDeleteError('')
    setDeleting(true)
    try {
      const { USE_REAL_FIREBASE } = await import('../firebase')
      const uid = user?.uid
      if (USE_REAL_FIREBASE) {
        // Verify password first by re-authenticating
        const { auth } = await import('../firebase')
        const { EmailAuthProvider, reauthenticateWithCredential, deleteUser } = await import('firebase/auth')
        const currentUser = auth.currentUser
        if (!currentUser) throw { code: 'auth/requires-recent-login' }
        // Only re-auth with password for email/password accounts
        if (currentUser.providerData?.[0]?.providerId === 'password') {
          const cred = EmailAuthProvider.credential(currentUser.email, deletePassword)
          await reauthenticateWithCredential(currentUser, cred)
        }
        // Delete all linked Firestore documents (fire-and-forget for non-critical ones)
        const { db } = await import('../firebase')
        const { doc, deleteDoc } = await import('firebase/firestore')
        const linkedCollections = ['users', 'wallets', 'user_bookings', 'user_events', 'user_social', 'user_boosts']
        await Promise.allSettled(
          linkedCollections.map(coll => deleteDoc(doc(db, coll, uid)))
        )
        // Delete Firebase Auth user (must be last)
        await deleteUser(currentUser)
      } else {
        // Local mode: check password
        if (user.password && user.password !== deletePassword) {
          throw { code: 'auth/wrong-password' }
        }
        deleteAccount(uid)
      }
      // Clear all local session data for this user
      localStorage.removeItem('lib_user')
      localStorage.removeItem('lib_region')
      // Clear user-specific localStorage keys that are keyed by uid
      try {
        const keysToRemove = [
          `lib_catalog_${uid}`,
          `lib_wallet_${uid}`,
        ]
        keysToRemove.forEach(k => localStorage.removeItem(k))
      } catch {}
      setUser(null)
      navigate('/accueil')
    } catch (err) {
      setDeleteError(getProfileError(err.code || 'unknown'))
    } finally {
      setDeleting(false)
    }
  }

  function BackButton() {
    return (
      <button
        onClick={() => { setPanel(null); setSettingsMsg(null) }}
        style={S.backBtn}
        onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.75)'}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.38)'}
      >
        ‹
      </button>
    )
  }

  // ── Settings Panel ────────────────────────────────────────────────────────
  if (panel === 'settings') {
    return (
      <>
      <Layout>
        <div style={S.page}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <BackButton />
            <h2 style={S.sectionTitle}>Paramètres</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ── Nom ── */}
            <div style={S.card}>
              <EyebrowLabel text="Informations personnelles" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <FocusInput
                    label={user?.role === 'organisateur' ? 'Nom du responsable' : 'Prénom / Nom'}
                    placeholder="Ton nom"
                    value={settingsForm.name}
                    onChange={e => !nameOnCooldown && setSettingsForm(f => ({ ...f, name: e.target.value }))}
                    style={nameOnCooldown ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  />
                  {nameOnCooldown && (
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: '0.12em', color: 'rgba(200,169,110,0.7)', marginTop: 6 }}>
                      ⏳ Prochain changement possible le {formatNextDate(nextNameChange)}
                    </p>
                  )}
                </div>
                {settingsMsg && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 4,
                    fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '0.05em',
                    ...(settingsMsg.type === 'success'
                      ? { background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.22)', color: '#4ee8c8' }
                      : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: 'rgba(239,68,68,0.9)' }),
                  }}>{settingsMsg.text}</div>
                )}
                <button
                  onClick={saveName}
                  disabled={saving || !nameChanged}
                  style={{ ...S.btnGold, opacity: (saving || !nameChanged) ? 0.45 : 1, cursor: (saving || !nameChanged) ? 'not-allowed' : 'pointer' }}
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer le nom'}
                </button>
              </div>
            </div>

            {/* ── Adresse e-mail ── */}
            <div style={S.card}>
              <EyebrowLabel text="Adresse e-mail" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                {/* E-mail actuel affiché */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.03em' }}>{user?.email}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: '"DM Mono", monospace', fontSize: 9, letterSpacing: '0.15em', color: 'rgba(78,232,200,0.7)', textTransform: 'uppercase' }}>Actuel</span>
                </div>

                {/* Bannière en attente */}
                {emailPending && (
                  <div style={{ padding: '10px 14px', borderRadius: 4, background: 'rgba(251,146,60,0.07)', border: '1px solid rgba(251,146,60,0.3)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: 14, marginTop: 1 }}>⏳</span>
                    <div>
                      <p style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, color: 'rgba(251,146,60,0.9)', letterSpacing: '0.05em', marginBottom: 2 }}>
                        Vérification en attente
                      </p>
                      <p style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.03em' }}>
                        Un lien a été envoyé à <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{emailPending}</strong>. Ouvre-le pour confirmer le changement.
                      </p>
                      <button
                        onClick={() => setEmailPending(null)}
                        style={{ marginTop: 8, background: 'none', border: 'none', fontFamily: '"DM Mono", monospace', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)', cursor: 'pointer', padding: 0 }}
                      >
                        Annuler la demande
                      </button>
                    </div>
                  </div>
                )}

                {/* Formulaire de changement */}
                {!emailPending && (
                  <>
                    <FocusInput
                      label="Nouvelle adresse e-mail"
                      type="email"
                      placeholder="nouvelle@adresse.com"
                      value={emailForm.newEmail}
                      onChange={e => setEmailForm(f => ({ ...f, newEmail: e.target.value }))}
                    />
                    <FocusInput
                      label="Mot de passe actuel (requis)"
                      type="password"
                      placeholder="Confirme ton identité"
                      value={emailForm.password}
                      onChange={e => setEmailForm(f => ({ ...f, password: e.target.value }))}
                    />
                    {user?.role === 'organisateur' && (
                      <p style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, letterSpacing: '0.1em', color: 'rgba(78,232,200,0.55)', lineHeight: 1.6 }}>
                        Cet e-mail est aussi utilisé comme e-mail professionnel de ton dossier.
                      </p>
                    )}
                  </>
                )}

                {emailMsg && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 4,
                    fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '0.05em', lineHeight: 1.5,
                    ...(emailMsg.type === 'success'
                      ? { background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.22)', color: '#4ee8c8' }
                      : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: 'rgba(239,68,68,0.9)' }),
                  }}>{emailMsg.text}</div>
                )}

                {!emailPending && (
                  <button
                    onClick={sendEmailVerif}
                    disabled={sendingEmailVerif || !emailForm.newEmail || !emailForm.password}
                    style={{
                      ...S.btnGold,
                      opacity: (sendingEmailVerif || !emailForm.newEmail || !emailForm.password) ? 0.45 : 1,
                      cursor: (sendingEmailVerif || !emailForm.newEmail || !emailForm.password) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {sendingEmailVerif ? 'Envoi en cours...' : 'Envoyer le lien de vérification'}
                  </button>
                )}
              </div>
            </div>

            {/* ── Mot de passe ── */}
            <div style={S.card}>
              <EyebrowLabel text="Sécurité — Mot de passe" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <FocusInput
                  label="Mot de passe actuel"
                  type="password"
                  placeholder="Ton mot de passe actuel"
                  value={passwordForm.current}
                  onChange={e => setPasswordForm(f => ({ ...f, current: e.target.value }))}
                />
                <div>
                  <FocusInput
                    label="Nouveau mot de passe"
                    type="password"
                    placeholder="Minimum 8 caractères"
                    value={passwordForm.new}
                    onChange={e => setPasswordForm(f => ({ ...f, new: e.target.value }))}
                  />
                  {/* Barre de force */}
                  {passwordForm.new && (() => {
                    const s = getPasswordStrength(passwordForm.new)
                    return (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${s.pct}%`, background: s.color, borderRadius: 2, transition: 'width 0.3s ease, background 0.3s ease' }} />
                        </div>
                        <p style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, letterSpacing: '0.2em', color: s.color, marginTop: 4 }}>
                          FORCE : {s.label}
                        </p>
                      </div>
                    )
                  })()}
                </div>
                <FocusInput
                  label="Confirmer le nouveau mot de passe"
                  type="password"
                  placeholder="Répète le mot de passe"
                  value={passwordForm.confirm}
                  onChange={e => setPasswordForm(f => ({ ...f, confirm: e.target.value }))}
                  hasError={!!(passwordForm.new && passwordForm.confirm && passwordForm.new !== passwordForm.confirm)}
                />

                {passwordMsg && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 4,
                    fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '0.05em',
                    ...(passwordMsg.type === 'success'
                      ? { background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.22)', color: '#4ee8c8' }
                      : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: 'rgba(239,68,68,0.9)' }),
                  }}>{passwordMsg.text}</div>
                )}

                <button
                  onClick={changePassword}
                  disabled={savingPassword || !passwordForm.current || !passwordForm.new || !passwordForm.confirm}
                  style={{
                    ...S.btnGold,
                    opacity: (savingPassword || !passwordForm.current || !passwordForm.new || !passwordForm.confirm) ? 0.45 : 1,
                    cursor: (savingPassword || !passwordForm.current || !passwordForm.new || !passwordForm.confirm) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {savingPassword ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
                </button>

                {/* Mot de passe oublié */}
                <button
                  onClick={sendPasswordReset}
                  disabled={sendingReset}
                  style={{
                    background: 'none', border: 'none', padding: '4px 0',
                    fontFamily: '"DM Mono", monospace', fontSize: 10, letterSpacing: '0.15em',
                    textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
                    cursor: sendingReset ? 'wait' : 'pointer', textDecoration: 'underline',
                    textDecorationColor: 'rgba(255,255,255,0.15)',
                    opacity: sendingReset ? 0.5 : 1,
                    textAlign: 'left',
                  }}
                >
                  {sendingReset ? 'Envoi...' : 'Mot de passe oublié ? Recevoir un lien de réinitialisation'}
                </button>
              </div>
            </div>

            {/* ── Zone danger ── */}
            <div style={{ marginTop: 8 }}>
              <hr style={S.divider} />
              <p style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.18)', margin: '16px 0 10px' }}>
                Zone de danger
              </p>
              <button
                onClick={() => { setShowDeleteConfirm(true); setDeletePassword(''); setDeleteError('') }}
                style={{
                  width: '100%', padding: '12px 28px', borderRadius: 4,
                  background: 'rgba(220,50,50,0.07)', border: '1px solid rgba(220,50,50,0.28)',
                  fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '0.2em',
                  textTransform: 'uppercase', color: 'rgba(220,100,100,0.75)', cursor: 'pointer',
                }}
              >
                Supprimer mon compte
              </button>
            </div>
          </div>
        </div>
      </Layout>

      {/* ── Confirm delete modal ── */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)' }} onClick={() => setShowDeleteConfirm(false)} />
          <div style={{
            position: 'relative', width: '100%', maxWidth: 340,
            background: 'rgba(8,10,20,0.97)', border: '1px solid rgba(220,50,50,0.35)',
            borderRadius: 10, padding: '28px 24px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          }}>
            {/* Icon */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(220,50,50,0.10)', border: '1px solid rgba(220,50,50,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(220,100,100,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </div>
            </div>

            <p style={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 300, fontSize: 22, color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginBottom: 8 }}>
              Supprimer mon compte
            </p>
            <p style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center', letterSpacing: '0.05em', lineHeight: 1.7, marginBottom: 20 }}>
              Cette action est <span style={{ color: 'rgba(220,100,100,0.8)' }}>irréversible</span>. Toutes tes données, billets et solde seront définitivement supprimés.
            </p>

            <label style={S.inputLabel}>Confirme avec ton mot de passe</label>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                type="password"
                placeholder="Mot de passe"
                value={deletePassword}
                onChange={e => { setDeletePassword(e.target.value); setDeleteError('') }}
                style={{
                  ...S.input,
                  borderColor: deleteError ? 'rgba(220,50,50,0.5)' : 'rgba(255,255,255,0.10)',
                }}
                autoFocus
              />
            </div>

            {deleteError && (
              <p style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, color: 'rgba(220,100,100,0.9)', marginBottom: 12 }}>
                {deleteError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{ ...S.btnGhost, flex: 1 }}
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={!deletePassword || deleting}
                style={{
                  flex: 1, padding: '12px', borderRadius: 4,
                  background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.40)',
                  fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '0.15em',
                  textTransform: 'uppercase', color: 'rgba(220,100,100,0.9)', cursor: !deletePassword || deleting ? 'not-allowed' : 'pointer',
                  opacity: !deletePassword || deleting ? 0.5 : 1, transition: 'opacity 0.2s',
                }}
              >
                {deleting ? 'Suppression...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    )
  }

  // ── Mes billets ─────────────────────────────────────────────────────────────
  if (panel === 'billets') {
    const bookings = getBookings()
    // Group by event
    const grouped = bookings.reduce((acc, b) => {
      const key = String(b.eventId)
      if (!acc[key]) acc[key] = { eventName: b.eventName, eventDate: b.eventDate, eventId: b.eventId, tickets: [] }
      acc[key].tickets.push(b)
      return acc
    }, {})
    const groups = Object.values(grouped)

    return (
      <Layout>
        <div style={S.page}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <BackButton />
            <h2 style={S.sectionTitle}>Mes billets</h2>
          </div>
          {groups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={S.emptyIcon}>
                <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
                  <path d="M3 7h14M3 10h8M3 13h5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round"/>
                  <rect x="2" y="4" width="16" height="12" rx="1.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                </svg>
              </div>
              <p style={S.emptyText}>Aucun billet pour l&apos;instant</p>
              <button
                onClick={() => navigate('/evenements')}
                style={{ ...S.btnGold, width: 'auto', marginTop: '16px', display: 'inline-block' }}
              >
                Découvrir les événements
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {groups.map((g) => (
                <EventTicketGroup key={g.eventId} group={g} />
              ))}
            </div>
          )}
        </div>
      </Layout>
    )
  }


  // ── Mes commandes ─────────────────────────────────────────────────────────────
  if (panel === 'commandes') {
    const bookings = getBookings().filter(b => b.preorderSummary?.length > 0)
    return (
      <Layout>
        <div style={S.page}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <BackButton />
            <h2 style={S.sectionTitle}>Mes commandes</h2>
          </div>
          {bookings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={S.emptyIcon}>
                <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
                  <path d="M3 4h2l2 8h8l2-5H7" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="9" cy="15" r="1" fill="rgba(255,255,255,0.2)"/>
                  <circle cx="15" cy="15" r="1" fill="rgba(255,255,255,0.2)"/>
                </svg>
              </div>
              <p style={S.emptyText}>Aucune précommande pour l&apos;instant</p>
              <p style={S.emptySubText}>Tu peux précommander des consommations lors d&apos;une réservation.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {bookings.map((b) => (
                <div key={b.id} style={S.card}>
                  <p style={{
                    fontFamily: '"Cormorant Garamond", serif',
                    fontWeight: 400,
                    fontSize: '16px',
                    color: 'rgba(255,255,255,0.88)',
                  }}>{b.eventName}</p>
                  <p style={{ ...S.label, marginTop: '4px', marginBottom: '12px' }}>{b.eventDate}</p>
                  <hr style={S.divider} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '10px 0' }}>
                    {b.preorderSummary.map(item => (
                      <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontFamily: '"Cormorant Garamond", serif',
                          fontWeight: 400,
                          fontSize: '14px',
                          color: 'rgba(255,255,255,0.7)',
                        }}>{item.name}</span>
                        <span style={{
                          fontFamily: '"DM Mono", monospace',
                          fontSize: '11px',
                          color: 'rgba(255,255,255,0.4)',
                        }}>×{b.preorderItems[item.name]} · {item.price * b.preorderItems[item.name]}€</span>
                      </div>
                    ))}
                  </div>
                  <hr style={S.divider} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                    <span style={{ ...S.label }}>Total commande</span>
                    <span style={{
                      fontFamily: '"Cormorant Garamond", serif',
                      fontWeight: 300,
                      fontSize: '20px',
                      color: '#c8a96e',
                    }}>
                      {b.preorderSummary.reduce((s, i) => s + i.price * b.preorderItems[i.name], 0)}€
                    </span>
                  </div>
                  <p style={{
                    fontFamily: '"DM Mono", monospace',
                    fontSize: '9px',
                    color: 'rgba(255,255,255,0.18)',
                    marginTop: '8px',
                  }}>{b.ticketCode}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Layout>
    )
  }

  // ── Commandes prestataires ────────────────────────────────────────────────────
  if (panel === 'service-orders') {
    const uid = getUserId(user)
    const serviceOrders = getOrdersForBuyer(uid)
    return (
      <Layout>
        <div style={S.page}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <BackButton />
            <h2 style={S.sectionTitle}>Commandes prestataires</h2>
          </div>
          {serviceOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={S.emptyIcon}>
                <svg viewBox="0 0 20 20" fill="none" width="20" height="20">
                  <rect x="3" y="3" width="14" height="14" rx="1.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                  <path d="M7 10h6M7 7h4" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </div>
              <p style={S.emptyText}>Aucune commande pour l&apos;instant</p>
              <button
                onClick={() => navigate('/proposer')}
                style={{ ...S.btnGold, width: 'auto', marginTop: '16px', display: 'inline-block' }}
              >
                Parcourir les prestataires
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {serviceOrders.map(order => {
                const st = ORDER_STATUS_LABELS[order.status] || { label: order.status, color: '#6b7280' }
                return (
                  <div key={order.id} style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <p style={{
                          fontFamily: '"Cormorant Garamond", serif',
                          fontWeight: 400,
                          fontSize: '16px',
                          color: 'rgba(255,255,255,0.88)',
                        }}>{order.sellerName}</p>
                        <p style={{ ...S.label, marginTop: '4px' }}>
                          {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <span style={{
                        fontFamily: '"DM Mono", monospace',
                        fontSize: '9px',
                        letterSpacing: '0.2em',
                        textTransform: 'uppercase',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        border: `1px solid ${st.color}44`,
                        background: `${st.color}11`,
                        color: st.color,
                        flexShrink: 0,
                      }}>
                        {st.label}
                      </span>
                    </div>
                    <hr style={S.divider} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '10px 0' }}>
                      {order.items.map((it, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{
                            fontFamily: '"Cormorant Garamond", serif',
                            fontWeight: 400,
                            fontSize: '14px',
                            color: 'rgba(255,255,255,0.65)',
                          }}>{it.name} × {it.qty}</span>
                          <span style={{
                            fontFamily: '"DM Mono", monospace',
                            fontSize: '12px',
                            color: 'rgba(255,255,255,0.55)',
                          }}>{(it.price * it.qty).toFixed(2)}€</span>
                        </div>
                      ))}
                    </div>
                    <hr style={S.divider} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                      <span style={S.label}>Total payé</span>
                      <span style={{
                        fontFamily: '"Cormorant Garamond", serif',
                        fontWeight: 300,
                        fontSize: '20px',
                        color: '#c8a96e',
                      }}>{order.subtotal.toFixed(2)}€</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Layout>
    )
  }

  // ── Support ───────────────────────────────────────────────────────────────────
  if (panel === 'support') {
    return (
      <Layout>
        <div style={S.page}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <BackButton />
            <h2 style={S.sectionTitle}>Support</h2>
          </div>

          <div>
            <EyebrowLabel text="Questions fréquentes" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {FAQ.map((item, i) => (
                <div key={i} style={{
                  ...S.card,
                  padding: 0,
                  overflow: 'hidden',
                }}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <p style={{
                      fontFamily: '"Cormorant Garamond", serif',
                      fontWeight: 400,
                      fontSize: '15px',
                      color: 'rgba(255,255,255,0.82)',
                      paddingRight: '16px',
                      flex: 1,
                    }}>{item.q}</p>
                    <span style={{
                      color: 'rgba(255,255,255,0.3)',
                      fontSize: '16px',
                      flexShrink: 0,
                      transition: 'transform 0.18s',
                      transform: openFaq === i ? 'rotate(180deg)' : 'none',
                      display: 'inline-block',
                    }}>˅</span>
                  </button>
                  {openFaq === i && (
                    <div style={{
                      padding: '0 16px 16px',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      paddingTop: '14px',
                    }}>
                      <p style={S.bodyText}>{item.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{
            ...S.card,
            borderColor: 'rgba(200,169,110,0.2)',
          }}>
            <EyebrowLabel text="Contacter le support" />
            <p style={{ ...S.bodyText, marginBottom: '14px' }}>
              Tu n&apos;as pas trouvé de réponse ? Notre équipe te répond sous 24h.
            </p>
            <a
              href="mailto:support@liveinblack.com"
              style={{
                ...S.btnGold,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                textDecoration: 'none',
              }}
            >
              Envoyer un message
            </a>
            <p style={{ ...S.label, textAlign: 'center', marginTop: '10px' }}>
              support@liveinblack.com
            </p>
          </div>
        </div>
      </Layout>
    )
  }

  // ── Main Profile ──────────────────────────────────────────────────────────────
  const bookingsCount = getBookings().length
  const createdCount = (() => { try { return JSON.parse(localStorage.getItem('lib_created_events') || '[]').length } catch { return 0 } })()
  const wallet = getWallet(getUserId(user))

  return (
    <Layout>
      <div style={S.page}>
        {/* Avatar & name */}
        <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
          <AvatarUpload user={user} setUser={setUser} />
          <h2 style={{
            fontFamily: '"Cormorant Garamond", serif',
            fontWeight: 300,
            fontSize: '26px',
            color: 'rgba(255,255,255,0.92)',
            marginTop: '14px',
            letterSpacing: '0.04em',
          }}>{(user?.role === 'organisateur' && orgName) ? orgName : user?.name}</h2>
          <p style={{ ...S.label, marginTop: '6px' }}>{user?.email}</p>
          {user?.phone && (
            <p style={{ ...S.label, marginTop: '4px' }}>{user.phone}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            {user?.role && ROLES[user.role] && (
              <span style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '9px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                padding: '4px 12px',
                borderRadius: '4px',
                border: `1px solid ${ROLES[user.role].color}44`,
                background: `${ROLES[user.role].color}11`,
                color: ROLES[user.role].color,
              }}>
                {ROLES[user.role].label}
              </span>
            )}
            {user?.role !== 'organisateur' && (
              <span style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '9px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                padding: '4px 12px',
                borderRadius: '4px',
                border: '1px solid rgba(200,169,110,0.25)',
                background: 'rgba(200,169,110,0.08)',
                color: '#c8a96e',
              }}>
                {user?.points || 0} pts
              </span>
            )}
          </div>
        </div>

        {/* Stats — filtrées selon le rôle */}
        {(() => {
          const isOrg = user?.role === 'organisateur'
          const stats = isOrg
            ? [{ label: 'Événements', val: createdCount }]
            : [
                { label: 'Tickets',     val: bookingsCount },
                { label: 'Événements',  val: createdCount  },
                { label: 'Points',      val: user?.points || 0 },
              ]
          return (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: '8px' }}>
              {stats.map((s) => (
                <div key={s.label} style={{ ...S.card, textAlign: 'center', padding: '14px 8px' }}>
                  <p style={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 300, fontSize: '28px', color: 'rgba(255,255,255,0.9)', lineHeight: 1 }}>{s.val}</p>
                  <p style={{ ...S.label, marginTop: '6px' }}>{s.label}</p>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Points info — clients uniquement */}
        {user?.role !== 'organisateur' && (
          <div style={{ ...S.card, borderColor: 'rgba(200,169,110,0.12)' }}>
            <EyebrowLabel text="Système de points" />
            <p style={S.bodyText}>
              Tu gagnes{' '}
              <span style={{ color: 'rgba(255,255,255,0.82)' }}>1 point</span>
              {' '}pour chaque ticket ou carré acheté.
              Les points seront bientôt échangeables contre des avantages exclusifs.
            </p>
          </div>
        )}

        {/* Menu — items filtrés selon le rôle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            // Clients uniquement : achats de billets et commandes événements
            (!['organisateur', 'prestataire', 'agent'].includes(user?.role)) &&
              { label: 'Mes billets',               action: () => setPanel('billets')        },
            (!['organisateur', 'prestataire', 'agent'].includes(user?.role)) &&
              { label: 'Mes commandes événements',  action: () => setPanel('commandes')      },
            // Prestataires + clients : commandes de services reçues/passées
            (user?.role !== 'organisateur' && user?.role !== 'agent') &&
              { label: 'Mes commandes prestataires', action: () => setPanel('service-orders') },
            // Portefeuille — accessible à tous sauf agents
            (user?.role !== 'agent') &&
              { label: `Portefeuille — ${wallet.balance?.toFixed(2) ?? '0.00'}€`, action: () => navigate('/portefeuille') },
            { label: 'Paramètres du compte', action: () => setPanel('settings') },
            { label: 'Support / Aide',       action: () => setPanel('support')   },
            // Carte d'accréditation — organisateurs et prestataires approuvés uniquement
            credentialApp && { label: '🪪 Mes documents d\'identification', action: () => openCredentialPDF(credentialApp, user.role), gold: true },
          ].filter(Boolean).map((item) => (
            <MenuRow key={item.label} label={item.label} onClick={item.action} gold={item.gold} />
          ))}
        </div>

        {/* Logout */}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: '4px',
            border: '1px solid rgba(239,68,68,0.2)',
            background: 'transparent',
            fontFamily: '"DM Mono", monospace',
            fontSize: '11px',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: 'rgba(239,68,68,0.7)',
            cursor: 'pointer',
            transition: 'background 0.18s, border-color 0.18s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.06)'
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'
          }}
        >
          Se déconnecter
        </button>
      </div>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
        }}>
          <div style={{
            ...S.card,
            width: '100%',
            maxWidth: '320px',
            borderColor: 'rgba(239,68,68,0.2)',
          }}>
            <p style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontWeight: 300,
              fontSize: '22px',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.88)',
              marginBottom: '10px',
            }}>Se déconnecter ?</p>
            <p style={{ ...S.bodyText, textAlign: 'center', marginBottom: '20px' }}>
              Tu devras te reconnecter pour accéder à ton compte.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                style={S.btnGhost}
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  setShowLogoutConfirm(false)
                  const { USE_REAL_FIREBASE } = await import('../firebase')
                  if (USE_REAL_FIREBASE) {
                    const { auth } = await import('../firebase')
                    const { signOut } = await import('firebase/auth')
                    await signOut(auth).catch(() => {})
                  }
                  setUser(null)
                  navigate('/')
                }}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: '4px',
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  fontFamily: '"DM Mono", monospace',
                  fontSize: '11px',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: 'rgba(239,68,68,0.9)',
                  cursor: 'pointer',
                }}
              >
                Déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function MenuRow({ label, onClick, gold = false }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        background: gold
          ? hovered ? 'rgba(200,169,110,0.12)' : 'rgba(200,169,110,0.07)'
          : hovered ? 'rgba(255,255,255,0.03)' : 'rgba(8,10,20,0.55)',
        backdropFilter: 'blur(22px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
        border: `1px solid ${gold
          ? hovered ? 'rgba(200,169,110,0.5)' : 'rgba(200,169,110,0.28)'
          : hovered ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '8px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{
        fontFamily: '"DM Mono", monospace',
        fontSize: '11px',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: gold ? '#c8a96e' : hovered ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.52)',
      }}>{label}</span>
      <span style={{ color: gold ? 'rgba(200,169,110,0.6)' : hovered ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)', fontSize: '18px' }}>›</span>
    </button>
  )
}

function FocusInput({ label, value, onChange, type = 'text', placeholder, hasError = false }) {
  const [focused, setFocused] = useState(false)
  return (
    <div>
      <label style={S.inputLabel}>{label}</label>
      <input
        style={{
          width: '100%',
          background: 'rgba(6,8,16,0.6)',
          border: `1px solid ${hasError ? 'rgba(239,68,68,0.6)' : focused ? '#4ee8c8' : 'rgba(255,255,255,0.10)'}`,
          borderRadius: '4px',
          fontFamily: '"DM Mono", monospace',
          fontSize: '13px',
          color: 'rgba(255,255,255,0.9)',
          padding: '11px 14px',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 0.18s',
          ...(focused && !hasError ? { boxShadow: '0 0 0 3px rgba(78,232,200,0.06)' } : {}),
        }}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  )
}

function EventTicketGroup({ group }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [showPlaylist, setShowPlaylist] = useState(false)

  // Récupère l'objet événement complet pour savoir s'il a une playlist et son statut
  const event = getAllEvents().find(e => String(e.id) === String(group.eventId))
  const hasPlaylist = !!event?.playlist
  const isCancelled = !!event?.cancelled

  return (
    <>
    <div style={{
      background: 'rgba(8,10,20,0.55)',
      backdropFilter: 'blur(22px) saturate(1.6)',
      WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
      border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      {/* Event header */}
      <div
        style={{ padding: '14px 16px', cursor: 'pointer' }}
        onClick={() => navigate(`/evenements/${group.eventId}`)}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontWeight: 400,
              fontSize: '16px',
              color: isCancelled ? 'rgba(220,100,100,0.7)' : 'rgba(255,255,255,0.88)',
              textDecoration: isCancelled ? 'line-through' : 'none',
            }}>{group.eventName}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <p style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '9px',
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.28)',
                margin: 0,
              }}>{group.eventDate}</p>
              {isCancelled && (
                <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 8, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(220,100,100,0.9)', background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.3)', borderRadius: 3, padding: '1px 6px' }}>
                  ANNULÉ
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              fontFamily: '"DM Mono", monospace',
              fontSize: '9px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              padding: '3px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(78,232,200,0.22)',
              background: 'rgba(78,232,200,0.06)',
              color: '#4ee8c8',
            }}>
              {group.tickets.length} billet{group.tickets.length > 1 ? 's' : ''}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: '18px' }}>›</span>
          </div>
        </div>
      </div>

      {/* Actions row */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex' }}>
        {/* Expand / collapse tickets */}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'transparent',
            border: 'none',
            borderRight: hasPlaylist ? '1px solid rgba(255,255,255,0.06)' : 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: '9px',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: '#c8a96e',
          }}>{expanded ? 'Masquer mes places' : 'Voir mes places'}</span>
          <span style={{
            color: '#c8a96e',
            fontSize: '16px',
            transition: 'transform 0.18s',
            transform: expanded ? 'rotate(90deg)' : 'none',
            display: 'inline-block',
          }}>›</span>
        </button>

        {/* Playlist button — only if event has playlist */}
        {hasPlaylist && (
          <button
            onClick={() => setShowPlaylist(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,169,110,0.05)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {/* music note icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#c8a96e"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
            <span style={{
              fontFamily: '"DM Mono", monospace',
              fontSize: '9px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#c8a96e',
            }}>Playlist</span>
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {group.tickets.map((b, i) => (
            <SingleTicketCard key={b.id} booking={b} index={i} />
          ))}
        </div>
      )}
    </div>

    {/* ── Playlist modal (bottom sheet) ── */}
    {showPlaylist && event && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowPlaylist(false)}
        />
        <div style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          background: 'rgba(4,5,12,0.97)',
          borderTop: '1px solid rgba(255,255,255,0.10)',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '16px 16px 0 0',
          maxHeight: '88vh',
          overflowY: 'auto',
        }}>
          {/* Handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
            <div style={{ width: 40, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
          </div>

          {/* Header */}
          <div style={{ padding: '4px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <div>
              <p style={{ fontFamily: '"DM Mono", monospace', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                Playlist interactive
              </p>
              <p style={{ fontFamily: '"Cormorant Garamond", serif', fontWeight: 300, fontSize: 18, color: 'white', margin: '2px 0 0' }}>
                {group.eventName}
              </p>
            </div>
            <button
              onClick={() => setShowPlaylist(false)}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
              }}
            >×</button>
          </div>

          <div style={{ padding: '12px 20px 36px' }}>
            <PlaylistSystem event={event} booked={true} />
          </div>
        </div>
      </div>
    )}
    </>
  )
}

function SingleTicketCard({ booking: b, index }) {
  const [showQr, setShowQr] = useState(false)
  const canvasRef = useRef(null)
  const qrUrl = b.token ? `${window.location.origin}/ticket/${b.token}` : ''

  function downloadQr() {
    const canvas = document.getElementById(`qr-canvas-${b.id}`)
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `billet-${b.ticketCode}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div style={{
      background: 'rgba(6,8,16,0.7)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            background: 'rgba(200,169,110,0.15)',
            border: '1px solid rgba(200,169,110,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '"DM Mono", monospace',
            fontSize: '10px',
            color: '#c8a96e',
            flexShrink: 0,
          }}>
            {index + 1}
          </span>
          <div>
            <p style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontWeight: 400,
              fontSize: '15px',
              color: 'rgba(255,255,255,0.85)',
            }}>{b.place}</p>
            <p style={{
              fontFamily: '"DM Mono", monospace',
              fontSize: '9px',
              color: 'rgba(255,255,255,0.22)',
              marginTop: '2px',
            }}>{b.ticketCode}</p>
          </div>
        </div>
        <div>
          {qrUrl && (
            <button
              onClick={() => setShowQr(v => !v)}
              style={{
                padding: '5px 10px',
                borderRadius: '4px',
                fontFamily: '"DM Mono", monospace',
                fontSize: '9px',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#c8a96e',
                background: 'rgba(200,169,110,0.08)',
                border: '1px solid rgba(200,169,110,0.22)',
                cursor: 'pointer',
              }}
            >
              {showQr ? 'Fermer' : 'QR'}
            </button>
          )}
        </div>
      </div>

      {b.preorderSummary?.length > 0 && (
        <div style={{ padding: '0 12px 10px' }}>
          <p style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: '9px',
            letterSpacing: '0.15em',
            color: 'rgba(200,169,110,0.55)',
          }}>
            {b.preorderSummary.map(i => i.name).join(', ')}
          </p>
        </div>
      )}

      {showQr && qrUrl && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{ padding: '12px', background: '#fff', borderRadius: '8px', display: 'inline-block' }}>
            <QRCodeSVG value={qrUrl} size={150} level="H" />
          </div>
          {/* Hidden canvas for download */}
          <div style={{ display: 'none' }}>
            <QRCodeCanvas id={`qr-canvas-${b.id}`} value={qrUrl} size={400} level="H" />
          </div>
          <button
            onClick={downloadQr}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 20px',
              borderRadius: '4px',
              background: 'rgba(200,169,110,0.08)',
              border: '1px solid rgba(200,169,110,0.25)',
              fontFamily: '"DM Mono", monospace',
              fontSize: '9px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#c8a96e',
              cursor: 'pointer',
              transition: 'background 0.18s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,169,110,0.16)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(200,169,110,0.08)'}
          >
            Télécharger le QR code
          </button>
          <p style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: '8px',
            letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.15)',
          }}>Signature anti-fraude · LIVEINBLACK</p>
        </div>
      )}
    </div>
  )
}

function AvatarUpload({ user, setUser }) {
  const inputRef   = useRef(null)
  const canvasRef  = useRef(null)
  const [cropData, setCropData] = useState(null)
  const [offset,   setOffset]   = useState({ x: 0, y: 0 })
  const [zoom,     setZoom]     = useState(1)
  const [dragging, setDragging] = useState(false)
  const [dragStart,setDragStart]= useState({ mx: 0, my: 0, ox: 0, oy: 0 })

  const PREVIEW = 192
  const OUTPUT  = 300

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setCropData({ dataUrl: ev.target.result })
      setOffset({ x: 0, y: 0 })
      setZoom(1)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function onPointerDown(e) {
    setDragging(true)
    setDragStart({ mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y })
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e) {
    if (!dragging) return
    setOffset({ x: dragStart.ox + (e.clientX - dragStart.mx), y: dragStart.oy + (e.clientY - dragStart.my) })
  }
  function onPointerUp() { setDragging(false) }

  function saveAvatar() {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const img    = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, OUTPUT, OUTPUT)
      ctx.save()
      ctx.beginPath()
      ctx.arc(OUTPUT / 2, OUTPUT / 2, OUTPUT / 2, 0, Math.PI * 2)
      ctx.clip()
      const coverScale = Math.max(OUTPUT / img.width, OUTPUT / img.height)
      const totalScale = coverScale * zoom
      const iw = img.width  * totalScale
      const ih = img.height * totalScale
      const ratio = OUTPUT / PREVIEW
      ctx.drawImage(img,
        OUTPUT / 2 - iw / 2 + offset.x * ratio,
        OUTPUT / 2 - ih / 2 + offset.y * ratio,
        iw, ih
      )
      ctx.restore()
      const avatar = canvas.toDataURL('image/jpeg', 0.88)
      setUser(u => ({ ...u, avatar }))
      try {
        const users = JSON.parse(localStorage.getItem('lib_users') || '[]')
        const idx = users.findIndex(u => u.id === user.id || u.email === user.email)
        if (idx >= 0) { users[idx] = { ...users[idx], avatar }; localStorage.setItem('lib_users', JSON.stringify(users)) }
      } catch {}
      // Sync avatar to Firestore so it appears cross-device
      const uid = user?.uid || user?.id
      if (uid) {
        import('../utils/firestore-sync').then(({ syncDoc }) => {
          syncDoc(`users/${uid}`, { avatar })
        }).catch(() => {})
      }
      setCropData(null)
    }
    img.src = cropData.dataUrl
  }

  return (
    <div style={{ display: 'inline-block', margin: '0 auto' }}>
      <canvas ref={canvasRef} width={OUTPUT} height={OUTPUT} style={{ display: 'none' }} />
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

      {/* Avatar circle — click to upload */}
      <button
        onClick={() => inputRef.current?.click()}
        style={{
          position: 'relative',
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.06)',
          cursor: 'pointer',
          transition: 'border-color 0.18s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(200,169,110,0.45)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'}
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            background: 'rgba(200,169,110,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '"Cormorant Garamond", serif',
            fontWeight: 300,
            fontSize: '32px',
            color: '#c8a96e',
          }}>
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        {/* Camera overlay on hover */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0,
          transition: 'opacity 0.18s',
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1}
          onMouseLeave={e => e.currentTarget.style.opacity = 0}
        >
          {/* SVG camera icon */}
          <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
            <circle cx="10" cy="10" r="4" stroke="white" strokeWidth="1.5"/>
            <path d="M7 3h6l1.5 2H16a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1h1.5L7 3z" stroke="white" strokeWidth="1.2" fill="none"/>
          </svg>
        </div>
      </button>

      {cropData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 16px',
        }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.92)' }}
            onClick={() => setCropData(null)}
          />
          <div style={{
            position: 'relative',
            background: 'rgba(8,10,20,0.95)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '340px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            zIndex: 10,
          }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{
                fontFamily: '"Cormorant Garamond", serif',
                fontWeight: 300,
                fontSize: '20px',
                color: 'rgba(255,255,255,0.88)',
              }}>Recadrer la photo</p>
              <p style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '9px',
                letterSpacing: '0.25em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.28)',
                marginTop: '6px',
              }}>Glisse pour repositionner</p>
            </div>

            <div
              style={{
                position: 'relative',
                margin: '0 auto',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '1px solid rgba(200,169,110,0.35)',
                width: PREVIEW,
                height: PREVIEW,
                touchAction: 'none',
                userSelect: 'none',
                cursor: dragging ? 'grabbing' : 'grab',
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <img
                src={cropData.dataUrl}
                alt="recadrage"
                draggable={false}
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                }}
              />
            </div>

            <div>
              <p style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: '9px',
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.28)',
                textAlign: 'center',
                marginBottom: '8px',
              }}>Zoom</p>
              <input
                type="range"
                min="0.8"
                max="3"
                step="0.01"
                value={zoom}
                onChange={e => setZoom(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#c8a96e' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setCropData(null)}
                style={S.btnGhost}
              >
                Annuler
              </button>
              <button
                onClick={saveAvatar}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: '4px',
                  background: 'linear-gradient(135deg, rgba(200,169,110,0.35), rgba(200,169,110,0.15))',
                  border: '1px solid rgba(200,169,110,0.55)',
                  fontFamily: '"DM Mono", monospace',
                  fontSize: '11px',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: '#c8a96e',
                  cursor: 'pointer',
                }}
              >
                Valider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
