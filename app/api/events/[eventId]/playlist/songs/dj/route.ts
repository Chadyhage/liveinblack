import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { addSongAsDj } from '@/lib/server/playlist'

// Ajout d'un son par le DJ/l'équipe modératrice — auto-validé, sans quota ni
// gating de participation. Voir lib/server/playlist.ts (addSongAsDj,
// canModeratePlaylist) pour l'autorisation exacte (owner/agent/roster
// dj|manager).
const bodySchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().max(200).optional(),
  previewUrl: z.string().max(2000).nullable().optional(),
  cover: z.string().max(2000).nullable().optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await addSongAsDj({ id: session.user.id, roles: session.user.roles }, { eventId, ...parsed.data })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, song: result.song })
}
