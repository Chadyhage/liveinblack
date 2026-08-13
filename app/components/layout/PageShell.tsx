import type { CSSProperties, ReactNode } from 'react'

export interface PageShellProps {
  children: ReactNode
  maxWidth?: number
  narrow?: boolean
  style?: CSSProperties
}

export default function PageShell({ children, maxWidth = 1440, narrow = false, style }: PageShellProps) {
  return (
    <main className="lb-page-shell" style={{ width: '100%', maxWidth, margin: '0 auto', padding: narrow ? '32px 20px 64px' : '52px clamp(10px, 1.5vw, 24px) 88px', ...style }}>
      {children}
    </main>
  )
}
