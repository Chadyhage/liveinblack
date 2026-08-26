import { escapeXml } from './sitemapXml'

export type RssPost = {
  slug: string
  title: string
  excerpt?: string | null
  metaDescription?: string | null
  authorName?: string | null
  publishedAt?: Date | string | null
  updatedAt?: Date | string | null
  category?: string | null
}

function validRssDate(value?: Date | string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toUTCString()
}

export function blogRssXml({ site, posts }: { site: string; posts: RssPost[] }): string {
  const base = site.replace(/\/$/, '')
  const items = posts.map((post) => {
    const url = `${base}/blog/${encodeURIComponent(post.slug)}`
    const published = validRssDate(post.publishedAt)
    const description = post.excerpt || post.metaDescription || ''
    return [
      '<item>',
      `<title>${escapeXml(post.title)}</title>`,
      `<link>${escapeXml(url)}</link>`,
      `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
      description ? `<description>${escapeXml(description)}</description>` : '',
      published ? `<pubDate>${published}</pubDate>` : '',
      post.authorName ? `<dc:creator>${escapeXml(post.authorName)}</dc:creator>` : '',
      post.category ? `<category>${escapeXml(post.category)}</category>` : '',
      '</item>',
    ].join('')
  }).join('')

  const latest = posts
    .map((post) => validRssDate(post.updatedAt || post.publishedAt))
    .find(Boolean)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '<channel>',
    '<title>Le journal LIVEINBLACK</title>',
    `<link>${escapeXml(`${base}/blog`)}</link>`,
    '<description>Guides, actualités et conseils sur les événements au Bénin et en Afrique de l’Ouest.</description>',
    '<language>fr-BJ</language>',
    `<atom:link href="${escapeXml(`${base}/blog/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    latest ? `<lastBuildDate>${latest}</lastBuildDate>` : '',
    items,
    '</channel>',
    '</rss>',
  ].join('')
}
