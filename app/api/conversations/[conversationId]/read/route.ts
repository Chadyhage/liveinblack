import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { markConversationRead } from '@/lib/server/messaging'

// Marque la conversation comme lue par l'appelant jusqu'à maintenant — aucun
// corps de requête, tout vient de la session + du paramètre de route.
export async function POST(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const result = await markConversationRead({ id: session.user.id }, { conversationId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
