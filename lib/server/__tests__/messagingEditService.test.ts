import { describe, expect, it, vi, beforeEach } from 'vitest'
import { editParticipantTextMessage } from '../messaging/messagingEditService'

describe('messagingEditService', () => {
  const caller = { id: 'u1' }
  const loadParticipantMessage = vi.fn()
  const resolveReadReceiptsAllowed = vi.fn().mockResolvedValue(new Map([
    ['u1', true],
    ['u2', true],
  ]))

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuse un messageId vide', async () => {
    await expect(
      editParticipantTextMessage(caller, { messageId: '   ', content: 'Salut' }, loadParticipantMessage, resolveReadReceiptsAllowed),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_input',
    })
  })

  it('refuse l’édition par un non propriétaire', async () => {
    loadParticipantMessage.mockResolvedValueOnce({
      ok: true,
      message: { senderId: 'u2', type: 'text', deletedForAll: false },
      conversation: {},
    })

    await expect(
      editParticipantTextMessage(caller, { messageId: 'm1', content: 'Salut' }, loadParticipantMessage, resolveReadReceiptsAllowed),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'not_message_owner',
    })
  })

  it('refuse un type non texte', async () => {
    loadParticipantMessage.mockResolvedValueOnce({
      ok: true,
      message: { senderId: 'u1', type: 'image', deletedForAll: false },
      conversation: {},
    })

    await expect(
      editParticipantTextMessage(caller, { messageId: 'm1', content: 'Salut' }, loadParticipantMessage, resolveReadReceiptsAllowed),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_type',
    })
  })

  it('édite un message texte et retourne sa vue hydratée', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const message = {
      senderId: 'u1',
      type: 'text',
      deletedForAll: false,
      content: 'Avant',
      editedAt: null,
      save,
      toObject: vi.fn().mockReturnValue({
        _id: 'm1',
        conversationId: 'c1',
        senderId: 'u1',
        senderName: 'Alice A',
        type: 'text',
        content: 'Après',
        poll: null,
        reactions: {},
        readBy: {},
        deletedForAll: false,
        pinned: false,
        replyToMessageId: null,
        createdAt: new Date('2026-08-20T10:00:00.000Z'),
        editedAt: new Date('2026-08-20T10:05:00.000Z'),
        starredByUserIds: [],
        forwardedFrom: null,
      }),
    }
    const conversation = {
      toObject: vi.fn().mockReturnValue({
        _id: 'c1',
        type: 'direct',
        participantIds: ['u1', 'u2'],
        createdAt: new Date('2026-08-20T09:00:00.000Z'),
      }),
    }
    loadParticipantMessage.mockResolvedValueOnce({ ok: true, message, conversation })

    const result = await editParticipantTextMessage(
      caller,
      { messageId: 'm1', content: '  Après  ' },
      loadParticipantMessage,
      resolveReadReceiptsAllowed,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(message.content).toBe('Après')
    expect(message.editedAt).toBeInstanceOf(Date)
    expect(save).toHaveBeenCalled()
    expect(resolveReadReceiptsAllowed).toHaveBeenCalledWith(['u1', 'u2'])
    expect(result.message.content).toBe('Après')
  })
})
