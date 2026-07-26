'use client'

import { useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { regions } from '@/lib/shared/regions'
import { getPasswordPolicyErrors } from '@/lib/shared/passwordPolicy'
import { safeInternalPath } from '@/lib/shared/safeNavigation'
import { Button, Card, Input, Label, Select, Tabs } from '@/app/components/ui'

// Port de src/pages/LoginPage.jsx (#118). La distinction legacy
// role==='user' vs role==='client' n'existe plus côté backend (un seul rôle
// 'client', voir lib/models/User.ts) — le sélecteur affiche "Client" et
// pousse directement role:'client'. organisateur/prestataire ne créent
// JAMAIS de compte ici : ils sont redirigés vers leur propre wizard
// d'inscription (/organizer-signup, /provider-signup), qui crée le compte +
// la candidature à la soumission finale (lib/server/applications.ts) — donc
// aucune étape 2 de ce formulaire ne les concerne. Les données démographiques
// facultatives restent déclaratives et modifiables ensuite depuis /profile.

type Mode = 'login' | 'register'
type RegRole = 'client' | 'organisateur' | 'prestataire'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\d[\d\s-]{5,}$/

function checkPasswordStrength(pwd: string) {
  // Score aligné uniquement sur les 3 critères visibles dans la checklist
  // ci-dessous (8 caractères, majuscule, chiffre) pour que le libellé affiché
  // reste toujours explicable par ce que l'utilisateur voit à l'écran.
  if (!pwd || pwd.length < 8) return { score: 0, label: 'Trop court', color: 'var(--pink)' }
  let score = 0
  if (pwd.length >= 8) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (score <= 1) return { score, label: 'Faible', color: 'var(--pink)' }
  if (score === 2) return { score, label: 'Moyen', color: 'var(--gold)' }
  return { score, label: 'Fort', color: 'var(--teal)' }
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 20,
  boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
}
const btnPrimary: React.CSSProperties = {
  padding: '15px 24px',
  background: 'var(--teal-solid)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  fontSize: 14,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  color: '#04120e',
  width: '100%',
  boxShadow: '0 6px 20px rgba(78,232,200,0.22)',
}
const btnGold: React.CSSProperties = {
  padding: '15px 24px',
  background: 'var(--gold)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  fontSize: 14,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  color: '#181104',
  width: '100%',
}
const errorText: React.CSSProperties = { fontSize: 12, color: 'var(--pink)' }

function IconCheck({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconEye({ open, size = 15 }: { open: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <line x1="2" y1="2" x2="22" y2="22" />}
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
  const next = safeInternalPath(searchParams.get('next'), '') || null
  const initialRole = searchParams.get('role')

  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'register' ? 'register' : 'login')
  const [regStep, setRegStep] = useState<1 | 2>(initialRole === 'client' ? 2 : 1)

  // Login
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginPwd, setShowLoginPwd] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  // Message informatif (pas une erreur) affiché après un aller-retour depuis
  // l'écran "Vérifie ton email" — distinct de loginError pour ne pas prendre
  // le style visuel des vraies erreurs (bannière rose).
  const [loginInfo, setLoginInfo] = useState('')

  // Mot de passe oublié
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSubmitted, setForgotSubmitted] = useState(false)
  const [forgotError, setForgotError] = useState('')
  const forgotEmailRef = useRef<HTMLInputElement>(null)
  const forgotModalRef = useRef<HTMLDivElement>(null)

  // Register
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [dialCode, setDialCode] = useState('+228')
  const [phone, setPhone] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [gender, setGender] = useState('')
  const [regPwd, setRegPwd] = useState('')
  const [regPwdConfirm, setRegPwdConfirm] = useState('')
  const [showRegPwd, setShowRegPwd] = useState(false)
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState('')

  // Renvoyer l'email de vérification (écran "Vérifie ton email" post-inscription)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const pwdStrength = checkPasswordStrength(regPwd)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [resendCooldown])

  // Focus + fermeture au clavier de la modale "Mot de passe oublié", à
  // l'image de CookieConsentBanner.tsx (role="dialog"/aria-labelledby).
  useEffect(() => {
    if (!showForgotModal) return
    forgotEmailRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeForgotModal()
      if (e.key !== 'Tab') return

      const focusable = forgotModalRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showForgotModal])

  // Anti-énumération : POST /api/auth/resend-verification renvoie toujours
  // {ok:true}, qu'un compte existe, soit déjà vérifié, ou non — message de
  // succès générique, jamais de confirmation/infirmation explicite.
  async function handleResendVerification() {
    if (resendLoading || resendCooldown > 0) return
    setResendLoading(true)
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registeredEmail.trim().toLowerCase() }),
      })
      setResendSent(true)
      setResendCooldown(30)
    } finally {
      setResendLoading(false)
    }
  }

  function switchMode(m: Mode) {
    setMode(m)
    setRegStep(1)
    setLoginError('')
    setLoginInfo('')
    setRegError('')
    setRegisteredEmail('')
    setResendSent(false)
    setResendCooldown(0)
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
    setLoginInfo('')
    // Validation gérée entièrement ici (plutôt que via required/type="email"
    // natifs) pour que toute erreur passe par la bannière custom du design
    // system au lieu de l'infobulle non stylée du navigateur.
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError('Merci de renseigner ton email et ton mot de passe.')
      return
    }
    if (!EMAIL_RE.test(loginEmail.trim())) {
      setLoginError('Adresse email invalide.')
      return
    }
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
    if (!EMAIL_RE.test(forgotEmail.trim())) {
      setForgotError('Saisis une adresse email valide.')
      forgotEmailRef.current?.focus()
      return
    }
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
    const pwdErrs = getPasswordPolicyErrors(regPwd)
    if (pwdErrs.length > 0) { setRegError(pwdErrs[0]); return }
    if (regPwd !== regPwdConfirm) {
      // Si le message inline sous le champ de confirmation est déjà visible,
      // ne pas le dupliquer dans la bannière générale (voir condition
      // d'affichage identique plus bas, sur `regPwdConfirm.length >= regPwd.length`).
      if (regPwdConfirm.length < regPwd.length) setRegError('Confirme ton mot de passe.')
      return
    }

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
          birthYear: birthYear ? Number(birthYear) : null,
          gender: gender || null,
        }),
      })
      if (res.status === 201) {
        setRegisteredEmail(regEmail)
        return
      }
      const body = await res.json().catch(() => ({}))
      if (body?.error === 'phone_taken') {
        setRegError('Ce numéro de téléphone est déjà utilisé par un compte actif.')
      } else if (res.status === 409 || body?.error === 'email_taken') {
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
        <Card style={{ background: 'var(--surface-2)', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.55)', padding: '38px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M2 7l10 7 10-7" />
            </svg>
          </div>
          <h2 style={{ fontWeight: 700, fontSize: 22, color: 'var(--text)', margin: 0 }}>Confirme ton inscription</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0, overflowWrap: 'break-word' }}>
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

          {resendSent && (
            <p style={{ fontSize: 12.5, color: 'var(--teal)', margin: 0, lineHeight: 1.5 }}>
              Si un compte existe avec cette adresse et n&apos;est pas encore vérifié, un nouvel email vient de partir.
            </p>
          )}
          <Button
            variant="ghost"
            onClick={handleResendVerification}
            disabled={resendLoading || resendCooldown > 0}
            style={{ fontSize: 12.5, color: resendCooldown > 0 ? 'var(--text-faint)' : 'var(--text-muted)', textDecoration: resendCooldown > 0 ? 'none' : 'underline' }}
          >
            {resendLoading ? 'Envoi…' : resendCooldown > 0 ? `Renvoyer dans ${resendCooldown}s` : "Renvoyer l'email de vérification"}
          </Button>

          <Button
            variant="primary"
            onClick={() => {
              const savedEmail = registeredEmail
              setRegisteredEmail('')
              setMode('login')
              setLoginEmail(savedEmail)
              setLoginInfo('Email vérifié ? Entre ton mot de passe pour te connecter.')
            }}
            style={{ ...btnGold, marginTop: 8 }}
          >
            Aller à la connexion
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: 448, margin: '0 auto', padding: '48px 20px' }}>
      <style>{`
        @keyframes lb-spin { to { transform: rotate(360deg) } }
        .lb-role-card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.2) !important; background: rgba(255,255,255,0.05) !important }
        .lb-role-card { transition: transform .18s ease, border-color .2s ease, background .2s ease }
        .lb-role-chevron { transition: stroke .18s ease }
        .lb-role-card:hover .lb-role-chevron { stroke: rgba(255,255,255,0.6) }
        .lb-tab:hover:not(.lb-tab-active) { background: rgba(255,255,255,0.06) !important }
        .lb-toggle-btn { transition: color .15s ease }
        .lb-toggle-btn:hover { color: var(--text) !important }
        @keyframes lb-fade-in { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }
        .lb-banner-fade { animation: lb-fade-in 0.22s ease }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <p className="font-display" style={{ fontSize: 28, letterSpacing: '.02em', margin: 0, color: 'var(--teal)' }}>
          {mode === 'login' ? 'Content de te revoir' : 'Rejoins Live in Black'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0 0' }}>
          {mode === 'login' ? 'Connecte-toi pour retrouver tes billets et tes soirées.' : "Crée ton compte pour découvrir ce qui se passe près de toi."}
        </p>
      </div>

      <Card style={{ background: 'var(--surface-2)', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.55)', padding: '38px 32px' }}>
        {/* Mode tabs */}
        <Tabs
          value={mode}
          onChange={(v) => switchMode(v as Mode)}
          options={[
            { value: 'login', label: 'Connexion' },
            { value: 'register', label: 'Inscription' },
          ]}
          style={{ marginBottom: 28 }}
        />

        {mode === 'login' && loginError && (
          <div className="lb-banner-fade" style={{ marginBottom: 16, padding: '11px 14px', background: 'rgba(224,90,170,0.12)', border: '1px solid rgba(224,90,170,0.4)', borderRadius: 10, fontSize: 13, color: 'var(--pink)', textAlign: 'center', lineHeight: 1.5 }}>
            {loginError}
          </div>
        )}
        {mode === 'login' && !loginError && loginInfo && (
          <div className="lb-banner-fade" style={{ marginBottom: 16, padding: '11px 14px', background: 'rgba(78,232,200,0.10)', border: '1px solid rgba(78,232,200,0.35)', borderRadius: 10, fontSize: 13, color: 'var(--teal)', textAlign: 'center', lineHeight: 1.5 }}>
            {loginInfo}
          </div>
        )}
        {mode === 'register' && regError && (
          <div className="lb-banner-fade" style={{ marginBottom: 16, padding: '11px 14px', background: 'rgba(224,90,170,0.12)', border: '1px solid rgba(224,90,170,0.4)', borderRadius: 10, fontSize: 13, color: 'var(--pink)', textAlign: 'center', lineHeight: 1.5 }}>
            {regError}
          </div>
        )}

        {/* LOGIN */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                name="email"
                type="text"
                inputMode="email"
                autoComplete="email"
                placeholder="ton@email.com"
                disabled={loginLoading}
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                invalid={loginError === 'Email ou mot de passe incorrect.'}
              />
            </div>
            <div>
              <Label htmlFor="login-password">Mot de passe</Label>
              <div style={{ position: 'relative' }}>
                <Input
                  id="login-password"
                  name="password"
                  type={showLoginPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Mot de passe"
                  disabled={loginLoading}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  invalid={loginError === 'Email ou mot de passe incorrect.'}
                  style={{ paddingRight: 56 }}
                />
                <span className="lb-toggle-btn" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                  <Button
                    variant="ghost"
                    onClick={() => setShowLoginPwd((v) => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'inherit' }}
                  >
                    <IconEye open={showLoginPwd} />
                    {showLoginPwd ? 'Cacher' : 'Voir'}
                  </Button>
                </span>
              </div>
            </div>
            <Button type="submit" variant="primary" disabled={loginLoading} loading={loginLoading} loadingText="Connexion…" style={{ ...btnPrimary, marginTop: 4 }}>
              Se connecter
            </Button>
            <Button
              variant="ghost"
              onClick={openForgotModal}
              style={{ alignSelf: 'center', marginTop: 2, fontSize: 12.5, color: 'var(--text-muted)', textDecoration: 'underline' }}
            >
              Mot de passe oublié&nbsp;?
            </Button>
          </form>
        )}

        {/* REGISTER — STEP 1 : choix du rôle */}
        {mode === 'register' && regStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center', margin: '2px 0 6px' }}>
              Quel type de compte veux-tu créer&nbsp;?
            </p>
            {ROLE_CARDS.map(({ role, title, desc, badge, accent }) => (
              <div key={role} className="lb-role-card" style={{ borderRadius: 16, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)' }}>
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={() => chooseRole(role)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 15,
                    padding: '17px 18px',
                    minHeight: 92,
                    borderRadius: 16,
                    textAlign: 'left',
                    justifyContent: 'flex-start',
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
                  <svg className="lb-role-chevron" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={2} strokeLinecap="round" style={{ flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Button>
              </div>
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
              <Button
                variant="ghost"
                onClick={() => { setRegStep(1); setRegError('') }}
                style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Retour
              </Button>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '4px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'rgba(255,255,255,0.06)' }}>
                Client
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <Label htmlFor="reg-firstname">Prénom</Label>
                <Input id="reg-firstname" name="given-name" type="text" autoComplete="given-name" placeholder="Jean" disabled={regLoading} value={firstName} onChange={(e) => setFirstName(e.target.value)} invalid={regError === 'Le prénom est requis.'} />
              </div>
              <div style={{ flex: 1 }}>
                <Label htmlFor="reg-lastname">Nom</Label>
                <Input id="reg-lastname" name="family-name" type="text" autoComplete="family-name" placeholder="Dupont" disabled={regLoading} value={lastName} onChange={(e) => setLastName(e.target.value)} invalid={regError === 'Le nom est requis.'} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <Label htmlFor="reg-birth-year">Année de naissance</Label>
                <Select
                  id="reg-birth-year"
                  value={birthYear}
                  onChange={(value) => setBirthYear(value)}
                  disabled={regLoading}
                  placeholder="Non renseignée"
                  options={Array.from({ length: 68 }, (_, index) => new Date().getFullYear() - 13 - index).map((year) => ({ value: String(year), label: String(year) }))}
                />
              </div>
              <div>
                <Label htmlFor="reg-gender">Genre</Label>
                <Select
                  id="reg-gender"
                  value={gender}
                  onChange={(value) => setGender(value)}
                  disabled={regLoading}
                  placeholder="Non renseigné"
                  options={[
                    { value: 'femme', label: 'Femme' },
                    { value: 'homme', label: 'Homme' },
                    { value: 'autre', label: 'Autre' },
                  ]}
                />
              </div>
              <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 10.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>Optionnel · utilisé uniquement dans des statistiques anonymes, jamais affiché sur ton profil.</p>
            </div>

            <div>
              <Label htmlFor="reg-email">Email</Label>
              <Input id="reg-email" name="email" type="text" inputMode="email" autoComplete="email" placeholder="ton@email.com" disabled={regLoading} value={regEmail} onChange={(e) => setRegEmail(e.target.value)} invalid={regError === 'Adresse email invalide.'} />
            </div>

            <div>
              <Label htmlFor="reg-phone">Téléphone (optionnel)</Label>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ maxWidth: 110, flexShrink: 0 }}>
                  <Select
                    aria-label="Indicatif pays"
                    value={dialCode}
                    onChange={(value) => setDialCode(value)}
                    disabled={regLoading}
                    options={regions.map((r) => ({ value: r.dial, label: `${r.flag} ${r.name} ${r.dial}` }))}
                  />
                </div>
                <Input
                  id="reg-phone"
                  name="tel-national"
                  type="tel"
                  autoComplete="tel-national"
                  placeholder="06 00 00 00 00"
                  disabled={regLoading}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  invalid={regError === 'Numéro de téléphone invalide.'}
                  style={{ flex: 1 }}
                />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '6px 0 0' }}>Sans l&apos;indicatif pays, déjà sélectionné à gauche.</p>
            </div>

            <div>
              <Label htmlFor="reg-password">Mot de passe</Label>
              <div style={{ position: 'relative' }}>
                <Input
                  id="reg-password"
                  name="new-password"
                  type={showRegPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Mot de passe"
                  disabled={regLoading}
                  value={regPwd}
                  onChange={(e) => setRegPwd(e.target.value)}
                  style={{ paddingRight: 56 }}
                />
                <span className="lb-toggle-btn" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                  <Button
                    variant="ghost"
                    onClick={() => setShowRegPwd((v) => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'inherit' }}
                  >
                    <IconEye open={showRegPwd} />
                    {showRegPwd ? 'Cacher' : 'Voir'}
                  </Button>
                </span>
              </div>
            </div>

            {regPwd.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: -4 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: i <= pwdStrength.score ? pwdStrength.color : 'rgba(255,255,255,0.08)', transition: 'background 0.3s' }} />
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
              <Label htmlFor="reg-password-confirm">Confirmer le mot de passe</Label>
              <Input
                id="reg-password-confirm"
                name="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Mot de passe"
                disabled={regLoading}
                value={regPwdConfirm}
                onChange={(e) => setRegPwdConfirm(e.target.value)}
                invalid={regPwdConfirm.length >= regPwd.length && regPwd !== regPwdConfirm}
              />
            </div>
            {regPwdConfirm.length >= regPwd.length && regPwd !== regPwdConfirm && <p style={{ ...errorText, marginTop: -6 }}>Les mots de passe ne correspondent pas</p>}

            <Button type="submit" variant="primary" disabled={regLoading} loading={regLoading} loadingText="Création…" style={{ ...btnPrimary, marginTop: 4 }}>
              Créer mon compte
            </Button>
            <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-faint)', margin: '2px 0 0', lineHeight: 1.6 }}>
              En créant ton compte, tu acceptes nos{' '}
              <a href="/terms" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>CGU</a> et notre{' '}
              <a href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>Politique de confidentialité</a>.
            </p>
          </form>
        )}
      </Card>

      {showForgotModal && (
        <div
          onClick={closeForgotModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-modal-title"
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div ref={forgotModalRef} onClick={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: '32px 28px', maxWidth: 400, width: '100%' }}>
            {!forgotSubmitted ? (
              <>
                <h2 id="forgot-modal-title" style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>Mot de passe oublié</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
                  Entre ton adresse email, on t&apos;envoie un lien pour choisir un nouveau mot de passe.
                </p>
                <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <Label htmlFor="forgot-email">Email</Label>
                    <Input
                      ref={forgotEmailRef}
                      id="forgot-email"
                      name="email"
                      type="text"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="ton@email.com"
                      disabled={forgotLoading}
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      aria-invalid={Boolean(forgotError)}
                      aria-describedby={forgotError ? 'forgot-email-error' : undefined}
                      invalid={Boolean(forgotError)}
                    />
                  </div>
                  {forgotError && <p id="forgot-email-error" role="alert" style={errorText}>{forgotError}</p>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <Button variant="secondary" onClick={closeForgotModal} style={{ flex: 1, padding: '13px 16px', borderRadius: 12, fontSize: 13.5 }}>
                      Annuler
                    </Button>
                    <Button type="submit" variant="primary" disabled={forgotLoading} loading={forgotLoading} loadingText="Envoi…" style={{ ...btnPrimary, flex: 1, fontSize: 13.5 }}>
                      Envoyer le lien
                    </Button>
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
                <h2 id="forgot-modal-title" style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Vérifie ta boîte mail</h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                  Si un compte existe avec cette adresse, tu vas recevoir un email avec un lien pour réinitialiser ton mot de passe.
                </p>
                <Button variant="primary" onClick={closeForgotModal} style={{ ...btnGold, marginTop: 4 }}>
                  Fermer
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
