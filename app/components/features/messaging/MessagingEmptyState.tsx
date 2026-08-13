import type { ReactNode } from 'react'
import Mascot from '@/app/components/ui/Mascot'

export default function MessagingEmptyState(props: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '48px 24px', textAlign: 'center' }}>
      <Mascot mood="message" size={132} />
      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{props.title}</p>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, maxWidth: 220, lineHeight: 1.5 }}>{props.subtitle}</p>
    </div>
  )
}
