import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { removeSong } from '@/lib/server/playlist'

// Suppression d'un son par la modération — réservé à canModeratePlaylist, voir
// lib/server/playlist.ts.
export async function DELETE(_req: Request, { params }: { params: Promise<{ eventId: string; songId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId, songId } = await params
  const result = await removeSong({ id: session.user.id, roles: session.user.roles }, { eventId, songId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
