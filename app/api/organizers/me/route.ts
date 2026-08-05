import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getOrCreateMyOrganizerProfile, updateOrganizerProfile } from '@/lib/server/organizerProfile'
import { SOCIAL_NETWORKS } from '@/lib/shared/social'

const socialLinksSchema = z
  .object(Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n.key, z.string()])) as Record<(typeof SOCIAL_NETWORKS)[number]['key'], z.ZodString>)
  .partial()

const updateSchema = z.object({
  publicName: z.string().optional(),
  slug: z.string().optional(),
  city: z.string().optional(),
  zonesIntervention: z.array(z.string()).optional(),
  shortDescription: z.string().max(500).optional(),
  socialLinks: socialLinksSchema.optional(),
  status: z.enum(['draft', 'public']).optional(),
})

function requireOrganizerRole(role: string | undefined) {
  return role === 'organisateur' || role === 'agent'
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireOrganizerRole(session.user.activeRole)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const result = await getOrCreateMyOrganizerProfile({ id: session.user.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, profile: result.profile })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireOrganizerRole(session.user.activeRole)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = updateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await updateOrganizerProfile({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, profile: result.profile })
}
