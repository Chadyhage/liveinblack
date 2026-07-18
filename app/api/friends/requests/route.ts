import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { sendFriendRequest, listMyFriendRequests } from '@/lib/server/friends'

// Envoi d'une demande d'ami (POST) et lecture des demandes en attente,
// reçues comme envoyées (GET) — voir lib/server/friends.ts pour le cycle
// complet (accept/decline/cancel sont sous requests/[requestId]/*). L'envoi
// gère aussi l'auto-acceptation en cas de demande mutuelle (#43) : la
// réponse peut donc être `status:'pending'` OU `status:'friends'`.
const bodySchema = z.object({
  toUserId: z.string().min(1),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await sendFriendRequest({ id: session.user.id }, { toUserId: parsed.data.toUserId })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, status: result.status, requestId: result.requestId })
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const result = await listMyFriendRequests({ id: session.user.id })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, received: result.received, sent: result.sent })
}
