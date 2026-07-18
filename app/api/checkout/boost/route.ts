import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import Boost from '@/lib/models/Boost'
import PaymentAlert from '@/lib/models/PaymentAlert'
import { getBoostPlan } from '@/lib/shared/boosts'
import { getEventEndTimestamp } from '@/lib/shared/eventUrgency'
import { reserveBoostSlot, releaseBoostSlotIfPending } from '@/lib/server/boostSlots'
import { boostSlotId, normalizeBoostRegion } from '@/lib/shared/boosts'
import stripe from '@/lib/server/stripeClient'

// Remplace api/checkout-boost.js — achat d'un créneau Top 1/2/3. Le prix
// vient TOUJOURS de lib/shared/boosts.ts (BOOST_PLANS), jamais du client.
const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

const bodySchema = z.object({
  eventId: z.string().min(1),
  position: z.number().int().min(1).max(3),
  days: z.number().int(),
  boostId: z.string().regex(/^[A-Z0-9_-]{8,64}$/i),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  const { eventId, position, days, boostId } = parsed.data

  const offer = getBoostPlan(position, days)
  if (!offer) return NextResponse.json({ error: 'invalid_offer' }, { status: 400 })

  await getDb()
  const event = await Event.findById(eventId).lean()
  if (!event) return NextResponse.json({ error: 'event_not_found' }, { status: 404 })
  if (event.organizerId !== session.user.id && event.createdBy !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (event.cancelled) return NextResponse.json({ error: 'event_cancelled' }, { status: 409 })

  const now = Date.now()
  const requestedEnd = now + offer.tier.days * 86400000
  const eventEnd = getEventEndTimestamp(event)
  if (eventEnd > 0 && requestedEnd > eventEnd) {
    return NextResponse.json({ error: 'boost_outlasts_event' }, { status: 400 })
  }

  const region = normalizeBoostRegion(event.region || '')
  const reserved = await reserveBoostSlot({ eventId, userId: session.user.id, position, region, boostId })
  if (!reserved.ok) return NextResponse.json({ error: 'slot_taken' }, { status: 409 })
  const slotId = boostSlotId(region, position)

  try {
    const stripeSession = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        expires_at: Math.floor((now + 31 * 60000) / 1000),
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: { name: `Boost ${offer.plan.label} — ${event.name}`, description: offer.plan.description },
              unit_amount: Math.round(offer.tier.price * 100),
            },
            quantity: 1,
          },
        ],
        success_url: `${SITE}/boost-active?session_id={CHECKOUT_SESSION_ID}&boost_id=${boostId}`,
        cancel_url: `${SITE}/events/${eventId}?boost_cancelled=1`,
        metadata: {
          intent: 'boost',
          eventId,
          eventName: event.name,
          position: String(position),
          days: String(days),
          region,
          userId: session.user.id,
          boostId,
          slotId,
        },
        locale: 'fr',
      },
      { idempotencyKey: `boost-checkout-${boostId}` }
    )
    return NextResponse.json({ url: stripeSession.url })
  } catch (err) {
    console.error('[checkout/boost] Stripe session creation failed:', err)
    await releaseBoostSlotIfPending(slotId, boostId)
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 })
  }
}

// Vérification côté /boost-active. Le webhook Stripe (finalizeBoost) est la
// SEULE source de vérité pour l'activation — cette route ne fait que relire
// le statut de paiement Stripe puis regarder si le Boost a déjà été créé
// (ou si un conflit de créneau a mené à un remboursement automatique).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const url = new URL(req.url)
  const sessionId = url.searchParams.get('session_id')
  const boostId = url.searchParams.get('boost_id')
  if (!sessionId || !boostId) return NextResponse.json({ error: 'missing_params' }, { status: 400 })

  const stripeSession = await stripe.checkout.sessions.retrieve(sessionId)
  if (stripeSession.metadata?.boostId !== boostId || stripeSession.metadata?.userId !== session.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  if (stripeSession.payment_status !== 'paid') {
    return NextResponse.json({ paid: false, paymentStatus: stripeSession.payment_status })
  }

  await getDb()
  const meta = stripeSession.metadata
  const boost = await Boost.findOne({ boostId }).lean()

  let boostStatus: 'active' | 'refunded_conflict' | 'pending' = 'pending'
  if (boost) boostStatus = boost.status === 'refunded_conflict' ? 'refunded_conflict' : 'active'
  else {
    const conflictAlert = await PaymentAlert.findOne({ key: `boost_slot_lost_${boostId}` }).lean()
    if (conflictAlert) boostStatus = 'refunded_conflict'
  }

  return NextResponse.json({
    paid: true,
    paymentStatus: stripeSession.payment_status,
    boostStatus,
    amountTotal: stripeSession.amount_total,
    metadata: {
      eventId: meta?.eventId || '',
      eventName: meta?.eventName || '',
      position: meta?.position || '',
      days: meta?.days || '',
    },
  })
}
