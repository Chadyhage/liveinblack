import mongoose from 'mongoose'
import BoostSlot, { type BoostSlotDoc } from '../models/BoostSlot'
import Event from '../models/Event'
import { boostSlotId, normalizeBoostRegion } from '../shared/boosts'

const HOLD_MINUTES = 24 * 60 // volontairement long : un webhook en échec ne doit
// pas rouvrir le créneau avant qu'un humain ait pu regarder (voir legacy).

export type ReserveSlotResult = { ok: true; slotId: string } | { ok: false; error: 'slot_taken' }

// Verrou transactionnel empêchant deux organisateurs d'acheter le même
// région+position simultanément (port de api/checkout-boost.js).
export async function reserveBoostSlot(params: {
  eventId: string
  userId: string
  position: number
  region: string
  boostId: string
}): Promise<ReserveSlotResult> {
  const region = normalizeBoostRegion(params.region)
  const slotId = boostSlotId(region, params.position)
  const now = Date.now()

  const session = await mongoose.startSession()
  try {
    let result: ReserveSlotResult = { ok: true, slotId }
    await session.withTransaction(async () => {
      const slot = await BoostSlot.findOne({ slotId }).session(session)
      const occupiedUntil = slot ? Math.max(slot.activeUntil?.getTime() || 0, slot.holdUntil.getTime()) : 0
      const sameReservation = slot?.boostId === params.boostId && slot?.eventId === params.eventId && slot?.userId === params.userId && slot?.position === params.position
      if (slot && occupiedUntil > now && !sameReservation) {
        result = { ok: false, error: 'slot_taken' }
        return
      }
      await BoostSlot.updateOne(
        { slotId },
        {
          $set: {
            slotId,
            boostId: params.boostId,
            eventId: params.eventId,
            userId: params.userId,
            position: params.position,
            region,
            status: 'pending',
            holdUntil: new Date(now + HOLD_MINUTES * 60000),
            activeUntil: null,
          },
        },
        { session, upsert: true }
      )
    })
    return result
  } finally {
    await session.endSession()
  }
}

// Annule une réservation de créneau si elle est encore 'pending' et
// correspond exactement à ce boostId (ex: la création de session Stripe a
// échoué juste après). Ne touche jamais un créneau qui aurait déjà basculé
// 'active' entre-temps.
export async function releaseBoostSlotIfPending(slotId: string, boostId: string): Promise<void> {
  await BoostSlot.deleteOne({ slotId, boostId, status: 'pending' })
}

export async function getBoostSlot(slotId: string): Promise<BoostSlotDoc | null> {
  return BoostSlot.findOne({ slotId }).lean()
}

export interface BoostAvailabilitySlot {
  position: number
  status: 'available' | 'held' | 'active'
}

// Port de la vérification d'occupation de BoostModal.jsx (positionStatus) —
// utilisé côté organisateur pour afficher "Occupé"/"Réservé temporairement"
// avant même de tenter un achat (reserveBoostSlot fait, lui, autorité au
// moment du paiement — ceci n'est qu'un affichage informatif).
export async function getBoostAvailability(region: string): Promise<BoostAvailabilitySlot[]> {
  const normalized = normalizeBoostRegion(region)
  const now = Date.now()
  const slots = await BoostSlot.find({ slotId: { $in: [1, 2, 3].map((p) => boostSlotId(normalized, p)) } }).lean()
  const byPosition = new Map(slots.map((s) => [s.position, s]))

  return [1, 2, 3].map((position) => {
    const slot = byPosition.get(position)
    if (!slot) return { position, status: 'available' as const }
    const activeUntil = slot.activeUntil ? slot.activeUntil.getTime() : 0
    const holdUntil = slot.holdUntil ? slot.holdUntil.getTime() : 0
    if (activeUntil > now) return { position, status: 'active' as const }
    if (holdUntil > now) return { position, status: 'held' as const }
    return { position, status: 'available' as const }
  })
}

type ErrResult = { ok: false; status: number; error: string }
export type GetEventBoostAvailabilityResult = ErrResult | { ok: true; slots: BoostAvailabilitySlot[] }

export async function getEventBoostAvailability(callerId: string, eventId: string): Promise<GetEventBoostAvailabilityResult> {
  const event = await Event.findById(eventId).lean()
  if (!event) return { ok: false, status: 404, error: 'event_not_found' }
  if (event.organizerId !== callerId && event.createdBy !== callerId) return { ok: false, status: 403, error: 'forbidden' }

  const slots = await getBoostAvailability(event.region)
  return { ok: true, slots }
}
