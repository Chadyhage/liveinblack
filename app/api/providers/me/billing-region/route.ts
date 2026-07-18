import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getProviderBillingContext, setProviderBillingRegion } from '@/lib/server/providerBilling'

function requireProviderRole(roles: string[] | undefined) {
  return Boolean(roles?.includes('prestataire'))
}

const bodySchema = z.object({ billingRegionId: z.string().min(1) })

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const context = await getProviderBillingContext({ id: session.user.id })
  return NextResponse.json({ ok: true, ...context })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await setProviderBillingRegion({ id: session.user.id }, parsed.data.billingRegionId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, ...result.context })
}
