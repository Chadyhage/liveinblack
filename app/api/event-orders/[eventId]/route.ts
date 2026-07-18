import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listOrdersForEvent, listOrdersForTicket } from '@/lib/server/eventOrders'

// Lecture des commandes sur place. `?ticketId=` présent → commandes d'UN
// billet (rang 0 autorisé si c'est le sien, ferme l'audit H15) ; absent →
// vue événement entière (staff, rang ≥ 1, uniquement) — voir
// lib/server/eventOrders.ts.
export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const ticketId = new URL(req.url).searchParams.get('ticketId')

  const result = ticketId
    ? await listOrdersForTicket({ id: session.user.id }, { eventId, ticketId })
    : await listOrdersForEvent({ id: session.user.id }, { eventId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, items: result.items })
}
