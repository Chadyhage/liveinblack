import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { materializeTicketOrders } from '@/lib/server/eventOrders'

// Remplace legacy `ensurePreordersMaterialized`/`ensureIncludedMaterialized`.
// Copie dans EventOrder.items les précommandes déjà payées au checkout et les
// items "inclus" de la place du billet, de façon idempotente. Rang ≥ 1
// (staff) requis — voir lib/server/eventOrders.ts.
const bodySchema = z.object({
  eventId: z.string().min(1),
  ticketId: z.string().min(1),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await materializeTicketOrders({ id: session.user.id }, parsed.data)

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, inserted: result.inserted })
}
