import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { sellTicketOnSite } from '@/lib/server/agentSales'

const bodySchema = z.object({
  placeId: z.string().min(1),
  qty: z.number().int().min(1).max(20).default(1),
  isTable: z.boolean().default(false),
  guestName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email().optional(),
  contactPhone: z.string().trim().max(30).optional(),
  method: z.enum(['cash', 'momo']),
  momoMode: z.enum(['mtn', 'moov', 'mtn_ci', 'moov_tg']).optional(),
  momoPhone: z.object({ number: z.string().min(4), country: z.string().min(2) }).optional(),
  settlementMode: z.enum(['instant_debit', 'agent_settles']).optional(),
  preorders: z.array(z.object({ name: z.string().min(1), qty: z.number().int().min(1).max(50) })).max(50).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { eventId } = await params
  const result = await sellTicketOnSite({ id: session.user.id }, eventId, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
