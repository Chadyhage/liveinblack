import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { cancelSeatInvitation } from '@/lib/server/seatAssignment'

// Annulation par l'hôte d'une invitation de siège encore EN ATTENTE (avant
// que la cible n'ait répondu) — voir lib/server/seatAssignment.ts (#37).
const bodySchema = z.object({
  ticketCode: z.string().min(1),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await cancelSeatInvitation({ id: session.user.id }, { ticketCode: parsed.data.ticketCode })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, invitation: result.invitation })
}
