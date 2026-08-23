import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { listReviewsForAgent } from '@/lib/server/provider/providerReviews'

export async function GET() {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const reviews = await listReviewsForAgent()
  return NextResponse.json({ ok: true, reviews })
}
