import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getProviderByUserId } from '@/lib/server/providers'
import { getPublishedReviews, getMyReviewFor } from '@/lib/server/providerReviews'

// Avis publics d'un prestataire + mon propre avis (s'il existe) — miroir de
// app/(public)/providers/[id]/page.tsx (getPublishedReviews + getMyReviewFor),
// utilisé par l'app mobile qui n'a pas d'équivalent SSR pour cette page.
export async function GET(req: Request, { params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params
  const session = await auth()

  const provider = await getProviderByUserId(providerId, session?.user ? { activeRole: session.user.activeRole, id: session.user.id } : null)
  if (!provider) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [reviews, myReview] = await Promise.all([
    getPublishedReviews(providerId),
    session?.user ? getMyReviewFor({ id: session.user.id }, providerId) : Promise.resolve(null),
  ])

  return NextResponse.json({
    ok: true,
    provider: {
      userId: provider.userId,
      name: provider.name,
      photoUrl: provider.photoUrl || null,
      headline: provider.headline || '',
      city: provider.city || '',
      description: provider.description || '',
      catalog: (provider.catalog || []).filter((item) => item.available !== false),
    },
    reviews,
    myReview,
  })
}
