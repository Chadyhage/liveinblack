import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { reportReview } from '@/lib/server/providerReviews'
import { REVIEW_REPORT_REASONS } from '@/lib/shared/reviews'

const REASON_IDS = REVIEW_REPORT_REASONS.map((r) => r.id) as [string, ...string[]]
const bodySchema = z.object({
  reason: z.enum(REASON_IDS),
  details: z.string().optional(),
})

// Remplace api/provider-reviews.js { action:'report' } — masquage automatique
// à 3 signalements distincts (voir AUTO_HIDE_REPORTS dans providerReviews.ts).
export async function POST(req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { reviewId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await reportReview({ id: session.user.id }, { reviewId, ...parsed.data })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
