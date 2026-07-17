import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyPrivateEventCode } from '@/lib/server/events'
import { signEventUnlock, unlockCookieName } from '@/lib/server/eventUnlock'

const bodySchema = z.object({ code: z.string().min(1) })

// Vérifie le code d'un événement privé et, si valide, pose un cookie signé
// (httpOnly) prouvant le déverrouillage — jamais le code/hash lui-même n'est
// renvoyé au client. Pas de suivi "qui a utilisé quel code" pour l'instant
// (hors périmètre phase 2, simple porte d'accès sans effet de bord).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const valid = await verifyPrivateEventCode(id, parsed.data.code)
  if (!valid) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(unlockCookieName(id), signEventUnlock(id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 jours
  })
  return res
}
