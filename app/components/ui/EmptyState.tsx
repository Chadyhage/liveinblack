import type { ReactNode } from 'react'
import Mascot from './Mascot'

export default function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 5, padding: '22px 18px', border: '1px dashed rgba(184, 243, 74,.24)', borderRadius: 'var(--radius-lg)', background: 'rgba(17,19,27,.72)', textAlign: 'center' }}>
      <Mascot mood="search" size={78} />
      <h2 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 750, textTransform: 'none', letterSpacing: '-.02em' }}>{title}</h2>
      {description && <p style={{ maxWidth: 420, margin: 0, color: 'var(--text-muted)', fontSize: 13.5, lineHeight: 1.45 }}>{description}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  )
}
