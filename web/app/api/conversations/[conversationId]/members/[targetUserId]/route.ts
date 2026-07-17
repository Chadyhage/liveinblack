import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { removeMember } from '@/lib/server/groups'

// Retire un membre d'un groupe — réservé aux admins, voir lib/server/groups.ts
// (removeMember). Se retirer SOI-MÊME passe par POST /leave, pas cette route.
export async function DELETE(_req: Request, { params }: { params: Promise<{ conversationId: string; targetUserId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId, targetUserId } = await params
  const result = await removeMember({ id: session.user.id }, { conversationId, userId: targetUserId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
