import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/auth'
import { createOrder, releaseOrder } from '@/lib/server/orders'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import User from '@/lib/models/User'
import Order from '@/lib/models/Order'
import Ticket from '@/lib/models/Ticket'
import { verifyEventUnlockToken, unlockCookieName } from '@/lib/server/eventUnlock'
import stripe from '@/lib/server/stripeClient'

// Remplace api/checkout.js (Stripe, rail EUR). Corrige :
//  - C06 : les préco n'ont plus de prix côté client, résolues serveur dans
//    createOrder() depuis le menu de l'événement.
//  - H06 : URL de retour depuis PUBLIC_SITE_URL, jamais Origin/Host du client.
//  - H07 : createOrder() bloque déjà event annulé/terminé/non publié/privé
//    non déverrouillé.
//  - H08 : maxPerAccount appliqué serveur dans createOrder().
//  - H09 : clé d'idempotence Stripe = id de l'Order.
//  - H10 : email/nom pris de la session vérifiée, jamais du corps de requête.
const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

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
    rail: 'stripe',
    privateAccessVerified,
  })
  if (!orderResult.ok) return NextResponse.json({ error: orderResult.error }, { status: orderResult.status })
  const order = orderResult.order
  const orderId = order._id.toString()

  const seatCount = isTable ? 1 : qty
  const lineItems: Array<{
    price_data: { currency: string; product_data: { name: string }; unit_amount: number }
    quantity: number
  }> = []

  if (order.unitPriceMinor > 0) {
    lineItems.push({
      price_data: {
        currency: 'eur',
        product_data: {
          name: isTable ? `${event.name} — ${order.placeType} (table ${order.tableSeats} pers.)` : `${event.name} — ${order.placeType}`,
        },
        unit_amount: order.unitPriceMinor,
      },
      quantity: seatCount,
    })
  }

  for (const item of order.preorders) {
    lineItems.push({
      price_data: { currency: 'eur', product_data: { name: `${item.name} (précommande)` } , unit_amount: item.price },
      quantity: item.qty,
    })
  }

  if (order.feeMinor > 0) {
    lineItems.push({
      price_data: { currency: 'eur', product_data: { name: 'Frais de service LIVEINBLACK' }, unit_amount: order.feeMinor },
      quantity: 1,
    })
  }

  if (lineItems.length === 0) {
    await releaseOrder(orderId, session.user.id)
    return NextResponse.json({ error: 'nothing_to_pay' }, { status: 400 })
  }

  let paymentIntentData: { transfer_data: { destination: string }; application_fee_amount: number; metadata: Record<string, string> } | undefined
  if (order.connectMode === 'auto' && order.sellerUid && order.feeMinor > 0) {
    const seller = await User.findById(order.sellerUid).select('stripeAccountId').lean()
    if (seller?.stripeAccountId) {
      paymentIntentData = {
        transfer_data: { destination: seller.stripeAccountId },
        application_fee_amount: order.feeMinor,
        metadata: { sellerUid: order.sellerUid, feeCents: String(order.feeMinor) },
      }
    }
  }

  try {
    const stripeSession = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: lineItems,
        ...(paymentIntentData ? { payment_intent_data: paymentIntentData } : {}),
        customer_email: session.user.email || undefined,
        success_url: `${SITE}/payment-success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
        cancel_url: `${SITE}/events/${eventId}?paiement=annule`,
        metadata: { orderId },
        locale: 'fr',
      },
      { idempotencyKey: `checkout-${orderId}` }
    )

    await Order.updateOne({ _id: orderId }, { $set: { stripeSessionId: stripeSession.id } })

    return NextResponse.json({ url: stripeSession.url })
  } catch (err) {
    console.error('[checkout] Stripe session creation failed, releasing order:', err)
    await releaseOrder(orderId, session.user.id)
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 })
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const url = new URL(req.url)
  const sessionId = url.searchParams.get('session_id')
  // order_id : retour de app/api/checkout/free/route.ts (rail 'free', billet
  // déjà émis SYNCHRONE — jamais de session Stripe à relire pour ce cas).
  const orderId = url.searchParams.get('order_id')
  if (!sessionId && !orderId) return NextResponse.json({ error: 'missing_session_id' }, { status: 400 })

  await getDb()

  let order
  let paid: boolean
  let paymentStatus: string
  let amountTotal: number | null = null
  let currency: string | null = null

  if (sessionId) {
    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId)
    if (stripeSession.metadata?.orderId == null) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    order = await Order.findById(stripeSession.metadata.orderId).lean()
    paid = stripeSession.payment_status === 'paid'
    paymentStatus = stripeSession.payment_status
    amountTotal = stripeSession.amount_total
    currency = stripeSession.currency
  } else {
    order = await Order.findById(orderId).lean()
    // order_id n'est un identifiant valide que pour une commande rail='free'
    // — jamais un moyen détourné de relire une commande Stripe/FedaPay sans
    // passer par leur vérification respective.
    if (order && order.rail !== 'free') return NextResponse.json({ error: 'not_found' }, { status: 404 })
    paid = order?.status === 'paid'
    paymentStatus = paid ? 'paid' : order?.status || 'unknown'
  }

  if (!order || order.userId !== session.user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const event = await Event.findById(order.eventId).select('name').lean()
  const tickets =
    order.status === 'paid'
      ? await Ticket.find({ orderId: order._id.toString(), userId: session.user.id }).select('ticketCode').lean()
      : []

  return NextResponse.json({
    paid,
    paymentStatus,
    amountTotal,
    currency,
    orderStatus: order.status,
    eventName: event?.name || '',
    ticketCount: tickets.length,
  })
}
