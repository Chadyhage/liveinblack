import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { cancelOrganizerEvent } from '@/lib/server/organizerEventLifecycle'

const bodySchema = z.object({ message: z.string().trim().max(500).default('') })

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const { eventId } = await params
  const result = await cancelOrganizerEvent({ id: session.user.id }, eventId, parsed.data.message)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, refundedCount: result.refundedCount, refundFailedCount: result.refundFailedCount })
}
