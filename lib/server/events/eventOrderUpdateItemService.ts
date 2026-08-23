import mongoose from 'mongoose'
import EventOrder, { type OrderItem } from '@/lib/models/EventOrder'
import type { EventOrderItemView } from './eventOrders'
import type { EventContextResult } from './eventOrderCoreService'
import type { MessagingErrorResult } from '../messaging/messagingServiceTypes'

export interface OrderCaller {
  id: string
}

export interface UpdateOrderItemQuantityInput {
  eventId: string
  itemId: string
  quantity: number
}

export type UpdateOrderItemQuantityResult =
  | MessagingErrorResult
  | { ok: true; noop: true }
  | { ok: true; noop?: false; item: EventOrderItemView }

export interface UpdateOrderItemDependencies {
  loadEventContext: (eventId: string, callerId: string) => Promise<EventContextResult>
  resolveCallerName: (callerId: string) => Promise<string | null>
  appendLog: (
    eventId: string,
    entry: {
      actorId: string
      actorName?: string | null
      actorRole?: string | null
      itemId?: string | null
      ticketId?: string | null
      itemName?: string | null
      action: string
      oldValue?: unknown
      newValue?: unknown
      amountMinor?: number | null
      note?: string | null
    },
    session: mongoose.ClientSession,
  ) => Promise<void>
  toItemView: (item: OrderItem) => EventOrderItemView
  startSession: typeof mongoose.startSession
}

export async function updateEventOrderItemQuantity(
  caller: OrderCaller,
  input: UpdateOrderItemQuantityInput,
  {
    loadEventContext,
    resolveCallerName,
    appendLog,
    toItemView,
    startSession,
  }: UpdateOrderItemDependencies,
): Promise<UpdateOrderItemQuantityResult> {
  const eventId = input.eventId?.trim()
  const itemId = input.itemId?.trim()
  const quantity = Math.floor(Number(input.quantity))
  if (!eventId || !itemId) return { ok: false, status: 400, error: 'invalid_input' }
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 50) return { ok: false, status: 400, error: 'invalid_quantity' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank, role } = ctxResult.ctx
  const actorName = await resolveCallerName(caller.id)

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'noop' } | { kind: 'updated'; item: OrderItem }

  const session = await startSession()
  let outcome: Outcome
  try {
    outcome = await session.withTransaction(async (): Promise<Outcome> => {
      const order = await EventOrder.findOne({ eventId }).session(session)
      const item = order?.items.find((entry) => entry.id === itemId)
      if (!order || !item) return { kind: 'error', status: 404, error: 'item_not_found' }

      const locked = Boolean(item.servedAt) || Boolean(item.paidAt) || item.status === 'cancelled'

      if (rank === 0) {
        if (item.addedBy !== caller.id) return { kind: 'error', status: 403, error: 'not_your_item' }
        if (locked) return { kind: 'error', status: 409, error: 'locked' }
      } else if (locked) {
        return { kind: 'noop' }
      }

      const oldQuantity = item.quantity
      item.quantity = quantity
      await order.save({ session })

      await appendLog(
        eventId,
        {
          actorId: caller.id,
          actorName,
          actorRole: role,
          itemId,
          ticketId: item.ticketId,
          itemName: item.name,
          action: 'edit',
          oldValue: { quantity: oldQuantity },
          newValue: { quantity },
        },
        session,
      )

      return { kind: 'updated', item }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  if (outcome.kind === 'noop') return { ok: true, noop: true }
  return { ok: true, item: toItemView(outcome.item) }
}
