import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { deleteMessageForMe, deleteMessageForAll } from '@/lib/server/messaging'

// scope 'me' : masque le message pour l'appelant seul (n'importe quel
// participant). scope 'all' : remplace le message par "Message supprimé"
// pour tout le monde (propriétaire seul) — voir lib/server/messaging.ts.
const bodySchema = z.object({ scope: z.enum(['me', 'all']) })

export async function POST(req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { messageId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const caller = { id: session.user.id }
  const result = parsed.data.scope === 'all' ? await deleteMessageForAll(caller, { messageId }) : await deleteMessageForMe(caller, { messageId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
