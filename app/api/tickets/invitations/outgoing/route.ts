import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listOutgoingSeatInvitations } from '@/lib/server/seatAssignment'

// Invitations de siège EN ATTENTE émises par l'appelant en tant qu'hôte, pour
// les tickets passés en query (?ticketCodes=A,B,C) — alimente le 3ème état
// (invitation envoyée, en attente de réponse) de TableHostPanel dans le
// portefeuille de billets (#6 phase profil). Voir lib/server/seatAssignment.ts.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ticketCodes = (searchParams.get('ticketCodes') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const result = await listOutgoingSeatInvitations({ id: session.user.id }, ticketCodes)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, invitations: result.invitations })
}
