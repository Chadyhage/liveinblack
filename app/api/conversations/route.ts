import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { createDirectConversation, listMyConversations } from '@/lib/server/messaging'

// POST : ouvre (ou retrouve) une conversation directe avec `otherUserId` —
// voir lib/server/messaging.ts pour le find-or-create et le check de
// blocage à la création. GET : liste des conversations de l'appelant, avec
// unreadCount par conversation.
const bodySchema = z.object({ otherUserId: z.string().min(1) })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await createDirectConversation({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, conversation: result.conversation })
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const result = await listMyConversations({ id: session.user.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, conversations: result.conversations })
}
