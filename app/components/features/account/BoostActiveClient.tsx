'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, Mascot } from '@/app/components/ui'

// Port de src/pages/BoostActivePage.jsx. Différence d'architecture vs
// legacy : l'activation (création du doc Boost) est intégralement côté
// serveur — webhook Stripe -> finalizeBoost() (lib/server/finalizeBoost.ts).
// Cette page ne fait qu'attendre/relire ce statut via
// GET /api/checkout/boost, jamais générer le boost elle-même.

// Couleurs alignées sur les custom properties de app/globals.css (:root) —
// jamais de hex/rgba dupliqués ici, voir CLAUDE.md.
const COLORS = { pink: 'var(--pink)', gold: 'var(--gold)', muted: 'var(--text-faint)', dim: 'var(--border)' }
const CARD: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: '0 24px 64px rgba(var(--black-rgb), .55)',
}

const MAX_ATTEMPTS = 20
const POLL_INTERVAL_MS = 1000

type State = 'loading' | 'success' | 'error'
type BoostInfo = { position: number; days: number; eventId: string; eventName: string }

function IconMail({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7 L12 13 L21 7" />
    </svg>
  )
}

export default function BoostActiveClient({ sessionId, boostId }: { sessionId: string | null; boostId: string | null }) {
  const router = useRouter()
  const missingParams = !sessionId || !boostId
  const [state, setState] = useState<State>(missingParams ? 'error' : 'loading')
  const [errorMsg, setErrorMsg] = useState(missingParams ? 'Impossible de retrouver cette activation de boost. Réessaie depuis la page de ton événement.' : '')
  const [boostInfo, setBoostInfo] = useState<BoostInfo | null>(null)

  useEffect(() => {
    if (missingParams || !sessionId || !boostId) return

    let cancelled = false
    ;(async () => {
      let data: Record<string, unknown> | null = null
      for (let i = 0; i < MAX_ATTEMPTS && !cancelled; i += 1) {
        const res = await fetch(`/api/checkout/boost?session_id=${encodeURIComponent(sessionId)}&boost_id=${encodeURIComponent(boostId)}`)
        if (!res.ok) { data = null; break }
        data = await res.json()
        if (!data?.paid || (data?.boostStatus && data.boostStatus !== 'pending')) break
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
      if (cancelled) return

      if (!data || !data.paid) {
        setState('error')
        setErrorMsg(
          data && typeof data.paymentStatus === 'string'
            ? `Paiement non confirmé (${data.paymentStatus}).`
            : 'Impossible de vérifier le paiement. Si tu as été débité, écris-nous à hagechady@liveinblack.com — on régularise ton boost.'
        )
        return
      }
      if (data.boostStatus === 'refunded_conflict') {
        setState('error')
        setErrorMsg('Ce créneau a été pris au même instant par un autre paiement. Contacte le support avec ton reçu : Live In Black suivra la régularisation sans te demander de repayer.')
        return
      }
      if (data.boostStatus !== 'active') {
        setState('error')
        setErrorMsg('Ton paiement est confirmé, mais l’activation prend plus de temps que prévu. Ne repaie pas : contacte le support avec ton reçu pour que nous régularisions le boost.')
        return
      }

      const meta = (data.metadata || {}) as { eventId?: string; eventName?: string; position?: string; days?: string }
      setBoostInfo({
        position: Number(meta.position) || 0,
        days: Number(meta.days) || 0,
        eventId: meta.eventId || '',
        eventName: meta.eventName || '',
      })
      setState('success')
    })()
    return () => { cancelled = true }
  }, [sessionId, boostId, missingParams])

  return (
    <main className="lb-status-page" style={{ minHeight: 'calc(100vh - 80px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <style>{`@keyframes lib-boost-spin { to { transform: rotate(360deg) } }`}</style>
      <Card style={{ ...CARD, padding: 32, maxWidth: 760, width: '100%', textAlign: 'center' }}>
        {state === 'loading' && (
          <>
            <Mascot mood="sleeping" size={148} />
            <h1 className="font-display" style={{ fontSize: 'var(--font-size-title-2)', fontWeight: 800, letterSpacing: '-0.4px', color: 'var(--text)', margin: 0 }}>
              Activation du boost…
            </h1>
          </>
        )}

        {state === 'success' && (
          <>
            <Mascot mood="success" size={156} />
            <h1 className="font-display" style={{ fontSize: 'var(--font-size-title-xl)', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: '0 0 8px' }}>
              Boost activé
            </h1>
            {boostInfo && (
              <p style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                Ton événement {boostInfo.eventName ? `« ${boostInfo.eventName} »` : ''} apparaît
                désormais en <strong style={{ color: COLORS.pink }}>Top {boostInfo.position}</strong>{' '}
                pour les {boostInfo.days} prochain{boostInfo.days > 1 ? 's' : ''} jour{boostInfo.days > 1 ? 's' : ''}.
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
              <Button
                onClick={() => router.push('/my-events')}
                style={{ padding: '14px 20px', borderRadius: 12, fontSize: 'var(--font-size-body-lg)', fontWeight: 600, textTransform: 'none', letterSpacing: 'normal', background: 'var(--violet-cta)', border: '1px solid var(--border-strong)', color: 'var(--primary-ink)', boxShadow: '0 6px 20px var(--primary-a24)' }}>
                Voir mes événements
              </Button>
              <Button
                onClick={() => router.push('/home')}
                variant="secondary"
                style={{ padding: '13px 20px', borderRadius: 12, fontSize: 'var(--font-size-body-sm)', fontWeight: 600, background: 'var(--fill-secondary)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                Voir le Top 3
              </Button>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <Mascot mood="error" size={148} />
            <h1 className="font-display" style={{ fontSize: 'var(--font-size-title-1)', fontWeight: 800, letterSpacing: '-0.4px', color: COLORS.pink, margin: '0 0 10px' }}>
              Erreur d&apos;activation
            </h1>
            <p style={{ fontSize: 'var(--font-size-body)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
              {errorMsg}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
              <a
                href="mailto:hagechady@liveinblack.com?subject=Probl%C3%A8me%20de%20boost"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 20px', borderRadius: 12, fontSize: 'var(--font-size-body-sm)', fontWeight: 700, background: COLORS.gold, border: 'none', color: 'var(--danger-ink)', textDecoration: 'none' }}>
                <IconMail size={15} />
                Contacter le support
              </a>
              <Button
                onClick={() => router.push('/my-events')}
                variant="secondary"
                style={{ padding: '13px 20px', borderRadius: 12, fontSize: 'var(--font-size-body-sm)', fontWeight: 600, background: 'var(--fill-secondary)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                Retour à mes événements
              </Button>
            </div>
          </>
        )}
      </Card>
    </main>
  )
}
