import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { updateFollowAlerts } from '@/lib/server/organizerFollows'

// Préférences d'alerte par type pour un abonnement existant — voir
// lib/server/organizerFollows.ts (updateFollowAlerts) : nécessite un follow
// déjà existant (404 `not_following` sinon, cf. #44), fusionne uniquement
// les clés fournies dans le sous-document `alerts`. Corps vide (aucune des
// quatre clés) rejeté en 400 ICI, avant même d'atteindre la fonction serveur
// — les préférences d'alerte ne se configurent pas pour un organisateur qu'on
// ne suit pas, et un appel qui ne change rien n'a pas de raison d'exister.
const bodySchema = z
  .object({
    newEvent: z.boolean().optional(),
    cancelled: z.boolean().optional(),
    almostFull: z.boolean().optional(),
    newMedia: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty_body' })

async function handle(req: Request, { params }: { params: Promise<{ organizerId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { organizerId } = await params
  const result = await updateFollowAlerts({ id: session.user.id }, { organizerId, alerts: parsed.data })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, alerts: result.alerts })
}

export async function POST(req: Request, ctx: { params: Promise<{ organizerId: string }> }) {
  return handle(req, ctx)
}

export async function PATCH(req: Request, ctx: { params: Promise<{ organizerId: string }> }) {
  return handle(req, ctx)
}
