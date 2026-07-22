import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getDb } from '@/lib/db/mongoose'
import User from '@/lib/models/User'
import { consumeVerificationToken } from '@/lib/auth/verification-tokens'
import { isPasswordPolicyCompliant } from '@/lib/shared/passwordPolicy'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  token: z.string().min(1),
  password: z.string().min(8).max(128).refine(isPasswordPolicyCompliant, 'Le mot de passe ne respecte pas la politique de sécurité.'),
})

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })
  }
  const { email, token, password } = parsed.data

  const limit = await checkRateLimit({
    scope: 'reset-password',
    identifier: `${getRequestIp(req)}:${email}`,
    limit: 8,
    windowMs: 15 * 60 * 1000,
  })
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } }
    )
  }

  await getDb()
  const user = await User.findOne({ email }).select('_id').lean()
  if (!user) {
    return NextResponse.json({ error: 'invalid_or_expired_token' }, { status: 400 })
  }

  const valid = await consumeVerificationToken(String(user._id), email, 'reset-password', token)
  if (!valid) {
    return NextResponse.json({ error: 'invalid_or_expired_token' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  // Un jeton de reset valide prouve la possession de la boîte mail — exactement
  // la même preuve qu'un clic sur le lien /verify-email. Parité avec le
  // fallback legacy (src/pages/LoginPage.jsx handleResendVerification) qui
  // utilisait sendPasswordResetEmail précisément parce qu'il "vérifie aussi
  // ton email" en même temps. Sans ce complément, un client qui n'a jamais
  // reçu/cliqué son email de vérification resterait bloqué à la connexion
  // (auth.ts authorize()) même après avoir réinitialisé son mot de passe.
  await User.updateOne(
    { _id: user._id, email },
    { $set: { passwordHash, emailVerifiedAt: new Date() }, $inc: { sessionVersion: 1 } }
  )

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
