import { beforeEach, describe, expect, it, vi } from 'vitest'
import Message from '@/lib/models/Message'
import { appendGroupSystemMessage } from '../messaging/groupSystemMessageService'

vi.mock('../../models/Message', () => ({
  default: {
    create: vi.fn(),
  },
}))

describe('groupSystemMessageService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ajoute un message système simple et met à jour le last message en mémoire', async () => {
    const createdAt = new Date('2026-08-20T22:00:00.000Z')
    vi.mocked(Message.create).mockResolvedValueOnce({
      createdAt,
    } as never)

    const conversation = {
      _id: 'conv-1',
      lastMessage: '',
      lastMessageAt: null,
      lastSenderId: null,
    } as never

    await appendGroupSystemMessage(conversation, {
      senderId: 'u1',
      senderName: 'Alice A',
      content: 'Alice A a créé le groupe',
    })

    expect(Message.create).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      senderId: 'u1',
      senderName: 'Alice A',
      type: 'system',
      content: 'Alice A a créé le groupe',
    })
    expect(conversation.lastMessage).toBe('Alice A a créé le groupe')
    expect(conversation.lastMessageAt).toBe(createdAt)
    expect(conversation.lastSenderId).toBe('u1')
  })

  it('utilise la session Mongoose quand elle est fournie', async () => {
    const createdAt = new Date('2026-08-20T22:05:00.000Z')
    vi.mocked(Message.create).mockResolvedValueOnce([
      { createdAt },
    ] as never)

    const conversation = {
      _id: 'conv-2',
      lastMessage: '',
      lastMessageAt: null,
      lastSenderId: null,
    } as never
    const session = { id: 'session-1' } as never

    await appendGroupSystemMessage(
      conversation,
      {
        senderId: 'u2',
        senderName: 'Bob B',
        content: 'Bob B a quitté le groupe',
      },
      { session },
    )

    expect(Message.create).toHaveBeenCalledWith(
      [
        {
          conversationId: 'conv-2',
          senderId: 'u2',
          senderName: 'Bob B',
          type: 'system',
          content: 'Bob B a quitté le groupe',
        },
      ],
      { session },
    )
    expect(conversation.lastMessage).toBe('Bob B a quitté le groupe')
    expect(conversation.lastMessageAt).toBe(createdAt)
    expect(conversation.lastSenderId).toBe('u2')
  })
})
