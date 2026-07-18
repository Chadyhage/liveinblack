import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { startStripeConnectOnboarding } from '@/lib/server/organizerPayouts'

const bodySchema = z.object({ returnPath: z.string().optional() })

function requireOrganizerRole(role: string | undefined) {
  return role === 'organisateur' || role === 'agent'
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireOrganizerRole(session.user.activeRole)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const origin = new URL(req.url).origin
  const result = await startStripeConnectOnboarding({ id: session.user.id }, { origin, returnPath: parsed.data.returnPath })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  if ('manual' in result) return NextResponse.json({ ok: true, manual: true, country: result.country })
  return NextResponse.json({ ok: true, url: result.url })
}
