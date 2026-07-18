import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getOrCreateMyProviderProfile, updateProviderProfile } from '@/lib/server/providerProfile'
import { SOCIAL_NETWORKS } from '@/lib/shared/social'

const socialLinksSchema = z
  .object(Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n.key, z.string()])) as Record<(typeof SOCIAL_NETWORKS)[number]['key'], z.ZodString>)
  .partial()

const updateSchema = z.object({
  name: z.string().optional(),
  headline: z.string().max(140).optional(),
  description: z.string().max(1000).optional(),
  city: z.string().optional(),
  regionId: z.string().optional(),
  zonesIntervention: z.array(z.string()).optional(),
  website: z.string().optional(),
  socialLinks: socialLinksSchema.optional(),
  prestataireTypes: z.array(z.string()).optional(),
  phone: z.string().optional(),
})

function requireProviderRole(roles: string[] | undefined) {
  return Boolean(roles?.includes('prestataire'))
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const result = await getOrCreateMyProviderProfile({ id: session.user.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, profile: result.profile })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = updateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await updateProviderProfile({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, profile: result.profile })
}
