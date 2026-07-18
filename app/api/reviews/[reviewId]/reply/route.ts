import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { replyToReview } from '@/lib/server/providerReviews'

const bodySchema = z.object({ text: z.string().min(1) })

// Remplace api/provider-reviews.js { action:'reply' } — une seule réponse par
// avis, modifiable, réservée au prestataire concerné.
export async function POST(req: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { reviewId } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await replyToReview({ id: session.user.id }, { reviewId, text: parsed.data.text })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, reply: result.reply })
}
