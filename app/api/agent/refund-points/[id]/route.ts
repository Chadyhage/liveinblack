import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { updateAgentRefundPoint } from '@/lib/server/agent/refundPoints'

const bodySchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  city: z.string().trim().optional().default(''),
  active: z.boolean().optional().default(true),
  agentIds: z.array(z.string().trim().min(1)).optional().default([]),
})

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { id } = await params
  const result = await updateAgentRefundPoint(id, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, point: result.point })
}
