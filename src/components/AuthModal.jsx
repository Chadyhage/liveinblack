import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getAllAccountsByEmail } from '../utils/accounts'
import { USE_REAL_FIREBASE } from '../firebase'

const FONT = 'Inter, sans-serif'

const ROLE_LABELS = { client: 'Client', user: 'Client', organisateur: 'Organisateur', prestataire: 'Prestataire', agent: 'Admin' }
const ROLE_COLORS = { client: '#22c55e', user: '#22c55e', organisateur: '#3b82f6', prestataire: '#8b5cf6', agent: '#c8a96e' }

// Retire les emojis d'un texte (les raisons d'ouverture du modal en contenaient)
const stripEmoji = (s) => (s || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu, '').trim()

const labelStyle = { fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 8 }
const inputStyle = { width: '100%', padding: '15px 16px', borderRadius: 13, boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.92)', fontFamily: FONT, fontSize: 15.5, outline: 'none' }

export default function AuthModal({ open, reason, onSuccess, onClose }) {
  const navigate = useNavigate()
  const { setUser } = useAuth()

  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [showPwd, setShowPwd]       = useState(false)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [roleChoices, setRoleChoices] = useState(null)  // array when email has multiple accounts
  const [selectedUid, setSelectedUid] = useState(null)  // uid of chosen account

  // Reset form state whenever the modal reopens
  useEffect(() => {
    if (open) {
      setEmail(''); setPassword(''); setError('')
      setRoleChoices(null); setSelectedUid(null); setShowPwd(false)
    }
  }, [open])

  if (!open) return null

  function close() {
    setEmail(''); setPassword(''); setError('')
    setRoleChoices(null); setSelectedUid(null); setShowPwd(false)
    onClose?.()
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (USE_REAL_FIREBASE) {
        // ── Firebase path ──────────────────────────────────────
        const { signInWithEmailAndPassword } = await import('firebase/auth')
        const { auth, db } = await import('../firebase')
        const { doc, getDoc } = await import('firebase/firestore')

        let cred
        try {
          cred = await signInWithEmailAndPassword(auth, email, password)
        } catch (err) {
          if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
            setError('Email ou mot de passe incorrect.')
          } else if (err.code === 'auth/too-many-requests') {
            setError('Trop de tentatives. Réessaie dans quelques minutes.')
          } else {
            setError('La connexion a échoué. Vérifie ta connexion internet et réessaie.')
          }
          setLoading(false)
          return
        }

        const snap = await getDoc(doc(db, 'users', cred.user.uid))
        // uid d'auth = source de vérité (jamais l'éventuel champ uid divergent du doc)
        const profile = snap.exists()
          ? { ...snap.data(), uid: cred.user.uid }
          : { uid: cred.user.uid, name: cred.user.displayName || email.split('@')[0], email: cred.user.email, role: 'user', activeRole: 'user', enabledRoles: ['user'], status: 'active', emailVerified: true }

        if (profile.status === 'rejected') { setError('Ton compte a été refusé. Écris-nous à support@liveinblack.com.'); setLoading(false); return }

        // pending / draft → on laisse entrer (comme doEmailLogin de LoginPage) : OnboardingGuard
        // redirige vers /mon-dossier ou /inscription-* sur les pages qui l'exigent, et laisse les
        // pages publiques (événements, billets) accessibles — onSuccess() peut donc reprendre
        // l'action d'origine (ex: réserver) sans être arraché vers une autre page sans explication.
        setLoading(false)
        setUser(profile)
        close()
        onSuccess?.()

      } else {
        // ── Local / demo path ──────────────────────────────────
        const accounts = getAllAccountsByEmail(email)

        if (accounts.length === 0) {
          setError('Aucun compte trouvé pour cet email.')
          setLoading(false)
          return
        }

        if (accounts.length > 1 && !selectedUid) {
          setRoleChoices(accounts)
          setLoading(false)
          return
        }

        const account = accounts.length === 1
          ? accounts[0]
          : accounts.find(a => a.uid === selectedUid)

        if (!account)                      { setError('Compte introuvable.'); setLoading(false); return }
        if (account.status === 'rejected') { setError('Ton compte a été refusé. Écris-nous à support@liveinblack.com.'); setLoading(false); return }
        // pending → on laisse entrer (comme doEmailLogin de LoginPage) : un compte en attente
        // de validation n'a parfois pas encore de mot de passe défini, donc on ne bloque que
        // si un mot de passe existe ET ne correspond pas.
        const pwdMismatch = account.status === 'pending'
          ? (account.password && account.password !== password)
          : (account.password !== password)
        if (pwdMismatch) { setError('Mot de passe incorrect.'); setLoading(false); return }

        setLoading(false)
        setUser(account)
        close()
        onSuccess?.()
      }
    } catch {
      setError('Une erreur est survenue. Réessaie.')
      setLoading(false)
    }
  }

  const chosenAccount = selectedUid && roleChoices
    ? roleChoices.find(r => r.uid === selectedUid)
    : null

  const showRolePicker = roleChoices && !selectedUid

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      {/* Backdrop */}
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }} />

      {/* Card */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: 420,
        background: 'linear-gradient(180deg, rgba(18,10,32,0.96), rgba(10,8,20,0.98))',
        backdropFilter: 'blur(28px) saturate(1.5)', WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 24, padding: '34px 30px',
        boxShadow: '0 30px 90px rgba(0,0,0,0.65)',
      }}>
        {/* Close */}
        <button onClick={close} aria-label="Fermer" style={{
          position: 'absolute', top: 16, right: 16, width: 34, height: 34, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', cursor: 'pointer',
          color: 'rgba(255,255,255,0.5)', transition: 'all .18s ease',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>

        {/* Header */}
        <h2 style={{ fontFamily: FONT, fontSize: 25, fontWeight: 800, letterSpacing: '-0.6px', color: '#fff', margin: '0 0 8px' }}>
          Connexion requise
        </h2>
        {reason && stripEmoji(reason) && (
          <p style={{ fontFamily: FONT, fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, margin: '0 0 26px' }}>
            {stripEmoji(reason)}
          </p>
        )}

        {/* ── Role picker (multi-account) ── */}
        {showRolePicker ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)', margin: '0 0 2px' }}>
              Plusieurs espaces détectés — choisis&nbsp;:
            </p>
            {roleChoices.map(r => {
              const c = ROLE_COLORS[r.role] || '#8b5cf6'
              return (
                <button key={r.uid} onClick={() => setSelectedUid(r.uid)} style={{
                  padding: '15px 16px', borderRadius: 14, textAlign: 'left', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.025)', border: `1px solid ${c}55`,
                  display: 'flex', alignItems: 'center', gap: 13,
                }}>
                  <span style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontWeight: 800, fontSize: 16, color: '#04040b' }}>
                    {(ROLE_LABELS[r.role] || '?')[0]}
                  </span>
                  <div>
                    <p style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
                      {ROLE_LABELS[r.role] || r.role}
                    </p>
                    <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0' }}>
                      {r.name}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          /* ── Login form ── */
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Selected role badge */}
            {chosenAccount && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: 'rgba(255,255,255,0.04)', borderRadius: 12,
              }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: ROLE_COLORS[chosenAccount.role] || '#8b5cf6', flexShrink: 0 }} />
                <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: '#fff' }}>
                  {ROLE_LABELS[chosenAccount.role]}
                </span>
                <button type="button" onClick={() => setSelectedUid(null)} style={{
                  marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: 600, fontFamily: FONT,
                }}>
                  Changer
                </button>
              </div>
            )}

            <div>
              <label style={labelStyle}>Adresse email</label>
              <input
                type="email" value={email} required autoFocus
                placeholder="ton@email.com"
                onChange={e => { setEmail(e.target.value); setRoleChoices(null); setSelectedUid(null) }}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Mot de passe</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'} value={password} required
                  placeholder="Mot de passe"
                  onChange={e => setPassword(e.target.value)}
                  style={{ ...inputStyle, paddingRight: 60 }}
                />
                <button type="button" onClick={() => setShowPwd(v => !v)} style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: FONT, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.4)',
                }}>
                  {showPwd ? 'Cacher' : 'Voir'}
                </button>
              </div>
            </div>

            {error && (
              <p style={{ fontFamily: FONT, fontSize: 13, color: '#ff6b9d', lineHeight: 1.4, margin: 0 }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} style={{
              padding: '16px', borderRadius: 14,
              border: 'none',
              background: 'linear-gradient(135deg,#c8a96e,#e0c48a)', color: '#04040b',
              fontFamily: FONT, fontSize: 15, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
              boxShadow: '0 8px 26px rgba(200,169,110,0.32)',
            }}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        )}

        <div style={{ margin: '22px 0', height: 1, background: 'rgba(255,255,255,0.07)' }} />

        <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,0.45)', textAlign: 'center', margin: 0 }}>
          Pas encore de compte ?{' '}
          <button onClick={() => { close(); navigate('/connexion?mode=register') }} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: '#4ee8c8',
          }}>
            Créer un compte
          </button>
        </p>
      </div>
    </div>
  )
}
