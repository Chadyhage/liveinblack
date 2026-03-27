import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { USE_REAL_FIREBASE } from '../firebase'
import {
  saveAccount, getAccountByEmail, addPendingValidation,
  checkPasswordStrength, validatePassword, ROLES, PRESTATAIRE_TYPES,
} from '../utils/accounts'

// ─── Auth adapters ────────────────────────────────────────────────────────

async function doEmailLogin(email, password) {
  if (!USE_REAL_FIREBASE) {
    const saved = getAccountByEmail(email)
    if (saved && saved.password === password) {
      if (saved.status === 'pending') throw { code: 'auth/account-pending', role: saved.role }
      if (saved.status === 'rejected') throw { code: 'auth/account-rejected' }
      return saved
    }
    if (!saved) throw { code: 'auth/user-not-found' }
    throw { code: 'auth/wrong-password' }
  }
  const { signInWithEmailAndPassword } = await import('firebase/auth')
  const { auth, db } = await import('../firebase')
  const { doc, getDoc } = await import('firebase/firestore')
  const cred = await signInWithEmailAndPassword(auth, email, password)
  // Block login if email not verified (except super admin)
  if (!cred.user.emailVerified && email.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
    throw { code: 'auth/email-not-verified' }
  }
  const snap = await getDoc(doc(db, 'users', cred.user.uid))
  if (snap.exists()) {
    const profile = snap.data()
    if (profile.status === 'pending') throw { code: 'auth/account-pending', role: profile.role }
    if (profile.status === 'rejected') throw { code: 'auth/account-rejected' }
    return profile
  }
  return { uid: cred.user.uid, name: cred.user.displayName || email.split('@')[0], email: cred.user.email, role: 'user', status: 'active' }
}

const SUPER_ADMIN_EMAIL = 'hagechady4@gmail.com'

async function doEmailRegister(data) {
  const { email, password, name, phone, role, prestataireType } = data
  if (!USE_REAL_FIREBASE) {
    const existing = getAccountByEmail(email)
    if (existing) throw { code: 'auth/email-already-in-use' }
    const uid = 'local-' + Date.now()
    const isAgent = role === 'agent'
    const isPrest = role === 'prestataire'
    // Super admin email is always approved instantly, whatever the role
    const isSuperAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
    const needsValidation = (isAgent || isPrest) && !isSuperAdmin
    const user = {
      uid, name, email, phone,
      password,
      role: isSuperAdmin ? 'agent' : role, // super admin is always agent
      prestataireType: isPrest ? prestataireType : null,
      status: needsValidation ? 'pending' : 'active',
      createdAt: Date.now(),
    }
    if (needsValidation) {
      addPendingValidation(user)
    }
    saveAccount(user)
    return user
  }
  const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth')
  const { auth, db } = await import('../firebase')
  const { doc, setDoc } = await import('firebase/firestore')
  const isSuperAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
  const isAgent = role === 'agent'
  const isPrest = role === 'prestataire'
  const needsValidation = (isAgent || isPrest) && !isSuperAdmin
  const finalRole = isSuperAdmin ? 'agent' : role
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  if (name) await updateProfile(cred.user, { displayName: name })
  // Send email verification (skip for super admin)
  if (!isSuperAdmin) {
    const { sendEmailVerification } = await import('firebase/auth')
    await sendEmailVerification(cred.user)
  }
  const userObj = {
    uid: cred.user.uid, name, email, phone,
    role: finalRole,
    prestataireType: isPrest ? prestataireType : null,
    status: needsValidation ? 'pending' : 'active',
    createdAt: Date.now(),
  }
  await setDoc(doc(db, 'users', cred.user.uid), userObj)
  if (needsValidation) {
    await setDoc(doc(db, 'pending_validations', cred.user.uid), { ...userObj, requestedAt: Date.now() })
  }
  return isSuperAdmin ? userObj : { ...userObj, _needsEmailVerification: true }
}

async function doGoogleLogin() {
  if (!USE_REAL_FIREBASE) {
    const uid = 'google-demo'
    const user = { uid, name: 'Utilisateur Google', email: 'demo@gmail.com', role: 'user', status: 'active', createdAt: Date.now() }
    saveAccount(user)
    return user
  }
  const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth')
  const { auth } = await import('../firebase')
  const cred = await signInWithPopup(auth, new GoogleAuthProvider())
  return { uid: cred.user.uid, name: cred.user.displayName, email: cred.user.email, photo: cred.user.photoURL, role: 'user', status: 'active' }
}

async function doAppleLogin() {
  if (!USE_REAL_FIREBASE) {
    const uid = 'apple-demo'
    const user = { uid, name: 'Utilisateur Apple', email: 'demo@icloud.com', role: 'user', status: 'active', createdAt: Date.now() }
    saveAccount(user)
    return user
  }
  const { signInWithPopup, OAuthProvider } = await import('firebase/auth')
  const { auth } = await import('../firebase')
  const provider = new OAuthProvider('apple.com')
  provider.addScope('email')
  provider.addScope('name')
  const cred = await signInWithPopup(auth, provider)
  const name = cred.user.displayName || cred.user.email?.split('@')[0] || 'Utilisateur Apple'
  return { uid: cred.user.uid, name, email: cred.user.email, photo: cred.user.photoURL, role: 'user', status: 'active' }
}

// ─── Country dial codes ───────────────────────────────────────────────────

const COUNTRY_CODES = [
  { code: 'FR', dial: '+33',  flag: '🇫🇷', name: 'France' },
  { code: 'BE', dial: '+32',  flag: '🇧🇪', name: 'Belgique' },
  { code: 'CH', dial: '+41',  flag: '🇨🇭', name: 'Suisse' },
  { code: 'LU', dial: '+352', flag: '🇱🇺', name: 'Luxembourg' },
  { code: 'MC', dial: '+377', flag: '🇲🇨', name: 'Monaco' },
  { code: 'MA', dial: '+212', flag: '🇲🇦', name: 'Maroc' },
  { code: 'DZ', dial: '+213', flag: '🇩🇿', name: 'Algérie' },
  { code: 'TN', dial: '+216', flag: '🇹🇳', name: 'Tunisie' },
  { code: 'LB', dial: '+961', flag: '🇱🇧', name: 'Liban' },
  { code: 'SN', dial: '+221', flag: '🇸🇳', name: 'Sénégal' },
  { code: 'CI', dial: '+225', flag: '🇨🇮', name: "Côte d'Ivoire" },
  { code: 'CM', dial: '+237', flag: '🇨🇲', name: 'Cameroun' },
  { code: 'TG', dial: '+228', flag: '🇹🇬', name: 'Togo' },
  { code: 'NE', dial: '+227', flag: '🇳🇪', name: 'Niger' },
  { code: 'BJ', dial: '+229', flag: '🇧🇯', name: 'Bénin' },
  { code: 'GH', dial: '+233', flag: '🇬🇭', name: 'Ghana' },
  { code: 'NG', dial: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { code: 'CD', dial: '+243', flag: '🇨🇩', name: 'Congo (RDC)' },
  { code: 'CG', dial: '+242', flag: '🇨🇬', name: 'Congo (Brazzaville)' },
  { code: 'GA', dial: '+241', flag: '🇬🇦', name: 'Gabon' },
  { code: 'GB', dial: '+44',  flag: '🇬🇧', name: 'Royaume-Uni' },
  { code: 'DE', dial: '+49',  flag: '🇩🇪', name: 'Allemagne' },
  { code: 'ES', dial: '+34',  flag: '🇪🇸', name: 'Espagne' },
  { code: 'IT', dial: '+39',  flag: '🇮🇹', name: 'Italie' },
  { code: 'PT', dial: '+351', flag: '🇵🇹', name: 'Portugal' },
  { code: 'US', dial: '+1',   flag: '🇺🇸', name: 'États-Unis' },
  { code: 'CA', dial: '+1',   flag: '🇨🇦', name: 'Canada' },
]

// ─── Component ─────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [regStep, setRegStep] = useState(1)  // 1 = choose role, 2 = fill form

  // Login fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  // Register fields
  const [regRole, setRegRole] = useState(null)
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regDialCode, setRegDialCode] = useState('+33')
  const [showDialPicker, setShowDialPicker] = useState(false)
  const [regPrestType, setRegPrestType] = useState('')
  const [regPwd, setRegPwd] = useState('')
  const [regPwdConfirm, setRegPwdConfirm] = useState('')
  const [showRegPwd, setShowRegPwd] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [unverifiedEmail, setUnverifiedEmail] = useState('') // email not yet verified
  const [resendSent, setResendSent] = useState(false)
  const [pendingInfo, setPendingInfo] = useState(null) // { role } — account waiting validation

  const { setUser } = useAuth()
  const navigate = useNavigate()

  const pwdStrength = checkPasswordStrength(regPwd)
  const pwdErrors = validatePassword(regPwd)

  // ── Login ──
  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const userData = await doEmailLogin(email, password)
      setUser(userData)
      navigate(userData.role === 'agent' ? '/agent' : '/accueil')
    } catch (err) {
      if (err.code === 'auth/account-pending') {
        setPendingInfo({ role: err.role })
      } else if (err.code === 'auth/email-not-verified') {
        setUnverifiedEmail(email)
      } else if (
        (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') &&
        email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
      ) {
        // Super admin hasn't created their account yet → switch to registration pre-filled
        setMode('register')
        setRegStep(2)
        setRegRole('agent')
        setRegEmail(email)
        setError("Ton compte admin n'existe pas encore. Choisis un mot de passe pour le créer.")
      } else {
        setError(getFirebaseError(err.code))
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Register ──
  async function handleRegister(e) {
    e.preventDefault()
    setError('')

    // Validate
    if (!regName.trim()) { setError('Le nom est requis.'); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(regEmail)) { setError('Adresse email invalide.'); return }
    const phoneRegex = /^(\+?\d[\d\s\-]{7,})$/
    if (!phoneRegex.test(regPhone.replace(/\s/g, ''))) { setError('Numéro de téléphone invalide.'); return }
    const pwdErrs = validatePassword(regPwd)
    if (pwdErrs.length > 0) { setError(pwdErrs[0]); return }
    if (regPwd !== regPwdConfirm) { setError('Les mots de passe ne correspondent pas.'); return }
    if (regRole === 'prestataire' && !regPrestType) { setError('Sélectionne ton type de service.'); return }

    setLoading(true)
    try {
      const userData = await doEmailRegister({
        email: regEmail, password: regPwd,
        name: regName.trim(), phone: (regDialCode + ' ' + regPhone.trim()).trim(),
        role: regRole, prestataireType: regPrestType,
      })
      if (userData.status === 'pending') {
        setPendingInfo({ role: userData.role })
      } else if (userData._needsEmailVerification) {
        setUnverifiedEmail(regEmail)
      } else {
        setUser(userData)
        navigate('/accueil')
      }
    } catch (err) {
      setError(getFirebaseError(err.code))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError('')
    setLoading(true)
    try {
      const userData = await doGoogleLogin()
      setUser(userData)
      navigate('/accueil')
    } catch (err) {
      setError(getFirebaseError(err.code))
    } finally {
      setLoading(false)
    }
  }

  async function handleApple() {
    setError('')
    setLoading(true)
    try {
      const userData = await doAppleLogin()
      setUser(userData)
      navigate('/accueil')
    } catch (err) {
      setError(getFirebaseError(err.code))
    } finally {
      setLoading(false)
    }
  }

  // ── Real password reset ──
  async function handleSendReset() {
    if (!resetEmail) return
    setResetLoading(true)
    setResetError('')
    try {
      const { sendPasswordResetEmail } = await import('firebase/auth')
      const { auth } = await import('../firebase')
      await sendPasswordResetEmail(auth, resetEmail)
      setResetSent(true)
    } catch (err) {
      setResetError(getFirebaseError(err.code))
    } finally {
      setResetLoading(false)
    }
  }

  // ── Resend verification email ──
  async function handleResendVerification() {
    setResendSent(false)
    try {
      const { auth } = await import('../firebase')
      if (auth.currentUser) {
        const { sendEmailVerification } = await import('firebase/auth')
        await sendEmailVerification(auth.currentUser)
        setResendSent(true)
      }
    } catch {}
  }

  // ── "Email not verified" screen ──
  if (unverifiedEmail) {
    return (
      <div className="relative min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <div className="absolute inset-0 corridor-bg" />
        <div className="relative z-10 glass p-8 rounded-3xl text-center max-w-sm w-full space-y-4">
          <div className="text-5xl mb-2">📧</div>
          <h2 className="text-white font-black text-xl">Vérifie ton email</h2>
          <p className="text-gray-400 text-sm">
            Un lien de confirmation a été envoyé à <span className="text-white font-semibold">{unverifiedEmail}</span>.
          </p>
          <div className="text-left bg-[#1a1a1a] rounded-xl p-3 space-y-1.5">
            <p className="text-gray-300 text-xs font-semibold">Comment ça marche :</p>
            <p className="text-gray-500 text-xs">① Ouvre ta boîte mail</p>
            <p className="text-gray-500 text-xs">② Cherche un email de <span className="text-gray-300">noreply@liveinblack-15d30.firebaseapp.com</span></p>
            <p className="text-gray-500 text-xs">③ Clique sur le lien dans cet email</p>
            <p className="text-gray-500 text-xs">④ Reviens ici et connecte-toi</p>
          </div>
          <p className="text-gray-600 text-[10px]">L'email peut arriver dans les spams / courriers indésirables.</p>
          {resendSent && <p className="text-green-400 text-xs">Email renvoyé ✓</p>}
          <button onClick={handleResendVerification} className="w-full text-[#d4af37] text-xs hover:underline">
            Renvoyer l'email
          </button>
          <button
            onClick={() => {
              const savedEmail = unverifiedEmail
              setUnverifiedEmail('')
              setMode('login')
              setEmail(savedEmail)
              setError('Email vérifié ? Entre ton mot de passe pour te connecter.')
            }}
            className="btn-gold w-full mt-2"
          >
            J'ai cliqué sur le lien → Me connecter
          </button>
        </div>
      </div>
    )
  }

  // ── "Account pending validation" screen ──
  if (pendingInfo) {
    const roleLabel = ROLES[pendingInfo.role]?.label || pendingInfo.role
    return (
      <div className="relative min-h-screen bg-black flex flex-col items-center justify-center px-6">
        <div className="absolute inset-0 corridor-bg" />
        <div className="relative z-10 glass p-8 rounded-3xl text-center max-w-sm w-full space-y-4">
          <div className="text-5xl mb-2">⏳</div>
          <h2 className="text-white font-black text-xl">Validation en cours</h2>
          <p className="text-gray-400 text-sm">
            Ton compte <span className="text-[#d4af37] font-semibold">{roleLabel}</span> est en attente de validation par l'équipe LIVEINBLACK.
          </p>
          <p className="text-gray-600 text-xs">Tu recevras une confirmation dès que ton compte sera activé. Cela prend généralement moins de 24h.</p>
          <button
            onClick={() => { setPendingInfo(null); setMode('login') }}
            className="btn-gold w-full mt-2"
          >
            Retour à la connexion
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black flex flex-col">
      {/* Background */}
      <div className="absolute inset-0 corridor-bg" />
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 bottom-0 left-0" style={{ width: '28%', background: 'linear-gradient(to right, #0a0a0a, #111)', clipPath: 'polygon(0 0, 100% 15%, 100% 85%, 0 100%)' }} />
        <div className="absolute top-0 bottom-0 right-0" style={{ width: '28%', background: 'linear-gradient(to left, #0a0a0a, #111)', clipPath: 'polygon(0 15%, 100% 0, 100% 100%, 0 85%)' }} />
        <div className="absolute top-0 left-0 right-0" style={{ height: '18%', background: 'linear-gradient(to bottom, #050505, #111)', clipPath: 'polygon(0 0, 100% 0, 85% 100%, 15% 100%)' }} />
        <div className="absolute bottom-0 left-0 right-0" style={{ height: '22%', background: 'linear-gradient(to top, #050505, #0d0d0d)', clipPath: 'polygon(15% 0, 85% 0, 100% 100%, 0 100%)' }} />
      </div>

      {/* Hooded Figure */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: mode === 'register' && regStep === 2 ? 0 : 1, transition: 'opacity 0.3s' }}>
        <div style={{ animation: 'walkToward 3s ease-in-out infinite' }}>
          <svg width="140" height="270" viewBox="0 0 160 300" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 0 30px rgba(0,0,0,0.9))' }}>
            <ellipse cx="80" cy="210" rx="42" ry="80" fill="#0d0d0d" />
            <ellipse cx="80" cy="140" rx="50" ry="20" fill="#0f0f0f" />
            <ellipse cx="80" cy="100" rx="44" ry="50" fill="#111" />
            <ellipse cx="80" cy="108" rx="28" ry="35" fill="#060606" />
            <ellipse cx="80" cy="112" rx="20" ry="24" fill="#0e0e0e" />
            <ellipse cx="72" cy="108" rx="3" ry="2" fill="#1a1a1a" opacity="0.8" />
            <ellipse cx="88" cy="108" rx="3" ry="2" fill="#1a1a1a" opacity="0.8" />
            <path d="M 36 95 Q 80 60 124 95" stroke="#1a1a1a" strokeWidth="3" fill="none" />
            <line x1="80" y1="155" x2="70" y2="280" stroke="#0f0f0f" strokeWidth="2" opacity="0.5" />
            <line x1="80" y1="155" x2="90" y2="280" stroke="#0f0f0f" strokeWidth="2" opacity="0.5" />
          </svg>
        </div>
      </div>

      {/* Logo */}
      <div className="relative z-10 pt-10 pb-4 text-center">
        <h1 className="text-4xl text-white tracking-[0.3em] uppercase" style={{ fontFamily: 'Bebas Neue, sans-serif', textShadow: '0 0 30px rgba(212,175,55,0.3)' }}>
          LIVE<span className="text-[#d4af37]">IN</span>BLACK
        </h1>
        <p className="text-gray-600 text-xs tracking-widest mt-1 uppercase">La Marketplace de l'Événementiel</p>
      </div>

      {/* Form */}
      <div className="relative z-10 mt-auto md:my-auto px-6 pb-10 md:pb-16 md:w-full md:max-w-sm md:mx-auto">
        <div className="glass p-6 rounded-3xl">

          {/* ── Mode tabs ── */}
          <div className="flex rounded-xl overflow-hidden mb-6 border border-[#222]">
            <button onClick={() => { setMode('login'); setRegStep(1); setError('') }}
              className={`flex-1 py-2.5 text-sm font-semibold transition-all ${mode === 'login' ? 'bg-[#d4af37] text-black' : 'text-gray-500 hover:text-white'}`}>
              Connexion
            </button>
            <button onClick={() => { setMode('register'); setRegStep(1); setError('') }}
              className={`flex-1 py-2.5 text-sm font-semibold transition-all ${mode === 'register' ? 'bg-[#d4af37] text-black' : 'text-gray-500 hover:text-white'}`}>
              Inscription
            </button>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs text-center">
              {error}
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              LOGIN FORM
          ══════════════════════════════════════════════════ */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3">
              <input className="input-dark" type="email" placeholder="Email" required
                value={email} onChange={e => setEmail(e.target.value)} />
              <div className="relative">
                <input className="input-dark pr-12" type={showPwd ? 'text' : 'password'}
                  placeholder="Mot de passe" required
                  value={password} onChange={e => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 text-xs">
                  {showPwd ? 'Cacher' : 'Voir'}
                </button>
              </div>
              <button type="submit" disabled={loading} className="btn-gold w-full mt-2 disabled:opacity-60">
                {loading ? <Spinner text="Connexion..." /> : 'Se connecter'}
              </button>
            </form>
          )}

          {mode === 'login' && (
            <button type="button" onClick={() => { setResetEmail(email); setResetSent(false); setShowResetModal(true) }}
              className="w-full text-center text-gray-600 text-xs mt-2 hover:text-gray-400 transition-colors">
              Mot de passe oublié ?
            </button>
          )}

          {/* ══════════════════════════════════════════════════
              REGISTER — STEP 1: Choose role
          ══════════════════════════════════════════════════ */}
          {mode === 'register' && regStep === 1 && (
            <div className="space-y-3">
              <p className="text-gray-400 text-xs text-center mb-4">Quel type de compte veux-tu créer ?</p>
              {[
                { role: 'user',         icon: '👤', title: 'Utilisateur',  desc: 'Découvre des événements, réserve, vote' },
                { role: 'prestataire',  icon: '🎤', title: 'Prestataire',  desc: 'DJ, salle, matériel, traiteur...' },
                { role: 'organisateur', icon: '🎪', title: 'Organisateur', desc: 'Crée et gère tes propres événements' },
                { role: 'agent',        icon: '🔑', title: 'Agent',        desc: 'Administration — validation requise' },
              ].map(({ role, icon, title, desc }) => (
                <button key={role} type="button"
                  onClick={() => { setRegRole(role); setRegStep(2) }}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left hover:scale-[1.01] active:scale-[0.99]"
                  style={{ borderColor: regRole === role ? '#d4af37' : '#222', background: regRole === role ? 'rgba(212,175,55,0.08)' : 'transparent' }}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-xl flex-shrink-0">{icon}</div>
                  <div>
                    <p className="text-white font-semibold text-sm">{title}</p>
                    <p className="text-gray-600 text-xs">{desc}</p>
                  </div>
                  <span className="ml-auto text-gray-600">›</span>
                </button>
              ))}
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              REGISTER — STEP 2: Fill form
          ══════════════════════════════════════════════════ */}
          {mode === 'register' && regStep === 2 && (
            <form onSubmit={handleRegister} className="space-y-3">
              {/* Back + role badge */}
              <div className="flex items-center gap-2 mb-1">
                <button type="button" onClick={() => { setRegStep(1); setError('') }}
                  className="text-gray-600 hover:text-white text-sm">← Retour</button>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-[#333] text-gray-400 capitalize">
                  {ROLES[regRole]?.icon} {ROLES[regRole]?.label}
                </span>
              </div>

              {/* Agent warning */}
              {regRole === 'agent' && (
                <div className="p-3 bg-[#d4af37]/10 border border-[#d4af37]/30 rounded-xl">
                  <p className="text-[#d4af37] text-xs font-semibold">Compte Agent</p>
                  <p className="text-gray-500 text-[10px] mt-0.5">Ton compte sera soumis à validation. Tu recevras une confirmation sous 24h.</p>
                </div>
              )}

              <input className="input-dark" type="text" placeholder="Prénom & nom" required
                value={regName} onChange={e => setRegName(e.target.value)} />
              <input className="input-dark" type="email" placeholder="Adresse email" required
                value={regEmail} onChange={e => setRegEmail(e.target.value)} />
              {/* Phone with country code picker */}
              <div className="relative flex gap-2">
                {/* Dial code button */}
                <div className="relative">
                  <button type="button"
                    onClick={() => setShowDialPicker(v => !v)}
                    className="input-dark flex items-center gap-1.5 px-3 whitespace-nowrap text-sm min-w-[80px]">
                    <span>{COUNTRY_CODES.find(c => c.dial === regDialCode)?.flag || '🌍'}</span>
                    <span className="text-gray-300">{regDialCode}</span>
                    <span className="text-gray-600 text-[10px]">▾</span>
                  </button>
                  {showDialPicker && (
                    <div className="absolute top-full left-0 mt-1 z-50 bg-[#111] border border-[#333] rounded-xl shadow-xl max-h-52 overflow-y-auto w-56">
                      {COUNTRY_CODES.map(c => (
                        <button key={c.code + c.dial} type="button"
                          onClick={() => { setRegDialCode(c.dial); setShowDialPicker(false) }}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[#1a1a1a] transition-colors text-left ${regDialCode === c.dial && COUNTRY_CODES.find(x => x.dial === regDialCode)?.code === c.code ? 'text-[#d4af37]' : 'text-gray-300'}`}>
                          <span className="text-base">{c.flag}</span>
                          <span className="flex-1 text-xs">{c.name}</span>
                          <span className="text-gray-500 text-xs">{c.dial}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input className="input-dark flex-1" type="tel" placeholder="Numéro de téléphone" required
                  value={regPhone} onChange={e => setRegPhone(e.target.value)} />
              </div>

              {/* Prestataire type */}
              {regRole === 'prestataire' && (
                <div className="grid grid-cols-2 gap-2">
                  {PRESTATAIRE_TYPES.map(t => (
                    <button key={t.key} type="button"
                      onClick={() => setRegPrestType(t.key)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs transition-all ${regPrestType === t.key ? 'border-[#d4af37]/60 bg-[#d4af37]/10 text-white' : 'border-[#222] text-gray-500'}`}>
                      <span className="text-base">{t.icon}</span>
                      <span className="text-left leading-tight">{t.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Password */}
              <div className="relative">
                <input className="input-dark pr-12" type={showRegPwd ? 'text' : 'password'}
                  placeholder="Mot de passe" required
                  value={regPwd} onChange={e => setRegPwd(e.target.value)} />
                <button type="button" onClick={() => setShowRegPwd(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 text-xs">
                  {showRegPwd ? 'Cacher' : 'Voir'}
                </button>
              </div>

              {/* Password strength */}
              {regPwd.length > 0 && (
                <div className="space-y-1.5 -mt-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="flex-1 h-1 rounded-full transition-all"
                        style={{ background: i <= pwdStrength.score ? pwdStrength.color : '#222' }} />
                    ))}
                  </div>
                  <p className="text-[10px]" style={{ color: pwdStrength.color }}>{pwdStrength.label}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {[
                      { ok: regPwd.length >= 8, text: '8 caractères min.' },
                      { ok: /[A-Z]/.test(regPwd), text: 'Une majuscule' },
                      { ok: /[0-9]/.test(regPwd), text: 'Un chiffre' },
                    ].map(r => (
                      <span key={r.text} className="text-[10px]" style={{ color: r.ok ? '#22c55e' : '#4b5563' }}>
                        {r.ok ? '✓' : '○'} {r.text}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <input className="input-dark" type="password" placeholder="Confirmer le mot de passe" required
                value={regPwdConfirm} onChange={e => setRegPwdConfirm(e.target.value)} />
              {regPwdConfirm && regPwd !== regPwdConfirm && (
                <p className="text-red-400 text-[10px] -mt-1">Les mots de passe ne correspondent pas</p>
              )}

              <button type="submit" disabled={loading} className="btn-gold w-full mt-2 disabled:opacity-60">
                {loading ? <Spinner text="Création..." /> : regRole === 'agent' ? 'Soumettre la demande' : 'Créer mon compte'}
              </button>
            </form>
          )}

          {/* ── OAuth (login mode only) ── */}
          {mode === 'login' && (
            <div className="mt-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-[#222]" />
                <span className="text-gray-600 text-xs">ou continuer avec</span>
                <div className="flex-1 h-px bg-[#222]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleGoogle} disabled={loading}
                  className="flex items-center justify-center gap-2 border border-[#222] rounded-xl py-2.5 text-sm text-gray-400 hover:border-white/20 hover:text-white transition-all disabled:opacity-50">
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </button>
                <button onClick={handleApple} disabled={loading}
                  className="flex items-center justify-center gap-2 border border-[#222] rounded-xl py-2.5 text-sm text-gray-400 hover:border-white/20 hover:text-white transition-all disabled:opacity-50">
                  <svg width="16" height="16" viewBox="0 0 814 1000" fill="currentColor">
                    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 383.8 1 261 1 148.9 1 78.7 25.4 12.7 73.5-21.3c43.7-31.1 93.1-47.1 145.3-47.1 82.8 0 138.4 44.7 186.7 44.7 46.5 0 119.5-47.4 215.8-47.4zm-97.5-161.1c-5.8 27.5-28.9 75.3-73.7 113.5-47.8 40.8-99.4 61-150.2 61-5.8 0-11.6-.6-17.4-1.3 0-3.8-.6-7.7-.6-12.2 0-26.3 7.1-74.1 47.8-115 40.8-40.8 100.2-68 152.7-68 5.8 0 11.6.6 17.4 1.3-.6 7.1-.6 14.8-.6 20.7z"/>
                  </svg>
                  Apple
                </button>
              </div>
            </div>
          )}

          {mode === 'register' && regStep === 1 && (
            <p className="text-center text-gray-700 text-[10px] mt-4">
              En t'inscrivant tu acceptes nos{' '}
              <span className="text-gray-500 underline cursor-pointer" onClick={() => navigate('/cgu')}>CGU</span> et notre{' '}
              <span className="text-gray-500 underline cursor-pointer" onClick={() => navigate('/cgu')}>Politique de confidentialité</span>
            </p>
          )}
        </div>
      </div>

      {/* ── Reset password modal ── */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowResetModal(false)} />
          <div className="relative glass rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-white font-bold">Mot de passe oublié</h3>
            {!resetSent ? (
              <>
                <p className="text-gray-400 text-sm">Entre ton adresse email et on t'envoie un lien de réinitialisation.</p>
                <input className="input-dark" type="email" placeholder="ton@email.com"
                  value={resetEmail} onChange={e => { setResetEmail(e.target.value); setResetError('') }} />
                {resetError && <p className="text-red-400 text-xs">{resetError}</p>}
                <button onClick={handleSendReset} disabled={resetLoading} className="btn-gold w-full disabled:opacity-60">
                  {resetLoading ? <Spinner text="Envoi..." /> : 'Envoyer'}
                </button>
                <button onClick={() => setShowResetModal(false)} className="w-full text-center text-gray-600 text-xs hover:text-gray-400 transition-colors">Annuler</button>
              </>
            ) : (
              <div className="text-center py-4 space-y-3">
                <p className="text-4xl">📧</p>
                <p className="text-green-400 font-semibold text-sm">Email envoyé !</p>
                <p className="text-gray-400 text-xs">Un lien a été envoyé à <span className="text-white">{resetEmail}</span>.</p>
                <button onClick={() => setShowResetModal(false)} className="btn-gold w-full">Fermer</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Spinner helper ─────────────────────────────────────────────────────────
function Spinner({ text }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
      {text}
    </span>
  )
}

// ── Firebase error messages ────────────────────────────────────────────────
function getFirebaseError(code) {
  const messages = {
    'auth/user-not-found': 'Aucun compte associé à cet email.',
    'auth/wrong-password': 'Mot de passe incorrect. Rappel : le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre.',
    'auth/invalid-credential': 'Email ou mot de passe incorrect. Rappel : au moins 8 caractères, une majuscule et un chiffre.',
    'auth/email-already-in-use': 'Cet email est déjà utilisé.',
    'auth/weak-password': 'Le mot de passe est trop faible. Il doit contenir au moins 8 caractères, une majuscule et un chiffre.',
    'auth/invalid-email': 'Adresse email invalide.',
    'auth/too-many-requests': 'Trop de tentatives. Réessaie dans quelques minutes.',
    'auth/popup-closed-by-user': 'Connexion annulée.',
    'auth/cancelled-popup-request': 'Connexion annulée.',
    'auth/apple-signin-failed': 'Connexion Apple échouée. Réessaie.',
    'auth/network-request-failed': 'Erreur réseau. Vérifie ta connexion.',
    'auth/account-rejected': 'Ton compte a été refusé. Contacte le support.',
    'auth/email-not-verified': 'Email non vérifié. Consulte ta boîte mail.',
  }
  return messages[code] || 'Une erreur est survenue. Réessaie.'
}
