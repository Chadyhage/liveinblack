import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getDb } from '@/lib/db/mongoose'
import User from '@/lib/models/User'
import { issueVerificationToken, invalidateVerificationTokens } from '@/lib/auth/verification-tokens'
import { emailVerificationEmail } from '@/lib/server/email-templates'
import { sendEmail } from '@/lib/server/email'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

// SÉCURITÉ (anti-énumération, même règle que request-password-reset) : on ne
// révèle JAMAIS si l'email correspond à un compte, ni si ce compte est déjà
// vérifié. Toujours { ok: true }. Un nouveau jeton n'est émis, et un email
// envoyé, que si le compte existe RÉELLEMENT et n'est PAS déjà vérifié —
// dans les deux autres cas (compte inconnu, ou déjà vérifié) on ne fait
// silencieusement rien.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const { email } = parsed.data

  const [ipLimit, emailLimit] = await Promise.all([
    checkRateLimit({ scope: 'verification-resend-ip', identifier: getRequestIp(req), limit: 10, windowMs: 15 * 60 * 1000 }),
    checkRateLimit({ scope: 'verification-resend-email', identifier: email, limit: 3, windowMs: 15 * 60 * 1000 }),
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
  if (user && !user.emailVerifiedAt) {
    // Un seul jeton actif à la fois : on invalide l'ancien avant d'en émettre
    // un nouveau (voir le commentaire de invalidateVerificationTokens).
    await invalidateVerificationTokens(email)
    const token = await issueVerificationToken(email)
    const verifyLink = `${SITE}/verify-email?email=${encodeURIComponent(email)}&token=${token}`
    const result = await sendEmail(email, emailVerificationEmail(verifyLink, SITE))
    if (!result.ok) console.error('[resend-verification] email failed for', email, result.error)
  }

  return NextResponse.json({ ok: true })
}
