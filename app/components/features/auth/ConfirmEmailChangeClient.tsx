'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Mascot } from '@/app/components/ui'

// Cible du verifyLink construit par lib/server/profile.ts:requestEmailChange
// (?email=&token=), consommé par POST /api/profil/confirmer-email. Régression
// trouvée à l'audit : la page ciblée par ce lien n'existait pas du tout (le
// lien envoyé par email atterrissait sur un 404 / redirection de connexion
// sans jamais confirmer le changement) — mise en page calquée sur
// VerifyEmailClient.tsx (même famille de confirmation "one-shot" par lien).
// Volontairement sous app/(public)/, PAS app/(app)/profil/ : ce lien est
// cliqué depuis un email, potentiellement hors session active ou sur un
// autre appareil — même convention que /verify-email et /reset-password.

const COLORS = { teal: 'var(--primary)', pink: 'var(--pink)' }
const btnSolid = (bg: string, fg: string): React.CSSProperties => ({
  padding: '14px 20px', borderRadius: 3, cursor: 'pointer', fontSize: 14.5, fontWeight: 500,
  textTransform: 'none', letterSpacing: 'normal',
  border: 'none', width: '100%', color: fg, background: bg, boxShadow: '0 8px 22px rgba(0,0,0,0.30)',
})

type State = 'loading' | 'success' | 'error'

export default function ConfirmEmailChangeClient({ email, token }: { email: string | null; token: string | null }) {
  const router = useRouter()
  const missingParams = !email || !token
  const [state, setState] = useState<State>(missingParams ? 'error' : 'loading')
  const didSubmitRef = useRef(false)

  useEffect(() => {
    if (missingParams) return
    if (didSubmitRef.current) return
    didSubmitRef.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/profil/confirmer-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token }),
        })
        const data = await res.json().catch(() => ({}))
        setState(res.ok && data.ok ? 'success' : 'error')
      } catch {
        setState('error')
      }
    })()
  }, [email, token, missingParams])

  return (
    <>
      <style>{`@keyframes lib-confirm-email-spin { to { transform: rotate(360deg) } }`}</style>
      <div className="lb-auth-state" role="status" aria-live="polite" style={{ width: '100%', maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
        {state === 'loading' && (
          <>
            <Mascot mood="sleeping" size={148} />
            <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: 0 }}>
              Confirmation de ta nouvelle adresse…
            </h1>
          </>
        )}

        {state === 'success' && (
          <>
            <Mascot mood="success" size={156} />
            <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', color: '#fff', margin: '0 0 10px' }}>
              Adresse e-mail mise à jour
            </h1>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.55 }}>
              {email ? `${email} est désormais ton adresse de connexion.` : 'Ta nouvelle adresse est confirmée.'}
            </p>
            <div style={{ marginTop: 28 }}>
              <Button onClick={() => router.push('/profile')} fullWidth style={btnSolid('var(--primary-strong)', 'var(--primary-ink)')}>Retour au profil</Button>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <Mascot mood="error" size={148} />
            <h1 className="font-display" style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.5px', color: COLORS.pink, margin: '0 0 10px' }}>
              Lien invalide ou expiré
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
              Ce lien de confirmation n&apos;est plus valable. Relance la demande de changement d&apos;e-mail depuis ton profil.
            </p>
            <div style={{ marginTop: 28 }}>
              <Button onClick={() => router.push('/profile')} fullWidth style={btnSolid('var(--primary-strong)', 'var(--primary-ink)')}>Retour au profil</Button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
