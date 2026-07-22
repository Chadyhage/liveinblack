import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import PromoCode from '@/lib/models/PromoCode'
import { checkRateLimit } from '@/lib/server/rateLimit'
import { resolvePromo, promoLabel, promoUnitDiscount } from '@/lib/server/promos'
import { verifyEventUnlockToken, unlockCookieName } from '@/lib/server/eventUnlock'
import { isEventEnded } from '@/lib/shared/event-time'

const schema = z.object({
  code: z.string().trim().min(1).max(64),
  placeId: z.string().min(1).max(100),
  qty: z.number().int().min(1).max(20),
})

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  const { eventId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const limit = await checkRateLimit({ scope: 'promo-preview', identifier: `${session.user.id}:${eventId}`, limit: 20, windowMs: 15 * 60 * 1000 })
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

  await getDb()
  const event = await Event.findById(eventId).lean()
  if (!event) return NextResponse.json({ error: 'event_not_found' }, { status: 404 })
  if (event.cancelled || isEventEnded(event)) return NextResponse.json({ error: 'booking_closed' }, { status: 409 })
  if (event.publishAt && new Date(event.publishAt).getTime() > Date.now()) return NextResponse.json({ error: 'event_not_published' }, { status: 409 })
  if (event.isPrivate) {
    const token = (await cookies()).get(unlockCookieName(eventId))?.value
    if (!verifyEventUnlockToken(eventId, token)) return NextResponse.json({ error: 'private_event_locked' }, { status: 403 })
  }

  const place = event.places?.find((item) => item.id === parsed.data.placeId)
  if (!place) return NextResponse.json({ error: 'place_not_found' }, { status: 404 })
  const requestedUses = place.groupType === 'group' ? 1 : parsed.data.qty
  const result = await resolvePromo(PromoCode, eventId, parsed.data.code, requestedUses)
  if (!result.ok) return NextResponse.json({ error: 'invalid_promo', message: result.message }, { status: 400 })

  const currency = event.currency === 'XOF' ? 'XOF' : 'EUR'
  const minorPerMajor = currency === 'XOF' ? 1 : 100
  const priceMinor = Math.max(0, Math.round(Number(place.price) * minorPerMajor))
  const discountMinor = promoUnitDiscount(result.promo, priceMinor, minorPerMajor)
  if (discountMinor >= priceMinor) return NextResponse.json({ error: 'promo_makes_ticket_free' }, { status: 400 })

  return NextResponse.json({ ok: true, code: result.promo.code, label: promoLabel(result.promo, currency), unitDiscount: discountMinor / minorPerMajor })
}
