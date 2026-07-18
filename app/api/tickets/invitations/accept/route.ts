import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { acceptSeatInvitation } from '@/lib/server/seatAssignment'

// Acceptation par la CIBLE d'une invitation de siège — seul endroit où le
// siège est réellement lié (Ticket.userId/assignedTo) et où le check "1
// place de groupe par compte et par événement" est évalué ; son résultat
// n'est visible que de l'appelant (la cible), jamais de l'hôte — voir
// lib/server/seatAssignment.ts (#37).
const bodySchema = z.object({
  invitationId: z.string().min(1),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await acceptSeatInvitation({ id: session.user.id }, { invitationId: parsed.data.invitationId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, ticket: result.ticket })
}
