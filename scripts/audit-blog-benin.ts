import { buildBeninCampaign } from './blog-benin-campaign'

const posts = buildBeninCampaign(new Date('2026-08-25T00:00:00.000Z'))
const slugs = new Set(posts.map((post) => post.slug))
const errors: string[] = []

if (posts.length < 100) errors.push(`Seulement ${posts.length} articles.`)
if (slugs.size !== posts.length) errors.push('Des slugs sont dupliqués.')
for (const post of posts) {
  const wordCount = post.content.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length
  if (wordCount < 450) errors.push(`${post.slug}: contenu trop court (${wordCount} mots).`)
  if (post.metaTitle.length > 60) errors.push(`${post.slug}: meta title trop long.`)
  if (post.metaDescription.length < 110 || post.metaDescription.length > 155) errors.push(`${post.slug}: meta description hors limites (${post.metaDescription.length}).`)
  if (!post.tags.includes('Bénin')) errors.push(`${post.slug}: tag Bénin absent.`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`Audit éditorial OK — ${posts.length} articles Bénin, ${slugs.size} slugs uniques, métadonnées valides.`)
