import { beforeEach, describe, expect, it, vi } from 'vitest'
import Conversation from '../../models/Conversation'
import Message from '../../models/Message'
import User from '../../models/User'
import { deliverMessageForConversation } from '../messagingDeliveryService'

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

vi.mock('../../models/User', () => ({
  default: {
    find: vi.fn(),
  },
}))

describe('messagingDeliveryService', () => {
  const caller = { id: 'u1' }
  const conversation = {
    _id: 'conv-1',
    participantIds: ['u1', 'u2', 'u3'],
    toObject: vi.fn().mockReturnValue({ _id: 'conv-1', type: 'group', participantIds: ['u1', 'u2', 'u3'] }),
  } as never

  const upsertMessageNotification = vi.fn().mockResolvedValue(undefined)
  const notifyUserById = vi.fn().mockResolvedValue(undefined)
  const newMessageDigestEmail = vi.fn().mockReturnValue({ subject: 'email' })
  const sendPushToUser = vi.fn().mockResolvedValue(undefined)
  const toMessageView = vi.fn((message: { _id: string; content: string }) => ({ id: message._id, content: message.content }))

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persiste le message, met à jour la conversation et notifie les destinataires', async () => {
    vi.mocked(Message.create).mockResolvedValue({
      createdAt: new Date('2026-08-20T21:00:00.000Z'),
      toObject: vi.fn().mockReturnValue({ _id: 'm1', content: 'Salut', senderId: 'u1', conversationId: 'conv-1', type: 'text', createdAt: '2026-08-20T21:00:00.000Z' }),
    } as never)
    vi.mocked(User.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: 'u2', lastSeenAt: null }, { _id: 'u3', lastSeenAt: new Date('2026-08-20T20:00:00.000Z') }]),
      }),
    } as never)

    const result = await deliverMessageForConversation(
      caller,
      conversation,
      { type: 'text', content: 'Salut', replyToMessageId: null, senderName: 'Alice A' },
      { site: 'https://liveinblack.com' },
      { upsertMessageNotification, notifyUserById, newMessageDigestEmail, sendPushToUser, toMessageView },
    )

    expect(result.ok).toBe(true)
    expect(Message.create).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      senderId: 'u1',
      senderName: 'Alice A',
      type: 'text',
      content: 'Salut',
      replyToMessageId: null,
    })
    expect(Conversation.updateOne).toHaveBeenCalledWith(
      { _id: 'conv-1' },
      { $set: { lastMessage: 'Salut', lastMessageAt: expect.any(Date), lastSenderId: 'u1' } },
    )
    expect(upsertMessageNotification).toHaveBeenCalledTimes(2)
    expect(notifyUserById).toHaveBeenCalledTimes(2)
    expect(sendPushToUser).toHaveBeenCalledTimes(2)
  })

  it('respecte deferSideEffects pour les notifications offline', async () => {
    vi.mocked(Message.create).mockResolvedValue({
      createdAt: new Date('2026-08-20T21:00:00.000Z'),
      toObject: vi.fn().mockReturnValue({ _id: 'm1', content: 'Salut', senderId: 'u1', conversationId: 'conv-1', type: 'text', createdAt: '2026-08-20T21:00:00.000Z' }),
    } as never)
    vi.mocked(User.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: 'u2', lastSeenAt: null }]),
      }),
    } as never)
    const deferSideEffects = vi.fn(async (work: () => Promise<void>) => {
      await work()
    })

    await deliverMessageForConversation(
      caller,
      conversation,
      { type: 'text', content: 'Salut', replyToMessageId: null, senderName: 'Alice A' },
      { site: 'https://liveinblack.com', deferSideEffects },
      { upsertMessageNotification, notifyUserById, newMessageDigestEmail, sendPushToUser, toMessageView },
    )

    expect(deferSideEffects).toHaveBeenCalledTimes(1)
  })
})
