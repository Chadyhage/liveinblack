import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { listApplicationsForAgent, type ApplicationStatus } from '@/lib/server/applications'

const STATUSES: ApplicationStatus[] = ['draft', 'submitted', 'under_review', 'needs_changes', 'resubmitted', 'approved', 'rejected', 'suspended']

export async function GET(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const statusParam = url.searchParams.get('status')
  const typeParam = url.searchParams.get('type')
  const search = url.searchParams.get('search') ?? undefined

  const status = statusParam && STATUSES.includes(statusParam as ApplicationStatus) ? (statusParam as ApplicationStatus) : undefined
  const type = typeParam === 'organisateur' || typeParam === 'prestataire' ? typeParam : undefined

  const applications = await listApplicationsForAgent({ status, type, search })
  return NextResponse.json({ ok: true, applications })
}
