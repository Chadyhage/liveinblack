import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { auditContextFromRequest, switchCashPickupToIndividual } from '@/lib/server/refunds/refundCases'

export async function POST(req: Request, { params }: { params: Promise<{ refundCaseId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { refundCaseId } = await params
  const result = await switchCashPickupToIndividual(session.user.id, refundCaseId, auditContextFromRequest(req))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
