#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

const checks = [
  ['app/layout.tsx', ['metadataBase:', 'lang="fr-BJ"', 'inLanguage: "fr-BJ"', 'GOOGLE_SITE_VERIFICATION', 'BING_SITE_VERIFICATION', 'YANDEX_SITE_VERIFICATION', 'PINTEREST_SITE_VERIFICATION', '"p:domain_verify"', 'GoogleAnalytics', 'SpeedInsights', 'application/ld+json', '"@type": "WebApplication"', 'applicationCategory: "LifestyleApplication"', 'priceCurrency: "XOF"', 'geographicArea:', 'rel: "search"', 'url: "/opensearch.xml"', 'application/opensearchdescription+xml']],
  ['app/manifest.ts', ["id: '/'", "scope: '/'", 'display_override:', "orientation: 'portrait-primary'", 'icons:', 'screenshots:', 'shortcuts:', "url: '/events'", "url: '/providers'", "url: '/blog'"]],
  ['package.json', ['"check:growth:launch": "node --env-file=.env.local scripts/check-growth-launch.mjs"', '"check:growth:launch:full": "node --env-file=.env.local scripts/check-growth-launch.mjs --full"', '"check:seo:prod": "node --env-file=.env.local scripts/check-seo-production.mjs"', '"check:seo:live": "node --env-file=.env.local scripts/check-seo-live.mjs"']],
  ['scripts/check-growth-launch.mjs', ['--full', '--prod', '--live', '--build', 'CHECK_PROD_SEO', 'CHECK_LIVE_SEO', 'CHECK_BUILD', 'audit:growth', 'check:seo:prod', 'check:seo:live', 'Check croissance lancement KO']],
  ['scripts/check-seo-production.mjs', ['PUBLIC_SITE_URL', 'NEXT_PUBLIC_GA_MEASUREMENT_ID', 'GOOGLE_SITE_VERIFICATION', 'BING_SITE_VERIFICATION', 'YANDEX_SITE_VERIFICATION', 'PINTEREST_SITE_VERIFICATION', 'EXPECTED_PUBLIC_SITE_HOST', '.vercel.app', 'validateVerificationToken', 'Check SEO production KO']],
  ['scripts/check-seo-live.mjs', ['LIB_SEO_LIVE_BASE_URL', 'robots.txt', 'sitemap.xml', 'sitemaps/core/0.xml', "path: '/blog/benin'", 'FAQPage', 'blog_benin_supply', 'llms.txt', 'opensearch.xml', 'blog/feed.xml', 'blog/feed.json', 'google-site-verification', 'msvalidate.01', 'yandex-verification', 'p:domain_verify', 'Check SEO live KO']],
  ['docs/ops/seo-growth-launch-checklist.md', ['Google Search Console', 'Bing Webmaster Tools', 'Yandex Webmaster', 'Pinterest Domain Verification', 'Google Analytics 4', 'https://liveinblack.com/sitemap.xml', 'https://liveinblack.com/sitemaps/core/0.xml', '/blog/benin', 'npm run check:growth:launch:full', 'search_submit', 'purchase_confirmed', 'professional_application_submit', 'Go seulement si', 'No-go si']],
  ['README.md', ['docs/ops/seo-growth-launch-checklist.md', 'Search Console', 'Bing Webmaster Tools', 'Yandex', 'Pinterest', 'GA4', 'criteres go/no-go']],
  ['app/llms.txt/route.ts', ['LIVEINBLACK', 'fr-BJ', 'Marché principal : Bénin', '${SITE}/sitemap.xml', '${SITE}/blog/benin', '${SITE}/blog/feed.json', '${SITE}/opensearch.xml', 'text/plain; charset=utf-8', 'stale-while-revalidate']],
  ['app/opensearch.xml/route.ts', ['OpenSearchDescription', 'ShortName', 'LIVEINBLACK', 'search?q={searchTerms}', 'application/opensearchdescription+xml', 'stale-while-revalidate']],
  ['app/robots.ts', ['/api/', '/profile', '/messages', '/agent', '/order', '/sitemap.xml', "'LLMs.txt': `${SITE}/llms.txt`"]],
  ['app/sitemap.xml/route.ts', ["dynamic = 'force-dynamic'", "name: 'blog'", "name: 'events'", "name: 'organizers'", "name: 'providers'", '/sitemaps/core/0.xml']],
  ['lib/server/seo/sitemapXml.ts', ['/home', '/events', '/providers', '/organizers', '/blog', '/blog/benin', '/contact', '/organizer-signup', '/provider-signup']],
  ['app/(public)/home/page.tsx', ["canonical: '/home'"]],
  ['app/(public)/blog/benin/page.tsx', ["canonical: '/blog/benin'", 'CollectionPage', 'ItemList', 'BreadcrumbList', 'FAQPage', 'acceptedAnswer', 'Événements au Bénin', '#strategic-guides', 'blog_benin_strategic_guides', '/events', '/providers', '/organizers', '/organizer-signup', '/provider-signup']],
  ['app/(public)/blog/benin/benin.module.css', ['repeat(auto-fit,minmax(210px,1fr))', 'repeat(auto-fit,minmax(220px,1fr))', 'repeat(auto-fit,minmax(190px,1fr))', 'repeat(auto-fit,minmax(240px,1fr))', 'min-height:72px', '.intentGrid', '.supplyActions']],
  ['app/(public)/events/page.tsx', ["canonical: '/events'", 'index: true', 'openGraph:', "'@type': 'ItemList'", "'@type': 'Event'", 'application/ld+json']],
  ['app/(public)/organizers/page.tsx', ["canonical: '/organizers'", 'pageSize: 24', '(max-width:1440px) 24vw', 'index: true', 'openGraph:', "'@type': 'ItemList'", "'@type': 'Organization'", 'application/ld+json']],
  ['app/(public)/providers/page.tsx', ["canonical: '/providers'", 'pageSize: 24', 'eager={index < 4}', 'index: true', 'openGraph:', "'@type': 'ItemList'", "'@type': 'ProfessionalService'", 'application/ld+json']],
  ['app/(public)/blog/page.tsx', ["canonical: '/blog'", 'const PAGE_SIZE = 24', "'application/rss+xml': '/blog/feed.xml'", "'application/feed+json': '/blog/feed.json'", 'index: true', "locale: 'fr_BJ'", 'openGraph:', "'@type': 'ItemList'", "'@type': 'BlogPosting'", 'application/ld+json']],
  ['app/(public)/blog/feed.xml/route.ts', ['application/rss+xml', 's-maxage=300', 'blogRssXml']],
  ['app/(public)/blog/feed.json/route.ts', ['application/feed+json', 's-maxage=300', 'blogJsonFeed']],
  ['lib/server/seo/jsonFeed.ts', ['https://jsonfeed.org/version/1.1', 'language: \'fr-BJ\'', 'feed_url:', 'content_text:']],
  ['lib/server/seo/rssXml.ts', ['<language>fr-BJ</language>', 'atom:link', 'escapeXml']],
  ['app/(public)/about/page.tsx', ["canonical: '/about'"]],
  ['app/(public)/contact/page.tsx', ["canonical: '/contact'"]],
  ['app/(public)/cookies/page.tsx', ["canonical: '/cookies'"]],
  ['app/(public)/legal-notice/page.tsx', ["canonical: '/legal-notice'"]],
  ['app/(public)/privacy/page.tsx', ["canonical: '/privacy'"]],
  ['app/(public)/terms/page.tsx', ["canonical: '/terms'"]],
  ['app/(public)/organizer-signup/page.tsx', ["canonical: '/organizer-signup'", 'description:', 'index: true']],
  ['app/(public)/provider-signup/page.tsx', ["canonical: '/provider-signup'", 'description:', 'index: true']],
  ['app/(public)/events/[id]/page.tsx', ['alternates: { canonical }', 'index: true', 'index: false', 'twitter:']],
  ['app/(public)/events/[id]/EventDetailContent.tsx', ["'@type': 'Event'", "'@type': 'BreadcrumbList'", 'application/ld+json', 'keywords:', 'performer:', "addressCountry: 'BJ'"]],
  ['app/(public)/organizers/[slug]/page.tsx', ['alternates: { canonical }', 'index: true', 'index: false', 'twitter:']],
  ['app/(public)/organizers/[slug]/OrganizerDetailContent.tsx', ["'@type': 'Organization'", "'@type': 'BreadcrumbList'", 'application/ld+json']],
  ['app/(public)/providers/[id]/page.tsx', ['alternates: { canonical }', 'index: true', 'index: false', 'twitter:']],
  ['app/(public)/providers/[id]/ProviderDetailContent.tsx', ["'@type': 'ProfessionalService'", "'@type': 'BreadcrumbList'", 'application/ld+json']],
  ['app/(public)/blog/[slug]/page.tsx', ['alternates: { canonical:', "locale: 'fr_BJ'", "inLanguage: 'fr-BJ'", "'@type': 'BlogPosting'", "'@type': 'BreadcrumbList'", "'@type': 'Thing'", '#growth-links', 'articleGrowthLinks', 'listRelatedPosts(post, 6)', 'articleSection', 'wordCount', 'index: true', 'index: false']],
  ['app/(public)/search/page.tsx', ["canonical: '/search'", 'index: false', 'follow: true']],
  ['app/(public)/login/page.tsx', ['index: false', 'follow: false']],
  ['app/(public)/reset-password/page.tsx', ['index: false', 'follow: false']],
  ['app/(public)/verify-email/page.tsx', ['index: false', 'follow: false']],
  ['app/(public)/confirmer-email/page.tsx', ['index: false', 'follow: false']],
  ['app/(public)/payment-success/page.tsx', ['index: false', 'follow: false']],
  ['app/(public)/boost-active/page.tsx', ['index: false', 'follow: false']],
]

const failures = []
for (const [file, requiredSnippets] of checks) {
  let source
  try {
    source = await readFile(file, 'utf8')
  } catch (error) {
    failures.push(`${file}: fichier illisible (${error.message})`)
    continue
  }
  for (const snippet of requiredSnippets) {
    if (!source.includes(snippet)) failures.push(`${file}: signal manquant « ${snippet} »`)
  }
}

if (failures.length > 0) {
  console.error(`Audit SEO KO — ${failures.length} problème(s)`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Audit SEO OK — ${checks.length} fichiers critiques vérifiés.`)
