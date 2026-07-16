import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { payTicketOrders } from '@/lib/server/eventOrders'

// Remplace api/event-stock.js (encaissement au bar — cash/carte, PAS Stripe).
// Rang ≥ 2 (serveur/manager/propriétaire) requis — voir lib/server/eventOrders.ts.
const bodySchema = z.object({
  eventId: z.string().min(1),
  ticketId: z.string().min(1),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await payTicketOrders({ id: session.user.id }, parsed.data)

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, total: result.total, itemCount: result.itemCount })
}
