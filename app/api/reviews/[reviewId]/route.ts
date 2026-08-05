import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { deleteOwnReview } from '@/lib/server/providerReviews'

// Remplace api/provider-reviews.js { action:'delete_own' } — seul l'auteur
// peut retirer son propre avis.
export async function DELETE(_req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { reviewId } = await params
  const result = await deleteOwnReview({ id: session.user.id }, reviewId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
