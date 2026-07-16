import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { deleteGroup } from '@/lib/server/groups'

// Suppression d'un groupe par un de ses admins — voir lib/server/groups.ts
// (deleteGroup). Réservé aux conversations de type 'group' : une conversation
// directe échoue avec le même 404 générique qu'une conversation inexistante
// (voir loadGroupConversation dans groups.ts).
export async function DELETE(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const result = await deleteGroup({ id: session.user.id }, { conversationId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
