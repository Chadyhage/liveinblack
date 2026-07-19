import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getDb } from '@/lib/db/mongoose'
import User from '@/lib/models/User'
import { issueVerificationToken } from '@/lib/auth/verification-tokens'
import { emailVerificationEmail } from '@/lib/server/email-templates'
import { sendEmail } from '@/lib/server/email'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional(),
})

// Normalise un numéro de téléphone pour comparaison (garde uniquement les
// chiffres) — même logique que normalizePhone() dans old/src/utils/accounts.js.
function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '')
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })
  }
  const { email, password, firstName, lastName, phone } = parsed.data

  await getDb()

  const existing = await User.findOne({ email }).lean()
  if (existing) {
    return NextResponse.json({ error: 'email_taken' }, { status: 409 })
  }

  // Doublon téléphone : fidèle à doEmailRegister (old/src/pages/LoginPage.jsx)
  // — le blocage ne s'applique QUE si le compte détenteur du numéro est
  // vérifié (emailVerifiedAt posé). Un ghost account (jamais vérifié) ne doit
  // pas verrouiller un numéro pour toujours.
  const normalizedPhone = phone ? normalizePhone(phone) : ''
  if (normalizedPhone.length >= 6) {
    const verifiedWithPhone = await User.find(
      { phone: { $exists: true, $ne: '' }, emailVerifiedAt: { $ne: null } },
      { phone: 1 }
    ).lean()
    const phoneTaken = verifiedWithPhone.some((u) => normalizePhone(u.phone || '') === normalizedPhone)
    if (phoneTaken) {
      return NextResponse.json({ error: 'phone_taken' }, { status: 409 })
    }
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await User.create({
    email,
    passwordHash,
    firstName,
    lastName,
    phone: phone || '',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
  })

  const token = await issueVerificationToken(email)
  const verifyLink = `${SITE}/verify-email?email=${encodeURIComponent(email)}&token=${token}`
  const emailResult = await sendEmail(email, emailVerificationEmail(verifyLink, SITE))
  if (!emailResult.ok) {
    // Le compte est créé même si l'email échoue à partir — l'utilisateur peut
    // redemander l'envoi plus tard (pas de rollback : mieux vaut un compte non
    // vérifié qu'une inscription perdue à cause d'un souci Resend ponctuel).
    console.error('[register] verification email failed for', email, emailResult.error)
  }

  return NextResponse.json({ ok: true, id: String(user._id) }, { status: 201 })
}
