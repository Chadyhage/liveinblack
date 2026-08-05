import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getAgentSalesDashboard } from '@/lib/server/agentSales'

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await getAgentSalesDashboard({ id: session.user.id }, eventId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, view: result.view })
}
