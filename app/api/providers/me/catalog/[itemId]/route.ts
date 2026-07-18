import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { updateCatalogItem, deleteCatalogItem } from '@/lib/server/providerProfile'

const patchSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  price: z.number().nullable().optional(),
  currency: z.string().optional(),
  unit: z.string().optional(),
  category: z.string().optional(),
  available: z.boolean().optional(),
})

function requireProviderRole(roles: string[] | undefined) {
  return Boolean(roles?.includes('prestataire'))
}

export async function PATCH(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { itemId } = await params
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await updateCatalogItem({ id: session.user.id }, itemId, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, profile: result.profile })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { itemId } = await params
  const result = await deleteCatalogItem({ id: session.user.id }, itemId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, profile: result.profile })
}
