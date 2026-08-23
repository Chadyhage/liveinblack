import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { createSeatHold, releaseSeatHoldDepositOrder, listMySeatHolds } from '@/lib/server/events/seatHolds'
import { releaseOrder } from '@/lib/server/events/orders'
import Order from '@/lib/models/Order'
import User from '@/lib/models/User'
import stripe from '@/lib/server/payments/stripeClient'

// Blocage de place (acompte) — rail Stripe/EUR. Miroir de /api/checkout/resale :
// crée le SeatHold + son Order d'acompte (lib/server/seatHolds.ts::createSeatHold),
// puis une session Stripe hébergée pour ce SEUL montant (l'acompte, jamais le
// prix total du billet — voir lib/shared/fees.ts::SEAT_HOLD_SHORT/LONG).
const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

const bodySchema = z.object({
  eventId: z.string().min(1),
  placeId: z.string().min(1),
  tier: z.enum(['short', 'long']),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  const holds = await listMySeatHolds(session.user.id)
  return NextResponse.json({ ok: true, holds })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await createSeatHold({ id: session.user.id }, parsed.data, 'stripe')
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  const { hold, order } = result
  const orderId = order._id.toString()

  if (order.currency !== 'EUR') {
    await releaseSeatHoldDepositOrder(orderId, releaseOrder)
    return NextResponse.json({ error: 'wrong_rail_for_currency' }, { status: 400 })
  }

  try {
    let paymentIntentData: {
      transfer_data: { destination: string }
      application_fee_amount?: number
      metadata: Record<string, string>
    } | undefined
    if (order.connectMode === 'auto' && order.sellerUid) {
      const seller = await User.findById(order.sellerUid).select('stripeAccountId').lean()
      if (seller?.stripeAccountId) {
        paymentIntentData = {
          transfer_data: { destination: seller.stripeAccountId },
          metadata: { sellerUid: order.sellerUid, seatHoldDeposit: 'true' },
        }
      }
    }
    const stripeSession = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: { currency: 'eur', product_data: { name: `${hold.placeType} — Acompte de blocage (${hold.tier === 'short' ? '24h' : '72h'})` }, unit_amount: order.unitPriceMinor },
            quantity: 1,
          },
        ],
        ...(paymentIntentData ? { payment_intent_data: paymentIntentData } : {}),
        customer_email: session.user.email || undefined,
        success_url: `${SITE}/payment-success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
        cancel_url: `${SITE}/payment-success?cancelled=1&event_id=${encodeURIComponent(hold.eventId)}`,
        metadata: { orderId },
        locale: 'fr',
      },
      { idempotencyKey: `checkout-seat-hold-${orderId}` }
    )

    await Order.updateOne({ _id: orderId }, { $set: { stripeSessionId: stripeSession.id } })

    return NextResponse.json({ url: stripeSession.url, seatHoldId: String(hold._id) })
  } catch (err) {
    console.error('[seat-holds] Stripe session creation failed, releasing hold:', err)
    await releaseSeatHoldDepositOrder(orderId, releaseOrder)
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 })
  }
}
