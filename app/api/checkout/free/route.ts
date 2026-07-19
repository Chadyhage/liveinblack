import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/auth'
import { freeCheckout } from '@/lib/server/freeCheckout'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import { verifyEventUnlockToken, unlockCookieName } from '@/lib/server/eventUnlock'

// Remplace la branche "ÉVÉNEMENT GRATUIT" de src/pages/EventDetailPage.jsx
// (confirmBooking(), création directe côté client) — ici entièrement
// serveur-autoritaire (lib/server/freeCheckout.ts), synchrone, sans passer
// par Stripe/FedaPay. Jamais de code promo ici : cf. commentaire en tête de
// freeCheckout.ts.
const bodySchema = z.object({
  eventId: z.string().min(1),
  placeId: z.string().min(1),
  qty: z.number().int().min(1).max(20).default(1),
  isTable: z.boolean().default(false),
  preorders: z.array(z.object({ name: z.string().min(1), qty: z.number().int().min(0).max(50) })).default([]),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })
  const { eventId, placeId, qty, isTable, preorders } = parsed.data

  await getDb()
  const event = await Event.findById(eventId).lean()
  if (!event) return NextResponse.json({ error: 'event_not_found' }, { status: 404 })

  let privateAccessVerified = false
  if (event.isPrivate) {
    const cookieStore = await cookies()
    privateAccessVerified = verifyEventUnlockToken(eventId, cookieStore.get(unlockCookieName(eventId))?.value)
  }

  const result = await freeCheckout({
    userId: session.user.id,
    eventId,
    placeId,
    qty,
    isTable,
    preorders,
    privateAccessVerified,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  // Le billet est déjà émis à ce stade (synchrone) — le client redirige
  // directement vers /payment-success avec order_id, qui reconnaît le rail
  // 'free' et affiche l'état "success" sans jamais interroger Stripe/FedaPay
  // (voir GET /api/checkout ci-dessous).
  return NextResponse.json({ orderId: result.orderId, eventId: result.eventId, ticketCodes: result.ticketCodes })
}
