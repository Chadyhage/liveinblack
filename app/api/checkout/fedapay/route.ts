export const maxDuration = 60;
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { createOrder, releaseOrder } from '@/lib/server/events/orders'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import Order from '@/lib/models/Order'
import Ticket from '@/lib/models/Ticket'
import { fulfillOrder } from '@/lib/server/payments/fulfillOrder'
import { createTransaction, createToken, getTransaction, isFedapayConfigured } from '@/lib/server/payments/fedapayClient'
import { fedapayMarketplaceCommissions, sellerShareForOrder } from '@/lib/server/payments/fedapayMarketplace'

// Remplace la branche `action:'checkout'` de api/fedapay.js (rail XOF, mobile
// money). Miroir de /api/checkout (Stripe) — mêmes corrections (C07 : les
// préco n'ont plus de prix client ; H06 : URL depuis PUBLIC_SITE_URL ; H07/H08
// déjà appliqués dans createOrder()).
const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'
const MIN_XOF = 100

const preorderItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  qty: z.number().int().min(0).max(50),
  showOptionId: z.string().trim().min(1).max(80).optional(),
  showInfo: z.string().trim().max(240).optional(),
})

const bodySchema = z.object({
  eventId: z.string().min(1),
  placeId: z.string().min(1),
  qty: z.number().int().min(1).max(20).default(1),
  isTable: z.boolean().default(false),
  promoCode: z.string().trim().optional().nullable(),
  preorders: z.array(preorderItemSchema).max(50).default([]),
  ticketPreorders: z.array(z.object({ ticketIndex: z.number().int().min(0).max(49), items: z.array(preorderItemSchema).max(50) })).max(50).default([]),
  cancellationProtection: z.boolean().default(false),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  const requestHost = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const requestProto = req.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  const site = process.env.NODE_ENV === 'production' ? SITE : requestHost ? `${requestProto}://${requestHost}` : new URL(req.url).origin

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })
  const { eventId, placeId, qty, isTable, promoCode, preorders, ticketPreorders, cancellationProtection } = parsed.data

  await getDb()
  const event = await Event.findById(eventId).lean()
  if (!event) return NextResponse.json({ error: 'event_not_found' }, { status: 404 })
  if (event.currency !== 'XOF') return NextResponse.json({ error: 'benin_xof_launch_scope_required' }, { status: 400 })

  const orderResult = await createOrder({
    userId: session.user.id,
    eventId,
    placeId,
    qty,
    isTable,
    promoCode,
    preorders,
    ticketPreorders,
    rail: 'fedapay',
    cancellationProtection,
  })
  if (!orderResult.ok) return NextResponse.json({ error: orderResult.error }, { status: orderResult.status })
  const order = orderResult.order
  const orderId = order._id.toString()

  const seatCount = isTable ? 1 : qty
  const preorderTotal = order.preorders.reduce((s, p) => s + p.price * p.qty, 0)
  const amountTotal = order.unitPriceMinor * seatCount + preorderTotal + order.feeMinor + order.cancellationProtectionFeeMinor
  const sellerShare = sellerShareForOrder({
    unitPriceMinor: order.unitPriceMinor,
    seatCount,
    preorderTotalMinor: preorderTotal,
    cancellationProtectionFeeMinor: order.cancellationProtectionFeeMinor,
  })

  if (amountTotal <= 0) {
    await releaseOrder(orderId, session.user.id)
    return NextResponse.json({ error: 'nothing_to_pay' }, { status: 400 })
  }
  if (amountTotal < MIN_XOF) {
    await releaseOrder(orderId, session.user.id)
    return NextResponse.json({ error: 'amount_below_minimum' }, { status: 400 })
  }
  if (order.sellerUid && !order.fedapaySubAccountReference && process.env.NODE_ENV === 'production') {
    await releaseOrder(orderId, session.user.id)
    return NextResponse.json({ error: 'fedapay_marketplace_account_required' }, { status: 409 })
  }

  if (!isFedapayConfigured() && process.env.NODE_ENV !== 'production') {
    const transactionId = `dev_fedapay_${orderId}`
    await Order.updateOne({ _id: orderId }, { $set: { fedapayTxnId: transactionId } })
    const fulfillment = await fulfillOrder(orderId, { rail: 'fedapay', paidAmountMinor: amountTotal })
    if (fulfillment.status !== 'ok' && fulfillment.status !== 'already_processed') {
      console.error('[checkout/fedapay][dev] simulated fulfillment failed:', fulfillment.status)
      await releaseOrder(orderId, session.user.id)
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
      description: `${event.name} — ${order.placeType}`.slice(0, 200),
      amount: amountTotal,
      callbackUrl: `${site}/payment-success`,
      customer: session.user.email ? { email: session.user.email } : null,
      metadata: { orderId },
      reference: orderId,
      subAccountsCommissions: fedapayMarketplaceCommissions(order.fedapaySubAccountReference, sellerShare),
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

// Vérification côté /paiement-reussi (retour FedaPay — callback_url unique,
// pas de order_id porté dans l'URL). Miroir du GET de /api/checkout (Stripe) :
// on relit le statut chez FedaPay (source de vérité, jamais le query param
// seul) puis on rapproche via Order.fedapayTxnId.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const url = new URL(req.url)
  const txnId = url.searchParams.get('id')
  if (!txnId) return NextResponse.json({ error: 'missing_id' }, { status: 400 })

  await getDb()
  const order = await Order.findOne({ fedapayTxnId: String(txnId) }).lean()
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (order.userId !== session.user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let txn
  try {
    txn = await getTransaction(txnId)
  } catch (err) {
    console.error('[checkout/fedapay][GET] transaction lookup failed:', err)
    return NextResponse.json({ error: 'fedapay_error' }, { status: 502 })
  }

  const event = await Event.findById(order.eventId).select('name').lean()
  const tickets =
    order.status === 'paid'
      ? await Ticket.find({ orderId: order._id.toString(), userId: session.user.id }).select('ticketCode').lean()
      : []

  return NextResponse.json({
    paid: txn.status === 'approved' || order.status === 'paid',
    paymentStatus: txn.status,
    orderId: order._id.toString(),
    orderStatus: order.status,
    eventId: order.eventId,
    eventName: event?.name || '',
    ticketCount: tickets.length,
  })
}
