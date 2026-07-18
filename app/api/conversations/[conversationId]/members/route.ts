import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { addMember } from '@/lib/server/groups'

// Ajoute un membre à un groupe — réservé aux admins, voir
// lib/server/groups.ts (addMember).
const bodySchema = z.object({ userId: z.string().min(1) })

export async function POST(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await addMember({ id: session.user.id }, { conversationId, ...parsed.data })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, conversation: result.conversation })
}
