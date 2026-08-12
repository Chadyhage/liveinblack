import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { completeSeatHoldOrder } from '@/lib/server/seatHolds'
import { releaseOrder } from '@/lib/server/orders'
import Order from '@/lib/models/Order'
import stripe from '@/lib/server/stripeClient'
import { checkCheckoutRateLimit } from '@/lib/server/rateLimit'

// Paiement du SOLDE d'un blocage de place actif — rail Stripe/EUR. Miroir de
// /api/checkout/resale : lib/server/seatHolds.ts::completeSeatHoldOrder gère
// toute la validation métier (hold actif, non expiré, propriétaire), aucun
// stock à décrémenter ici (déjà réservé par le hold).
const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

const bodySchema = z.object({ seatHoldId: z.string().min(1) })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const rateLimit = await checkCheckoutRateLimit(session.user.id)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const orderResult = await completeSeatHoldOrder({ id: session.user.id }, parsed.data.seatHoldId, 'stripe')
  if (!orderResult.ok) return NextResponse.json({ error: orderResult.error }, { status: orderResult.status })
  const order = orderResult.order
  const orderId = order._id.toString()

  const lineItems = [
    {
      price_data: { currency: 'eur', product_data: { name: `${order.placeType} — solde` }, unit_amount: order.unitPriceMinor },
      quantity: 1,
    },
  ]
  if (order.feeMinor > 0) {
    lineItems.push({
      price_data: { currency: 'eur', product_data: { name: 'Frais de service LIVEINBLACK' }, unit_amount: order.feeMinor },
      quantity: 1,
    })
  }

  try {
    const stripeSession = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        customer_email: session.user.email || undefined,
        success_url: `${SITE}/payment-success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
        cancel_url: `${SITE}/payment-success?cancelled=1&event_id=${encodeURIComponent(order.eventId)}`,
        metadata: { orderId },
        locale: 'fr',
      },
      { idempotencyKey: `checkout-seat-hold-completion-${orderId}` }
    )

    await Order.updateOne({ _id: orderId }, { $set: { stripeSessionId: stripeSession.id } })

    return NextResponse.json({ url: stripeSession.url })
  } catch (err) {
    console.error('[checkout/seat-hold] Stripe session creation failed, releasing order:', err)
    await releaseOrder(orderId, session.user.id)
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 })
  }
}
