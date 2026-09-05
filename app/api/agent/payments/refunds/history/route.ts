import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { listCompletedCashRefundsForAgent } from '@/lib/server/agent/agentPayments'

export async function GET() {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const refunds = await listCompletedCashRefundsForAgent({ id: session!.user!.id })
  return NextResponse.json({ ok: true, refunds })
}
