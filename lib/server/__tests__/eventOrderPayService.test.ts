import { beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import EventOrder from '@/lib/models/EventOrder'
import { payEventTicketOrders, type PayTicketOrdersDependencies } from '../events/eventOrderPayService'

vi.mock('../../models/EventOrder', () => ({
  default: {
    findOne: vi.fn(),
  },
}))

describe('eventOrderPayService', () => {
  const caller = { id: 'u1' }

  let deps: PayTicketOrdersDependencies
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
        ctx: { rank: 2, role: 'serveur', event: {} as never },
      }),
      resolveCallerName: vi.fn().mockResolvedValue('Alice A'),
      appendLog: vi.fn().mockResolvedValue(undefined),
      startSession: vi.fn().mockResolvedValue(session as unknown as mongoose.ClientSession),
    }
    vi.clearAllMocks()
  })

  it('refuse un non staff caissable', async () => {
    vi.mocked(deps.loadEventContext).mockResolvedValueOnce({
      ok: true,
      ctx: { rank: 1, role: 'scan', event: {} as never },
    })

    await expect(
      payEventTicketOrders(caller, { eventId: 'event-1', ticketId: 'T1' }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'pay_staff_only',
    })
  })

  it('retourne nothing_to_pay si aucune ligne payable', async () => {
    vi.mocked(EventOrder.findOne).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue({
        items: [
          { ticketId: 'T1', kind: 'preorder', status: 'sent', paidAt: null },
          { ticketId: 'T1', kind: 'order', status: 'cancelled', paidAt: null },
        ],
      }),
    } as never)

    await expect(
      payEventTicketOrders(caller, { eventId: 'event-1', ticketId: 't1' }, deps),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'nothing_to_pay',
    })
  })

  it('encaisse les lignes payables et journalise le total', async () => {
    const items: Array<{
      ticketId: string
      kind: string
      status: string
      paidAt: Date | null
      unitPriceMinor: number
      quantity: number
      paidBy?: string
      paidByName?: string | null
    }> = [
      { ticketId: 'T1', kind: 'order', status: 'sent', paidAt: null, unitPriceMinor: 500, quantity: 2 },
      { ticketId: 'T1', kind: 'included', status: 'sent', paidAt: null, unitPriceMinor: 0, quantity: 1 },
      { ticketId: 'T1', kind: 'preorder', status: 'sent', paidAt: null, unitPriceMinor: 1000, quantity: 1 },
    ]
    const save = vi.fn().mockResolvedValue(undefined)
    vi.mocked(EventOrder.findOne).mockReturnValueOnce({
      session: vi.fn().mockResolvedValue({
        items,
        save,
      }),
    } as never)

    const result = await payEventTicketOrders(caller, { eventId: 'event-1', ticketId: 't1' }, deps)

    expect(result).toEqual({ ok: true, total: 1000, itemCount: 2 })
    expect(items[0].paidBy).toBe('u1')
    expect(items[1].paidBy).toBe('u1')
    expect(items[2].paidBy).toBeUndefined()
    expect(deps.appendLog).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        action: 'pay',
        ticketId: 'T1',
        amountMinor: 1000,
        newValue: { itemCount: 2 },
      }),
      session as unknown as mongoose.ClientSession,
    )
  })
})
