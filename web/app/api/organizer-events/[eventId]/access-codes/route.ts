import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { generateAccessCodes, listAccessCodes } from '@/lib/server/eventAccessCodes'

const bodySchema = z.object({ count: z.number().min(1).max(100) })

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await listAccessCodes({ id: session.user.id }, eventId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, codes: result.codes })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const { eventId } = await params
  const result = await generateAccessCodes({ id: session.user.id }, eventId, parsed.data.count)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, codes: result.codes }, { status: 201 })
}
