import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { hideConversationForMe } from '@/lib/server/messaging'

// Masque la conversation de la liste de l'appelant seul — voir
// lib/server/messaging.ts (hideConversationForMe).
export async function POST(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const result = await hideConversationForMe({ id: session.user.id }, { conversationId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
