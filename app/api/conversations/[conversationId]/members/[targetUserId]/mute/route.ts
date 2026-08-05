import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { muteMember, unmuteMember } from '@/lib/server/groups'

// Mise en sourdine / levée de sourdine d'un membre de groupe par un admin —
// voir lib/server/groups.ts (muteMember/unmuteMember). La cible vient du
// paramètre de route, jamais du body. `durationMs: null` = sourdine
// indéfinie ("jusqu'à réactivation") — voir GROUP_MUTE_DURATIONS (legacy
// MessagingPage.jsx : 15 min / 1 h / 8 h / 24 h / 7 jours / indéfini).
const bodySchema = z.object({ durationMs: z.number().positive().nullable() })

export async function POST(req: Request, { params }: { params: Promise<{ conversationId: string; targetUserId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId, targetUserId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await muteMember({ id: session.user.id }, { conversationId, targetUserId, durationMs: parsed.data.durationMs })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, untilAtMs: result.untilAtMs })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ conversationId: string; targetUserId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId, targetUserId } = await params
  const result = await unmuteMember({ id: session.user.id }, { conversationId, targetUserId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
