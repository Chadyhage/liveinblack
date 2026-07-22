import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/mongoose'
import { verifyWebhookSignature, isApprovedTransactionEvent } from '@/lib/server/fedapayClient'
import { fulfillOrder } from '@/lib/server/fulfillOrder'
import { releaseOrder } from '@/lib/server/orders'
import { handleFedapaySubscriptionPayment } from '@/lib/server/providerSubscriptions'
import Order from '@/lib/models/Order'
import User from '@/lib/models/User'
import { reconcileEventPayout } from '@/lib/server/eventPayouts'

// Remplace la branche `webhook()` de api/fedapay.js (rail XOF). Miroir de
// /api/webhooks/stripe — même cœur de finalisation partagé (fulfillOrder),
// mais avec la vérification de montant supplémentaire propre à FedaPay
// (voir lib/server/fulfillOrder.ts, opts.paidAmountMinor).
type FedapayWebhookBody = {
  name: string
  entity: { id: number | string; status?: string; amount?: number }
}

function isFedapayWebhookBody(value: unknown): value is FedapayWebhookBody {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { name?: unknown; entity?: { id?: unknown } }
  return (
    typeof candidate.name === 'string' &&
    Boolean(candidate.entity) &&
    (typeof candidate.entity?.id === 'string' || typeof candidate.entity?.id === 'number')
  )
}

export async function POST(req: Request) {
  const secret = process.env.FEDAPAY_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 })

  const rawBody = await req.text()
  const signature = req.headers.get('x-fedapay-signature')
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!isFedapayWebhookBody(parsed)) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }
  const body = parsed

  await getDb()

  try {
    const { name, entity } = body
    if (name.startsWith('payout.')) {
      const payout = await reconcileEventPayout(entity.id, entity.status)
      return NextResponse.json({ received: true, payout })
    }

    if (isApprovedTransactionEvent(name, entity)) {
      // Un paiement approuvé peut être un BILLET ou un ABONNEMENT prestataire :
      // on regarde le registre serveur (User.pendingFedapaySubTxnId) plutôt que
      // les métadonnées brutes de l'événement pour router vers le bon traitement
      // (même prudence que le legacy fedapay_txns.kind).
      const pendingSubUser = await User.findOne({ pendingFedapaySubTxnId: String(entity.id) }).select('_id').lean()
      if (pendingSubUser) {
        await handleFedapaySubscriptionPayment(pendingSubUser._id.toString(), entity)
        return NextResponse.json({ received: true })
      }

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
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[webhooks/fedapay] handler error:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
