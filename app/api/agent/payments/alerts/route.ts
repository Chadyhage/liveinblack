import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { listPaymentAlertsForAgent } from '@/lib/server/agent/agentPayments'

export async function GET() {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const alerts = await listPaymentAlertsForAgent()
  return NextResponse.json({ ok: true, alerts })
}
