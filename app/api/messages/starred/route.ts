import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { listStarredMessages } from '@/lib/server/messaging'

// Liste transversale des messages marqués "important" par l'appelant, toutes
// conversations confondues — voir lib/server/messaging.ts (listStarredMessages).
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const result = await listStarredMessages({ id: session.user.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, messages: result.messages })
}
