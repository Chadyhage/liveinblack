'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getPasswordPolicyErrors } from '@/lib/shared/passwordPolicy'
import { Button, Input, Label, Mascot } from '@/app/components/ui'

// Cible du resetLink construit par app/api/auth/request-password-reset/route.ts
// (?email=&token=), consommé par POST /api/auth/reset-password. Mise en page
// calquée sur VerifyEmailClient.tsx (même carte, mêmes tons) pour rester
// cohérent avec le reste des pages de confirmation « one-shot ».

const COLORS = { teal: 'var(--primary)', pink: 'var(--pink)' }
const labelStyle: React.CSSProperties = { fontSize: 'var(--font-size-footnote)', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }
const btnSolid = (bg: string, fg = 'var(--primary-ink)'): React.CSSProperties => ({
  padding: '14px 20px', borderRadius: 3, cursor: 'pointer', fontSize: 'var(--font-size-body-lg)', fontWeight: 500,
  textTransform: 'none', letterSpacing: 'normal',
  border: 'none', width: '100%', color: fg, background: bg, boxShadow: '0 8px 22px rgba(var(--black-rgb), .30)',
})

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
    const pwdErrs = getPasswordPolicyErrors(password)
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
      const cleanEmail = email ? email.trim().toLowerCase() : ''
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, token, password }),
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
    <div className="lb-auth-state" style={{ width: '100%', maxWidth: 760, margin: '0 auto', textAlign: state === 'form' ? 'left' : 'center' }}>
        {state === 'form' && (
          <>
            <h1 className="font-display" style={{ fontSize: 'var(--font-size-title-2)', fontWeight: 800, letterSpacing: '-0.4px', color: 'var(--text)', margin: '0 0 8px' }}>Nouveau mot de passe</h1>
            <p style={{ fontSize: 'var(--font-size-body)', color: 'var(--text-faint)', lineHeight: 1.6, margin: '0 0 24px', overflowWrap: 'break-word' }}>Choisis un nouveau mot de passe pour {email}.</p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <Label style={labelStyle} htmlFor="reset-password">Nouveau mot de passe</Label>
                <div style={{ position: 'relative' }}>
                  <Input
                    id="reset-password"
                    name="new-password"
                    type={showPwd ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingRight: 56 }}
                  />
                    <Button
                      variant="ghost"
                      type="button"
                      aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      onClick={() => setShowPwd((v) => !v)}
                      style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', padding: 4, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <svg aria-hidden="true" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        {showPwd ? (
                          <>
                            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </>
                        ) : (
                          <>
                            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 7 11 7a20.3 20.3 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </>
                        )}
                      </svg>
                    </Button>
                  </div>
              </div>

              {password.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: -4 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3].map((i) => (
                      <div key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: i <= pwdStrength.score ? pwdStrength.color : 'var(--fill-secondary)', transition: 'background 0.3s' }} />
                    ))}
                  </div>
                  <p style={{ fontSize: 'var(--font-size-caption)', fontWeight: 600, letterSpacing: '0.04em', color: pwdStrength.color, margin: 0 }}>{pwdStrength.label}</p>
                </div>
              )}

              <div>
                <Label style={labelStyle} htmlFor="reset-password-confirm">Confirmer le mot de passe</Label>
                <Input id="reset-password-confirm" name="new-password" type="password" autoComplete="new-password" placeholder="Mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {error && <p style={{ fontSize: 'var(--font-size-footnote)', color: COLORS.pink, margin: 0 }}>{error}</p>}
              <Button type="submit" loading={loading} loadingText="Enregistrement…" style={{ ...btnSolid('var(--teal-solid)'), marginTop: 4 }}>
                Changer mon mot de passe
              </Button>
            </form>
          </>
        )}

        {state === 'success' && (
          <>
            <Mascot mood="success" size={156} />
            <h1 className="font-display" style={{ fontSize: 'var(--font-size-title-xl)', fontWeight: 800, letterSpacing: '-0.6px', color: 'var(--text)', margin: '0 0 10px' }}>Mot de passe changé</h1>
            <p style={{ fontSize: 'var(--font-size-body-lg)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.55, overflowWrap: 'break-word' }}>
              Le mot de passe de {email} a été changé. Tu peux maintenant te connecter avec ton nouveau mot de passe.
            </p>
            <div style={{ marginTop: 28 }}>
              <Button onClick={() => router.push('/login')} style={btnSolid('var(--teal-solid)')}>Se connecter</Button>
            </div>
          </>
        )}

        {state === 'invalid' && (
          <>
            <Mascot mood="error" size={148} />
            <h1 className="font-display" style={{ fontSize: 'var(--font-size-title-1-lg)', fontWeight: 800, letterSpacing: '-0.5px', color: COLORS.pink, margin: '0 0 10px' }}>Lien invalide ou expiré</h1>
            <p style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
              Ce lien de réinitialisation n&apos;est plus valable. Redemande-en un nouveau depuis la page de connexion.
            </p>
            <div style={{ marginTop: 28 }}>
              <Button onClick={() => router.push('/login')} style={btnSolid('var(--gold)', 'var(--danger-ink)')}>Retour à la connexion</Button>
            </div>
          </>
        )}

        {state === 'missing' && (
          <>
            <Mascot mood="confused" size={148} />
            <h1 className="font-display" style={{ fontSize: 'var(--font-size-title-1-lg)', fontWeight: 800, letterSpacing: '-0.5px', color: COLORS.pink, margin: '0 0 10px' }}>Lien de réinitialisation introuvable</h1>
            <p style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
              Cette page s&apos;utilise uniquement depuis le lien reçu par email. Demande un nouveau lien depuis la page de connexion.
            </p>
            <div style={{ marginTop: 28 }}>
              <Button onClick={() => router.push('/login')} style={btnSolid('var(--gold)', 'var(--danger-ink)')}>Retour à la connexion</Button>
            </div>
          </>
        )}
    </div>
  )
}
