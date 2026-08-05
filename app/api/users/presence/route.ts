import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { heartbeat, getPresence } from '@/lib/server/presence'

// POST : heartbeat (l'appelant signale qu'il est actif). GET ?ids=a,b,c :
// présence en ligne/hors ligne des ids demandés, restreinte à ceux qui
// partagent déjà une conversation avec l'appelant — voir lib/server/presence.ts.
export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  await heartbeat({ id: session.user.id })
  return NextResponse.json({ ok: true })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const idsParam = new URL(req.url).searchParams.get('ids') ?? ''
  const userIds = idsParam.split(',').map((s) => s.trim()).filter(Boolean)

  const result = await getPresence({ id: session.user.id }, { userIds })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, presence: result.presence })
}
