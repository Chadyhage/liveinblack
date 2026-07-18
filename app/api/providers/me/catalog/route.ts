import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { addCatalogItem } from '@/lib/server/providerProfile'

const addSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().nullable().optional(),
  currency: z.string().optional(),
  unit: z.string().optional(),
  category: z.string().optional(),
})

function requireProviderRole(roles: string[] | undefined) {
  return Boolean(roles?.includes('prestataire'))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = addSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await addCatalogItem({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, profile: result.profile })
}
