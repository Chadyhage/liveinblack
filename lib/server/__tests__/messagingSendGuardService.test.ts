import { beforeEach, describe, expect, it, vi } from 'vitest'
import User from '@/lib/models/User'
import { assertConversationSendAllowed } from '../messaging/messagingSendGuardService'

vi.mock('../../models/User', () => ({
  default: {
    find: vi.fn(),
  },
}))

describe('messagingSendGuardService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuse un membre mute dans une conversation de groupe', async () => {
    await expect(
      assertConversationSendAllowed(
        {
          type: 'group',
          participantIds: ['u1', 'u2'],
          mutedUserIds: ['u2'],
        },
        'u2',
      ),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'muted',
    })
  })

  it('refuse un blocage direct dans les deux sens', async () => {
    vi.mocked(User.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: 'u1', blockedUserIds: [] },
          { _id: 'u2', blockedUserIds: ['u1'] },
        ]),
      }),
    } as never)

    await expect(
      assertConversationSendAllowed(
        {
          type: 'direct',
          participantIds: ['u1', 'u2'],
        },
        'u1',
      ),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'blocked',
    })
  })

  it('autorise quand aucune règle de blocage ou sourdine ne s’applique', async () => {
    vi.mocked(User.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: 'u1', blockedUserIds: [] },
          { _id: 'u2', blockedUserIds: [] },
        ]),
      }),
    } as never)

    await expect(
      assertConversationSendAllowed(
        {
          type: 'direct',
          participantIds: ['u1', 'u2'],
        },
        'u1',
      ),
    ).resolves.toEqual({ ok: true })
  })
})
