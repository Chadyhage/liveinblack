import { beforeEach, describe, expect, it, vi } from 'vitest'
import Report from '../../models/Report'
import User from '../../models/User'
import { listBlockedSafetyUsers, listSafetyReports } from '../messagingSafetyListsService'

vi.mock('../../models/Report', () => ({
  default: {
    find: vi.fn(),
  },
}))

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
    find: vi.fn(),
  },
}))

describe('messagingSafetyListsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('liste les signalements de l’appelant du plus récent au plus ancien', async () => {
    const lean = vi.fn().mockResolvedValue([
      { _id: 'r2', targetId: 'u3', targetName: 'Charly C', reason: 'Abus', createdAt: '2026-08-20T10:00:00.000Z' },
      { _id: 'r1', targetId: 'u2', targetName: 'Bob B', reason: 'Spam', createdAt: '2026-08-20T09:00:00.000Z' },
    ])
    const sort = vi.fn(() => ({ lean }))
    vi.mocked(Report.find).mockReturnValue({ sort } as never)

    await expect(listSafetyReports({ id: 'u1' })).resolves.toEqual({
      ok: true,
      reports: [
        { id: 'r2', targetId: 'u3', targetName: 'Charly C', reason: 'Abus', createdAt: '2026-08-20T10:00:00.000Z' },
        { id: 'r1', targetId: 'u2', targetName: 'Bob B', reason: 'Spam', createdAt: '2026-08-20T09:00:00.000Z' },
      ],
    })
    expect(Report.find).toHaveBeenCalledWith({ fromId: 'u1' })
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
  })

  it('renvoie une liste vide quand aucun compte n’est bloqué', async () => {
    const lean = vi.fn().mockResolvedValue({ blockedUserIds: [] })
    vi.mocked(User.findById).mockReturnValue({ lean } as never)

    await expect(listBlockedSafetyUsers({ id: 'u1' })).resolves.toEqual({
      ok: true,
      blocked: [],
    })
    expect(User.find).not.toHaveBeenCalled()
  })

  it('résout les comptes bloqués avec nom et email', async () => {
    const meLean = vi.fn().mockResolvedValue({ blockedUserIds: ['u2'] })
    vi.mocked(User.findById).mockReturnValue({ lean: meLean } as never)

    const usersLean = vi.fn().mockResolvedValue([
      { _id: 'u2', firstName: 'Bob', lastName: 'B', email: 'bob@example.com' },
    ])
    vi.mocked(User.find).mockReturnValue({ lean: usersLean } as never)

    await expect(listBlockedSafetyUsers({ id: 'u1' })).resolves.toEqual({
      ok: true,
      blocked: [
        { userId: 'u2', name: 'Bob B', email: 'bob@example.com' },
      ],
    })
    expect(User.find).toHaveBeenCalledWith({ _id: { $in: ['u2'] } })
  })
})
