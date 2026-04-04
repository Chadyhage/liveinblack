import { useParams } from 'react-router-dom'
import { verifyTicketToken } from '../utils/ticket'

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

export default function TicketPage() {
  const { token } = useParams()
  const { valid, data } = verifyTicketToken(token || '')

  const scannedAt = new Date().toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  if (!valid) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px', position: 'relative', zIndex: 1,
        fontFamily: FONTS.mono,
      }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          {/* Invalid icon */}
          <div style={{
            width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
            background: 'rgba(224,90,170,0.08)', border: '2px solid rgba(224,90,170,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={COLORS.pink} strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>

          <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 28, color: COLORS.pink, margin: '0 0 10px' }}>
            Billet invalide
          </p>
          <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, margin: '0 0 24px', lineHeight: 1.7 }}>
            Ce QR code n'est pas reconnu ou a été falsifié.
          </p>

          <div style={{
            ...CARD,
            borderColor: 'rgba(224,90,170,0.20)',
            padding: '10px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={COLORS.pink} strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: 'rgba(224,90,170,0.55)', margin: 0, letterSpacing: '0.06em' }}>
                Signature cryptographique invalide · LIVEINBLACK
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', padding: '36px 16px 48px',
      position: 'relative', zIndex: 1,
      fontFamily: FONTS.mono,
    }}>
      <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Valid header */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 14px',
            background: 'rgba(78,232,200,0.10)', border: '2.5px solid rgba(78,232,200,0.50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={COLORS.teal} strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 30, color: COLORS.teal, margin: '0 0 5px', letterSpacing: '0.04em' }}>
            Billet Valide
          </p>
          <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, letterSpacing: '0.06em' }}>
            Scanné le {scannedAt}
          </p>
        </div>

        {/* Event block */}
        <div style={{ ...CARD, padding: 20 }}>
          <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.gold, textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 10px' }}>
            Événement
          </p>
          <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 30, color: '#fff', textTransform: 'uppercase', lineHeight: 1.15, margin: '0 0 5px', letterSpacing: '0.04em' }}>
            {data.en}
          </p>
          <p style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted, margin: 0 }}>{data.ed}</p>

          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 16, paddingTop: 16,
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          }}>
            <div>
              <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Type de place
              </p>
              <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 18, color: '#fff', margin: 0 }}>{data.pl}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Prix place
              </p>
              <p style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 22, color: COLORS.gold, margin: 0 }}>{data.pr}€</p>
            </div>
          </div>
        </div>

        {/* Preorder block */}
        {data.po?.length > 0 && (
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
              <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.gold, textTransform: 'uppercase', letterSpacing: '0.14em', margin: 0 }}>
                Précommande
              </p>
            </div>
            {data.po.map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: i < data.po.length - 1 ? 10 : 0,
                paddingBottom: i < data.po.length - 1 ? 10 : 0,
                borderBottom: i < data.po.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted }}>
                  {item.n}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.dim }}>×{item.q}</span>
                  <span style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 16, color: '#fff' }}>{item.p * item.q}€</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Total */}
        <div style={{ ...CARD, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted }}>Total payé</span>
          <span style={{ fontFamily: FONTS.display, fontWeight: 300, fontSize: 30, color: COLORS.gold }}>{data.tp}€</span>
        </div>

        {/* Ticket code */}
        <div style={{ ...CARD, padding: '12px 16px', textAlign: 'center' }}>
          <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: COLORS.dim, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 6px' }}>
            Code billet
          </p>
          <p style={{ fontFamily: FONTS.mono, fontSize: 14, color: COLORS.gold, letterSpacing: '0.10em', margin: 0 }}>
            {data.tc}
          </p>
        </div>

        {/* Security badge */}
        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <p style={{ fontFamily: FONTS.mono, fontSize: 9, color: 'rgba(255,255,255,0.18)', margin: 0, letterSpacing: '0.06em' }}>
              Signature cryptographique valide · LIVEINBLACK
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
