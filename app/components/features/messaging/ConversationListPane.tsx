'use client'

import type { ReactNode } from 'react'
import { BellOff, Pin, Search } from 'lucide-react'
import { Button, Input, Pagination } from '@/app/components/ui'
import MessagingEmptyState from './MessagingEmptyState'
import styles from '@/app/(app)/messages/MessagesClient.module.css'

interface ConversationMemberView {
  userId: string
  name: string
}

interface ConversationListItemView {
  id: string
  type: 'direct' | 'group'
  members: ConversationMemberView[]
  name: string | null
  avatar: string | null
  lastMessage: string
  lastMessageAt: string | null
  unreadCount: number
  pinned: boolean
  mutedForMe: boolean
}

export default function ConversationListPane({
  currentUserId,
  conversations,
  filteredConversations,
  activeId,
  convSearch,
  onConvSearchChange,
  onOpenConversation,
  onConversationContextMenu,
  conversationLabel,
  renderAvatar,
  presenceOnlineFor,
  formatTime,
  convPage,
  convPageCount,
  conversationTotal,
  pageSize,
  onConvPageChange,
  toolbar,
}: {
  currentUserId: string
  conversations: ConversationListItemView[]
  filteredConversations: ConversationListItemView[]
  activeId: string | null
  convSearch: string
  onConvSearchChange: (value: string) => void
  onOpenConversation: (conversationId: string) => void
  onConversationContextMenu: (conversationId: string, x: number, y: number) => void
  conversationLabel: (conversation: ConversationListItemView, currentUserId: string) => string
  renderAvatar: (conversation: ConversationListItemView, label: string, online: boolean) => ReactNode
  presenceOnlineFor: (userId: string | null) => boolean
  formatTime: (iso: string) => string
  convPage: number
  convPageCount: number
  conversationTotal: number
  pageSize: number
  onConvPageChange: (page: number) => void
  toolbar?: ReactNode
}) {
  return (
    <>
      <div style={{ padding: '18px 16px 12px' }}>
        <div style={{ marginBottom: 12 }}>
          <h1 className="font-display" style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text)' }}>Messages</h1>
        </div>
        <Input
          aria-label="Rechercher une conversation"
          value={convSearch}
          onChange={(e) => onConvSearchChange(e.target.value)}
          placeholder="Rechercher une conversation…"
          style={{ width: '100%', borderRadius: 14, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(118,118,128,.16)', color: 'var(--text)', fontSize: 14, marginBottom: 0, fontFamily: 'inherit' }}
        />
        {toolbar ? <div className={styles.toolbarRow}>{toolbar}</div> : null}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px 18px' }}>
        {conversations.length === 0 ? <MessagingEmptyState icon={<Search size={32} />} title="Aucune conversation" subtitle="Ajoute un contact et commence à discuter" /> : null}
        {conversations.length > 0 && filteredConversations.length === 0 ? (
          <MessagingEmptyState icon={<Search size={32} />} title="Aucun résultat" subtitle="Essaie un autre terme de recherche" />
        ) : null}
        {filteredConversations.map((conv) => {
          const label = conversationLabel(conv, currentUserId)
          const other = conv.type === 'direct' ? conv.members.find((m) => m.userId !== currentUserId) : null
          return (
            <Button
              key={conv.id}
              variant="ghost"
              onClick={() => onOpenConversation(conv.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                onConversationContextMenu(conv.id, e.clientX, e.clientY)
              }}
              aria-label={`Ouvrir la conversation avec ${label}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                padding: '11px 12px',
                borderRadius: 14,
                border: 'none',
                background: conv.id === activeId ? 'var(--surface-2)' : 'transparent',
                cursor: 'pointer',
                marginBottom: 4,
                fontWeight: 400,
              }}
            >
              {renderAvatar(conv, label, presenceOnlineFor(other?.userId ?? null))}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {conv.pinned ? <span title="Épinglée"><Pin size={12} /></span> : null}
                    {label}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <p
                    style={{
                      fontSize: 12,
                      color: conv.unreadCount > 0 && !conv.mutedForMe ? 'var(--text)' : 'var(--text-faint)',
                      fontWeight: conv.unreadCount > 0 && !conv.mutedForMe ? 600 : 400,
                      margin: '2px 0 0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {conv.lastMessage || 'Aucun message'}
                  </p>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {conv.mutedForMe ? <span style={{ fontSize: 11, opacity: 0.6, display: 'inline-flex', alignItems: 'center' }}><BellOff size={12} /></span> : null}
                    {conv.unreadCount > 0
                      ? conv.mutedForMe
                        ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--teal-solid)', display: 'inline-block' }} />
                        : (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#04120e',
                              background: 'var(--teal-solid)',
                              borderRadius: 999,
                              padding: '1px 6px',
                            }}
                          >
                            {conv.unreadCount}
                          </span>
                        )
                      : null}
                  </span>
                </div>
              </div>
            </Button>
          )
        })}
        {conversations.length > 0 && conversations.length <= 2 && filteredConversations.length === conversations.length ? (
          <div style={{ marginTop: 18, padding: '18px 14px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12.5, lineHeight: 1.6 }}>
            <p style={{ margin: 0 }}>Envoie un message à un organisateur ou un prestataire pour démarrer une nouvelle discussion.</p>
          </div>
        ) : null}
      </div>
      {convPageCount > 1 ? (
        <div style={{ padding: '4px 12px 10px' }}>
          <Pagination page={convPage} pageCount={convPageCount} onPageChange={onConvPageChange} totalItems={conversationTotal} pageSize={pageSize} />
        </div>
      ) : null}
    </>
  )
}
