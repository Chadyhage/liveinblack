import { beforeEach, describe, expect, it, vi } from 'vitest'
import Conversation from '../../models/Conversation'
import Message from '../../models/Message'
import {
  clearConversationHistoryForCaller,
  hideConversationForCaller,
  muteConversationForCaller,
  pinConversationForCaller,
  unmuteConversationForCaller,
  unpinConversationForCaller,
} from '../messagingConversationPreferencesService'

vi.mock('../../models/Conversation', () => ({
  default: {
    updateOne: vi.fn(),
  },
}))

vi.mock('../../models/Message', () => ({
  default: {
    updateMany: vi.fn(),
  },
}))

describe('messagingConversationPreferencesService', () => {
  const caller = { id: 'u1' }
  const conversation = { _id: 'c1' }
  const loadParticipantConversation = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuse un conversationId vide avant toute lecture', async () => {
    await expect(pinConversationForCaller(caller, { conversationId: '   ' }, loadParticipantConversation)).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_input',
    })
    expect(loadParticipantConversation).not.toHaveBeenCalled()
  })

  it('propage le guard si la conversation est introuvable ou interdite', async () => {
    loadParticipantConversation.mockResolvedValueOnce({ ok: false, status: 404, error: 'conversation_not_found' })

    await expect(muteConversationForCaller(caller, { conversationId: 'c1' }, loadParticipantConversation)).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'conversation_not_found',
    })
  })

  it('applique les mutations conversationnelles attendues pour pin, unpin, mute, unmute et hide', async () => {
    loadParticipantConversation.mockResolvedValue({ ok: true, conversation })

    await pinConversationForCaller(caller, { conversationId: 'c1' }, loadParticipantConversation)
    await unpinConversationForCaller(caller, { conversationId: 'c1' }, loadParticipantConversation)
    await muteConversationForCaller(caller, { conversationId: 'c1' }, loadParticipantConversation)
    await unmuteConversationForCaller(caller, { conversationId: 'c1' }, loadParticipantConversation)
    await hideConversationForCaller(caller, { conversationId: 'c1' }, loadParticipantConversation)

    expect(Conversation.updateOne).toHaveBeenNthCalledWith(1, { _id: 'c1' }, { $addToSet: { pinnedByUserIds: 'u1' } })
    expect(Conversation.updateOne).toHaveBeenNthCalledWith(2, { _id: 'c1' }, { $pull: { pinnedByUserIds: 'u1' } })
    expect(Conversation.updateOne).toHaveBeenNthCalledWith(3, { _id: 'c1' }, { $addToSet: { mutedConversationByUserIds: 'u1' } })
    expect(Conversation.updateOne).toHaveBeenNthCalledWith(4, { _id: 'c1' }, { $pull: { mutedConversationByUserIds: 'u1' } })
    expect(Conversation.updateOne).toHaveBeenNthCalledWith(5, { _id: 'c1' }, { $addToSet: { hiddenByUserIds: 'u1' } })
  })

  it('vide l’historique pour l’appelant seul', async () => {
    loadParticipantConversation.mockResolvedValueOnce({ ok: true, conversation })

    await expect(
      clearConversationHistoryForCaller(caller, { conversationId: 'c1' }, loadParticipantConversation),
    ).resolves.toEqual({ ok: true })

    expect(Message.updateMany).toHaveBeenCalledWith(
      { conversationId: 'c1', deletedForUserIds: { $ne: 'u1' } },
      { $addToSet: { deletedForUserIds: 'u1' } },
    )
  })
})
