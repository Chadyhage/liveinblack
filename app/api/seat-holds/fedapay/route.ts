export const maxDuration = 60;
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { activateSeatHold, createSeatHold, releaseSeatHoldDepositOrder } from '@/lib/server/events/seatHolds'
import { releaseOrder } from '@/lib/server/events/orders'
import Order from '@/lib/models/Order'
import { createTransaction, createToken, isFedapayConfigured } from '@/lib/server/payments/fedapayClient'
import { fedapayMarketplaceCommissions } from '@/lib/server/payments/fedapayMarketplace'

// Blocage de place (acompte) — rail FedaPay/XOF. Miroir de /api/seat-holds
// (Stripe) et de /api/checkout/resale/fedapay.
const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'
const MIN_XOF = 100

const bodySchema = z.object({
  eventId: z.string().min(1),
  placeId: z.string().min(1),
  tier: z.enum(['short', 'long']),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  const requestHost = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const requestProto = req.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const site = process.env.NODE_ENV === 'production' ? SITE : requestHost ? `${requestProto}://${requestHost}` : new URL(req.url).origin

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await createSeatHold({ id: session.user.id }, parsed.data, 'fedapay')
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  const { hold, order } = result
  const orderId = order._id.toString()

  if (order.currency !== 'XOF') {
    await releaseSeatHoldDepositOrder(orderId, releaseOrder)
    return NextResponse.json({ error: 'wrong_rail_for_currency' }, { status: 400 })
  }
  if (order.unitPriceMinor < MIN_XOF) {
    await releaseSeatHoldDepositOrder(orderId, releaseOrder)
    return NextResponse.json({ error: 'amount_below_minimum' }, { status: 400 })
  }
  if (order.sellerUid && !order.fedapaySubAccountReference && process.env.NODE_ENV === 'production') {
    await releaseSeatHoldDepositOrder(orderId, releaseOrder)
    return NextResponse.json({ error: 'fedapay_marketplace_account_required' }, { status: 409 })
  }

  if (!isFedapayConfigured() && process.env.NODE_ENV !== 'production') {
    const transactionId = `dev_fedapay_${orderId}`
    await Order.updateOne({ _id: orderId }, { $set: { fedapayTxnId: transactionId } })
    const activation = await activateSeatHold(orderId)
    if (!activation.ok) {
      console.error('[seat-holds/fedapay][dev] simulated activation failed:', activation.error)
      await releaseSeatHoldDepositOrder(orderId, releaseOrder)
      return NextResponse.json({ error: 'fedapay_error' }, { status: 502 })
    }
    return NextResponse.json({
      url: `${site}/payment-success?order_id=${encodeURIComponent(orderId)}&dev_payment=1`,
      transactionId,
      amountTotal: order.unitPriceMinor,
      currency: 'XOF',
      seatHoldId: String(hold._id),
      simulated: true,
    })
  }

  try {
    const txn = await createTransaction({
      description: `${hold.placeType} — Acompte de blocage (${hold.tier === 'short' ? '24h' : '72h'})`.slice(0, 200),
      amount: order.unitPriceMinor,
      callbackUrl: `${site}/payment-success`,
      customer: session.user.email ? { email: session.user.email } : null,
      metadata: { orderId },
      reference: orderId,
      subAccountsCommissions: fedapayMarketplaceCommissions(order.fedapaySubAccountReference, order.unitPriceMinor),
    })
    const tok = await createToken(txn.id)

    await Order.updateOne({ _id: orderId }, { $set: { fedapayTxnId: String(txn.id) } })

    return NextResponse.json({ url: tok.url, transactionId: txn.id, amountTotal: order.unitPriceMinor, currency: 'XOF', seatHoldId: String(hold._id) })
  } catch (err) {
    console.error('[seat-holds/fedapay] transaction creation failed, releasing hold:', err)
    await releaseSeatHoldDepositOrder(orderId, releaseOrder)
    return NextResponse.json({ error: 'fedapay_error' }, { status: 502 })
  }
}
