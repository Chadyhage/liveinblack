import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'

const FONTS = {
  display: "Inter, sans-serif",
  mono: "Inter, sans-serif",
}
const COLORS = {
  gold: '#c8a96e',
  muted: 'rgba(255,255,255,0.42)',
  dim: 'rgba(255,255,255,0.22)',
}
const CARD = {
  background: '#12131c',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 20,
  boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
}

/**
 * Page de retour après annulation du paiement (Stripe ou FedaPay).
 * Aucune donnée n'est créée — restock + nettoyage des pendings.
 */
export default function PaiementAnnulePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const eventId = params.get('event_id')
  const placeType = params.get('place_type')
  const qty = params.get('qty')
  const provider = params.get('provider')
  const fedapayTxnId = params.get('txn_id')

  useEffect(() => {
    if (provider === 'fedapay') {
      // FedaPay : restock via /api/fedapay (le serveur RE-VÉRIFIE le statut chez
      // FedaPay et restocke de façon idempotente — registre partagé avec le webhook).
      if (fedapayTxnId) {
        import('../utils/stripe').then(({ releaseFedapayTransaction }) =>
          releaseFedapayTransaction(fedapayTxnId)).catch(() => {})
      }
    } else if (eventId && placeType && qty) {
      // Stripe : restocker la place réservée avant la session (api/checkout.js
      // décrémente dès la création de la session).
      import('../utils/apiAuth').then(async ({ authHeaders }) => fetch('/api/event-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ eventId, placeType, qty, action: 'release' }),
      })).catch(() => {})
    }
    // Nettoyer UNIQUEMENT le panier de CET achat annulé (par event) — surtout pas
    // tous les pendings : un second achat en cours dans un autre onglet doit
    // survivre (sinon son retour /paiement-reussi perd son contexte local).
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('lib_pending_booking_'))
      keys.forEach(k => {
        try {
          const p = JSON.parse(localStorage.getItem(k) || 'null')
          const matchesEvent = eventId && p && String(p.eventId) === String(eventId)
          if (!p || matchesEvent) localStorage.removeItem(k) // corrompu OU le bon event
        } catch { localStorage.removeItem(k) }
      })
    } catch {}
  }, [eventId, placeType, qty, provider, fedapayTxnId])

  return (
    <Layout hideNav>
      <div style={{
        minHeight: 'calc(100vh - 80px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px', fontFamily: FONTS.display,
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

          <p style={{ fontFamily: FONTS.display, fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: '0 0 10px' }}>
            Paiement annulé
          </p>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
            Aucun montant n'a été débité. Tu peux retourner à l'événement et réessayer quand tu veux.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
            {eventId && (
              <button
                onClick={() => navigate(`/evenements/${eventId}`)}
                style={{
                  padding: '14px 20px', borderRadius: 12, cursor: 'pointer',
                  fontFamily: FONTS.display, fontSize: 14.5, fontWeight: 700,
                  background: '#c8a96e', border: 'none', color: '#141007',
                  boxShadow: '0 6px 18px rgba(200,169,110,0.25)',
                }}
              >
                Retourner à l'événement
              </button>
            )}
            <button
              onClick={() => navigate('/evenements')}
              style={{
                padding: '13px 20px', borderRadius: 12, cursor: 'pointer',
                fontFamily: FONTS.display, fontSize: 14, fontWeight: 600,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.9)',
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
