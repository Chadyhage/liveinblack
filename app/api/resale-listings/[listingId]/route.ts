import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withdrawResaleListing } from '@/lib/server/events/resale'

// DELETE = retirer sa propre mise en vente (encore active) — jamais annuler
// une vente déjà conclue.
export async function DELETE(_req: Request, { params }: { params: Promise<{ listingId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { listingId } = await params
  const result = await withdrawResaleListing({ id: session.user.id }, listingId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
