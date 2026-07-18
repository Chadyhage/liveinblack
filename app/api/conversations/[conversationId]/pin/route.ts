import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { pinConversationForMe, unpinConversationForMe } from '@/lib/server/messaging'

// Épingler/désépingler UNE CONVERSATION dans la liste de l'appelant (jamais
// partagé entre participants) — à ne pas confondre avec /pinned-message, qui
// épingle un MESSAGE dans le fil pour tout le groupe. Voir
// lib/server/messaging.ts.
export async function POST(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const result = await pinConversationForMe({ id: session.user.id }, { conversationId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const result = await unpinConversationForMe({ id: session.user.id }, { conversationId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
