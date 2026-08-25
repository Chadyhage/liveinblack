import { listPublishedPostsForSitemapPage } from '@/lib/server/blog'
import { listPublicEventsForSitemapPage } from '@/lib/server/events/events'
import { listPublicOrganizersForSitemapPage } from '@/lib/server/organizer/organizers'
import { listPublicProvidersForSitemapPage } from '@/lib/server/provider/providers'
import { SITEMAP_PAGE_SIZE, STATIC_SITEMAP_ROUTES, urlSetXml, xmlResponse, type SitemapCollection, type SitemapUrl } from '@/lib/server/seo/sitemapXml'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'
const COLLECTIONS = new Set<SitemapCollection>(['blog', 'events', 'organizers', 'providers'])

function parsePage(value: string): number | null {
  const normalized = value.replace(/\.xml$/i, '')
  if (!/^\d+$/.test(normalized)) return null
  const page = Number(normalized)
  return Number.isSafeInteger(page) && page >= 0 ? page : null
}

export async function GET(_request: Request, context: { params: Promise<{ collection: string; page: string }> }) {
  const { collection, page: rawPage } = await context.params
  const page = parsePage(rawPage)
  if (page === null || (collection !== 'core' && !COLLECTIONS.has(collection as SitemapCollection))) return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><error>Not found</error>', 404)
  if (collection === 'core') {
    if (page !== 0) return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><error>Not found</error>', 404)
    return xmlResponse(urlSetXml(STATIC_SITEMAP_ROUTES.map((route) => ({ url: `${SITE}${route.path}`, changeFrequency: route.changeFrequency, priority: route.priority }))))
  }

  const offset = page * SITEMAP_PAGE_SIZE
  let entries: SitemapUrl[] = []
  if (collection === 'blog') {
    const posts = await listPublishedPostsForSitemapPage({ offset, limit: SITEMAP_PAGE_SIZE })
    entries = posts.map((post) => ({ url: `${SITE}/blog/${post.slug}`, lastModified: post.updatedAt || post.publishedAt, changeFrequency: 'monthly', priority: 0.6 }))
  } else if (collection === 'events') {
    const events = await listPublicEventsForSitemapPage({ offset, limit: SITEMAP_PAGE_SIZE })
    entries = events.map((event) => ({ url: `${SITE}/events/${event.id}`, lastModified: event.updatedAt, changeFrequency: 'daily', priority: 0.7 }))
  } else if (collection === 'organizers') {
    const organizers = await listPublicOrganizersForSitemapPage({ offset, limit: SITEMAP_PAGE_SIZE })
    entries = organizers.filter((organizer) => organizer.slug).map((organizer) => ({ url: `${SITE}/organizers/${organizer.slug}`, lastModified: organizer.updatedAt, changeFrequency: 'weekly', priority: 0.6 }))
  } else {
    const providers = await listPublicProvidersForSitemapPage({ offset, limit: SITEMAP_PAGE_SIZE })
    entries = providers.filter((provider) => provider.userId).map((provider) => ({ url: `${SITE}/providers/${provider.userId}`, lastModified: provider.updatedAt, changeFrequency: 'weekly', priority: 0.6 }))
  }
  return xmlResponse(urlSetXml(entries))
}
