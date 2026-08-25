import { NextResponse } from 'next/server'
import { searchPublicEvents } from '@/lib/server/events/events'
import { getCachedBoostedEventIds, getCachedPublicEventsDirectory } from '@/lib/server/publicCache'
import { createCacheHeaders } from '@/lib/server/cacheHeaders'
import { parsePage, parsePageSize } from '@/lib/shared/pagination'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

// Route JSON publique de listing d'événements — version paginée.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const page = parsePage(url.searchParams.get('page'), 1, { min: 1, max: 4_000 })
  const pageSize = parsePageSize(url.searchParams.get('pageSize'), 24, { min: 12, max: 96 })
  const safePageSize = pageSize
  const category = (url.searchParams.get('category') || '').trim()
  const region = (url.searchParams.get('region') || '').trim()

  if (q && q.length < 2) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Le terme de recherche doit contenir au moins 2 caractères.',
      },
      { status: 400 }
    )
  }

  const rateLimit = await checkRateLimit({
    scope: 'public-events-api',
    identifier: getRequestIp(req),
    limit: 240,
    windowMs: 60 * 1000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: rateLimit.retryAfterSeconds },
      { status: 429, headers: { ...createCacheHeaders({ maxAgeSeconds: 5, shared: true }), 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  if (q) {
    const [events, boostedIds] = await Promise.all([
      searchPublicEvents(q),
      getCachedBoostedEventIds(),
    ])
    const mappedEvents = events.map((e) => ({
      ...e,
      boosted: boostedIds.has(e.id),
    }))
    return NextResponse.json({ ok: true, events: mappedEvents }, { headers: createCacheHeaders({ maxAgeSeconds: 45, staleWhileRevalidateSeconds: 180, shared: true }) })
  }

    const [eventsPage, boostedIds] = await Promise.all([
      getCachedPublicEventsDirectory({
        q: '',
        category: category || undefined,
        region: region || undefined,
        page,
        pageSize: safePageSize,
        includeTotal: true,
      }),
      getCachedBoostedEventIds(),
    ])

  const withBoosted = eventsPage.events.map((e) => ({ ...e, boosted: boostedIds.has(e.id) }))

  return NextResponse.json({
    ok: true,
    events: withBoosted,
    page: eventsPage.page,
    pageSize: eventsPage.pageSize,
    total: eventsPage.total,
    totalPages: eventsPage.totalPages,
  }, { headers: createCacheHeaders({ maxAgeSeconds: 45, staleWhileRevalidateSeconds: 180, shared: true }) })
}
