'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// Port de src/pages/PaiementReussiPage.jsx + src/pages/PaiementAnnulePage.jsx.
// Architecture différente du legacy : ici l'émission des billets est
// intégralement côté serveur (webhook Stripe/FedaPay -> fulfillOrder(),
// lib/server/fulfillOrder.ts) — cette page ne génère RIEN, elle ne fait que
// relire le statut de l'Order via /api/checkout (Stripe) ou
// /api/checkout/fedapay (FedaPay) jusqu'à ce que le webhook ait fini.
// Stripe redirige les paiements annulés directement vers
// /evenements/[id]?paiement=annule (voir app/api/checkout/route.ts) — seul
// FedaPay ramène ici un paiement abandonné/refusé (callback_url unique),
// d'où l'état "cancelled" qui reprend le texte de PaiementAnnulePage.jsx.
// Place gratuite (rail 'free', lib/server/freeCheckout.ts) : pas de webhook —
// le billet est déjà émis au moment où cette page se charge, /api/checkout
// (avec order_id au lieu de session_id) répond donc "paid" dès le premier
// appel, sans polling.

// Couleurs alignées sur les custom properties de app/globals.css (:root) —
// jamais de hex/rgba dupliqués ici, voir CLAUDE.md.
const COLORS = {
  teal: 'var(--teal)',
  pink: 'var(--pink)',
  gold: 'var(--gold)',
  violet: 'var(--violet)',
  muted: 'rgba(255,255,255,0.55)',
}
const CARD: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 20,
  boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
}
const btnSolid = (bg: string, fg: string): React.CSSProperties => ({
  padding: '14px 20px', borderRadius: 12, cursor: 'pointer', fontSize: 14.5, fontWeight: 700,
  border: 'none', width: '100%', color: fg, background: bg, boxShadow: '0 8px 22px rgba(0,0,0,0.30)',
})
const btnGhostS: React.CSSProperties = {
  padding: '13px 20px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 600, width: '100%',
  color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
}

const SUPPORT_EMAIL = 'hagechady@liveinblack.com'
const MAX_AUTO_ATTEMPTS = 5
const POLL_INTERVAL_MS = 3500
const TERMINAL_FEDAPAY_STATUSES = ['canceled', 'declined', 'expired']

type State = 'loading' | 'success' | 'pending' | 'cancelled' | 'error'

function IconMail({ size = 16, color = '#141007' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7 L12 13 L21 7" />
    </svg>
  )
}

export default function PaymentSuccessClient({
  sessionId,
  fedapayTxnId,
  fedapayClose,
  freeOrderId,
}: {
  sessionId: string | null
  fedapayTxnId: string | null
  fedapayClose: boolean
  freeOrderId: string | null
}) {
  const router = useRouter()
  const isFedapay = !sessionId && !!fedapayTxnId
  const isFree = !sessionId && !fedapayTxnId && !!freeOrderId

  const missingParams = !sessionId && !fedapayTxnId && !freeOrderId
  const [state, setState] = useState<State>(missingParams ? 'error' : 'loading')
  const [ticketCount, setTicketCount] = useState(0)
  const [eventName, setEventName] = useState('')
  const [eventId, setEventId] = useState('')
  const [errorMsg, setErrorMsg] = useState(missingParams ? 'Paramètres de session manquants.' : '')
  const [copied, setCopied] = useState(false)
  const [attempt, setAttempt] = useState(0)

  function copySupport() {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2200) }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(SUPPORT_EMAIL).then(done).catch(done)
    else done()
  }

  useEffect(() => {
    if (missingParams) return

    let cancelled = false
    ;(async () => {
      async function checkFedapay(): Promise<{ result: State; data?: Record<string, unknown> }> {
        const res = await fetch(`/api/checkout/fedapay?id=${encodeURIComponent(fedapayTxnId as string)}`)
        if (!res.ok) return { result: 'error' }
        const data = await res.json()
        if (data.orderStatus === 'paid') return { result: 'success', data }
        if (data.paid) return { result: 'pending', data }

        const terminal = TERMINAL_FEDAPAY_STATUSES.includes(data.paymentStatus)
        if (terminal) return { result: 'cancelled', data }
        if (fedapayClose) {
          // close=true mais statut encore "pending" : le mobile money peut se
          // finaliser juste après la fermeture du widget — on relaisse une
          // chance au webhook avant de conclure à l'abandon.
          await new Promise((r) => setTimeout(r, 2500))
          if (cancelled) return { result: 'pending' }
          const res2 = await fetch(`/api/checkout/fedapay?id=${encodeURIComponent(fedapayTxnId as string)}`)
          if (!res2.ok) return { result: 'error' }
          const data2 = await res2.json()
          if (data2.orderStatus === 'paid') return { result: 'success', data: data2 }
          if (data2.paid) return { result: 'pending', data: data2 }
          return { result: 'cancelled', data: data2 }
        }
        return { result: 'pending', data }
      }

      async function checkStripe(): Promise<{ result: State; data?: Record<string, unknown> }> {
        const res = await fetch(`/api/checkout?session_id=${encodeURIComponent(sessionId as string)}`)
        if (!res.ok) return { result: 'error' }
        const data = await res.json()
        if (data.orderStatus === 'paid') return { result: 'success', data }
        return { result: 'pending', data }
      }

      // Rail 'free' : le billet est déjà émis SYNCHRONE avant même que cette
      // page ne se charge (pas de webhook à attendre) — orderStatus est donc
      // 'paid' dès ce premier appel dans l'immense majorité des cas. 'cancelled'
      // reste possible dans la fenêtre ultra-rare où l'événement a été annulé
      // pendant le traitement (voir lib/server/freeCheckout.ts).
      async function checkFree(): Promise<{ result: State; data?: Record<string, unknown> }> {
        const res = await fetch(`/api/checkout?order_id=${encodeURIComponent(freeOrderId as string)}`)
        if (!res.ok) return { result: 'error' }
        const data = await res.json()
        if (data.orderStatus === 'paid') return { result: 'success', data }
        if (data.orderStatus === 'cancelled') return { result: 'cancelled', data }
        return { result: 'pending', data }
      }

      const { result, data } = isFedapay ? await checkFedapay() : isFree ? await checkFree() : await checkStripe()
      if (cancelled) return

      if (data) {
        if (typeof data.eventName === 'string') setEventName(data.eventName)
        if (typeof data.eventId === 'string') setEventId(data.eventId)
        if (typeof data.ticketCount === 'number') setTicketCount(data.ticketCount)
      }

      if (result === 'error') {
        setState('error')
        setErrorMsg('Impossible de vérifier ton paiement pour le moment.')
        return
      }
      setState(result)
    })()
    return () => { cancelled = true }
  }, [sessionId, fedapayTxnId, fedapayClose, freeOrderId, isFedapay, isFree, missingParams, attempt])

  // Auto-refresh borné : tant que « en attente », on re-vérifie tout seul
  // toutes les 3,5 s (jusqu'à 5 fois) — le webhook finit en général en
  // quelques secondes, l'utilisateur n'a plus à cliquer.
  useEffect(() => {
    if (state !== 'pending' || attempt >= MAX_AUTO_ATTEMPTS) return
    const t = setTimeout(() => setAttempt((a) => a + 1), POLL_INTERVAL_MS)
    return () => clearTimeout(t)
  }, [state, attempt])

  const successMsg = ticketCount > 0
    ? `${ticketCount} billet${ticketCount > 1 ? 's' : ''} pour ${eventName ? '« ' + eventName + ' »' : 'ton événement'} ${ticketCount > 1 ? 'sont disponibles' : 'est disponible'} dans ton compte.`
    : `Ton paiement pour ${eventName ? '« ' + eventName + ' »' : 'cet événement'} est confirmé. Tes billets sont disponibles dans ton compte.`

  return (
    <main style={{ minHeight: 'calc(100vh - 80px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <style>{`@keyframes lib-pay-spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ ...CARD, padding: '40px 32px', maxWidth: 460, width: '100%', textAlign: 'center' }}>

        {state === 'loading' && (
          <>
            <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 26px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: COLORS.teal, animation: 'lib-pay-spin 0.9s linear infinite' }} />
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: 0 }}>
              Confirmation du paiement…
            </h1>
            <p style={{ fontSize: 14, color: COLORS.muted, marginTop: 12, lineHeight: 1.6 }}>
              Ne ferme pas cette page, on prépare tes billets.
            </p>
          </>
        )}

        {state === 'success' && (
          <>
            <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 26px', background: 'rgba(78,232,200,0.12)', border: `2px solid ${COLORS.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={COLORS.teal} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.8px', color: '#fff', margin: '0 0 10px' }}>
              Paiement confirmé
            </h1>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.55 }}>{successMsg}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 30 }}>
              <button onClick={() => router.push('/profile')} style={btnSolid('var(--teal-solid)', '#04120e')}>Voir mes billets</button>
              <button onClick={() => router.push('/events')} style={btnGhostS}>Découvrir d&apos;autres événements</button>
            </div>
          </>
        )}

        {state === 'pending' && (
          <>
            <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 26px', background: 'rgba(139,92,246,0.12)', border: `2px solid ${COLORS.violet}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.violet} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            </div>
            <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.7px', color: '#fff', margin: '0 0 10px' }}>
              Paiement bien reçu
            </h1>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
              On finalise {eventName ? '« ' + eventName + ' »' : 'ta réservation'}. Tes billets arrivent dans <strong style={{ color: '#fff' }}>Mes billets</strong> d&apos;ici quelques instants — inutile de repayer.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 30 }}>
              <button onClick={() => router.push('/profile')} style={{ ...btnSolid('linear-gradient(180deg, #8f56ff, #7a3bf2)', '#fff'), border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 6px 20px rgba(122,59,242,0.35)' }}>Voir mes billets</button>
              <button onClick={() => setAttempt((a) => a + 1)} style={btnGhostS}>Vérifier maintenant</button>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 14 }}>
              {attempt < MAX_AUTO_ATTEMPTS ? 'Vérification automatique en cours…' : 'Tes billets apparaîtront dans « Mes billets » dès confirmation.'}
            </p>
          </>
        )}

        {state === 'cancelled' && (
          <>
            <div style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px', background: 'rgba(200,169,110,0.08)', border: '2px solid rgba(200,169,110,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <p style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: '0 0 10px' }}>
              Paiement annulé
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
              Aucun montant n&apos;a été débité. Tu peux retourner à l&apos;événement et réessayer quand tu veux.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
              {eventId && (
                <button onClick={() => router.push(`/events/${eventId}`)} style={btnSolid(COLORS.gold, '#141007')}>
                  Retourner à l&apos;événement
                </button>
              )}
              <button onClick={() => router.push('/events')} style={btnGhostS}>Voir tous les événements</button>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 26px', background: 'rgba(224,90,170,0.10)', border: '2px solid rgba(224,90,170,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.pink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" /><circle cx="12" cy="16.5" r="0.6" fill={COLORS.pink} /></svg>
            </div>
            <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.5px', color: COLORS.pink, margin: '0 0 10px' }}>
              Une erreur est survenue
            </h1>
            <p style={{ fontSize: 14, color: COLORS.muted, margin: 0, lineHeight: 1.6 }}>{errorMsg}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 30 }}>
              <button onClick={copySupport} style={{ ...btnSolid(COLORS.gold, '#141007'), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                <IconMail size={16} color="#141007" />
                {copied ? 'Adresse copiée' : "Copier l'email du support"}
              </button>
              <button onClick={() => router.push('/profile')} style={btnGhostS}>Voir mes billets</button>
              <button onClick={() => router.push('/')} style={{ ...btnGhostS, border: 'none', background: 'none', color: 'rgba(255,255,255,0.55)' }}>Retour à l&apos;accueil</button>
            </div>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginTop: 16 }}>{SUPPORT_EMAIL}</p>
          </>
        )}
      </div>
    </main>
  )
}
