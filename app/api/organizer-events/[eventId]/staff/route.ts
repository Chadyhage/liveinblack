import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { addEventStaff, listEventStaff, removeEventStaff } from '@/lib/server/eventStaff'

const addSchema = z.object({ targetUserId: z.string().trim().min(1), role: z.enum(['scan', 'serveur', 'dj']) })
const removeSchema = z.object({ targetUserId: z.string().trim().min(1) })

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await listEventStaff({ id: session.user.id }, eventId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, members: result.members })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = addSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { eventId } = await params
  const result = await addEventStaff({ id: session.user.id }, eventId, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, member: result.member }, { status: 201 })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = removeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const { eventId } = await params
  const result = await removeEventStaff({ id: session.user.id }, eventId, parsed.data.targetUserId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, reassignedCount: result.reassignedCount })
}
