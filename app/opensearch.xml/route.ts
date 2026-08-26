import { escapeXml } from '@/lib/server/seo/sitemapXml'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

export const revalidate = 3600

export function GET() {
  const base = SITE.replace(/\/$/, '')
  const searchTemplate = `${base}/search?q={searchTerms}`

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">',
    '<ShortName>LIVEINBLACK</ShortName>',
    '<LongName>Recherche LIVEINBLACK Bénin</LongName>',
    '<Description>Rechercher des événements, organisateurs, prestataires et guides au Bénin sur LIVEINBLACK.</Description>',
    '<Tags>événements Bénin billetterie Cotonou organisateurs prestataires sorties</Tags>',
    '<Contact>contact@liveinblack.com</Contact>',
    '<InputEncoding>UTF-8</InputEncoding>',
    `<Image height="16" width="16" type="image/x-icon">${escapeXml(`${base}/favicon.ico`)}</Image>`,
    `<Url type="text/html" method="get" template="${escapeXml(searchTemplate)}"/>`,
    '</OpenSearchDescription>',
  ].join('')

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/opensearchdescription+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
