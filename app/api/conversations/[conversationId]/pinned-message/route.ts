import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { pinMessage, unpinMessage } from '@/lib/server/groups'

// Épingle/désépingle un MESSAGE dans un groupe — réservé aux admins, voir
// lib/server/groups.ts (pinMessage/unpinMessage).
const bodySchema = z.object({ messageId: z.string().min(1) })

export async function POST(req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await pinMessage({ id: session.user.id }, { conversationId, ...parsed.data })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { conversationId } = await params
  const result = await unpinMessage({ id: session.user.id }, { conversationId })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
