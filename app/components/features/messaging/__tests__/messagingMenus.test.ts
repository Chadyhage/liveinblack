import { describe, expect, it, vi } from 'vitest'
import { buildMessageContextMenuItems } from '../MessagingMenus'
import type { MessageView } from '../types'

function makeMessage(overrides: Partial<MessageView> = {}): MessageView {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    senderName: 'Awa',
    type: 'text',
    content: 'hello',
    poll: null,
    reactions: {},
    readBy: {},
    deletedForAll: false,
    pinned: false,
    replyToMessageId: null,
    createdAt: '2026-08-20T12:00:00.000Z',
    editedAt: null,
    starredByMe: false,
    forwardedFrom: null,
    readStatus: null,
    ...overrides,
  }
}

describe('MessagingMenus helpers', () => {
  it('construit les actions attendues pour le propriétaire du message', () => {
    const items = buildMessageContextMenuItems({
      message: makeMessage({ senderId: 'me' }),
      currentUserId: 'me',
      amAdmin: true,
      pinnedMessageId: null,
      onReply: vi.fn(),
      onEdit: vi.fn(),
      onStar: vi.fn(),
      onForward: vi.fn(),
      onPin: vi.fn(),
      onDeleteForMe: vi.fn(),
      onDeleteForAll: vi.fn(),
    })

    expect(items.map((item) => item.label)).toEqual([
      'Répondre',
      'Modifier',
      'Marquer important',
      'Transférer',
      'Épingler',
      'Supprimer pour moi',
      'Supprimer pour tous',
    ])
    expect(items.at(-1)?.danger).toBe(true)
  })

  it('retire les actions interdites pour un message déjà supprimé', () => {
    const items = buildMessageContextMenuItems({
      message: makeMessage({ deletedForAll: true }),
      currentUserId: 'me',
      amAdmin: true,
      pinnedMessageId: 'm1',
      onReply: vi.fn(),
      onEdit: vi.fn(),
      onStar: vi.fn(),
      onForward: vi.fn(),
      onPin: vi.fn(),
      onDeleteForMe: vi.fn(),
      onDeleteForAll: vi.fn(),
    })

    expect(items).toEqual([])
  })

  it('adapte le libellé important et cache modifier/supprimer pour les autres membres', () => {
    const items = buildMessageContextMenuItems({
      message: makeMessage({ senderId: 'u2', starredByMe: true }),
      currentUserId: 'me',
      amAdmin: false,
      pinnedMessageId: null,
      onReply: vi.fn(),
      onEdit: vi.fn(),
      onStar: vi.fn(),
      onForward: vi.fn(),
      onPin: vi.fn(),
      onDeleteForMe: vi.fn(),
      onDeleteForAll: vi.fn(),
    })

    expect(items.map((item) => item.label)).toEqual([
      'Répondre',
      'Retirer des importants',
      'Transférer',
      'Supprimer pour moi',
    ])
  })
})
