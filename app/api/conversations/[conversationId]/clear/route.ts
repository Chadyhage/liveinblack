import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { clearHistoryForMe } from '@/lib/server/messaging'

// "Vider l'historique" (panneau contact) — masque tous les messages
// existants pour l'appelant seul. Voir lib/server/messaging.ts (clearHistoryForMe).
export async function POST(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const result = await clearHistoryForMe({ id: session.user.id }, { conversationId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
