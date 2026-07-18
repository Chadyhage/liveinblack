'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Cible du resetLink construit par app/api/auth/request-password-reset/route.ts
// (?email=&token=), consommé par POST /api/auth/reset-password. Mise en page
// calquée sur VerifyEmailClient.tsx (même carte, mêmes tons) pour rester
// cohérent avec le reste des pages de confirmation « one-shot ».

const COLORS = { teal: '#4ee8c8', pink: '#e05aaa' }
const CARD: React.CSSProperties = {
  background: '#12131c',
  border: '1px solid rgba(255,255,255,0.10)',
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
  boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }
const btnSolid = (bg: string, fg: string): React.CSSProperties => ({
  padding: '14px 20px', borderRadius: 12, cursor: 'pointer', fontSize: 14.5, fontWeight: 700,
  border: 'none', width: '100%', color: fg, background: bg, boxShadow: '0 8px 22px rgba(0,0,0,0.30)',
})

type State = 'form' | 'success' | 'invalid'

export default function ResetPasswordClient({ email, token }: { email: string | null; token: string | null }) {
  const router = useRouter()
  const missingParams = !email || !token
  const [state, setState] = useState<State>(missingParams ? 'invalid' : 'form')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
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
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6, margin: '0 0 24px' }}>Choisis un nouveau mot de passe pour {email}.</p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nouveau mot de passe</label>
                <input type="password" placeholder="Mot de passe" required value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Confirmer le mot de passe</label>
                <input type="password" placeholder="Mot de passe" required value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} />
              </div>
              {error && <p style={{ fontSize: 12, color: COLORS.pink, margin: 0 }}>{error}</p>}
              <button type="submit" disabled={loading} style={{ ...btnSolid('#3ed6b5', '#04120e'), opacity: loading ? 0.75 : 1, cursor: loading ? 'wait' : 'pointer', marginTop: 4 }}>
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
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.55 }}>Tu peux maintenant te connecter avec ton nouveau mot de passe.</p>
            <div style={{ marginTop: 28 }}>
              <button onClick={() => router.push('/login')} style={btnSolid('#3ed6b5', '#04120e')}>Se connecter</button>
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
              <button onClick={() => router.push('/login')} style={btnSolid('#c8a96e', '#141007')}>Retour à la connexion</button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
