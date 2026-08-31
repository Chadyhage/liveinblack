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
const COLORS = { pink: 'var(--pink)', gold: 'var(--gold)', muted: 'rgba(255,255,255,0.42)', dim: 'rgba(255,255,255,0.22)' }
const CARD: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
}

const MAX_ATTEMPTS = 20
const POLL_INTERVAL_MS = 1000

type State = 'loading' | 'success' | 'error'
type BoostInfo = { position: number; days: number; eventId: string; eventName: string }

function IconMail({ size = 15, color = '#141007' }: { size?: number; color?: string }) {
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
        setErrorMsg('Ce créneau a été pris au même instant par un autre paiement. Ton paiement a été remboursé automatiquement ; aucun nouveau paiement n’est nécessaire.')
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
            <h1 className="font-display" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px', color: '#fff', margin: 0 }}>
              Activation du boost…
            </h1>
          </>
        )}

        {state === 'success' && (
          <>
            <Mascot mood="success" size={156} />
            <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: '0 0 8px' }}>
              Boost activé
            </h1>
            {boostInfo && (
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.72)', margin: 0, lineHeight: 1.6 }}>
                Ton événement {boostInfo.eventName ? `« ${boostInfo.eventName} »` : ''} apparaît
                désormais en <strong style={{ color: COLORS.pink }}>Top {boostInfo.position}</strong>{' '}
                pour les {boostInfo.days} prochain{boostInfo.days > 1 ? 's' : ''} jour{boostInfo.days > 1 ? 's' : ''}.
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
              <Button
                onClick={() => router.push('/my-events')}
                style={{ padding: '14px 20px', borderRadius: 12, fontSize: 14.5, fontWeight: 600, textTransform: 'none', letterSpacing: 'normal', background: 'var(--violet-cta)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', boxShadow: '0 6px 20px rgba(200,169,110,0.35)' }}>
                Voir mes événements
              </Button>
              <Button
                onClick={() => router.push('/home')}
                variant="secondary"
                style={{ padding: '13px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.9)' }}>
                Voir le Top 3
              </Button>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <Mascot mood="error" size={148} />
            <h1 className="font-display" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.4px', color: COLORS.pink, margin: '0 0 10px' }}>
              Erreur d&apos;activation
            </h1>
            <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.6 }}>
              {errorMsg}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
              <a
                href="mailto:hagechady@liveinblack.com?subject=Probl%C3%A8me%20de%20boost"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, background: COLORS.gold, border: 'none', color: '#141007', textDecoration: 'none' }}>
                <IconMail size={15} color="#141007" />
                Contacter le support
              </a>
              <Button
                onClick={() => router.push('/my-events')}
                variant="secondary"
                style={{ padding: '13px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.9)' }}>
                Retour à mes événements
              </Button>
            </div>
          </>
        )}
      </Card>
    </main>
  )
}
