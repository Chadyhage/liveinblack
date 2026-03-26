import { useParams } from 'react-router-dom'
import { verifyTicketToken } from '../utils/ticket'

export default function TicketPage() {
  const { token } = useParams()
  const { valid, data } = verifyTicketToken(token || '')

  const scannedAt = new Date().toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  if (!valid) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, margin: '0 auto 20px',
          }}>⚠️</div>
          <p style={{ color: '#f87171', fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Billet invalide</p>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>Ce QR code n'est pas reconnu ou a été falsifié.</p>
          <div style={{ border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '10px 16px', background: 'rgba(239,68,68,0.04)' }}>
            <p style={{ color: 'rgba(248,113,113,0.5)', fontSize: 11 }}>🔐 Signature cryptographique invalide · LIVEINBLACK</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', padding: '32px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 440, margin: '0 auto' }}>

        {/* Valid header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(34,197,94,0.12)', border: '2.5px solid #22c55e',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, color: '#22c55e', fontWeight: 900,
            margin: '0 auto 12px',
          }}>✓</div>
          <p style={{ color: '#22c55e', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Billet Valide</p>
          <p style={{ color: '#4b5563', fontSize: 12 }}>Scanné le {scannedAt}</p>
        </div>

        {/* Event block */}
        <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: 16, padding: 20, marginBottom: 12 }}>
          <p style={{ color: '#d4af37', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>Événement</p>
          <p style={{ color: 'white', fontSize: 26, fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.15, marginBottom: 4 }}>{data.en}</p>
          <p style={{ color: '#9ca3af', fontSize: 14 }}>{data.ed}</p>
          <div style={{ borderTop: '1px solid #222', marginTop: 14, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>Type de place</p>
              <p style={{ color: 'white', fontWeight: 600, fontSize: 15 }}>{data.pl}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 2 }}>Prix place</p>
              <p style={{ color: '#d4af37', fontWeight: 700, fontSize: 17 }}>{data.pr}€</p>
            </div>
          </div>
        </div>

        {/* Preorder block */}
        {data.po?.length > 0 && (
          <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: 16, padding: 20, marginBottom: 12 }}>
            <p style={{ color: '#d4af37', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>🛒 Précommande</p>
            {data.po.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: i < data.po.length - 1 ? 10 : 0 }}>
                <span style={{ color: '#d1d5db', fontSize: 14 }}>{item.e} {item.n}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#6b7280', fontSize: 12 }}>×{item.q}</span>
                  <span style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>{item.p * item.q}€</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Total */}
        <div style={{ background: '#111', border: '1px solid #1f1f1f', borderRadius: 16, padding: '14px 20px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#9ca3af', fontSize: 15 }}>Total payé</span>
          <span style={{ color: '#d4af37', fontWeight: 700, fontSize: 24 }}>{data.tp}€</span>
        </div>

        {/* Ticket code */}
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: '12px 16px', textAlign: 'center', marginBottom: 20 }}>
          <p style={{ color: '#374151', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Code billet</p>
          <p style={{ color: '#4b5563', fontFamily: 'monospace', fontSize: 13, letterSpacing: 1 }}>{data.tc}</p>
        </div>

        {/* Security badge */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#1f2937', fontSize: 10 }}>🔐 Signature cryptographique valide · LIVEINBLACK</p>
        </div>
      </div>
    </div>
  )
}
