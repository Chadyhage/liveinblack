import { beforeEach, describe, expect, it, vi } from 'vitest'
import Conversation from '../../models/Conversation'
import Message from '../../models/Message'
import { toggleMessageReaction } from '../messagingReactionService'

vi.mock('../../models/Message', () => ({
  default: {
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
}))

vi.mock('../../models/Conversation', () => ({
  default: {
    findById: vi.fn(),
  },
}))

describe('messagingReactionService', () => {
  const deps = {
    validateReactionEmoji: vi.fn(),
    buildReactionTogglePipeline: vi.fn().mockReturnValue([{ $set: {} }]),
    normalizeReactionMap: vi.fn().mockReturnValue({ '👍': ['u1'] }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuse un messageId vide ou un emoji invalide', async () => {
    deps.validateReactionEmoji.mockReturnValueOnce({ ok: true, emoji: '👍' })
    await expect(toggleMessageReaction({ id: 'u1' }, { messageId: '   ', emoji: '👍' }, deps)).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_input',
    })

    deps.validateReactionEmoji.mockReturnValueOnce({ ok: false, error: 'invalid_emoji' })
    await expect(toggleMessageReaction({ id: 'u1' }, { messageId: '507f1f77bcf86cd799439011', emoji: 'x' }, deps)).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_emoji',
    })
  })

  it('retourne message_not_found si le message ou la conversation sont absents', async () => {
    deps.validateReactionEmoji.mockReturnValue({ ok: true, emoji: '👍' })
    vi.mocked(Message.findById).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(null) } as never)

    await expect(toggleMessageReaction({ id: 'u1' }, { messageId: '507f1f77bcf86cd799439011', emoji: '👍' }, deps)).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'message_not_found',
    })
  })

  it('refuse un non participant avec la même 404 générique', async () => {
    deps.validateReactionEmoji.mockReturnValue({ ok: true, emoji: '👍' })
    vi.mocked(Message.findById).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ _id: 'm1', conversationId: 'c1' }) } as never)
    vi.mocked(Conversation.findById).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ participantIds: ['u2'] }) } as never)

    await expect(toggleMessageReaction({ id: 'u1' }, { messageId: '507f1f77bcf86cd799439011', emoji: '👍' }, deps)).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'message_not_found',
    })
  })

  it('toggle une réaction et renvoie la map normalisée', async () => {
    deps.validateReactionEmoji.mockReturnValue({ ok: true, emoji: '👍' })
    vi.mocked(Message.findById)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ _id: 'm1', conversationId: 'c1' }) } as never)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ reactions: { '👍': ['u1'] } }) } as never)
    vi.mocked(Conversation.findById).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ participantIds: ['u1', 'u2'] }) } as never)

    const result = await toggleMessageReaction({ id: 'u1' }, { messageId: '507f1f77bcf86cd799439011', emoji: '👍' }, deps)

    expect(result).toEqual({ ok: true, reactions: { '👍': ['u1'] } })
    expect(Message.updateOne).toHaveBeenCalledWith({ _id: 'm1' }, [{ $set: {} }], { updatePipeline: true })
    expect(deps.buildReactionTogglePipeline).toHaveBeenCalledWith('u1', '👍')
  })
})
