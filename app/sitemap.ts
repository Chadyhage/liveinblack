import type { MetadataRoute } from 'next'
import {
  getCachedPublicEvents as listPublicEvents,
  getCachedPublicOrganizers as listPublicOrganizers,
  getCachedPublicProviders as listPublicProviders,
} from '@/lib/server/publicCache'
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [events, organizers, providers, posts] = await Promise.all([
    listPublicEvents().catch(() => []),
    listPublicOrganizers().catch(() => []),
    listPublicProviders().catch(() => []),
    listAllPublishedPostsForSitemap().catch(() => []),
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
    lastModified: p.updatedAt ? new Date(p.updatedAt as unknown as string) : new Date(p.publishedAt as unknown as string),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  return [...staticEntries, ...eventEntries, ...organizerEntries, ...providerEntries, ...postEntries]
}
