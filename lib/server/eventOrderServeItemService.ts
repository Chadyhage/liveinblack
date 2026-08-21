import mongoose from 'mongoose'
import EventOrder, { type OrderItem } from '../models/EventOrder'
import type { EventOrderItemView } from './eventOrders'
import type { EventContextResult } from './eventOrderCoreService'
import type { MessagingErrorResult } from './messagingServiceTypes'

export interface OrderCaller {
  id: string
}

export interface ServeOrderItemInput {
  eventId: string
  itemId: string
}

export type ServeOrderItemResult =
  | MessagingErrorResult
  | { ok: true; alreadyServed: true }
  | { ok: true; alreadyServed?: false; item: EventOrderItemView }

export interface ServeOrderItemDependencies {
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

export async function serveEventOrderItem(
  caller: OrderCaller,
  input: ServeOrderItemInput,
  {
    loadEventContext,
    resolveCallerName,
    appendLog,
    toItemView,
    startSession,
  }: ServeOrderItemDependencies,
): Promise<ServeOrderItemResult> {
  const eventId = input.eventId?.trim()
  const itemId = input.itemId?.trim()
  if (!eventId || !itemId) return { ok: false, status: 400, error: 'invalid_input' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank, role } = ctxResult.ctx
  if (rank < 1) return { ok: false, status: 403, error: 'serve_staff_only' }
  const actorName = await resolveCallerName(caller.id)

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'already' } | { kind: 'served'; item: OrderItem }

  const session = await startSession()
  let outcome: Outcome
  try {
    outcome = await session.withTransaction(async (): Promise<Outcome> => {
      const order = await EventOrder.findOne({ eventId }).session(session)
      const item = order?.items.find((entry) => entry.id === itemId)
      if (!order || !item) return { kind: 'error', status: 404, error: 'item_not_found' }
      if (item.status === 'cancelled') return { kind: 'error', status: 409, error: 'item_cancelled' }
      if (item.servedAt) return { kind: 'already' }

      item.servedAt = new Date()
      item.servedBy = caller.id
      item.servedByName = actorName
      item.status = 'served'
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
          action: 'serve',
        },
        session,
      )

      return { kind: 'served', item }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  if (outcome.kind === 'already') return { ok: true, alreadyServed: true }
  return { ok: true, item: toItemView(outcome.item) }
}
