import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { searchUsers } from '@/lib/server/friends'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

const MIN_QUERY_LENGTH = 2

// Recherche nominative sur toute la base d'utilisateurs (pas seulement les
// amis) — voir lib/server/friends.ts:searchUsers. Utilisé par 'Nouveau
// message' / 'Nouveau groupe' (MessagesClient.tsx) pour retrouver quelqu'un
// qui n'est pas encore ami, fidèle à src/utils/messaging.js:searchUsers.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  if (q.length < MIN_QUERY_LENGTH) return NextResponse.json({ ok: true, users: [] })

  const rateLimit = await checkRateLimit({
    scope: 'user-search',
    identifier: `${session.user.id}:${getRequestIp(req)}`,
    limit: 120,
    windowMs: 15 * 60 * 1000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: rateLimit.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  const result = await searchUsers({ id: session.user.id }, q)

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, users: result.users })
}
