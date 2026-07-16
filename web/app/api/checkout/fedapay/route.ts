import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/auth'
import { createOrder, releaseOrder } from '@/lib/server/orders'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import Order from '@/lib/models/Order'
import { verifyEventUnlockToken, unlockCookieName } from '@/lib/server/eventUnlock'
import { createTransaction, createToken } from '@/lib/server/fedapayClient'

// Remplace la branche `action:'checkout'` de api/fedapay.js (rail XOF, mobile
// money). Miroir de /api/checkout (Stripe) — mêmes corrections (C07 : les
// préco n'ont plus de prix client ; H06 : URL depuis PUBLIC_SITE_URL ; H07/H08
// déjà appliqués dans createOrder()).
const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'
const MIN_XOF = 100

const bodySchema = z.object({
  eventId: z.string().min(1),
  placeId: z.string().min(1),
  qty: z.number().int().min(1).max(20).default(1),
  isTable: z.boolean().default(false),
  promoCode: z.string().trim().optional().nullable(),
  preorders: z.array(z.object({ name: z.string().min(1), qty: z.number().int().min(0).max(50) })).default([]),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })
  const { eventId, placeId, qty, isTable, promoCode, preorders } = parsed.data

  await getDb()
  const event = await Event.findById(eventId).lean()
  if (!event) return NextResponse.json({ error: 'event_not_found' }, { status: 404 })
  if (event.currency !== 'XOF') return NextResponse.json({ error: 'wrong_rail_use_stripe' }, { status: 400 })

  let privateAccessVerified = false
  if (event.isPrivate) {
    const cookieStore = await cookies()
    privateAccessVerified = verifyEventUnlockToken(eventId, cookieStore.get(unlockCookieName(eventId))?.value)
  }

  const orderResult = await createOrder({
    userId: session.user.id,
    eventId,
    placeId,
    qty,
    isTable,
    promoCode,
    preorders,
    rail: 'fedapay',
    privateAccessVerified,
  })
  if (!orderResult.ok) return NextResponse.json({ error: orderResult.error }, { status: orderResult.status })
  const order = orderResult.order
  const orderId = order._id.toString()

  const seatCount = isTable ? 1 : qty
  const preorderTotal = order.preorders.reduce((s, p) => s + p.price * p.qty, 0)
  const amountTotal = order.unitPriceMinor * seatCount + preorderTotal + order.feeMinor

  if (amountTotal <= 0) {
    await releaseOrder(orderId, session.user.id)
    return NextResponse.json({ error: 'nothing_to_pay' }, { status: 400 })
  }
  if (amountTotal < MIN_XOF) {
    await releaseOrder(orderId, session.user.id)
    return NextResponse.json({ error: 'amount_below_minimum' }, { status: 400 })
  }

  try {
    const txn = await createTransaction({
      description: `${event.name} — ${order.placeType}`.slice(0, 200),
      amount: amountTotal,
      callbackUrl: `${SITE}/paiement-reussi`,
      customer: session.user.email ? { email: session.user.email } : null,
      metadata: { orderId },
      reference: orderId,
    })
    const tok = await createToken(txn.id)

    await Order.updateOne({ _id: orderId }, { $set: { fedapayTxnId: String(txn.id) } })

    return NextResponse.json({ url: tok.url, transactionId: txn.id, amountTotal, currency: 'XOF' })
  } catch (err) {
    console.error('[checkout/fedapay] transaction creation failed, releasing order:', err)
    await releaseOrder(orderId, session.user.id)
    return NextResponse.json({ error: 'fedapay_error' }, { status: 502 })
  }
}
