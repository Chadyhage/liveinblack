import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { muteMember, unmuteMember } from '@/lib/server/groups'

// Mise en sourdine / levée de sourdine d'un membre de groupe par un admin —
// voir lib/server/groups.ts (muteMember/unmuteMember). Aucun corps de
// requête : la cible vient du paramètre de route, jamais du body.
export async function POST(_req: Request, { params }: { params: Promise<{ conversationId: string; targetUserId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId, targetUserId } = await params
  const result = await muteMember({ id: session.user.id }, { conversationId, targetUserId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ conversationId: string; targetUserId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId, targetUserId } = await params
  const result = await unmuteMember({ id: session.user.id }, { conversationId, targetUserId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
