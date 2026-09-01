import type { ReactNode } from 'react'
import Mascot from '@/app/components/ui/Mascot'

export default function MessagingEmptyState(props: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div style={{ minHeight: 'clamp(400px, 58vh, 660px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 'clamp(44px, 7vw, 84px) 24px', textAlign: 'center' }}>
      <Mascot mood="message" size={220} />
      <p style={{ fontSize: 'clamp(22px, 2.8vw, 30px)', fontWeight: 780, color: 'var(--text)', margin: 0 }}>{props.title}</p>
      <p style={{ fontSize: 'var(--font-size-headline)', color: 'var(--text-faint)', margin: 0, maxWidth: 460, lineHeight: 1.55 }}>{props.subtitle}</p>
    </div>
  )
}
