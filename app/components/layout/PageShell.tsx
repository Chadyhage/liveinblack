import type { CSSProperties, ReactNode } from 'react'

export interface PageShellProps {
  children: ReactNode
  maxWidth?: number
  narrow?: boolean
  style?: CSSProperties
}

export default function PageShell({ children, maxWidth = 1120, narrow = false, style }: PageShellProps) {
  return (
    <main style={{ width: '100%', maxWidth, margin: '0 auto', padding: narrow ? '28px 16px 60px' : '36px 22px 72px', ...style }}>
      {children}
    </main>
  )
}
