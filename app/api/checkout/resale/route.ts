import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { initiateResaleOrder, releaseResaleOrder } from '@/lib/server/resale'
import Order from '@/lib/models/Order'
import stripe from '@/lib/server/stripeClient'
import { checkCheckoutRateLimit } from '@/lib/server/rateLimit'

// Miroir de /api/checkout (achat neuf), pour l'achat d'un billet REVENDU.
// Aucun stock à décrémenter (lib/server/resale.ts::initiateResaleOrder gère
// la réservation du listing lui-même) ; le reste — session Stripe, retour
// success/cancel, idempotencyKey — suit exactement le même patron.
const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

const bodySchema = z.object({ listingId: z.string().min(1) })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const rateLimit = await checkCheckoutRateLimit(session.user.id)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const orderResult = await initiateResaleOrder({ id: session.user.id }, parsed.data.listingId, 'stripe')
  if (!orderResult.ok) return NextResponse.json({ error: orderResult.error }, { status: orderResult.status })
  const order = orderResult.order
  const orderId = order._id.toString()

  const lineItems = [
    {
      price_data: { currency: 'eur', product_data: { name: `${order.placeType} — revente officielle LIVE IN BLACK` }, unit_amount: order.unitPriceMinor },
      quantity: 1,
    },
  ]

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
      { idempotencyKey: `checkout-resale-${orderId}` }
    )

    await Order.updateOne({ _id: orderId }, { $set: { stripeSessionId: stripeSession.id } })

    return NextResponse.json({ url: stripeSession.url })
  } catch (err) {
    console.error('[checkout/resale] Stripe session creation failed, releasing order:', err)
    await releaseResaleOrder(orderId)
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 })
  }
}
