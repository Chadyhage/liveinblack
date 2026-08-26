export type JsonFeedPost = {
  slug: string
  title: string
  excerpt?: string | null
  metaDescription?: string | null
  authorName?: string | null
  publishedAt?: Date | string | null
  updatedAt?: Date | string | null
  coverImageUrl?: string | null
  tags?: string[] | null
}

function isoDate(value?: Date | string | null): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export function blogJsonFeed({ site, posts }: { site: string; posts: JsonFeedPost[] }) {
  const base = site.replace(/\/$/, '')
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Le journal LIVEINBLACK',
    home_page_url: `${base}/blog`,
    feed_url: `${base}/blog/feed.json`,
    description: 'Guides, actualités et conseils sur les événements au Bénin et en Afrique de l’Ouest.',
    language: 'fr-BJ',
    authors: [{ name: 'LIVEINBLACK', url: base }],
    items: posts.map((post) => {
      const url = `${base}/blog/${encodeURIComponent(post.slug)}`
      const summary = post.excerpt || post.metaDescription || ''
      return {
        id: url,
        url,
        title: post.title,
        summary,
        content_text: summary,
        image: post.coverImageUrl || undefined,
        date_published: isoDate(post.publishedAt),
        date_modified: isoDate(post.updatedAt || post.publishedAt),
        authors: [{ name: post.authorName || 'LIVEINBLACK' }],
        tags: post.tags || undefined,
      }
    }),
  }
}
