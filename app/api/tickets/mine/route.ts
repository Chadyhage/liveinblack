import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listMyTickets } from '@/lib/server/tickets'

// Portefeuille de billets de l'appelant, groupé par événement — voir
// lib/server/tickets.ts (listMyTickets). Utilisé pour rafraîchir le panneau
// après une mutation client (attribuer/reprendre un siège via
// /api/tickets/assign, qui reste la SEULE route de mutation — celle-ci ne
// fait que relire l'état à jour).
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const result = await listMyTickets(session.user.id)
  return NextResponse.json({ ok: true, groups: result.groups })
}
