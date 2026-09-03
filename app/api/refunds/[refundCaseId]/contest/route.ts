import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { auditContextFromRequest, contestDeclaredRefund } from '@/lib/server/refunds/refundCases'

const bodySchema = z.object({ reason: z.string().trim().max(1000).default('') })

export async function POST(req: Request, { params }: { params: Promise<{ refundCaseId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const { refundCaseId } = await params
  const result = await contestDeclaredRefund(session.user.id, refundCaseId, parsed.data.reason, auditContextFromRequest(req))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
