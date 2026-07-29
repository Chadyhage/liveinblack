import type { CSSProperties, ReactNode } from 'react'

export type BadgeTone = 'teal' | 'gold' | 'pink' | 'violet' | 'danger' | 'neutral'

const TONE_STYLES: Record<BadgeTone, CSSProperties> = {
  teal: { background: 'rgba(184, 243, 74,0.14)', color: 'var(--primary)' },
  gold: { background: 'rgba(184, 243, 74,0.16)', color: 'var(--gold)' },
  pink: { background: 'rgba(255,107,0,0.14)', color: 'var(--pink)' },
  violet: { background: 'rgba(124,58,237,0.16)', color: 'var(--violet)' },
  danger: { background: 'rgba(224,90,90,0.16)', color: '#e05a5a' },
  neutral: { background: 'var(--surface-2)', color: 'var(--text-muted)' },
}

export default function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '.045em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        ...TONE_STYLES[tone],
      }}
    >
      {children}
    </span>
  )
}
