import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { verifyPrivateEventCode } from '@/lib/server/events'
import { consumeEventAccessCode } from '@/lib/server/eventAccessCodes'
import { signEventUnlock, unlockCookieName } from '@/lib/server/eventUnlock'

const bodySchema = z.object({ code: z.string().min(1) })

// Vérifie le code d'un événement privé et, si valide, pose un cookie signé
// (httpOnly) prouvant le déverrouillage — jamais le code/hash lui-même n'est
// renvoyé au client. Deux mécanismes acceptés (#7 phase organisateur) : le
// code MAÎTRE partagé (réutilisable, `verifyPrivateEventCode`) ou un code
// INDIVIDUEL à usage unique généré depuis le dashboard organisateur
// (`consumeEventAccessCode`, lib/server/eventAccessCodes.ts) — le maître est
// tenté en premier (pas d'écriture), l'individuel en repli (marque le code
// consommé).
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: id } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  let valid = await verifyPrivateEventCode(id, parsed.data.code)
  if (!valid) {
    const session = await auth()
    valid = await consumeEventAccessCode(id, parsed.data.code, session?.user?.id ?? null)
  }
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
