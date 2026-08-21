import { beforeEach, describe, expect, it, vi } from 'vitest'
import Conversation from '../../models/Conversation'
import Message from '../../models/Message'
import { listStarredMessagesPage } from '../messagingStarredMessagesService'

vi.mock('../../models/Conversation', () => ({
  default: {
    find: vi.fn(),
  },
}))

vi.mock('../../models/Message', () => ({
  default: {
    countDocuments: vi.fn(),
    find: vi.fn(),
  },
}))

vi.mock('../messagingViews', () => ({
  toMessageView: vi.fn((message, ctx) => ({
    id: String(message._id ?? `${message.conversationId}:${message.createdAt}`),
    conversationId: message.conversationId,
    callerId: ctx.callerId,
  })),
}))

describe('messagingStarredMessagesService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renvoie une page vide quand l’appelant n’a aucune conversation', async () => {
    const lean = vi.fn().mockResolvedValue([])
    const select = vi.fn(() => ({ lean }))
    vi.mocked(Conversation.find).mockReturnValue({ select } as never)

    await expect(
      listStarredMessagesPage({ id: 'u1' }, {}, vi.fn()),
    ).resolves.toEqual({
      ok: true,
      messages: [],
      page: 1,
      pageSize: 50,
      total: 0,
      hasMore: false,
    })

    expect(Message.countDocuments).not.toHaveBeenCalled()
  })

  it('liste les messages importants paginés avec leurs métadonnées', async () => {
    const convLean = vi.fn().mockResolvedValue([
      { _id: 'c1', type: 'direct', participantIds: ['u1', 'u2'], lastReadAt: {} },
    ])
    const convSelect = vi.fn(() => ({ lean: convLean }))
    vi.mocked(Conversation.find).mockReturnValue({ select: convSelect } as never)

    vi.mocked(Message.countDocuments).mockResolvedValue(2 as never)

    const docsLean = vi.fn().mockResolvedValue([
      { _id: 'm2', conversationId: 'c1', senderId: 'u2', senderName: 'Bob', type: 'text', content: 'B', reactions: {}, readBy: [], deletedForAll: false, pinned: false, replyToMessageId: null, createdAt: new Date('2026-08-20T10:00:00.000Z'), editedAt: null, starredByUserIds: ['u1'], forwardedFrom: null, poll: null },
      { _id: 'm1', conversationId: 'c1', senderId: 'u2', senderName: 'Bob', type: 'text', content: 'A', reactions: {}, readBy: [], deletedForAll: false, pinned: false, replyToMessageId: null, createdAt: new Date('2026-08-20T09:00:00.000Z'), editedAt: null, starredByUserIds: ['u1'], forwardedFrom: null, poll: null },
    ])
    const limit = vi.fn(() => ({ lean: docsLean }))
    const skip = vi.fn(() => ({ limit }))
    const sort = vi.fn(() => ({ skip }))
    const select = vi.fn(() => ({ sort }))
    vi.mocked(Message.find).mockReturnValue({ select } as never)

    const resolveReadReceiptsAllowed = vi.fn().mockResolvedValue(new Map([
      ['u1', true],
      ['u2', true],
    ]))

    const result = await listStarredMessagesPage({ id: 'u1' }, { page: 1, pageSize: 10 }, resolveReadReceiptsAllowed)

    expect(result.ok).toBe(true)
    expect(result.total).toBe(2)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(10)
    expect(result.hasMore).toBe(false)
    expect(result.messages).toHaveLength(2)
    expect(resolveReadReceiptsAllowed).toHaveBeenCalledWith(['u1', 'u2'])
  })
})
