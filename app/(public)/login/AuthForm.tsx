'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { regions } from '@/lib/shared/regions'

// Port de src/pages/LoginPage.jsx (#118). La distinction legacy
// role==='user' vs role==='client' n'existe plus côté backend (un seul rôle
// 'client', voir lib/models/User.ts) — le sélecteur affiche "Client" et
// pousse directement role:'client'. organisateur/prestataire ne créent
// JAMAIS de compte ici : ils sont redirigés vers leur propre wizard
// d'inscription (/organizer-signup, /provider-signup), qui crée le compte +
// la candidature à la soumission finale (lib/server/applications.ts) — donc
// aucune étape 2 de ce formulaire ne les concerne. birthYear/gender du
// formulaire legacy ne sont pas repris ici : POST /api/auth/register ne les
// accepte pas (déclaratifs, renseignables ensuite depuis /profile).

type Mode = 'login' | 'register'
type RegRole = 'client' | 'organisateur' | 'prestataire'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\d[\d\s-]{5,}$/

function checkPasswordStrength(pwd: string) {
  if (!pwd || pwd.length < 6) return { score: 0, label: 'Trop court', color: '#ef4444' }
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  if (score <= 1) return { score, label: 'Faible', color: '#ef4444' }
  if (score === 2) return { score, label: 'Moyen', color: '#f59e0b' }
  if (score === 3) return { score, label: 'Bon', color: '#84cc16' }
  return { score, label: 'Fort', color: '#22c55e' }
}

function validatePassword(pwd: string): string[] {
  const errors: string[] = []
  if (!pwd || pwd.length < 8) errors.push('Au moins 8 caractères')
  if (!/[A-Z]/.test(pwd)) errors.push('Au moins une majuscule')
  if (!/[0-9]/.test(pwd)) errors.push('Au moins un chiffre')
  return errors
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 20,
  boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
}
const inputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text)',
  padding: '12px 14px',
  width: '100%',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  display: 'block',
  marginBottom: 8,
}
const btnPrimary: React.CSSProperties = {
  padding: '14px 24px',
  background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 700,
  color: '#fff',
  cursor: 'pointer',
  width: '100%',
  boxShadow: '0 6px 20px rgba(122,59,242,0.35)',
}
const btnGold: React.CSSProperties = {
  padding: '14px 24px',
  background: 'var(--gold)',
  border: '1px solid var(--border-strong)',
  borderRadius: 12,
  fontSize: 15,
  fontWeight: 700,
  color: '#181104',
  cursor: 'pointer',
  width: '100%',
}
const errorText: React.CSSProperties = { fontSize: 12, color: 'var(--pink)' }

function FocusInput({
  style,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      {...props}
      onFocus={(e) => {
        setFocused(true)
        props.onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        props.onBlur?.(e)
      }}
      style={{
        ...inputStyle,
        borderColor: focused ? 'var(--violet)' : 'var(--border-strong)',
        boxShadow: focused ? '0 0 0 3px rgba(139,92,246,0.16)' : 'none',
        ...style,
      }}
    />
  )
}

function Spinner({ text }: { text: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <span
        style={{
          width: 14,
          height: 14,
          border: '2px solid rgba(255,255,255,0.15)',
          borderTopColor: 'rgba(255,255,255,0.7)',
          borderRadius: '50%',
          animation: 'lb-spin 0.7s linear infinite',
          display: 'inline-block',
        }}
      />
      {text}
    </span>
  )
}

function IconCheck({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function RoleIcon({ role, size = 21 }: { role: RegRole; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (role === 'client')
    return (
      <svg {...p}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    )
  if (role === 'prestataire')
    return (
      <svg {...p}>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    )
  return (
    <svg {...p}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

// Hex littéraux ici (et pas var(--teal)/var(--violet)/var(--gold)) car on a
// besoin de suffixer une transparence (1a/3a) — mêmes valeurs que les vars.
const ROLE_CARDS: { role: RegRole; title: string; desc: string; badge: string | null; accent: string }[] = [
  { role: 'client', title: 'Client', desc: 'Découvre des événements et réserve tes places', badge: null, accent: '#4ee8c8' },
  { role: 'organisateur', title: 'Organisateur', desc: 'Crée et gère tes propres événements', badge: 'Validation requise', accent: '#8b5cf6' },
  { role: 'prestataire', title: 'Prestataire', desc: 'DJ, salle, matériel, traiteur…', badge: 'Validation requise', accent: '#c8a96e' },
]

function withNext(path: string, next: string | null) {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path
}

export default function AuthForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
  const initialRole = searchParams.get('role')

  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'register' ? 'register' : 'login')
  const [regStep, setRegStep] = useState<1 | 2>(initialRole === 'client' ? 2 : 1)

  // Login
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginPwd, setShowLoginPwd] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Mot de passe oublié
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSubmitted, setForgotSubmitted] = useState(false)
  const [forgotError, setForgotError] = useState('')

  // Register
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [dialCode, setDialCode] = useState('+33')
  const [phone, setPhone] = useState('')
  const [regPwd, setRegPwd] = useState('')
  const [regPwdConfirm, setRegPwdConfirm] = useState('')
  const [showRegPwd, setShowRegPwd] = useState(false)
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState('')

  const pwdStrength = checkPasswordStrength(regPwd)

  function switchMode(m: Mode) {
    setMode(m)
    setRegStep(1)
    setLoginError('')
    setRegError('')
    setRegisteredEmail('')
  }

  function chooseRole(role: RegRole) {
    if (role === 'organisateur') {
      router.push(withNext('/organizer-signup', next))
      return
    }
    if (role === 'prestataire') {
      router.push(withNext('/provider-signup', next))
      return
    }
    setRegStep(2)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      const result = await signIn('credentials', { email: loginEmail, password: loginPassword, redirect: false })
      if (result?.error) {
        setLoginError('Email ou mot de passe incorrect.')
        return
      }
      router.push(next || '/profile')
      router.refresh()
    } finally {
      setLoginLoading(false)
    }
  }

  function openForgotModal() {
    setForgotEmail(loginEmail)
    setForgotSubmitted(false)
    setForgotError('')
    setShowForgotModal(true)
  }
  function closeForgotModal() {
    setShowForgotModal(false)
  }

  // Anti-énumération : POST /api/auth/request-password-reset renvoie
  // toujours {ok:true} côté serveur, qu'un compte existe ou non — on affiche
  // donc toujours le même message de succès générique, jamais une erreur
  // "compte introuvable".
  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault()
    setForgotError('')
    setForgotLoading(true)
    try {
      await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      })
      setForgotSubmitted(true)
    } catch {
      setForgotError('Erreur réseau. Vérifie ta connexion et réessaie.')
    } finally {
      setForgotLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegError('')

    if (!firstName.trim()) { setRegError('Le prénom est requis.'); return }
    if (!lastName.trim()) { setRegError('Le nom est requis.'); return }
    if (!EMAIL_RE.test(regEmail)) { setRegError('Adresse email invalide.'); return }
    if (phone.trim() && !PHONE_RE.test(phone.trim())) { setRegError('Numéro de téléphone invalide.'); return }
    const pwdErrs = validatePassword(regPwd)
    if (pwdErrs.length > 0) { setRegError(pwdErrs[0]); return }
    if (regPwd !== regPwdConfirm) { setRegError('Les mots de passe ne correspondent pas.'); return }

    setRegLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail,
          password: regPwd,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() ? (dialCode + phone.trim()).replace(/\s/g, '') : undefined,
        }),
      })
      if (res.status === 201) {
        setRegisteredEmail(regEmail)
        return
      }
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 || body?.error === 'email_taken') {
        setRegError('Cet email est déjà utilisé par un compte actif.')
      } else if (res.status === 400) {
        setRegError('Le mot de passe doit contenir au moins 8 caractères.')
      } else {
        setRegError('Une erreur est survenue. Réessaie.')
      }
    } catch {
      setRegError('Erreur réseau. Vérifie ta connexion.')
    } finally {
      setRegLoading(false)
    }
  }

  // ── "Vérifie ton email" screen ──
  if (registeredEmail) {
    return (
      <div style={{ width: '100%', maxWidth: 448, margin: '0 auto', padding: '48px 20px' }}>
        <div style={{ ...cardStyle, padding: '38px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M2 7l10 7 10-7" />
            </svg>
          </div>
          <h2 style={{ fontWeight: 700, fontSize: 22, color: 'var(--text)', margin: 0 }}>Vérifie ton email</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            Un lien de confirmation a été envoyé à <span style={{ color: 'var(--text)' }}>{registeredEmail}</span>.
          </p>
          <div style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8, marginTop: 0 }}>
              Comment ça marche
            </p>
            {['1. Ouvre ta boîte mail', '2. Cherche un email de LIVEINBLACK', '3. Clique sur le lien dans cet email', '4. Reviens ici et connecte-toi'].map((step) => (
              <p key={step} style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8, margin: 0 }}>
                {step}
              </p>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>L&apos;email peut arriver dans les spams ou courriers indésirables.</p>
          <button
            type="button"
            onClick={() => {
              const savedEmail = registeredEmail
              setRegisteredEmail('')
              setMode('login')
              setLoginEmail(savedEmail)
              setLoginError('Email vérifié ? Entre ton mot de passe pour te connecter.')
            }}
            style={{ ...btnGold, marginTop: 8 }}
          >
            Aller à la connexion
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: 448, margin: '0 auto', padding: '48px 20px' }}>
      <style>{`
        @keyframes lb-spin { to { transform: rotate(360deg) } }
        .lb-role-card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.2) !important; background: rgba(255,255,255,0.05) !important }
        .lb-role-card { transition: transform .18s ease, border-color .2s ease, background .2s ease }
      `}</style>

      <div style={{ ...cardStyle, padding: '38px 32px' }}>
        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 6, padding: 5, background: 'var(--surface)', borderRadius: 14, marginBottom: 28, border: '1px solid var(--border)' }}>
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              style={{
                flex: 1,
                padding: 12,
                fontSize: 14.5,
                fontWeight: 700,
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: mode === m ? 'rgba(255,255,255,0.10)' : 'transparent',
                color: mode === m ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              {m === 'login' ? 'Connexion' : 'Inscription'}
            </button>
          ))}
        </div>

        {mode === 'login' && loginError && (
          <div style={{ marginBottom: 16, padding: '11px 14px', background: 'rgba(224,90,170,0.12)', border: '1px solid rgba(224,90,170,0.4)', borderRadius: 10, fontSize: 13, color: '#ff8fc0', textAlign: 'center', lineHeight: 1.5 }}>
            {loginError}
          </div>
        )}
        {mode === 'register' && regError && (
          <div style={{ marginBottom: 16, padding: '11px 14px', background: 'rgba(224,90,170,0.12)', border: '1px solid rgba(224,90,170,0.4)', borderRadius: 10, fontSize: 13, color: '#ff8fc0', textAlign: 'center', lineHeight: 1.5 }}>
            {regError}
          </div>
        )}

        {/* LOGIN */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <FocusInput type="email" placeholder="ton@email.com" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Mot de passe</label>
              <div style={{ position: 'relative' }}>
                <FocusInput
                  type={showLoginPwd ? 'text' : 'password'}
                  placeholder="Mot de passe"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  style={{ paddingRight: 56 }}
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPwd((v) => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {showLoginPwd ? 'Cacher' : 'Voir'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loginLoading} style={{ ...btnPrimary, marginTop: 4, opacity: loginLoading ? 0.75 : 1, cursor: loginLoading ? 'wait' : 'pointer' }}>
              {loginLoading ? <Spinner text="Connexion…" /> : 'Se connecter'}
            </button>
            <button
              type="button"
              onClick={openForgotModal}
              style={{ alignSelf: 'center', marginTop: 2, fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Mot de passe oublié&nbsp;?
            </button>
          </form>
        )}

        {/* REGISTER — STEP 1 : choix du rôle */}
        {mode === 'register' && regStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center', margin: '2px 0 6px' }}>
              Quel type de compte veux-tu créer&nbsp;?
            </p>
            {ROLE_CARDS.map(({ role, title, desc, badge, accent }) => (
              <button
                key={role}
                type="button"
                className="lb-role-card"
                onClick={() => chooseRole(role)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 15,
                  padding: '17px 18px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: 46, height: 46, borderRadius: 13, background: `${accent}1a`, border: `1px solid ${accent}3a`, color: accent, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RoleIcon role={role} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.2px', color: 'var(--text)', margin: 0 }}>{title}</p>
                    {badge && (
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--gold)', padding: '3px 8px', borderRadius: 8, border: '1px solid rgba(200,169,110,0.35)', background: 'rgba(200,169,110,0.12)' }}>
                        {badge}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>{desc}</p>
                </div>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={2} strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}
            <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.6 }}>
              En t&apos;inscrivant, tu acceptes nos{' '}
              <a href="/terms" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>CGU</a> et notre{' '}
              <a href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>Politique de confidentialité</a>.
            </p>
          </div>
        )}

        {/* REGISTER — STEP 2 : formulaire client */}
        {mode === 'register' && regStep === 2 && (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <button
                type="button"
                onClick={() => { setRegStep(1); setRegError('') }}
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Retour
              </button>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--gold)', padding: '4px 10px', border: '1px solid rgba(200,169,110,0.35)', borderRadius: 8, background: 'rgba(200,169,110,0.12)' }}>
                Client
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Prénom</label>
                <FocusInput type="text" placeholder="Jean" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Nom</label>
                <FocusInput type="text" placeholder="Dupont" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Adresse email</label>
              <FocusInput type="email" placeholder="ton@email.com" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
            </div>

            <div>
              <label style={labelStyle}>Téléphone (optionnel)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={dialCode}
                  onChange={(e) => setDialCode(e.target.value)}
                  style={{ ...inputStyle, maxWidth: 110, cursor: 'pointer' }}
                >
                  {regions.map((r) => (
                    <option key={r.id} value={r.dial}>
                      {r.flag} {r.dial}
                    </option>
                  ))}
                </select>
                <FocusInput type="tel" placeholder="06 00 00 00 00" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ flex: 1 }} />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Mot de passe</label>
              <div style={{ position: 'relative' }}>
                <FocusInput
                  type={showRegPwd ? 'text' : 'password'}
                  placeholder="Mot de passe"
                  required
                  value={regPwd}
                  onChange={(e) => setRegPwd(e.target.value)}
                  style={{ paddingRight: 56 }}
                />
                <button
                  type="button"
                  onClick={() => setShowRegPwd((v) => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {showRegPwd ? 'Cacher' : 'Voir'}
                </button>
              </div>
            </div>

            {regPwd.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: -4 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= pwdStrength.score ? pwdStrength.color : 'rgba(255,255,255,0.08)', transition: 'background 0.3s' }} />
                  ))}
                </div>
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: pwdStrength.color, margin: 0 }}>{pwdStrength.label}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px' }}>
                  {[
                    { ok: regPwd.length >= 8, text: '8 caractères min.' },
                    { ok: /[A-Z]/.test(regPwd), text: 'Majuscule' },
                    { ok: /[0-9]/.test(regPwd), text: 'Chiffre' },
                  ].map((r) => (
                    <span key={r.text} style={{ fontSize: 11, fontWeight: 600, color: r.ok ? 'var(--teal)' : 'var(--text-faint)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {r.ok ? <IconCheck /> : <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.6, display: 'inline-block' }} />} {r.text}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label style={labelStyle}>Confirmer le mot de passe</label>
              <FocusInput type="password" placeholder="Mot de passe" required value={regPwdConfirm} onChange={(e) => setRegPwdConfirm(e.target.value)} />
            </div>
            {regPwdConfirm && regPwd !== regPwdConfirm && <p style={{ ...errorText, marginTop: -6 }}>Les mots de passe ne correspondent pas</p>}

            <button type="submit" disabled={regLoading} style={{ ...btnPrimary, marginTop: 4, opacity: regLoading ? 0.75 : 1, cursor: regLoading ? 'wait' : 'pointer' }}>
              {regLoading ? <Spinner text="Création…" /> : 'Créer mon compte'}
            </button>
          </form>
        )}
      </div>

      {showForgotModal && (
        <div
          onClick={closeForgotModal}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: '32px 28px', maxWidth: 400, width: '100%' }}>
            {!forgotSubmitted ? (
              <>
                <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>Mot de passe oublié</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
                  Entre ton adresse email, on t&apos;envoie un lien pour choisir un nouveau mot de passe.
                </p>
                <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <FocusInput type="email" placeholder="ton@email.com" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
                  </div>
                  {forgotError && <p style={errorText}>{forgotError}</p>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button type="button" onClick={closeForgotModal} style={{ flex: 1, padding: '13px 16px', borderRadius: 12, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      Annuler
                    </button>
                    <button type="submit" disabled={forgotLoading} style={{ ...btnPrimary, flex: 1, opacity: forgotLoading ? 0.75 : 1, cursor: forgotLoading ? 'wait' : 'pointer' }}>
                      {forgotLoading ? <Spinner text="Envoi…" /> : 'Envoyer le lien'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M2 7l10 7 10-7" />
                  </svg>
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Vérifie ton email</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                  Si un compte existe avec cette adresse, tu vas recevoir un email avec un lien pour réinitialiser ton mot de passe.
                </p>
                <button type="button" onClick={closeForgotModal} style={{ ...btnGold, marginTop: 4 }}>
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
