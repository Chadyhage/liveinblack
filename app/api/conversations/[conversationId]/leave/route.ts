import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { leaveGroup } from '@/lib/server/groups'

// Départ volontaire de l'appelant d'un groupe — voir lib/server/groups.ts
// (leaveGroup) pour la suppression du groupe s'il devient vide et
// l'auto-promotion d'un nouvel admin. Aucun corps de requête : tout vient de
// la session + du paramètre de route.
export async function POST(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const result = await leaveGroup({ id: session.user.id }, { conversationId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, deleted: result.deleted })
}
