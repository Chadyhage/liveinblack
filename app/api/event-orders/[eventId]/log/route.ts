import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getOrderLog } from '@/lib/server/eventOrders'

// Lecture SEULE du journal d'audit (ferme l'audit H14 — aucune route
// n'expose d'écriture directe dans ce journal, toute mutation passe par
// lib/server/eventOrders.ts qui pousse elle-même son entrée). Réservée au
// rang 3 (propriétaire/créateur de l'événement ou rôle roster 'manager').
export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await getOrderLog({ id: session.user.id }, { eventId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, entries: result.entries })
}
