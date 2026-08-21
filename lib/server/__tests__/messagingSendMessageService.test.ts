import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendMessageForCaller, type SendMessageDependencies } from '../messagingSendMessageService'

describe('messagingSendMessageService', () => {
  const conversation = { _id: 'conv-1', participantIds: ['u1', 'u2'] } as never
  const caller = { id: 'u1' }

  let deps: SendMessageDependencies

  beforeEach(() => {
    deps = {
      loadParticipantConversation: vi.fn().mockResolvedValue({ ok: true, conversation }),
      isSendableType: vi.fn((type: string): type is 'text' => type === 'text'),
      resolveSendMessageContent: vi.fn().mockResolvedValue({ ok: true, content: 'Salut' }),
      validateMessageContentLength: vi.fn().mockReturnValue({ ok: true }),
      assertCanSendInConversation: vi.fn().mockResolvedValue({ ok: true }),
      resolveDisplayName: vi.fn().mockResolvedValue('Alice A'),
      deliverMessageForConversation: vi.fn().mockResolvedValue({ ok: true, message: { id: 'm1', content: 'Salut' } as never }),
    }
  })

  it('refuse un conversationId vide', async () => {
    await expect(
      sendMessageForCaller(caller, { conversationId: '   ', type: 'text', content: 'Salut' }, {}, deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_input',
    })

    expect(deps.loadParticipantConversation).not.toHaveBeenCalled()
  })

  it('propage l’échec du guard conversation', async () => {
    vi.mocked(deps.loadParticipantConversation).mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: 'conversation_not_found',
    })

    await expect(
      sendMessageForCaller(caller, { conversationId: 'conv-404', type: 'text', content: 'Salut' }, {}, deps),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'conversation_not_found',
    })
  })

  it('refuse un type non supporté', async () => {
    vi.mocked(deps.isSendableType).mockReturnValueOnce(false)

    await expect(
      sendMessageForCaller(caller, { conversationId: 'conv-1', type: 'poll', content: 'Salut' }, {}, deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_type',
    })
  })

  it('propage l’échec de résolution du contenu', async () => {
    vi.mocked(deps.resolveSendMessageContent).mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: 'invalid_media_type',
    })

    await expect(
      sendMessageForCaller(caller, { conversationId: 'conv-1', type: 'text', content: 'Salut' }, {}, deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_media_type',
    })
  })

  it('refuse un contenu vide ou trop long après résolution', async () => {
    vi.mocked(deps.validateMessageContentLength).mockReturnValueOnce({
      ok: false,
      error: 'message_too_long',
    })

    await expect(
      sendMessageForCaller(caller, { conversationId: 'conv-1', type: 'text', content: 'Salut' }, {}, deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'message_too_long',
    })
  })

  it('propage le refus d’envoi dans la conversation', async () => {
    vi.mocked(deps.assertCanSendInConversation).mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: 'blocked',
    })

    await expect(
      sendMessageForCaller(caller, { conversationId: 'conv-1', type: 'text', content: 'Salut' }, {}, deps),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'blocked',
    })
  })

  it('livre le message avec replyTo nettoyé et senderName résolu', async () => {
    const result = await sendMessageForCaller(
      caller,
      { conversationId: ' conv-1 ', type: 'text', content: 'Salut', replyToMessageId: ' reply-1 ' },
      { deferSideEffects: vi.fn() },
      deps,
    )

    expect(result).toEqual({ ok: true, message: { id: 'm1', content: 'Salut' } })
    expect(deps.loadParticipantConversation).toHaveBeenCalledWith('conv-1', 'u1')
    expect(deps.resolveSendMessageContent).toHaveBeenCalledWith('u1', conversation, {
      type: 'text',
      content: 'Salut',
      mediaDataUri: undefined,
      catalogItemId: undefined,
      eventId: undefined,
    })
    expect(deps.resolveDisplayName).toHaveBeenCalledWith('u1')
    expect(deps.deliverMessageForConversation).toHaveBeenCalledWith(
      caller,
      conversation,
      {
        type: 'text',
        content: 'Salut',
        replyToMessageId: 'reply-1',
        senderName: 'Alice A',
      },
      { deferSideEffects: expect.any(Function) },
    )
  })
})
