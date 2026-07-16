import mongoose from 'mongoose'
import BoostSlot, { type BoostSlotDoc } from '../models/BoostSlot'
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
