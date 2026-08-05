import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { adminCancelEvent } from '@/lib/server/agentEvents'

const bodySchema = z.object({ message: z.string().trim().max(500).default('') })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const { id } = await params
  const result = await adminCancelEvent({ id: session!.user!.id }, id, parsed.data.message)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, refundedCount: result.refundedCount, refundFailedCount: result.refundFailedCount })
}
