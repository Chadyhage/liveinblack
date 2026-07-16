import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { playNow, stopNow } from '@/lib/server/playlist'

// Bannière "En ce moment" (partagée avec toute la salle) — poser/retirer est
// réservé à la modération (canModeratePlaylist), voir lib/server/playlist.ts.
// Ne change JAMAIS le statut du son lui-même (action distincte, voir
// setSongStatus).
const bodySchema = z.object({ songId: z.string().min(1) })

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await playNow({ id: session.user.id, roles: session.user.roles }, { eventId, songId: parsed.data.songId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await stopNow({ id: session.user.id, roles: session.user.roles }, { eventId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
