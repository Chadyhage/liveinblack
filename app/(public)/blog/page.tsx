import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { getCachedPublishedPosts as listPublishedPosts } from '@/lib/server/publicCache'
import { regions } from '@/lib/shared/regions'
import { BLOG_CATEGORY_IDS, type BlogCategoryId } from '@/lib/models/BlogPost'
import { EmptyState, PageLinks } from '@/app/components/ui'

const PAGE_SIZE = 12

export const metadata: Metadata = {
  title: 'Blog — LIVEINBLACK',
  description: "Actus, guides et conseils pour organiser, sponsoriser et vivre les meilleures soirées d'Afrique de l'Ouest.",
}

export const dynamic = 'force-dynamic'

const CATEGORY_LABELS: Record<BlogCategoryId, string> = {
  ...(Object.fromEntries(regions.map((r) => [r.id, `${r.flag} ${r.name}`])) as Record<string, string>),
  guide: '📘 Guides',
  actualite: '📰 Actualités',
} as Record<BlogCategoryId, string>

function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id as BlogCategoryId] || id
}

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ categorie?: string; page?: string }> }) {
  const { categorie, page: pageParam } = await searchParams
  const category = (categorie || '') as BlogCategoryId | ''
  const requestedPage = Math.max(1, Number(pageParam) || 1)

  const { posts, page, pageCount, totalCount } = await listPublishedPosts({ category, page: requestedPage, pageSize: PAGE_SIZE })

  function makeHref(p: number) {
    const params = new URLSearchParams()
    if (category) params.set('categorie', category)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `/blog?${qs}` : '/blog'
  }

  return (
    <main style={{ padding: '56px clamp(20px, 3vw, 48px) 88px', width: '100%', minHeight: '100vh' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <header style={{ marginBottom: 32 }}>
          <p style={{ margin: 0, color: 'var(--gold)', fontSize: 14, fontWeight: 400, letterSpacing: '3.2px', textTransform: 'uppercase', fontFamily: 'var(--font-display), sans-serif' }}>
            Le blog
          </p>
          <h1 className="font-display" style={{ fontSize: 'clamp(34px, 7.5vw, 58px)', lineHeight: 1, letterSpacing: '.01em', margin: '10px 0 0' }}>
            L&apos;actualité de la<br /><span style={{ color: 'var(--gold)' }}>nuit ouest-africaine.</span>
          </h1>
          <p style={{ maxWidth: 620, margin: '16px 0 0', color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6 }}>
            Guides, conseils et actus pour organiser, sponsoriser et vivre les meilleurs événements.
          </p>
        </header>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
          <CategoryChip label="Tous" href="/blog" active={!category} />
          {BLOG_CATEGORY_IDS.map((id) => (
            <CategoryChip key={id} label={categoryLabel(id)} href={`/blog?categorie=${id}`} active={category === id} />
          ))}
        </div>

        {posts.length === 0 ? (
          <EmptyState title="Aucun article pour le moment" description="Reviens bientôt, de nouveaux articles arrivent régulièrement." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 'clamp(18px,2vw,26px)' }}>
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="lb-card"
                style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'inherit', background: 'linear-gradient(180deg,var(--surface-2),var(--surface))', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: '0 18px 48px rgba(0,0,0,.24)' }}
              >
                <div style={{ position: 'relative', aspectRatio: '16/9', background: 'var(--obsidian)' }}>
                  {post.coverImageUrl && (
                    <Image src={post.coverImageUrl} alt="" fill style={{ objectFit: 'cover' }} sizes="(max-width: 768px) 100vw, 400px" />
                  )}
                  <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10.5, fontWeight: 800, color: '#04120e', background: 'var(--gold)', padding: '4px 9px', borderRadius: 999 }}>
                    {categoryLabel(post.category)}
                  </span>
                </div>
                <div style={{ padding: '18px 20px 22px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <p style={{ fontSize: 18, lineHeight: 1.3, fontWeight: 800, margin: 0 }}>{post.title}</p>
                  <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-faint)', margin: '10px 0 0', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {post.excerpt}
                  </p>
                  <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{post.authorName}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{post.readingTimeMinutes} min</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <PageLinks page={page} pageCount={pageCount} makeHref={makeHref} totalItems={totalCount} pageSize={PAGE_SIZE} />
      </div>
    </main>
  )
}

function CategoryChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        minHeight: 40,
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 12.5,
        fontWeight: 700,
        padding: '7px 14px',
        borderRadius: 999,
        textDecoration: 'none',
        color: active ? '#04120e' : 'var(--text)',
        background: active ? 'var(--teal-solid)' : 'var(--surface)',
        border: `1px solid ${active ? 'transparent' : 'var(--border-strong)'}`,
      }}
    >
      {label}
    </Link>
  )
}
