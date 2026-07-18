import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listMyEventInterests } from '@/lib/server/eventInterests'

// Liste "mes événements intéressés" — voir lib/server/eventInterests.ts
// (listMyEventInterests). Le tri "à venir" / "passés ou indisponibles" est
// une dérivation CLIENT (lib/shared/event-time.ts), jamais précalculée ici.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const result = await listMyEventInterests({ id: session.user.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, items: result.items })
}
