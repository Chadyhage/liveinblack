import { countPublishedPostsForSitemap } from '@/lib/server/blog'
import { countPublicEventsForSitemap } from '@/lib/server/events/events'
import { countPublicOrganizersForSitemap } from '@/lib/server/organizer/organizers'
import { countPublicProvidersForSitemap } from '@/lib/server/provider/providers'
import { pageCount, sitemapIndexXml, xmlResponse, type SitemapCollection } from '@/lib/server/seo/sitemapXml'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

export async function GET() {
  const collections: { name: SitemapCollection; count: () => Promise<number> }[] = [
    { name: 'blog', count: countPublishedPostsForSitemap },
    { name: 'events', count: countPublicEventsForSitemap },
    { name: 'organizers', count: countPublicOrganizersForSitemap },
    { name: 'providers', count: countPublicProvidersForSitemap },
  ]
  const totals = await Promise.all(collections.map(async (collection) => { try { return await collection.count() } catch { return 0 } }))
  const urls = [`${SITE}/sitemaps/core/0.xml`]
  collections.forEach((collection, index) => {
    for (let page = 0; page < pageCount(totals[index]); page += 1) urls.push(`${SITE}/sitemaps/${collection.name}/${page}.xml`)
  })
  return xmlResponse(sitemapIndexXml(urls))
}
