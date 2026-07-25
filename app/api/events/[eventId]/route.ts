import { NextResponse } from 'next/server'
import { getEventById } from '@/lib/server/events'
import { verifyEventUnlockToken, unlockCookieName } from '@/lib/server/eventUnlock'

// Détail d'un événement en JSON — miroir de resolveEvent() dans
// app/(public)/events/[id]/page.tsx (même cookie de déverrouillage signé, même
// frontière de sécurité : un event privé ne renvoie ses données que si le
// cookie posé par POST /api/events/[eventId]/unlock est présent et valide).
export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const cookieHeader = req.headers.get('cookie') || ''
  const unlockToken = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${unlockCookieName(eventId)}=`))
    ?.split('=')[1]

  const unlocked = verifyEventUnlockToken(eventId, unlockToken)
  const result = await getEventById(eventId, { unlocked })

  if (result.status === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (result.status === 'locked') return NextResponse.json({ error: 'locked', id: result.id }, { status: 403 })
  return NextResponse.json({ ok: true, event: result.event })
}
