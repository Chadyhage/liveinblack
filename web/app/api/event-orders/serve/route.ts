import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { serveOrderItem } from '@/lib/server/eventOrders'

// Remplace api/event-stock.js (marquage "servi"). Rang ≥ 1 (scan/serveur/
// manager/propriétaire) requis — voir lib/server/eventOrders.ts.
const bodySchema = z.object({
  eventId: z.string().min(1),
  itemId: z.string().min(1),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await serveOrderItem({ id: session.user.id }, parsed.data)

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  if (result.alreadyServed) return NextResponse.json({ ok: true, alreadyServed: true })
  return NextResponse.json({ ok: true, item: result.item })
}
