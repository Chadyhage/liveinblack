import mongoose from 'mongoose'
import { getDb } from '@/lib/db/mongoose'
import Event, { type EventDoc } from '@/lib/models/Event'
import { isClientDiscoverableEvent } from '@/lib/shared/eventDiscovery'
import { normalizeGeoText } from '@/lib/shared/locations'

const DEFAULT_PUBLIC_PAGE_SIZE = 24
const MAX_PUBLIC_PAGE_SIZE = 96
const DEFAULT_SEARCH_LIMIT = 20
const MAX_PAGE_OFFSET = 4_000
const EVENT_TOTAL_TTL_MS = 30_000
const MAX_TOTAL_COUNT_CACHE_ENTRIES = 200
const PUBLIC_EVENT_FIELDS =
  'name category eventType musicStyles ambiances artists dj tags date dateDisplay time endTime publishAt cancelled isDemo city region location imageUrl videoUrl organizerName organizer organizerId places createdAt color'

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

function getTotalCacheKey({
  query,
  category,
  region,
  safeText,
  nowDay,
}: {
  query: Record<string, unknown>
  category: string
  region: string
  safeText: string
  nowDay: string
}) {
  return JSON.stringify({
    q: safeText,
    category,
    region,
    nowDay,
    filter: query,
  })
}

async function getCachedTotalCount(query: Record<string, unknown>, safeText: string, category: string, region: string): Promise<number> {
  const nowMs = Date.now()
  pruneCountCache(nowMs)
  const nowDay = new Date(nowMs).toISOString().slice(0, 10)
  const key = getTotalCacheKey({ query, category, region, safeText, nowDay })
  const cached = countCache.get(key)

  if (cached && cached.expiresAt > nowMs) return cached.value

  const existing = inFlightCount.get(key)
  if (existing) return existing

  const countPromise = Event.countDocuments(query)
    .then((value) => {
      countCache.set(key, { value, expiresAt: Date.now() + EVENT_TOTAL_TTL_MS })
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

export type PublicEvent = Omit<EventDoc, never> & { id: string }

export type PublicEventsDirectoryResult = {
  events: PublicEvent[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function toPublicEvent(doc: Record<string, unknown>): PublicEvent {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude it from `rest`
  const { _id, __v, ...rest } = doc as { _id: unknown; __v?: number } & Record<string, unknown>
  return { ...(rest as EventDoc), id: String(_id) }
}

function buildDiscoverableFilters(now = new Date()) {
  const nowIsoDate = now.toISOString().slice(0, 10)

  return {
    cancelled: { $ne: true },
    isDemo: { $ne: true },
    isPrivate: { $ne: true },
    $and: [
      {
        $or: [
          { publishAt: { $exists: false } },
          { publishAt: null },
          { publishAt: { $lte: now } },
        ],
      },
    ],
    date: { $gte: nowIsoDate },
    $or: [
      { closingDate: { $exists: false } },
      { closingDate: null },
      { closingDate: { $gte: now } },
    ],
  } as Record<string, unknown>
}

type EventDirectoryOptions = {
  q?: string
  category?: string
  region?: string
  page?: number
  pageSize?: number
  includeTotal?: boolean
}

export async function listPublicEventsDirectory({
  q,
  category,
  region,
  page = 1,
  pageSize = DEFAULT_PUBLIC_PAGE_SIZE,
  includeTotal = true,
}: EventDirectoryOptions = {}): Promise<PublicEventsDirectoryResult> {
  await getDb()

  const safePage = Math.max(1, page)
  const safePageSize = Math.min(Math.max(1, pageSize), MAX_PUBLIC_PAGE_SIZE)
  const cappedPage = Math.min(safePage, MAX_PAGE_OFFSET)
  const safeText = (q || '').trim()
  const safeCategory = (category || '').trim()
  const safeRegion = (region || '').trim()
  const skip = (cappedPage - 1) * safePageSize
  const now = new Date()

  const baseFilter = buildDiscoverableFilters(now)
  if (safeCategory) baseFilter.category = safeCategory
  if (safeRegion) baseFilter.region = safeRegion

  const query = safeText ? { ...baseFilter, $text: { $search: safeText } } : baseFilter

  const projection = safeText ? ({ score: { $meta: 'textScore' } } as const) : undefined

  const countPromise = includeTotal ? getCachedTotalCount(query, safeText, safeCategory, safeRegion) : Promise.resolve(0)
  const docsPromise = Event.find(query, projection)
    .select(PUBLIC_EVENT_FIELDS)
    .sort(
      safeText
        ? ({ score: { $meta: 'textScore' }, date: 1, time: 1, _id: 1 } as Record<string, 1 | -1 | { $meta: string }>)
        : ({ date: 1, time: 1, _id: 1 } as Record<string, 1 | -1>)
    )
    .skip(skip)
    .limit(safePageSize)
    .lean()

  const [total, docs] = await Promise.all([countPromise, docsPromise])

  const events = docs
    .map(toPublicEvent)
    .filter((event) => isClientDiscoverableEvent(event, now.getTime()))

  return {
    events,
    total: includeTotal ? total : events.length,
    page: cappedPage,
    pageSize: safePageSize,
    totalPages: includeTotal ? Math.max(1, Math.ceil(total / safePageSize)) : Math.max(1, Math.ceil(events.length / safePageSize)),
  }
}

// Liste publique : rétro-compatible avec les appels existants.
export async function listPublicEvents(): Promise<PublicEvent[]> {
  const result = await listPublicEventsDirectory({ page: 1, pageSize: 20, includeTotal: false })
  return result.events
}

export type EventSitemapEntry = { id: string; updatedAt?: Date | string | null }

export async function countPublicEventsForSitemap(): Promise<number> {
  await getDb()
  return Event.estimatedDocumentCount().maxTimeMS(2_000)
}

export async function listPublicEventsForSitemapPage(params: { offset: number; limit: number }): Promise<EventSitemapEntry[]> {
  await getDb()
  const offset = Math.max(0, Math.floor(params.offset))
  const limit = Math.min(5_000, Math.max(1, Math.floor(params.limit)))
  const docs = await Event.find(buildDiscoverableFilters())
    .select('_id updatedAt')
    .sort({ date: 1, _id: 1 })
    .skip(offset)
    .limit(limit)
    .lean()
  return docs.map((doc) => ({ id: String(doc._id), updatedAt: doc.updatedAt }))
}

export async function searchPublicEvents(query: string): Promise<PublicEvent[]> {
  const safeQuery = (query || '').trim()
  const normalizedQuery = normalizeGeoText(safeQuery)

  if (normalizedQuery.length < 2) return []

  if (!safeQuery) return []

  const result = await listPublicEventsDirectory({
    q: safeQuery,
    page: 1,
    pageSize: DEFAULT_SEARCH_LIMIT,
    includeTotal: false,
  })

  return result.events
}

export type EventAccessResult =
  | { status: 'not_found' }
  | { status: 'ok'; event: PublicEvent }

export async function getEventById(id: string): Promise<EventAccessResult> {
  if (!mongoose.isValidObjectId(id)) return { status: 'not_found' }
  await getDb()
  const doc = await Event.findById(id).lean()
  if (!doc) return { status: 'not_found' }
  return { status: 'ok', event: toPublicEvent(doc) }
}
