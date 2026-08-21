import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProviderProfile from '../../models/ProviderProfile'
import User from '../../models/User'
import { resolveConversationContactPhone } from '../messagingContactService'

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
}))

vi.mock('../../models/ProviderProfile', () => ({
  default: {
    findOne: vi.fn(),
  },
}))

describe('messagingContactService', () => {
  const caller = { id: 'u1' }
  const loadParticipantConversation = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuse un conversationId vide', async () => {
    await expect(
      resolveConversationContactPhone(caller, { conversationId: '   ' }, loadParticipantConversation),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_input',
    })
  })

  it('refuse les conversations non directes', async () => {
    loadParticipantConversation.mockResolvedValueOnce({
      ok: true,
      conversation: { type: 'group', participantIds: ['u1', 'u2'] },
    })

    await expect(
      resolveConversationContactPhone(caller, { conversationId: 'c1' }, loadParticipantConversation),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_type',
    })
  })

  it('renvoie le numéro pro du compte quand il existe', async () => {
    loadParticipantConversation.mockResolvedValueOnce({
      ok: true,
      conversation: { type: 'direct', participantIds: ['u1', 'u2'] },
    })
    vi.mocked(User.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ phone: '  +22890000000  ' }) } as never)

    await expect(
      resolveConversationContactPhone(caller, { conversationId: 'c1' }, loadParticipantConversation),
    ).resolves.toEqual({
      ok: true,
      phone: '+22890000000',
    })
  })

  it('retombe sur le numéro prestataire quand le compte n’a pas de phone', async () => {
    loadParticipantConversation.mockResolvedValueOnce({
      ok: true,
      conversation: { type: 'direct', participantIds: ['u1', 'u2'] },
    })
    vi.mocked(User.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ phone: '   ' }) } as never)
    vi.mocked(ProviderProfile.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue({ phone: '  +22891111111 ' }) } as never)

    await expect(
      resolveConversationContactPhone(caller, { conversationId: 'c1' }, loadParticipantConversation),
    ).resolves.toEqual({
      ok: true,
      phone: '+22891111111',
    })
  })

  it('renvoie null si aucun autre participant exploitable n’est trouvé', async () => {
    loadParticipantConversation.mockResolvedValueOnce({
      ok: true,
      conversation: { type: 'direct', participantIds: ['u1'] },
    })

    await expect(
      resolveConversationContactPhone(caller, { conversationId: 'c1' }, loadParticipantConversation),
    ).resolves.toEqual({
      ok: true,
      phone: null,
    })
  })
})
