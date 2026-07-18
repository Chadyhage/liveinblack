import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { requestEmailChange, cancelEmailChangeRequest } from '@/lib/server/profile'

const bodySchema = z.object({
  newEmail: z.string().trim().toLowerCase().email(),
  currentPassword: z.string().min(1),
})

// Demander un changement d'email (POST, mot de passe requis — voir
// lib/server/profile.ts:requestEmailChange) / annuler une demande en attente
// (DELETE). Le changement n'est appliqué qu'à la confirmation du lien envoyé
// à la NOUVELLE adresse, voir /api/profil/confirmer-email.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await requestEmailChange({ id: session.user.id }, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, pendingEmail: result.pendingEmail })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const result = await cancelEmailChangeRequest({ id: session.user.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
