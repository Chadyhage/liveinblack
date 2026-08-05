import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { completeSeatHoldOrder } from '@/lib/server/seatHolds'
import { releaseOrder } from '@/lib/server/orders'
import Order from '@/lib/models/Order'
import { createTransaction, createToken } from '@/lib/server/fedapayClient'

// Paiement du SOLDE d'un blocage de place actif — rail FedaPay/XOF.
const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'
const MIN_XOF = 100

const bodySchema = z.object({ seatHoldId: z.string().min(1) })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

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

  try {
    const txn = await createTransaction({
      description: `${order.placeType} — solde`.slice(0, 200),
      amount: amountTotal,
      callbackUrl: `${SITE}/payment-success`,
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
