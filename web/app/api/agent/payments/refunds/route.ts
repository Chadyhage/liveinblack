import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { listRefundAlertsForAgent } from '@/lib/server/agentPayments'

export async function GET() {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const refunds = await listRefundAlertsForAgent()
  return NextResponse.json({ ok: true, refunds })
}
