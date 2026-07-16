import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { setSongStatus } from '@/lib/server/playlist'

// Changement de statut d'un son (pending/validated/refused/played) — réservé
// à la modération (canModeratePlaylist), voir lib/server/playlist.ts.
const bodySchema = z.object({
  status: z.enum(['pending', 'validated', 'refused', 'played']),
})

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string; songId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId, songId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await setSongStatus({ id: session.user.id, roles: session.user.roles }, { eventId, songId, status: parsed.data.status })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
