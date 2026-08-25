'use client'

import { Star } from 'lucide-react'
import { Button } from '@/app/components/ui'
import { ModalShell } from './MessagingModals'
import MessagingEmptyState from './MessagingEmptyState'

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '7px 0',
  borderBottom: '1px solid var(--border)',
  gap: 8,
}

export default function StarredModal({
  messages,
  currentUserId,
  onJumpTo,
  onUnstar,
  onClose,
  messageTypeLabel,
}: {
  messages: Array<{
    id: string
    conversationId: string
    senderId: string
    senderName: string
    type: 'text' | 'image' | 'voice' | 'poll' | 'event_poll' | 'story' | 'event' | 'catalog_item' | 'system'
    content: string | null
  }>
  currentUserId: string
  onJumpTo: (conversationId: string) => void
  onUnstar: (messageId: string) => void
  onClose: () => void
  messageTypeLabel: (type: 'text' | 'image' | 'voice' | 'poll' | 'event_poll' | 'story' | 'event' | 'catalog_item' | 'system') => string
}) {
  return (
    <ModalShell title="Messages importants" onClose={onClose} wide>
      {messages.length === 0 ? (
        <MessagingEmptyState icon={<Star size={32} />} title="Aucun message important" subtitle="Appui long (ou clic droit) sur un message → « Marquer important »" />
      ) : null}
      {messages.map((m) => (
        <div key={m.id} style={rowStyle}>
          <Button variant="ghost" onClick={() => onJumpTo(m.conversationId)} style={{ textAlign: 'left', flex: 1, minWidth: 0, fontWeight: 400, display: 'block', padding: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: m.senderId === currentUserId ? 'var(--teal)' : 'var(--text-muted)', margin: 0 }}>{m.senderName}</p>
            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.content || messageTypeLabel(m.type)}
            </p>
          </Button>
          <Button variant="secondary" onClick={() => onUnstar(m.id)} size="sm" style={{ borderRadius: 999 }}>
            Retirer
          </Button>
        </div>
      ))}
    </ModalShell>
  )
}
