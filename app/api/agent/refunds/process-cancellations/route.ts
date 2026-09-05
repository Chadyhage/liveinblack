import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { processPendingEventCancellationRefundBatches } from '@/lib/server/refunds/refundCases'

const bodySchema = z.object({
  batchSize: z.number().int().min(1).max(250).optional(),
  eventLimit: z.number().int().min(1).max(50).optional(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await processPendingEventCancellationRefundBatches(session!.user!.id, parsed.data)
  return NextResponse.json(result)
}
