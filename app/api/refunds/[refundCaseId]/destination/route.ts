import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { auditContextFromRequest, submitIndividualRefundDestination } from '@/lib/server/refunds/refundCases'

const bodySchema = z.object({
  destinationType: z.enum(['bank_account', 'verified_mobile_money']),
  details: z.string().trim().min(4).max(2000),
})

export async function POST(req: Request, { params }: { params: Promise<{ refundCaseId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { refundCaseId } = await params
  const result = await submitIndividualRefundDestination(session.user.id, refundCaseId, parsed.data, auditContextFromRequest(req))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
