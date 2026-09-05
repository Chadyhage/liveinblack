import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { listPayoutMomos, updatePayoutMomos } from '@/lib/server/organizer/organizerPayoutMomos'

const bodySchema = z.object({
  momos: z.record(z.string(), z.string()),
  fedapaySubAccountReference: z.string().trim().max(120).optional().nullable(),
})

function requireOrganizerRole(role: string | undefined) {
  return role === 'organisateur' || role === 'agent'
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireOrganizerRole(session.user.activeRole)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const result = await listPayoutMomos({ id: session.user.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, momos: result.momos, fedapaySubAccountReference: result.fedapaySubAccountReference })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireOrganizerRole(session.user.activeRole)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await updatePayoutMomos({ id: session.user.id }, parsed.data.momos, parsed.data.fedapaySubAccountReference)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, momos: result.momos, fedapaySubAccountReference: result.fedapaySubAccountReference, rearmedCount: result.rearmedCount })
}
