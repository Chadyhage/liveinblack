import type { ReactNode } from 'react'
import Mascot, { type MascotMood } from './Mascot'

export default function EmptyState({ title, description, action, mood = 'search', imageSize = 250 }: { title: string; description?: string; action?: ReactNode; mood?: MascotMood; imageSize?: number }) {
  return (
    <div style={{ minHeight: 'clamp(380px, 58vh, 640px)', display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 14, padding: 'clamp(32px, 6vw, 76px) 18px', textAlign: 'center' }}>
      <Mascot mood={mood} size={imageSize} />
      <h2 style={{ margin: 0, fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 780, textTransform: 'none', letterSpacing: 0 }}>{title}</h2>
      {description && <p style={{ maxWidth: 540, margin: 0, color: 'var(--text-muted)', fontSize: 'var(--font-size-headline)', lineHeight: 1.55 }}>{description}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}
