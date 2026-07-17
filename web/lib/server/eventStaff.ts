import mongoose from 'mongoose'
import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import EventStaff from '../models/EventStaff'
import EventOrder from '../models/EventOrder'
import User from '../models/User'

// Port de src/components/EventStaffModal.jsx (#7 phase organisateur) —
// équipe d'une soirée (scan/serveur/dj), gérée EXCLUSIVEMENT par le
// propriétaire (le "manager" au sens rang 3 d'eventOrders.ts n'est jamais un
// membre invité — c'est l'organisateur lui-même). Toute autorisation vérifiée
// ICI, jamais seulement côté client (le composant legacy n'a lui-même AUCUNE
// garde d'autorisation — il compte entièrement sur les règles Firestore).

export interface StaffCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

const INVITABLE_ROLES = ['scan', 'serveur', 'dj'] as const
export type InvitableRole = (typeof INVITABLE_ROLES)[number]

export interface StaffMemberView {
  userId: string
  role: string
  name: string
  addedAt: string
}

async function assertOwner(eventId: string, callerId: string) {
  const event = await Event.findById(eventId)
  if (!event) return { ok: false as const, status: 404, error: 'event_not_found' }
  if (event.organizerId !== callerId && event.createdBy !== callerId) return { ok: false as const, status: 403, error: 'forbidden' }
  return { ok: true as const, event }
}

export type ListStaffResult = ErrResult | { ok: true; members: StaffMemberView[] }

export async function listEventStaff(caller: StaffCaller, eventId: string): Promise<ListStaffResult> {
  await getDb()
  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard

  const staffDoc = await EventStaff.findOne({ eventId }).lean()
  const roster = (staffDoc?.roster ?? {}) as Record<string, { role: string; name?: string | null; addedAt?: Date | string }>
  const members: StaffMemberView[] = Object.entries(roster).map(([userId, entry]) => ({
    userId,
    role: entry.role,
    name: entry.name ?? '',
    addedAt: entry.addedAt ? new Date(entry.addedAt).toISOString() : '',
  }))
  return { ok: true, members }
}

export type AddStaffResult = ErrResult | { ok: true; member: StaffMemberView }

export async function addEventStaff(caller: StaffCaller, eventId: string, input: { targetUserId: string; role: string }): Promise<AddStaffResult> {
  await getDb()

  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard
  const { event } = guard

  if (!INVITABLE_ROLES.includes(input.role as InvitableRole)) return { ok: false, status: 400, error: 'invalid_role' }
  if (input.targetUserId === caller.id) return { ok: false, status: 400, error: 'cannot_invite_self' }

  const target = await User.findById(input.targetUserId).lean()
  if (!target) return { ok: false, status: 404, error: 'user_not_found' }
  const name = [target.firstName, target.lastName].filter(Boolean).join(' ') || target.email

  const staffDoc = await EventStaff.findOneAndUpdate({ eventId }, { $setOnInsert: { eventId } }, { upsert: true, new: true })
  const roster = (staffDoc.roster ?? new Map()) as Map<string, { role: string; name?: string | null; addedBy: string; addedAt: Date }>
  if (roster.get(input.targetUserId)) return { ok: false, status: 409, error: 'already_staff' }

  const addedAt = new Date()
  await EventStaff.updateOne({ eventId }, { $set: { [`roster.${input.targetUserId}`]: { role: input.role, name, addedBy: caller.id, addedAt } } })

  // Inviter un DJ suppose une playlist interactive fonctionnelle (#75) — même
  // effet de bord que legacy.
  if (input.role === 'dj' && !event.playlist) {
    event.playlist = true
    await event.save()
  }

  return { ok: true, member: { userId: input.targetUserId, role: input.role, name, addedAt: addedAt.toISOString() } }
}

export type RemoveStaffResult = ErrResult | { ok: true; reassignedCount: number }

// Retire un membre — si des lignes de commande en cours lui sont attribuées
// (non servies/payées/annulées), elles sont d'abord réattribuées au
// propriétaire (jamais orphelines), dans la MÊME transaction que le retrait.
export async function removeEventStaff(caller: StaffCaller, eventId: string, targetUserId: string): Promise<RemoveStaffResult> {
  await getDb()

  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard

  const staffDoc = await EventStaff.findOne({ eventId }).lean()
  const roster = (staffDoc?.roster ?? {}) as Record<string, { role: string }>
  if (!roster[targetUserId]) return { ok: false, status: 404, error: 'not_staff' }

  const managerName = await (async () => {
    if (!mongoose.isValidObjectId(caller.id)) return caller.id
    const manager = await User.findById(caller.id).lean()
    return manager ? [manager.firstName, manager.lastName].filter(Boolean).join(' ') || manager.email : caller.id
  })()

  const session = await mongoose.startSession()
  let reassignedCount = 0
  try {
    await session.withTransaction(async () => {
      const order = await EventOrder.findOne({ eventId }).session(session)
      if (order) {
        for (const item of order.items) {
          if (item.addedBy === targetUserId && item.status !== 'cancelled' && !item.servedAt && !item.paidAt) {
            item.addedBy = caller.id
            item.addedByName = managerName
            reassignedCount++
          }
        }
        if (reassignedCount > 0) await order.save({ session })
      }

      await EventStaff.updateOne({ eventId }, { $unset: { [`roster.${targetUserId}`]: '' } }, { session })
    })
  } finally {
    await session.endSession()
  }

  return { ok: true, reassignedCount }
}
