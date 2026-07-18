import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { addCatalogItemMedia, removeCatalogItemMedia } from '@/lib/server/providerProfile'

const addSchema = z.object({ dataUri: z.string().min(1) })
const removeSchema = z.object({ mediaIndex: z.number().int().min(0) })

function requireProviderRole(roles: string[] | undefined) {
  return Boolean(roles?.includes('prestataire'))
}

export async function POST(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { itemId } = await params
  const parsed = addSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await addCatalogItemMedia({ id: session.user.id }, itemId, parsed.data.dataUri)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, profile: result.profile })
}

// DELETE avec corps JSON (pas de sous-route par index — les médias de
// catalogue n'ont pas d'id propre, seulement une position, voir
// lib/models/ProviderProfile.ts:catalogItemMediaSchema).
export async function DELETE(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  if (!requireProviderRole(session.user.roles)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { itemId } = await params
  const parsed = removeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await removeCatalogItemMedia({ id: session.user.id }, itemId, parsed.data.mediaIndex)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, profile: result.profile })
}
