import { ImageResponse } from 'next/og'

export const alt = 'LIVEINBLACK — La scène événementielle du Bénin'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 68, color: '#f7f7f8', background: 'linear-gradient(135deg, #08090a 0%, #181714 58%, #3a301f 100%)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 28, height: 28, borderRadius: 999, background: '#c8a96e' }} />
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 5 }}>LIVEINBLACK</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 980 }}>
        <div style={{ color: '#c8a96e', fontSize: 24, fontWeight: 700 }}>BÉNIN · AFRIQUE DE L’OUEST</div>
        <div style={{ fontSize: 76, lineHeight: 1.04, fontWeight: 850, letterSpacing: -3 }}>Découvre. Réserve. Vis l’événement.</div>
        <div style={{ color: '#c7c8ca', fontSize: 28 }}>Événements, billetterie et prestataires vérifiés près de toi.</div>
      </div>
    </div>,
    size,
  )
}
