import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { listTicketForResale } from '@/lib/server/resale'

const bodySchema = z.object({ ticketCode: z.string().trim().min(1), resalePrice: z.number().positive() })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await listTicketForResale({ id: session.user.id }, parsed.data.ticketCode, parsed.data.resalePrice)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({
    ok: true,
    listingId: String(result.listing._id),
    feeMinor: result.listing.feeMinor,
    sellerNetMinor: result.listing.sellerNetMinor,
    closesAt: result.listing.closesAt.toISOString(),
  })
}
