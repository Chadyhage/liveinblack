import { NextResponse } from 'next/server'
import { z } from 'zod'
import { registerAndSubmitOrganizerApplication } from '@/lib/server/applications'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'
import { isPasswordPolicyCompliant } from '@/lib/shared/passwordPolicy'
import { applicationDocumentsSchema } from '@/lib/shared/applicationDocuments'

// Mode ANONYME (route /inscription-organisateur, sans session) — crée le
// compte ET soumet la candidature en un seul appel, voir
// lib/server/applications.ts pour la justification ("jamais de compte
// fantôme avant soumission finale"). Le client s'authentifie lui-même
// ensuite via signIn('credentials', ...) avec l'email/mot de passe fournis.
const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128).refine(isPasswordPolicyCompliant),
  formData: z.object({
    nomCommercial: z.string().trim().min(1),
    siret: z.string().trim().min(1),
    emailPro: z.string().trim().toLowerCase().email(),
    telephoneProCode: z.string().trim().min(1),
    telephonePro: z.string().trim().min(1),
    adresseEtablissement: z.string().trim().default(''),
    noFixedAddress: z.boolean().default(false),
    siteWeb: z.string().trim().default(''),
    typeEtablissement: z.string().trim().min(1),
    typeEtablissementCustom: z.string().trim().default(''),
    itinerant: z.boolean().default(false),
    ville: z.string().trim().default(''),
    pays: z.string().trim().default('France'),
    zonesActivite: z.array(z.string()).default([]),
    capacite: z.number().nullable().default(null),
    horaires: z.string().trim().default(''),
    alcool: z.boolean().default(false),
    alcoolAtteste: z.boolean().default(false),
    description: z.string().trim().default(''),
  }),
  documents: applicationDocumentsSchema,
  candidateNote: z.string().trim().max(1000).optional(),
})

export async function POST(req: Request) {
  const ipLimit = await checkRateLimit({
    scope: 'organizer-application-register-ip',
    identifier: getRequestIp(req),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) } })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const emailLimit = await checkRateLimit({
    scope: 'organizer-application-register-email',
    identifier: parsed.data.email,
    limit: 3,
    windowMs: 24 * 60 * 60 * 1000,
  })
  if (!emailLimit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(emailLimit.retryAfterSeconds) } })
  }

  const result = await registerAndSubmitOrganizerApplication(parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, application: result.application, userId: result.userId })
}
