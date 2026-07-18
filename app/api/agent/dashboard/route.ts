import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { getAgentDashboardStats } from '@/lib/server/agentDashboard'

export async function GET() {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const stats = await getAgentDashboardStats()
  return NextResponse.json({ ok: true, stats })
}
