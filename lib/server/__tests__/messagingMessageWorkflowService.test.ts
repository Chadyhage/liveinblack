import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteMessageForAllWorkflow,
  deleteMessageForMeWorkflow,
  editMessageWorkflow,
  starMessageWorkflow,
  unstarMessageWorkflow,
} from '../messaging/messagingMessageWorkflowService'

vi.mock('../messaging/messagingEditService', () => ({
  editParticipantTextMessage: vi.fn(),
}))

vi.mock('../messaging/messagingMessageActionsService', () => ({
  deleteMessageForCaller: vi.fn(),
  deleteMessageForEveryone: vi.fn(),
  starMessageForCaller: vi.fn(),
  unstarMessageForCaller: vi.fn(),
}))

import { editParticipantTextMessage } from '../messaging/messagingEditService'
import {
  deleteMessageForCaller,
  deleteMessageForEveryone,
  starMessageForCaller,
  unstarMessageForCaller,
} from '../messaging/messagingMessageActionsService'

describe('messagingMessageWorkflowService', () => {
  const caller = { id: 'u1' }
  const loadParticipantMessage = vi.fn()
  const resolveReadReceiptsAllowed = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('délègue l’édition au service dédié', async () => {
    vi.mocked(editParticipantTextMessage).mockResolvedValueOnce({ ok: true, message: { id: 'm1' } } as never)

    const result = await editMessageWorkflow(
      caller,
      { messageId: 'm1', content: 'Salut' },
      { loadParticipantMessage, resolveReadReceiptsAllowed },
    )

    expect(result).toEqual({ ok: true, message: { id: 'm1' } })
    expect(editParticipantTextMessage).toHaveBeenCalledWith(
      caller,
      { messageId: 'm1', content: 'Salut' },
      loadParticipantMessage,
      resolveReadReceiptsAllowed,
    )
  })

  it('délègue les suppressions et favoris au bon service', async () => {
    vi.mocked(deleteMessageForCaller).mockResolvedValueOnce({ ok: true } as never)
    vi.mocked(deleteMessageForEveryone).mockResolvedValueOnce({ ok: true } as never)
    vi.mocked(starMessageForCaller).mockResolvedValueOnce({ ok: true, starred: true } as never)
    vi.mocked(unstarMessageForCaller).mockResolvedValueOnce({ ok: true, starred: false } as never)

    await expect(deleteMessageForMeWorkflow(caller, { messageId: 'm1' }, { loadParticipantMessage })).resolves.toEqual({ ok: true })
    await expect(deleteMessageForAllWorkflow(caller, { messageId: 'm1' }, { loadParticipantMessage })).resolves.toEqual({ ok: true })
    await expect(starMessageWorkflow(caller, { messageId: 'm1' }, { loadParticipantMessage })).resolves.toEqual({ ok: true, starred: true })
    await expect(unstarMessageWorkflow(caller, { messageId: 'm1' }, { loadParticipantMessage })).resolves.toEqual({ ok: true, starred: false })

    expect(deleteMessageForCaller).toHaveBeenCalledWith(caller, { messageId: 'm1' }, loadParticipantMessage)
    expect(deleteMessageForEveryone).toHaveBeenCalledWith(caller, { messageId: 'm1' }, loadParticipantMessage)
    expect(starMessageForCaller).toHaveBeenCalledWith(caller, { messageId: 'm1' }, loadParticipantMessage)
    expect(unstarMessageForCaller).toHaveBeenCalledWith(caller, { messageId: 'm1' }, loadParticipantMessage)
  })
})
