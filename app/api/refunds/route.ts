import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listParticipantRefundCases } from '@/lib/server/refunds/refundCases'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const refunds = await listParticipantRefundCases(session.user.id)
  return NextResponse.json({ ok: true, refunds })
}
