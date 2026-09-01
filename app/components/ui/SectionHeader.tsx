import type { CSSProperties, ElementType, ReactNode } from 'react'

export interface SectionHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  align?: 'left' | 'center'
  compact?: boolean
  level?: 1 | 2 | 3
}

export default function SectionHeader({ eyebrow, title, description, align = 'left', compact = false, level = 1 }: SectionHeaderProps) {
  const Heading: ElementType = `h${level}`
  return (
    <header style={{ textAlign: align, marginBottom: compact ? 18 : 28 }}>
      {eyebrow && (
        <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: 0, color: 'var(--teal)', fontFamily: 'var(--font-display), sans-serif', fontSize: 'var(--font-size-callout)', letterSpacing: '.16em', lineHeight: 1.2, textTransform: 'uppercase' }}>
          <span className="lb-accent-line" style={{ width: 24, height: 3 }} aria-hidden="true" />
          {eyebrow}
        </p>
      )}
      <Heading style={{ margin: eyebrow ? '8px 0 0' : 0, color: 'var(--text)', fontSize: 'clamp(26px, 4vw, 42px)', lineHeight: 1.02, fontWeight: 800, letterSpacing: '0.01em' }}>
        {title}
      </Heading>
      {description && <p style={{ maxWidth: 760, margin: '10px 0 0', marginInline: align === 'center' ? 'auto' : undefined, color: 'var(--text-muted)', fontSize: 'var(--font-size-body-sm)', lineHeight: 1.6 }}>{description}</p>}
    </header>
  )
}

export const sectionHeaderContent: CSSProperties = { maxWidth: 1320, margin: '0 auto', padding: '0 clamp(14px, 2vw, 28px)' }
