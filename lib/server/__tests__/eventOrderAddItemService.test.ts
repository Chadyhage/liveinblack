import { beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import Ticket from '../../models/Ticket'
import { addEventOrderItem, type AddOrderItemDependencies } from '../eventOrderAddItemService'

vi.mock('../../models/Ticket', () => ({
  default: {
    findOne: vi.fn(),
  },
}))

describe('eventOrderAddItemService', () => {
  const caller = { id: 'u1' }

  let deps: AddOrderItemDependencies
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
        ctx: {
          event: {
            menu: [{ name: 'Coca', price: 500, available: true }],
          },
          rank: 0,
          role: 'client',
        },
      }),
      resolveCallerName: vi.fn().mockResolvedValue('Alice A'),
      getOrCreateOrder: vi.fn().mockResolvedValue({
        items: [],
        save: vi.fn().mockResolvedValue(undefined),
      }),
      appendLog: vi.fn().mockResolvedValue(undefined),
      toItemView: vi.fn((item) => ({ id: item.id, name: item.name, quantity: item.quantity }) as never),
      startSession: vi.fn().mockResolvedValue(session as unknown as mongoose.ClientSession),
    }
    vi.clearAllMocks()
  })

  it('refuse des entrées invalides', async () => {
    await expect(
      addEventOrderItem(caller, { eventId: '', ticketId: 'T1', menuItemId: 'Coca', quantity: 1 }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_input',
    })
  })

  it('refuse une quantité hors bornes', async () => {
    await expect(
      addEventOrderItem(caller, { eventId: 'event-1', ticketId: 'T1', menuItemId: 'Coca', quantity: 0 }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'invalid_quantity',
    })
  })

  it('refuse un item de menu inconnu', async () => {
    vi.mocked(deps.loadEventContext).mockResolvedValueOnce({
      ok: true,
      ctx: { event: { menu: [] }, rank: 0, role: 'client' } as never,
    })

    await expect(
      addEventOrderItem(caller, { eventId: 'event-1', ticketId: 'T1', menuItemId: 'Coca', quantity: 1 }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'unknown_menu_item',
    })
  })

  it('refuse un billet qui ne lui appartient pas pour un rang 0', async () => {
    vi.mocked(Ticket.findOne).mockResolvedValueOnce({
      eventId: 'event-1',
      userId: 'u2',
      revoked: false,
    } as never)

    await expect(
      addEventOrderItem(caller, { eventId: 'event-1', ticketId: 'tick1', menuItemId: 'Coca', quantity: 1 }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'not_your_ticket',
    })
  })

  it('fusionne une ligne existante répétée', async () => {
    vi.mocked(Ticket.findOne).mockResolvedValueOnce({
      eventId: 'event-1',
      userId: 'u1',
      revoked: false,
    } as never)
    const existing = {
      id: 'item-1',
      ticketId: 'TICK1',
      menuItemId: 'Coca',
      kind: 'order',
      unitPriceMinor: 500,
      servedAt: null,
      paidAt: null,
      status: 'sent',
      addedBy: 'u1',
      quantity: 1,
      name: 'Coca',
    }
    const save = vi.fn().mockResolvedValue(undefined)
    vi.mocked(deps.getOrCreateOrder).mockResolvedValueOnce({
      items: [existing] as never,
      save,
    })

    const result = await addEventOrderItem(
      caller,
      { eventId: 'event-1', ticketId: 'tick1', menuItemId: 'Coca', quantity: 2 },
      deps,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(existing.quantity).toBe(3)
    expect(deps.appendLog).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        action: 'edit',
        note: 'merged_repeated_add',
      }),
      session as unknown as mongoose.ClientSession,
    )
  })

  it('crée une nouvelle ligne et la journalise', async () => {
    vi.mocked(Ticket.findOne).mockResolvedValueOnce({
      eventId: 'event-1',
      userId: 'u1',
      revoked: false,
    } as never)
    const items: Array<Record<string, unknown>> = []
    const save = vi.fn().mockResolvedValue(undefined)
    vi.mocked(deps.getOrCreateOrder).mockResolvedValueOnce({
      items: items as never,
      save,
    })

    const result = await addEventOrderItem(
      caller,
      { eventId: 'event-1', ticketId: 'tick1', menuItemId: 'Coca', quantity: 2 },
      deps,
    )

    expect(result.ok).toBe(true)
    expect(items).toHaveLength(1)
    expect(deps.appendLog).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        action: 'add',
        ticketId: 'TICK1',
        itemName: 'Coca',
      }),
      session as unknown as mongoose.ClientSession,
    )
  })
})
