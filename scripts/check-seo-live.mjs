#!/usr/bin/env node

const rawBaseUrl = (process.env.LIB_SEO_LIVE_BASE_URL || process.env.PUBLIC_SITE_URL || 'https://liveinblack.com').trim()
const expectedHost = (process.env.EXPECTED_PUBLIC_SITE_HOST || 'liveinblack.com').trim().toLowerCase()
const allowLocal = process.env.ALLOW_LOCAL_SEO_LIVE === 'true'
const timeoutMs = Number(process.env.SEO_LIVE_TIMEOUT_MS || 15000)

function normalizeBaseUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' && !allowLocal) throw new Error('LIB_SEO_LIVE_BASE_URL/PUBLIC_SITE_URL doit utiliser https:// en mode live')
  if (!allowLocal && url.hostname.toLowerCase() !== expectedHost) throw new Error(`le domaine live doit être ${expectedHost}`)
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('l’URL live doit contenir uniquement le domaine, sans chemin ni paramètres')
  return url.origin
}

function assertIncludes(body, snippets, label) {
  for (const snippet of snippets) {
    if (!body.includes(snippet)) throw new Error(`${label}: contenu attendu manquant « ${snippet} »`)
  }
}

async function fetchText(baseUrl, path) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'LIVEINBLACK-SEO-Live-Check/1.0' },
    })
    const body = await response.text()
    return { response, body }
  } finally {
    clearTimeout(timeout)
  }
}

const baseUrl = normalizeBaseUrl(rawBaseUrl)
const requiredChecks = [
  {
    path: '/robots.txt',
    contentType: 'text/plain',
    includes: ['User-Agent: *', `Sitemap: ${baseUrl}/sitemap.xml`, 'Disallow: /api/', 'Disallow: /agent'],
  },
  {
    path: '/sitemap.xml',
    contentType: 'xml',
    includes: ['<sitemapindex', `${baseUrl}/sitemaps/core/0.xml`, '/sitemaps/blog/'],
  },
  {
    path: '/sitemaps/core/0.xml',
    contentType: 'xml',
    includes: ['<urlset', `${baseUrl}/home`, `${baseUrl}/blog`, `${baseUrl}/blog/benin`, `${baseUrl}/events`, `${baseUrl}/providers`, `${baseUrl}/organizers`],
  },
  {
    path: '/llms.txt',
    contentType: 'text/plain',
    includes: ['LIVEINBLACK', 'Marché principal : Bénin', `${baseUrl}/sitemap.xml`, `${baseUrl}/blog/benin`, `${baseUrl}/opensearch.xml`],
  },
  {
    path: '/opensearch.xml',
    contentType: 'application/opensearchdescription+xml',
    includes: ['OpenSearchDescription', 'Recherche LIVEINBLACK Bénin', 'search?q={searchTerms}'],
  },
  {
    path: '/blog/feed.xml',
    contentType: 'application/rss+xml',
    includes: ['<rss', '<language>fr-BJ</language>', '<channel>'],
  },
  {
    path: '/blog/feed.json',
    contentType: 'application/feed+json',
    includes: ['https://jsonfeed.org/version/1.1', '"language":"fr-BJ"', '"feed_url"'],
  },
  {
    path: '/home',
    contentType: 'text/html',
    includes: ['lang="fr-BJ"', 'application/ld+json', 'LIVEINBLACK', 'Événements, billets et prestataires au Bénin'],
  },
  {
    path: '/blog/benin',
    contentType: 'text/html',
    includes: [
      'Événements au Bénin',
      'FAQPage',
      'application/ld+json',
      'organizer-signup',
      'provider-signup',
      'blog_benin_supply',
      'blog_benin_city_guides',
    ],
  },
]

const optionalVerificationChecks = [
  { env: 'GOOGLE_SITE_VERIFICATION', path: '/home', snippet: 'google-site-verification' },
  { env: 'BING_SITE_VERIFICATION', path: '/home', snippet: 'msvalidate.01' },
  { env: 'YANDEX_SITE_VERIFICATION', path: '/home', snippet: 'yandex-verification' },
  { env: 'PINTEREST_SITE_VERIFICATION', path: '/home', snippet: 'p:domain_verify' },
  { env: 'NEXT_PUBLIC_GA_MEASUREMENT_ID', path: '/home', snippet: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID },
]

const failures = []
const checkedBodies = new Map()

for (const check of requiredChecks) {
  try {
    const { response, body } = await fetchText(baseUrl, check.path)
    checkedBodies.set(check.path, { response, body })
    if (!response.ok) throw new Error(`${check.path}: HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes(check.contentType)) throw new Error(`${check.path}: content-type inattendu (${contentType || 'absent'})`)
    assertIncludes(body, check.includes, check.path)
    console.log(`${check.path}: OK`)
  } catch (error) {
    failures.push(error.message)
  }
}

for (const check of optionalVerificationChecks) {
  const expected = process.env[check.env]?.trim()
  if (!expected) continue

  try {
    let cached = checkedBodies.get(check.path)
    if (!cached) {
      const fetched = await fetchText(baseUrl, check.path)
      cached = fetched
      checkedBodies.set(check.path, fetched)
    }
    assertIncludes(cached.body, [check.snippet, expected], check.env)
    console.log(`${check.env}: OK`)
  } catch (error) {
    failures.push(error.message)
  }
}

if (failures.length > 0) {
  console.error(`Check SEO live KO — ${failures.length} problème(s) sur ${baseUrl}`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Check SEO live OK — fichiers indexation, sitemap core, flux, balises, accueil et hub Bénin vérifiés sur ${baseUrl}.`)
