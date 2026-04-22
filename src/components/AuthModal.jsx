import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getAllAccountsByEmail } from '../utils/accounts'
import { USE_REAL_FIREBASE } from '../firebase'

const dmMono = "'DM Mono', monospace"
const cormorant = "'Cormorant Garamond', serif"

const ROLE_LABELS = { client: 'Client', user: 'Client', organisateur: 'Organisateur', prestataire: 'Prestataire', agent: 'Admin' }
const ROLE_COLORS = { client: '#22c55e', user: '#22c55e', organisateur: '#3b82f6', prestataire: '#8b5cf6', agent: '#d4af37' }
const ROLE_ICONS  = { client: '🎫', user: '🎫', organisateur: '🎪', prestataire: '🎤', agent: '🔑' }

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
            setError('Erreur de connexion. Réessaie.')
          }
          setLoading(false)
          return
        }

        const snap = await getDoc(doc(db, 'users', cred.user.uid))
        const profile = snap.exists()
          ? snap.data()
          : { uid: cred.user.uid, name: cred.user.displayName || email.split('@')[0], email: cred.user.email, role: 'user', activeRole: 'user', enabledRoles: ['user'], status: 'active', emailVerified: true }

        if (profile.status === 'pending')  {
          setLoading(false)
          setUser(profile)
          close()
          navigate('/mon-dossier')
          return
        }
        if (profile.status === 'rejected') { setError('Compte rejeté. Contacte le support.'); setLoading(false); return }

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
        if (account.status === 'rejected') { setError('Compte rejeté. Contacte le support.'); setLoading(false); return }
        if (account.status === 'pending')  { setError('Compte en attente de validation.'); setLoading(false); return }
        if (account.password !== password) { setError('Mot de passe incorrect.'); setLoading(false); return }

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
        position: 'relative', width: '100%', maxWidth: 360,
        background: 'rgba(8,10,22,0.96)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 10, padding: '32px 28px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Close */}
        <button onClick={close} style={{
          position: 'absolute', top: 14, right: 14,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.3)', fontSize: 20, lineHeight: 1,
        }}>×</button>

        {/* Header */}
        <p style={{ fontFamily: cormorant, fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.90)', marginBottom: 6 }}>
          Connexion requise
        </p>
        {reason && (
          <p style={{ fontFamily: dmMono, fontSize: 9, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: 24 }}>
            {reason}
          </p>
        )}

        {/* ── Role picker (multi-account) ── */}
        {showRolePicker ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontFamily: dmMono, fontSize: 9, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
              PLUSIEURS ESPACES DÉTECTÉS — CHOISISSEZ :
            </p>
            {roleChoices.map(r => (
              <button key={r.uid} onClick={() => setSelectedUid(r.uid)} style={{
                padding: '13px 16px', borderRadius: 6, textAlign: 'left', cursor: 'pointer',
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${ROLE_COLORS[r.role] || 'rgba(255,255,255,0.12)'}44`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: 18 }}>{ROLE_ICONS[r.role] || '🎫'}</span>
                <div>
                  <p style={{ fontFamily: dmMono, fontSize: 11, color: ROLE_COLORS[r.role] || 'rgba(255,255,255,0.7)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
                    {ROLE_LABELS[r.role] || r.role}
                  </p>
                  <p style={{ fontFamily: dmMono, fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 3, marginBottom: 0 }}>
                    {r.name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          /* ── Login form ── */
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Selected role badge */}
            {chosenAccount && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                background: 'rgba(255,255,255,0.04)', borderRadius: 4, marginBottom: 2,
              }}>
                <span style={{ fontSize: 14 }}>{ROLE_ICONS[chosenAccount.role]}</span>
                <span style={{ fontFamily: dmMono, fontSize: 10, color: `${ROLE_COLORS[chosenAccount.role]}cc`, letterSpacing: '0.08em' }}>
                  {ROLE_LABELS[chosenAccount.role]}
                </span>
                <button type="button" onClick={() => setSelectedUid(null)} style={{
                  marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: dmMono,
                }}>
                  changer
                </button>
              </div>
            )}

            <div>
              <label style={{ fontFamily: dmMono, fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 6 }}>
                ADRESSE EMAIL
              </label>
              <input
                type="email" value={email} required autoFocus
                placeholder="ton@email.com"
                onChange={e => { setEmail(e.target.value); setRoleChoices(null); setSelectedUid(null) }}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 4, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.88)', fontFamily: dmMono, fontSize: 12, outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontFamily: dmMono, fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 6 }}>
                MOT DE PASSE
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'} value={password} required
                  placeholder="Mot de passe"
                  onChange={e => setPassword(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 44px 10px 12px', borderRadius: 4, boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.88)', fontFamily: dmMono, fontSize: 12, outline: 'none',
                  }}
                />
                <button type="button" onClick={() => setShowPwd(v => !v)} style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: dmMono, fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em',
                }}>
                  {showPwd ? 'CACHER' : 'VOIR'}
                </button>
              </div>
            </div>

            {error && (
              <p style={{ fontFamily: dmMono, fontSize: 10, color: 'rgba(220,100,100,0.9)', letterSpacing: '0.06em', margin: 0 }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} style={{
              padding: '12px', borderRadius: 4,
              border: '1px solid rgba(200,169,110,0.35)',
              background: 'rgba(200,169,110,0.08)', color: '#c8a96e',
              fontFamily: dmMono, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
            }}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        )}

        <div style={{ margin: '20px 0', height: 1, background: 'rgba(255,255,255,0.06)' }} />

        <p style={{ fontFamily: dmMono, fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textAlign: 'center' }}>
          Pas encore de compte ?{' '}
          <button onClick={() => { close(); navigate('/connexion?mode=register') }} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: dmMono, fontSize: 9, color: '#4ee8c8', letterSpacing: '0.08em', textDecoration: 'underline',
          }}>
            Créer un compte
          </button>
        </p>
      </div>
    </div>
  )
}
