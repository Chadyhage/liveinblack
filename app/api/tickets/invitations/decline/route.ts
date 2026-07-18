import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { declineSeatInvitation } from '@/lib/server/seatAssignment'

// Refus par la CIBLE d'une invitation de siège — ne touche jamais au
// Ticket : le siège reste détenu par l'hôte — voir
// lib/server/seatAssignment.ts (#37).
const bodySchema = z.object({
  invitationId: z.string().min(1),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await declineSeatInvitation({ id: session.user.id }, { invitationId: parsed.data.invitationId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, invitation: result.invitation })
}
