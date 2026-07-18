import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { createReview } from '@/lib/server/providerReviews'

const bodySchema = z.object({
  providerId: z.string().min(1),
  rating: z.number(),
  comment: z.string(),
})

// Remplace api/provider-reviews.js { action:'create' }. Publie OU modifie —
// même avis composite {providerId, authorId}, voir lib/models/Review.ts.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await createReview({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, review: result.review })
}
