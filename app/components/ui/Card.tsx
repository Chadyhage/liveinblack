import { forwardRef } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style'> {
  children: ReactNode
  style?: CSSProperties
  accent?: string
}

// Conteneur "surface" custom — remplace la constante locale `cardStyle`
// (`background: var(--surface), border: 1px solid var(--border), borderRadius: 16, padding: 20`)
// redéfinie à l'identique dans des dizaines de fichiers. `accent` permet de
// personnaliser la couleur de bordure (ex. `rgba(184,243,74,0.25)` pour un
// encart accentué) sans redéfinir tout l'objet de style.
//
// `ref` transmis + reste des attributs HTML standards (role, aria-*, id...)
// spreadés — nécessaire pour les usages qui portent un rôle ARIA (dialog,
// listbox) ou une détection de clic extérieur par ref (ex.
// AmbientMusicPlayer.tsx), plutôt que de forcer ces appelants à revenir à un
// <div> stylé à la main "isolé" du design system.
const Card = forwardRef<HTMLDivElement, CardProps>(function Card({ children, style, accent, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={`lb-card${className ? ` ${className}` : ''}`}
      {...rest}
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
})

export default Card
