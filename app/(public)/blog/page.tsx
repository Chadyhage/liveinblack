import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { ArrowUpRight, BookOpen, Clock } from 'lucide-react'
import { getCachedPublishedPosts as listPublishedPosts } from '@/lib/server/publicCache'
import { regions } from '@/lib/shared/regions'
import { BLOG_CATEGORY_IDS, type BlogCategoryId } from '@/lib/models/BlogPost'
import { Mascot, PageLinks } from '@/app/components/ui'
import { reliablePhotoUrl } from '@/lib/shared/placeholderImage'
import styles from './blog.module.css'

const PAGE_SIZE = 12

export const metadata: Metadata = {
  title: 'Blog — LIVEINBLACK',
  description: "Actualités, guides et conseils pour organiser et vivre les meilleures expériences culturelles d'Afrique de l'Ouest.",
  alternates: {
    canonical: '/blog',
    types: { 'application/rss+xml': '/blog/feed.xml' },
  },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Blog — LIVEINBLACK',
    description: "Guides, actualités et conseils sur les événements au Bénin et en Afrique de l'Ouest.",
    type: 'website',
    url: '/blog',
    locale: 'fr_BJ',
    siteName: 'LIVEINBLACK',
  },
}

export const revalidate = 300

const CATEGORY_LABELS: Record<BlogCategoryId, string> = {
  ...(Object.fromEntries(regions.map((region) => [region.id, `${region.flag} ${region.name}`])) as Record<string, string>),
  guide: 'Guides',
  actualite: 'Actualités',
} as Record<BlogCategoryId, string>

function categoryLabel(id: string): string { return CATEGORY_LABELS[id as BlogCategoryId] || id }

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ categorie?: string; page?: string }> }) {
  const { categorie, page: pageParam } = await searchParams
  const category = (categorie || '') as BlogCategoryId | ''
  const requestedPage = Math.max(1, Number(pageParam) || 1)
  const { posts, page, pageCount, totalCount } = await listPublishedPosts({ category, page: requestedPage, pageSize: PAGE_SIZE })

  function makeHref(nextPage: number) {
    const params = new URLSearchParams()
    if (category) params.set('categorie', category)
    if (nextPage > 1) params.set('page', String(nextPage))
    return params.size ? `/blog?${params.toString()}` : '/blog'
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Le journal LIVEINBLACK</p>
        <h1>Les idées qui font vivre la scène.</h1>
        <p>Guides, conseils et actualités pour organiser, soutenir et vivre des événements mémorables.</p>
      </section>

      <section className={styles.content} aria-labelledby="articles-title">
        <div className={styles.heading}>
          <div><p><BookOpen size={18} aria-hidden="true" /> À découvrir</p><h2 id="articles-title">Tous les articles</h2></div>
          <span>{totalCount} article{totalCount > 1 ? 's' : ''}</span>
        </div>

        <nav className={styles.filters} aria-label="Catégories du blog">
          <Link href="/blog" className={!category ? styles.active : ''} aria-current={!category ? 'page' : undefined}>Tous</Link>
          {BLOG_CATEGORY_IDS.map((id) => <Link key={id} href={`/blog?categorie=${id}`} className={category === id ? styles.active : ''} aria-current={category === id ? 'page' : undefined}>{categoryLabel(id)}</Link>)}
        </nav>

        {posts.length > 0 ? (
          <div className={styles.grid}>
            {posts.map((post, index) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className={styles.card}>
                <div className={styles.visual}>
                  <Image src={reliablePhotoUrl(post.coverImageUrl, post.slug, 1200, 675)} alt="" fill loading={index < 3 ? 'eager' : undefined} sizes="(max-width:680px) calc(100vw - 40px), (max-width:1020px) 46vw, 30vw" />
                  <span>{categoryLabel(post.category)}</span>
                </div>
                <div className={styles.cardBody}>
                  <h3>{post.title}</h3>
                  <p>{post.excerpt}</p>
                  <div className={styles.meta}><span>{post.authorName}</span><span><Clock size={16} aria-hidden="true" />{post.readingTimeMinutes} min</span></div>
                  <div className={styles.read}>Lire l’article <ArrowUpRight size={19} aria-hidden="true" /></div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}><Mascot mood="sleeping" size={164} /><h3>Aucun article pour le moment</h3><p>De nouveaux contenus arrivent régulièrement.</p></div>
        )}

        <PageLinks page={page} pageCount={pageCount} makeHref={makeHref} totalItems={totalCount} pageSize={PAGE_SIZE} />
      </section>
    </main>
  )
}
