import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { listUsersForAgent, type UsersRoleFilter, type UsersStatusFilter } from '@/lib/server/agentUsers'

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

  const role = roleParam && ROLES.includes(roleParam as UsersRoleFilter) ? (roleParam as UsersRoleFilter) : undefined
  const status = statusParam && STATUSES.includes(statusParam as UsersStatusFilter) ? (statusParam as UsersStatusFilter) : undefined

  const users = await listUsersForAgent({ role, status, search, onlineOnly })
  return NextResponse.json({ ok: true, users })
}
