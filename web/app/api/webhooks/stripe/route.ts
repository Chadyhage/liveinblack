import { NextResponse } from 'next/server'
import stripe from '@/lib/server/stripeClient'
import { getDb } from '@/lib/db/mongoose'
import { fulfillOrder } from '@/lib/server/fulfillOrder'
import { releaseOrder } from '@/lib/server/orders'
import { finalizeBoost } from '@/lib/server/finalizeBoost'
import { releaseBoostSlotIfPending } from '@/lib/server/boostSlots'
import User from '@/lib/models/User'
import type Stripe from 'stripe'

// Remplace api/stripe-webhook.js. FERME L'AUDIT C05 : ce handler ne fait
// JAMAIS confiance à un billet préexistant — toute la logique de décision
// (combien de billets, à quel prix) vit dans fulfillOrder()/l'Order créé
// avant paiement (lib/server/orders.ts).
export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 })
  if (!signature) return NextResponse.json({ error: 'missing_signature' }, { status: 400 })

  const rawBody = await req.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    console.error('[webhooks/stripe] signature verification failed:', err)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  await getDb()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.payment_status !== 'paid') break
        if (session.metadata?.intent === 'boost') {
          await finalizeBoost(session)
          break
        }
        const orderId = session.metadata?.orderId
        if (!orderId) break
        const result = await fulfillOrder(orderId, { rail: 'stripe' })
        if (result.status === 'locked') {
          // Stripe réessaiera cet événement plus tard — un autre traitement
          // (retry précédent) est en cours.
          return NextResponse.json({ error: 'fulfillment_in_progress' }, { status: 500 })
        }
        break
      }
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.metadata?.intent === 'boost' && session.metadata.slotId && session.metadata.boostId) {
          await releaseBoostSlotIfPending(session.metadata.slotId, session.metadata.boostId)
          break
        }
        const orderId = session.metadata?.orderId
        if (orderId) await releaseOrder(orderId, null)
        break
      }
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        const uid = account.metadata?.uid
        if (uid) {
          await User.updateOne(
            { _id: uid },
            {
              $set: {
                stripeAccountId: account.id,
                stripeChargesEnabled: account.charges_enabled === true,
                stripeCountry: account.country || null,
              },
            }
          )
        }
        break
      }
      default:
        break
    }
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[webhooks/stripe] handler error:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
