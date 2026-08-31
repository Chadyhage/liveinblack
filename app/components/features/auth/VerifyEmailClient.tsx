'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Mascot } from '@/app/components/ui'

// Cible du lien envoyé par app/api/auth/register/route.ts (verifyLink) et
// consommé par POST /api/auth/verify-email (app/api/auth/verify-email/route.ts).
// Pas d'équivalent legacy direct (src/ n'avait pas de vérification d'email —
// Firebase Auth gérait ça côté client) : mise en page calquée sur
// PaymentSuccessClient.tsx (même carte, mêmes tons) pour rester cohérent avec
// le reste des pages de confirmation « one-shot » de cette migration.

const COLORS = { teal: 'var(--primary)', pink: 'var(--pink)' }
const btnSolid = (bg: string, fg: string): React.CSSProperties => ({
  padding: '14px 20px', borderRadius: 3, cursor: 'pointer', fontSize: 14.5, fontWeight: 500,
  textTransform: 'none', letterSpacing: 'normal',
  border: 'none', width: '100%', color: fg, background: bg, boxShadow: '0 8px 22px rgba(0,0,0,0.30)',
})

type State = 'loading' | 'success' | 'error' | 'missing'

export default function VerifyEmailClient({ email, token }: { email: string | null; token: string | null }) {
  const router = useRouter()
  const missingParams = !email || !token
  // Distingue la visite directe de /verify-email sans aucun paramètre (lien
  // jamais cliqué) du cas d'un lien partiellement malformé ou réellement
  // expiré/invalide (renvoyé par l'API) — ces deux derniers gardent le
  // libellé "lien invalide ou expiré".
  const noParamsAtAll = !email && !token
  const [state, setState] = useState<State>(noParamsAtAll ? 'missing' : missingParams ? 'error' : 'loading')
  const didSubmitRef = useRef(false)

  // Renvoyer l'email de vérification depuis cet écran d'erreur — même
  // route/pattern anti-énumération que celui de AuthForm.tsx (écran "vérifie
  // ton email" post-inscription).
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [resendCooldown])

  async function handleResend() {
    if (resendLoading || resendCooldown > 0 || !email) return
    setResendLoading(true)
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      setResendSent(true)
      setResendCooldown(30)
    } finally {
      setResendLoading(false)
    }
  }

  useEffect(() => {
    if (missingParams) return
    if (didSubmitRef.current) return
    didSubmitRef.current = true
    ;(async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
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
      <style>{`@keyframes lib-verify-spin { to { transform: rotate(360deg) } }`}</style>
      <div className="lb-auth-state" role="status" aria-live="polite" style={{ width: '100%', maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
        {state === 'loading' && (
          <>
            <Mascot mood="sleeping" size={148} />
            <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: 0 }}>
              Vérification de ton email…
            </h1>
          </>
        )}

        {state === 'success' && (
          <>
            <Mascot mood="success" size={156} />
            <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', color: '#fff', margin: '0 0 10px' }}>
              Email vérifié
            </h1>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.55, overflowWrap: 'break-word' }}>
              {email ? <>L&apos;adresse {email} est confirmée, tu peux te connecter.</> : 'Ton adresse email est confirmée, tu peux te connecter.'}
            </p>
            <div style={{ marginTop: 28 }}>
              <Button onClick={() => router.push('/login')} style={btnSolid('var(--teal-solid)', '#17130c')}>Se connecter</Button>
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
              Ce lien de vérification n&apos;est plus valable.{email ? ' Tu peux en demander un nouveau ci-dessous.' : ' Reconnecte-toi pour en recevoir un nouveau.'}
            </p>

            {email && (
              <div style={{ marginTop: 18 }}>
                {resendSent && (
                  <p style={{ fontSize: 12.5, color: COLORS.teal, margin: '0 0 10px', lineHeight: 1.5 }}>
                    Si un compte existe avec cette adresse et n&apos;est pas encore vérifié, un nouvel email vient de partir.
                  </p>
                )}
                <Button
                  variant="link"
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading || resendCooldown > 0}
                  style={{ fontSize: 12.5, fontWeight: 600, color: resendCooldown > 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.65)', cursor: resendLoading || resendCooldown > 0 ? 'default' : 'pointer', textDecoration: resendCooldown > 0 ? 'none' : 'underline' }}
                >
                  {resendLoading ? 'Envoi…' : resendCooldown > 0 ? `Renvoyer dans ${resendCooldown}s` : "Renvoyer l'email de vérification"}
                </Button>
              </div>
            )}

            <div style={{ marginTop: 28 }}>
              <Button onClick={() => router.push('/login')} style={btnSolid('var(--gold)', '#141007')}>Retour à la connexion</Button>
            </div>
          </>
        )}

        {state === 'missing' && (
          <>
            <Mascot mood="confused" size={148} />
            <h1 className="font-display" style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.5px', color: COLORS.pink, margin: '0 0 10px' }}>
              Lien de vérification introuvable
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
              Cette page s&apos;utilise uniquement depuis le lien reçu par email. Reconnecte-toi pour en recevoir un nouveau.
            </p>
            <div style={{ marginTop: 28 }}>
              <Button onClick={() => router.push('/login')} style={btnSolid('var(--gold)', '#141007')}>Retour à la connexion</Button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
