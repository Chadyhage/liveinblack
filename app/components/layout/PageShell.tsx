import type { CSSProperties, ReactNode } from 'react'

export interface PageShellProps {
  children: ReactNode
  maxWidth?: number
  narrow?: boolean
  style?: CSSProperties
}

export default function PageShell({ children, maxWidth = 1560, narrow = false, style }: PageShellProps) {
  return (
    <main
      className="lb-page-shell"
      style={{
        width: '100%',
        maxWidth,
        margin: '0 auto',
        padding: narrow ? '32px clamp(16px, 2vw, 28px) 64px' : '52px clamp(14px, 1.8vw, 28px) 88px',
        ...style,
      }}
    >
      {children}
    </main>
  )
}
