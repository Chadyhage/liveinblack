import { NextResponse } from 'next/server'
import { z } from 'zod'
import { confirmEmailChange } from '@/lib/server/profile'

// PAS de garde auth() ici — ce lien est cliqué depuis un email, potentiellement
// hors session active (même convention que /api/auth/verify-email et
// /api/auth/reset-password) : l'identité vient du token, jamais d'une session.
const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  token: z.string().min(1),
})

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const result = await confirmEmailChange(parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, email: result.email })
}
