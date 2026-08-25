import { getDb } from '@/lib/db/mongoose'
import ProviderProfile, { type ProviderProfileDoc } from '@/lib/models/ProviderProfile'
import { normalizeGeoText } from '@/lib/shared/locations'

export type PublicProvider = ProviderProfileDoc & { userId: string }

// Type "plat" (résultat réel de .lean(), sans les méthodes DocumentArray de
// Mongoose que InferSchemaType laisse fuiter dans le type) — à utiliser côté
// pages plutôt que ProviderProfileDoc['catalog'] directement.
export type CatalogItem = {
  id: string
  name: string
  description?: string
  price?: number | null
  currency?: 'EUR' | 'XOF'
  unit?: string
  category?: string
  available?: boolean
  media?: { url: string; type?: 'image' | 'video' }[]
}

export type PublicProviderDirectoryParams = {
  q?: string
  categorie?: string
  category?: string
  region?: string
  page?: number
  pageSize?: number
  includeTotal?: boolean
}

export type PublicProviderDirectoryResult = {
  providers: PublicProvider[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Visibilité : abonnement actif, OU agent, OU le propriétaire consultant sa
// propre page (même logique que services.js:isProviderVisible côté legacy).
export function isProviderVisible(
  provider: Pick<ProviderProfileDoc, 'subscriptionActive'> | null | undefined,
  viewer?: { activeRole?: string; id?: string } | null,
  ownerUserId?: string
): boolean {
  if (!provider) return false
  if (viewer?.activeRole === 'agent') return true
  if (viewer?.id && ownerUserId && viewer.id === ownerUserId) return true
  return provider.subscriptionActive === true
}

// "Non-fantôme" : un profil doit avoir un minimum de contenu pour apparaître
// dans l'annuaire (même règle que PublicPrestataires.jsx).
function buildNonGhostFilters() {
  const nonEmptyString = { $type: 'string' as const, $ne: '' }

  return {
    $or: [
      { photoUrl: nonEmptyString },
      { description: nonEmptyString },
      { city: nonEmptyString },
      { location: nonEmptyString },
      { country: nonEmptyString },
      { regionId: nonEmptyString },
      { zonesIntervention: { $elemMatch: { $exists: true } } },
      { catalog: { $elemMatch: { available: { $ne: false } } } },
    ],
  }
}

function withNonGhostFilter(base: Record<string, unknown>) {
  const andClauses: Record<string, unknown>[] = [
    buildNonGhostFilters(),
  ]

  if (Array.isArray(base.$and)) {
    andClauses.push(...base.$and)
  }

  return {
    ...base,
    name: { $type: 'string' as const, $ne: '' },
    $and: andClauses,
  }
}

const PUBLIC_DIRECTORY_PAGE_SIZE = 24
const MAX_DIRECTORY_PAGE = 4_000
const MAX_TOTAL_COUNT_CACHE_ENTRIES = 200
const PROVIDER_FIELDS =
  'userId name headline description city location regionId country photoUrl coverUrl prestataireType prestataireTypes subscriptionActive catalog catalogCurrency ratingAvg ratingCount updatedAt'

const PROVIDER_TOTAL_TTL_MS = 30_000

type CachedCount = {
  value: number
  expiresAt: number
}

const countCache = new Map<string, CachedCount>()
const inFlightCount = new Map<string, Promise<number>>()

function pruneCountCache(nowMs = Date.now()) {
  for (const [key, value] of countCache.entries()) {
    if (value.expiresAt <= nowMs) countCache.delete(key)
  }

  if (countCache.size <= MAX_TOTAL_COUNT_CACHE_ENTRIES) return

  const sorted = [...countCache.entries()].sort((a, b) => b[1].expiresAt - a[1].expiresAt)
  for (let index = MAX_TOTAL_COUNT_CACHE_ENTRIES; index < sorted.length; index += 1) {
    countCache.delete(sorted[index][0])
  }
}

function getTotalCacheKey({ filter, nowDay }: { filter: Record<string, unknown>; nowDay: string }) {
  return JSON.stringify({ t: 'providers', nowDay, filter })
}

function getCachedTotalCount(filter: Record<string, unknown>): Promise<number> {
  const nowMs = Date.now()
  pruneCountCache(nowMs)
  const nowDay = new Date(nowMs).toISOString().slice(0, 10)
  const key = getTotalCacheKey({ filter, nowDay })

  const cached = countCache.get(key)
  if (cached && cached.expiresAt > nowMs) return Promise.resolve(cached.value)

  const existing = inFlightCount.get(key)
  if (existing) return existing

  const countPromise = ProviderProfile.countDocuments(filter)
    .then((value) => {
      countCache.set(key, { value, expiresAt: Date.now() + PROVIDER_TOTAL_TTL_MS })
      inFlightCount.delete(key)
      return value
    })
    .catch((error) => {
      inFlightCount.delete(key)
      throw error
    })

  inFlightCount.set(key, countPromise)
  return countPromise
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildProviderFilters(params: PublicProviderDirectoryParams) {
  const category = params.categorie || params.category || ''
  const region = params.region || ''
  const search = (params.q || '').trim()
  const normalizedSearch = normalizeGeoText(search)

  const filter: Record<string, unknown> = { subscriptionActive: true }
  const andClauses: Record<string, unknown>[] = []

  if (category) {
    andClauses.push({ $or: [{ prestataireType: category }, { prestataireTypes: category }] })
  }

  if (region) {
    andClauses.push({ $or: [{ regionId: region }, { zonesIntervention: region }] })
  }

  if (search) {
    if (normalizedSearch.length <= 1) {
      const pattern = new RegExp(escapeRegex(search), 'i')
      andClauses.push({
        $or: [
          { name: { $regex: pattern } },
          { city: { $regex: pattern } },
          { location: { $regex: pattern } },
          { country: { $regex: pattern } },
          { headline: { $regex: pattern } },
          { description: { $regex: pattern } },
        ],
      })
    } else {
      andClauses.push({ $text: { $search: normalizedSearch } })
    }
  }

  if (andClauses.length > 0) {
    filter.$and = andClauses
  }

  return filter
}

/**
 * Usage SEO / opérations globales (ex: sitemap, exports). On renvoie tous les
 * profils publics qualifiés (règles non fantôme déjà au niveau MongoDB).
 */
export async function listPublicProviders(): Promise<PublicProvider[]> {
  await getDb()
  const docs = await ProviderProfile.find(withNonGhostFilter({ subscriptionActive: true }))
    .select(PROVIDER_FIELDS)
    .sort({ updatedAt: -1 })
    .lean()
  return docs as PublicProvider[]
}

export type ProviderSitemapEntry = { userId: string; updatedAt?: Date | string | null }

export async function countPublicProvidersForSitemap(): Promise<number> {
  await getDb()
  return ProviderProfile.estimatedDocumentCount().maxTimeMS(2_000)
}

export async function listPublicProvidersForSitemapPage(params: { offset: number; limit: number }): Promise<ProviderSitemapEntry[]> {
  await getDb()
  const offset = Math.max(0, Math.floor(params.offset))
  const limit = Math.min(5_000, Math.max(1, Math.floor(params.limit)))
  const docs = await ProviderProfile.find(withNonGhostFilter({ subscriptionActive: true }))
    .select('userId updatedAt')
    .sort({ updatedAt: -1, _id: 1 })
    .skip(offset)
    .limit(limit)
    .lean()
  return docs.map((doc) => ({ userId: String(doc.userId), updatedAt: doc.updatedAt }))
}

export async function listPublicProvidersDirectory(
  params: PublicProviderDirectoryParams = {}
): Promise<PublicProviderDirectoryResult> {
  await getDb()
  const page = Math.max(1, Number(params.page) || 1)
  const cappedPage = Math.min(page, MAX_DIRECTORY_PAGE)
  const pageSize = Math.max(12, Math.min(120, Number(params.pageSize) || PUBLIC_DIRECTORY_PAGE_SIZE))
  const skip = (cappedPage - 1) * pageSize
  const includeTotal = params.includeTotal !== false
  const normalizedSearch = normalizeGeoText(params.q || '').trim()
  const hasTextSearch = normalizedSearch.length > 1
  const hasUnsupportedSearch = params.q?.trim() ? normalizedSearch.length > 0 && normalizedSearch.length < 2 : false

  if (hasUnsupportedSearch) {
    return {
      providers: [],
      total: 0,
      page: cappedPage,
      pageSize,
      totalPages: 1,
    }
  }

  const filter = buildProviderFilters(params)
  const safeFilter = withNonGhostFilter(filter)
  const providersQuery = (() => {
    const query = ProviderProfile.find(safeFilter)
      .select(PROVIDER_FIELDS)
      .skip(skip)
      .limit(pageSize)
      .lean()

    if (hasTextSearch) {
      return query
        .select({ score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, updatedAt: -1 })
    }

    return query.sort({ updatedAt: -1 })
  })()

  const totalQuery = includeTotal ? getCachedTotalCount(safeFilter) : Promise.resolve(0)
  const [rawProviders, total] = await Promise.all([providersQuery, totalQuery])

  const providers = rawProviders as PublicProvider[]
  const effectiveTotal = includeTotal ? total : providers.length
  const totalPages = includeTotal ? Math.max(1, Math.ceil(total / pageSize)) : 1

  return {
    providers,
    total: effectiveTotal,
    page: cappedPage,
    pageSize,
    totalPages,
  }
}

export async function getProviderByUserId(
  userId: string,
  viewer?: { activeRole?: string; id?: string } | null
): Promise<PublicProvider | null> {
  await getDb()
  const doc = await ProviderProfile.findOne({ userId }).lean()
  if (!doc) return null
  if (!isProviderVisible(doc, viewer, doc.userId)) return null
  return doc as PublicProvider
}
