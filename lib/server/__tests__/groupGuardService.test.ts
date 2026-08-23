import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGroupAsAdminForCaller, loadGroupConversationForCaller } from '../messaging/groupGuardService'

describe('groupGuardService', () => {
  const loadParticipantConversation = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuse une conversation non trouvée ou non participante telle quelle', async () => {
    loadParticipantConversation.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: 'conversation_not_found',
    })

    await expect(
      loadGroupConversationForCaller('u1', 'conv-404', { loadParticipantConversation }),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'conversation_not_found',
    })
  })

  it('refuse une conversation directe avec le même 404 générique', async () => {
    loadParticipantConversation.mockResolvedValueOnce({
      ok: true,
      conversation: {
        type: 'direct',
        participantIds: ['u1', 'u2'],
      },
    })

    await expect(
      loadGroupConversationForCaller('u1', 'conv-1', { loadParticipantConversation }),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'conversation_not_found',
    })
  })

  it('retourne la conversation de groupe et ses membres quand la garde passe', async () => {
    const conversation = {
      type: 'group',
      members: [
        { userId: 'u1', name: 'Alice', role: 'admin' },
        { userId: 'u2', name: 'Bob', role: 'member' },
      ],
    }
    loadParticipantConversation.mockResolvedValueOnce({
      ok: true,
      conversation,
    })

    const result = await loadGroupConversationForCaller('u1', 'conv-1', { loadParticipantConversation })

    expect(result).toEqual({
      ok: true,
      conversation,
      members: conversation.members,
    })
  })

  it('refuse un membre non admin sur la garde admin', async () => {
    loadParticipantConversation.mockResolvedValueOnce({
      ok: true,
      conversation: {
        type: 'group',
        members: [
          { userId: 'u1', name: 'Alice', role: 'member' },
          { userId: 'u2', name: 'Bob', role: 'admin' },
        ],
      },
    })

    await expect(
      loadGroupAsAdminForCaller({ id: 'u1' }, 'conv-1', { loadParticipantConversation }),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'admin_only',
    })
  })

  it('autorise un admin et renvoie la garde de groupe intacte', async () => {
    const conversation = {
      type: 'group',
      members: [
        { userId: 'u1', name: 'Alice', role: 'admin' },
        { userId: 'u2', name: 'Bob', role: 'member' },
      ],
    }
    loadParticipantConversation.mockResolvedValueOnce({
      ok: true,
      conversation,
    })

    const result = await loadGroupAsAdminForCaller({ id: 'u1' }, 'conv-1', { loadParticipantConversation })

    expect(result).toEqual({
      ok: true,
      conversation,
      members: conversation.members,
    })
  })
})
