import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { listEventsForAgent, type AgentEventStatus } from '@/lib/server/agent/agentEvents'
import { parsePage, parsePageSize } from '@/lib/shared/pagination'

const STATUSES: AgentEventStatus[] = ['upcoming', 'past', 'cancelled']

export async function GET(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const statusParam = url.searchParams.get('status')
  const search = url.searchParams.get('search') ?? undefined
  const page = parsePage(url.searchParams.get('page'), 1, { min: 1, max: 4000 })
  const pageSize = parsePageSize(url.searchParams.get('pageSize'), 15, { min: 8, max: 50 })

  const status = statusParam === 'all' || (statusParam && STATUSES.includes(statusParam as AgentEventStatus)) ? (statusParam as 'all' | AgentEventStatus) : undefined

  const events = await listEventsForAgent({ status, search, page, pageSize })
  return NextResponse.json({ ok: true, ...events })
}
