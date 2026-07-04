import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import jsQR from 'jsqr'
import { verifyTicketToken } from '../utils/ticket'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import {
  listenOrders, getOrders, ensurePreordersMaterialized, addOnsiteItem, serveItem,
  cancelItem, markTicketPaid, getStaffRole, canServe, canManage,
  listenOrderLog, getOrderLog, getMyStaffEvents, listenEventStaff, listenMyStaffAssignments,
  ORDER_SOURCE, ONSITE_STATUS, PREORDER_STATUS, ONSITE_STATUS_LABEL, ONSITE_STATUS_COLOR,
} from '../utils/eventOrders'

// Mock tickets — vidé : le scanner repose sur le registre Firestore tickets/{code}
const MOCK_TICKETS = {}

const MOCK_ORDERS = {}

// ── Validité métier de l'événement d'un billet (anti « ancien événement ») ──
// Récupère l'event réel côté Firestore pour vérifier qu'un billet scanné
// concerne bien un événement en cours (et, pour un organisateur, LE SIEN).
async function fetchEventForScan(eventId) {
  if (!eventId) return null
  try {
    const { db, USE_REAL_FIREBASE } = await import('../firebase')
    if (USE_REAL_FIREBASE) {
      const { doc, getDoc } = await import('firebase/firestore')
      const snap = await getDoc(doc(db, 'events', String(eventId)))
      if (snap.exists()) return { id: String(eventId), ...snap.data() }
    }
  } catch {}
  // Secours hors-ligne : cache local (events créés / cache public)
  try {
    for (const key of ['lib_created_events', 'lib_events_cache']) {
      const found = JSON.parse(localStorage.getItem(key) || '[]').find(e => String(e.id) === String(eventId))
      if (found) return found
    }
  } catch {}
  return null
}

// L'événement est-il terminé ? (annulé, ou fin + 12h de tolérance dépassée).
// On sert les consos PENDANT la soirée : au-delà, un billet passé ne l'ouvre plus.
function isEventOver(ev) {
  try {
    if (!ev) return false
    if (ev.cancelled) return true
    const GRACE = 12 * 3600 * 1000
    if (ev.closingDate) return new Date(ev.closingDate).getTime() + GRACE < Date.now()
    if (!ev.date) return false
    const endTime = ev.endTime || ev.time || '23:59'
    const [h, m] = String(endTime).split(':').map(Number)
    const d = new Date(ev.date + 'T00:00:00'); d.setHours(h, m, 0, 0)
    const startTime = ev.time || '00:00'
    const [sh, sm] = String(startTime).split(':').map(Number)
    if (h < sh || (h === sh && m < sm)) d.setDate(d.getDate() + 1) // croise minuit
    return d.getTime() + GRACE < Date.now()
  } catch { return false }
}

// ─── Design tokens ────────────────────────────────────────────────────────
const CARD = {
  background: 'rgba(8,10,20,0.55)',
  backdropFilter: 'blur(22px) saturate(1.6)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 12,
}

const FONTS = {
  display: "Inter, sans-serif",
  // Plus de DM Mono : tout passe en Inter pour rester cohérent avec le reste de
  // l'app (codes billets inclus, déjà affichés en Inter ailleurs).
  mono: "Inter, sans-serif",
}

const COLORS = {
  teal: '#4ee8c8',
  pink: '#e05aaa',
  gold: '#c8a96e',
  muted: 'rgba(255,255,255,0.42)',
  dim: 'rgba(255,255,255,0.22)',
}

const STATUS = {
  valid:          { borderColor: 'rgba(78,232,200,0.40)',  bg: 'rgba(78,232,200,0.07)',  iconColor: COLORS.teal, label: 'VALIDE',         sub: 'Accès autorisé' },
  just_validated: { borderColor: 'rgba(78,232,200,0.40)',  bg: 'rgba(78,232,200,0.07)',  iconColor: COLORS.teal, label: 'VALIDÉ',         sub: 'Billet marqué comme utilisé' },
  used:           { borderColor: 'rgba(200,169,110,0.40)', bg: 'rgba(200,169,110,0.07)', iconColor: COLORS.gold, label: 'DÉJÀ UTILISÉ',   sub: 'Ce billet a déjà été scanné' },
  invalid:        { borderColor: 'rgba(224,90,170,0.40)',  bg: 'rgba(224,90,170,0.07)',  iconColor: COLORS.pink, label: 'INVALIDE',       sub: 'QR code non reconnu' },
  offline:        { borderColor: 'rgba(200,169,110,0.40)', bg: 'rgba(200,169,110,0.07)', iconColor: COLORS.gold, label: 'HORS-LIGNE',      sub: 'Vérification impossible — reconnecte-toi' },
  wrong_event:    { borderColor: 'rgba(200,169,110,0.40)', bg: 'rgba(200,169,110,0.07)', iconColor: COLORS.gold, label: 'BILLET REFUSÉ',   sub: 'Ce billet ne concerne pas cet événement' },
}

// ── Camera component ────────────────────────────────────────────────
function CameraScanner({ active, onScan, onError }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    if (!active) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    let mounted = true

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then(stream => {
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().then(tick)
        }
      })
      .catch(err => {
        const map = {
          NotAllowedError: 'Caméra refusée. Autorise-la dans les réglages de ton navigateur, puis réessaie.',
          NotFoundError: 'Aucune caméra détectée sur cet appareil.',
          NotReadableError: 'Caméra déjà utilisée par une autre application. Ferme-la et réessaie.',
          OverconstrainedError: 'Caméra incompatible. Essaie un autre appareil.',
          SecurityError: 'Caméra bloquée. Vérifie que tu es bien en connexion sécurisée (HTTPS).',
        }
        onError(map[err?.name] || 'Caméra inaccessible. Réessaie ou utilise la saisie manuelle.')
      })

    function tick() {
      if (!mounted) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0)
      const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
      if (code?.data) {
        mounted = false
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        onScan(code.data)
      } else {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    return () => {
      mounted = false
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [active])

  return (
    <>
      <video ref={videoRef} playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {/* Scanning overlay */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ position: 'relative', width: 200, height: 200 }}>
          {/* Corner brackets */}
          {[
            { top: 0, left: 0,    borderTop: `2px solid ${COLORS.teal}`, borderLeft: `2px solid ${COLORS.teal}` },
            { top: 0, right: 0,   borderTop: `2px solid ${COLORS.teal}`, borderRight: `2px solid ${COLORS.teal}` },
            { bottom: 0, left: 0, borderBottom: `2px solid ${COLORS.teal}`, borderLeft: `2px solid ${COLORS.teal}` },
            { bottom: 0, right: 0,borderBottom: `2px solid ${COLORS.teal}`, borderRight: `2px solid ${COLORS.teal}` },
          ].map((s, i) => (
            <div key={i} style={{ position: 'absolute', width: 24, height: 24, ...s }} />
          ))}
          <div style={{
            position: 'absolute', left: 6, right: 6, height: 1.5,
            background: `linear-gradient(90deg, transparent, ${COLORS.teal}, transparent)`,
            animation: 'scanLine 1.5s ease-in-out infinite', top: '10%',
          }} />
        </div>
      </div>
      <p style={{
        position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center',
        fontFamily: FONTS.mono, fontSize: 10, color: COLORS.teal,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        animation: 'pulse 2s infinite',
      }}>
        Lecture en cours...
      </p>
    </>
  )
}

// ── Main page ───────────────────────────────────────────────────────
// Wrapper de GARDE isolé : il n'a qu'un jeu de hooks FIXE (useAuth/useState/useEffect)
// et décide entre l'écran « accès refusé » et <ScannerInner/>. Les ~40 hooks de
// ScannerInner ne montent QUE si l'accès est accordé → si le rôle/statut change en
// cours de session (snapshot users/{uid} → setUser), ScannerInner monte/démonte en
// bloc et l'ordre des hooks n'est jamais violé (fix crash « rendered more hooks »).
export default function ScannerPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const myId = getUserId(user)

  // isStaff RÉACTIF : ScannerPage n'est pas rendu sous Layout, donc le listener staff
  // de Layout ne tourne pas ici. Sans listener LOCAL, un deep-link / appareil neuf
  // (cache lib_my_staff froid) bloquerait à tort un membre légitime, définitivement
  // (car figé). On monte donc un listener propre qui débloque dès résolution.
  const [isStaffMember, setIsStaffMember] = useState(() => getMyStaffEvents(myId).length > 0)
  useEffect(() => {
    if (!myId) return
    const unsub = listenMyStaffAssignments(myId, list => setIsStaffMember(list.length > 0))
    return () => unsub()
  }, [myId])

  // Guard: agent, organisateur, OU membre staff d'au moins un événement.
  const userRole = user?.role || user?.activeRole
  if (user && userRole !== 'agent' && userRole !== 'organisateur' && !isStaffMember) {
    return (
      <div style={{ minHeight: '100dvh', background: '#04040b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <span style={{ fontSize: 40 }}>🚫</span>
        <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, textAlign: 'center' }}>Cette page est réservée aux agents, organisateurs et à l'équipe d'un événement.</p>
        <button onClick={() => navigate('/')} style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.teal, background: 'none', border: '1px solid rgba(78,232,200,0.3)', borderRadius: 6, padding: '8px 20px', cursor: 'pointer' }}>Retour</button>
      </div>
    )
  }
  return <ScannerInner />
}

function ScannerInner() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const myId = getUserId(user)

  // Mode initial : deep-link depuis « Mes soirées » (state.mode) — un serveur arrive
  // en mode service (POS bar), un contrôle entrée en mode entrée.
  const [scanMode, setScanMode] = useState(location.state?.mode === 'service' ? 'service' : 'entry') // 'entry' | 'service'
  // Événements résolus au scan (id → doc), pour recalculer le rôle en direct.
  const eventsByIdRef = useRef({})

  // Camera state (shared)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')

  // Entry mode
  const [manualCode, setManualCode] = useState('')
  const [result, setResult] = useState(null)
  const [usedCodes, setUsedCodes] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('lib_used_tickets') || '[]')) } catch { return new Set() }
  })

  // Service mode — POS multi-billets (onglets persistants + temps réel Firestore)
  // On scanne un billet UNE fois → il devient un onglet. Plus besoin de rescanner
  // pour agir dessus. Les commandes (précos + sur place) viennent de listenOrders
  // (event_orders/{eventId}) → l'état « servi/payé » est partagé cross-device.
  const [serviceCode, setServiceCode] = useState('')
  const [openTickets, setOpenTickets] = useState([]) // [{ code, holder, place, eventId, eventName }]
  const [activeCode, setActiveCode] = useState(null)
  const [ordersByEvent, setOrdersByEvent] = useState({}) // { eventId: OrderItem[] }
  const [roleByEvent, setRoleByEvent] = useState({})     // { eventId: 'manager'|'serveur'|'scan'|null }
  const [menuByEvent, setMenuByEvent] = useState({})     // { eventId: [menuItem] }
  const [scanReject, setScanReject] = useState(null)     // { title, sub } — billet refusé
  const [posMsg, setPosMsg] = useState('')               // feedback d'action
  const [cancelFor, setCancelFor] = useState(null)       // item en cours d'annulation (manager)
  const [cancelReason, setCancelReason] = useState('')
  const [closeConfirm, setCloseConfirm] = useState(null) // onglet en cours de clôture (confirmation)
  const [addPicker, setAddPicker] = useState(false)      // menu d'ajout serveur ouvert
  const [posScanning, setPosScanning] = useState(false)  // scanner affiché par-dessus les onglets
  const [showHistory, setShowHistory] = useState(false)  // historique complet (manager)
  const [logByEvent, setLogByEvent] = useState({})       // { eventId: [LogEntry] }

  // Écoute temps réel des commandes pour chaque événement présent dans les onglets.
  const openEventIds = [...new Set(openTickets.map(t => t.eventId).filter(Boolean))]
  useEffect(() => {
    const unsubs = openEventIds.map(eid =>
      listenOrders(eid, items => setOrdersByEvent(prev => ({ ...prev, [eid]: items })))
    )
    // Sync INTER-ONGLETS (même appareil) : un ajout client dans un autre onglet
    // écrit localStorage → on relit tous les events ouverts. (Cross-device = Firestore.)
    const onStorage = e => {
      if (e && e.key !== 'lib_event_orders') return
      openEventIds.forEach(eid => setOrdersByEvent(prev => ({ ...prev, [eid]: getOrders(eid) })))
    }
    window.addEventListener('storage', onStorage)
    return () => { unsubs.forEach(u => u()); window.removeEventListener('storage', onStorage) }
  }, [openEventIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Rôle staff RÉACTIF au roster : sans ça, un serveur retiré en pleine soirée
  // gardait ses droits (rôle figé au scan). On réabonne event_staff/{eid} et on
  // recalcule roleByEvent en direct → révocation immédiate des boutons Servir/Encaisser.
  useEffect(() => {
    if (!openEventIds.length) return
    const unsubs = openEventIds.map(eid =>
      listenEventStaff(eid, () => {
        setRoleByEvent(prev => ({ ...prev, [eid]: getStaffRole(eid, user, eventsByIdRef.current[eid]) }))
      })
    )
    return () => unsubs.forEach(u => { try { u() } catch {} })
  }, [openEventIds.join(','), user]) // eslint-disable-line react-hooks/exhaustive-deps

  const flashPos = msg => { setPosMsg(msg); setTimeout(() => setPosMsg(''), 2400) }

  // Historique complet de la soirée (journal d'audit) — manager uniquement.
  useEffect(() => {
    if (!showHistory) return
    const t = openTickets.find(x => x.code === activeCode)
    const eid = t?.eventId
    if (!eid || !canManage(roleByEvent[eid])) return
    setLogByEvent(prev => ({ ...prev, [eid]: getOrderLog(eid) })) // optimiste local
    const unsub = listenOrderLog(eid, entries => setLogByEvent(prev => ({ ...prev, [eid]: entries })))
    return () => unsub()
  }, [showHistory, activeCode, roleByEvent]) // eslint-disable-line react-hooks/exhaustive-deps

  function markUsed(code) {
    // Re-read localStorage to catch validations from other scanners/devices
    let persisted = new Set()
    try { persisted = new Set(JSON.parse(localStorage.getItem('lib_used_tickets') || '[]')) } catch {}
    const next = new Set([...persisted, code])
    const arr = [...next]
    // Write outside of setState to avoid Strict Mode double-call side effects
    try { localStorage.setItem('lib_used_tickets', JSON.stringify(arr)) } catch {}
    setUsedCodes(next)
    // Sync each validated ticket as its own Firestore doc for cross-scanner awareness
    if (myId) {
      import('../utils/firestore-sync').then(({ syncDoc }) => {
        syncDoc(`used_tickets/${myId}`, { items: arr, updatedAt: new Date().toISOString() })
        // Marque aussi le check-in directement sur le billet — utilisé par la
        // guestlist de l'organisateur pour afficher « ✓ Arrivé » sans dépendre
        // du registre per-agent ci-dessus (qui ne se croise pas entre scanners).
        syncDoc(`tickets/${code}`, { checkedInAt: new Date().toISOString(), checkedInBy: myId })
      }).catch(() => {})
    }
  }

  // ── Vérification autoritaire contre le registre Firestore tickets/{code} ──
  // C'est LA défense anti-fraude : un billet payé n'existe dans ce registre que
  // s'il a été créé par le webhook Stripe (Admin SDK). Un QR falsifié — même
  // avec une signature valide — ne correspondra à aucune entrée → rejeté.
  async function lookupTicketRegistry(code) {
    try {
      const { db, auth, USE_REAL_FIREBASE } = await import('../firebase')
      if (!USE_REAL_FIREBASE) return { error: true }
      // Session Firebase expirée → les règles refuseraient la lecture et le
      // billet paraîtrait faussement invalide. On le signale explicitement.
      if (!auth?.currentUser) return { error: true, authMissing: true }
      const { doc, getDoc } = await import('firebase/firestore')
      const snap = await getDoc(doc(db, 'tickets', code))
      if (!snap.exists()) return { found: false }
      const d = snap.data()
      return { found: true, paid: d.paid === true, revoked: d.revoked === true, data: d }
    } catch {
      return { error: true }
    }
  }

  // ── Code processing ──
  async function processCode(rawValue) {
    setCameraActive(false)
    const val = rawValue.trim()
    // Merge in-memory set with persisted set to catch cross-device validations
    let currentUsed = usedCodes
    try {
      const persisted = new Set(JSON.parse(localStorage.getItem('lib_used_tickets') || '[]'))
      if (persisted.size > usedCodes.size) {
        currentUsed = persisted
        setUsedCodes(persisted)
      }
    } catch {}

    // URL with embedded token: http://…/ticket/{token}
    const tokenMatch = val.match(/\/ticket\/([A-Za-z0-9_-]+)/)
    if (tokenMatch) {
      const { valid, data } = verifyTicketToken(tokenMatch[1])
      if (!valid || !data) { setResult({ code: val, status: 'invalid' }); return }
      const tc = data.tc
      const isUsed = currentUsed.has(tc)
      const reg = await lookupTicketRegistry(tc)
      if (reg.authMissing) {
        setResult({ code: tc, status: 'offline', offline: true, sub: 'Session expirée — déconnecte-toi et reconnecte-toi pour scanner' })
        return
      }
      if (reg.found === false) {
        // Signature OK mais billet absent du registre = jamais émis par l'app
        setResult({ code: tc, status: 'invalid', sub: 'Billet introuvable dans le registre — possible falsification' })
        return
      }
      if (reg.revoked) {
        setResult({ code: tc, status: 'invalid', sub: "Invitation annulée par l'organisateur" })
        return
      }
      if (reg.error) {
        // Registre injoignable : la signature du token NE SUFFIT PAS (la clé est
        // dans le bundle public → falsifiable). Sans confirmation du registre,
        // on n'affiche JAMAIS « valide » — le videur doit re-scanner avec du réseau.
        setResult({ code: tc, status: 'offline', offline: true, sub: 'Registre injoignable — impossible de certifier ce billet. Re-scanne avec du réseau.' })
        return
      }
      // Garde événement : billet d'un event terminé / pas le tien → refusé
      // (avant, un billet d'un ancien événement passait « VALIDE »).
      const guard = await eventScanGuard(reg.data?.eventId || data.ei)
      if (guard) { setResult({ code: tc, status: 'wrong_event', sub: guard.sub, ticket: { holder: data.gn || 'Participant', type: data.pl, event: data.en } }); return }
      // Précommandes : le REGISTRE (écrit par le webhook depuis les line_items
      // Stripe) prime sur le token — le token est signé côté client avec une
      // clé publique, donc falsifiable (champagne gratuit au bar sinon).
      const regPo = Array.isArray(reg.data?.preorders)
        ? reg.data.preorders.map(i => ({ n: i.name, e: i.emoji || '', q: Number(i.qty) || 0, p: Number(i.priceEUR) || 0 })).filter(i => i.q > 0)
        : null
      setResult({
        code: tc,
        status: isUsed ? 'used' : 'valid',
        ticket: { holder: data.gn || 'Participant', type: data.pl, event: data.en, date: data.ed, price: `${data.tp}€` },
        preorders: regPo ?? (data.po || []),
        preordersCertified: regPo != null,
        paidConfirmed: reg.paid,
        freeTicket: reg.data?.source === 'free',
        isGuestlist: reg.data?.source === 'guestlist',
      })
      return
    }

    // Raw ticket code (LIB-XXX-XXXXXX)
    const clean = val.toUpperCase()

    // Registre Firestore d'abord — fonctionne cross-device (le billet du client
    // n'est jamais dans le localStorage du scanner).
    // Les IDs de documents sont sensibles à la casse : on tente le code tel
    // que saisi PUIS la version majuscules (saisie manuelle approximative).
    let reg = await lookupTicketRegistry(val)
    if (!reg.found && !reg.error && clean !== val) reg = await lookupTicketRegistry(clean)

    // Session expirée : impossible de vérifier — le dire clairement plutôt
    // que d'afficher un faux « invalide » au videur
    if (reg.authMissing) {
      setResult({ code: clean, status: 'offline', offline: true, sub: 'Session expirée — déconnecte-toi et reconnecte-toi pour scanner' })
      return
    }
    if (reg.found) {
      if (reg.revoked) {
        setResult({ code: clean, status: 'invalid', sub: "Invitation annulée par l'organisateur" })
        return
      }
      const guard = await eventScanGuard(reg.data?.eventId)
      if (guard) { setResult({ code: clean, status: 'wrong_event', sub: guard.sub, ticket: { holder: reg.data.guestName || 'Participant', type: reg.data.place || '—', event: reg.data.eventName || '—' } }); return }
      const isUsed = currentUsed.has(clean)
      setResult({
        code: clean,
        status: isUsed ? 'used' : 'valid',
        ticket: { holder: reg.data.guestName || 'Participant', type: reg.data.place || '—', event: reg.data.eventName || '—', date: '', price: '' },
        // Précommandes certifiées par le webhook (registre) — avant, un scan
        // par code brut affichait toujours « aucune conso » (preorders: [])
        preorders: Array.isArray(reg.data?.preorders)
          ? reg.data.preorders.map(i => ({ n: i.name, e: i.emoji || '', q: Number(i.qty) || 0, p: Number(i.priceEUR) || 0 })).filter(i => i.q > 0)
          : [],
        preordersCertified: Array.isArray(reg.data?.preorders),
        paidConfirmed: reg.paid,
        freeTicket: reg.data?.source === 'free',
        isGuestlist: reg.data?.source === 'guestlist',
      })
      return
    }

    // Check real bookings in localStorage (fallback hors-ligne / legacy)
    try {
      const bookings = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      const booking = bookings.find(b => b.ticketCode === clean)
      if (booking) {
        const isUsed = currentUsed.has(clean)
        setResult({
          code: clean,
          status: isUsed ? 'used' : 'valid',
          ticket: { holder: booking.userName || 'Participant', type: booking.place, event: booking.eventName, date: booking.eventDate, price: `${booking.totalPrice}€` },
          preorders: (booking.preorderSummary || []).map(i => ({ n: i.name, e: i.emoji || '', q: (booking.preorderItems || {})[i.name] || 0, p: i.price })),
          offline: !!reg.error,
        })
        return
      }
    } catch {}

    // Demo / mock fallback
    const ticket = MOCK_TICKETS[clean]
    if (!ticket) {
      // Si le registre Firestore était INJOIGNABLE (réseau) et qu'on n'a rien
      // trouvé en local, on ne peut PAS conclure « invalide » — ce serait un
      // faux positif de fraude. On le signale comme vérification hors-ligne.
      if (reg.error) {
        setResult({ code: clean, status: 'offline', offline: true, sub: 'Registre injoignable — vérifie ta connexion et re-scanne' })
      } else {
        setResult({ code: clean, status: 'invalid' })
      }
      return
    }
    if (ticket.used || currentUsed.has(clean)) { setResult({ code: clean, status: 'used', ticket }); return }
    setResult({ code: clean, status: 'valid', ticket })
  }

  function validateEntry() {
    if (result?.status === 'valid') {
      markUsed(result.code)
      setResult(r => ({ ...r, status: 'just_validated' }))
    }
  }

  function reset() { setResult(null); setManualCode(''); setCameraError('') }

  // Garde métier partagée (entrée ET service) : renvoie un motif de rejet si
  // l'événement du billet est terminé ou n'appartient pas à l'organisateur qui
  // scanne. Best-effort : hors-ligne / event introuvable → null (on ne bloque pas).
  async function eventScanGuard(eventId) {
    if (!eventId) return null
    const ev = await fetchEventForScan(eventId)
    if (!ev) return null
    if (isEventOver(ev)) return { title: 'Événement terminé', sub: "Ce billet est celui d'un événement passé." }
    if (userRole === 'organisateur' && String(ev.organizerId || '') !== String(myId) && String(ev.createdBy || '') !== String(myId)) {
      return { title: 'Pas ton événement', sub: "Ce billet appartient à un événement que tu n'organises pas." }
    }
    return null
  }

  // ── Service mode ──
  // Les consos affichées au bar viennent EN PRIORITÉ du registre tickets/
  // (préco figées par le webhook depuis les line_items Stripe payés) — le
  // token client (data.po) n'est plus qu'un fallback hors-ligne/legacy,
  // sa signature étant falsifiable (clé publique dans le bundle).
  async function lookupOrder(rawValue) {
    setCameraActive(false); setScanReject(null)
    const val = rawValue.trim()
    const clean = val.toUpperCase()

    const regPre = (reg) => Array.isArray(reg?.data?.preorders)
      ? reg.data.preorders.map(i => ({ name: i.name, emoji: i.emoji || '', qty: Number(i.qty) || 0, priceEUR: Number(i.priceEUR) || 0 })).filter(i => i.qty > 0)
      : null

    // 1) Résoudre le code + le payload token (le cas échéant)
    const tokenMatch = val.match(/\/ticket\/([A-Za-z0-9_-]+)/)
    let code = clean, tokenData = null
    if (tokenMatch) {
      const { valid, data } = verifyTicketToken(tokenMatch[1])
      if (!valid || !data) { setScanReject({ title: 'QR invalide', sub: "Ce QR code n'est pas reconnu." }); return }
      tokenData = data; code = data.tc
    }

    // 2) Registre autoritaire (cross-device, certifié par le webhook)
    let reg = await lookupTicketRegistry(code)
    if (!reg.found && !reg.error && clean !== code) reg = await lookupTicketRegistry(clean)

    // Booking local (secours hors-ligne : fournit eventId + méta si le registre
    // est injoignable et qu'il n'y a pas de token).
    let localBooking = null
    try { localBooking = JSON.parse(localStorage.getItem('lib_bookings') || '[]').find(b => b.ticketCode === code || b.ticketCode === clean) || null } catch {}

    // 3) VALIDATION MÉTIER — l'événement doit être EN COURS et, pour un
    //    organisateur, LE SIEN. Ferme la faille « ancien événement ».
    const eventId = reg?.data?.eventId || tokenData?.ei || localBooking?.eventId || null
    if (!eventId) { setScanReject({ title: 'Événement introuvable', sub: "Impossible de rattacher ce billet à un événement." }); return }
    const ev = await fetchEventForScan(eventId)
    if (ev) {
      if (isEventOver(ev)) { setScanReject({ title: 'Événement terminé', sub: "Ce billet est celui d'un événement passé — commandes closes." }); return }
      if (userRole === 'organisateur' && String(ev.organizerId || '') !== String(myId) && String(ev.createdBy || '') !== String(myId)) {
        setScanReject({ title: 'Pas ton événement', sub: "Ce billet appartient à un événement que tu n'organises pas." }); return
      }
    }

    // 4) Méta billet + précommandes (registre certifié > token > booking local)
    let holder = 'Participant', place = '—', eventName = ev?.name || tokenData?.en || '—', preorders = []
    if (reg?.found) {
      holder = reg.data.guestName || 'Participant'; place = reg.data.place || '—'; eventName = reg.data.eventName || eventName
      preorders = regPre(reg) || []
    } else if (tokenData) {
      place = tokenData.pl || '—'
      preorders = (tokenData.po || []).map(i => ({ name: i.n, emoji: i.e || '', qty: i.q, priceEUR: i.p })).filter(i => i.qty > 0)
    } else if (localBooking) {
      const b = localBooking
      holder = b.userName || 'Participant'; place = b.place || '—'; eventName = b.eventName || eventName
      preorders = (b.preorderSummary || []).map(i => ({ name: i.name, emoji: i.emoji || '', qty: (b.preorderItems || {})[i.name] || 0, priceEUR: i.price })).filter(i => i.qty > 0)
    }

    // 5) Rôle staff + menu de l'événement (pour l'ajout serveur de consos)
    const role = getStaffRole(eventId, user, ev)
    const localActor = { uid: myId, id: myId, name: user?.name || user?.displayName || 'Staff', _staffRole: role }
    eventsByIdRef.current[eventId] = ev // mémorise l'event pour le recalcul live du rôle
    setRoleByEvent(prev => ({ ...prev, [eventId]: role }))
    setMenuByEvent(prev => ({ ...prev, [eventId]: (ev?.menu || []).filter(m => m && m.name && m.available !== false) }))

    // 6) Matérialise les précommandes en lignes de commande (idempotent)
    if (preorders.length) await ensurePreordersMaterialized(eventId, code, preorders, localActor)

    // 7) Ouvre/active l'onglet — plus besoin de rescanner pour y revenir.
    //    Lecture optimiste locale immédiate (le listener temps réel prend ensuite le relais).
    setOrdersByEvent(prev => ({ ...prev, [eventId]: getOrders(eventId) }))
    setOpenTickets(prev => prev.some(t => t.code === code) ? prev : [...prev, { code, holder, place, eventId, eventName }])
    setActiveCode(code)
    setServiceCode(''); setPosScanning(false)
  }

  // ── Actions POS (mode service) — toutes passent par eventOrders (Firestore) ──
  const posActor = (eventId) => ({ uid: myId, id: myId, name: user?.name || user?.displayName || 'Staff', _staffRole: roleByEvent[eventId] || null })
  // Rafraîchit la lecture optimiste locale (le listener temps réel confirme ensuite)
  const refreshOrders = (eventId) => setOrdersByEvent(prev => ({ ...prev, [eventId]: getOrders(eventId) }))

  async function posServe(eventId, itemId) {
    const r = await serveItem(eventId, itemId, posActor(eventId))
    refreshOrders(eventId)
    if (!r?.ok) flashPos(r?.error || 'Action impossible')
  }
  async function posAddItem(eventId, code, menuItem) {
    await addOnsiteItem(eventId, { ticketId: code, menuItem, qty: 1 }, posActor(eventId), false)
    refreshOrders(eventId)
    flashPos(`${menuItem.name} ajouté à l'addition`)
  }
  async function posCollect(eventId, code) {
    const r = await markTicketPaid(eventId, code, posActor(eventId))
    refreshOrders(eventId)
    flashPos(r?.ok ? `Addition encaissée · ${r.total}€` : (r?.error || 'Rien à encaisser'))
  }
  async function posDoCancel() {
    if (!cancelFor) return
    const r = await cancelItem(cancelFor.eventId, cancelFor.itemId, cancelReason, posActor(cancelFor.eventId))
    refreshOrders(cancelFor.eventId)
    if (!r?.ok) { flashPos(r?.error || 'Annulation impossible'); return }
    setCancelFor(null); setCancelReason('')
  }
  function closeTab(code) {
    setCloseConfirm(null)
    setOpenTickets(prev => {
      const next = prev.filter(t => t.code !== code)
      setActiveCode(cur => cur === code ? (next.length ? next[next.length - 1].code : null) : cur)
      return next
    })
  }
  // Fermeture protégée : on ne demande confirmation que s'il reste de l'argent à
  // encaisser ou des articles à servir (sinon rien en jeu → fermeture directe).
  function requestClose(code) {
    const t = openTickets.find(x => x.code === code)
    const eid = t?.eventId
    const items = eid ? (ordersByEvent[eid] || []).filter(i => String(i.ticketId) === String(code) && i.status !== ONSITE_STATUS.CANCELLED) : []
    const due = items.filter(i => i.source !== ORDER_SOURCE.PREORDER && !i.paid_at).reduce((s, i) => s + i.unitPrice * i.quantity, 0)
    const unserved = items.filter(i => !(i.status === ONSITE_STATUS.SERVED || i.status === PREORDER_STATUS.SERVED)).length
    if (due > 0 || unserved > 0) setCloseConfirm({ code, holder: t?.holder || '', due: Math.round(due * 100) / 100, unserved })
    else closeTab(code)
  }

  function handleCameraError(msg) {
    setCameraActive(false)
    setCameraError(msg)
  }

  function handleCameraResult(raw) {
    setCameraActive(false)
    if (scanMode === 'entry') processCode(raw)
    else lookupOrder(raw)
  }

  function switchMode(mode) {
    setScanMode(mode)
    setCameraActive(false)
    setResult(null); setManualCode('')
    setServiceCode(''); setScanReject(null); setAddPicker(false)
    setCameraError('')
    // On NE vide PAS openTickets : les onglets serveur survivent au changement de mode.
  }

  const validatedCount = usedCodes.size

  // Shared input style
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(8,10,20,0.70)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, color: '#fff',
    fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600,
    padding: '12px 14px', outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(4,4,14,0.85)', backdropFilter: 'blur(20px)',
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: COLORS.muted, fontSize: 18, lineHeight: 1,
          }}>‹</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: FONTS.display, fontWeight: 800, fontSize: 17, color: '#fff', margin: 0, letterSpacing: '-0.2px' }}>
            Scanner
          </h1>
          <p style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 600, color: COLORS.muted, margin: '2px 0 0', letterSpacing: '.02em' }}>
            {scanMode === 'entry' ? 'Contrôle d’entrée' : 'Service commandes'}
          </p>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.teal, boxShadow: `0 0 6px ${COLORS.teal}`, animation: 'pulse 2s infinite' }} />
      </div>

      {/* Mode toggle — segmented control */}
      <div style={{
        display: 'flex', margin: '14px 16px 0',
        background: 'rgba(8,10,20,0.6)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: 4, gap: 4,
      }}>
        {[['entry', 'Contrôle entrée', COLORS.teal, '78,232,200'], ['service', 'Service commandes', COLORS.gold, '200,169,110']].map(([m, label, accent, rgb]) => {
          const on = scanMode === m
          return (
            <button key={m} onClick={() => switchMode(m)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 999, cursor: 'pointer',
                fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, letterSpacing: '.01em',
                transition: 'all 0.2s',
                background: on ? `rgba(${rgb},0.14)` : 'transparent',
                border: on ? `1px solid rgba(${rgb},0.5)` : '1px solid transparent',
                color: on ? accent : COLORS.muted,
              }}>
              {label}
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1, padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── ENTRY MODE ── */}
        {scanMode === 'entry' && (
          <>
            {!result && (
              <>
                {/* Camera viewport */}
                <div style={{
                  position: 'relative', height: 260, overflow: 'hidden',
                  ...CARD,
                }}>
                  {cameraActive ? (
                    <CameraScanner active onScan={handleCameraResult} onError={handleCameraError} />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, padding: '0 24px', textAlign: 'center' }}>
                      {/* Placeholder corners */}
                      <div style={{ position: 'relative', width: 120, height: 120, opacity: 0.25 }}>
                        {[
                          { top: 0, left: 0,    borderTop: '2px solid #fff', borderLeft: '2px solid #fff' },
                          { top: 0, right: 0,   borderTop: '2px solid #fff', borderRight: '2px solid #fff' },
                          { bottom: 0, left: 0, borderBottom: '2px solid #fff', borderLeft: '2px solid #fff' },
                          { bottom: 0, right: 0,borderBottom: '2px solid #fff', borderRight: '2px solid #fff' },
                        ].map((s, i) => (
                          <div key={i} style={{ position: 'absolute', width: 18, height: 18, ...s }} />
                        ))}
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                          </svg>
                        </div>
                      </div>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim }}>
                        Appuie sur le bouton pour ouvrir la caméra
                      </p>
                    </div>
                  )}
                </div>

                {cameraError && (
                  <div style={{
                    background: 'rgba(220,50,50,0.08)', border: '1px solid rgba(220,50,50,0.30)',
                    borderRadius: 8, padding: '12px 14px', textAlign: 'center',
                  }}>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: 'rgba(220,100,100,0.9)', margin: '0 0 3px', fontWeight: 600 }}>Caméra inaccessible</p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: 0 }}>{cameraError}</p>
                  </div>
                )}

                <button
                  onClick={() => { setCameraError(''); setCameraActive(v => !v) }}
                  style={{
                    width: '100%', padding: '14px 0', borderRadius: 12, cursor: 'pointer',
                    fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    transition: 'all 0.2s', border: 'none',
                    background: cameraActive
                      ? 'rgba(255,255,255,0.08)'
                      : 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))',
                    color: cameraActive ? COLORS.muted : COLORS.teal,
                    outline: cameraActive ? '1px solid rgba(255,255,255,0.15)' : `1px solid rgba(78,232,200,0.35)`,
                  }}>
                  {cameraActive ? 'Arrêter la caméra' : 'Ouvrir la caméra'}
                </button>

                {/* Manual entry */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Saisie manuelle du code
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      style={{ ...inputStyle, flex: 1, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                      placeholder="LIB-001-XXXXXX"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && manualCode && processCode(manualCode)}
                    />
                    <button
                      onClick={() => manualCode && processCode(manualCode)}
                      disabled={!manualCode}
                      style={{
                        padding: '0 16px', borderRadius: 12, cursor: manualCode ? 'pointer' : 'default',
                        background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                        border: '1px solid rgba(200,169,110,0.45)', color: COLORS.gold,
                        fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
                        opacity: manualCode ? 1 : 0.4, transition: 'opacity 0.2s',
                      }}>
                      Valider
                    </button>
                  </div>
                  <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: 'rgba(255,255,255,0.18)' }}>Format : LIB-XXX-XXXXXX</p>
                </div>
              </>
            )}

            {/* Result card */}
            {result && (() => {
              const cfg = STATUS[result.status]
              const isValid = result.status === 'valid'
              const isJustValidated = result.status === 'just_validated'
              const isTeal = isValid || isJustValidated

              return (
                <div style={{
                  borderRadius: 12, border: `1px solid ${cfg.borderColor}`,
                  background: cfg.bg, backdropFilter: 'blur(22px)',
                  padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(0,0,0,0.30)',
                      border: `2px solid ${cfg.iconColor}44`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isTeal && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={cfg.iconColor} strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                      {result.status === 'used' && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={cfg.iconColor} strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}
                      {result.status === 'invalid' && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={cfg.iconColor} strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                      {result.status === 'offline' && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={cfg.iconColor} strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" /></svg>}
                      {result.status === 'wrong_event' && <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={cfg.iconColor} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
                    </div>
                    <div>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 20, fontWeight: 700, color: cfg.iconColor, margin: 0, letterSpacing: '0.06em' }}>
                        {cfg.label}
                      </p>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '3px 0 0' }}>{result.sub || cfg.sub}</p>
                      {result.paidConfirmed === true && (
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.teal, margin: '3px 0 0', letterSpacing: '0.1em' }}>✓ PAIEMENT CONFIRMÉ</p>
                      )}
                      {result.paidConfirmed === false && result.isGuestlist && (
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.teal, margin: '3px 0 0', letterSpacing: '0.1em' }}>✓ INVITÉ — GUESTLIST</p>
                      )}
                      {result.paidConfirmed === false && result.freeTicket && !result.isGuestlist && (
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.teal, margin: '3px 0 0', letterSpacing: '0.1em' }}>✓ BILLET GRATUIT — ENTRÉE LIBRE</p>
                      )}
                      {result.paidConfirmed === false && !result.freeTicket && !result.isGuestlist && (
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.gold, margin: '3px 0 0', letterSpacing: '0.1em' }}>⚠ PAIEMENT NON CONFIRMÉ (en attente Stripe)</p>
                      )}
                      {result.offline && (
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.muted, margin: '3px 0 0', letterSpacing: '0.1em' }}>VÉRIFICATION HORS-LIGNE — registre injoignable</p>
                      )}
                    </div>
                  </div>

                  {result.ticket && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { label: 'Titulaire',     val: result.ticket.holder },
                        { label: 'Type de place', val: result.ticket.type },
                        { label: 'Événement',     val: result.ticket.event },
                        { label: 'Date',          val: result.ticket.date },
                        { label: 'Montant payé',  val: result.ticket.price },
                        { label: 'Code billet',   val: result.code, mono: true },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim }}>{row.label}</span>
                          <span style={{
                            fontFamily: row.mono ? FONTS.mono : FONTS.display,
                            fontWeight: row.mono ? 400 : 300,
                            fontSize: row.mono ? 11 : 14,
                            color: row.mono ? COLORS.gold : '#fff',
                            letterSpacing: row.mono ? '0.06em' : 0,
                          }}>{row.val}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Preorders */}
                  {result.preorders?.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                        Précommandes
                      </p>
                      {result.preorders.map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.muted }}>{p.n} ×{p.q}</span>
                          <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.gold }}>{p.p * p.q}€</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                    {isValid && (
                      <button onClick={validateEntry} style={{
                        flex: 1, padding: '12px 0', borderRadius: 12, cursor: 'pointer',
                        background: 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))',
                        border: '1px solid rgba(78,232,200,0.35)', color: COLORS.teal,
                        fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                        transition: 'all 0.2s',
                      }}>
                        Valider l'entrée
                      </button>
                    )}
                    <button onClick={reset} style={{
                      width: isValid ? 44 : '100%', padding: '12px 0', borderRadius: 12, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                      color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 11, textTransform: 'uppercase',
                      transition: 'all 0.2s',
                    }}>
                      {isValid ? '✕' : 'Billet suivant'}
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* Stats */}
            {!result && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                {[
                  { label: 'Billets validés (cet appareil)', val: validatedCount, color: COLORS.teal },
                ].map(s => (
                  <div key={s.label} style={{ ...CARD, padding: 12, textAlign: 'center' }}>
                    <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 28, color: s.color, margin: 0 }}>{s.val}</p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── SERVICE MODE — POS multi-billets (scan une fois → onglets) ── */}
        {scanMode === 'service' && (() => {
          const active = openTickets.find(t => t.code === activeCode) || null
          const evId = active?.eventId || null
          const allItems = evId ? (ordersByEvent[evId] || []) : []
          const isServed = i => i.status === ONSITE_STATUS.SERVED || i.status === PREORDER_STATUS.SERVED
          const activeItems = allItems
            .filter(i => String(i.ticketId) === String(activeCode) && i.status !== ONSITE_STATUS.CANCELLED)
            .sort((a, b) => (isServed(a) ? 1 : 0) - (isServed(b) ? 1 : 0))
          const role = evId ? roleByEvent[evId] : null
          const menu = (evId && menuByEvent[evId]) || []
          const dueItems = activeItems.filter(i => i.source !== ORDER_SOURCE.PREORDER && !i.paid_at)
          const dueTotal = Math.round(dueItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0) * 100) / 100
          const unservedCount = t => (ordersByEvent[t.eventId] || []).filter(i => String(i.ticketId) === String(t.code) && i.status !== ONSITE_STATUS.CANCELLED && !isServed(i)).length
          const showScanner = openTickets.length === 0 || posScanning

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Onglets billets — scan une fois, jongle sans rescanner */}
              {openTickets.length > 0 && (
                <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                  {openTickets.map(t => {
                    const on = t.code === activeCode && !showScanner
                    const n = unservedCount(t)
                    return (
                      <div key={t.code} onClick={() => { setActiveCode(t.code); setPosScanning(false); setAddPicker(false); setShowHistory(false) }}
                        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 13px', borderRadius: 999, cursor: 'pointer',
                          background: on ? 'rgba(78,232,200,0.14)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${on ? 'rgba(78,232,200,0.5)' : 'rgba(255,255,255,0.1)'}` }}>
                        <span style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, color: on ? COLORS.teal : 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{t.holder}</span>
                        {n > 0 && <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: COLORS.gold, color: '#04040b', fontFamily: FONTS.mono, fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{n}</span>}
                        <span onClick={e => { e.stopPropagation(); requestClose(t.code) }} style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, lineHeight: 1, fontWeight: 700, padding: '0 3px' }}>×</span>
                      </div>
                    )
                  })}
                  <button onClick={() => { setPosScanning(true); setShowHistory(false); setAddPicker(false); setScanReject(null) }}
                    style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)', color: COLORS.muted }}>+ Scanner</button>
                  {canManage(role) && (
                    <button onClick={() => { setShowHistory(v => !v); setPosScanning(false) }}
                      style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, background: showHistory ? 'rgba(200,169,110,0.16)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showHistory ? 'rgba(200,169,110,0.5)' : 'rgba(255,255,255,0.12)'}`, color: showHistory ? COLORS.gold : COLORS.muted }}>Historique</button>
                  )}
                </div>
              )}

              {showScanner ? (
                <>
                  <div style={{ ...CARD, borderColor: 'rgba(200,169,110,0.22)', padding: '12px 14px' }}>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: COLORS.gold, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Mode serveur</p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, margin: 0, lineHeight: 1.55 }}>Scanne le billet d'un client : il s'ouvre en onglet. Sers ses consos, ajoute-en, encaisse — sans le rescanner.</p>
                  </div>

                  {scanReject && (
                    <div style={{ ...CARD, borderColor: 'rgba(224,90,170,0.4)', background: 'rgba(224,90,170,0.07)', padding: 18, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={COLORS.pink} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <p style={{ fontFamily: FONTS.display, fontWeight: 800, fontSize: 18, color: COLORS.pink, margin: 0 }}>{scanReject.title}</p>
                      <p style={{ fontFamily: FONTS.display, fontSize: 13, color: COLORS.muted, margin: 0, lineHeight: 1.45, maxWidth: 280 }}>{scanReject.sub}</p>
                    </div>
                  )}

                  <div style={{ position: 'relative', height: 220, overflow: 'hidden', ...CARD }}>
                    {cameraActive ? (
                      <CameraScanner active onScan={handleCameraResult} onError={handleCameraError} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, textAlign: 'center' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.dim }}>Scanne le QR du client</p>
                      </div>
                    )}
                  </div>

                  {cameraError && (
                    <div style={{ background: 'rgba(220,50,50,0.08)', border: '1px solid rgba(220,50,50,0.30)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, color: 'rgba(220,100,100,0.9)', margin: '0 0 3px' }}>Caméra inaccessible</p>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: 0 }}>{cameraError}</p>
                    </div>
                  )}

                  <button onClick={() => { setCameraError(''); setCameraActive(v => !v) }}
                    style={{ width: '100%', padding: '13px 0', borderRadius: 12, cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', border: 'none',
                      background: cameraActive ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))',
                      color: cameraActive ? COLORS.muted : COLORS.teal,
                      outline: cameraActive ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(78,232,200,0.35)' }}>
                    {cameraActive ? 'Arrêter la caméra' : 'Scanner le QR client'}
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ou saisir le code</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input style={{ ...inputStyle, flex: 1, letterSpacing: '0.06em', textTransform: 'uppercase' }} placeholder="LIB-001-XXXXXX" value={serviceCode} onChange={e => setServiceCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && serviceCode && lookupOrder(serviceCode)} />
                      <button onClick={() => serviceCode && lookupOrder(serviceCode)} disabled={!serviceCode}
                        style={{ padding: '0 16px', borderRadius: 12, cursor: serviceCode ? 'pointer' : 'default', background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))', border: '1px solid rgba(200,169,110,0.45)', color: COLORS.gold, fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, opacity: serviceCode ? 1 : 0.4 }}>Ouvrir</button>
                    </div>
                  </div>

                  {openTickets.length > 0 && (
                    <button onClick={() => setPosScanning(false)} style={{ width: '100%', padding: '11px 0', borderRadius: 12, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600 }}>← Revenir aux billets ouverts</button>
                  )}
                </>
              ) : showHistory ? (
                <>
                  <div style={{ ...CARD, padding: '12px 14px' }}>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: COLORS.gold, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Historique de la soirée</p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.muted, margin: '3px 0 0' }}>{active?.eventName || '—'} · tout ce qui a été fait, par qui et quand</p>
                  </div>
                  {(() => {
                    const log = (evId && logByEvent[evId]) || []
                    const holderOf = tid => openTickets.find(t => t.code === tid)?.holder || (tid ? `#${String(tid).slice(-6)}` : '—')
                    const roleLabel = r => ({ client: 'Client', serveur: 'Serveur', manager: 'Manager', preorder: 'Système', staff: 'Staff' }[r] || r || '—')
                    const roleColor = r => r === 'client' ? '#8b5cf6' : r === 'manager' ? COLORS.gold : r === 'preorder' ? COLORS.muted : COLORS.teal
                    const fmt = e => {
                      switch (e.action) {
                        case 'add': return { verb: 'a ajouté', detail: e.newValue, c: COLORS.teal }
                        case 'serve': return { verb: 'a servi', detail: e.itemName || e.newValue, c: '#22c55e' }
                        case 'cancel': return { verb: 'a annulé', detail: e.itemName || '', c: COLORS.pink }
                        case 'remove': return { verb: 'a retiré', detail: e.oldValue, c: COLORS.gold }
                        case 'pay': return { verb: 'a encaissé', detail: e.newValue, c: COLORS.gold }
                        case 'edit': return { verb: 'a modifié', detail: `${e.itemName || ''} : ${e.oldValue} → ${e.newValue}`, c: COLORS.muted }
                        case 'status': return { verb: 'a changé le statut', detail: `${e.itemName || ''} ${e.oldValue}→${e.newValue}`, c: COLORS.muted }
                        default: return { verb: e.action, detail: e.newValue || '', c: COLORS.muted }
                      }
                    }
                    if (!log.length) return (
                      <div style={{ ...CARD, padding: 24, textAlign: 'center' }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.muted, margin: 0 }}>Aucune action pour l'instant</p>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: '4px 0 0' }}>Ajouts, services, annulations et encaissements apparaîtront ici, avec l'auteur.</p>
                      </div>
                    )
                    const totalPaid = Math.round(log.filter(e => e.action === 'pay').reduce((s, e) => s + (Number(e.amount) || 0), 0) * 100) / 100
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {totalPaid > 0 && (
                          <div style={{ ...CARD, padding: '13px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: 'rgba(34,197,94,0.28)' }}>
                            <span style={{ fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total encaissé ce soir</span>
                            <span style={{ fontFamily: FONTS.display, fontSize: 22, fontWeight: 800, color: '#22c55e', letterSpacing: '-0.5px' }}>{totalPaid}€</span>
                          </div>
                        )}
                        {log.map(e => {
                          const f = fmt(e)
                          const d = new Date(e.ts)
                          const time = isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                          return (
                            <div key={e.id} style={{ ...CARD, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
                              <span style={{ width: 5, flexShrink: 0, borderRadius: 3, background: f.c, alignSelf: 'stretch' }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontFamily: FONTS.mono, fontSize: 12.5, color: '#fff', margin: 0, lineHeight: 1.4 }}>
                                  <b style={{ color: f.c }}>{e.actorName || 'Staff'}</b> <span style={{ color: COLORS.muted }}>{f.verb}</span> {f.detail}
                                </p>
                                <p style={{ fontFamily: FONTS.mono, fontSize: 10.5, color: COLORS.dim, margin: '3px 0 0' }}>
                                  {time} · <span style={{ color: roleColor(e.actorRole) }}>{roleLabel(e.actorRole)}</span> · billet {holderOf(e.ticketId)}{e.action === 'cancel' && e.note ? ` · motif : ${e.note}` : ''}
                                </p>
                              </div>
                              {typeof e.amount === 'number' && e.amount !== 0 && (
                                <span style={{ flexShrink: 0, fontFamily: FONTS.mono, fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: e.action === 'pay' ? '#22c55e' : e.amount < 0 ? COLORS.pink : COLORS.gold }}>
                                  {e.amount > 0 && e.action !== 'pay' ? '+' : ''}{e.amount}€
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                  <button onClick={() => setShowHistory(false)} style={{ width: '100%', padding: '11px 0', borderRadius: 12, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600 }}>← Revenir au service</button>
                </>
              ) : active ? (
                <>
                  {/* En-tête billet actif */}
                  <div style={{ ...CARD, padding: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontFamily: FONTS.display, fontWeight: 700, fontSize: 18, color: '#fff', margin: 0 }}>{active.holder}</p>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.muted, margin: '3px 0 0' }}>{active.place} · {active.eventName}</p>
                    </div>
                    <span style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: COLORS.gold }}>{active.code}</span>
                  </div>

                  {/* Lignes de commande (précos + sur place, temps réel) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {activeItems.length === 0 ? (
                      <div style={{ ...CARD, padding: 20, textAlign: 'center' }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.muted, margin: 0 }}>Aucune commande</p>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim, margin: '4px 0 0' }}>Ajoute une conso, ou laisse le client commander depuis son billet.</p>
                      </div>
                    ) : activeItems.map(item => {
                      const served = isServed(item)
                      const isPre = item.source === ORDER_SOURCE.PREORDER
                      const chip = served ? { t: 'Servi', c: '#22c55e' } : item.paid_at ? { t: 'Payé', c: COLORS.teal } : isPre ? { t: 'Précommande', c: COLORS.gold } : { t: ONSITE_STATUS_LABEL[item.status] || 'Envoyée', c: ONSITE_STATUS_COLOR[item.status] || COLORS.teal }
                      return (
                        <div key={item.id} style={{ ...CARD, padding: '11px 12px', display: 'flex', alignItems: 'center', gap: 11, opacity: served ? 0.72 : 1 }}>
                          <span style={{ fontSize: 20, width: 24, textAlign: 'center' }}>{item.emoji || '🍸'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: '#fff', margin: 0, textDecoration: served ? 'line-through' : 'none' }}>{item.name} <span style={{ color: COLORS.muted, fontWeight: 500 }}>×{item.quantity}</span></p>
                            <span style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: chip.c }}>{chip.t}{served && item.served_by_name ? ` par ${item.served_by_name}` : ''}{!served && item.addedByRole === 'client' ? ' · par le client' : ''}</span>
                          </div>
                          <span style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, color: isPre ? COLORS.muted : COLORS.gold, flexShrink: 0 }}>{isPre ? 'payé' : `${Math.round(item.unitPrice * item.quantity)}€`}</span>
                          {!served && (
                            <button onClick={() => posServe(evId, item.id)} disabled={!canServe(role)}
                              style={{ flexShrink: 0, padding: '7px 11px', borderRadius: 10, cursor: canServe(role) ? 'pointer' : 'default', fontFamily: FONTS.mono, fontSize: 11, fontWeight: 700, background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.4)', color: COLORS.teal, opacity: canServe(role) ? 1 : 0.4 }}>Servir</button>
                          )}
                          {canManage(role) && !served && !item.paid_at && (
                            <button onClick={() => { setCancelFor({ eventId: evId, itemId: item.id, name: item.name }); setCancelReason('') }}
                              style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(224,90,170,0.3)', color: COLORS.pink, fontSize: 14, lineHeight: 1 }}>×</button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Ajouter une conso (serveur) */}
                  {canServe(role) && (addPicker ? (
                    <div style={{ ...CARD, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Ajouter au billet</p>
                        <button onClick={() => setAddPicker(false)} style={{ background: 'none', border: 'none', color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Fermer</button>
                      </div>
                      {menu.length === 0 ? (
                        <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.dim, margin: 0 }}>Aucun menu défini pour cet événement.</p>
                      ) : menu.map(m => (
                        <div key={String(m.id || m.name)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <span style={{ fontSize: 18, width: 22, textAlign: 'center' }}>{m.emoji || '🍸'}</span>
                          <span style={{ flex: 1, fontFamily: FONTS.mono, fontSize: 13, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                          <span style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, color: COLORS.gold }}>{Math.round(Number(m.price) || 0)}€</span>
                          <button onClick={() => posAddItem(evId, active.code, m)} style={{ padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.4)', color: COLORS.teal }}>+ Ajouter</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => setAddPicker(true)} style={{ width: '100%', padding: '12px 0', borderRadius: 12, cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.2)', color: COLORS.muted }}>+ Ajouter une conso</button>
                  ))}

                  {/* Addition + encaissement */}
                  <div style={{ ...CARD, padding: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>À encaisser</p>
                      <p style={{ fontFamily: FONTS.display, fontSize: 24, fontWeight: 800, color: '#fff', margin: '2px 0 0', letterSpacing: '-0.5px' }}>{dueTotal}€</p>
                    </div>
                    {dueTotal > 0 ? (
                      <button onClick={() => posCollect(evId, active.code)} disabled={!canServe(role)}
                        style={{ padding: '12px 18px', borderRadius: 12, cursor: canServe(role) ? 'pointer' : 'default', fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700, color: '#04040b', background: 'linear-gradient(135deg, #c8a96e, #e0c690)', border: 'none', opacity: canServe(role) ? 1 : 0.4 }}>Encaisser</button>
                    ) : (
                      <span style={{ fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, color: '#22c55e' }}>Rien à encaisser ✓</span>
                    )}
                  </div>

                  <button onClick={() => requestClose(active.code)} style={{ width: '100%', padding: '11px 0', borderRadius: 12, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Clôturer cet onglet</button>
                </>
              ) : null}

              {/* Toast feedback */}
              {posMsg && (
                <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 30, background: 'rgba(78,232,200,0.14)', border: '1px solid rgba(78,232,200,0.4)', color: COLORS.teal, fontFamily: FONTS.mono, fontSize: 12.5, fontWeight: 600, padding: '9px 16px', borderRadius: 999, backdropFilter: 'blur(12px)' }}>{posMsg}</div>
              )}

              {/* Modal annulation (manager + motif obligatoire) */}
              {cancelFor && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }} onClick={() => setCancelFor(null)}>
                  <div onClick={e => e.stopPropagation()} style={{ ...CARD, padding: 18, width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ fontFamily: FONTS.display, fontWeight: 800, fontSize: 16, color: '#fff', margin: 0 }}>Annuler « {cancelFor.name} »</p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, margin: 0 }}>Un motif est obligatoire (tracé dans l'historique).</p>
                    <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Motif de l'annulation…" rows={2} style={{ ...inputStyle, resize: 'none', letterSpacing: 'normal', textTransform: 'none' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setCancelFor(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600 }}>Retour</button>
                      <button onClick={posDoCancel} disabled={!cancelReason.trim()} style={{ flex: 1, padding: '11px 0', borderRadius: 12, cursor: cancelReason.trim() ? 'pointer' : 'default', background: 'rgba(224,90,170,0.14)', border: '1px solid rgba(224,90,170,0.45)', color: COLORS.pink, fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700, opacity: cancelReason.trim() ? 1 : 0.4 }}>Annuler l'article</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Confirmation de clôture d'onglet (argent/service en jeu) */}
              {closeConfirm && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }} onClick={() => setCloseConfirm(null)}>
                  <div onClick={e => e.stopPropagation()} style={{ ...CARD, padding: 20, width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ fontFamily: FONTS.display, fontWeight: 800, fontSize: 16, color: '#fff', margin: 0 }}>Clôturer l'onglet de {closeConfirm.holder} ?</p>
                    {closeConfirm.due > 0 && (
                      <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(200,169,110,0.1)', border: '1px solid rgba(200,169,110,0.35)' }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 700, color: COLORS.gold, margin: 0 }}>⚠ Il reste {closeConfirm.due}€ à encaisser</p>
                      </div>
                    )}
                    {closeConfirm.unserved > 0 && (
                      <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, margin: 0 }}>{closeConfirm.unserved} article{closeConfirm.unserved > 1 ? 's' : ''} pas encore servi{closeConfirm.unserved > 1 ? 's' : ''}.</p>
                    )}
                    <p style={{ fontFamily: FONTS.mono, fontSize: 11.5, color: COLORS.dim, margin: 0, lineHeight: 1.5 }}>Rien n'est perdu : la commande reste enregistrée. Re-scanne le billet pour rouvrir l'onglet avec tout son contenu.</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setCloseConfirm(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, cursor: 'pointer', background: 'rgba(78,232,200,0.12)', border: '1px solid rgba(78,232,200,0.4)', color: COLORS.teal, fontFamily: FONTS.mono, fontSize: 12, fontWeight: 700 }}>Garder ouvert</button>
                      <button onClick={() => closeTab(closeConfirm.code)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 12, fontWeight: 600 }}>Clôturer</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      <style>{`
        @keyframes scanLine {
          0%   { top: 10%; }
          50%  { top: 85%; }
          100% { top: 10%; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
