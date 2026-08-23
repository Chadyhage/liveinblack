import crypto from 'node:crypto'
import mongoose from 'mongoose'
import Ticket from '@/lib/models/Ticket'
import type { EventDoc } from '@/lib/models/Event'
import type { OrderItem } from '@/lib/models/EventOrder'
import type { EventOrderItemView } from './eventOrders'
import type { EventContextResult } from './eventOrderCoreService'
import type { MessagingErrorResult } from '../messaging/messagingServiceTypes'

export interface OrderCaller {
  id: string
}

export interface AddOrderItemInput {
  eventId: string
  ticketId: string
  menuItemId: string
  quantity: number
}

export type AddOrderItemResult = MessagingErrorResult | { ok: true; item: EventOrderItemView }

export interface AddOrderItemDependencies {
  loadEventContext: (eventId: string, callerId: string) => Promise<EventContextResult>
  resolveCallerName: (callerId: string) => Promise<string | null>
  getOrCreateOrder: (eventId: string, session: mongoose.ClientSession) => Promise<{
    items: OrderItem[]
    save: (options: { session: mongoose.ClientSession }) => Promise<unknown>
  }>
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

function findMenuItem(event: Pick<EventDoc, 'menu'>, menuItemId: string) {
  return event.menu?.find((item) => item.name === menuItemId)
}

export async function addEventOrderItem(
  caller: OrderCaller,
  input: AddOrderItemInput,
  {
    loadEventContext,
    resolveCallerName,
    getOrCreateOrder,
    appendLog,
    toItemView,
    startSession,
  }: AddOrderItemDependencies,
): Promise<AddOrderItemResult> {
  const eventId = input.eventId?.trim()
  const ticketCode = input.ticketId?.trim().toUpperCase()
  const menuItemId = input.menuItemId?.trim()
  const quantity = Math.floor(Number(input.quantity))
  if (!eventId || !ticketCode || !menuItemId) return { ok: false, status: 400, error: 'invalid_input' }
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 50) return { ok: false, status: 400, error: 'invalid_quantity' }

  const ctxResult = await loadEventContext(eventId, caller.id)
  if (!ctxResult.ok) return ctxResult
  const { event, rank, role } = ctxResult.ctx

  const menuItem = findMenuItem(event, menuItemId)
  if (!menuItem || menuItem.available === false) return { ok: false, status: 400, error: 'unknown_menu_item' }

  const ticket = await Ticket.findOne({ ticketCode })
  if (!ticket || ticket.eventId !== eventId) return { ok: false, status: 404, error: 'ticket_not_found' }
  if (rank === 0 && (String(ticket.userId) !== caller.id || ticket.revoked === true)) {
    return { ok: false, status: 403, error: 'not_your_ticket' }
  }

  const addedByName = await resolveCallerName(caller.id)
  const itemId = crypto.randomBytes(12).toString('hex')
  const unitPriceMinor = menuItem.price ?? 0

  type Outcome = { kind: 'error'; status: number; error: string } | { kind: 'item'; item: OrderItem }

  const session = await startSession()
  let outcome: Outcome
  try {
    outcome = await session.withTransaction(async (): Promise<Outcome> => {
      const order = await getOrCreateOrder(eventId, session)

      const existing = order.items.find(
        (item) =>
          item.ticketId === ticketCode &&
          item.menuItemId === menuItemId &&
          item.kind === 'order' &&
          item.unitPriceMinor === unitPriceMinor &&
          !item.servedAt &&
          !item.paidAt &&
          item.status !== 'cancelled' &&
          (rank > 0 || item.addedBy === caller.id),
      )

      if (existing) {
        const oldQuantity = existing.quantity
        const nextQuantity = oldQuantity + quantity
        if (nextQuantity > 50) return { kind: 'error', status: 400, error: 'invalid_quantity' }

        existing.quantity = nextQuantity
        await order.save({ session })
        await appendLog(
          eventId,
          {
            actorId: caller.id,
            actorName: addedByName,
            actorRole: role,
            itemId: existing.id,
            ticketId: ticketCode,
            itemName: existing.name,
            action: 'edit',
            oldValue: { quantity: oldQuantity },
            newValue: { quantity: nextQuantity },
            note: 'merged_repeated_add',
          },
          session,
        )
        return { kind: 'item', item: existing }
      }

      order.items.push({
        id: itemId,
        menuItemId,
        name: menuItem.name,
        quantity,
        unitPriceMinor,
        ticketId: ticketCode,
        addedBy: caller.id,
        addedByName,
        status: 'sent',
        kind: 'order',
      } as OrderItem)
      await order.save({ session })
      const newItem = order.items[order.items.length - 1]

      await appendLog(
        eventId,
        {
          actorId: caller.id,
          actorName: addedByName,
          actorRole: role,
          itemId,
          ticketId: ticketCode,
          itemName: menuItem.name,
          action: 'add',
          newValue: { quantity, unitPriceMinor },
        },
        session,
      )

      return { kind: 'item', item: newItem }
    })
  } finally {
    await session.endSession()
  }

  if (outcome.kind === 'error') return { ok: false, status: outcome.status, error: outcome.error }
  return { ok: true, item: toItemView(outcome.item) }
}
