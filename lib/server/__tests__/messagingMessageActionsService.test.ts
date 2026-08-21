import { beforeEach, describe, expect, it, vi } from 'vitest'
import Message from '../../models/Message'
import {
  deleteMessageForCaller,
  deleteMessageForEveryone,
  starMessageForCaller,
  unstarMessageForCaller,
} from '../messagingMessageActionsService'

vi.mock('../../models/Message', () => ({
  default: {
    updateOne: vi.fn(),
  },
}))

describe('messagingMessageActionsService', () => {
  const caller = { id: 'u1' }
  const loadParticipantMessage = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuse un messageId vide', async () => {
    await expect(deleteMessageForCaller(caller, { messageId: '   ' }, loadParticipantMessage)).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_input',
    })
  })

  it('supprime pour moi avec le guard participant', async () => {
    loadParticipantMessage.mockResolvedValueOnce({ ok: true, message: { _id: 'm1' }, conversation: {} })

    await expect(deleteMessageForCaller(caller, { messageId: 'm1' }, loadParticipantMessage)).resolves.toEqual({ ok: true })
    expect(Message.updateOne).toHaveBeenCalledWith({ _id: 'm1' }, { $addToSet: { deletedForUserIds: 'u1' } })
  })

  it('refuse supprimer pour tous à un non propriétaire', async () => {
    loadParticipantMessage.mockResolvedValueOnce({ ok: true, message: { _id: 'm1', senderId: 'u2' }, conversation: {} })

    await expect(deleteMessageForEveryone(caller, { messageId: 'm1' }, loadParticipantMessage)).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'not_message_owner',
    })
  })

  it('étoile et retire une étoile sur un message', async () => {
    loadParticipantMessage
      .mockResolvedValueOnce({ ok: true, message: { _id: 'm1' }, conversation: {} })
      .mockResolvedValueOnce({ ok: true, message: { _id: 'm1' }, conversation: {} })

    await expect(starMessageForCaller(caller, { messageId: 'm1' }, loadParticipantMessage)).resolves.toEqual({ ok: true, starred: true })
    await expect(unstarMessageForCaller(caller, { messageId: 'm1' }, loadParticipantMessage)).resolves.toEqual({ ok: true, starred: false })

    expect(Message.updateOne).toHaveBeenNthCalledWith(1, { _id: 'm1' }, { $addToSet: { starredByUserIds: 'u1' } })
    expect(Message.updateOne).toHaveBeenNthCalledWith(2, { _id: 'm1' }, { $pull: { starredByUserIds: 'u1' } })
  })
})
