import { beforeEach, describe, expect, it, vi } from 'vitest'
import Conversation from '@/lib/models/Conversation'
import { markConversationReadForCaller } from '../messaging/messagingReadService'

vi.mock('../../models/Conversation', () => ({
  default: {
    updateOne: vi.fn(),
  },
}))

describe('messagingReadService', () => {
  const caller = { id: 'u1' }
  const loadParticipantConversation = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuse un conversationId vide', async () => {
    await expect(
      markConversationReadForCaller(caller, { conversationId: '   ' }, loadParticipantConversation),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_input',
    })
  })

  it('propage le guard si la conversation est inaccessible', async () => {
    loadParticipantConversation.mockResolvedValueOnce({ ok: false, status: 404, error: 'conversation_not_found' })

    await expect(
      markConversationReadForCaller(caller, { conversationId: 'c1' }, loadParticipantConversation),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'conversation_not_found',
    })
  })

  it('met à jour lastReadAt pour l’appelant', async () => {
    loadParticipantConversation.mockResolvedValueOnce({ ok: true, conversation: { _id: 'c1' } })

    await expect(
      markConversationReadForCaller(caller, { conversationId: 'c1' }, loadParticipantConversation),
    ).resolves.toEqual({ ok: true })

    expect(Conversation.updateOne).toHaveBeenCalledWith(
      { _id: 'c1' },
      { $set: { 'lastReadAt.u1': expect.any(Date) } },
    )
  })
})
