import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'
import EventAccessCode from '@/lib/models/EventAccessCode'
import { hashCode } from '@/lib/server/events'
import { consumeEventAccessCode } from '@/lib/server/eventAccessCodes'
import { signEventUnlock, unlockCookieName } from '@/lib/server/eventUnlock'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

const bodySchema = z.object({ code: z.string().trim().min(1).max(64) })

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const rateLimit = await checkRateLimit({
    scope: 'global-event-unlock',
    identifier: getRequestIp(req),
    limit: 20,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  await getDb()
  const code = parsed.data.code.toUpperCase()
  const masterEvent = await Event.findOne({
    isPrivate: true,
    cancelled: { $ne: true },
    privateCodeHash: hashCode(code),
  }).select('_id').lean()

  let eventId = masterEvent ? String(masterEvent._id) : null
  if (!eventId) {
    const accessCode = await EventAccessCode.findOne({ code, usedBy: null }).select('eventId').lean()
    if (accessCode) {
      const event = await Event.findOne({ _id: accessCode.eventId, isPrivate: true, cancelled: { $ne: true } }).select('_id').lean()
      if (event) {
        const session = await auth()
        const consumed = await consumeEventAccessCode(String(event._id), code, session?.user?.id ?? null)
        if (consumed) eventId = String(event._id)
      }
    }
  }

  if (!eventId) return NextResponse.json({ error: 'invalid_code' }, { status: 403 })

  const response = NextResponse.json({ ok: true, eventId })
  response.cookies.set(unlockCookieName(eventId), signEventUnlock(eventId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}
