'use client'

import { Checkbox } from '@/app/components/ui'
import { ModalActions, ModalShell } from './MessagingModals'

interface ConversationMember {
  userId: string
  name: string
  role: 'admin' | 'member'
  muteUntilAt?: string | null
}

interface ConversationView {
  id: string
  type: 'direct' | 'group'
  participantIds: string[]
  members: ConversationMember[]
  name: string | null
  avatar: string | null
  mutedUserIds: string[]
  lastMessage: string
  lastMessageAt: string | null
  lastSenderId: string | null
  pinnedMessageId: string | null
  createdAt: string
  unreadCount: number
  pinned: boolean
  mutedForMe: boolean
  myGroupMute: { untilAt: string | null } | null
}

const rowButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  padding: '7px 4px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
}

function conversationLabel(conv: ConversationView, currentUserId: string): string {
  if (conv.type === 'group') return conv.name || 'Groupe'
  return conv.members.find((m) => m.userId !== currentUserId)?.name || 'Discussion'
}

function avatarColorFor(userId: string): string {
  const colors = ['var(--primary)', '#8b5cf6', '#e05aaa', '#3b82f6', 'var(--primary-strong)', '#f59e0b']
  if (!userId) return colors[0]
  const code = userId.charCodeAt(userId.length - 1) || 0
  return colors[code % colors.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Avatar({ userId, name, size = 30 }: { userId: string; name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: avatarColorFor(userId),
        color: '#fff',
        fontSize: Math.max(11, Math.round(size * 0.38)),
        fontWeight: 700,
      }}
    >
      {getInitials(name)}
    </span>
  )
}

function GroupAvatar({ size = 30 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background: 'rgba(139,92,246,.22)',
        color: '#fff',
        fontSize: Math.max(11, Math.round(size * 0.4)),
        fontWeight: 800,
      }}
    >
      #
    </span>
  )
}

export default function ForwardModal({
  conversations,
  currentUserId,
  picked,
  onToggle,
  onConfirm,
  onClose,
}: {
  conversations: ConversationView[]
  currentUserId: string
  picked: Set<string>
  onToggle: (conversationId: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <ModalShell title="Transférer vers…" onClose={onClose} wide>
      <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
        {conversations.map((conv) => {
          const label = conversationLabel(conv, currentUserId)
          return (
            <Checkbox
              key={conv.id}
              checked={picked.has(conv.id)}
              onChange={() => onToggle(conv.id)}
              style={{ ...rowButtonStyle, cursor: 'pointer' }}
              label={
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {conv.type === 'group' ? <GroupAvatar size={30} /> : <Avatar userId={conv.id} name={label} size={30} />}
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 400 }}>{label}</span>
                </span>
              }
            />
          )
        })}
      </div>
      <ModalActions onCancel={onClose} onConfirm={onConfirm} confirmLabel="Transférer" disabled={picked.size === 0} />
    </ModalShell>
  )
}
