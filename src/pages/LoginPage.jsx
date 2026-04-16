import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { USE_REAL_FIREBASE } from '../firebase'
import {
  saveAccount, getAccountByEmail, getAllAccountsByEmail, getAccountByEmailAndRole,
  addPendingValidation, checkPasswordStrength, validatePassword, ROLES, PRESTATAIRE_TYPES,
  requestAdditionalRole, getAccountByPhone, updateAccount, deleteAccount,
} from '../utils/accounts'

// ─── Auth adapters ────────────────────────────────────────────────────────

// role = null means single-account login (old behaviour), role = 'organisateur' etc = targeted
async function doEmailLogin(email, password, role = null) {
  if (!USE_REAL_FIREBASE) {
    const saved = role
      ? getAccountByEmailAndRole(email, role)
      : getAccountByEmail(email)
    if (!saved) throw { code: 'auth/user-not-found' }
    // Check status before password
    if (saved.status === 'rejected') throw { code: 'auth/account-rejected' }
    // pending → allow login, the app will redirect to /mon-dossier via OnboardingGuard
    if (saved.status !== 'pending' && saved.password !== password) throw { code: 'auth/wrong-password' }
    if (saved.status === 'pending' && saved.password && saved.password !== password) throw { code: 'auth/wrong-password' }
    // Mark email as verified on first successful login
    if (!saved.emailVerified) {
      updateAccount(saved.uid, { emailVerified: true })
      return { ...saved, emailVerified: true }
    }
    return saved
  }
  const { signInWithEmailAndPassword } = await import('firebase/auth')
  const { auth, db } = await import('../firebase')
  const { doc, getDoc } = await import('firebase/firestore')
  const cred = await signInWithEmailAndPassword(auth, email, password)
  const isSuperAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
  // Read Firestore profile BEFORE the email-verification check.
  // Organisateur/prestataire accounts are created silently during onboarding (no verification email sent).
  // They must be allowed to log in so OnboardingGuard can redirect them to /mon-dossier.
  const snap = await getDoc(doc(db, 'users', cred.user.uid))
  if (snap.exists()) {
    let profile = snap.data()
    const isPendingOrDraft = profile.status === 'pending' || profile.status === 'draft'
    // Organisateurs and prestataires never receive a verification email —
    // their account is verified by the admin validation process instead.
    // So skip the emailVerified check entirely for these roles (at any status).
    const isOrgOrPrest = profile.role === 'organisateur' || profile.role === 'prestataire'
    if (!cred.user.emailVerified && !isSuperAdmin && !isPendingOrDraft && !isOrgOrPrest) {
      throw { code: 'auth/email-not-verified' }
    }
    if (!isSuperAdmin) {
      // pending / draft → allow login, OnboardingGuard handles redirect to /mon-dossier or /inscription
      if (profile.status === 'rejected') throw { code: 'auth/account-rejected' }
    }
    // Force agent role for super admin — override any corrupted data in Firestore
    if (isSuperAdmin) {
      const { updateDoc } = await import('firebase/firestore')
      const agentPatch = {
        role: 'agent', activeRole: 'agent', enabledRoles: ['agent'],
        email: cred.user.email,
        name: profile.name || cred.user.displayName || 'Admin',
        emailVerified: true, status: 'active',
      }
      updateDoc(doc(db, 'users', cred.user.uid), agentPatch).catch(() => {})
      return { ...profile, ...agentPatch, uid: cred.user.uid }
    }
    // Email was verified by Firebase — persist that flag so phone is now "locked"
    if (!profile.emailVerified) {
      const { updateDoc } = await import('firebase/firestore')
      await updateDoc(doc(db, 'users', cred.user.uid), { emailVerified: true })
      return { ...profile, emailVerified: true }
    }
    return profile
  }
  // No Firestore doc yet
  if (isSuperAdmin) {
    const { setDoc } = await import('firebase/firestore')
    const agentObj = {
      uid: cred.user.uid, name: cred.user.displayName || 'Admin',
      email: cred.user.email, role: 'agent', activeRole: 'agent',
      enabledRoles: ['agent'], status: 'active', emailVerified: true, createdAt: Date.now(),
    }
    setDoc(doc(db, 'users', cred.user.uid), agentObj).catch(() => {})
    return agentObj
  }
  return { uid: cred.user.uid, name: cred.user.displayName || email.split('@')[0], email: cred.user.email, role: 'user', status: 'active', emailVerified: true }
}

const SUPER_ADMIN_EMAIL = 'hagechady4@gmail.com'

async function doEmailRegister(data) {
  const { email, password, name, phone, role, prestataireType } = data
  const isSuperAdmin = email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()

  // Each role creates a DEDICATED account — no upgrades.
  // organisateur/prestataire → status:'onboarding' until they submit their full dossier,
  // then 'pending' until admin approves. client/agent → status:'active' immediately.
  const baseRole     = isSuperAdmin ? 'agent' : (role || 'client')
  const isDedicated  = baseRole === 'organisateur' || baseRole === 'prestataire'
  const initialStatus = isDedicated ? 'onboarding' : 'active'

  if (!USE_REAL_FIREBASE) {
    // Block duplicate email — only if the existing account has been verified
    const existingClient = getAccountByEmail(email)
    if (existingClient) {
      if (existingClient.emailVerified === true) {
        throw { code: 'auth/email-already-in-use' }
      } else {
        // Ghost account (registered but never logged in) — delete it and proceed
        deleteAccount(existingClient.uid)
      }
    }

    // Block duplicate phone number — only if the existing account has been verified (logged in at least once)
    if (phone) {
      const phoneOwner = getAccountByPhone(phone)
      if (phoneOwner) {
        if (phoneOwner.emailVerified === true) {
          throw { code: 'auth/phone-already-in-use' }
        } else {
          // Ghost account (never logged in) — delete it so the phone is free
          deleteAccount(phoneOwner.uid)
        }
      }
    }

    const uid = 'local-' + Date.now()
    const user = {
      uid, name, email, phone,
      password,
      role: baseRole,
      activeRole: baseRole,
      enabledRoles: [baseRole],
      prestataireType: isDedicated && baseRole === 'prestataire' ? (prestataireType || null) : null,
      status: initialStatus,
      emailVerified: false,
      createdAt: Date.now(),
    }
    saveAccount(user)

    // For org/prest: create the candidature application immediately
    if (isDedicated) {
      const { createApplication } = await import('../utils/applications')
      createApplication(uid, email, name, baseRole)
      return { ...user, _pendingOrgOnboarding: baseRole }
    }
    return user
  }

  // ── Firebase path ──
  const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth')
  const { auth, db } = await import('../firebase')
  const { doc, setDoc, collection, query, where, getDocs } = await import('firebase/firestore')

  // Block duplicate phone number in Firestore — only if the existing account's email is verified
  if (phone) {
    const normalizedPhone = phone.replace(/\D/g, '')
    const phoneQuery = query(collection(db, 'users'), where('phoneNormalized', '==', normalizedPhone))
    const phoneSnap = await getDocs(phoneQuery)
    if (!phoneSnap.empty) {
      const hasVerifiedAccount = phoneSnap.docs.some(d => d.data().emailVerified === true)
      if (hasVerifiedAccount) throw { code: 'auth/phone-already-in-use' }
      // Ghost accounts (unverified) — delete them from Firestore so phone is free
      const { deleteDoc } = await import('firebase/firestore')
      await Promise.all(phoneSnap.docs.map(d => deleteDoc(doc(db, 'users', d.id))))
    }
  }

  // Check for ghost account with same email in Firestore (registered but never verified)
  const emailQuery = query(collection(db, 'users'), where('email', '==', email), where('emailVerified', '==', false))
  const emailGhostSnap = await getDocs(emailQuery)
  if (!emailGhostSnap.empty) {
    const { deleteDoc } = await import('firebase/firestore')
    await Promise.all(emailGhostSnap.docs.map(d => deleteDoc(doc(db, 'users', d.id))))
  }

  let cred
  try {
    cred = await createUserWithEmailAndPassword(auth, email, password)
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      // Firebase Auth still holds an unverified account — user can recover via password reset
      throw { code: 'auth/email-unverified-ghost' }
    }
    throw err
  }
  if (name) await updateProfile(cred.user, { displayName: name })

  // Send email verification (skip for super admin)
  if (!isSuperAdmin) {
    const { sendEmailVerification } = await import('firebase/auth')
    await sendEmailVerification(cred.user)
  }

  const userObj = {
    uid: cred.user.uid, name, email, phone,
    phoneNormalized: phone ? phone.replace(/\D/g, '') : '',
    role: baseRole,
    activeRole: baseRole,
    enabledRoles: [baseRole],
    prestataireType: isDedicated && baseRole === 'prestataire' ? (prestataireType || null) : null,
    status: initialStatus,
    emailVerified: false,
    createdAt: Date.now(),
  }
  await setDoc(doc(db, 'users', cred.user.uid), userObj)

  // For org/prest: create the application draft (no pending_validations yet — admin notified only after full dossier is submitted)
  if (isDedicated) {
    const { createApplication } = await import('../utils/applications')
    createApplication(cred.user.uid, email, name, baseRole)
    return isSuperAdmin ? userObj : { ...userObj, _pendingOrgOnboarding: baseRole, _needsEmailVerification: true }
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

// ─── Design tokens ────────────────────────────────────────────────────────

const S = {
  card: {
    background: 'linear-gradient(180deg, rgba(18,10,32,0.92), rgba(10,8,20,0.96))',
    backdropFilter: 'blur(28px) saturate(1.5)',
    WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '20px',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  },
  input: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '10px',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '14px',
    color: 'rgba(255,255,255,0.9)',
    padding: '12px 14px',
    width: '100%',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box',
  },
  btnPrimary: {
    padding: '14px 28px',
    background: 'linear-gradient(135deg, rgba(132,68,255,0.96), rgba(255,77,166,0.92))',
    border: 'none',
    borderRadius: '12px',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '14px',
    fontWeight: 600,
    color: 'white',
    cursor: 'pointer',
    width: '100%',
    boxShadow: '0 4px 24px rgba(132,68,255,0.35)',
    transition: 'opacity 0.2s',
  },
  btnGold: {
    padding: '14px 28px',
    background: 'linear-gradient(135deg, rgba(200,169,110,0.18), rgba(200,169,110,0.08))',
    border: '1px solid rgba(200,169,110,0.40)',
    borderRadius: '12px',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '14px',
    fontWeight: 600,
    color: '#c8a96e',
    cursor: 'pointer',
    width: '100%',
  },
  btnGhost: {
    padding: '14px 28px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '12px',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '14px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.45)',
    cursor: 'pointer',
    width: '100%',
  },
  label: {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '12px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.45)',
    display: 'block',
    marginBottom: '6px',
  },
  errorText: {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '12px',
    color: '#ff6b9d',
  },
  successText: {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '12px',
    color: '#4ee8c8',
  },
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function LoginPage() {
  const location = useLocation()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [regStep, setRegStep] = useState(1)  // 1 = choose role, 2 = fill form

  // Login fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  // Multi-account login: list of accounts for this email, selected role
  const [loginAccounts, setLoginAccounts] = useState(null) // null = not checked yet
  const [loginRole, setLoginRole] = useState(null)         // chosen role for login

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

  // ── Read URL params once on mount ──
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const urlMode = params.get('mode')
    const urlRole = params.get('role')
    if (urlMode === 'register') {
      setMode('register')
      if (urlRole) {
        setRegRole(urlRole)
        setRegStep(2)
      } else {
        setRegStep(1)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Login ──
  async function handleLogin(e) {
    e.preventDefault()
    setError('')

    // Multi-account: if we haven't checked yet, look up all accounts for this email
    if (!USE_REAL_FIREBASE && loginAccounts === null) {
      const accounts = getAllAccountsByEmail(email)
      if (accounts.length > 1) {
        setLoginAccounts(accounts)
        return // show role picker
      }
      setLoginAccounts([]) // single or none — proceed normally
    }

    setLoading(true)
    try {
      const userData = await doEmailLogin(email, password, loginRole)
      setUser(userData)
      // Fire-and-forget: push local data then pull Firestore
      import('../utils/firestore-sync').then(({ syncOnLogin, pushLocalToFirestore, syncUserProfile }) => {
        syncUserProfile(userData.uid, userData)
        pushLocalToFirestore(userData.uid).catch(() => {})
        syncOnLogin(userData.uid).catch(() => {})
      }).catch(() => {})
      const params = new URLSearchParams(location.search)
      const next = params.get('next')
      // Org/prest pending → redirect based on dossier state
      const isDedicated = userData.role === 'organisateur' || userData.role === 'prestataire'
      if (!next && isDedicated && (userData.status === 'pending' || userData.status === 'draft')) {
        const { getApplicationByUser } = await import('../utils/applications')
        const app = getApplicationByUser(userData.uid, userData.role)
        if (!app || !app.submittedAt) {
          // Dossier not submitted yet → back to inscription form
          navigate(userData.role === 'organisateur' ? '/inscription-organisateur' : '/inscription-prestataire')
        } else {
          // Dossier submitted, awaiting admin validation → show status page
          navigate('/mon-dossier')
        }
        return
      }
      navigate(next || (userData.role === 'agent' ? '/agent' : '/accueil'))
    } catch (err) {
      if (err.code === 'auth/account-pending') {
        setPendingInfo({ role: err.role })
      } else if (err.code === 'auth/email-not-verified') {
        setUnverifiedEmail(email)
      } else if (
        err.code === 'auth/user-not-found' &&
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
    const isDedicatedRole = regRole === 'organisateur' || regRole === 'prestataire'
    if (isDedicatedRole) {
      if (!regPhone.trim()) { setError('Le numéro de téléphone est requis.'); return }
      if (!/^\d[\d\s\-]{5,}$/.test(regPhone.trim())) { setError('Numéro de téléphone invalide.'); return }
    }
    const pwdErrs = validatePassword(regPwd)
    if (pwdErrs.length > 0) { setError(pwdErrs[0]); return }
    if (regPwd !== regPwdConfirm) { setError('Les mots de passe ne correspondent pas.'); return }
    if (regRole === 'prestataire' && !regPrestType) { setError('Sélectionne ton type de service.'); return }

    setLoading(true)
    try {
      const userData = await doEmailRegister({
        email: regEmail, password: regPwd,
        name: regName.trim(),
        phone: isDedicatedRole ? (regDialCode + regPhone.trim()).replace(/\s/g, '') : '',
        role: regRole, prestataireType: regPrestType,
      })
      if (userData._pendingOrgOnboarding && userData._needsEmailVerification) {
        // Org/prest on Firebase: verify email first, then redirect to onboarding
        setUnverifiedEmail(regEmail)
      } else if (userData._pendingOrgOnboarding) {
        // Org/prest on local: log them in and redirect to onboarding form
        const cleanUser = { ...userData }
        delete cleanUser._pendingOrgOnboarding
        setUser(cleanUser)
        import('../utils/firestore-sync').then(({ syncOnLogin, pushLocalToFirestore, syncUserProfile }) => {
          syncUserProfile(cleanUser.uid, cleanUser)
          pushLocalToFirestore(cleanUser.uid).catch(() => {})
          syncOnLogin(cleanUser.uid).catch(() => {})
        }).catch(() => {})
        navigate(userData._pendingOrgOnboarding === 'organisateur' ? '/onboarding-organisateur' : '/onboarding-prestataire')
      } else if (userData._needsEmailVerification) {
        setUnverifiedEmail(regEmail)
      } else {
        setUser(userData)
        import('../utils/firestore-sync').then(({ syncOnLogin, pushLocalToFirestore, syncUserProfile }) => {
          syncUserProfile(userData.uid, userData)
          pushLocalToFirestore(userData.uid).catch(() => {})
          syncOnLogin(userData.uid).catch(() => {})
        }).catch(() => {})
        navigate('/accueil')
      }
    } catch (err) {
      if (err.code === 'auth/email-unverified-ghost') {
        // Firebase Auth still holds a ghost account for this email — send a reset so user can reclaim it
        try {
          const { sendPasswordResetEmail } = await import('firebase/auth')
          const { auth } = await import('../firebase')
          await sendPasswordResetEmail(auth, regEmail)
          setError(`Un email de récupération a été envoyé à ${regEmail}. Clique sur le lien dans cet email pour définir ton mot de passe, puis connecte-toi.`)
        } catch {
          setError(`Cet email est déjà utilisé par un compte non vérifié. Va sur "Mot de passe oublié" pour récupérer l'accès.`)
        }
      } else {
        setError(getFirebaseError(err.code))
      }
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
      import('../utils/firestore-sync').then(({ syncOnLogin, pushLocalToFirestore, syncUserProfile }) => {
        syncUserProfile(userData.uid, userData)
        pushLocalToFirestore(userData.uid).catch(() => {})
        syncOnLogin(userData.uid).catch(() => {})
      }).catch(() => {})
      const params = new URLSearchParams(location.search)
      navigate(params.get('next') || '/accueil')
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
      import('../utils/firestore-sync').then(({ syncOnLogin, pushLocalToFirestore, syncUserProfile }) => {
        syncUserProfile(userData.uid, userData)
        pushLocalToFirestore(userData.uid).catch(() => {})
        syncOnLogin(userData.uid).catch(() => {})
      }).catch(() => {})
      const params = new URLSearchParams(location.search)
      navigate(params.get('next') || '/accueil')
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
      <div className="relative min-h-screen flex flex-col items-center justify-center px-6">
        <div className="relative z-10 p-8 text-center max-w-sm w-full space-y-4" style={S.card}>
          {/* Mail SVG icon */}
          <div className="flex justify-center mb-2">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="M2 7l10 7 10-7"/>
            </svg>
          </div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: '22px', letterSpacing: '0.04em', color: 'white' }}>
            Vérifie ton email
          </h2>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', color: 'rgba(255,255,255,0.42)', lineHeight: 1.6 }}>
            Un lien de confirmation a été envoyé à{' '}
            <span style={{ color: 'white' }}>{unverifiedEmail}</span>.
          </p>
          <div style={{
            textAlign: 'left',
            background: 'rgba(6,8,16,0.6)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '4px',
            padding: '12px',
          }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)', marginBottom: '8px' }}>
              Comment ça marche
            </p>
            {[
              '1. Ouvre ta boîte mail',
              '2. Cherche un email de noreply@liveinblack-15d30.firebaseapp.com',
              '3. Clique sur le lien dans cet email',
              '4. Reviens ici et connecte-toi',
            ].map((step) => (
              <p key={step} style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.8' }}>{step}</p>
            ))}
          </div>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
            L'email peut arriver dans les spams / courriers indésirables.
          </p>
          {resendSent && (
            <p style={S.successText}>Email renvoyé — OK</p>
          )}
          <button onClick={handleResendVerification}
            style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.2em', color: '#c8a96e', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}>
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
            style={{ ...S.btnGold, marginTop: '8px' }}
          >
            J'ai cliqué sur le lien — Me connecter
          </button>
        </div>
      </div>
    )
  }

  // ── "Account pending validation" screen ──
  if (pendingInfo) {
    const roleLabel = ROLES[pendingInfo.role]?.label || pendingInfo.role
    const isRoleReq  = pendingInfo.isRoleRequest
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center px-6">
        <div className="relative z-10 p-8 text-center max-w-sm w-full space-y-4" style={S.card}>
          {/* Clock SVG icon */}
          <div className="flex justify-center mb-2">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#c8a96e" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: '22px', letterSpacing: '0.04em', color: 'white' }}>
            {isRoleReq ? 'Demande envoyée !' : 'Validation en cours'}
          </h2>
          {isRoleReq ? (
            <>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', color: 'rgba(255,255,255,0.42)', lineHeight: 1.6 }}>
                Ta demande d'accès à l'espace{' '}
                <span style={{ color: '#c8a96e' }}>{roleLabel}</span>{' '}
                a été transmise à l'équipe LIVEINBLACK.
              </p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
                Ton compte <span style={{ color: 'white' }}>Client</span> est actif et tu peux déjà utiliser l'app. Tu recevras une notification dès que ton espace sera validé.
              </p>
              <button
                onClick={() => { setPendingInfo(null); navigate('/accueil') }}
                style={{ ...S.btnGold, marginTop: '8px' }}
              >
                Accéder à mon compte
              </button>
            </>
          ) : (
            <>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', color: 'rgba(255,255,255,0.42)', lineHeight: 1.6 }}>
                Ton compte{' '}
                <span style={{ color: '#c8a96e' }}>{roleLabel}</span>{' '}
                est en attente de validation par l'équipe LIVEINBLACK.
              </p>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
                Tu recevras une confirmation dès que ton compte sera activé. Cela prend généralement moins de 24h.
              </p>
              <button
                onClick={() => { setPendingInfo(null); navigate('/mon-dossier') }}
                style={{ ...S.btnGold, marginTop: '8px' }}
              >
                Voir mon dossier
              </button>
              <button
                onClick={() => { setPendingInfo(null); setMode('login') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px', textDecoration: 'underline' }}
              >
                Retour à la connexion
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center px-5 py-10">

      {/* Glow blobs */}
      <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(132,68,255,0.15) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-5%', right: '-5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,77,166,0.10) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* Logo */}
      <div className="relative z-10 mb-8 text-center">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, background: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.85), transparent 18%), linear-gradient(135deg, rgba(132,68,255,0.98), rgba(255,77,166,0.94))', boxShadow: '0 0 24px rgba(132,68,255,0.45)', flexShrink: 0, display: 'inline-block' }} />
          <h1 style={{ letterSpacing: '0.05em', lineHeight: 1, margin: 0 }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '32px', color: 'white', letterSpacing: '0.1em' }}>L</span>
            <span style={{ display: 'inline-block', width: '2px', height: '18px', background: 'white', margin: '0 3px 2px', verticalAlign: 'middle' }} />
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '32px', color: 'white', letterSpacing: '0.1em' }}>VE IN </span>
            <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 900, fontSize: '30px', color: 'white', letterSpacing: '0.02em' }}>BLACK</span>
          </h1>
        </div>
        <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.06em' }}>
          La marketplace de l'événementiel
        </p>
      </div>

      {/* Form card */}
      <div className="relative z-10 w-full" style={{ maxWidth: 400 }}>
        <div style={{ ...S.card, padding: '32px 28px' }}>

          {/* ── Mode tabs ── */}
          <div style={{ display: 'flex', gap: 6, padding: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '14px', marginBottom: '28px', border: '1px solid rgba(255,255,255,0.07)' }}>
            {[['login', 'Connexion'], ['register', "S'inscrire"]].map(([m, label]) => (
              <button key={m} onClick={() => { setMode(m); setRegStep(1); setError('') }}
                style={{ flex: 1, padding: '9px', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '13px', fontWeight: 600, border: 'none', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s',
                  ...(mode === m ? { background: 'linear-gradient(135deg, rgba(132,68,255,0.85), rgba(255,77,166,0.75))', color: '#fff', boxShadow: '0 2px 12px rgba(132,68,255,0.3)' }
                  : { background: 'transparent', color: 'rgba(255,255,255,0.35)' }) }}>
                {label}
              </button>
            ))}
          </div>

          {/* ── Error ── */}
          {error && (
            <div style={{ marginBottom: '16px', padding: '11px 14px', background: 'rgba(255,77,166,0.08)', border: '1px solid rgba(255,77,166,0.22)', borderRadius: '10px', fontFamily: 'Inter, system-ui, sans-serif', fontSize: '13px', color: '#ff6b9d', textAlign: 'center', lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              LOGIN FORM
          ══════════════════════════════════════════════════ */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={S.label}>Email</label>
                <FocusInput type="email" placeholder="ton@email.com" required value={email}
                  onChange={e => { setEmail(e.target.value); setLoginAccounts(null); setLoginRole(null) }} />
              </div>

              {/* Multi-account role picker */}
              {loginAccounts && loginAccounts.length > 1 && !loginRole && (
                <div>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)', marginBottom: 8 }}>
                    Plusieurs comptes détectés — lequel ?
                  </p>
                  {loginAccounts.map(acc => (
                    <button key={acc.uid} type="button"
                      onClick={() => setLoginRole(acc.role)}
                      style={{
                        width: '100%', marginBottom: 6, padding: '11px 14px', borderRadius: 4,
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left',
                      }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 3, fontSize: 9,
                        fontFamily: "'DM Mono', monospace", letterSpacing: '0.15em', textTransform: 'uppercase',
                        background: (ROLES[acc.role]?.color || '#fff') + '14',
                        border: `1px solid ${ROLES[acc.role]?.color || '#fff'}44`,
                        color: ROLES[acc.role]?.color || '#fff',
                      }}>
                        {ROLES[acc.role]?.label || acc.role}
                      </span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
                        {acc.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Password field — shown once role is chosen (or single account) */}
              {(!loginAccounts || loginAccounts.length <= 1 || loginRole) && (
                <>
                  {loginRole && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: -4 }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 3, fontSize: 9,
                        fontFamily: "'DM Mono', monospace", letterSpacing: '0.15em', textTransform: 'uppercase',
                        background: (ROLES[loginRole]?.color || '#fff') + '14',
                        border: `1px solid ${ROLES[loginRole]?.color || '#fff'}44`,
                        color: ROLES[loginRole]?.color || '#fff',
                      }}>
                        {ROLES[loginRole]?.label || loginRole}
                      </span>
                      <button type="button" onClick={() => setLoginRole(null)}
                        style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}>
                        Changer
                      </button>
                    </div>
                  )}
                  <div>
                    <label style={S.label}>Mot de passe</label>
                    <div style={{ position: 'relative' }}>
                      <FocusInput type={showPwd ? 'text' : 'password'} placeholder="Mot de passe" required
                        value={password} onChange={e => setPassword(e.target.value)}
                        style={{ paddingRight: '56px' }} />
                      <button type="button" onClick={() => setShowPwd(v => !v)}
                        style={{
                          position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                          fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px', fontWeight: 500,
                          color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer',
                        }}>
                        {showPwd ? 'Cacher' : 'Voir'}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} style={{ ...S.btnPrimary, marginTop: '4px', opacity: loading ? 0.6 : 1 }}>
                    {loading ? <Spinner text="Connexion..." /> : 'Se connecter'}
                  </button>
                </>
              )}
            </form>
          )}

          {mode === 'login' && (
            <button type="button"
              onClick={() => { setResetEmail(email); setResetSent(false); setShowResetModal(true) }}
              style={{
                width: '100%', textAlign: 'center', marginTop: '10px',
                fontFamily: 'Inter, system-ui, sans-serif', fontSize: '12px', fontWeight: 400,
                color: 'rgba(255,255,255,0.28)',
                background: 'none', border: 'none', cursor: 'pointer',
              }}>
              Mot de passe oublié ?
            </button>
          )}

          {/* ══════════════════════════════════════════════════
              REGISTER — STEP 1: Choose role
          ══════════════════════════════════════════════════ */}
          {mode === 'register' && regStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)', textAlign: 'center', marginBottom: '8px' }}>
                Quel type de compte veux-tu créer ?
              </p>
              {[
                { role: 'user',         title: 'Client',       desc: 'Découvre des événements et réserve tes places', badge: null },
                { role: 'organisateur', title: 'Organisateur', desc: 'Crée et gère tes propres événements',           badge: 'Validation requise' },
                { role: 'prestataire',  title: 'Prestataire',  desc: 'DJ, salle, matériel, traiteur...',              badge: 'Validation requise' },
              ].map(({ role, title, desc, badge }) => (
                <button key={role} type="button"
                  onClick={() => {
                    if (role === 'organisateur') { navigate('/inscription-organisateur'); return }
                    if (role === 'prestataire')  { navigate('/inscription-prestataire');  return }
                    setRegRole(role); setRegStep(2)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '14px',
                    background: regRole === role ? 'rgba(200,169,110,0.08)' : 'rgba(6,8,16,0.4)',
                    border: `1px solid ${regRole === role ? 'rgba(200,169,110,0.45)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '4px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '4px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <RoleIcon role={role} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '2px' }}>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', margin: 0 }}>{title}</p>
                      {badge && (
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '7px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c8a96e', padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(200,169,110,0.3)', background: 'rgba(200,169,110,0.06)' }}>
                          {badge}
                        </span>
                      )}
                    </div>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.35)' }}>{desc}</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* ══════════════════════════════════════════════════
              REGISTER — STEP 2: Fill form
          ══════════════════════════════════════════════════ */}
          {mode === 'register' && regStep === 2 && (
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Back + role badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <button type="button" onClick={() => { setRegStep(1); setError('') }}
                  style={{
                    fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.2em',
                    textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)',
                    background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                  }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M15 18l-6-6 6-6"/>
                  </svg>
                  Retour
                </button>
                <span style={{
                  marginLeft: 'auto',
                  fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.2em',
                  textTransform: 'uppercase', color: '#c8a96e',
                  padding: '3px 8px',
                  border: '1px solid rgba(200,169,110,0.3)',
                  borderRadius: '4px',
                }}>
                  {ROLES[regRole]?.label}
                </span>
              </div>

              {/* Validation notice for org/prest */}
              {(regRole === 'organisateur' || regRole === 'prestataire') && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(200,169,110,0.06)',
                  border: '1px solid rgba(200,169,110,0.25)',
                  borderRadius: '4px',
                }}>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.25em', textTransform: 'uppercase', color: '#c8a96e', marginBottom: '4px' }}>
                    {regRole === 'organisateur' ? '🎪 Espace Organisateur' : '🎤 Espace Prestataire'}
                  </p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                    Un compte <span style={{ color: '#c8a96e' }}>{ROLES[regRole]?.label}</span> dédié sera créé. Il sera activé après validation par l'équipe LIVEINBLACK (généralement moins de 24h). Tu pourras continuer à utiliser ton compte client séparément.
                  </p>
                </div>
              )}
              {/* Agent warning */}
              {regRole === 'agent' && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(200,169,110,0.06)',
                  border: '1px solid rgba(200,169,110,0.25)',
                  borderRadius: '4px',
                }}>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.25em', textTransform: 'uppercase', color: '#c8a96e', marginBottom: '4px' }}>Compte Agent</p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                    Ton compte sera soumis à validation. Tu recevras une confirmation sous 24h.
                  </p>
                </div>
              )}

              <div>
                <label style={S.label}>Prénom &amp; nom</label>
                <FocusInput type="text" placeholder="Jean Dupont" required value={regName} onChange={e => setRegName(e.target.value)} />
              </div>


              <div>
                <label style={S.label}>Adresse email</label>
                <FocusInput type="email" placeholder="ton@email.com" required value={regEmail} onChange={e => setRegEmail(e.target.value)} />
              </div>

              {/* Phone — org/prest only */}
              {(regRole === 'organisateur' || regRole === 'prestataire') && (
                <div>
                  <label style={S.label}>Téléphone</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ position: 'relative' }}>
                      <button type="button"
                        onClick={() => setShowDialPicker(v => !v)}
                        style={{
                          ...S.input,
                          width: 'auto',
                          display: 'flex', alignItems: 'center', gap: '6px',
                          paddingLeft: '10px', paddingRight: '10px',
                          whiteSpace: 'nowrap', minWidth: '80px',
                          cursor: 'pointer',
                        }}>
                        <span style={{ fontSize: '14px' }}>{COUNTRY_CODES.find(c => c.dial === regDialCode)?.flag || '🌍'}</span>
                        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>{regDialCode}</span>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
                      </button>
                      {showDialPicker && (
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
                          background: 'rgba(8,10,20,0.97)',
                          border: '1px solid rgba(255,255,255,0.10)',
                          borderRadius: '4px',
                          boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
                          maxHeight: '200px', overflowY: 'auto', width: '220px',
                        }}>
                          {COUNTRY_CODES.map(c => (
                            <button key={c.code + c.dial} type="button"
                              onClick={() => { setRegDialCode(c.dial); setShowDialPicker(false) }}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none',
                                cursor: 'pointer', transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                              <span style={{ fontSize: '14px' }}>{c.flag}</span>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.6)', flex: 1 }}>{c.name}</span>
                              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: regDialCode === c.dial ? '#c8a96e' : 'rgba(255,255,255,0.3)' }}>{c.dial}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <FocusInput type="tel" placeholder="06 00 00 00 00" value={regPhone} onChange={e => setRegPhone(e.target.value)} style={{ flex: 1 }} />
                  </div>
                </div>
              )}

              {/* Prestataire type */}
              {regRole === 'prestataire' && (
                <div>
                  <label style={S.label}>Type de service</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {PRESTATAIRE_TYPES.map(t => (
                      <button key={t.key} type="button"
                        onClick={() => setRegPrestType(t.key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '10px',
                          background: regPrestType === t.key ? 'rgba(200,169,110,0.10)' : 'rgba(6,8,16,0.5)',
                          border: `1px solid ${regPrestType === t.key ? 'rgba(200,169,110,0.45)' : 'rgba(255,255,255,0.07)'}`,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          textAlign: 'left',
                        }}>
                        <span style={{ fontSize: '14px' }}>{t.icon}</span>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: regPrestType === t.key ? '#c8a96e' : 'rgba(255,255,255,0.45)', lineHeight: 1.3 }}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Password */}
              <div>
                <label style={S.label}>Mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <FocusInput type={showRegPwd ? 'text' : 'password'} placeholder="Mot de passe" required
                    value={regPwd} onChange={e => setRegPwd(e.target.value)}
                    style={{ paddingRight: '56px' }} />
                  <button type="button" onClick={() => setShowRegPwd(v => !v)}
                    style={{
                      position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                      fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px', fontWeight: 500,
                      color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer',
                    }}>
                    {showRegPwd ? 'Cacher' : 'Voir'}
                  </button>
                </div>
              </div>

              {/* Password strength */}
              {regPwd.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '-4px' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} style={{
                        flex: 1, height: '3px', borderRadius: '2px',
                        background: i <= pwdStrength.score ? pwdStrength.color : 'rgba(255,255,255,0.08)',
                        transition: 'background 0.3s',
                      }} />
                    ))}
                  </div>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.15em', color: pwdStrength.color }}>{pwdStrength.label}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
                    {[
                      { ok: regPwd.length >= 8, text: '8 car. min.' },
                      { ok: /[A-Z]/.test(regPwd), text: 'Majuscule' },
                      { ok: /[0-9]/.test(regPwd), text: 'Chiffre' },
                    ].map(r => (
                      <span key={r.text} style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: r.ok ? '#4ee8c8' : 'rgba(255,255,255,0.2)' }}>
                        {r.ok ? '✓' : '○'} {r.text}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label style={S.label}>Confirmer le mot de passe</label>
                <FocusInput type="password" placeholder="Mot de passe" required value={regPwdConfirm} onChange={e => setRegPwdConfirm(e.target.value)} />
              </div>
              {regPwdConfirm && regPwd !== regPwdConfirm && (
                <p style={{ ...S.errorText, marginTop: '-6px' }}>Les mots de passe ne correspondent pas</p>
              )}

              <button type="submit" disabled={loading} style={{ ...S.btnPrimary, marginTop: '4px', opacity: loading ? 0.6 : 1 }}>
                {loading ? <Spinner text="Création..." /> : regRole === 'agent' ? 'Soumettre la demande' : 'Créer mon compte'}
              </button>
            </form>
          )}

          {/* ── OAuth (login mode only) ── */}
          {mode === 'login' && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.08))' }} />
                <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px', color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>ou continuer avec</span>
                <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, rgba(255,255,255,0.08))' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button onClick={handleGoogle} disabled={loading}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '11px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '10px',
                    fontFamily: 'Inter, system-ui, sans-serif', fontSize: '13px', fontWeight: 500,
                    color: 'rgba(255,255,255,0.65)',
                    cursor: 'pointer', opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s',
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </button>
                <button onClick={handleApple} disabled={loading}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '11px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: '10px',
                    fontFamily: 'Inter, system-ui, sans-serif', fontSize: '13px', fontWeight: 500,
                    color: 'rgba(255,255,255,0.65)',
                    cursor: 'pointer', opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s',
                  }}>
                  <svg width="14" height="14" viewBox="0 0 814 1000" fill="rgba(255,255,255,0.7)">
                    <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 383.8 1 261 1 148.9 1 78.7 25.4 12.7 73.5-21.3c43.7-31.1 93.1-47.1 145.3-47.1 82.8 0 138.4 44.7 186.7 44.7 46.5 0 119.5-47.4 215.8-47.4zm-97.5-161.1c-5.8 27.5-28.9 75.3-73.7 113.5-47.8 40.8-99.4 61-150.2 61-5.8 0-11.6-.6-17.4-1.3 0-3.8-.6-7.7-.6-12.2 0-26.3 7.1-74.1 47.8-115 40.8-40.8 100.2-68 152.7-68 5.8 0 11.6.6 17.4 1.3-.6 7.1-.6 14.8-.6 20.7z"/>
                  </svg>
                  Apple
                </button>
              </div>
            </div>
          )}

          {mode === 'register' && regStep === 1 && (
            <p style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)', marginTop: '16px', lineHeight: 1.6 }}>
              En t'inscrivant tu acceptes nos{' '}
              <span style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'underline', cursor: 'pointer' }} onClick={() => navigate('/cgu')}>CGU</span>{' '}
              et notre{' '}
              <span style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'underline', cursor: 'pointer' }} onClick={() => navigate('/cgu')}>Politique de confidentialité</span>
            </p>
          )}
        </div>
      </div>

      {/* ── Reset password modal ── */}
      {showResetModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowResetModal(false)} />
          <div style={{ position: 'relative', ...S.card, padding: '28px 24px', width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontSize: '20px', letterSpacing: '0.04em', color: 'white', margin: 0 }}>
              Mot de passe oublié
            </h3>
            {!resetSent ? (
              <>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.42)', lineHeight: 1.6 }}>
                  Entre ton adresse email et on t'envoie un lien de réinitialisation.
                </p>
                <div>
                  <label style={S.label}>Email</label>
                  <FocusInput type="email" placeholder="ton@email.com"
                    value={resetEmail} onChange={e => { setResetEmail(e.target.value); setResetError('') }} />
                </div>
                {resetError && <p style={S.errorText}>{resetError}</p>}
                <button onClick={handleSendReset} disabled={resetLoading} style={{ ...S.btnGold, opacity: resetLoading ? 0.6 : 1 }}>
                  {resetLoading ? <Spinner text="Envoi..." /> : 'Envoyer'}
                </button>
                <button onClick={() => setShowResetModal(false)} style={{ ...S.btnGhost }}>
                  Annuler
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4ee8c8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="M2 7l10 7 10-7"/>
                  </svg>
                </div>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#4ee8c8' }}>Email envoyé</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'rgba(255,255,255,0.42)', lineHeight: 1.5 }}>
                  Un lien a été envoyé à <span style={{ color: 'white' }}>{resetEmail}</span>.
                </p>
                <button onClick={() => setShowResetModal(false)} style={S.btnGold}>Fermer</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Focus-aware input (teal border on focus) ──────────────────────────────
function FocusInput({ style = {}, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e) }}
      onBlur={e => { setFocused(false); props.onBlur?.(e) }}
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${focused ? '#4ee8c8' : 'rgba(255,255,255,0.10)'}`,
        borderRadius: '10px',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px',
        color: 'rgba(255,255,255,0.9)',
        padding: '12px 14px',
        width: '100%',
        outline: 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: focused ? '0 0 0 3px rgba(78,232,200,0.08)' : 'none',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  )
}

// ── Role icon SVG ─────────────────────────────────────────────────────────
function RoleIcon({ role }) {
  const color = 'rgba(255,255,255,0.45)'
  if (role === 'user') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  )
  if (role === 'prestataire') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  )
  if (role === 'organisateur') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
  if (role === 'agent') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
  return null
}

// ── Spinner helper ─────────────────────────────────────────────────────────
function Spinner({ text }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
      <span style={{
        width: '14px', height: '14px',
        border: '2px solid rgba(255,255,255,0.15)',
        borderTopColor: 'rgba(255,255,255,0.7)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        display: 'inline-block',
      }} />
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
    'auth/email-already-in-use': 'Cet email est déjà utilisé par un compte actif.',
    'auth/email-unverified-ghost': "Cet email est associé à un compte non vérifié. Utilise \"Mot de passe oublié\" sur la page de connexion pour récupérer l'accès.",
    'auth/phone-already-in-use': 'Ce numéro de téléphone est déjà associé à un compte actif.',
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
