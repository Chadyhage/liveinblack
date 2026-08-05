import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { createSeatHold, releaseSeatHoldDepositOrder } from '@/lib/server/seatHolds'
import { releaseOrder } from '@/lib/server/orders'
import Order from '@/lib/models/Order'
import { createTransaction, createToken } from '@/lib/server/fedapayClient'

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

  try {
    const txn = await createTransaction({
      description: `${hold.placeType} — Acompte de blocage (${hold.tier === 'short' ? '24h' : '72h'})`.slice(0, 200),
      amount: order.unitPriceMinor,
      callbackUrl: `${SITE}/payment-success`,
      customer: session.user.email ? { email: session.user.email } : null,
      metadata: { orderId },
      reference: orderId,
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
