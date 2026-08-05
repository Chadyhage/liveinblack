import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { forwardMessage } from '@/lib/server/messaging'

// Transfère un message vers une ou plusieurs conversations — voir
// lib/server/messaging.ts (forwardMessage) pour les gardes (appartenance,
// sourdine, blocage) appliquées à CHAQUE cible individuellement.
const bodySchema = z.object({ toConversationIds: z.array(z.string().min(1)).min(1).max(20) })

export async function POST(req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { messageId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await forwardMessage({ id: session.user.id }, { messageId, ...parsed.data })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, messages: result.messages })
}
