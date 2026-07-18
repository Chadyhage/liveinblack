import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { listEventsForAgent, type AgentEventStatus } from '@/lib/server/agentEvents'

const STATUSES: AgentEventStatus[] = ['upcoming', 'past', 'cancelled']

export async function GET(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const statusParam = url.searchParams.get('status')
  const search = url.searchParams.get('search') ?? undefined

  const status = statusParam === 'all' || (statusParam && STATUSES.includes(statusParam as AgentEventStatus)) ? (statusParam as 'all' | AgentEventStatus) : undefined

  const events = await listEventsForAgent({ status, search })
  return NextResponse.json({ ok: true, events })
}
