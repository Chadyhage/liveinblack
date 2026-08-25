import { describe, expect, it } from 'vitest'
import { escapeXml, pageCount, sitemapIndexXml, urlSetXml } from '../sitemapXml'

describe('sitemap XML', () => {
  it('échappe les caractères réservés', () => {
    expect(escapeXml(`https://example.test/?a=1&b=<"'>`)).toBe('https://example.test/?a=1&amp;b=&lt;&quot;&apos;&gt;')
  })

  it('calcule des lots de 5 000 URLs', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(5_000)).toBe(1)
    expect(pageCount(5_001)).toBe(2)
  })

  it('produit un index et un ensemble d’URLs valides', () => {
    expect(sitemapIndexXml(['https://liveinblack.com/sitemaps/core/0.xml'])).toContain('<sitemapindex')
    const xml = urlSetXml([{ url: 'https://liveinblack.com/events/1', priority: 0.7, changeFrequency: 'daily' }])
    expect(xml).toContain('<urlset')
    expect(xml).toContain('<priority>0.7</priority>')
  })
})
