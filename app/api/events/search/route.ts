import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getCachedSearchPublicEvents as searchPublicEvents } from '@/lib/server/publicCache'
import { createCacheHeaders } from '@/lib/server/cacheHeaders'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

const MIN_QUERY_LENGTH = 2

// Recherche d'événements PUBLICS pour l'EventPickerModal de MessagesClient.tsx
// ('Partager un événement' → sondage 'On y va ?', voir POST
// /api/conversations/[id]/polls avec kind:'event_poll'). Volontairement une
// forme minimale (id/name/date/city/image) : createEventPoll (lib/server/
// polls.ts) recharge de toute façon l'Event complet depuis sa propre
// collection au moment de la création du sondage, jamais depuis ce qui est
// affiché ici dans le picker.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') || '').trim()

  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      {
        ok: true,
        events: [],
      },
      {
        headers: createCacheHeaders({ maxAgeSeconds: 20, staleWhileRevalidateSeconds: 60, shared: true }),
      }
    )
  }

  const rateLimit = await checkRateLimit({
    scope: 'event-search-typed',
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

  const events = await searchPublicEvents(q)

  return NextResponse.json(
    {
      ok: true,
      events: events.map((e) => ({ id: e.id, name: e.name, date: e.date, city: e.city, image: e.imageUrl ?? null })),
    },
    { headers: createCacheHeaders({ maxAgeSeconds: 45, staleWhileRevalidateSeconds: 180, shared: true }) }
  )
}
