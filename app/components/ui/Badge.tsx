import type { CSSProperties, ReactNode } from 'react'

export type BadgeTone = 'teal' | 'gold' | 'pink' | 'violet' | 'danger' | 'neutral'

const TONE_STYLES: Record<BadgeTone, CSSProperties> = {
  teal: { background: 'rgba(78,232,200,0.14)', color: 'var(--teal)' },
  gold: { background: 'rgba(200,169,110,0.16)', color: 'var(--gold)' },
  pink: { background: 'rgba(224,90,170,0.14)', color: 'var(--pink)' },
  violet: { background: 'rgba(139,92,246,0.16)', color: 'var(--violet)' },
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
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        ...TONE_STYLES[tone],
      }}
    >
      {children}
    </span>
  )
}
