import { buildBeninCampaign } from './blog-benin-campaign'
import { readFileSync } from 'node:fs'

const posts = buildBeninCampaign(new Date('2026-08-25T00:00:00.000Z'))
const slugs = new Set(posts.map((post) => post.slug))
const errors: string[] = []
const hubSource = readFileSync('app/(public)/blog/benin/page.tsx', 'utf8')

if (posts.length < 100) errors.push(`Seulement ${posts.length} articles.`)
if (slugs.size !== posts.length) errors.push('Des slugs sont dupliqués.')
for (const post of posts) {
  const wordCount = post.content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length
  if (wordCount < 450) errors.push(`${post.slug}: contenu trop court (${wordCount} mots).`)
  if (post.metaTitle.length > 60) errors.push(`${post.slug}: meta title trop long.`)
  if (post.metaDescription.length < 110 || post.metaDescription.length > 155) errors.push(`${post.slug}: meta description hors limites (${post.metaDescription.length}).`)
  if (!post.tags.includes('Bénin')) errors.push(`${post.slug}: tag Bénin absent.`)
}

const hubLinks = Array.from(hubSource.matchAll(/href: '\/blog\/([^']+)'/g), (match) => match[1])
if (hubLinks.length < 18) errors.push(`Hub Bénin: seulement ${hubLinks.length} liens articles détectés.`)
for (const slug of hubLinks) {
  if (!slugs.has(slug)) errors.push(`Hub Bénin: lien vers un slug absent de la campagne (${slug}).`)
}
if (!hubSource.includes("canonical: '/blog/benin'")) errors.push('Hub Bénin: canonical manquant.')
if (!hubSource.includes('FAQPage')) errors.push('Hub Bénin: FAQPage JSON-LD manquant.')
if (!hubSource.includes('data-growth-surface="blog_benin_city_guides"')) errors.push('Hub Bénin: tracking des guides ville manquant.')
if (!hubSource.includes('data-growth-surface="blog_benin_strategic_guides"')) errors.push('Hub Bénin: tracking des guides stratégiques manquant.')
if (!hubSource.includes('#strategic-guides')) errors.push('Hub Bénin: ItemList JSON-LD guides stratégiques manquant.')

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`Audit éditorial OK — ${posts.length} articles Bénin, ${slugs.size} slugs uniques, métadonnées valides, hub Bénin relié.`)
