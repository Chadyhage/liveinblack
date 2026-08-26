export const maxDuration = 60;
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { fulfillResaleOrder, initiateResaleOrder, releaseResaleOrder } from '@/lib/server/events/resale'
import Order from '@/lib/models/Order'
import { createTransaction, createToken, isFedapayConfigured } from '@/lib/server/payments/fedapayClient'

// Miroir de /api/checkout/fedapay (achat neuf), pour l'achat d'un billet
// REVENDU sur le rail XOF/mobile money.
const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'
const MIN_XOF = 100

const bodySchema = z.object({ listingId: z.string().min(1) })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  const requestHost = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const requestProto = req.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const site = process.env.NODE_ENV === 'production' ? SITE : requestHost ? `${requestProto}://${requestHost}` : new URL(req.url).origin

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const orderResult = await initiateResaleOrder({ id: session.user.id }, parsed.data.listingId, 'fedapay')
  if (!orderResult.ok) return NextResponse.json({ error: orderResult.error }, { status: orderResult.status })
  const order = orderResult.order
  const orderId = order._id.toString()

  const amountTotal = order.unitPriceMinor + order.feeMinor
  if (amountTotal < MIN_XOF) {
    await releaseResaleOrder(orderId)
    return NextResponse.json({ error: 'amount_below_minimum' }, { status: 400 })
  }

  if (!isFedapayConfigured() && process.env.NODE_ENV !== 'production') {
    const transactionId = `dev_fedapay_${orderId}`
    await Order.updateOne({ _id: orderId }, { $set: { fedapayTxnId: transactionId } })
    const fulfillment = await fulfillResaleOrder(orderId, { paidAmountMinor: amountTotal })
    if (fulfillment.status !== 'ok' && fulfillment.status !== 'already_processed') {
      console.error('[checkout/resale/fedapay][dev] simulated fulfillment failed:', fulfillment.status)
      await releaseResaleOrder(orderId)
      return NextResponse.json({ error: 'fedapay_error' }, { status: 502 })
    }
    return NextResponse.json({
      url: `${site}/payment-success?order_id=${encodeURIComponent(orderId)}&dev_payment=1`,
      transactionId,
      amountTotal,
      currency: 'XOF',
      simulated: true,
    })
  }

  try {
    const txn = await createTransaction({
      description: `${order.placeType} — revente officielle`.slice(0, 200),
      amount: amountTotal,
      callbackUrl: `${site}/payment-success`,
      customer: session.user.email ? { email: session.user.email } : null,
      metadata: { orderId },
      reference: orderId,
    })
    const tok = await createToken(txn.id)

    await Order.updateOne({ _id: orderId }, { $set: { fedapayTxnId: String(txn.id) } })

    return NextResponse.json({ url: tok.url, transactionId: txn.id, amountTotal, currency: 'XOF' })
  } catch (err) {
    console.error('[checkout/resale/fedapay] transaction creation failed, releasing order:', err)
    await releaseResaleOrder(orderId)
    return NextResponse.json({ error: 'fedapay_error' }, { status: 502 })
  }
}
