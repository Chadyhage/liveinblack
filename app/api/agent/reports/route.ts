import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { listReportsForAgent } from '@/lib/server/agentReports'

export async function GET(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const statusParam = url.searchParams.get('status')
  const status = statusParam === 'open' || statusParam === 'handled' ? statusParam : undefined

  const reports = await listReportsForAgent({ status })
  return NextResponse.json({ ok: true, reports })
}
