import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { listUsersForAgent, type UsersRoleFilter, type UsersStatusFilter } from '@/lib/server/agent/agentUsers'
import { parsePage, parsePageSize } from '@/lib/shared/pagination'

const ROLES: UsersRoleFilter[] = ['client', 'organisateur', 'prestataire', 'agent']
const STATUSES: UsersStatusFilter[] = ['active', 'pending', 'rejected', 'disabled']

export async function GET(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const roleParam = url.searchParams.get('role')
  const statusParam = url.searchParams.get('status')
  const search = url.searchParams.get('search') ?? undefined
  const onlineOnly = url.searchParams.get('online') === '1'
  const page = parsePage(url.searchParams.get('page'), 1, { min: 1, max: 4000 })
  const pageSize = parsePageSize(url.searchParams.get('pageSize'), 25, { min: 10, max: 100 })

  const role = roleParam && ROLES.includes(roleParam as UsersRoleFilter) ? (roleParam as UsersRoleFilter) : undefined
  const status = statusParam && STATUSES.includes(statusParam as UsersStatusFilter) ? (statusParam as UsersStatusFilter) : undefined

  const users = await listUsersForAgent({ role, status, search, onlineOnly, page, pageSize })
  return NextResponse.json({ ok: true, ...users })
}
