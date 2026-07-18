import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { listPendingPayoutsForAgent } from '@/lib/server/agentPayments'

export async function GET() {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const queue = await listPendingPayoutsForAgent()
  return NextResponse.json({ ok: true, ...queue })
}
