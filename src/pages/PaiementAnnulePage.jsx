import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'

const FONTS = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'DM Mono', 'Fira Mono', monospace",
}
const COLORS = {
  gold: '#c8a96e',
  muted: 'rgba(255,255,255,0.42)',
  dim: 'rgba(255,255,255,0.22)',
}
const CARD = {
  background: 'rgba(8,10,20,0.55)',
  backdropFilter: 'blur(22px) saturate(1.6)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 12,
}

/**
 * Page de retour Stripe après annulation du paiement.
 * Aucune donnée n'est créée — on nettoie juste les pendings éventuels.
 */
export default function PaiementAnnulePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const eventId = params.get('event_id')

  useEffect(() => {
    // Nettoyer tous les pendings (au cas où — ils sont en localStorage)
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('lib_pending_booking_'))
      keys.forEach(k => localStorage.removeItem(k))
    } catch {}
  }, [])

  return (
    <Layout hideNav>
      <div style={{
        minHeight: 'calc(100vh - 80px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px', fontFamily: FONTS.mono,
      }}>
        <div style={{ ...CARD, padding: 32, maxWidth: 460, width: '100%', textAlign: 'center' }}>
          {/* Icon */}
          <div style={{
            width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
            background: 'rgba(200,169,110,0.08)', border: `2px solid rgba(200,169,110,0.40)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>

          <p style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 300, color: COLORS.gold, margin: '0 0 10px' }}>
            Paiement annulé
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.7 }}>
            Aucun montant n'a été débité. Tu peux retourner à l'événement et réessayer quand tu veux.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
            {eventId && (
              <button
                onClick={() => navigate(`/evenements/${eventId}`)}
                style={{
                  padding: '12px 18px', borderRadius: 4, cursor: 'pointer',
                  fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                  background: 'rgba(200,169,110,0.10)', border: `1px solid ${COLORS.gold}`, color: COLORS.gold,
                }}
              >
                ↺ Retourner à l'événement
              </button>
            )}
            <button
              onClick={() => navigate('/evenements')}
              style={{
                padding: '12px 18px', borderRadius: 4, cursor: 'pointer',
                fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)',
              }}
            >
              Voir tous les événements
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
