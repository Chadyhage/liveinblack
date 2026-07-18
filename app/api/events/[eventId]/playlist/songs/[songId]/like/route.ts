import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { toggleLike } from '@/lib/server/playlist'

// Bascule like/unlike — voir lib/server/playlist.ts (toggleLike) pour le
// refus de liker son propre son, le budget de 5 likes/événement (excluant les
// sons refusés, remboursement) et l'atomicité par $addToSet/$pull.
export async function POST(_req: Request, { params }: { params: Promise<{ eventId: string; songId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId, songId } = await params
  const result = await toggleLike({ id: session.user.id, roles: session.user.roles }, { eventId, songId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, liked: result.liked })
}
