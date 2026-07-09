import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { verifyStripeSession, verifyFedapayTransaction, releaseFedapayTransaction } from '../utils/stripe'
import { generateTicketToken } from '../utils/ticket'
import { useAuth } from '../context/AuthContext'
import { IconMail } from '../components/icons'

const FONT = 'Inter, sans-serif'
const FONTS = { display: FONT, mono: FONT }
const COLORS = {
  teal: '#4ee8c8',
  pink: '#e05aaa',
  gold: '#c8a96e',
  violet: '#8b5cf6',
  muted: 'rgba(255,255,255,0.55)',
  dim: 'rgba(255,255,255,0.22)',
}
const CARD = {
  background: 'linear-gradient(180deg, rgba(18,12,30,0.85), rgba(10,8,18,0.92))',
  backdropFilter: 'blur(24px) saturate(1.5)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 24,
  boxShadow: '0 30px 90px rgba(0,0,0,0.55)',
}
// Boutons réutilisables (style vitrine)
const btnPrimary = (c) => ({ padding: '15px 20px', borderRadius: 14, cursor: 'pointer', fontFamily: FONT, fontSize: 15, fontWeight: 700, border: 'none', width: '100%', color: '#04040b', background: `linear-gradient(135deg, ${c}, ${c}cc)`, boxShadow: `0 8px 26px ${c}44` })
const btnGhostS = { padding: '15px 20px', borderRadius: 14, cursor: 'pointer', fontFamily: FONT, fontSize: 15, fontWeight: 600, width: '100%', color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)' }

const PENDING_KEY = (id) => `lib_pending_booking_${id}`

/**
 * Page de retour après paiement — Stripe (?session_id=&booking_id=) OU
 * FedaPay (?id=&status=, apposés par FedaPay sur le callback_url).
 * - Vérifie la session/transaction côté serveur (statut paid)
 * - Si paid : récupère le pending booking en localStorage et le finalise (génère tickets, sync Firestore)
 * - FedaPay annulé/refusé → redirige vers /paiement-annule (restock serveur re-vérifié)
 */
export default function PaiementReussiPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { user, setUser } = useAuth()

  const sessionId = params.get('session_id')
  const fedapayTxnId = params.get('id')
  const isFedapay = !sessionId && !!fedapayTxnId
  const bookingIdParam = params.get('booking_id')

  const [state, setState] = useState('loading') // loading | success | pending | error
  const [tickets, setTickets] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [eventName, setEventName] = useState('')
  const [copied, setCopied] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const SUPPORT_EMAIL = 'hagechady@liveinblack.com'
  function copySupport() {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2200) }
    try {
      if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(SUPPORT_EMAIL).then(done).catch(done) }
      else {
        const ta = document.createElement('textarea'); ta.value = SUPPORT_EMAIL
        ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select()
        try { document.execCommand('copy') } catch {}
        document.body.removeChild(ta); done()
      }
    } catch { done() }
  }

  useEffect(() => {
    if ((!sessionId || !bookingIdParam) && !fedapayTxnId) {
      setState('error')
      setErrorMsg('Paramètres de session manquants.')
      return
    }

    let cancelled = false
    ;(async () => {
      // 1) Vérifier la session/transaction côté serveur. Cet endpoint peut échouer
      // (indispo, réseau, config) → on NE bloque PAS : le webhook (Stripe ou
      // FedaPay) fait autorité et a peut-être déjà émis les billets.
      let result = isFedapay
        ? await verifyFedapayTransaction(fedapayTxnId)
        : await verifyStripeSession(sessionId)
      if (cancelled) return
      let verified = !!(result && result.paid)

      // 1.5) RETOUR FEDAPAY NON PAYÉ — distinguer « abandon » de « en cours ».
      // FedaPay redirige ici via un callback_url unique et y appose ?status= et,
      // quand l'utilisateur FERME la page de paiement sans finaliser, ?close=true.
      // Sans ça, un abandon tombait dans l'état « Paiement bien reçu / on finalise »
      // → le client croyait avoir payé (et redouté un double débit).
      // On traite comme ABANDON : soit un statut terminal (canceled/declined/expired),
      // soit close=true. Statut TOUJOURS relu côté serveur (jamais le query param
      // seul pour de l'argent). Grâce courte pour le mobile money, qui peut
      // confirmer avec quelques secondes de retard après la fermeture du widget.
      if (isFedapay && !verified) {
        const closed = params.get('close') === 'true'
        const st = result?.paymentStatus || params.get('status') || ''
        const terminal = ['canceled', 'declined', 'expired'].includes(st)
        if (terminal || closed) {
          // close=true mais statut encore « pending » : le paiement mobile money
          // peut se finaliser juste après. On relaisse une chance au webhook, puis
          // on relit le statut serveur avant de conclure à l'annulation.
          if (!terminal) {
            await new Promise(r => setTimeout(r, 2500))
            if (cancelled) return
            const recheck = await verifyFedapayTransaction(fedapayTxnId)
            if (cancelled) return
            if (recheck && recheck.paid) { result = recheck; verified = true }
          }
          if (!verified) {
            releaseFedapayTransaction(fedapayTxnId)
            const evId = result?.metadata?.eventId || ''
            navigate(`/paiement-annule?provider=fedapay&txn_id=${encodeURIComponent(fedapayTxnId)}${evId ? `&event_id=${encodeURIComponent(evId)}` : ''}`, { replace: true })
            return
          }
        }
      }

      // FedaPay : le bookingId revient via les métadonnées serveur (le
      // callback_url ne porte pas de query custom). Dernier recours : l'unique
      // pending local.
      let bookingId = bookingIdParam || (isFedapay ? result?.metadata?.bookingId : null) || null
      if (!bookingId && isFedapay) {
        try {
          const keys = Object.keys(localStorage).filter(k => k.startsWith('lib_pending_booking_'))
          if (keys.length === 1) bookingId = keys[0].replace('lib_pending_booking_', '')
        } catch {}
      }
      if (!bookingId) {
        // Pas de réservation rapprochable ici — le webhook émet les billets, ils
        // apparaîtront dans « Mes billets ».
        setEventName(result?.metadata?.eventName || '')
        setTickets([])
        setState(verified ? 'success' : 'pending')
        return
      }

      // Identifiants de paiement propagés sur billets + registre anti-fraude :
      // le webhook rapproche par stripeSessionId (Stripe) ou fedapayTxnId (FedaPay).
      const payFields = isFedapay
        ? { paymentMethod: 'fedapay', fedapayTxnId }
        : { paymentMethod: 'stripe', stripeSessionId: sessionId }

      // 2) Récupérer la réservation en attente
      let pending = null
      try {
        const raw = localStorage.getItem(PENDING_KEY(bookingId))
        pending = raw ? JSON.parse(raw) : null
      } catch {}

      // 2.0) TABLE ENTIÈRE : le webhook émet TOUS les sièges (prix par siège juste,
      // tableId/hostUid pour l'attribution). Le client ne touche à rien — les
      // sièges arrivent dans « Mes billets » via la sync user_bookings. On évite
      // ainsi toute pré-génération ou adoption qui casserait le compte de sièges.
      if (pending?.isTable || result?.metadata?.isTable === '1') {
        try { localStorage.removeItem(PENDING_KEY(bookingId)) } catch {}
        setEventName(pending?.eventName || result?.metadata?.eventName || '')
        setTickets([])
        setState(verified ? 'success' : 'pending')
        return
      }

      // 2.5) SOURCE DE VÉRITÉ = webhook : si bookings/{bookingId} est payé avec
      // billets, on ADOPTE ses billets — MÊME si la vérif client a échoué. Ça
      // évite l'écran d'erreur alors que le billet a bien été émis, et évite les
      // doublons (1 achat = 1 seul jeu de billets).
      try {
        const { db } = await import('../firebase')
        const { doc, getDoc } = await import('firebase/firestore')
        // 2 tentatives : le webhook peut finir 1-2 s après notre arrivée
        let snap = await getDoc(doc(db, 'bookings', bookingId))
        if (!snap.exists()) {
          await new Promise(r => setTimeout(r, 1800))
          if (cancelled) return
          snap = await getDoc(doc(db, 'bookings', bookingId))
        }
        // Billets serveur présents mais PAS de pending local (paiement ouvert sur
        // un autre device) → succès générique à partir des billets serveur.
        if (!cancelled && !pending && snap.exists() && snap.data().paid === true && (snap.data().tickets || []).length) {
          const st = snap.data()
          setEventName(st.eventName || result?.metadata?.eventName || '')
          setTickets((st.tickets || []).map(t => ({ ticketCode: t.ticketCode, id: t.id, ticketToken: t.token || null })))
          setState('success')
          return
        }
        if (!cancelled && pending && snap.exists() && snap.data().paid === true && (snap.data().tickets || []).length) {
          const serverTickets = snap.data().tickets
          const adopted = []
          const adoptedBookings = []
          for (let n = 0; n < serverTickets.length; n++) {
            const st = serverTickets[n]
            // Réhydrater les précommandes PAR BILLET depuis le pending local —
            // avant, la branche adoption les vidait ({} / []) et le QR régénéré
            // perdait toutes les consos (le bar ne voyait plus rien).
            const tOrder = (pending.perTicketOrders && pending.perTicketOrders[n]) || { items: {}, shows: {} }
            const tSummary = (pending.activeMenu || [])
              .filter(i => (tOrder.items[i.name] || 0) > 0)
              .map(i => ({ ...i }))
            const tPreorderTotal = (pending.activeMenu || [])
              .reduce((sum, i) => sum + (tOrder.items[i.name] || 0) * i.price, 0)
            const booking = {
              id: st.id,
              ticketCode: st.ticketCode,
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
              currency: pending.currency || 'EUR',
              bookedAt: st.bookedAt || new Date().toISOString(),
              userId: pending.userId,
              userName: pending.userName || null,
              userEmail: pending.userEmail || null,
              paid: true,
              ...payFields,
            }
            const token = generateTicketToken(booking)
            booking.token = token
            adopted.push({ ticketCode: st.ticketCode, ticketToken: token, id: st.id })
            adoptedBookings.push(booking)
          }
          const prev = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
            .filter(b => (isFedapay ? b.fedapayTxnId !== fedapayTxnId : b.stripeSessionId !== sessionId)) // au cas où
          const all = [...prev, ...adoptedBookings]
          localStorage.setItem('lib_bookings', JSON.stringify(all))
          if (pending.userId) {
            import('../utils/firestore-sync').then(({ syncDoc }) => {
              const mine = all.filter(b => b.userId === pending.userId)
              if (mine.length) syncDoc(`user_bookings/${pending.userId}`, { items: mine })
            }).catch(() => {})
          }
          try { localStorage.removeItem(PENDING_KEY(bookingId)) } catch {}
          setEventName(pending.eventName || '')
          setTickets(adopted)
          setState('success')
          return
        }
      } catch {} // pas de doc / pas de droits → flux normal ci-dessous

      // 2.9) La vérif client a échoué ET le webhook n'a pas (encore) publié de
      // billets adoptables. On NE génère RIEN sans confirmation de paiement, mais
      // on n'affiche pas d'erreur anxiogène : état « en cours de confirmation »,
      // les billets émis par le webhook apparaîtront dans « Mes billets ».
      if (!verified) {
        setState('pending')
        setEventName(pending?.eventName || '')
        return
      }

      // Payé confirmé mais pas de pending local (autre device) → succès générique
      if (!pending) {
        setState('success')
        setEventName(result?.metadata?.eventName || 'ton événement')
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
          currency: pending.currency || 'EUR',
          bookedAt: new Date().toISOString(),
          userId: pending.userId,
          userName: pending.userName || null,
          userEmail: pending.userEmail || null,
          paid: true,
          ...payFields,
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
            // Registre anti-fraude tickets/{code} — filet si le webhook (Stripe
            // ou FedaPay) n'a pas encore tourné. Les règles n'autorisent que
            // paid:false côté client ; le webhook (Admin SDK) écrasera avec paid:true.
            for (const b of newBookings) {
              syncDoc(`tickets/${b.ticketCode}`, {
                ticketCode: b.ticketCode,
                eventId: b.eventId,
                eventName: b.eventName,
                place: b.place,
                // Prix payé figé au moment de la vente (les stats lisent ce champ
                // en priorité — jamais recalculé depuis le tarif actuel)
                placePrice: b.placePrice != null ? Number(b.placePrice) : 0,
                currency: b.currency || 'EUR',
                userId: pending.userId,
                paid: false,
                source: 'client-postpay',
                bookedAt: b.bookedAt,
                ...(isFedapay ? { fedapayTxnId } : { stripeSessionId: sessionId }),
              })
            }
          }).catch(() => {})
        }

        // Points fidélité — incrément ATOMIQUE serveur (évite la perte de
        // points en multi-onglet sur la page de succès ; cohérent avec le webhook)
        if (user && pending.userId === user.uid) {
          const newPoints = (user.points || 0) + qty
          setUser({ ...user, points: newPoints })
          import('../utils/firestore-sync').then(({ syncIncrement }) => {
            syncIncrement(`users/${user.uid}`, 'points', qty)
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
  }, [sessionId, fedapayTxnId, bookingIdParam, user, setUser, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh borné : tant que « en attente », on re-vérifie tout seul toutes
  // les 3,5 s (jusqu'à 5 fois) — le webhook finit en général en quelques secondes.
  // Re-vérification idempotente côté serveur → l'utilisateur n'a plus à cliquer.
  useEffect(() => {
    if (state !== 'pending' || attempt >= 5) return
    const t = setTimeout(() => setAttempt(a => a + 1), 3500)
    return () => clearTimeout(t)
  }, [state, attempt])

  const successMsg = tickets.length > 0
    ? `${tickets.length} billet${tickets.length > 1 ? 's' : ''} pour ${eventName ? '« ' + eventName + ' »' : 'ton événement'} ${tickets.length > 1 ? 'sont disponibles' : 'est disponible'} dans ton compte.`
    : `Ton paiement pour ${eventName ? '« ' + eventName + ' »' : 'cet événement'} est confirmé. Tes billets sont disponibles dans ton compte.`

  return (
    <Layout hideNav>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{
        minHeight: 'calc(100vh - 80px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 20px', fontFamily: FONT,
      }}>
        <div style={{ ...CARD, padding: '40px 32px', maxWidth: 460, width: '100%', textAlign: 'center' }}>

          {state === 'loading' && (
            <>
              <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 26px', border: `3px solid rgba(255,255,255,0.1)`, borderTopColor: COLORS.teal, animation: 'spin 0.9s linear infinite' }} />
              <h1 style={{ fontFamily: FONT, fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff', margin: 0 }}>
                Confirmation du paiement…
              </h1>
              <p style={{ fontSize: 14, color: COLORS.muted, marginTop: 12, lineHeight: 1.6 }}>
                Ne ferme pas cette page, on prépare tes billets.
              </p>
            </>
          )}

          {state === 'success' && (
            <>
              <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 26px', background: 'rgba(78,232,200,0.12)', border: `2px solid ${COLORS.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px -8px rgba(78,232,200,0.5)' }}>
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={COLORS.teal} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <h1 style={{ fontFamily: FONT, fontSize: 28, fontWeight: 800, letterSpacing: '-0.8px', color: '#fff', margin: '0 0 10px' }}>
                Paiement confirmé
              </h1>
              <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.55 }}>{successMsg}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 30 }}>
                <button onClick={() => navigate('/profil')} style={btnPrimary(COLORS.teal)}>Voir mes billets →</button>
                <button onClick={() => navigate('/evenements')} style={btnGhostS}>Découvrir d'autres événements</button>
              </div>
            </>
          )}

          {state === 'pending' && (
            <>
              <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 26px', background: 'rgba(139,92,246,0.12)', border: `2px solid ${COLORS.violet}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px -8px rgba(139,92,246,0.5)' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.violet} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              </div>
              <h1 style={{ fontFamily: FONT, fontSize: 27, fontWeight: 800, letterSpacing: '-0.7px', color: '#fff', margin: '0 0 10px' }}>
                Paiement bien reçu
              </h1>
              <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.65)', margin: 0, lineHeight: 1.6 }}>
                On finalise {eventName ? '« ' + eventName + ' »' : 'ta réservation'}. Tes billets arrivent dans <strong style={{ color: '#fff' }}>Mes billets</strong> d'ici quelques instants — inutile de repayer.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 30 }}>
                <button onClick={() => navigate('/profil')} style={btnPrimary(COLORS.violet)}>Voir mes billets →</button>
                <button onClick={() => setAttempt(a => a + 1)} style={btnGhostS}>Vérifier maintenant</button>
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 14 }}>
                {attempt < 5 ? 'Vérification automatique en cours…' : 'Tes billets apparaîtront dans « Mes billets » dès confirmation.'}
              </p>
            </>
          )}

          {state === 'error' && (
            <>
              <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 26px', background: 'rgba(224,90,170,0.10)', border: `2px solid rgba(224,90,170,0.5)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.pink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="13" /><circle cx="12" cy="16.5" r="0.6" fill={COLORS.pink} /></svg>
              </div>
              <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', color: '#fff', margin: '0 0 10px' }}>
                Un souci est survenu
              </h1>
              <p style={{ fontSize: 14, color: COLORS.muted, margin: 0, lineHeight: 1.6 }}>{errorMsg}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 30 }}>
                <button onClick={copySupport} style={{ ...btnPrimary(COLORS.gold), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                  <IconMail size={16} color="#04040b" />
                  {copied ? 'Adresse copiée ✓' : 'Copier l’email du support'}
                </button>
                <button onClick={() => navigate('/profil')} style={btnGhostS}>Voir mes billets</button>
                <button onClick={() => navigate('/')} style={{ ...btnGhostS, border: 'none', background: 'none', color: 'rgba(255,255,255,0.4)' }}>Retour à l'accueil</button>
              </div>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)', marginTop: 16 }}>{SUPPORT_EMAIL}</p>
            </>
          )}
        </div>
      </div>
    </Layout>
  )
}
