import { getCachedPublishedPosts } from '@/lib/server/publicCache'
import { blogRssXml } from '@/lib/server/seo/rssXml'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { posts } = await getCachedPublishedPosts({ page: 1, pageSize: 50 })
    return new Response(blogRssXml({ site: SITE, posts }), {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
      },
    })
  } catch {
    return new Response('Flux temporairement indisponible', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' },
    })
  }
}
