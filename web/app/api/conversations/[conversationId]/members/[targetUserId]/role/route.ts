import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { setMemberRole } from '@/lib/server/groups'

// Promeut/rétrograde un membre — réservé aux admins, voir lib/server/groups.ts
// (setMemberRole). Refuse de retirer le DERNIER admin (garde ajoutée
// au-delà du legacy, voir groups.ts).
const bodySchema = z.object({ role: z.enum(['admin', 'member']) })

export async function POST(req: Request, { params }: { params: Promise<{ conversationId: string; targetUserId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId, targetUserId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await setMemberRole({ id: session.user.id }, { conversationId, userId: targetUserId, role: parsed.data.role })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
