import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { verifyStripeSession } from '../utils/stripe'
import { generateTicketToken } from '../utils/ticket'
import { useAuth } from '../context/AuthContext'

const FONTS = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'DM Mono', 'Fira Mono', monospace",
}
const COLORS = {
  teal: '#4ee8c8',
  pink: '#e05aaa',
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

const PENDING_KEY = (id) => `lib_pending_booking_${id}`

/**
 * Page de retour Stripe après paiement réussi.
 * - Vérifie la session côté serveur (statut paid)
 * - Si paid : récupère le pending booking en localStorage et le finalise (génère tickets, sync Firestore)
 * - Sinon : affiche une erreur claire
 */
export default function PaiementReussiPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user, setUser } = useAuth()

  const sessionId = params.get('session_id')
  const bookingId = params.get('booking_id')

  const [state, setState] = useState('loading') // loading | success | error
  const [tickets, setTickets] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [eventName, setEventName] = useState('')

  useEffect(() => {
    if (!sessionId || !bookingId) {
      setState('error')
      setErrorMsg('Paramètres de session manquants.')
      return
    }

    let cancelled = false
    ;(async () => {
      // 1) Vérifier que la session Stripe est bien payée
      const result = await verifyStripeSession(sessionId)
      if (cancelled) return
      if (!result || !result.paid) {
        setState('error')
        setErrorMsg(result?.paymentStatus
          ? `Paiement non confirmé (${result.paymentStatus}).`
          : 'Impossible de vérifier le paiement. Si tu as été débité, contacte le support.')
        return
      }

      // 2) Récupérer la réservation en attente
      let pending = null
      try {
        const raw = localStorage.getItem(PENDING_KEY(bookingId))
        pending = raw ? JSON.parse(raw) : null
      } catch {}

      if (!pending) {
        // Cas où la session est ouverte sur un autre device : on affiche succès générique
        setState('success')
        setEventName(result.metadata?.eventName || 'ton événement')
        setTickets([])
        return
      }

      // 3) Générer les billets définitifs (1 par billet acheté)
      const newTickets = []
      const newBookings = []
      const qty = Number(pending.qty) || 1
      for (let n = 0; n < qty; n++) {
        const arr = new Uint32Array(1)
        crypto.getRandomValues(arr)
        const code = arr[0].toString(36).slice(0, 6).toUpperCase().padEnd(6, '0')
        const fullCode = `LIB-${String(pending.eventId).padStart(3, '0')}-${code}`
        const tOrder = (pending.perTicketOrders && pending.perTicketOrders[n]) || { items: {}, shows: {} }
        const tSummary = (pending.activeMenu || [])
          .filter(i => (tOrder.items[i.name] || 0) > 0)
          .map(i => ({ ...i }))
        const tPreorderTotal = (pending.activeMenu || [])
          .reduce((sum, i) => sum + (tOrder.items[i.name] || 0) * i.price, 0)
        const booking = {
          id: code,
          ticketCode: fullCode,
          eventId: pending.eventId,
          eventName: pending.eventName,
          eventDate: pending.eventDate,
          eventDateISO: pending.eventDateISO,
          eventStartTime: pending.eventStartTime,
          eventEndTime: pending.eventEndTime,
          place: pending.placeType,
          placePrice: pending.unitPriceEUR,
          preorderItems: { ...tOrder.items },
          preorderSummary: tSummary,
          preorderShowSelections: { ...tOrder.shows },
          totalPrice: pending.unitPriceEUR + tPreorderTotal,
          bookedAt: new Date().toISOString(),
          userId: pending.userId,
          userName: pending.userName || null,
          userEmail: pending.userEmail || null,
          paid: true,
          paymentMethod: 'stripe',
          stripeSessionId: sessionId,
        }
        const token = generateTicketToken(booking)
        booking.token = token
        newTickets.push({ ticketCode: fullCode, ticketToken: token, id: code })
        newBookings.push(booking)
      }

      // 4) Persister
      try {
        const prev = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
        const allBookings = [...prev, ...newBookings]
        localStorage.setItem('lib_bookings', JSON.stringify(allBookings))

        if (pending.userId) {
          import('../utils/firestore-sync').then(({ syncDoc }) => {
            const myBookings = allBookings.filter(b => b.userId === pending.userId)
            if (myBookings.length) syncDoc(`user_bookings/${pending.userId}`, { items: myBookings })
          }).catch(() => {})
        }

        // Points fidélité
        if (user && pending.userId === user.uid) {
          const newPoints = (user.points || 0) + qty
          setUser({ ...user, points: newPoints })
          import('../utils/firestore-sync').then(({ syncDoc }) => {
            syncDoc(`users/${user.uid}`, { points: newPoints })
          }).catch(() => {})
          import('../utils/accounts').then(({ updateAccount }) => {
            updateAccount(user.uid, { points: newPoints })
          }).catch(() => {})
        }
      } catch {}

      // 5) Cleanup pending
      try { localStorage.removeItem(PENDING_KEY(bookingId)) } catch {}

      setEventName(pending.eventName || '')
      setTickets(newTickets)
      setState('success')
    })()
    return () => { cancelled = true }
  }, [sessionId, bookingId, user, setUser])

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
                border: `2px solid ${COLORS.dim}`, borderTopColor: COLORS.teal,
                animation: 'spin 0.9s linear infinite',
              }} />
              <p style={{ fontFamily: FONTS.display, fontSize: 24, fontWeight: 300, color: 'rgba(255,255,255,0.92)', margin: 0 }}>
                Confirmation du paiement…
              </p>
              <p style={{ fontSize: 11, color: COLORS.muted, marginTop: 12, lineHeight: 1.7 }}>
                Ne ferme pas cette page, on génère tes billets.
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </>
          )}

          {state === 'success' && (
            <>
              {/* Check icon */}
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
                background: 'rgba(78,232,200,0.10)', border: `2px solid ${COLORS.teal}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.teal} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <p style={{ fontFamily: FONTS.display, fontSize: 28, fontWeight: 300, color: COLORS.teal, margin: '0 0 8px' }}>
                Paiement confirmé
              </p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', margin: 0, lineHeight: 1.7 }}>
                {tickets.length > 0
                  ? `${tickets.length} billet${tickets.length > 1 ? 's' : ''} pour ${eventName ? '« ' + eventName + ' »' : 'ton événement'} ${tickets.length > 1 ? 'sont disponibles' : 'est disponible'} dans ton compte.`
                  : `Ton paiement pour ${eventName ? '« ' + eventName + ' »' : 'cet événement'} est confirmé. Tes billets sont disponibles dans ton compte.`}
              </p>

              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
                <button
                  onClick={() => navigate('/profil')}
                  style={{
                    padding: '12px 18px', borderRadius: 4, cursor: 'pointer',
                    fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                    background: 'rgba(78,232,200,0.10)', border: `1px solid ${COLORS.teal}`, color: COLORS.teal,
                  }}
                >
                  Voir mes billets →
                </button>
                <button
                  onClick={() => navigate('/evenements')}
                  style={{
                    padding: '12px 18px', borderRadius: 4, cursor: 'pointer',
                    fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)',
                  }}
                >
                  Découvrir d'autres événements
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
                Une erreur est survenue
              </p>
              <p style={{ fontSize: 12, color: COLORS.muted, margin: 0, lineHeight: 1.7 }}>
                {errorMsg}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 28 }}>
                <a
                  href="mailto:hagechady@liveinblack.com?subject=Probl%C3%A8me%20de%20paiement"
                  style={{
                    padding: '12px 18px', borderRadius: 4,
                    fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                    background: 'rgba(200,169,110,0.10)', border: `1px solid ${COLORS.gold}`, color: COLORS.gold,
                    textDecoration: 'none', textAlign: 'center',
                  }}
                >
                  ✉ Contacter le support
                </a>
                <button
                  onClick={() => navigate('/')}
                  style={{
                    padding: '12px 18px', borderRadius: 4, cursor: 'pointer',
                    fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)',
                  }}
                >
                  Retour à l'accueil
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}
