'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Cible du verifyLink construit par lib/server/profile.ts:requestEmailChange
// (?email=&token=), consommé par POST /api/profil/confirmer-email. Régression
// trouvée à l'audit : la page ciblée par ce lien n'existait pas du tout (le
// lien envoyé par email atterrissait sur un 404 / redirection de connexion
// sans jamais confirmer le changement) — mise en page calquée sur
// VerifyEmailClient.tsx (même famille de confirmation "one-shot" par lien).
// Volontairement sous app/(public)/, PAS app/(app)/profil/ : ce lien est
// cliqué depuis un email, potentiellement hors session active ou sur un
// autre appareil — même convention que /verify-email et /reset-password.

const COLORS = { teal: '#4ee8c8', pink: '#e05aaa' }
const CARD: React.CSSProperties = {
  background: '#12131c',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 20,
  boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
}
const btnSolid = (bg: string, fg: string): React.CSSProperties => ({
  padding: '14px 20px', borderRadius: 12, cursor: 'pointer', fontSize: 14.5, fontWeight: 700,
  border: 'none', width: '100%', color: fg, background: bg, boxShadow: '0 8px 22px rgba(0,0,0,0.30)',
})

type State = 'loading' | 'success' | 'error'

export default function ConfirmEmailChangeClient({ email, token }: { email: string | null; token: string | null }) {
  const router = useRouter()
  const missingParams = !email || !token
  const [state, setState] = useState<State>(missingParams ? 'error' : 'loading')

  useEffect(() => {
    if (missingParams) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/profil/confirmer-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        setState(res.ok && data.ok ? 'success' : 'error')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [email, token, missingParams])

  return (
    <main style={{ minHeight: 'calc(100vh - 80px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <style>{`@keyframes lib-confirm-email-spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ ...CARD, padding: '40px 32px', maxWidth: 440, width: '100%', textAlign: 'center' }}>
        {state === 'loading' && (
          <>
            <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 26px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: COLORS.teal, animation: 'lib-confirm-email-spin 0.9s linear infinite' }} />
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: 0 }}>
              Confirmation de ta nouvelle adresse…
            </h1>
          </>
        )}

        {state === 'success' && (
          <>
            <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 26px', background: 'rgba(78,232,200,0.12)', border: `2px solid ${COLORS.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={COLORS.teal} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', color: '#fff', margin: '0 0 10px' }}>
              Adresse e-mail mise à jour
            </h1>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.55 }}>
              {email ? `${email} est désormais ton adresse de connexion.` : 'Ta nouvelle adresse est confirmée.'}
            </p>
            <div style={{ marginTop: 28 }}>
              <button onClick={() => router.push('/profile')} style={btnSolid('#3ed6b5', '#04120e')}>Retour au profil</button>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 26px', background: 'rgba(224,90,170,0.10)', border: '2px solid rgba(224,90,170,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.pink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" /><circle cx="12" cy="16.5" r="0.6" fill={COLORS.pink} /></svg>
            </div>
            <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.5px', color: COLORS.pink, margin: '0 0 10px' }}>
              Lien invalide ou expiré
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
              Ce lien de confirmation n&apos;est plus valable. Relance la demande de changement d&apos;e-mail depuis ton profil.
            </p>
            <div style={{ marginTop: 28 }}>
              <button onClick={() => router.push('/profile')} style={btnSolid('#c8a96e', '#141007')}>Retour au profil</button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
