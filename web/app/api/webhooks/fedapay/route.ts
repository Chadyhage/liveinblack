import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/mongoose'
import { verifyWebhookSignature, isApprovedTransactionEvent } from '@/lib/server/fedapayClient'
import { fulfillOrder } from '@/lib/server/fulfillOrder'
import { releaseOrder } from '@/lib/server/orders'
import Order from '@/lib/models/Order'

// Remplace la branche `webhook()` de api/fedapay.js (rail XOF). Miroir de
// /api/webhooks/stripe — même cœur de finalisation partagé (fulfillOrder),
// mais avec la vérification de montant supplémentaire propre à FedaPay
// (voir lib/server/fulfillOrder.ts, opts.paidAmountMinor).
type FedapayWebhookBody = {
  name: string
  entity: { id: number | string; status?: string; amount?: number }
}

export async function POST(req: Request) {
  const secret = process.env.FEDAPAY_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 })

  const rawBody = await req.text()
  const signature = req.headers.get('x-fedapay-signature')
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  let body: FedapayWebhookBody
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  await getDb()

  try {
    const { name, entity } = body
    if (isApprovedTransactionEvent(name, entity)) {
      const order = await Order.findOne({ fedapayTxnId: String(entity.id) }).lean()
      if (!order) return NextResponse.json({ received: true, ignored: 'no_matching_order' })
      const result = await fulfillOrder(order._id.toString(), { rail: 'fedapay', paidAmountMinor: entity.amount })
      if (result.status === 'locked') {
        return NextResponse.json({ error: 'fulfillment_in_progress' }, { status: 500 })
      }
    } else if (
      name === 'transaction.canceled' ||
      name === 'transaction.declined' ||
      (name === 'transaction.updated' && ['canceled', 'declined', 'expired'].includes(entity.status || ''))
    ) {
      const order = await Order.findOne({ fedapayTxnId: String(entity.id) }).lean()
      if (order) await releaseOrder(order._id.toString(), null)
    }
    // Les événements `payout.*` sont traités par le module de versement
    // (lib/server/eventPayouts.ts) — non câblé sur ce webhook pour l'instant.

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[webhooks/fedapay] handler error:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
