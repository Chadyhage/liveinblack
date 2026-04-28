// src/pages/BoostActivePage.jsx
// Page de retour Stripe après paiement d'un boost
// Vérifie la session puis appelle saveBoost() pour activer le boost
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { verifyStripeSession } from '../utils/stripe'
import { saveBoost } from '../utils/ticket'

const FONTS = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'DM Mono', 'Fira Mono', monospace",
}
const COLORS = {
  teal: '#4ee8c8', pink: '#e05aaa', gold: '#c8a96e',
  muted: 'rgba(255,255,255,0.42)', dim: 'rgba(255,255,255,0.22)',
}
const CARD = {
  background: 'rgba(8,10,20,0.55)',
  backdropFilter: 'blur(22px) saturate(1.6)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 12,
}

const PENDING_KEY = (id) => `lib_pending_boost_${id}`

export default function BoostActivePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = params.get('session_id')
  const boostId = params.get('boost_id')

  const [state, setState] = useState('loading') // loading | success | error
  const [errorMsg, setErrorMsg] = useState('')
  const [boostInfo, setBoostInfo] = useState(null)

  useEffect(() => {
    if (!sessionId || !boostId) {
      setState('error')
      setErrorMsg('Paramètres de session manquants.')
      return
    }
    let cancelled = false
    ;(async () => {
      const result = await verifyStripeSession(sessionId)
      if (cancelled) return
      if (!result || !result.paid) {
        setState('error')
        setErrorMsg(result?.paymentStatus
          ? `Paiement non confirmé (${result.paymentStatus}).`
          : 'Impossible de vérifier le paiement.')
        return
      }
      // Activer le boost à partir des metadata Stripe (source de vérité)
      const m = result.metadata || {}
      try {
        saveBoost(
          m.eventId,
          Number(m.position),
          Number(m.days),
          Number(result.amountTotal || 0) / 100,
          m.region || '',
          m.userId || null,
        )
      } catch (e) {
        // saveBoost échoué — log mais on affiche succès paiement
        console.warn('[BoostActive] saveBoost error:', e)
      }
      try { localStorage.removeItem(PENDING_KEY(boostId)) } catch {}

      setBoostInfo({
        position: Number(m.position),
        days: Number(m.days),
        eventId: m.eventId,
        eventName: m.eventName,
      })
      setState('success')
    })()
    return () => { cancelled = true }
  }, [sessionId, boostId])

  return (
    <Layout hideNav>
      <div style={{
        minHeight: 'calc(100vh - 80px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px', fontFamily: FONTS.mono,
      }}>
        <div style={{ ...CARD, padding: 32, maxWidth: 460, width: '100%', textAlign: 'center' }}>
          {state === 'loading' && (
            <>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', margin: '0 auto 24px',
                border: `2px solid ${COLORS.dim}`, borderTopColor: COLORS.pink,
                animation: 'spin 0.9s linear infinite',
              }} />
              <p style={{ fontFamily: FONTS.display, fontSize: 24, fontWeight: 300, color: 'rgba(255,255,255,0.92)', margin: 0 }}>
                Activation du boost…
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </>
          )}

          {state === 'success' && (
            <>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
                background: 'rgba(224,90,170,0.12)', border: `2px solid ${COLORS.pink}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {/* Lightning bolt icon */}
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.pink} strokeWidth={2.2} strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <p style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 300, color: COLORS.pink, margin: '0 0 8px' }}>
                Boost activé
              </p>
              {boostInfo && (
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', margin: 0, lineHeight: 1.7 }}>
                  Ton événement {boostInfo.eventName ? `« ${boostInfo.eventName} »` : ''} apparaît
                  désormais en <strong style={{ color: COLORS.pink }}>Top {boostInfo.position}</strong>{' '}
                  pour les {boostInfo.days} prochain{boostInfo.days > 1 ? 's' : ''} jour{boostInfo.days > 1 ? 's' : ''}.
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
                <button
                  onClick={() => navigate('/mes-evenements')}
                  style={{
                    padding: '12px 18px', borderRadius: 4, cursor: 'pointer',
                    fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                    background: 'rgba(224,90,170,0.10)', border: `1px solid ${COLORS.pink}`, color: COLORS.pink,
                  }}>
                  Voir mes événements →
                </button>
                <button
                  onClick={() => navigate('/accueil')}
                  style={{
                    padding: '12px 18px', borderRadius: 4, cursor: 'pointer',
                    fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)',
                  }}>
                  Voir le Top 3
                </button>
              </div>
            </>
          )}

          {state === 'error' && (
            <>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
                background: 'rgba(224,90,170,0.08)', border: `2px solid rgba(224,90,170,0.45)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.pink} strokeWidth={2.2}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="13" strokeLinecap="round" />
                  <circle cx="12" cy="16.5" r="0.6" fill={COLORS.pink} />
                </svg>
              </div>
              <p style={{ fontFamily: FONTS.display, fontSize: 26, fontWeight: 300, color: COLORS.pink, margin: '0 0 10px' }}>
                Erreur d'activation
              </p>
              <p style={{ fontSize: 12, color: COLORS.muted, margin: 0, lineHeight: 1.7 }}>
                {errorMsg}
              </p>
              <a
                href="mailto:hagechady@liveinblack.com?subject=Probl%C3%A8me%20de%20boost"
                style={{
                  display: 'inline-block', marginTop: 24,
                  padding: '12px 18px', borderRadius: 4,
                  fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                  background: 'rgba(200,169,110,0.10)', border: `1px solid ${COLORS.gold}`, color: COLORS.gold,
                  textDecoration: 'none',
                }}>
                ✉ Contacter le support
              </a>
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}
