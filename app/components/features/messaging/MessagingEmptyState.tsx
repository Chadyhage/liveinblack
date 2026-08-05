import type { ReactNode } from 'react'

export default function MessagingEmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '48px 24px', textAlign: 'center' }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 54, height: 54, borderRadius: 'var(--radius-lg)', color: 'var(--primary)', background: 'rgba(184, 243, 74,.10)', opacity: .85 }}>{icon}</span>
      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{title}</p>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, maxWidth: 220, lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  )
}
