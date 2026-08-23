import { beforeEach, describe, expect, it, vi } from 'vitest'
import User from '@/lib/models/User'
import { resolveDirectMemberNames, resolveReadReceiptsAllowed } from '../messaging/messagingParticipantLookupUtils'

vi.mock('../../models/User', () => ({
  default: {
    find: vi.fn(),
  },
}))

describe('messagingParticipantLookupUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renvoie une map vide quand aucun participant n’est fourni pour les accusés', async () => {
    await expect(resolveReadReceiptsAllowed([])).resolves.toEqual(new Map())
    expect(User.find).not.toHaveBeenCalled()
  })

  it('résout les préférences d’accusés de lecture par participant', async () => {
    const lean = vi.fn().mockResolvedValue([
      { _id: 'u1', privacy: { readReceipts: true } },
      { _id: 'u2', privacy: { readReceipts: false } },
      { _id: 'u3', privacy: {} },
    ])
    const select = vi.fn(() => ({ lean }))
    vi.mocked(User.find).mockReturnValue({ select } as never)

    await expect(resolveReadReceiptsAllowed(['u1', 'u2', 'u3'])).resolves.toEqual(new Map([
      ['u1', true],
      ['u2', false],
      ['u3', true],
    ]))
    expect(User.find).toHaveBeenCalledWith({ _id: { $in: ['u1', 'u2', 'u3'] } })
    expect(select).toHaveBeenCalledWith('privacy.readReceipts')
  })

  it('résout les noms affichés des participants directs', async () => {
    const lean = vi.fn().mockResolvedValue([
      { _id: 'u1', firstName: 'Alice', lastName: 'Martin', email: 'alice@example.com' },
      { _id: 'u2', firstName: '', lastName: '', email: 'bob@example.com' },
    ])
    vi.mocked(User.find).mockReturnValue({ lean } as never)

    await expect(resolveDirectMemberNames(['u1', 'u2'])).resolves.toEqual(new Map([
      ['u1', 'Alice Martin'],
      ['u2', 'bob@example.com'],
    ]))
    expect(User.find).toHaveBeenCalledWith({ _id: { $in: ['u1', 'u2'] } })
  })
})
