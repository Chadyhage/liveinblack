import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { renameGroup } from '@/lib/server/groups'

// Renomme un groupe — réservé aux admins, voir lib/server/groups.ts (renameGroup).
const bodySchema = z.object({ name: z.string().min(1).max(100) })

export async function POST(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await renameGroup({ id: session.user.id }, { conversationId, ...parsed.data })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, name: result.name })
}
