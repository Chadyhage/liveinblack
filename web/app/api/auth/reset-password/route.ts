import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getDb } from '@/lib/db/mongoose'
import User from '@/lib/models/User'
import { consumeVerificationToken } from '@/lib/auth/verification-tokens'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  token: z.string().min(1),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
})

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })
  }
  const { email, token, password } = parsed.data

  const valid = await consumeVerificationToken(email, token)
  if (!valid) {
    return NextResponse.json({ error: 'invalid_or_expired_token' }, { status: 400 })
  }

  await getDb()
  const passwordHash = await bcrypt.hash(password, 12)
  await User.updateOne({ email }, { $set: { passwordHash } })

  return NextResponse.json({ ok: true })
}
