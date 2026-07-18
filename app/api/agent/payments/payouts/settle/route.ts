import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { markSellerBalancePaid } from '@/lib/server/agentPayments'

const bodySchema = z.object({
  sellerUid: z.string().trim().min(1),
  amount: z.number(),
  currency: z.enum(['EUR', 'XOF']),
  requestId: z.string().trim().min(1).optional().nullable(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const agentName = [session!.user!.name].filter(Boolean).join(' ') || session!.user!.email || 'Agent'
  const result = await markSellerBalancePaid({ id: session!.user!.id, name: agentName }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, paid: result.paid })
}
