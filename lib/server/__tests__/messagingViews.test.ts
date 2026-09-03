import { describe, expect, it } from 'vitest'
import { readLastReadAt, toConversationView, toMessageView, type ConversationSource, type MessageSource } from '../messaging/messagingViews'

describe('messagingViews', () => {
  it('projette une conversation en DTO stable', () => {
    const view = toConversationView({
      _id: 'conv_1',
      type: 'group',
      participantIds: ['u1', 'u2'],
      members: [{ userId: 'u1', name: 'Alice', role: 'admin' }],
      name: 'Salon',
      avatar: 'https://img.test/group.jpg',
      mutedUserIds: ['u2'],
      lastMessage: 'Salut',
      lastMessageAt: '2026-08-20T10:00:00.000Z',
      lastSenderId: 'u1',
      pinnedMessageId: 'm1',
      createdAt: '2026-08-19T10:00:00.000Z',
    })

    expect(view).toEqual({
      id: 'conv_1',
      type: 'group',
      participantIds: ['u1', 'u2'],
      members: [{ userId: 'u1', name: 'Alice', role: 'admin', avatarUrl: null }],
      name: 'Salon',
      avatar: 'https://img.test/group.jpg',
      mutedUserIds: ['u2'],
      lastMessage: 'Salut',
      lastMessageAt: '2026-08-20T10:00:00.000Z',
      lastSenderId: 'u1',
      pinnedMessageId: 'm1',
      createdAt: '2026-08-19T10:00:00.000Z',
    })
  })

  it('lit lastReadAt depuis un objet ou une Map', () => {
    expect(readLastReadAt({ u1: '2026-08-20T10:00:00.000Z' }, 'u1')).toBe(new Date('2026-08-20T10:00:00.000Z').getTime())
    expect(readLastReadAt(new Map([['u1', '2026-08-20T10:00:00.000Z']]), 'u1')).toBe(new Date('2026-08-20T10:00:00.000Z').getTime())
    expect(readLastReadAt({ u1: 'not-a-date' }, 'u1')).toBeNull()
    expect(readLastReadAt(undefined, 'u1')).toBeNull()
  })

  it('projette une conversation avec fallbacks stables quand plusieurs champs sont absents', () => {
    const view = toConversationView({
      _id: 'conv_2',
      type: 'direct',
      participantIds: ['u1'],
      members: [{ userId: 'u1' }],
      createdAt: '2026-08-20T09:00:00.000Z',
    })

    expect(view).toEqual({
      id: 'conv_2',
      type: 'direct',
      participantIds: ['u1'],
      members: [{ userId: 'u1', name: '', role: 'member', avatarUrl: null }],
      name: null,
      avatar: null,
      mutedUserIds: [],
      lastMessage: '',
      lastMessageAt: null,
      lastSenderId: null,
      pinnedMessageId: null,
      createdAt: '2026-08-20T09:00:00.000Z',
    })
  })

  it('calcule readStatus à read quand un autre participant a lu après l’envoi', () => {
    const conversation: ConversationSource = {
      _id: 'conv_1',
      type: 'direct',
      participantIds: ['u1', 'u2'],
      lastReadAt: { u2: '2026-08-20T10:05:00.000Z' },
      createdAt: '2026-08-20T09:00:00.000Z',
    }
    const message: MessageSource = {
      _id: 'm1',
      conversationId: 'conv_1',
      senderId: 'u1',
      senderName: 'Alice',
      type: 'text',
      content: 'Bonjour',
      reactions: { fire: ['u2'] },
      readBy: { u2: '2026-08-20T10:05:00.000Z' },
      createdAt: '2026-08-20T10:00:00.000Z',
      starredByUserIds: ['u1'],
    }

    const view = toMessageView(message, {
      callerId: 'u1',
      conversation,
      readReceiptsAllowed: new Map([
        ['u1', true],
        ['u2', true],
      ]),
    })

    expect(view.readStatus).toBe('read')
    expect(view.starredByMe).toBe(true)
    expect(view.readBy).toEqual({ u2: '2026-08-20T10:05:00.000Z' })
  })

  it('protège le contenu et le sondage d’un message supprimé pour tous', () => {
    const view = toMessageView(
      {
        _id: 'm2',
        conversationId: 'conv_1',
        senderId: 'u2',
        senderName: 'Bob',
        type: 'poll',
        content: 'secret',
        poll: {
          pollType: 'poll',
          question: 'On y va ?',
          options: [{ id: 'o1', text: 'Oui', voterIds: ['u1'] }],
          event: { id: 'e1', name: 'Event', date: '2026-08-21', price: 10, currency: 'EUR', image: null },
        },
        deletedForAll: true,
        createdAt: '2026-08-20T10:00:00.000Z',
      },
      {
        callerId: 'u1',
        conversation: {
          _id: 'conv_1',
          type: 'group',
          participantIds: ['u1', 'u2'],
          createdAt: '2026-08-20T09:00:00.000Z',
        },
        readReceiptsAllowed: new Map(),
      }
    )

    expect(view.content).toBeNull()
    expect(view.poll).toBeNull()
    expect(view.readStatus).toBeNull()
  })

  it('reste à sent si les confirmations de lecture sont désactivées', () => {
    const view = toMessageView(
      {
        _id: 'm3',
        conversationId: 'conv_1',
        senderId: 'u1',
        senderName: 'Alice',
        type: 'text',
        content: 'Ping',
        createdAt: '2026-08-20T10:00:00.000Z',
      },
      {
        callerId: 'u1',
        conversation: {
          _id: 'conv_1',
          type: 'direct',
          participantIds: ['u1', 'u2'],
          lastReadAt: { u2: '2026-08-20T11:00:00.000Z' },
          createdAt: '2026-08-20T09:00:00.000Z',
        },
        readReceiptsAllowed: new Map([
          ['u1', false],
          ['u2', true],
        ]),
      }
    )

    expect(view.readStatus).toBe('sent')
  })

  it('sérialise forwardedFrom et un event_poll incomplet avec fallbacks sûrs', () => {
    const view = toMessageView(
      {
        _id: 'm4',
        conversationId: 'conv_1',
        senderId: 'u2',
        type: 'event_poll',
        poll: {
          pollType: 'event_poll',
          question: 'On réserve ?',
          options: [{ id: 'yes', text: 'Oui' }],
          event: { id: 'e1', name: null, date: null, price: null, currency: null, image: null },
        },
        forwardedFrom: { senderName: null, convName: null },
        createdAt: '2026-08-20T10:00:00.000Z',
      },
      {
        callerId: 'u1',
        conversation: {
          _id: 'conv_1',
          type: 'group',
          participantIds: ['u1', 'u2'],
          createdAt: '2026-08-20T09:00:00.000Z',
        },
        readReceiptsAllowed: new Map(),
      }
    )

    expect(view.poll).toEqual({
      pollType: 'event_poll',
      question: 'On réserve ?',
      options: [{ id: 'yes', text: 'Oui', voterIds: [] }],
      event: { id: 'e1', name: '', date: '', price: 0, currency: 'EUR', image: null },
    })
    expect(view.forwardedFrom).toEqual({ senderName: '', convName: '' })
    expect(view.readStatus).toBeNull()
  })
})
