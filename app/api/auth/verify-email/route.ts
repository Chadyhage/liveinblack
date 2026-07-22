import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/mongoose'
import User from '@/lib/models/User'
import { consumeVerificationToken } from '@/lib/auth/verification-tokens'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  token: z.string().min(1),
})

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const { email, token } = parsed.data

  await getDb()
  const user = await User.findOne({ email }).select('_id').lean()
  if (!user) {
    return NextResponse.json({ error: 'invalid_or_expired_token' }, { status: 400 })
  }

  const valid = await consumeVerificationToken(String(user._id), email, 'verify-email', token)
  if (!valid) {
    return NextResponse.json({ error: 'invalid_or_expired_token' }, { status: 400 })
  }

  await User.updateOne({ _id: user._id, email }, { $set: { emailVerifiedAt: new Date() } })

  return NextResponse.json({ ok: true })
}
