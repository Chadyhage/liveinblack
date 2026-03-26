import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import jsQR from 'jsqr'
import { verifyTicketToken } from '../utils/ticket'

// Mock tickets for demo fallback
const MOCK_TICKETS = {
  'LIB-001-A3X7KP': { holder: 'Jordan M.', type: 'VIP Gold',     event: 'NEON NIGHT Vol.3', price: '120€', date: '28 Juin 2025', used: false },
  'LIB-001-B8QMZ2': { holder: 'Kira S.',   type: 'Entrée libre', event: 'NEON NIGHT Vol.3', price: '0€',   date: '28 Juin 2025', used: true  },
  'LIB-002-CW4NRX': { holder: 'Moussa D.', type: 'Carré VIP',    event: 'AFRO KINGS',       price: '80€',  date: '5 Juil 2025',  used: false },
  'LIB-003-Y9TP6L': { holder: 'Aminata K.',type: 'Standard',     event: 'ABIDJAN NUIT',     price: '15€',  date: '12 Juil 2025', used: false },
}

const MOCK_ORDERS = {
  'LIB-001-A3X7KP': { holder: 'Jordan M.',  place: 'VIP Gold',  event: 'NEON NIGHT Vol.3', items: [{ name: 'Bouteille Champagne', emoji: '🍾', qty: 1, price: 90 }, { name: 'Pack Cocktails x5', emoji: '🍹', qty: 2, price: 55 }] },
  'LIB-002-CW4NRX': { holder: 'Moussa D.', place: 'Carré VIP', event: 'AFRO KINGS',        items: [{ name: 'Chicha Premium', emoji: '💨', qty: 1, price: 40 }, { name: 'Pack Bières x6', emoji: '🍺', qty: 1, price: 25 }] },
  'LIB-003-Y9TP6L': { holder: 'Aminata K.',place: 'Standard',  event: 'ABIDJAN NUIT',      items: [] },
}

const STATUS = {
  valid:          { bg: 'border-green-500/40 bg-green-500/10',   icon: '✓', color: 'text-green-400',  label: 'VALIDE',         sub: 'Accès autorisé' },
  just_validated: { bg: 'border-green-500/40 bg-green-500/10',   icon: '✓', color: 'text-green-400',  label: 'VALIDÉ',         sub: 'Billet marqué comme utilisé' },
  used:           { bg: 'border-orange-500/40 bg-orange-500/10', icon: '⚠', color: 'text-orange-400', label: 'DÉJÀ UTILISÉ',   sub: 'Ce billet a déjà été scanné' },
  invalid:        { bg: 'border-red-500/40 bg-red-500/10',       icon: '✕', color: 'text-red-400',    label: 'INVALIDE',       sub: 'QR code non reconnu' },
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
      <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      {/* Scanning overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-52 h-52">
          <div className="absolute inset-0 border-2 border-[#d4af37]/30 rounded-xl" />
          {[['top-0 left-0','border-t-2 border-l-2'],['top-0 right-0','border-t-2 border-r-2'],['bottom-0 left-0','border-b-2 border-l-2'],['bottom-0 right-0','border-b-2 border-r-2']].map(([pos, border], i) => (
            <div key={i} className={`absolute w-7 h-7 border-[#d4af37] ${pos} ${border}`} />
          ))}
          <div className="absolute left-2 right-2 h-0.5 bg-[#d4af37]/80" style={{ animation: 'scanLine 1.5s ease-in-out infinite', top: '10%' }} />
        </div>
      </div>
      <p className="absolute bottom-4 left-0 right-0 text-center text-[#d4af37] text-xs tracking-widest uppercase animate-pulse">
        Lecture en cours...
      </p>
    </>
  )
}

// ── Main page ───────────────────────────────────────────────────────
export default function ScannerPage() {
  const navigate = useNavigate()
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
      try { localStorage.setItem('lib_used_tickets', JSON.stringify([...next])) } catch {}
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
          preorders: (booking.preorderSummary || []).map(i => ({ n: i.name, e: i.emoji || '•', q: (booking.preorderItems || {})[i.name] || 0, p: i.price })),
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
      // Build order from token preorder data
      const items = (data.po || []).map(i => ({ name: i.n, emoji: i.e || '•', qty: i.q, price: i.p })).filter(i => i.qty > 0)
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
          name: i.name, emoji: i.emoji || '•',
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

  return (
    <div className="min-h-screen bg-[#080808] flex flex-col" style={{ maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[#1a1a1a]">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-[#1a1a1a] flex items-center justify-center text-gray-400">‹</button>
        <div>
          <h1 className="text-white font-bold text-base">Scanner LIVEINBLACK</h1>
          <p className="text-gray-600 text-xs">{scanMode === 'entry' ? 'Interface videur' : 'Interface serveur'}</p>
        </div>
        <div className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      </div>

      {/* Mode toggle */}
      <div className="flex mx-4 mt-4 bg-[#111] rounded-xl p-1 gap-1">
        {[['entry','🚪 Contrôle entrée'],['service','🛒 Service commandes']].map(([m, label]) => (
          <button key={m} onClick={() => switchMode(m)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${scanMode === m ? 'bg-[#d4af37] text-black' : 'text-gray-500 hover:text-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 px-4 py-5 space-y-5">

        {/* ── ENTRY MODE ── */}
        {scanMode === 'entry' && (
          <>
            {!result && (
              <>
                {/* Camera viewport */}
                <div className="relative rounded-2xl overflow-hidden" style={{ height: 260, background: '#0d0d0d', border: '1px solid #1a1a1a' }}>
                  {cameraActive ? (
                    <CameraScanner active onScan={handleCameraResult} onError={handleCameraError} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                      <div className="relative w-36 h-36 opacity-30">
                        <div className="absolute inset-0 border-2 border-white/20 rounded-xl" />
                        {[['top-0 left-0','border-t-2 border-l-2'],['top-0 right-0','border-t-2 border-r-2'],['bottom-0 left-0','border-b-2 border-l-2'],['bottom-0 right-0','border-b-2 border-r-2']].map(([pos, border], i) => (
                          <div key={i} className={`absolute w-5 h-5 border-gray-500 ${pos} ${border}`} />
                        ))}
                        <div className="absolute inset-0 flex items-center justify-center"><span className="text-4xl">📷</span></div>
                      </div>
                      <p className="text-gray-600 text-xs">Appuie sur le bouton pour ouvrir la caméra</p>
                    </div>
                  )}
                </div>

                {cameraError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
                    <p className="text-red-400 text-xs font-semibold">Caméra inaccessible</p>
                    <p className="text-gray-500 text-[10px] mt-0.5">{cameraError}</p>
                  </div>
                )}

                <button
                  onClick={() => { setCameraError(''); setCameraActive(v => !v) }}
                  className="w-full py-4 rounded-2xl font-bold text-black text-sm transition-all active:scale-95"
                  style={{ background: cameraActive ? '#555' : 'linear-gradient(135deg, #d4af37, #f0c940)' }}
                >
                  {cameraActive ? '⏹ Arrêter la caméra' : '📷 Scanner un QR Code'}
                </button>

                {/* Manual entry */}
                <div className="space-y-2">
                  <label className="text-gray-600 text-xs uppercase tracking-widest">Saisie manuelle du code</label>
                  <div className="flex gap-2">
                    <input
                      className="input-dark flex-1 font-mono text-sm uppercase"
                      placeholder="LIB-001-XXXXXX"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && manualCode && processCode(manualCode)}
                    />
                    <button onClick={() => manualCode && processCode(manualCode)} disabled={!manualCode}
                      className="px-4 py-2 rounded-xl bg-[#d4af37] text-black font-bold text-sm disabled:opacity-40 transition-all">
                      OK
                    </button>
                  </div>
                  <p className="text-gray-700 text-[10px]">Format : LIB-XXX-XXXXXX</p>
                </div>
              </>
            )}

            {/* Result card */}
            {result && (() => {
              const cfg = STATUS[result.status]
              return (
                <div className={`rounded-2xl border p-5 space-y-4 ${cfg.bg}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-3xl font-black bg-black/30 ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div>
                      <p className={`text-2xl font-black uppercase tracking-wider ${cfg.color}`}>{cfg.label}</p>
                      <p className="text-gray-500 text-xs">{cfg.sub}</p>
                    </div>
                  </div>

                  {result.ticket && (
                    <div className="space-y-2 border-t border-white/10 pt-3">
                      {[
                        { label: 'Titulaire',     val: result.ticket.holder },
                        { label: 'Type de place', val: result.ticket.type },
                        { label: 'Événement',     val: result.ticket.event },
                        { label: 'Date',          val: result.ticket.date },
                        { label: 'Montant payé',  val: result.ticket.price },
                        { label: 'Code billet',   val: result.code, mono: true },
                      ].map(row => (
                        <div key={row.label} className="flex justify-between items-center">
                          <span className="text-gray-500 text-xs">{row.label}</span>
                          <span className={`text-white text-xs font-semibold ${row.mono ? 'font-mono text-[#d4af37]' : ''}`}>{row.val}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Preorders attached to ticket */}
                  {result.preorders?.length > 0 && (
                    <div className="border-t border-white/10 pt-3 space-y-1">
                      <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-2">Précommandes</p>
                      {result.preorders.map((p, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-gray-300">{p.e} {p.n} ×{p.q}</span>
                          <span className="text-[#d4af37]">{p.p * p.q}€</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    {result.status === 'valid' && (
                      <button onClick={validateEntry}
                        className="flex-1 py-3 rounded-xl bg-green-500 text-black font-bold text-sm active:scale-95 transition-all">
                        ✓ Valider l'entrée
                      </button>
                    )}
                    <button onClick={reset}
                      className={`${result.status === 'valid' ? 'w-12' : 'flex-1'} py-3 rounded-xl bg-[#1a1a1a] text-gray-400 text-sm hover:bg-[#222] transition-all active:scale-95`}>
                      {result.status === 'valid' ? '✕' : 'Scanner suivant →'}
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* Stats */}
            {!result && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Validés', val: validatedCount, color: 'text-green-400' },
                  { label: 'Billets demo', val: Object.keys(MOCK_TICKETS).length, color: 'text-white' },
                  { label: 'Capacité', val: '350', color: 'text-gray-500' },
                ].map(s => (
                  <div key={s.label} className="glass p-3 rounded-xl text-center">
                    <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                    <p className="text-gray-600 text-[10px] uppercase tracking-wider mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── SERVICE MODE ── */}
        {scanMode === 'service' && (
          <div className="space-y-5">
            <div className="p-4 bg-[#0d0d0d] rounded-2xl border border-[#d4af37]/20">
              <p className="text-[#d4af37] text-xs uppercase tracking-widest mb-1">Mode serveur</p>
              <p className="text-gray-400 text-xs">Scanne le QR du client pour voir sa précommande et marquer les articles comme servis.</p>
            </div>

            {!serviceOrder && (
              <>
                {/* Camera viewport */}
                <div className="relative rounded-2xl overflow-hidden" style={{ height: 220, background: '#0d0d0d', border: '1px solid #1a1a1a' }}>
                  {cameraActive ? (
                    <CameraScanner active onScan={handleCameraResult} onError={handleCameraError} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                      <span className="text-4xl opacity-30">📷</span>
                      <p className="text-gray-600 text-xs">Scanne le QR code du client</p>
                    </div>
                  )}
                </div>

                {cameraError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-center">
                    <p className="text-red-400 text-xs font-semibold">Caméra inaccessible</p>
                    <p className="text-gray-500 text-[10px] mt-0.5">{cameraError}</p>
                  </div>
                )}

                <button
                  onClick={() => { setCameraError(''); setCameraActive(v => !v) }}
                  className="w-full py-3.5 rounded-2xl font-bold text-black text-sm transition-all active:scale-95"
                  style={{ background: cameraActive ? '#555' : 'linear-gradient(135deg, #d4af37, #f0c940)' }}
                >
                  {cameraActive ? '⏹ Arrêter' : '📷 Scanner le QR Client'}
                </button>

                {/* Manual entry */}
                <div className="space-y-2">
                  <label className="text-gray-600 text-xs uppercase tracking-widest">Ou saisir le code</label>
                  <div className="flex gap-2">
                    <input className="input-dark flex-1 font-mono text-sm uppercase" placeholder="LIB-001-XXXXXX"
                      value={serviceCode} onChange={(e) => setServiceCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && serviceCode && lookupOrder(serviceCode)} />
                    <button onClick={() => serviceCode && lookupOrder(serviceCode)} disabled={!serviceCode}
                      className="px-4 py-2 rounded-xl bg-[#d4af37] text-black font-bold text-sm disabled:opacity-40 transition-all">OK</button>
                  </div>
                </div>
              </>
            )}

            {/* Order result */}
            {serviceOrder && (() => {
              if (!serviceOrder.order) {
                return (
                  <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5 text-center space-y-3">
                    <p className="text-5xl">✕</p>
                    <p className="text-red-400 font-bold text-lg">Code inconnu</p>
                    <p className="text-gray-500 text-xs">Aucune réservation trouvée pour ce code.</p>
                    <p className="font-mono text-[10px] text-gray-600">{serviceOrder.code}</p>
                    <button onClick={() => { setServiceOrder(null); setServiceCode('') }}
                      className="mt-1 text-xs text-gray-500 underline">Réessayer</button>
                  </div>
                )
              }
              const { order, code } = serviceOrder
              const allServed = order.items.length > 0 && order.items.every(i => servedItems[code]?.has(i.name))
              return (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[#d4af37]/30 bg-[#d4af37]/5 p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-semibold">{order.holder}</p>
                        <p className="text-gray-500 text-xs">{order.place} · {order.event}</p>
                      </div>
                      <span className="font-mono text-[#d4af37] text-[10px]">{code}</span>
                    </div>

                    {order.items.length === 0 ? (
                      <div className="text-center py-3">
                        <p className="text-gray-500 text-sm">Aucune précommande</p>
                        <p className="text-gray-600 text-xs mt-1">Ce client n'a pas commandé de consommations</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-gray-500 text-xs uppercase tracking-widest">Précommande</p>
                        {order.items.map(item => {
                          const served = servedItems[code]?.has(item.name)
                          return (
                            <div key={item.name}
                              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${served ? 'border-green-500/30 bg-green-500/5 opacity-60' : 'border-[#222] bg-black/30'}`}>
                              <div className="flex items-center gap-3">
                                <span className="text-xl">{item.emoji}</span>
                                <div>
                                  <p className={`text-sm font-semibold ${served ? 'text-gray-500 line-through' : 'text-white'}`}>{item.name}</p>
                                  <p className="text-gray-600 text-xs">×{item.qty} · {item.price * item.qty}€</p>
                                </div>
                              </div>
                              <button onClick={() => toggleServed(code, item.name)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${served ? 'bg-green-500/20 border border-green-500/40 text-green-400' : 'bg-[#d4af37] text-black hover:bg-[#f0c940]'}`}>
                                {served ? '✓ Servi' : 'Marquer servi'}
                              </button>
                            </div>
                          )
                        })}
                        {allServed && (
                          <div className="p-2 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                            <p className="text-green-400 text-xs font-semibold">✓ Toute la commande a été servie</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setServiceOrder(null); setServiceCode('') }}
                    className="w-full py-3 rounded-xl bg-[#1a1a1a] text-gray-400 text-sm hover:bg-[#222] transition-all">
                    Client suivant →
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
      `}</style>
    </div>
  )
}
