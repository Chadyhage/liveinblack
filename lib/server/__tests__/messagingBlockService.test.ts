import { beforeEach, describe, expect, it, vi } from 'vitest'
import User from '../../models/User'
import { blockUserForCaller, unblockUserForCaller } from '../messagingBlockService'

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
    updateOne: vi.fn(),
  },
}))

describe('messagingBlockService', () => {
  const callerId = '507f1f77bcf86cd799439011'
  const targetId = '507f1f77bcf86cd799439012'
  const postBlockSystemMessage = vi.fn().mockResolvedValue(undefined)
  const resolveDisplayName = vi.fn().mockResolvedValue('Alice A')
  const normalizeObjectId = (value: string) => value.trim().toLowerCase()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('bloque un compte existant et poste le message système', async () => {
    vi.mocked(User.findById).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ _id: targetId }) } as never)

    const result = await blockUserForCaller(
      { id: callerId },
      { targetUserId: targetId },
      { normalizeObjectId, postBlockSystemMessage, resolveDisplayName },
    )

    expect(result).toEqual({ ok: true })
    expect(User.updateOne).toHaveBeenCalledWith({ _id: callerId }, { $addToSet: { blockedUserIds: targetId } })
    expect(postBlockSystemMessage).toHaveBeenCalledWith(callerId, targetId, 'block', resolveDisplayName)
  })

  it('refuse de bloquer soi-même', async () => {
    vi.mocked(User.findById).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ _id: callerId }) } as never)

    await expect(
      blockUserForCaller(
        { id: callerId },
        { targetUserId: callerId },
        { normalizeObjectId, postBlockSystemMessage, resolveDisplayName },
      ),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'cannot_block_self',
    })
  })

  it('rejette une cible invalide au blocage', async () => {
    await expect(
      blockUserForCaller(
        { id: callerId },
        { targetUserId: 'not-an-id' },
        { normalizeObjectId, postBlockSystemMessage, resolveDisplayName },
      ),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'user_not_found',
    })
  })

  it('débloque puis poste le message système correspondant', async () => {
    const result = await unblockUserForCaller(
      { id: callerId },
      { targetUserId: targetId },
      { normalizeObjectId, postBlockSystemMessage, resolveDisplayName },
    )

    expect(result).toEqual({ ok: true })
    expect(User.updateOne).toHaveBeenCalledWith({ _id: callerId }, { $pull: { blockedUserIds: targetId } })
    expect(postBlockSystemMessage).toHaveBeenCalledWith(callerId, targetId, 'unblock', resolveDisplayName)
  })
})
