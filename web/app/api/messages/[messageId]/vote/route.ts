import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { voteOnPoll } from '@/lib/server/polls'

// Vote (ou dé-vote / changement de vote) sur un message de type 'poll' OU
// 'event_poll' — même endpoint pour les deux, voteOnPoll applique le garde
// combiné (voir lib/server/polls.ts). Toute la logique d'atomicité/course
// est portée serveur ; cette route ne fait que la validation d'enveloppe et
// le mapping résultat -> HTTP.
const bodySchema = z.object({ optionId: z.string().min(1) })

export async function POST(req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { messageId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await voteOnPoll({ id: session.user.id }, { messageId, optionId: parsed.data.optionId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, options: result.options })
}
