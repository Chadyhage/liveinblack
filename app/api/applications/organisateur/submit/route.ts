import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { submitOrganizerApplication } from '@/lib/server/applications'

const documentEntrySchema = z.object({ name: z.string().min(1), dataUri: z.string().min(1) })

const bodySchema = z.object({
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
  documents: z.record(z.string(), z.array(documentEntrySchema)),
  candidateNote: z.string().trim().max(1000).optional(),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await submitOrganizerApplication({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, application: result.application })
}
