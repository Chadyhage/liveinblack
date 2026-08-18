import { NextResponse } from 'next/server'
import { getCachedSearchPublicEvents as searchPublicEvents } from '@/lib/server/publicCache'
import { getCachedPublicProvidersDirectory } from '@/lib/server/publicCache'
import { getCachedPublicOrganizersDirectory } from '@/lib/server/publicCache'
import { normalizeGeoText, getEntityRegionIds, getRegionName } from '@/lib/shared/locations'
import { getProviderCategories } from '@/lib/shared/providerCategories'
import { createCacheHeaders } from '@/lib/server/cacheHeaders'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

// Résultats compacts pour la barre de recherche globale.
const QUICK_CAP = 3
const MIN_QUERY_LENGTH = 2

export async function GET(req: Request) {
  const query = (new URL(req.url).searchParams.get('q') || '').trim()
  const normalized = normalizeGeoText(query)

  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json(
      { ok: true, events: [], providers: [], organizers: [] },
      { headers: createCacheHeaders({ maxAgeSeconds: 20, staleWhileRevalidateSeconds: 60, shared: true }) }
    )
  }

  const rateLimit = await checkRateLimit({
    scope: 'public-quick-search',
    identifier: getRequestIp(req),
    limit: 400,
    windowMs: 5 * 60 * 1000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: rateLimit.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  const [events, providerDirectory, organizerDirectory] = await Promise.all([
    searchPublicEvents(query),
    getCachedPublicProvidersDirectory({ q: query, page: 1, pageSize: 8, includeTotal: false }),
    getCachedPublicOrganizersDirectory({ q: query, page: 1, pageSize: 8, includeTotal: false }),
  ])
  const normalizedQuery = normalized

  const matchOrganizer = (organizer: (typeof organizerDirectory.organizers)[number]) => {
    const zones = getEntityRegionIds(organizer).map(getRegionName)
    const haystack = [
      organizer.publicName,
      organizer.city,
      organizer.country,
      organizer.shortDescription,
      organizer.longDescription,
      ...zones,
    ].filter(Boolean).join(' ')
    return normalizeGeoText(haystack).includes(normalizedQuery)
  }

  const matchProvider = (provider: (typeof providerDirectory.providers)[number]) => {
    const categoryLabels = getProviderCategories(provider).map((c) => c.label)
    const zones = getEntityRegionIds(provider).map(getRegionName)
    const haystack = [
      provider.name,
      provider.city,
      provider.location,
      provider.country,
      provider.description,
      ...categoryLabels,
      ...zones,
    ].filter(Boolean).join(' ')
    return normalizeGeoText(haystack).includes(normalizedQuery)
  }

  const matchedOrganizers = organizerDirectory.organizers.filter(matchOrganizer).slice(0, QUICK_CAP)
    .map((o) => ({ userId: o.userId, slug: o.slug, publicName: o.publicName, city: o.city || null, avatarUrl: o.avatarUrl || null }))

  const matchedProviders = providerDirectory.providers.filter(matchProvider).slice(0, QUICK_CAP)
    .map((p) => ({ userId: p.userId, name: p.name, city: p.city || p.location || null, avatarUrl: p.photoUrl || null }))

  const matchedEvents = events.slice(0, QUICK_CAP).map((e) => ({
    id: e.id,
    name: e.name,
    dateDisplay: e.dateDisplay || null,
    city: e.city || null,
    imageUrl: e.imageUrl || null,
  }))

  return NextResponse.json(
    {
      ok: true,
      events: matchedEvents,
      providers: matchedProviders,
      organizers: matchedOrganizers,
    },
    { headers: createCacheHeaders({ maxAgeSeconds: 30, staleWhileRevalidateSeconds: 120, shared: true }) }
  )
}
