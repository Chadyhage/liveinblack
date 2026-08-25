import { getDb } from '@/lib/db/mongoose'
import OrganizerProfile, { type OrganizerProfileDoc } from '@/lib/models/OrganizerProfile'
import Event from '@/lib/models/Event'
import { isPlaceholderEvent } from '@/lib/shared/eventDiscovery'
import { isEventEnded } from '@/lib/shared/event-time'
import { normalizeGeoText } from '@/lib/shared/locations'
import type { SortOrder } from 'mongoose'
import type { PublicEvent } from '../events/events'

export type PublicOrganizer = OrganizerProfileDoc & { userId: string; slug: string }

export type OrganizerDirectoryEvent = {
  id: string
  name: string
  date: string
  dateDisplay: string
  city: string
  region: string
}

export type PublicOrganizerDirectoryEntry = PublicOrganizer & {
  nextEvent: OrganizerDirectoryEvent | null
}

export type PublicOrganizerDirectoryParams = {
  q?: string
  region?: string
  upcoming?: boolean | string
  sort?: 'popular' | 'recent'
  page?: number
  pageSize?: number
  includeTotal?: boolean
}

export type PublicOrganizerDirectoryResult = {
  organizers: PublicOrganizerDirectoryEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const PUBLIC_DIRECTORY_PAGE_SIZE = 20
const MAX_DIRECTORY_PAGE = 4_000
const MAX_TOTAL_COUNT_CACHE_ENTRIES = 200
const ORGANIZER_FIELDS =
  'userId slug publicName shortDescription longDescription city country regionId avatarUrl bannerUrl status isVerified followersCount totalEventsCount viewsCount eventClicksCount mediaViewsCount createdAt updatedAt'

const ORGANIZER_TOTAL_TTL_MS = 30_000

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
  filter,
  upcoming,
  sort,
  nowDay,
}: {
  filter: Record<string, unknown>
  upcoming: boolean
  sort: string
  nowDay: string
}) {
  return JSON.stringify({
    t: 'organizers',
    filter,
    upcoming,
    sort,
    nowDay,
  })
}

function getCachedTotalCount(
  filter: Record<string, unknown>,
  upcoming: boolean,
  sortKey: string,
): Promise<number> {
  const nowMs = Date.now()
  pruneCountCache(nowMs)
  const nowDay = new Date(nowMs).toISOString().slice(0, 10)
  const key = getTotalCacheKey({ filter, upcoming, sort: sortKey, nowDay })
  const cached = countCache.get(key)
  if (cached && cached.expiresAt > nowMs) return Promise.resolve(cached.value)

  const existing = inFlightCount.get(key)
  if (existing) return existing

  const computePromise = (async () => {
    const total = await (upcoming
      ? OrganizerProfile.aggregate<{ total: number }>([
          { $match: filter },
          {
            $lookup: {
              from: 'events',
              let: { organizerUserId: '$userId' },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ['$organizerId', '$$organizerUserId'] },
                  },
                },
                {
                  $match: {
                    cancelled: { $ne: true },
                    isDemo: { $ne: true },
                    $and: [
                      {
                        $or: [
                          { publishAt: { $exists: false } },
                          { publishAt: null },
                          { publishAt: { $lte: new Date() } },
                        ],
                      },
                      {
                        $or: [
                          { closingDate: { $exists: false } },
                          { closingDate: null },
                          { closingDate: { $gte: new Date() } },
                        ],
                      },
                    ],
                    date: { $gte: new Date().toISOString().slice(0, 10) },
                  },
                },
                { $limit: 1 },
              ],
              as: 'upcomingEvents',
            },
          },
          { $match: { upcomingEvents: { $ne: [] } } },
          { $count: 'total' },
        ] as const)
      : OrganizerProfile.countDocuments(filter)
    ).then((rows) => {
      const value = Array.isArray(rows) ? (rows[0]?.total || 0) : rows
      return Number(value)
    })

    countCache.set(key, { value: total, expiresAt: Date.now() + ORGANIZER_TOTAL_TTL_MS })
    inFlightCount.delete(key)
    return total
  })()
    .catch((error) => {
      inFlightCount.delete(key)
      throw error
    })

  inFlightCount.set(key, computePromise)
  return computePromise
}

function buildOrganizerFilters(params: PublicOrganizerDirectoryParams) {
  const region = params.region?.trim() || ''
  const search = (params.q || '').trim()
  const normalizedSearch = normalizeGeoText(search)

  const filter: Record<string, unknown> = { status: 'public' }
  const andClauses: Record<string, unknown>[] = []

  if (region) {
    andClauses.push({ $or: [{ regionId: region }, { zonesIntervention: region }] })
  }

  if (search) {
    if (normalizedSearch.length <= 1) {
      andClauses.push({
        $or: [
          { publicName: { $regex: new RegExp(escapeRegex(search), 'i') } },
          { city: { $regex: new RegExp(escapeRegex(search), 'i') } },
          { country: { $regex: new RegExp(escapeRegex(search), 'i') } },
          { shortDescription: { $regex: new RegExp(escapeRegex(search), 'i') } },
        ],
      })
    } else {
      andClauses.push({ $text: { $search: normalizedSearch } })
    }
  }

  if (andClauses.length > 0) filter.$and = andClauses

  return filter
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function organizerSort(sort: PublicOrganizerDirectoryParams['sort'] = 'popular'): Record<string, SortOrder> {
  if (sort === 'recent') return { createdAt: -1 }
  return { followersCount: -1 }
}

function attachNextEvents(
  profiles: PublicOrganizer[]
): Promise<PublicOrganizerDirectoryEntry[]> {
  if (profiles.length === 0) return Promise.resolve([])

  const organizerIds = profiles.map((profile) => profile.userId)
  const now = new Date()
  const nowDay = now.toISOString().slice(0, 10)

  return Event.aggregate<{
    _id: string
    nextEvent: {
      _id: string
      name: string
      date: string
      dateDisplay?: string
      city?: string
      region?: string
      publishAt?: string | Date | null
      cancelled?: boolean
      time?: string
    }
  }>([
    {
      $match: {
        organizerId: { $in: organizerIds },
        cancelled: { $ne: true },
        isDemo: { $ne: true },
        $and: [
          {
            $or: [
              { publishAt: { $exists: false } },
              { publishAt: null },
              { publishAt: { $lte: now } },
            ],
          },
          { $or: [{ closingDate: { $exists: false } }, { closingDate: null }, { closingDate: { $gte: now } }] },
        ],
        date: { $gte: nowDay },
      },
    },
    { $sort: { organizerId: 1, date: 1, time: 1 } },
    {
      $group: {
        _id: '$organizerId',
        nextEvent: { $first: '$$ROOT' },
      },
    },
  ]).then((rows) => {
    const nowMs = Date.now()
    const eventsByOrganizer = new Map<string, OrganizerDirectoryEvent>()

    for (const row of rows) {
      const event = row.nextEvent
      if (!event || isPlaceholderEvent(event) || isEventEnded(event, nowMs)) continue
      if (event.publishAt && new Date(event.publishAt).getTime() > nowMs) continue

      eventsByOrganizer.set(String(row._id), {
        id: String(event._id),
        name: event.name,
        date: event.date,
        dateDisplay: event.dateDisplay || event.date,
        city: event.city || '',
        region: event.region || '',
      })
    }

    return profiles.map((profile) => ({
      ...profile,
      nextEvent: eventsByOrganizer.get(profile.userId) || null,
    })) as PublicOrganizerDirectoryEntry[]
  })
}

/**
 * Legacy: retourne tous les profils organisateurs publics. Conserver pour
 * usages spécifiques (sitemap, exports), la route annuaire doit utiliser la
 * version paginée.
 */
export async function listPublicOrganizers(): Promise<PublicOrganizer[]> {
  await getDb()
  return OrganizerProfile.find({ status: 'public' })
    .select(ORGANIZER_FIELDS)
    .sort({ followersCount: -1 })
    .lean()
}

export type OrganizerSitemapEntry = { slug: string; updatedAt?: Date | string | null }

export async function countPublicOrganizersForSitemap(): Promise<number> {
  await getDb()
  return OrganizerProfile.estimatedDocumentCount().maxTimeMS(2_000)
}

export async function listPublicOrganizersForSitemapPage(params: { offset: number; limit: number }): Promise<OrganizerSitemapEntry[]> {
  await getDb()
  const offset = Math.max(0, Math.floor(params.offset))
  const limit = Math.min(5_000, Math.max(1, Math.floor(params.limit)))
  const docs = await OrganizerProfile.find(buildOrganizerFilters({}))
    .select('slug updatedAt')
    .sort({ updatedAt: -1, _id: 1 })
    .skip(offset)
    .limit(limit)
    .lean()
  return docs.map((doc) => ({ slug: String(doc.slug), updatedAt: doc.updatedAt }))
}

export async function listPublicOrganizersWithNextEvent(): Promise<PublicOrganizerDirectoryEntry[]> {
  const data = await listPublicOrganizersDirectory()
  return data.organizers
}

export async function listPublicOrganizersDirectory(
  params: PublicOrganizerDirectoryParams = {}
): Promise<PublicOrganizerDirectoryResult> {
  await getDb()
  const page = Math.max(1, Number(params.page) || 1)
  const cappedPage = Math.min(Math.max(1, page), MAX_DIRECTORY_PAGE)
  const pageSize = Math.max(12, Math.min(200, Number(params.pageSize) || PUBLIC_DIRECTORY_PAGE_SIZE))
  const includeTotal = params.includeTotal !== false
  const sort = organizerSort(params.sort)
  const isUpcoming = Boolean(params.upcoming)
  const normalizedSearch = normalizeGeoText(params.q || '').trim()
  const usesTextSearch = normalizedSearch.length > 1
  const hasUnsupportedSearch = params.q?.trim() ? normalizedSearch.length > 0 && normalizedSearch.length < 2 : false

  if (hasUnsupportedSearch) {
    return {
      organizers: [],
      total: 0,
      page: cappedPage,
      pageSize,
      totalPages: 1,
    }
  }
  const filter = buildOrganizerFilters(params)

  const totalPromise = includeTotal
    ? getCachedTotalCount(filter, isUpcoming, params.sort === 'recent' ? 'recent' : 'popular')
    : Promise.resolve(0)

  const [profiles, rawTotal] = await Promise.all([
    (() => {
    const query = OrganizerProfile.find(filter).select(ORGANIZER_FIELDS).skip((cappedPage - 1) * pageSize).limit(pageSize).lean()
      if (usesTextSearch) {
      return query
        .select({ score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, ...sort, createdAt: -1 })
    }
      return query.sort(sort)
    })(),
    totalPromise,
  ])

  const organizersWithEvents = await attachNextEvents(profiles as PublicOrganizer[])
  const filtered = params.upcoming
    ? organizersWithEvents.filter((entry) => Boolean(entry.nextEvent))
    : organizersWithEvents

  const total = includeTotal ? rawTotal : filtered.length

  const effectiveTotal = includeTotal ? total : filtered.length
  const sorted = filtered

  return {
    organizers: sorted,
    total: effectiveTotal,
    page: cappedPage,
    pageSize,
    totalPages: includeTotal ? Math.max(1, Math.ceil(effectiveTotal / pageSize)) : 1,
  }
}

// Pas de bypass "isSelf" ici (contrairement aux prestataires) : fidèle au
// comportement legacy où seul un profil status:'public' est servi publiquement,
// le propriétaire devant passer par son studio pour prévisualiser.
export async function getOrganizerBySlug(slug: string): Promise<PublicOrganizer | null> {
  await getDb()
  const doc = await OrganizerProfile.findOne({ slug, status: 'public' }).lean()
  return (doc as PublicOrganizer) || null
}

// Utilisé par le bloc "organisateur" de la page détail événement — ne renvoie
// que si le profil est public (sinon la page détail retombe sur le texte brut
// event.organizerName, comme le faisait déjà le legacy).
export async function getPublicOrganizerByUserId(userId: string): Promise<PublicOrganizer | null> {
  await getDb()
  const doc = await OrganizerProfile.findOne({ userId, status: 'public' }).lean()
  return (doc as PublicOrganizer) || null
}

export async function getOrganizerEvents(organizerId: string): Promise<{ upcoming: PublicEvent[]; past: PublicEvent[] }> {
  await getDb()
  const docs = await Event.find({
    organizerId,
    cancelled: { $ne: true },
  })
    .sort({ date: -1 })
    .lean()

  const now = Date.now()
  // Filtre non-privé/non-annulé déjà fait en requête ; ici juste filler + date
  // de publication future — PAS de filtre "pas terminé" : on veut aussi bien
  // les événements à venir que les passés, triés ensuite séparément.
  const events = docs
    .filter((e) => !isPlaceholderEvent(e) && !(e.publishAt && new Date(e.publishAt).getTime() > now))
    .map((e) => ({ ...e, id: String(e._id) })) as PublicEvent[]

  const upcoming = events.filter((e) => !isEventEnded(e, now)).sort((a, b) => a.date.localeCompare(b.date))
  const past = events.filter((e) => isEventEnded(e, now)).slice(0, 6)

  return { upcoming, past }
}
