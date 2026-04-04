import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import { getWallet } from '../utils/wallet'
import { ROLES, updateAccount, deleteAccount } from '../utils/accounts'
import { getOrdersForBuyer, ORDER_STATUS_LABELS } from '../utils/services'

function getBookings() {
  try { return JSON.parse(localStorage.getItem('lib_bookings') || '[]') } catch { return [] }
}
const FAQ = [
  { q: "Comment réserver un billet ?", a: "Va sur l'onglet Événements, sélectionne la soirée de ton choix et clique sur Réservation. Choisis ton type de place et confirme." },
  { q: "Puis-je annuler ma réservation ?", a: "Les réservations sont fermes et définitives. En cas d'annulation d'événement par l'organisateur, un remboursement sera traité sous 5 jours ouvrés." },
  { q: "Comment utiliser mes points ?", a: "Tu gagnes 1 point par ticket ou carré acheté. Les points seront bientôt échangeables contre des avantages exclusifs (accès prioritaire, réductions, cadeaux)." },
  { q: "Comment créer un événement ?", a: "Rends-toi dans 'Mes Événements & Créations' via le menu. Tu peux créer et publier ton événement en 5 étapes simples." },
]

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

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [settingsMsg, setSettingsMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  // Support state
  const [openFaq, setOpenFaq] = useState(null)

  const emailChanged    = settingsForm.email.trim() !== (user?.email || '')
  const passwordChanged = !!settingsForm.newPassword
  const needsCurrentPassword = emailChanged || passwordChanged

  // ── Name change cooldown (1 fois toutes les 2 semaines) ──
  const NAME_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000 // 14 jours
  const nameChangedAt   = user?.nameChangedAt || null
  const nextNameChange  = nameChangedAt ? nameChangedAt + NAME_COOLDOWN_MS : null
  const nameOnCooldown  = nextNameChange ? Date.now() < nextNameChange : false
  const nameChanged     = settingsForm.name.trim() !== (user?.name || '')

  function formatNextDate(ts) {
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  async function saveSettings() {
    if (!settingsForm.name.trim()) {
      setSettingsMsg({ type: 'error', text: 'Le prénom / nom est obligatoire' })
      return
    }
    if (nameChanged && nameOnCooldown) {
      setSettingsMsg({ type: 'error', text: `Prochain changement de nom possible le ${formatNextDate(nextNameChange)}.` })
      return
    }
    if (!settingsForm.email.trim() || !settingsForm.email.includes('@')) {
      setSettingsMsg({ type: 'error', text: 'Adresse e-mail invalide' })
      return
    }
    if (passwordChanged) {
      if (settingsForm.newPassword.length < 8) {
        setSettingsMsg({ type: 'error', text: 'Le mot de passe doit contenir au moins 8 caractères' })
        return
      }
      if (settingsForm.newPassword !== settingsForm.confirmPassword) {
        setSettingsMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas' })
        return
      }
    }
    if (needsCurrentPassword && !settingsForm.currentPassword) {
      setSettingsMsg({ type: 'error', text: 'Saisis ton mot de passe actuel pour modifier l\'e-mail ou le mot de passe' })
      return
    }

    setSaving(true)
    setSettingsMsg(null)

    try {
      const { USE_REAL_FIREBASE } = await import('../firebase')
      if (USE_REAL_FIREBASE) {
        const { auth } = await import('../firebase')
        const { updateProfile, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } = await import('firebase/auth')
        const currentUser = auth.currentUser

        if (currentUser) {
          // Update display name
          if (settingsForm.name.trim() !== user.name) {
            await updateProfile(currentUser, { displayName: settingsForm.name.trim() })
          }

          // Email or password change requires re-authentication
          if (needsCurrentPassword) {
            const isEmailPassword = currentUser.providerData.some(p => p.providerId === 'password')
            if (!isEmailPassword) {
              setSettingsMsg({ type: 'error', text: 'Connexion via Google/Apple — e-mail et mot de passe gérés par ce service' })
              setSaving(false)
              return
            }
            const credential = EmailAuthProvider.credential(user.email, settingsForm.currentPassword)
            await reauthenticateWithCredential(currentUser, credential)

            if (emailChanged) {
              await updateEmail(currentUser, settingsForm.email.trim())
            }
            if (passwordChanged) {
              await updatePassword(currentUser, settingsForm.newPassword)
            }
          }
        }
      }

      // Update local state
      const uid = getUserId(user)
      const now = Date.now()
      const nameWasChanged = settingsForm.name.trim() !== user.name
      const patch = {
        name: settingsForm.name.trim(),
        email: settingsForm.email.trim(),
        ...(nameWasChanged ? { nameChangedAt: now } : {}),
      }
      const updatedUser = { ...user, ...patch }
      setUser(updatedUser)
      updateAccount(uid, patch)

      // Persist nameChangedAt to Firestore if Firebase active
      if (nameWasChanged) {
        try {
          const { USE_REAL_FIREBASE: fb } = await import('../firebase')
          if (fb) {
            const { db: firestoreDb } = await import('../firebase')
            const { doc, updateDoc } = await import('firebase/firestore')
            await updateDoc(doc(firestoreDb, 'users', uid), { nameChangedAt: now })
          }
        } catch {}
      }
      setSettingsForm(f => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }))
      setSettingsMsg({ type: 'success', text: 'Modifications enregistrées' })
      setTimeout(() => setSettingsMsg(null), 3000)
    } catch (err) {
      setSettingsMsg({ type: 'error', text: getProfileError(err.code) })
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAccount() {
    setDeleteError('')
    setDeleting(true)
    try {
      const { USE_REAL_FIREBASE } = await import('../firebase')
      if (USE_REAL_FIREBASE) {
        // Verify password first by re-authenticating
        const { auth } = await import('../firebase')
        const { EmailAuthProvider, reauthenticateWithCredential, deleteUser } = await import('firebase/auth')
        const currentUser = auth.currentUser
        if (!currentUser) throw { code: 'auth/requires-recent-login' }
        const cred = EmailAuthProvider.credential(currentUser.email, deletePassword)
        await reauthenticateWithCredential(currentUser, cred)
        // Delete Firestore doc
        const { db } = await import('../firebase')
        const { doc, deleteDoc } = await import('firebase/firestore')
        await deleteDoc(doc(db, 'users', currentUser.uid))
        // Delete Firebase Auth user
        await deleteUser(currentUser)
      } else {
        // Local mode: check password
        if (user.password && user.password !== deletePassword) {
          throw { code: 'auth/wrong-password' }
        }
        deleteAccount(user.uid)
      }
      // Clear all local session data
      localStorage.removeItem('lib_user')
      localStorage.removeItem('lib_region')
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
            {/* Personal info */}
            <div style={S.card}>
              <EyebrowLabel text="Informations personnelles" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <FocusInput
                    label="Prénom / Nom"
                    placeholder="Ton nom"
                    value={settingsForm.name}
                    onChange={e => !nameOnCooldown && setSettingsForm(f => ({ ...f, name: e.target.value }))}
                    style={nameOnCooldown ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  />
                  {nameOnCooldown && (
                    <p style={{
                      fontFamily: "'DM Mono', monospace", fontSize: 9,
                      letterSpacing: '0.12em', color: 'rgba(200,169,110,0.7)',
                      marginTop: 6,
                    }}>
                      ⏳ Prochain changement possible le {formatNextDate(nextNameChange)}
                    </p>
                  )}
                </div>
                <FocusInput
                  label="Adresse e-mail"
                  type="email"
                  placeholder="ton@email.com"
                  value={settingsForm.email}
                  onChange={e => setSettingsForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>

            {/* Password */}
            <div style={S.card}>
              <EyebrowLabel text="Changer le mot de passe" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <FocusInput
                  label="Nouveau mot de passe"
                  type="password"
                  placeholder="Minimum 8 caractères"
                  value={settingsForm.newPassword}
                  onChange={e => setSettingsForm(f => ({ ...f, newPassword: e.target.value }))}
                />
                <FocusInput
                  label="Confirmer le mot de passe"
                  type="password"
                  placeholder="Répète le mot de passe"
                  value={settingsForm.confirmPassword}
                  onChange={e => setSettingsForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  hasError={!!(settingsForm.newPassword && settingsForm.confirmPassword && settingsForm.newPassword !== settingsForm.confirmPassword)}
                />
              </div>
            </div>

            {/* Re-auth if needed */}
            {needsCurrentPassword && (
              <div style={{
                ...S.card,
                borderColor: 'rgba(251,146,60,0.2)',
                background: 'rgba(251,146,60,0.04)',
              }}>
                <p style={{ ...S.labelOrange, marginBottom: '12px' }}>Confirmation requise</p>
                <FocusInput
                  label="Mot de passe actuel"
                  type="password"
                  placeholder="Ton mot de passe actuel"
                  value={settingsForm.currentPassword}
                  onChange={e => setSettingsForm(f => ({ ...f, currentPassword: e.target.value }))}
                />
                <p style={{ ...S.label, marginTop: '10px' }}>Requis pour modifier ton e-mail ou mot de passe.</p>
              </div>
            )}

            {settingsMsg && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '4px',
                fontFamily: '"DM Mono", monospace',
                fontSize: '11px',
                letterSpacing: '0.05em',
                ...(settingsMsg.type === 'success'
                  ? { background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.22)', color: '#4ee8c8' }
                  : { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', color: 'rgba(239,68,68,0.9)' }
                ),
              }}>
                {settingsMsg.text}
              </div>
            )}

            <button
              onClick={saveSettings}
              disabled={saving}
              style={{ ...S.btnGold, opacity: saving ? 0.5 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>

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
          }}>{user?.name}</h2>
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
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {[
            { label: 'Tickets', val: bookingsCount },
            { label: 'Événements', val: createdCount },
            { label: 'Points', val: user?.points || 0 },
          ].map((s) => (
            <div key={s.label} style={{ ...S.card, textAlign: 'center', padding: '14px 8px' }}>
              <p style={{
                fontFamily: '"Cormorant Garamond", serif',
                fontWeight: 300,
                fontSize: '28px',
                color: 'rgba(255,255,255,0.9)',
                lineHeight: 1,
              }}>{s.val}</p>
              <p style={{ ...S.label, marginTop: '6px' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Wallet quick-access */}
        <button
          onClick={() => navigate('/portefeuille')}
          style={{
            ...S.card,
            borderColor: 'rgba(200,169,110,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
            transition: 'border-color 0.18s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(200,169,110,0.45)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(200,169,110,0.2)'}
        >
          <div>
            <EyebrowLabel text="Mon Portefeuille" />
            <p style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontWeight: 300,
              fontSize: 'clamp(1.8rem, 8vw, 2.25rem)',
              color: '#c8a96e',
              lineHeight: 1,
            }}>{wallet.balance.toFixed(2)}&thinsp;€</p>
          </div>
          <span style={{ color: '#c8a96e', fontSize: '22px', opacity: 0.6 }}>›</span>
        </button>

        {/* Points info */}
        <div style={{ ...S.card, borderColor: 'rgba(200,169,110,0.12)' }}>
          <EyebrowLabel text="Système de points" />
          <p style={S.bodyText}>
            Tu gagnes{' '}
            <span style={{ color: 'rgba(255,255,255,0.82)' }}>1 point</span>
            {' '}pour chaque ticket ou carré acheté.
            Les points seront bientôt échangeables contre des avantages exclusifs.
          </p>
        </div>

        {/* Menu */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { label: 'Mes billets', action: () => setPanel('billets') },
            { label: 'Mes commandes événements', action: () => setPanel('commandes') },
            { label: 'Mes commandes prestataires', action: () => setPanel('service-orders') },
            { label: 'Paramètres du compte', action: () => setPanel('settings') },
            { label: 'Support / Aide', action: () => setPanel('support') },
          ].map((item) => (
            <MenuRow key={item.label} label={item.label} onClick={item.action} />
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

function MenuRow({ label, onClick }) {
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
        background: hovered ? 'rgba(255,255,255,0.03)' : 'rgba(8,10,20,0.55)',
        backdropFilter: 'blur(22px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)'}`,
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
        color: hovered ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.52)',
      }}>{label}</span>
      <span style={{ color: hovered ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)', fontSize: '18px' }}>›</span>
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

  return (
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
              color: 'rgba(255,255,255,0.88)',
            }}>{group.eventName}</p>
            <p style={{
              fontFamily: '"DM Mono", monospace',
              fontSize: '9px',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.28)',
              marginTop: '4px',
            }}>{group.eventDate}</p>
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

      {/* Expand / collapse */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'transparent',
            border: 'none',
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

        {expanded && (
          <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {group.tickets.map((b, i) => (
              <SingleTicketCard key={b.id} booking={b} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
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
