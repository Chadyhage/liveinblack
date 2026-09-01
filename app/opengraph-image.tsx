import { ImageResponse } from 'next/og'
import { STATIC_THEME } from '@/lib/shared/staticTheme'

export const alt = 'LIVEINBLACK — La scène événementielle du Bénin'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 68, color: STATIC_THEME.imageText, background: `linear-gradient(135deg, ${STATIC_THEME.imageBlack} 0%, ${STATIC_THEME.darkBackground} 58%, ${STATIC_THEME.primaryDeep} 100%)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 28, height: 28, borderRadius: 999, background: STATIC_THEME.primary }} />
        <div style={{ fontSize: 'var(--font-size-large-title)', fontWeight: 800, letterSpacing: 5 }}>LIVEINBLACK</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 980 }}>
        <div style={{ color: STATIC_THEME.primary, fontSize: 'var(--font-size-title-1)', fontWeight: 700 }}>BÉNIN · AFRIQUE DE L’OUEST</div>
        <div style={{ fontSize: 'var(--font-size-poster)', lineHeight: 1.04, fontWeight: 850, letterSpacing: -3 }}>Découvre. Réserve. Vis l’événement.</div>
        <div style={{ color: STATIC_THEME.imageTextMuted, fontSize: 'var(--font-size-large-title)' }}>Événements, billetterie et prestataires vérifiés près de toi.</div>
      </div>
    </div>,
    size,
  )
}
