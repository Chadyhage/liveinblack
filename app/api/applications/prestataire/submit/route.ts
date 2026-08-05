import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { submitPrestataireApplication } from '@/lib/server/applications'
import { checkRateLimit } from '@/lib/server/rateLimit'
import { applicationDocumentsSchema } from '@/lib/shared/applicationDocuments'

const prestataireFormSchema = z.object({
  prestataireType: z.string().trim().default(''),
  prestataireTypes: z.array(z.string()).default([]),
  prenom: z.string().trim().min(1),
  nom: z.string().trim().min(1),
  telephoneCode: z.string().trim().default('+33'),
  telephone: z.string().trim().min(1),
  ville: z.string().trim().default(''),
  pays: z.string().trim().default('France'),
  nomCommercial: z.string().trim().default(''),
  nomScene: z.string().trim().default(''),
  siret: z.string().trim().default(''),
  zonesIntervention: z.array(z.string()).default([]),
  description: z.string().trim().default(''),
  specialitesLibre: z.string().trim().default(''),
  typeArtiste: z.string().trim().default(''),
  styles: z.string().trim().default(''),
  anneesExperience: z.string().trim().default(''),
  statutFacturation: z.string().trim().default(''),
  portfolio: z.string().trim().default(''),
  instagram: z.string().trim().default(''),
  besoinstechniques: z.string().trim().default(''),
  adresseLieu: z.string().trim().default(''),
  capaciteLieu: z.number().nullable().default(null),
  typeLieu: z.string().trim().default(''),
  equipements: z.string().trim().default(''),
  horairesAutorises: z.string().trim().default(''),
  reglesDuLieu: z.string().trim().default(''),
  categoriesMateriel: z.string().trim().default(''),
  inventaire: z.string().trim().default(''),
  conditionsLocation: z.string().trim().default(''),
  politiqueCaution: z.string().trim().default(''),
  typeActiviteFood: z.string().trim().default(''),
  menuBase: z.string().trim().default(''),
  alcoolFood: z.boolean().default(false),
  alcoolFoodAtteste: z.boolean().default(false),
  tarifMin: z.number().nullable().default(null),
  tarifMax: z.number().nullable().default(null),
  tarifType: z.string().trim().default(''),
  tarifDevis: z.boolean().default(false),
})

const bodySchema = z.object({
  formData: prestataireFormSchema,
  documents: applicationDocumentsSchema,
  candidateNote: z.string().trim().max(1000).optional(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const limit = await checkRateLimit({ scope: 'provider-application-submit', identifier: session.user.id, limit: 5, windowMs: 60 * 60 * 1000 })
  if (!limit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await submitPrestataireApplication({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, application: result.application })
}
