import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getPlaylist } from '@/lib/server/playlist'

// Lecture de la playlist d'un événement — accessible à tout appelant
// authentifié (pas de gating de participation pour VOIR, voir
// lib/server/playlist.ts). Renvoie aussi le contexte propre à l'appelant
// (canModerate/songsRemaining/likesRemaining/isCheckedIn) pour éviter des
// allers-retours supplémentaires côté client.
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await getPlaylist({ id: session.user.id, roles: session.user.roles }, { eventId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({
    ok: true,
    songs: result.songs,
    nowPlaying: result.nowPlaying,
    canModerate: result.canModerate,
    songsRemaining: result.songsRemaining,
    likesRemaining: result.likesRemaining,
    isCheckedIn: result.isCheckedIn,
  })
}
