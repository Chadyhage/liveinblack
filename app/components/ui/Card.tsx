import type { CSSProperties, ReactNode } from 'react'

export interface CardProps {
  children: ReactNode
  style?: CSSProperties
  accent?: string
}

// Conteneur "surface" custom — remplace la constante locale `cardStyle`
// (`background: var(--surface), border: 1px solid var(--border), borderRadius: 16, padding: 20`)
// redéfinie à l'identique dans des dizaines de fichiers. `accent` permet de
// personnaliser la couleur de bordure (ex. `rgba(184,243,74,0.25)` pour un
// encart accentué) sans redéfinir tout l'objet de style.
export default function Card({ children, style, accent }: CardProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${accent || 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
