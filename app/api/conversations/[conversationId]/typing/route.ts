import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { setTyping, getTypingUsers } from '@/lib/server/messaging'

// GET : qui d'autre est "en train d'écrire" (fenêtre glissante de 5s, jamais
// de websocket — cf. lib/server/messaging.ts). POST : signale/efface le
// statut de frappe de l'appelant, débounced côté client (~2.5s).
const bodySchema = z.object({ typing: z.boolean() })

export async function GET(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const result = await getTypingUsers({ id: session.user.id }, { conversationId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, users: result.users })
}

export async function POST(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await setTyping({ id: session.user.id }, { conversationId, ...parsed.data })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
