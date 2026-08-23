import mongoose from 'mongoose'
import EventOrder from '../models/EventOrder'
import type { EventContextResult } from './eventOrderCoreService'
import type { MessagingErrorResult } from './messagingServiceTypes'

export interface OrderCaller {
  id: string
}

export interface RemoveOrderItemInput {
  eventId: string
  itemId: string
}

export type RemoveOrderItemResult =
  | MessagingErrorResult
  | { ok: true; noop: true }
  | { ok: true; noop?: false }

export interface RemoveOrderItemDependencies {
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
  startSession: typeof mongoose.startSession
}

export async function removeEventOrderItem(
  caller: OrderCaller,
  input: RemoveOrderItemInput,
  {
    loadEventContext,
    resolveCallerName,
    appendLog,
    startSession,
  }: RemoveOrderItemDependencies,
): Promise<RemoveOrderItemResult> {
  const eventId = input.eventId?.trim()
  const itemId = input.itemId?.trim()
  if (!eventId || !itemId) return { ok: false, status: 400, error: 'invalid_input' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank, role } = ctxResult.ctx
  const actorName = await resolveCallerName(caller.id)

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'noop' } | { kind: 'removed' }

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

      const snapshot = { ticketId: item.ticketId, name: item.name, quantity: item.quantity }
      item.deleteOne()
      await order.save({ session })

      await appendLog(
        eventId,
        {
          actorId: caller.id,
          actorName,
          actorRole: role,
          itemId,
          ticketId: snapshot.ticketId,
          itemName: snapshot.name,
          action: 'remove',
          oldValue: snapshot,
        },
        session,
      )

      return { kind: 'removed' }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  if (outcome.kind === 'noop') return { ok: true, noop: true }
  return { ok: true }
}
