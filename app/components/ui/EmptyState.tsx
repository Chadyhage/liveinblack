import type { ReactNode } from 'react'
import Mascot from './Mascot'

export default function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 6, padding: '32px 24px', border: '1px dashed rgba(184, 243, 74,.24)', borderRadius: 'var(--radius-lg)', background: 'rgba(17,19,27,.72)', textAlign: 'center' }}>
      <Mascot mood="search" size={118} />
      <h2 style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 800 }}>{title}</h2>
      {description && <p style={{ maxWidth: 420, margin: 0, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.55 }}>{description}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  )
}
