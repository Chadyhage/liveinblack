import { beforeEach, describe, expect, it, vi } from 'vitest'
import Report from '@/lib/models/Report'
import User from '@/lib/models/User'
import { reportUserForCaller } from '../messaging/messagingReportService'

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
}))

vi.mock('../../models/Report', () => ({
  default: {
    create: vi.fn(),
  },
}))

describe('messagingReportService', () => {
  const callerId = '507f1f77bcf86cd799439011'
  const targetId = '507f1f77bcf86cd799439012'
  const missingId = '507f1f77bcf86cd799439099'
  const notifyUserById = vi.fn().mockResolvedValue(undefined)
  const notifyAllAgents = vi.fn().mockResolvedValue(undefined)
  const reportReceivedAgainstAccountEmail = vi.fn().mockReturnValue({ subject: 'target' })
  const newReportToReviewEmail = vi.fn().mockReturnValue({ subject: 'agents' })
  const deps = {
    normalizeObjectId: (value: string) => value.trim().toLowerCase(),
    notifyUserById,
    notifyAllAgents,
    reportReceivedAgainstAccountEmail,
    newReportToReviewEmail,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('crée le signalement avec des noms résolus depuis les vrais comptes', async () => {
    vi.mocked(User.findById)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ firstName: 'Bob', lastName: 'B', email: 'bob@test.com' }) } as never)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ firstName: 'Alice', lastName: 'A', email: 'alice@test.com' }) } as never)

    const result = await reportUserForCaller(
      { id: callerId },
      { targetUserId: targetId, reason: 'Spam' },
      'https://liveinblack.com',
      deps,
    )

    expect(result).toEqual({ ok: true })
    expect(Report.create).toHaveBeenCalledWith({
      fromId: 'u1',
      fromId: callerId,
      fromName: 'Alice A',
      targetId,
      targetName: 'Bob B',
      reason: 'Spam',
    })
    expect(notifyUserById).toHaveBeenCalledTimes(1)
    expect(notifyAllAgents).toHaveBeenCalledTimes(1)
  })

  it('refuse une cible inexistante', async () => {
    vi.mocked(User.findById).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(null) } as never)

    await expect(
      reportUserForCaller({ id: callerId }, { targetUserId: missingId, reason: 'Spam' }, 'https://liveinblack.com', deps),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'user_not_found',
    })
  })

  it('refuse de se signaler soi-même', async () => {
    vi.mocked(User.findById).mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ firstName: 'Alice', lastName: 'A', email: 'alice@test.com' }) } as never)

    await expect(
      reportUserForCaller({ id: callerId }, { targetUserId: callerId, reason: 'Spam' }, 'https://liveinblack.com', deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'cannot_report_self',
    })
  })

  it('rejette une raison vide avant toute écriture', async () => {
    await expect(
      reportUserForCaller({ id: callerId }, { targetUserId: targetId, reason: '   ' }, 'https://liveinblack.com', deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'reason_required',
    })

    expect(Report.create).not.toHaveBeenCalled()
  })
})
