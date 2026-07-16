import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { addOrderItem } from '@/lib/server/eventOrders'

// Remplace api/event-stock.js (action 'order', création de ligne). Voir
// lib/server/eventOrders.ts pour le modèle d'autorisation par rang complet et
// la fermeture de la lacune legacy "not_your_ticket" (rang 0 ne peut créer
// une ligne que sur son propre billet).
const bodySchema = z.object({
  eventId: z.string().min(1),
  ticketId: z.string().min(1),
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(1),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await addOrderItem({ id: session.user.id }, parsed.data)

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, item: result.item })
}
