import type { CSSProperties } from 'react'
import Image from 'next/image'

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_PX: Record<AvatarSize, number> = { sm: 28, md: 36, lg: 48, xl: 88 }
const FONT_PX: Record<AvatarSize, number> = { sm: 11, md: 13, lg: 17, xl: 30 }

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

export interface AvatarProps {
  src?: string | null
  name: string
  size?: AvatarSize
  style?: CSSProperties
}

// Avatar circulaire — photo si disponible, sinon initiales sur fond teal.
// Remplace le bloc `borderRadius:'50%'` + logique d'initiales dupliqué dans
// une quarantaine d'écrans (portefeuille, messagerie, annuaires, espaces
// organisateur/prestataire/agent, etc.).
export default function Avatar({ src, name, size = 'md', style }: AvatarProps) {
  const px = SIZE_PX[size]
  const shared: CSSProperties = {
    width: px,
    height: px,
    borderRadius: '50%',
    flexShrink: 0,
    ...style,
  }
  if (src) {
    return (
      <span style={{ ...shared, position: 'relative', overflow: 'hidden', display: 'inline-block', background: 'var(--surface-2)' }}>
        <Image src={src} alt={name} fill sizes={`${px}px`} style={{ objectFit: 'cover' }} />
      </span>
    )
  }
  return (
    <span
      style={{
        ...shared,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--teal-solid)',
        color: 'var(--obsidian)',
        fontWeight: 800,
        fontSize: FONT_PX[size],
      }}
    >
      {initialsOf(name)}
    </span>
  )
}
