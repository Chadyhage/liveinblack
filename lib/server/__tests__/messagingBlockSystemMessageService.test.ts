import { beforeEach, describe, expect, it, vi } from 'vitest'
import Conversation from '@/lib/models/Conversation'
import Message from '@/lib/models/Message'
import { postBlockSystemMessage } from '../messaging/messagingBlockSystemMessageService'

vi.mock('../../models/Conversation', () => ({
  default: {
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}))

vi.mock('../../models/Message', () => ({
  default: {
    create: vi.fn(),
  },
}))

describe('messagingBlockSystemMessageService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ne fait rien s’il n’existe aucune conversation directe entre les deux comptes', async () => {
    vi.mocked(Conversation.findOne).mockResolvedValueOnce(null as never)

    await postBlockSystemMessage('u1', 'u2', 'block', vi.fn())

    expect(Message.create).not.toHaveBeenCalled()
    expect(Conversation.updateOne).not.toHaveBeenCalled()
  })

  it('écrit un message système puis met à jour le dernier aperçu de conversation', async () => {
    vi.mocked(Conversation.findOne).mockResolvedValueOnce({ _id: 'c1' } as never)
    const resolveDisplayName = vi.fn()
      .mockResolvedValueOnce('Alice A')
      .mockResolvedValueOnce('Bob B')
    vi.mocked(Message.create).mockResolvedValueOnce({ createdAt: new Date('2026-08-20T10:00:00.000Z') } as never)

    await postBlockSystemMessage('u1', 'u2', 'block', resolveDisplayName)

    expect(Message.create).toHaveBeenCalledWith({
      conversationId: 'c1',
      senderId: 'u1',
      senderName: 'Système',
      type: 'system',
      content: 'SYS::{"kind":"block","by":"u1","byName":"Alice A","target":"u2","targetName":"Bob B"}',
    })
    expect(Conversation.updateOne).toHaveBeenCalledWith(
      { _id: 'c1' },
      {
        $set: {
          lastMessage: 'Contact bloqué',
          lastMessageAt: new Date('2026-08-20T10:00:00.000Z'),
          lastSenderId: 'u1',
        },
      },
    )
  })
})
