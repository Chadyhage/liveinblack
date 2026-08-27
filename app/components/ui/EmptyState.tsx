import type { ReactNode } from 'react'
import Mascot from './Mascot'

export default function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 4, padding: '16px 14px', border: '1px dashed var(--primary-a24)', borderRadius: 12, background: 'rgba(17,19,27,.72)', textAlign: 'center' }}>
      <Mascot mood="search" size={60} />
      <h2 style={{ margin: '2px 0 0', fontSize: 15.5, fontWeight: 750, textTransform: 'none', letterSpacing: '-.02em' }}>{title}</h2>
      {description && <p style={{ maxWidth: 420, margin: 0, color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.38 }}>{description}</p>}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  )
}
