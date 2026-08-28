'use client'

import type { ReactNode } from 'react'
import { Button } from '@/app/components/ui'
import { ModalShell } from './MessagingModals'
import styles from '@/app/(app)/messages/MessagesClient.module.css'
import type { MessageView } from './types'

const QUICK_REACT = ['❤️', '😂', '😮', '😢', '😡', '👍', '👎', '🔥']

export interface MessageContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

export function buildMessageContextMenuItems({
  message,
  currentUserId,
  amAdmin,
  pinnedMessageId,
  onReply,
  onEdit,
  onStar,
  onForward,
  onPin,
  onDeleteForMe,
  onDeleteForAll,
}: {
  message: MessageView
  currentUserId: string
  amAdmin: boolean
  pinnedMessageId: string | null
  onReply: () => void
  onEdit: () => void
  onStar: () => void
  onForward: () => void
  onPin: () => void
  onDeleteForMe: () => void
  onDeleteForAll: () => void
}): MessageContextMenuItem[] {
  const isMine = message.senderId === currentUserId
  const items: MessageContextMenuItem[] = []

  if (!message.deletedForAll) {
    items.push({ label: 'Répondre', onClick: onReply })
    if (isMine && message.type === 'text') items.push({ label: 'Modifier', onClick: onEdit })
    items.push({ label: message.starredByMe ? 'Retirer des importants' : 'Marquer important', onClick: onStar })
    items.push({ label: 'Transférer', onClick: onForward })
    if (amAdmin) items.push({ label: pinnedMessageId === message.id ? 'Désépingler' : 'Épingler', onClick: onPin })
    items.push({ label: 'Supprimer pour moi', onClick: onDeleteForMe })
    if (isMine) items.push({ label: 'Supprimer pour tous', onClick: onDeleteForAll, danger: true })
  }

  return items
}

export function MessageContextMenu({
  message,
  x,
  y,
  currentUserId,
  amAdmin,
  pinnedMessageId,
  onClose,
  onReact,
  onReply,
  onEdit,
  onStar,
  onForward,
  onPin,
  onDeleteForMe,
  onDeleteForAll,
}: {
  message: MessageView
  x: number
  y: number
  currentUserId: string
  amAdmin: boolean
  pinnedMessageId: string | null
  onClose: () => void
  onReact: (emoji: string) => void
  onReply: () => void
  onEdit: () => void
  onStar: () => void
  onForward: () => void
  onPin: () => void
  onDeleteForMe: () => void
  onDeleteForAll: () => void
}) {
  const items = buildMessageContextMenuItems({
    message,
    currentUserId,
    amAdmin,
    pinnedMessageId,
    onReply,
    onEdit,
    onStar,
    onForward,
    onPin,
    onDeleteForMe,
    onDeleteForAll,
  })

  const maxX = typeof window !== 'undefined' ? window.innerWidth - 220 : x
  const left = Math.max(12, Math.min(x, maxX))
  const maxY = typeof window !== 'undefined' ? window.innerHeight - Math.min(440, 52 + items.length * 48) - 12 : y
  const top = Math.max(12, Math.min(y, maxY))

  return (
    <>
      <Button className={styles.menuBackdrop} variant="ghost" onClick={onClose} onContextMenu={(event) => event.preventDefault()} aria-label="Fermer le menu" />
      <div role="menu" aria-label="Actions du message" className={`${styles.menu} ${styles.fixedMenu}`} style={{ top, left }} onKeyDown={(event) => handleMenuKeyDown(event, onClose)}>
        {!message.deletedForAll ? (
          <div className={styles.quickReactions} aria-label="Réactions rapides">
            {QUICK_REACT.map((emoji, index) => (
              <Button key={emoji} variant="ghost" role="menuitem" autoFocus={index === 0} onClick={() => { onReact(emoji); onClose() }} aria-label={`Réagir avec ${emoji}`}>
                {emoji}
              </Button>
            ))}
          </div>
        ) : null}
        {items.map((item, index) => (
          <Button
            key={item.label}
            variant="ghost"
            role="menuitem"
            autoFocus={message.deletedForAll && index === 0}
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={`${styles.menuItem}${item.danger ? ` ${styles.dangerItem}` : ''}`}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </>
  )
}

export function FullReactionPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const emojis = ['❤️', '😂', '😮', '😢', '😡', '👍', '👎', '🔥', '🎉', '💀', '🤣', '😍', '😭', '🙏', '💯', '✅']

  return (
    <ModalShell title="Réagir" onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        {emojis.map((emoji) => (
          <Button
            key={emoji}
            variant="secondary"
            onClick={() => {
              onPick(emoji)
              onClose()
            }}
            style={{ background: 'var(--surface)', border: 'none', borderRadius: 8, padding: 8, fontSize: 20 }}
          >
            {emoji}
          </Button>
        ))}
      </div>
    </ModalShell>
  )
}

export function DropdownMenu({ items, onClose, layout = 'list' }: { items: { label: string; icon?: ReactNode; onClick: () => void }[]; onClose: () => void; layout?: 'list' | 'grid' }) {
  return (
    <>
      <Button className={styles.menuBackdrop} variant="ghost" onClick={onClose} aria-label="Fermer le menu" style={{ zIndex: 49 }} />
      <div role="menu" aria-label="Actions disponibles" className={`${styles.menu} ${styles.relativeMenu}${layout === 'grid' ? ` ${styles.attachmentMenu}` : ''}`} onKeyDown={(event) => handleMenuKeyDown(event, onClose)}>
        {items.map((item, index) => (
          <Button
            key={item.label}
            variant="ghost"
            role="menuitem"
            autoFocus={index === 0}
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={styles.menuItem}
          >
            {item.icon ? <span className={styles.attachmentIcon}>{item.icon}</span> : null}
            {item.label}
          </Button>
        ))}
      </div>
    </>
  )
}

function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>, onClose: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault()
    onClose()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'))
  if (!controls.length) return
  const current = controls.indexOf(document.activeElement as HTMLElement)
  if (event.key === 'Home') return controls[0].focus()
  if (event.key === 'End') return controls[controls.length - 1].focus()
  const offset = event.key === 'ArrowDown' ? 1 : -1
  controls[(current + offset + controls.length) % controls.length].focus()
}
