import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { removeOwnSong } from '@/lib/server/playlist'

// Suppression d'un son par son PROPRE auteur (participant) — distinct de
// DELETE .../songs/[songId] (réservé à la modération DJ, canModeratePlaylist).
// Voir lib/server/playlist.ts (removeOwnSong) : ownership vérifiée à la fois
// en lecture et dans le filtre Mongo atomique de la suppression elle-même.
export async function DELETE(_req: Request, { params }: { params: Promise<{ eventId: string; songId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId, songId } = await params
  const result = await removeOwnSong({ id: session.user.id, roles: session.user.roles }, { eventId, songId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
