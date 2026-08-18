import type { MetadataRoute } from 'next'
import {
  listPublicEventsDirectory,
  type PublicEvent,
  type PublicEventsDirectoryResult,
} from '@/lib/server/events'
import { listPublicProvidersDirectory, type PublicProvider } from '@/lib/server/providers'
import { listPublicOrganizersDirectory, type PublicOrganizerDirectoryEntry } from '@/lib/server/organizers'
import { listAllPublishedPostsForSitemap } from '@/lib/server/blog'

// Même convention que app/ticket/[token]/page.tsx et les routes checkout :
// PUBLIC_SITE_URL en env, jamais déduit de Host/Origin. Route native Next.js
// (app/sitemap.ts) — Vercel la sert directement à /sitemap.xml, aucune config
// supplémentaire requise.
const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '/home', priority: 1, changeFrequency: 'daily' },
  { path: '/events', priority: 0.9, changeFrequency: 'daily' },
  { path: '/providers', priority: 0.8, changeFrequency: 'daily' },
  { path: '/organizers', priority: 0.8, changeFrequency: 'daily' },
  { path: '/blog', priority: 0.7, changeFrequency: 'daily' },
  { path: '/about', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/organizer-signup', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/provider-signup', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/terms', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/legal-notice', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.2, changeFrequency: 'yearly' },
]

const SITEMAP_CHUNK_SIZE = 120
const SITEMAP_MAX_ENTRIES = Number(process.env.SITEMAP_MAX_ENTRIES || '3000')
const SITEMAP_MAX_PAGES = Number(process.env.SITEMAP_MAX_PAGES || '25')
const BLOG_SITEMAP_MAX = Number(process.env.SITEMAP_BLOG_LIMIT || '200')

function hasRemainingQuota(currentCount: number) {
  if (!Number.isFinite(SITEMAP_MAX_ENTRIES) || SITEMAP_MAX_ENTRIES <= 0) return true
  return currentCount < SITEMAP_MAX_ENTRIES
}

function getSafeLimitRemaining(): number {
  if (!Number.isFinite(SITEMAP_MAX_ENTRIES) || SITEMAP_MAX_ENTRIES <= 0) return Number.MAX_SAFE_INTEGER
  return Math.max(1, SITEMAP_MAX_ENTRIES)
}

async function collectAllEvents() {
  try {
    const events: PublicEvent[] = []
    let page = 1
    let remaining = getSafeLimitRemaining()
    const maxPages = Number.isFinite(SITEMAP_MAX_PAGES) && SITEMAP_MAX_PAGES > 0 ? SITEMAP_MAX_PAGES : 25

    for (;;) {
      const pageLimit = Math.min(SITEMAP_CHUNK_SIZE, Math.max(1, Math.min(remaining, SITEMAP_CHUNK_SIZE)))
      if (pageLimit <= 0 || page > maxPages) break

      const result: PublicEventsDirectoryResult = await listPublicEventsDirectory({
        page,
        pageSize: pageLimit,
        includeTotal: false,
      })

      if (result.events.length === 0) break
      events.push(...result.events)
      remaining -= result.events.length
      if (result.events.length < pageLimit) break
      if (!hasRemainingQuota(events.length)) break
      page += 1
    }

    return events
  } catch {
    return []
  }
}

async function collectAllOrganizers() {
  try {
    const organizers: PublicOrganizerDirectoryEntry[] = []
    let page = 1
    let remaining = getSafeLimitRemaining()
    const maxPages = Number.isFinite(SITEMAP_MAX_PAGES) && SITEMAP_MAX_PAGES > 0 ? SITEMAP_MAX_PAGES : 25

    for (;;) {
      const pageSize = Math.min(SITEMAP_CHUNK_SIZE, Math.max(1, Math.min(remaining, SITEMAP_CHUNK_SIZE)))
      if (pageSize <= 0 || page > maxPages) break

      const result = await listPublicOrganizersDirectory({
        page,
        pageSize,
        includeTotal: false,
      })
      if (result.organizers.length === 0) break

      organizers.push(...result.organizers)
      remaining -= result.organizers.length
      if (result.organizers.length < pageSize) break
      if (!hasRemainingQuota(organizers.length)) break
      page += 1
    }

    return SITEMAP_MAX_ENTRIES > 0 ? organizers.slice(0, SITEMAP_MAX_ENTRIES) : organizers
  } catch {
    return []
  }
}

async function collectAllProviders() {
  try {
    const providers: PublicProvider[] = []
    let page = 1
    let remaining = getSafeLimitRemaining()
    const maxPages = Number.isFinite(SITEMAP_MAX_PAGES) && SITEMAP_MAX_PAGES > 0 ? SITEMAP_MAX_PAGES : 25

    for (;;) {
      const pageSize = Math.min(SITEMAP_CHUNK_SIZE, Math.max(1, Math.min(remaining, SITEMAP_CHUNK_SIZE)))
      if (pageSize <= 0 || page > maxPages) break

      const result = await listPublicProvidersDirectory({
        page,
        pageSize,
        includeTotal: false,
      })
      if (result.providers.length === 0) break

      providers.push(...result.providers)
      remaining -= result.providers.length
      if (result.providers.length < pageSize) break
      if (!hasRemainingQuota(providers.length)) break
      page += 1
    }

    return SITEMAP_MAX_ENTRIES > 0 ? providers.slice(0, SITEMAP_MAX_ENTRIES) : providers
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [events, organizers, providers, posts] = await Promise.all([
    collectAllEvents(),
    collectAllOrganizers(),
    collectAllProviders(),
    listAllPublishedPostsForSitemap({
      pageSize: BLOG_SITEMAP_MAX,
    }).catch(() => []),
  ])

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  const eventEntries: MetadataRoute.Sitemap = events.map((e) => ({
    url: `${SITE}/events/${e.id}`,
    lastModified: e.updatedAt ? new Date(e.updatedAt as unknown as string) : undefined,
    changeFrequency: 'daily',
    priority: 0.7,
  }))

  const organizerEntries: MetadataRoute.Sitemap = organizers.map((o) => ({
    url: `${SITE}/organizers/${o.slug}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const providerEntries: MetadataRoute.Sitemap = providers.map((p) => ({
    url: `${SITE}/providers/${p.userId}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const postEntries: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${SITE}/blog/${p.slug}`,
    lastModified: p.updatedAt
      ? new Date(p.updatedAt as unknown as string)
      : p.publishedAt
        ? new Date(p.publishedAt as unknown as string)
        : undefined,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  return [...staticEntries, ...eventEntries, ...organizerEntries, ...providerEntries, ...postEntries]
}
