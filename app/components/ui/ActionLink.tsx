import Link from 'next/link'
import type { ComponentProps, CSSProperties, ReactNode } from 'react'

type Tone = 'primary' | 'secondary' | 'ghost'

export interface ActionLinkProps extends Omit<ComponentProps<typeof Link>, 'children'> {
  children: ReactNode
  tone?: Tone
  icon?: ReactNode
  fullWidth?: boolean
}

const TONES: Record<Tone, CSSProperties> = {
  primary: { background: 'var(--primary)', color: 'var(--primary-ink)', border: '1px solid transparent' },
  secondary: { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-strong)' },
  ghost: { background: 'transparent', color: 'var(--accent-text)', border: '1px solid transparent' },
}

/** Lien d’action du design system. Il conserve la sémantique d’un lien tout en partageant l’apparence et la zone tactile des boutons. */
export default function ActionLink({ children, tone = 'primary', icon, fullWidth, style, ...props }: ActionLinkProps) {
  return (
    <Link
      {...props}
      style={{
        minHeight: 'var(--control-height-md)',
        width: fullWidth ? '100%' : undefined,
        padding: '12px 20px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 'var(--radius-control)',
        fontSize: 'var(--font-size-headline)',
        fontWeight: 700,
        lineHeight: 1.2,
        textAlign: 'center',
        textDecoration: 'none',
        ...TONES[tone],
        ...style,
      }}
    >
      {icon}
      {children}
    </Link>
  )
}
