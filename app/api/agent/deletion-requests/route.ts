import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { listDeletionRequestsForAgent } from '@/lib/server/agentDeletion'

export async function GET() {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const requests = await listDeletionRequestsForAgent()
  return NextResponse.json({ ok: true, requests })
}
