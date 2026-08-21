import { beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import EventOrder from '../../models/EventOrder'
import { removeEventOrderItem, type RemoveOrderItemDependencies } from '../eventOrderRemoveItemService'

vi.mock('../../models/EventOrder', () => ({
  default: {
    findOne: vi.fn(),
  },
}))

describe('eventOrderRemoveItemService', () => {
  const caller = { id: 'u1' }

  let deps: RemoveOrderItemDependencies
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
        ctx: { rank: 0, role: 'client', event: {} },
      }),
      resolveCallerName: vi.fn().mockResolvedValue('Alice A'),
      appendLog: vi.fn().mockResolvedValue(undefined),
      startSession: vi.fn().mockResolvedValue(session as unknown as mongoose.ClientSession),
    }
    vi.clearAllMocks()
  })

  it('refuse une ligne introuvable', async () => {
    vi.mocked(EventOrder.findOne).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue(null),
    } as never)

    await expect(
      removeEventOrderItem(caller, { eventId: 'event-1', itemId: 'item-1' }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'item_not_found',
    })
  })

  it('refuse rang 0 sur une ligne qui ne lui appartient pas', async () => {
    vi.mocked(EventOrder.findOne).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue({
        items: [{ id: 'item-1', addedBy: 'u2', servedAt: null, paidAt: null, status: 'sent' }],
      }),
    } as never)

    await expect(
      removeEventOrderItem(caller, { eventId: 'event-1', itemId: 'item-1' }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'not_your_item',
    })
  })

  it('refuse rang 0 sur une ligne verrouillée', async () => {
    vi.mocked(EventOrder.findOne).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue({
        items: [{ id: 'item-1', addedBy: 'u1', servedAt: new Date(), paidAt: null, status: 'served' }],
      }),
    } as never)

    await expect(
      removeEventOrderItem(caller, { eventId: 'event-1', itemId: 'item-1' }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 409,
      error: 'locked',
    })
  })

  it('retourne noop pour le staff sur une ligne verrouillée', async () => {
    vi.mocked(deps.loadEventContext).mockResolvedValueOnce({
      ok: true,
      ctx: { rank: 2, role: 'serveur', event: {} },
    })
    vi.mocked(EventOrder.findOne).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue({
        items: [{ id: 'item-1', addedBy: 'u1', servedAt: new Date(), paidAt: null, status: 'served' }],
      }),
    } as never)

    await expect(
      removeEventOrderItem(caller, { eventId: 'event-1', itemId: 'item-1' }, deps),
    ).resolves.toEqual({
      ok: true,
      noop: true,
    })
  })

  it('supprime la ligne et journalise le snapshot', async () => {
    const deleteOne = vi.fn()
    const item = {
      id: 'item-1',
      addedBy: 'u1',
      servedAt: null,
      paidAt: null,
      status: 'sent',
      ticketId: 'T1',
      name: 'Coca',
      quantity: 2,
      deleteOne,
    }
    const save = vi.fn().mockResolvedValue(undefined)
    vi.mocked(EventOrder.findOne).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue({
        items: [item],
        save,
      }),
    } as never)

    const result = await removeEventOrderItem(caller, { eventId: 'event-1', itemId: 'item-1' }, deps)

    expect(result).toEqual({ ok: true })
    expect(deleteOne).toHaveBeenCalledTimes(1)
    expect(deps.appendLog).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        action: 'remove',
        oldValue: { ticketId: 'T1', name: 'Coca', quantity: 2 },
      }),
      session as unknown as mongoose.ClientSession,
    )
  })
})
