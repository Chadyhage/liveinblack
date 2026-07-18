import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { revokeSeat } from '@/lib/server/seatAssignment'

// Remplace api/tickets.js (action 'revoke'). Rend un siège de table
// précédemment attribué à un invité — voir lib/server/seatAssignment.ts pour
// la logique complète (rotation systématique de l'entryNonce, cf. #79).
const bodySchema = z.object({
  ticketCode: z.string().min(1),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await revokeSeat({ id: session.user.id }, { ticketCode: parsed.data.ticketCode })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, ticket: result.ticket })
}
