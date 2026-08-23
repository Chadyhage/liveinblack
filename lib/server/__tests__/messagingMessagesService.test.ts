import { beforeEach, describe, expect, it, vi } from 'vitest'
import Message from '@/lib/models/Message'
import { listMessagesForCaller } from '../messaging/messagingMessagesService'

vi.mock('../../models/Message', () => ({
  default: {
    find: vi.fn(),
  },
}))

describe('messagingMessagesService', () => {
  const caller = { id: 'u1' }
  const loadParticipantConversation = vi.fn()
  const toMessageView = vi.fn((message: { _id: string; content: string }) => ({
    id: message._id,
    content: message.content,
  }))
  const resolveReadReceiptsAllowed = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuse un conversationId vide', async () => {
    await expect(
      listMessagesForCaller(caller, { conversationId: '   ' }, {
        loadParticipantConversation,
        toMessageView,
        resolveReadReceiptsAllowed,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_input',
    })
  })

  it('refuse un curseur invalide', async () => {
    loadParticipantConversation.mockResolvedValueOnce({
      ok: true,
      conversation: { participantIds: ['u1', 'u2'] },
    })

    await expect(
      listMessagesForCaller(caller, { conversationId: 'conv-1', before: 'oops' }, {
        loadParticipantConversation,
        toMessageView,
        resolveReadReceiptsAllowed,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_cursor',
    })
  })

  it('pagine en ordre chronologique final et calcule hasMore', async () => {
    loadParticipantConversation.mockResolvedValueOnce({
      ok: true,
      conversation: { participantIds: ['u1', 'u2'] },
    })
    resolveReadReceiptsAllowed.mockResolvedValueOnce(new Map([['u1', true], ['u2', true]]))
    const leanMock = vi.fn().mockResolvedValue([
      { _id: 'm3', content: 'trois' },
      { _id: 'm2', content: 'deux' },
      { _id: 'm1', content: 'un' },
    ])
    const limitMock = vi.fn().mockReturnValue({ lean: leanMock })
    const sortMock = vi.fn().mockReturnValue({ limit: limitMock })
    const selectMock = vi.fn().mockReturnValue({ sort: sortMock })
    vi.mocked(Message.find).mockReturnValue({ select: selectMock } as never)

    const result = await listMessagesForCaller(caller, { conversationId: 'conv-1', limit: 2 }, {
      loadParticipantConversation,
      toMessageView,
      resolveReadReceiptsAllowed,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.hasMore).toBe(true)
    expect(result.messages).toEqual([
      { id: 'm2', content: 'deux' },
      { id: 'm3', content: 'trois' },
    ])
    expect(Message.find).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      deletedForUserIds: { $ne: 'u1' },
    })
    expect(limitMock).toHaveBeenCalledWith(3)
  })

  it('propage le contexte de read receipts au mapper', async () => {
    loadParticipantConversation.mockResolvedValueOnce({
      ok: true,
      conversation: { participantIds: ['u1', 'u2'] },
    })
    const receipts = new Map([['u1', true], ['u2', false]])
    resolveReadReceiptsAllowed.mockResolvedValueOnce(receipts)
    const leanMock = vi.fn().mockResolvedValue([{ _id: 'm1', content: 'un' }])
    const limitMock = vi.fn().mockReturnValue({ lean: leanMock })
    const sortMock = vi.fn().mockReturnValue({ limit: limitMock })
    const selectMock = vi.fn().mockReturnValue({ sort: sortMock })
    vi.mocked(Message.find).mockReturnValue({ select: selectMock } as never)

    const result = await listMessagesForCaller(caller, { conversationId: 'conv-1' }, {
      loadParticipantConversation,
      toMessageView,
      resolveReadReceiptsAllowed,
    })

    expect(result.ok).toBe(true)
    expect(toMessageView).toHaveBeenCalledWith(
      { _id: 'm1', content: 'un' },
      expect.objectContaining({
        callerId: 'u1',
        conversation: { participantIds: ['u1', 'u2'] },
        readReceiptsAllowed: receipts,
      }),
    )
  })
})
