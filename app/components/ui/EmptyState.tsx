import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

export default function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 10, padding: '42px 24px', border: '1px dashed rgba(255,229,0,.24)', borderRadius: 'var(--radius-lg)', background: 'rgba(17,19,27,.72)', textAlign: 'center' }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: 'var(--radius-lg)', color: 'var(--primary)', background: 'rgba(255,229,0,.10)' }}>
        <Inbox size={22} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2>
      {description && <p style={{ maxWidth: 420, margin: 0, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.55 }}>{description}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  )
}
