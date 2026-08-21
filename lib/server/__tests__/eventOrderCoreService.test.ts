import { beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import Event from '../../models/Event'
import EventStaff from '../../models/EventStaff'
import EventOrder from '../../models/EventOrder'
import EventOrderLog from '../../models/EventOrderLog'
import User from '../../models/User'
import {
  appendEventOrderLog,
  buildSanitizedEventOrderItemId,
  computeEventOrderAuthContext,
  getCallerEventOrderRank,
  getOrCreateEventOrder,
  loadEventOrderContext,
  resolveEventOrderCallerName,
} from '../eventOrderCoreService'

vi.mock('../../models/Event', () => ({
  default: {
    findById: vi.fn(),
  },
}))

vi.mock('../../models/EventStaff', () => ({
  default: {
    findOne: vi.fn(),
  },
}))

vi.mock('../../models/EventOrder', () => ({
  default: {
    findOneAndUpdate: vi.fn(),
  },
}))

vi.mock('../../models/EventOrderLog', () => ({
  default: {
    findOneAndUpdate: vi.fn(),
  },
}))

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
}))

describe('eventOrderCoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calcule correctement les rangs owner / manager / serveur / client', () => {
    const event = { organizerId: 'owner', createdBy: 'owner' } as never
    expect(computeEventOrderAuthContext('owner', event, undefined)).toEqual({ rank: 3, role: 'owner' })
    expect(computeEventOrderAuthContext('m1', event, { m1: { role: 'manager' } })).toEqual({ rank: 3, role: 'manager' })
    expect(computeEventOrderAuthContext('s1', event, { s1: { role: 'serveur' } })).toEqual({ rank: 2, role: 'serveur' })
    expect(computeEventOrderAuthContext('c1', event, undefined)).toEqual({ rank: 0, role: 'client' })
  })

  it('charge le contexte event order avec le roster', async () => {
    vi.mocked(Event.findById).mockResolvedValueOnce({
      organizerId: 'owner',
      createdBy: 'owner',
    } as never)
    vi.mocked(EventStaff.findOne).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({ roster: { user1: { role: 'scan' } } }),
    } as never)

    const result = await loadEventOrderContext('event-1', 'user1')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ctx.rank).toBe(1)
    expect(result.ctx.role).toBe('scan')
  })

  it('retourne 0 pour getCallerEventOrderRank si eventId est invalide', async () => {
    await expect(getCallerEventOrderRank('u1', 'bad-id')).resolves.toBe(0)
  })

  it('résout le nom appelant ou retombe sur email', async () => {
    vi.mocked(User.findById).mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({ firstName: 'Alice', lastName: 'A', email: 'alice@test.com' }),
    } as never)
    await expect(resolveEventOrderCallerName('u1')).resolves.toBe('Alice A')
  })

  it('crée ou récupère le document de commande événement dans la session', async () => {
    const session = {} as mongoose.ClientSession
    vi.mocked(EventOrder.findOneAndUpdate).mockResolvedValueOnce({ _id: 'order-1' } as never)

    const result = await getOrCreateEventOrder('event-1', session)

    expect(result).toEqual({ _id: 'order-1' })
    expect(EventOrder.findOneAndUpdate).toHaveBeenCalledWith(
      { eventId: 'event-1' },
      { $setOnInsert: { eventId: 'event-1', items: [] } },
      { upsert: true, returnDocument: 'after', session },
    )
  })

  it('pousse une entrée de journal structurée', async () => {
    const session = {} as mongoose.ClientSession

    await appendEventOrderLog(
      'event-1',
      {
        actorId: 'u1',
        action: 'add',
        ticketId: 'TICK123',
        itemName: 'Coca',
        newValue: { quantity: 2 },
      },
      session,
    )

    expect(EventOrderLog.findOneAndUpdate).toHaveBeenCalledWith(
      { eventId: 'event-1' },
      {
        $push: {
          entries: expect.objectContaining({
            actorId: 'u1',
            action: 'add',
            ticketId: 'TICK123',
            itemName: 'Coca',
            newValue: { quantity: 2 },
          }),
        },
        $setOnInsert: { eventId: 'event-1' },
      },
      { upsert: true, session },
    )
  })

  it('sanitise l’id métier d’item de commande', () => {
    expect(buildSanitizedEventOrderItemId('pre', 'TICK123', 'Champagne Brut')).toBe('pre_TICK123_Champagne_Brut')
  })
})
