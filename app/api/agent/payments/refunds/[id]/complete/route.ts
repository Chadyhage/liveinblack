import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { completeManualRefund } from '@/lib/server/agentPayments'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const agentName = [session!.user!.name].filter(Boolean).join(' ') || session!.user!.email || 'Agent'
  const result = await completeManualRefund({ id: session!.user!.id, name: agentName }, id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
