import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { searchSongs } from '@/lib/server/playlist'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

const MIN_QUERY_LENGTH = 2

// Proxy serveur de la recherche iTunes (voir lib/server/playlist.ts —
// searchSongs) : le client ne parle jamais directement à itunes.apple.com,
// cohérent avec le reste de cette migration (aucun appel externe direct
// depuis le navigateur).
export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  // eventId n'est pas utilisé par searchSongs (la recherche n'est pas scopée
  // à un événement) mais reste dans l'URL pour rester sous le même arbre de
  // routes que le reste de la playlist — on l'attend quand même via `params`
  // pour respecter la convention Next.js 16 (params async) même sans s'en
  // servir.
  await params
  const query = (new URL(req.url).searchParams.get('q') || '').trim()

  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ ok: true, results: [] })
  }

  const rateLimit = await checkRateLimit({
    scope: 'playlist-search',
    identifier: `${session.user.id}:${getRequestIp(req)}`,
    limit: 60,
    windowMs: 15 * 60 * 1000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: rateLimit.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  const result = await searchSongs({ id: session.user.id, roles: session.user.roles }, { query })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, results: result.results })
}
