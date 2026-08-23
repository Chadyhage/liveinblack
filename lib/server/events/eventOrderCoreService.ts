import crypto from 'node:crypto'
import mongoose, { type HydratedDocument } from 'mongoose'
import Event, { type EventDoc } from '../models/Event'
import EventStaff from '../models/EventStaff'
import EventOrder, { type EventOrderDoc } from '../models/EventOrder'
import EventOrderLog from '../models/EventOrderLog'
import User from '../models/User'
import type { MessagingErrorResult } from './messagingServiceTypes'

export type StaffRoster = Record<string, { role: string }>

export function computeEventOrderAuthContext(
  callerId: string,
  event: Pick<EventDoc, 'organizerId' | 'createdBy'>,
  roster: StaffRoster | undefined,
): { rank: number; role: string } {
  const isOwner = event.organizerId === callerId || event.createdBy === callerId
  if (isOwner) return { rank: 3, role: 'owner' }
  const staffRole = roster?.[callerId]?.role ?? null
  const rankByRole: Record<string, number> = { manager: 3, serveur: 2, scan: 1 }
  const rank = staffRole ? (rankByRole[staffRole] ?? 0) : 0
  return { rank, role: staffRole ?? 'client' }
}

export function resolveEventOrderRank(
  callerId: string,
  event: Pick<EventDoc, 'organizerId' | 'createdBy'>,
  roster: StaffRoster | undefined,
): number {
  return computeEventOrderAuthContext(callerId, event, roster).rank
}

export interface EventContext {
  event: HydratedDocument<EventDoc>
  rank: number
  role: string
}

export type EventContextResult = MessagingErrorResult | { ok: true; ctx: EventContext }

export async function loadEventOrderContext(eventId: string, callerId: string): Promise<EventContextResult> {
  const event = await Event.findById(eventId)
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  const staffDoc = await EventStaff.findOne({ eventId }).lean()
  const roster = staffDoc?.roster as StaffRoster | undefined
  const rank = resolveEventOrderRank(callerId, event, roster)
  const { role } = computeEventOrderAuthContext(callerId, event, roster)
  return { ok: true, ctx: { event, rank, role } }
}

export async function getCallerEventOrderRank(callerId: string, eventId: string): Promise<number> {
  if (!mongoose.isValidObjectId(eventId)) return 0
  const event = await Event.findById(eventId).lean()
  if (!event) return 0
  const staffDoc = await EventStaff.findOne({ eventId }).lean()
  const roster = staffDoc?.roster as StaffRoster | undefined
  return resolveEventOrderRank(callerId, event, roster)
}

export async function resolveEventOrderCallerName(callerId: string): Promise<string | null> {
  const user = await User.findById(callerId).lean()
  if (!user) return null
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
}

export async function getOrCreateEventOrder(
  eventId: string,
  session: mongoose.ClientSession,
): Promise<HydratedDocument<EventOrderDoc>> {
  const order = await EventOrder.findOneAndUpdate(
    { eventId },
    { $setOnInsert: { eventId, items: [] } },
    { upsert: true, returnDocument: 'after', session },
  )
  return order as HydratedDocument<EventOrderDoc>
}

export async function appendEventOrderLog(
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
): Promise<void> {
  const fullEntry = {
    id: crypto.randomBytes(12).toString('hex'),
    ts: new Date(),
    actorId: entry.actorId,
    actorName: entry.actorName ?? null,
    actorRole: entry.actorRole ?? null,
    itemId: entry.itemId ?? null,
    ticketId: entry.ticketId ?? null,
    itemName: entry.itemName ?? null,
    action: entry.action,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
    amountMinor: entry.amountMinor ?? null,
    note: entry.note ?? null,
  }
  await EventOrderLog.findOneAndUpdate(
    { eventId },
    { $push: { entries: fullEntry }, $setOnInsert: { eventId } },
    { upsert: true, session },
  )
}

export function buildSanitizedEventOrderItemId(prefix: string, ticketCode: string, name: string): string {
  const raw = `${prefix}_${ticketCode}_${name.replace(/ /g, '_')}`
  return raw.slice(0, 90)
}
