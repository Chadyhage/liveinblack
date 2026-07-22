import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { sendUserVerificationEmail } from '@/lib/server/agentUsers'
import { checkRateLimit } from '@/lib/server/rateLimit'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { id } = await params
  const limit = await checkRateLimit({
    scope: 'agent-send-verification',
    identifier: `${session!.user!.id}:${id}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const result = await sendUserVerificationEmail(id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, sentTo: result.sentTo })
}
