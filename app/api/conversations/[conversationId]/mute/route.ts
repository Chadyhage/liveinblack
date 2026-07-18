import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { muteConversationForMe, unmuteConversationForMe } from '@/lib/server/messaging'

// Coupe/rétablit les NOTIFICATIONS d'une conversation pour l'appelant seul —
// à ne pas confondre avec /members/[targetUserId]/mute, qui empêche un
// membre de groupe d'ÉCRIRE (décidé par un admin). Voir lib/server/messaging.ts.
export async function POST(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const result = await muteConversationForMe({ id: session.user.id }, { conversationId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const result = await unmuteConversationForMe({ id: session.user.id }, { conversationId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
