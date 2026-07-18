import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { inviteToSeat } from '@/lib/server/seatAssignment'

// Remplace api/tickets.js (action 'assign'). Seul l'hôte d'une place de
// groupe (table) peut INVITER un invité déjà inscrit à occuper l'un de ses
// sièges — voir lib/server/seatAssignment.ts pour le cycle complet
// invite/accept/decline (#37). Cette route ne lie plus jamais directement le
// siège : elle crée une invitation en attente, que seule la cible peut
// accepter (POST /api/tickets/invitations/accept) ou décliner (POST
// /api/tickets/invitations/decline). Le check "1 place de groupe par compte
// et par événement" n'est volontairement PAS évalué ici (voir en-tête de
// seatAssignment.ts) : l'hôte ne peut donc jamais apprendre, via cette
// réponse, que la cible tient déjà un siège ailleurs sur le même événement.
const bodySchema = z.object({
  ticketCode: z.string().min(1),
  targetEmail: z.string().min(1).email(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await inviteToSeat({ id: session.user.id }, { ticketCode: parsed.data.ticketCode, targetEmail: parsed.data.targetEmail })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, invitation: result.invitation })
}
