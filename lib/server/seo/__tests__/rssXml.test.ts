import { describe, expect, it } from 'vitest'
import { blogRssXml } from '../rssXml'

describe('blogRssXml', () => {
  it('génère un flux fr-BJ valide et échappe le contenu éditorial', () => {
    const xml = blogRssXml({
      site: 'https://liveinblack.com/',
      posts: [{
        slug: 'sortir-a-cotonou',
        title: 'Sortir & vibrer <à Cotonou>',
        excerpt: 'Concerts & soirées',
        authorName: 'LIVEINBLACK',
        category: 'benin',
        publishedAt: '2026-08-25T10:00:00.000Z',
      }],
    })

    expect(xml).toContain('<language>fr-BJ</language>')
    expect(xml).toContain('Sortir &amp; vibrer &lt;à Cotonou&gt;')
    expect(xml).toContain('<guid isPermaLink="true">https://liveinblack.com/blog/sortir-a-cotonou</guid>')
    expect(xml).toContain('<pubDate>Tue, 25 Aug 2026 10:00:00 GMT</pubDate>')
    expect(xml).not.toContain('<à Cotonou>')
  })
})
