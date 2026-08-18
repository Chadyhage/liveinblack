import { NextResponse } from 'next/server'
import { getCachedPublicProvidersDirectory } from '@/lib/server/publicCache'
import { getProviderCategories, PROVIDER_CATEGORIES } from '@/lib/shared/providerCategories'
import { createCacheHeaders } from '@/lib/server/cacheHeaders'
import { parsePage, parsePageSize } from '@/lib/shared/pagination'
import { checkRateLimit, getRequestIp } from '@/lib/server/rateLimit'

// Annuaire public des prestataires en JSON — logique alignée avec
// app/(public)/providers/page.tsx.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const search = (searchParams.get('q') || '').trim()
  const category = searchParams.get('categorie') || ''
  const region = searchParams.get('region') || ''
  const page = parsePage(searchParams.get('page'), 1, { min: 1, max: 4_000 })
  const pageSize = parsePageSize(searchParams.get('pageSize'), 12, { min: 12, max: 120 })

  if (search && search.length < 2) {
    return NextResponse.json({ ok: false, error: 'Le terme de recherche doit contenir au moins 2 caractères.' }, { status: 400 })
  }

  const rateLimit = await checkRateLimit({
    scope: 'public-providers-api',
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

  const { providers, total, page: cachedPage, pageSize: returnedPageSize } = await getCachedPublicProvidersDirectory({
    q: search,
    categorie: category,
    region,
    page,
    pageSize,
    includeTotal: true,
  })

  const counts: Record<string, number> = {}
  for (const p of providers) {
    for (const c of getProviderCategories(p)) counts[c.id] = (counts[c.id] || 0) + 1
  }

  return NextResponse.json({
    ok: true,
    providers,
    total,
    page: cachedPage,
    pageSize: returnedPageSize,
    categories: PROVIDER_CATEGORIES.filter((c) => counts[c.id]).map((c) => ({ id: c.id, label: c.label, color: c.color, count: counts[c.id] })),
  }, { headers: createCacheHeaders({ maxAgeSeconds: 45, staleWhileRevalidateSeconds: 180, shared: true }) })
}
