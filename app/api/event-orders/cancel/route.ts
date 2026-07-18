import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { cancelOrderItem } from '@/lib/server/eventOrders'

// Remplace api/event-stock.js (annulation d'une ligne). Rang = 3 exactement
// (propriétaire/créateur de l'événement ou rôle roster 'manager') requis, et
// un motif non vide — voir lib/server/eventOrders.ts.
const bodySchema = z.object({
  eventId: z.string().min(1),
  itemId: z.string().min(1),
  reason: z.string().min(1),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await cancelOrderItem({ id: session.user.id }, parsed.data)

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  if (result.noop) return NextResponse.json({ ok: true, noop: true })
  return NextResponse.json({ ok: true, item: result.item })
}
