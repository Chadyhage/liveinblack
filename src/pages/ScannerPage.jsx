import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import jsQR from 'jsqr'
import { verifyTicketToken } from '../utils/ticket'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'

// Mock tickets for demo fallback
const MOCK_TICKETS = {
  'LIB-001-A3X7KP': { holder: 'Jordan M.', type: 'VIP Gold',     event: 'NEON NIGHT Vol.3', price: '120€', date: '28 Juin 2025', used: false },
  'LIB-001-B8QMZ2': { holder: 'Kira S.',   type: 'Entrée libre', event: 'NEON NIGHT Vol.3', price: '0€',   date: '28 Juin 2025', used: true  },
  'LIB-002-CW4NRX': { holder: 'Moussa D.', type: 'Carré VIP',    event: 'AFRO KINGS',       price: '80€',  date: '5 Juil 2025',  used: false },
  'LIB-003-Y9TP6L': { holder: 'Aminata K.',type: 'Standard',     event: 'ABIDJAN NUIT',     price: '15€',  date: '12 Juil 2025', used: false },
}

const MOCK_ORDERS = {
  'LIB-001-A3X7KP': { holder: 'Jordan M.',  place: 'VIP Gold',  event: 'NEON NIGHT Vol.3', items: [{ name: 'Bouteille Champagne', emoji: '', qty: 1, price: 90 }, { name: 'Pack Cocktails x5', emoji: '', qty: 2, price: 55 }] },
  'LIB-002-CW4NRX': { holder: 'Moussa D.', place: 'Carré VIP', event: 'AFRO KINGS',        items: [{ name: 'Chicha Premium', emoji: '', qty: 1, price: 40 }, { name: 'Pack Bières x6', emoji: '', qty: 1, price: 25 }] },
  'LIB-003-Y9TP6L': { holder: 'Aminata K.',place: 'Standard',  event: 'ABIDJAN NUIT',      items: [] },
}

// ─── Design tokens ────────────────────────────────────────────────────────
const CARD = {
  background: 'rgba(8,10,20,0.55)',
  backdropFilter: 'blur(22px) saturate(1.6)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 12,
}

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

const STATUS = {
  valid:          { borderColor: 'rgba(78,232,200,0.40)',  bg: 'rgba(78,232,200,0.07)',  iconColor: COLORS.teal, label: 'VALIDE',         sub: 'Accès autorisé' },
  just_validated: { borderColor: 'rgba(78,232,200,0.40)',  bg: 'rgba(78,232,200,0.07)',  iconColor: COLORS.teal, label: 'VALIDÉ',         sub: 'Billet marqué comme utilisé' },
  used:           { borderColor: 'rgba(200,169,110,0.40)', bg: 'rgba(200,169,110,0.07)', iconColor: COLORS.gold, label: 'DÉJÀ UTILISÉ',   sub: 'Ce billet a déjà été scanné' },
  invalid:        { borderColor: 'rgba(224,90,170,0.40)',  bg: 'rgba(224,90,170,0.07)',  iconColor: COLORS.pink, label: 'INVALIDE',       sub: 'QR code non reconnu' },
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
      .catch(err => onError(err.message || 'Permission caméra refusée'))

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
export default function ScannerPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const myId = getUserId(user)

  // Guard: agent/organisateur only
  const userRole = user?.role || user?.activeRole
  if (user && userRole !== 'agent' && userRole !== 'organisateur') {
    return (
      <div style={{ minHeight: '100dvh', background: '#04040b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <span style={{ fontSize: 40 }}>🚫</span>
        <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, textAlign: 'center' }}>Accès réservé aux agents et organisateurs</p>
        <button onClick={() => navigate('/')} style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.teal, background: 'none', border: '1px solid rgba(78,232,200,0.3)', borderRadius: 6, padding: '8px 20px', cursor: 'pointer' }}>Retour</button>
      </div>
    )
  }

  const [scanMode, setScanMode] = useState('entry') // 'entry' | 'service'

  // Camera state (shared)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')

  // Entry mode
  const [manualCode, setManualCode] = useState('')
  const [result, setResult] = useState(null)
  const [usedCodes, setUsedCodes] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('lib_used_tickets') || '[]')) } catch { return new Set() }
  })

  // Service mode
  const [serviceCode, setServiceCode] = useState('')
  const [serviceOrder, setServiceOrder] = useState(null)
  const [servedItems, setServedItems] = useState({})

  function markUsed(code) {
    setUsedCodes(prev => {
      const next = new Set([...prev, code])
      const arr = [...next]
      try { localStorage.setItem('lib_used_tickets', JSON.stringify(arr)) } catch {}
      // Sync to Firestore so other devices (multi-scanner soirée) are aware
      if (myId) {
        import('../utils/firestore-sync').then(({ syncDoc }) => {
          syncDoc(`used_tickets/${myId}`, { items: arr, updatedAt: new Date().toISOString() })
        }).catch(() => {})
      }
      return next
    })
  }

  // ── Code processing ──
  function processCode(rawValue) {
    setCameraActive(false)
    const val = rawValue.trim()

    // URL with embedded token: http://…/ticket/{token}
    const tokenMatch = val.match(/\/ticket\/([A-Za-z0-9_-]+)/)
    if (tokenMatch) {
      const { valid, data } = verifyTicketToken(tokenMatch[1])
      if (!valid || !data) { setResult({ code: val, status: 'invalid' }); return }
      const tc = data.tc
      const isUsed = usedCodes.has(tc)
      setResult({
        code: tc,
        status: isUsed ? 'used' : 'valid',
        ticket: { holder: 'Participant', type: data.pl, event: data.en, date: data.ed, price: `${data.tp}€` },
        preorders: data.po || [],
      })
      return
    }

    // Raw ticket code (LIB-XXX-XXXXXX)
    const clean = val.toUpperCase()

    // Check real bookings in localStorage
    try {
      const bookings = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      const booking = bookings.find(b => b.ticketCode === clean)
      if (booking) {
        const isUsed = usedCodes.has(clean)
        setResult({
          code: clean,
          status: isUsed ? 'used' : 'valid',
          ticket: { holder: booking.userName || 'Participant', type: booking.place, event: booking.eventName, date: booking.eventDate, price: `${booking.totalPrice}€` },
          preorders: (booking.preorderSummary || []).map(i => ({ n: i.name, e: i.emoji || '', q: (booking.preorderItems || {})[i.name] || 0, p: i.price })),
        })
        return
      }
    } catch {}

    // Demo / mock fallback
    const ticket = MOCK_TICKETS[clean]
    if (!ticket) { setResult({ code: clean, status: 'invalid' }); return }
    if (ticket.used || usedCodes.has(clean)) { setResult({ code: clean, status: 'used', ticket }); return }
    setResult({ code: clean, status: 'valid', ticket })
  }

  function validateEntry() {
    if (result?.status === 'valid') {
      markUsed(result.code)
      setResult(r => ({ ...r, status: 'just_validated' }))
    }
  }

  function reset() { setResult(null); setManualCode(''); setCameraError('') }

  // ── Service mode ──
  function lookupOrder(rawValue) {
    setCameraActive(false)
    const val = rawValue.trim()

    // URL token → extract code from token
    const tokenMatch = val.match(/\/ticket\/([A-Za-z0-9_-]+)/)
    if (tokenMatch) {
      const { valid, data } = verifyTicketToken(tokenMatch[1])
      if (!valid || !data) { setServiceOrder({ code: val, order: null }); return }
      const tc = data.tc
      const items = (data.po || []).map(i => ({ name: i.n, emoji: i.e || '', qty: i.q, price: i.p })).filter(i => i.qty > 0)
      setServiceOrder({ code: tc, order: { holder: 'Participant', place: data.pl, event: data.en, items } })
      return
    }

    const clean = val.toUpperCase()

    // Real booking in localStorage
    try {
      const bookings = JSON.parse(localStorage.getItem('lib_bookings') || '[]')
      const booking = bookings.find(b => b.ticketCode === clean)
      if (booking) {
        const items = (booking.preorderSummary || []).map(i => ({
          name: i.name, emoji: i.emoji || '',
          qty: (booking.preorderItems || {})[i.name] || 0, price: i.price
        })).filter(i => i.qty > 0)
        setServiceOrder({ code: clean, order: { holder: booking.userName || 'Participant', place: booking.place, event: booking.eventName, items } })
        return
      }
    } catch {}

    // Mock fallback
    const order = MOCK_ORDERS[clean]
    setServiceOrder({ code: clean, order: order || null })
  }

  function toggleServed(code, itemName) {
    setServedItems(prev => {
      const set = new Set(prev[code] || [])
      if (set.has(itemName)) set.delete(itemName); else set.add(itemName)
      return { ...prev, [code]: set }
    })
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
    setServiceOrder(null); setServiceCode('')
    setCameraError('')
  }

  const validatedCount = usedCodes.size

  // Shared input style
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(8,10,20,0.70)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 6, color: '#fff',
    fontFamily: FONTS.mono, fontSize: 12,
    padding: '9px 12px', outline: 'none',
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
          <h1 style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 17, color: '#fff', margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Scanner LIVEINBLACK
          </h1>
          <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '2px 0 0' }}>
            {scanMode === 'entry' ? 'Interface videur' : 'Interface serveur'}
          </p>
        </div>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.teal, boxShadow: `0 0 6px ${COLORS.teal}`, animation: 'pulse 2s infinite' }} />
      </div>

      {/* Mode toggle */}
      <div style={{
        display: 'flex', margin: '14px 16px 0',
        background: 'rgba(8,10,20,0.55)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 3, gap: 3,
      }}>
        {[['entry', 'Contrôle entrée'], ['service', 'Service commandes']].map(([m, label]) => (
          <button key={m} onClick={() => switchMode(m)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, cursor: 'pointer',
              fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
              transition: 'all 0.2s',
              background: scanMode === m
                ? 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.08))'
                : 'transparent',
              border: scanMode === m ? '1px solid rgba(200,169,110,0.40)' : '1px solid transparent',
              color: scanMode === m ? COLORS.gold : COLORS.dim,
            }}>
            {label}
          </button>
        ))}
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
                    width: '100%', padding: '14px 0', borderRadius: 4, cursor: 'pointer',
                    fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                    transition: 'all 0.2s', border: 'none',
                    background: cameraActive
                      ? 'rgba(255,255,255,0.08)'
                      : 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))',
                    color: cameraActive ? COLORS.muted : COLORS.teal,
                    outline: cameraActive ? '1px solid rgba(255,255,255,0.15)' : `1px solid rgba(78,232,200,0.35)`,
                  }}>
                  {cameraActive ? 'Arrêter la caméra' : 'Scanner un QR Code'}
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
                        padding: '0 16px', borderRadius: 4, cursor: manualCode ? 'pointer' : 'default',
                        background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                        border: '1px solid rgba(200,169,110,0.45)', color: COLORS.gold,
                        fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.06em',
                        opacity: manualCode ? 1 : 0.4, transition: 'opacity 0.2s',
                      }}>
                      OK
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
                    </div>
                    <div>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 20, fontWeight: 700, color: cfg.iconColor, margin: 0, letterSpacing: '0.06em' }}>
                        {cfg.label}
                      </p>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '3px 0 0' }}>{cfg.sub}</p>
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
                        flex: 1, padding: '12px 0', borderRadius: 4, cursor: 'pointer',
                        background: 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))',
                        border: '1px solid rgba(78,232,200,0.35)', color: COLORS.teal,
                        fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                        transition: 'all 0.2s',
                      }}>
                        Valider l'entrée
                      </button>
                    )}
                    <button onClick={reset} style={{
                      width: isValid ? 44 : '100%', padding: '12px 0', borderRadius: 4, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
                      color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 11, textTransform: 'uppercase',
                      transition: 'all 0.2s',
                    }}>
                      {isValid ? '✕' : 'Scanner suivant'}
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* Stats */}
            {!result && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Validés',      val: validatedCount,                    color: COLORS.teal },
                  { label: 'Billets demo', val: Object.keys(MOCK_TICKETS).length,  color: '#fff' },
                  { label: 'Capacité',     val: '350',                             color: COLORS.dim },
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

        {/* ── SERVICE MODE ── */}
        {scanMode === 'service' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              ...CARD,
              borderColor: 'rgba(200,169,110,0.22)',
              padding: '12px 14px',
            }}>
              <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.gold, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
                Mode serveur
              </p>
              <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.muted, margin: 0, lineHeight: 1.6 }}>
                Scanne le QR du client pour voir sa précommande et marquer les articles comme servis.
              </p>
            </div>

            {!serviceOrder && (
              <>
                {/* Camera viewport */}
                <div style={{ position: 'relative', height: 220, overflow: 'hidden', ...CARD }}>
                  {cameraActive ? (
                    <CameraScanner active onScan={handleCameraResult} onError={handleCameraError} />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, textAlign: 'center' }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                      </svg>
                      <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim }}>Scanne le QR code du client</p>
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
                    width: '100%', padding: '13px 0', borderRadius: 4, cursor: 'pointer',
                    fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                    border: 'none', transition: 'all 0.2s',
                    background: cameraActive
                      ? 'rgba(255,255,255,0.06)'
                      : 'linear-gradient(135deg, rgba(78,232,200,0.22), rgba(78,232,200,0.08))',
                    color: cameraActive ? COLORS.muted : COLORS.teal,
                    outline: cameraActive ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(78,232,200,0.35)',
                  }}>
                  {cameraActive ? 'Arrêter' : 'Scanner le QR Client'}
                </button>

                {/* Manual entry */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Ou saisir le code
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      style={{ ...inputStyle, flex: 1, letterSpacing: '0.06em', textTransform: 'uppercase' }}
                      placeholder="LIB-001-XXXXXX"
                      value={serviceCode}
                      onChange={(e) => setServiceCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && serviceCode && lookupOrder(serviceCode)}
                    />
                    <button
                      onClick={() => serviceCode && lookupOrder(serviceCode)}
                      disabled={!serviceCode}
                      style={{
                        padding: '0 16px', borderRadius: 4, cursor: serviceCode ? 'pointer' : 'default',
                        background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))',
                        border: '1px solid rgba(200,169,110,0.45)', color: COLORS.gold,
                        fontFamily: FONTS.mono, fontSize: 11,
                        opacity: serviceCode ? 1 : 0.4, transition: 'opacity 0.2s',
                      }}>
                      OK
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Order result */}
            {serviceOrder && (() => {
              if (!serviceOrder.order) {
                return (
                  <div style={{
                    borderRadius: 12, border: 'rgba(224,90,170,0.40)',
                    background: 'rgba(224,90,170,0.07)', backdropFilter: 'blur(22px)',
                    padding: 24, textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                    borderWidth: 1, borderStyle: 'solid',
                  }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={COLORS.pink} strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 22, color: COLORS.pink, margin: 0 }}>Code inconnu</p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.muted, margin: 0 }}>Aucune réservation trouvée pour ce code.</p>
                    <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: 0, letterSpacing: '0.06em' }}>{serviceOrder.code}</p>
                    <button
                      onClick={() => { setServiceOrder(null); setServiceCode('') }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONTS.mono, fontSize: 11, color: COLORS.muted, textDecoration: 'underline', marginTop: 4 }}>
                      Réessayer
                    </button>
                  </div>
                )
              }
              const { order, code } = serviceOrder
              const allServed = order.items.length > 0 && order.items.every(i => servedItems[code]?.has(i.name))
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    ...CARD,
                    borderColor: 'rgba(200,169,110,0.28)',
                    padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ fontFamily: FONTS.display, fontWeight: 400, fontSize: 18, color: '#fff', margin: 0 }}>{order.holder}</p>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.muted, margin: '3px 0 0' }}>{order.place} · {order.event}</p>
                      </div>
                      <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.gold, letterSpacing: '0.06em' }}>{code}</span>
                    </div>

                    {order.items.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, margin: 0 }}>Aucune précommande</p>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '4px 0 0' }}>Ce client n'a pas commandé de consommations</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Précommande</p>
                        {order.items.map(item => {
                          const served = servedItems[code]?.has(item.name)
                          return (
                            <div key={item.name} style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '10px 12px', borderRadius: 8,
                              border: served ? '1px solid rgba(78,232,200,0.25)' : '1px solid rgba(255,255,255,0.08)',
                              background: served ? 'rgba(78,232,200,0.04)' : 'rgba(0,0,0,0.20)',
                              opacity: served ? 0.6 : 1,
                              transition: 'all 0.2s',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                  width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                                  background: 'rgba(255,255,255,0.05)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                                  </svg>
                                </div>
                                <div>
                                  <p style={{
                                    fontFamily: FONTS.mono, fontSize: 12,
                                    color: served ? COLORS.dim : '#fff', margin: 0,
                                    textDecoration: served ? 'line-through' : 'none',
                                  }}>{item.name}</p>
                                  <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '2px 0 0' }}>
                                    ×{item.qty} · {item.price * item.qty}€
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => toggleServed(code, item.name)}
                                style={{
                                  padding: '6px 10px', borderRadius: 4, cursor: 'pointer',
                                  fontFamily: FONTS.mono, fontSize: 10, letterSpacing: '0.04em',
                                  textTransform: 'uppercase', transition: 'all 0.2s',
                                  ...(served
                                    ? { background: 'rgba(78,232,200,0.10)', border: '1px solid rgba(78,232,200,0.30)', color: COLORS.teal }
                                    : { background: 'linear-gradient(135deg, rgba(200,169,110,0.22), rgba(200,169,110,0.06))', border: '1px solid rgba(200,169,110,0.45)', color: COLORS.gold }
                                  ),
                                }}>
                                {served ? 'Servi' : 'Marquer servi'}
                              </button>
                            </div>
                          )
                        })}
                        {allServed && (
                          <div style={{
                            padding: '9px 12px', background: 'rgba(78,232,200,0.06)',
                            border: '1px solid rgba(78,232,200,0.22)', borderRadius: 6, textAlign: 'center',
                          }}>
                            <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.teal, margin: 0, letterSpacing: '0.06em' }}>
                              Toute la commande a été servie
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { setServiceOrder(null); setServiceCode('') }}
                    style={{
                      width: '100%', padding: '12px 0', borderRadius: 4, cursor: 'pointer',
                      background: 'transparent', border: '1px solid rgba(255,255,255,0.10)',
                      color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                    Client suivant
                  </button>
                </div>
              )
            })()}
          </div>
        )}
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
