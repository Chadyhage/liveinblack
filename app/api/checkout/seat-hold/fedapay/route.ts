export const maxDuration = 60;
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { completeSeatHold, completeSeatHoldOrder } from '@/lib/server/events/seatHolds'
import { releaseOrder } from '@/lib/server/events/orders'
import Order from '@/lib/models/Order'
import { fulfillOrder } from '@/lib/server/payments/fulfillOrder'
import { createTransaction, createToken, isFedapayConfigured } from '@/lib/server/payments/fedapayClient'

// Paiement du SOLDE d'un blocage de place actif — rail FedaPay/XOF.
const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'
const MIN_XOF = 100

const bodySchema = z.object({ seatHoldId: z.string().min(1) })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  const requestHost = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const requestProto = req.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const site = process.env.NODE_ENV === 'production' ? SITE : requestHost ? `${requestProto}://${requestHost}` : new URL(req.url).origin

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const orderResult = await completeSeatHoldOrder({ id: session.user.id }, parsed.data.seatHoldId, 'fedapay')
  if (!orderResult.ok) return NextResponse.json({ error: orderResult.error }, { status: orderResult.status })
  const order = orderResult.order
  const orderId = order._id.toString()

  const amountTotal = order.unitPriceMinor + order.feeMinor
  if (amountTotal < MIN_XOF) {
    await releaseOrder(orderId, session.user.id)
    return NextResponse.json({ error: 'amount_below_minimum' }, { status: 400 })
  }

  if (!isFedapayConfigured() && process.env.NODE_ENV !== 'production') {
    const transactionId = `dev_fedapay_${orderId}`
    await Order.updateOne({ _id: orderId }, { $set: { fedapayTxnId: transactionId } })
    const fulfillment = await fulfillOrder(orderId, { rail: 'fedapay', paidAmountMinor: amountTotal })
    if (fulfillment.status !== 'ok' && fulfillment.status !== 'already_processed') {
      console.error('[checkout/seat-hold/fedapay][dev] simulated fulfillment failed:', fulfillment.status)
      await releaseOrder(orderId, session.user.id)
      return NextResponse.json({ error: 'fedapay_error' }, { status: 502 })
    }
    if (order.completesSeatHoldId) {
      await completeSeatHold(order.completesSeatHoldId, orderId)
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
      description: `${order.placeType} — solde`.slice(0, 200),
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
    console.error('[checkout/seat-hold/fedapay] transaction creation failed, releasing order:', err)
    await releaseOrder(orderId, session.user.id)
    return NextResponse.json({ error: 'fedapay_error' }, { status: 502 })
  }
}
