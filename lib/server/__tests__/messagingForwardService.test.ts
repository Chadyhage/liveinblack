import { describe, expect, it, vi, beforeEach } from 'vitest'
import Conversation from '../../models/Conversation'
import Message from '../../models/Message'
import { forwardMessageForCaller, forwardMessageToConversations, resolveForwardConversationLabel } from '../messagingForwardService'

vi.mock('../../models/Conversation', () => ({
  default: {
    updateOne: vi.fn(),
  },
}))

vi.mock('../../models/Message', () => ({
  default: {
    create: vi.fn(),
  },
}))

describe('messagingForwardService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('résout le libellé d’une conversation source directe ou groupe', async () => {
    const resolveDisplayName = vi.fn().mockResolvedValue('Bob B')
    await expect(
      resolveForwardConversationLabel({ type: 'group', name: 'Mon groupe', participantIds: ['u1', 'u2'] }, 'u1', resolveDisplayName),
    ).resolves.toBe('Mon groupe')
    await expect(
      resolveForwardConversationLabel({ type: 'direct', participantIds: ['u1', 'u2'] }, 'u1', resolveDisplayName),
    ).resolves.toBe('Bob B')
  })

  it('retourne forward_failed si aucune cible n’aboutit', async () => {
    const result = await forwardMessageToConversations(
      { id: 'u1' },
      {
        source: { type: 'text', content: 'Salut', poll: null, senderName: 'Alice A' },
        sourceConversation: { type: 'direct', participantIds: ['u1', 'u2'] },
        targetIds: ['c1'],
      },
      {
        loadParticipantConversation: vi.fn().mockResolvedValue({ ok: false, status: 404, error: 'conversation_not_found' }),
        assertCanSendInConversation: vi.fn(),
        resolveDisplayName: vi.fn().mockResolvedValue('Alice A'),
      },
    )

    expect(result).toEqual({ ok: false, status: 400, error: 'forward_failed' })
  })

  it('rejette un transfert sans messageId', async () => {
    const result = await forwardMessageForCaller(
      { id: 'u1' },
      { messageId: '   ', toConversationIds: ['c1'] },
      {
        loadParticipantMessage: vi.fn(),
        loadParticipantConversation: vi.fn(),
        assertCanSendInConversation: vi.fn(),
        resolveDisplayName: vi.fn(),
      },
    )

    expect(result).toEqual({ ok: false, status: 400, error: 'invalid_input' })
  })

  it('rejette un type de message non transférable', async () => {
    const result = await forwardMessageForCaller(
      { id: 'u1' },
      { messageId: 'm1', toConversationIds: ['c1'] },
      {
        loadParticipantMessage: vi.fn().mockResolvedValue({
          ok: true,
          message: { type: 'system', content: null, poll: null, senderName: 'Alice A' },
          conversation: { type: 'direct', participantIds: ['u1', 'u2'] },
        }),
        loadParticipantConversation: vi.fn(),
        assertCanSendInConversation: vi.fn(),
        resolveDisplayName: vi.fn(),
      },
    )

    expect(result).toEqual({ ok: false, status: 400, error: 'invalid_type' })
  })

  it('prépare puis délègue le transfert pour un message valide', async () => {
    const targetConversation = {
      _id: 'c1',
      toObject: vi.fn().mockReturnValue({ _id: 'c1', type: 'direct', participantIds: ['u1', 'u3'], createdAt: new Date().toISOString() }),
    }
    vi.mocked(Message.create).mockResolvedValue({
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      toObject: vi.fn().mockReturnValue({
        _id: 'm2',
        conversationId: 'c1',
        senderId: 'u1',
        senderName: 'Alice A',
        type: 'text',
        content: 'Salut',
        poll: null,
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        reactions: {},
        readBy: {},
        deletedForAll: false,
        pinned: false,
        replyToMessageId: null,
        editedAt: null,
        starredByUserIds: [],
        forwardedFrom: { senderName: 'Alice A', convName: 'Bob B' },
      }),
    } as never)

    const result = await forwardMessageForCaller(
      { id: 'u1' },
      { messageId: 'm1', toConversationIds: ['c1', 'c1'] },
      {
        loadParticipantMessage: vi.fn().mockResolvedValue({
          ok: true,
          message: { type: 'text', content: 'Salut', poll: null, senderName: 'Alice A' },
          conversation: { type: 'direct', participantIds: ['u1', 'u2'] },
        }),
        loadParticipantConversation: vi.fn().mockResolvedValue({ ok: true, conversation: targetConversation }),
        assertCanSendInConversation: vi.fn().mockResolvedValue({ ok: true }),
        resolveDisplayName: vi.fn().mockResolvedValueOnce('Bob B').mockResolvedValueOnce('Alice A'),
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.messages).toHaveLength(1)
  })

  it('transfère un message vers une cible valide', async () => {
    const targetConversation = {
      _id: 'c1',
      toObject: vi.fn().mockReturnValue({ _id: 'c1', type: 'direct', participantIds: ['u1', 'u3'], createdAt: new Date().toISOString() }),
    }
    vi.mocked(Message.create).mockResolvedValue({
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
      toObject: vi.fn().mockReturnValue({
        _id: 'm1',
        conversationId: 'c1',
        senderId: 'u1',
        senderName: 'Alice A',
        type: 'text',
        content: 'Salut',
        poll: null,
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        reactions: {},
        readBy: {},
        deletedForAll: false,
        pinned: false,
        replyToMessageId: null,
        editedAt: null,
        starredByUserIds: [],
        forwardedFrom: { senderName: 'Alice A', convName: 'Bob B' },
      }),
    } as never)

    const result = await forwardMessageToConversations(
      { id: 'u1' },
      {
        source: { type: 'text', content: 'Salut', poll: null, senderName: 'Alice A' },
        sourceConversation: { type: 'direct', participantIds: ['u1', 'u2'] },
        targetIds: ['c1'],
      },
      {
        loadParticipantConversation: vi.fn().mockResolvedValue({ ok: true, conversation: targetConversation }),
        assertCanSendInConversation: vi.fn().mockResolvedValue({ ok: true }),
        resolveDisplayName: vi.fn().mockResolvedValueOnce('Bob B').mockResolvedValueOnce('Alice A'),
      },
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.messages).toHaveLength(1)
    expect(Conversation.updateOne).toHaveBeenCalledWith(
      { _id: 'c1' },
      { $set: { lastMessage: 'Salut', lastMessageAt: new Date('2026-08-20T10:00:00.000Z'), lastSenderId: 'u1' } },
    )
  })
})
