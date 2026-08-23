import mongoose from 'mongoose'
import EventOrder from '../models/EventOrder'
import type { EventContextResult } from './eventOrderCoreService'
import type { MessagingErrorResult } from './messagingServiceTypes'

export interface OrderCaller {
  id: string
}

export interface PayTicketOrdersInput {
  eventId: string
  ticketId: string
}

export type PayTicketOrdersResult = MessagingErrorResult | { ok: true; total: number; itemCount: number }

export interface PayTicketOrdersDependencies {
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

export async function payEventTicketOrders(
  caller: OrderCaller,
  input: PayTicketOrdersInput,
  {
    loadEventContext,
    resolveCallerName,
    appendLog,
    startSession,
  }: PayTicketOrdersDependencies,
): Promise<PayTicketOrdersResult> {
  const eventId = input.eventId?.trim()
  const ticketCode = input.ticketId?.trim().toUpperCase()
  if (!eventId || !ticketCode) return { ok: false, status: 400, error: 'invalid_input' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { rank, role } = ctxResult.ctx
  if (rank < 2) return { ok: false, status: 403, error: 'pay_staff_only' }
  const actorName = await resolveCallerName(caller.id)

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'paid'; total: number; itemCount: number }

  const session = await startSession()
  let outcome: Outcome
  try {
    outcome = await session.withTransaction(async (): Promise<Outcome> => {
      const order = await EventOrder.findOne({ eventId }).session(session)
      const payable = order
        ? order.items.filter(
            (item) => item.ticketId === ticketCode && item.kind !== 'preorder' && item.status !== 'cancelled' && !item.paidAt,
          )
        : []
      if (payable.length === 0) return { kind: 'error', status: 400, error: 'nothing_to_pay' }

      const now = new Date()
      let total = 0
      for (const item of payable) {
        total += item.unitPriceMinor * item.quantity
        item.paidAt = now
        item.paidBy = caller.id
        item.paidByName = actorName
      }
      await order!.save({ session })

      await appendLog(
        eventId,
        {
          actorId: caller.id,
          actorName,
          actorRole: role,
          ticketId: ticketCode,
          action: 'pay',
          amountMinor: total,
          newValue: { itemCount: payable.length },
        },
        session,
      )

      return { kind: 'paid', total, itemCount: payable.length }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  return { ok: true, total: outcome.total, itemCount: outcome.itemCount }
}
