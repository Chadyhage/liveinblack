import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { createAgentRefundPoint, listAgentRefundPoints } from '@/lib/server/agent/refundPoints'

const bodySchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  city: z.string().trim().optional().default(''),
  active: z.boolean().optional().default(true),
  agentIds: z.array(z.string().trim().min(1)).optional().default([]),
})

export async function GET() {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const points = await listAgentRefundPoints()
  return NextResponse.json({ ok: true, points })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await createAgentRefundPoint(parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, point: result.point })
}
