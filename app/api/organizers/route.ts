import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { getCachedPublicOrganizersDirectory } from '@/lib/server/publicCache'
import { hasAuthSessionCookie } from '@/lib/server/authSessionCookie'
import { listMyFollowedOrganizers } from '@/lib/server/organizer/organizerFollows'
import { createCacheHeaders } from '@/lib/server/cacheHeaders'
import { parsePage, parsePageSize } from '@/lib/shared/pagination'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

// Annuaire public des organisateurs en JSON.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const search = (searchParams.get('q') || '').trim()
  const region = searchParams.get('region') || ''
  const upcomingOnly = searchParams.get('upcoming') === '1'
  const sort = searchParams.get('sort') || 'popular'
  const page = parsePage(searchParams.get('page'), 1, { min: 1, max: 4_000 })
  const pageSize = parsePageSize(searchParams.get('pageSize'), 24, { min: 12, max: 120 })

  if (search && search.length < 2) {
    return NextResponse.json({ ok: false, error: 'Le terme de recherche doit contenir au moins 2 caractères.' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const hasSessionCookie = hasAuthSessionCookie(cookieStore.getAll())
  const session = hasSessionCookie ? await auth() : null

  const rateLimit = await checkRateLimit({
    scope: 'public-organizers-api',
    identifier: getRequestIp(req),
    limit: 300,
    windowMs: 60 * 1000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: rateLimit.retryAfterSeconds },
      { status: 429, headers: { ...createCacheHeaders({ maxAgeSeconds: 5, shared: true }), 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  const [directory, followResult] = await Promise.all([
    getCachedPublicOrganizersDirectory({
      q: search,
      region,
      upcoming: upcomingOnly,
      sort: sort === 'recent' ? 'recent' : 'popular',
      page,
      pageSize,
      includeTotal: true,
    }),
    session?.user
      ? listMyFollowedOrganizers({ id: session.user.id })
      : Promise.resolve({ ok: true as const, follows: [] }),
  ])

  const { organizers, total } = directory
  const followedIds = new Set(followResult.ok ? followResult.follows.map((follow) => follow.organizerId) : [])

  const payload = organizers.map((organizer) => ({ ...organizer, isFollowing: followedIds.has(organizer.userId) }))

  return NextResponse.json(
    { ok: true, organizers: payload, total },
    { headers: createCacheHeaders({ maxAgeSeconds: 45, staleWhileRevalidateSeconds: 180, shared: true }) }
  )
}
