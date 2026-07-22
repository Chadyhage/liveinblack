import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/mongoose'
import User from '@/lib/models/User'
import { issueVerificationToken } from '@/lib/auth/verification-tokens'
import { passwordResetEmail } from '@/lib/server/email-templates'
import { sendEmail } from '@/lib/server/email'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

// SÉCURITÉ (anti-énumération, même règle que le legacy api/send-password-reset.js) :
// on ne révèle JAMAIS si l'email correspond à un compte. Toujours { ok: true }.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const { email } = parsed.data

  const [ipLimit, emailLimit] = await Promise.all([
    checkRateLimit({ scope: 'password-reset-ip', identifier: getRequestIp(req), limit: 10, windowMs: 15 * 60 * 1000 }),
    checkRateLimit({ scope: 'password-reset-email', identifier: email, limit: 3, windowMs: 15 * 60 * 1000 }),
  ])
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfterSeconds = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds)
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
    )
  }

  await getDb()
  const user = await User.findOne({ email }).lean()
  if (user) {
    const token = await issueVerificationToken(email, 60 * 60 * 1000) // 1h, plus court qu'une vérification email
    const resetLink = `${SITE}/reset-password?email=${encodeURIComponent(email)}&token=${token}`
    const result = await sendEmail(email, passwordResetEmail(resetLink, SITE))
    if (!result.ok) console.error('[request-password-reset] email failed for', email, result.error)
  }

  return NextResponse.json({ ok: true })
}
