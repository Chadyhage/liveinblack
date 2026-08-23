import mongoose from 'mongoose'
import EventOrder, { type OrderItem } from '@/lib/models/EventOrder'
import type { EventOrderItemView } from './eventOrders'
import type { EventContextResult } from './eventOrderCoreService'
import type { MessagingErrorResult } from '../messaging/messagingServiceTypes'

export interface OrderCaller {
  id: string
}

export interface CancelOrderItemInput {
  eventId: string
  itemId: string
  reason: string
}

export type CancelOrderItemResult =
  | MessagingErrorResult
  | { ok: true; noop: true }
  | { ok: true; noop?: false; item: EventOrderItemView }

export interface CancelOrderItemDependencies {
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

export async function cancelEventOrderItem(
  caller: OrderCaller,
  input: CancelOrderItemInput,
  {
    loadEventContext,
    resolveCallerName,
    appendLog,
    toItemView,
    startSession,
  }: CancelOrderItemDependencies,
): Promise<CancelOrderItemResult> {
  const eventId = input.eventId?.trim()
  const itemId = input.itemId?.trim()
  const reason = input.reason?.trim()
  if (!eventId || !itemId) return { ok: false, status: 400, error: 'invalid_input' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank, role } = ctxResult.ctx
  if (rank !== 3) return { ok: false, status: 403, error: 'cancel_manager_only' }
  if (!reason) return { ok: false, status: 400, error: 'reason_required' }
  const actorName = await resolveCallerName(caller.id)

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'noop' } | { kind: 'cancelled'; item: OrderItem }

  const session = await startSession()
  let outcome: Outcome
  try {
    outcome = await session.withTransaction(async (): Promise<Outcome> => {
      const order = await EventOrder.findOne({ eventId }).session(session)
      const item = order?.items.find((entry) => entry.id === itemId)
      if (!order || !item) return { kind: 'error', status: 404, error: 'item_not_found' }
      if (item.paidAt || item.status === 'cancelled') return { kind: 'noop' }

      item.status = 'cancelled'
      item.cancelledAt = new Date()
      item.cancelledBy = caller.id
      item.cancellationReason = reason
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
          action: 'cancel',
          note: reason,
        },
        session,
      )

      return { kind: 'cancelled', item }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  if (outcome.kind === 'noop') return { ok: true, noop: true }
  return { ok: true, item: toItemView(outcome.item) }
}
