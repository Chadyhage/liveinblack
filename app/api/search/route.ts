import { NextResponse } from 'next/server'
import {
  getCachedSearchPublicEvents as searchPublicEvents,
} from '@/lib/server/publicCache'
import { getCachedPublicProvidersDirectory } from '@/lib/server/publicCache'
import { getCachedPublicOrganizersDirectory } from '@/lib/server/publicCache'
import { normalizeGeoText, getEntityRegionIds, getRegionName } from '@/lib/shared/locations'
import { getProviderCategories } from '@/lib/shared/providerCategories'
import { createCacheHeaders } from '@/lib/server/cacheHeaders'
import { runObservedRoute } from '@/lib/server/observability'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'
import { getVercelOpsConfig } from '@/lib/server/vercelEdgeConfig'

const RESULTS_CAP = 8

// Recherche globale JSON.
export async function GET(req: Request) {
  return runObservedRoute(req, { route: '/api/search', operation: 'search' }, async () => {
    const opsConfig = await getVercelOpsConfig()
    if (opsConfig.maintenanceMode) return NextResponse.json({ error: 'maintenance_mode' }, { status: 503 })

    const query = (new URL(req.url).searchParams.get('q') || '').trim()
    const normalized = normalizeGeoText(query)

    if (query.length < opsConfig.searchMinQueryLength) {
      return NextResponse.json(
        { ok: true, events: [], providers: [], organizers: [] },
        { headers: createCacheHeaders({ maxAgeSeconds: 20, staleWhileRevalidateSeconds: 60, shared: true }) }
      )
    }

    const rateLimit = await checkRateLimit({
      scope: 'public-search',
      identifier: getRequestIp(req),
      limit: 200,
      windowMs: 15 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: rateLimit.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const [events, providerDirectory, organizerDirectory] = await Promise.all([
      searchPublicEvents(query),
      getCachedPublicProvidersDirectory({ q: query, page: 1, pageSize: RESULTS_CAP, includeTotal: false }),
      getCachedPublicOrganizersDirectory({ q: query, page: 1, pageSize: RESULTS_CAP, includeTotal: false }),
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

    const matchedOrganizers = organizerDirectory.organizers.filter(matchOrganizer).slice(0, RESULTS_CAP)
    const matchedProviders = providerDirectory.providers.filter(matchProvider).slice(0, RESULTS_CAP)

    return NextResponse.json(
      {
        ok: true,
        events: events.slice(0, RESULTS_CAP),
        providers: matchedProviders,
        organizers: matchedOrganizers,
      },
      {
        headers: createCacheHeaders({
          maxAgeSeconds: opsConfig.publicCacheTtlSeconds,
          staleWhileRevalidateSeconds: opsConfig.publicCacheTtlSeconds * 4,
          shared: true,
        }),
      }
    )
  })
}
