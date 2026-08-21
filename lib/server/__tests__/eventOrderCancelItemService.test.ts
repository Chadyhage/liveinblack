import { beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import EventOrder from '../../models/EventOrder'
import { cancelEventOrderItem, type CancelOrderItemDependencies } from '../eventOrderCancelItemService'

vi.mock('../../models/EventOrder', () => ({
  default: {
    findOne: vi.fn(),
  },
}))

describe('eventOrderCancelItemService', () => {
  const caller = { id: 'u1' }

  let deps: CancelOrderItemDependencies
  let session: {
    withTransaction: ReturnType<typeof vi.fn>
    endSession: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    session = {
      withTransaction: vi.fn(async (work: () => Promise<unknown>) => work()),
      endSession: vi.fn().mockResolvedValue(undefined),
    }
    deps = {
      loadEventContext: vi.fn().mockResolvedValue({
        ok: true,
        ctx: { rank: 3, role: 'manager', event: {} },
      }),
      resolveCallerName: vi.fn().mockResolvedValue('Alice A'),
      appendLog: vi.fn().mockResolvedValue(undefined),
      toItemView: vi.fn((item) => ({ id: item.id, status: item.status, cancelledBy: item.cancelledBy }) as never),
      startSession: vi.fn().mockResolvedValue(session as unknown as mongoose.ClientSession),
    }
    vi.clearAllMocks()
  })

  it('refuse un appelant non manager/propriétaire', async () => {
    vi.mocked(deps.loadEventContext).mockResolvedValueOnce({
      ok: true,
      ctx: { rank: 2, role: 'serveur', event: {} },
    })

    await expect(
      cancelEventOrderItem(caller, { eventId: 'event-1', itemId: 'item-1', reason: 'test' }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'cancel_manager_only',
    })
  })

  it('exige un motif non vide', async () => {
    await expect(
      cancelEventOrderItem(caller, { eventId: 'event-1', itemId: 'item-1', reason: '   ' }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'reason_required',
    })
  })

  it('retourne noop pour une ligne déjà payée ou déjà annulée', async () => {
    vi.mocked(EventOrder.findOne).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue({
        items: [{ id: 'item-1', paidAt: new Date(), status: 'served' }],
      }),
    } as never)

    await expect(
      cancelEventOrderItem(caller, { eventId: 'event-1', itemId: 'item-1', reason: 'test' }, deps),
    ).resolves.toEqual({
      ok: true,
      noop: true,
    })
  })

  it('annule la ligne et écrit le log', async () => {
    const item = { id: 'item-1', paidAt: null, status: 'sent', ticketId: 'T1', name: 'Coca' }
    const save = vi.fn().mockResolvedValue(undefined)
    vi.mocked(EventOrder.findOne).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue({
        items: [item],
        save,
      }),
    } as never)

    const result = await cancelEventOrderItem(
      caller,
      { eventId: 'event-1', itemId: 'item-1', reason: 'erreur de saisie' },
      deps,
    )

    expect(result.ok).toBe(true)
    if (!result.ok || result.noop) return
    expect(item.status).toBe('cancelled')
    expect(item.cancelledBy).toBe('u1')
    expect(deps.appendLog).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        action: 'cancel',
        ticketId: 'T1',
        itemName: 'Coca',
        note: 'erreur de saisie',
      }),
      session as unknown as mongoose.ClientSession,
    )
  })
})
