'use client'

import { forwardRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Cible du resetLink construit par app/api/auth/request-password-reset/route.ts
// (?email=&token=), consommé par POST /api/auth/reset-password. Mise en page
// calquée sur VerifyEmailClient.tsx (même carte, mêmes tons) pour rester
// cohérent avec le reste des pages de confirmation « one-shot ».

const COLORS = { teal: 'var(--teal)', pink: 'var(--pink)' }
const CARD: React.CSSProperties = {
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
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }
const btnSolid = (bg: string, fg: string): React.CSSProperties => ({
  padding: '14px 20px', borderRadius: 12, cursor: 'pointer', fontSize: 14.5, fontWeight: 700,
  border: 'none', width: '100%', color: fg, background: bg, boxShadow: '0 8px 22px rgba(0,0,0,0.30)',
})

// Même règle que validatePassword() de AuthForm.tsx (app/(public)/login/AuthForm.tsx)
// — dupliquée ici (fonction pure de 5 lignes, pas d'import cross-route-group)
// pour que réinitialiser un mot de passe applique exactement la même politique
// qu'à l'inscription (8 caractères + majuscule + chiffre).
function validatePassword(pwd: string): string[] {
  const errors: string[] = []
  if (!pwd || pwd.length < 8) errors.push('Au moins 8 caractères')
  if (!/[A-Z]/.test(pwd)) errors.push('Au moins une majuscule')
  if (!/[0-9]/.test(pwd)) errors.push('Au moins un chiffre')
  return errors
}

function checkPasswordStrength(pwd: string) {
  if (!pwd || pwd.length < 8) return { score: 0, label: 'Trop court', color: 'var(--pink)' }
  let score = 0
  if (pwd.length >= 8) score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9]/.test(pwd)) score++
  if (score <= 1) return { score, label: 'Faible', color: 'var(--pink)' }
  if (score === 2) return { score, label: 'Moyen', color: 'var(--gold)' }
  return { score, label: 'Fort', color: 'var(--teal)' }
}

const FocusInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function FocusInput(
  { style, ...props },
  ref
) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      ref={ref}
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
})

type State = 'form' | 'success' | 'invalid' | 'missing'

export default function ResetPasswordClient({ email, token }: { email: string | null; token: string | null }) {
  const router = useRouter()
  const missingParams = !email || !token
  const [state, setState] = useState<State>(missingParams ? 'missing' : 'form')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const pwdStrength = checkPasswordStrength(password)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const pwdErrs = validatePassword(password)
    if (pwdErrs.length > 0) {
      setError(pwdErrs[0])
      return
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setState('success')
      } else if (data.error === 'invalid_or_expired_token') {
        setState('invalid')
      } else {
        setError('Une erreur est survenue. Réessaie.')
      }
    } catch {
      setError('Erreur réseau. Vérifie ta connexion.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: 'calc(100vh - 80px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ ...CARD, padding: '40px 32px', maxWidth: 440, width: '100%', textAlign: state === 'form' ? 'left' : 'center' }}>
        {state === 'form' && (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px', color: '#fff', margin: '0 0 8px' }}>Nouveau mot de passe</h1>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6, margin: '0 0 24px', overflowWrap: 'break-word' }}>Choisis un nouveau mot de passe pour {email}.</p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle} htmlFor="reset-password">Nouveau mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <FocusInput
                    id="reset-password"
                    name="new-password"
                    type={showPwd ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingRight: 56 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {showPwd ? 'Cacher' : 'Voir'}
                  </button>
                </div>
              </div>

              {password.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: -4 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3].map((i) => (
                      <div key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: i <= pwdStrength.score ? pwdStrength.color : 'rgba(255,255,255,0.08)', transition: 'background 0.3s' }} />
                    ))}
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: pwdStrength.color, margin: 0 }}>{pwdStrength.label}</p>
                </div>
              )}

              <div>
                <label style={labelStyle} htmlFor="reset-password-confirm">Confirmer le mot de passe</label>
                <FocusInput id="reset-password-confirm" name="new-password" type="password" autoComplete="new-password" placeholder="Mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {error && <p style={{ fontSize: 12, color: COLORS.pink, margin: 0 }}>{error}</p>}
              <button type="submit" disabled={loading} style={{ ...btnSolid('var(--teal-solid)', '#04120e'), opacity: loading ? 0.75 : 1, cursor: loading ? 'wait' : 'pointer', marginTop: 4 }}>
                {loading ? 'Enregistrement…' : 'Changer mon mot de passe'}
              </button>
            </form>
          </>
        )}

        {state === 'success' && (
          <>
            <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 26px', background: 'rgba(78,232,200,0.12)', border: `2px solid ${COLORS.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={COLORS.teal} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', color: '#fff', margin: '0 0 10px' }}>Mot de passe changé</h1>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.55, overflowWrap: 'break-word' }}>
              Le mot de passe de {email} a été changé. Tu peux maintenant te connecter avec ton nouveau mot de passe.
            </p>
            <div style={{ marginTop: 28 }}>
              <button onClick={() => router.push('/login')} style={btnSolid('var(--teal-solid)', '#04120e')}>Se connecter</button>
            </div>
          </>
        )}

        {state === 'invalid' && (
          <>
            <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 26px', background: 'rgba(224,90,170,0.10)', border: '2px solid rgba(224,90,170,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.pink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" /><circle cx="12" cy="16.5" r="0.6" fill={COLORS.pink} /></svg>
            </div>
            <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.5px', color: COLORS.pink, margin: '0 0 10px' }}>Lien invalide ou expiré</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
              Ce lien de réinitialisation n&apos;est plus valable. Redemande-en un nouveau depuis la page de connexion.
            </p>
            <div style={{ marginTop: 28 }}>
              <button onClick={() => router.push('/login')} style={btnSolid('var(--gold)', '#141007')}>Retour à la connexion</button>
            </div>
          </>
        )}

        {state === 'missing' && (
          <>
            <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 26px', background: 'rgba(224,90,170,0.10)', border: '2px solid rgba(224,90,170,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.pink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" /><circle cx="12" cy="16.5" r="0.6" fill={COLORS.pink} /></svg>
            </div>
            <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.5px', color: COLORS.pink, margin: '0 0 10px' }}>Lien de réinitialisation introuvable</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
              Cette page s&apos;utilise uniquement depuis le lien reçu par email. Demande un nouveau lien depuis la page de connexion.
            </p>
            <div style={{ marginTop: 28 }}>
              <button onClick={() => router.push('/login')} style={btnSolid('var(--gold)', '#141007')}>Retour à la connexion</button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
