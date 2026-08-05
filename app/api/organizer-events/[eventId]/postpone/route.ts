import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { postponeOrganizerEvent } from '@/lib/server/organizerEventLifecycle'

const bodySchema = z.object({ date: z.string().trim().min(1), time: z.string().trim().optional() })

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { eventId } = await params
  const result = await postponeOrganizerEvent({ id: session.user.id }, eventId, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
