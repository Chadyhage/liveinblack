import { getCachedPublishedPosts } from '@/lib/server/publicCache'
import { blogJsonFeed } from '@/lib/server/seo/jsonFeed'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { posts } = await getCachedPublishedPosts({ page: 1, pageSize: 50 })
    return Response.json(blogJsonFeed({ site: SITE, posts }), {
      headers: {
        'Content-Type': 'application/feed+json; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
      },
    })
  } catch {
    return Response.json({ error: 'Flux temporairement indisponible' }, {
      status: 503,
      headers: { 'Retry-After': '60' },
    })
  }
}
