import { beforeEach, describe, expect, it, vi } from 'vitest'
import Conversation from '@/lib/models/Conversation'
import { listConversationTypingUsers, setConversationTypingState } from '../messaging/messagingTypingService'

vi.mock('../../models/Conversation', () => ({
  default: {
    updateOne: vi.fn(),
  },
}))

describe('messagingTypingService', () => {
  const caller = { id: 'u1' }
  const loadParticipantConversation = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuse un conversationId vide', async () => {
    await expect(
      setConversationTypingState(caller, { conversationId: '   ', typing: true }, loadParticipantConversation),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_input',
    })
  })

  it('écrit puis retire le statut de frappe pour l’appelant', async () => {
    loadParticipantConversation.mockResolvedValue({ ok: true, conversation: { _id: 'c1' } })

    await expect(
      setConversationTypingState(caller, { conversationId: 'c1', typing: true }, loadParticipantConversation),
    ).resolves.toEqual({ ok: true })
    await expect(
      setConversationTypingState(caller, { conversationId: 'c1', typing: false }, loadParticipantConversation),
    ).resolves.toEqual({ ok: true })

    expect(Conversation.updateOne).toHaveBeenNthCalledWith(1, { _id: 'c1' }, { $set: { 'typingAt.u1': expect.any(Date) } })
    expect(Conversation.updateOne).toHaveBeenNthCalledWith(2, { _id: 'c1' }, { $unset: { 'typingAt.u1': '' } })
  })

  it('ne renvoie jamais l’appelant dans les utilisateurs en train de taper', async () => {
    loadParticipantConversation.mockResolvedValueOnce({
      ok: true,
      conversation: {
        type: 'direct',
        typingAt: { u1: new Date().toISOString() },
      },
    })

    await expect(
      listConversationTypingUsers(caller, { conversationId: 'c1' }, loadParticipantConversation, vi.fn()),
    ).resolves.toEqual({
      ok: true,
      users: [],
    })
  })

  it('résout les noms en direct et groupe pour les utilisateurs actifs', async () => {
    const resolveDirectMemberNames = vi.fn().mockResolvedValue(new Map([['u2', 'Bob B']]))
    loadParticipantConversation
      .mockResolvedValueOnce({
        ok: true,
        conversation: {
          type: 'direct',
          typingAt: { u2: new Date().toISOString() },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        conversation: {
          type: 'group',
          members: [{ userId: 'u3', name: 'Charly C' }],
          typingAt: { u3: new Date().toISOString() },
        },
      })

    await expect(
      listConversationTypingUsers(caller, { conversationId: 'c1' }, loadParticipantConversation, resolveDirectMemberNames),
    ).resolves.toEqual({
      ok: true,
      users: [{ userId: 'u2', name: 'Bob B' }],
    })
    await expect(
      listConversationTypingUsers(caller, { conversationId: 'c2' }, loadParticipantConversation, resolveDirectMemberNames),
    ).resolves.toEqual({
      ok: true,
      users: [{ userId: 'u3', name: 'Charly C' }],
    })
  })
})
