export const SITEMAP_PAGE_SIZE = 5_000

export const STATIC_SITEMAP_ROUTES = [
  { path: '/home', changeFrequency: 'daily', priority: 1 },
  { path: '/events', changeFrequency: 'daily', priority: 0.9 },
  { path: '/providers', changeFrequency: 'daily', priority: 0.8 },
  { path: '/organizers', changeFrequency: 'daily', priority: 0.8 },
  { path: '/blog', changeFrequency: 'daily', priority: 0.7 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.4 },
  { path: '/organizer-signup', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/provider-signup', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/legal-notice', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/cookies', changeFrequency: 'yearly', priority: 0.2 },
] as const

export type SitemapCollection = 'blog' | 'events' | 'organizers' | 'providers'

export function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character] || character)
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / SITEMAP_PAGE_SIZE))
}

export function sitemapIndexXml(urls: string[]): string {
  const nodes = urls.map((url) => `<sitemap><loc>${escapeXml(url)}</loc></sitemap>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${nodes}</sitemapindex>`
}

export type SitemapUrl = {
  url: string
  lastModified?: Date | string | null
  changeFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  priority?: number
}

export function urlSetXml(entries: SitemapUrl[]): string {
  const nodes = entries.map((entry) => {
    const lastModified = entry.lastModified ? `<lastmod>${escapeXml(new Date(entry.lastModified).toISOString())}</lastmod>` : ''
    const frequency = entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : ''
    const priority = entry.priority === undefined ? '' : `<priority>${entry.priority}</priority>`
    return `<url><loc>${escapeXml(entry.url)}</loc>${lastModified}${frequency}${priority}</url>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${nodes}</urlset>`
}

export function xmlResponse(xml: string, status = 200): Response {
  return new Response(xml, { status, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
}
