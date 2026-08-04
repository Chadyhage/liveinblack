import { NextResponse } from 'next/server'
import { z } from 'zod'
import { contactRequestEmail } from '@/lib/server/email-templates'
import { sendEmail } from '@/lib/server/email'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'
import { LEGAL } from '@/lib/shared/legal'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  subject: z.string().trim().min(1).max(150),
  message: z.string().trim().min(1).max(4000),
})

// Route publique (pas d'auth requise) derrière la page /contact — remplace
// l'ancien lien mailto: direct dans le footer (voir app/(public)/_components/Footer.tsx).
// Rate-limitée par IP comme les autres endpoints publics non authentifiés
// (même pattern que app/api/auth/register/route.ts).
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })
  }

  const rateLimit = await checkRateLimit({
    scope: 'contact-form-ip',
    identifier: getRequestIp(req),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  const result = await sendEmail(LEGAL.contactEmail, contactRequestEmail(parsed.data, SITE))
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
