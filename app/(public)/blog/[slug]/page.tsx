import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCachedPostBySlug as getPostBySlug, getCachedRelatedPosts as listRelatedPosts } from '@/lib/server/publicCache'
import { regions } from '@/lib/shared/regions'
import { reliablePhotoUrl } from '@/lib/shared/placeholderImage'

export const dynamic = 'force-dynamic'

const CATEGORY_LABELS: Record<string, string> = {
  ...(Object.fromEntries(regions.map((r) => [r.id, `${r.flag} ${r.name}`])) as Record<string, string>),
  guide: '📘 Guides',
  actualite: '📰 Actualités',
}

function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id] || id
}

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) return { title: 'Article — LIVEINBLACK' }
  const coverImageUrl = reliablePhotoUrl(post.coverImageUrl, post.slug, 1200, 675)

  return {
    title: post.metaTitle,
    description: post.metaDescription,
    openGraph: {
      title: post.metaTitle,
      description: post.metaDescription,
      type: 'article',
      url: `${SITE}/blog/${post.slug}`,
      images: [{ url: coverImageUrl }],
      publishedTime: new Date(post.publishedAt as unknown as string).toISOString(),
    },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPostBySlug(slug)
  if (!post) notFound()

  const related = await listRelatedPosts(post, 3)
  const coverImageUrl = reliablePhotoUrl(post.coverImageUrl, post.slug, 1200, 675)
  const publishedIso = new Date(post.publishedAt as unknown as string).toISOString()
  const publishedDisplay = new Date(post.publishedAt as unknown as string).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.metaDescription,
    author: { '@type': 'Person', name: post.authorName },
    datePublished: publishedIso,
    image: [coverImageUrl],
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/blog/${post.slug}` },
  }

  return (
    <main className="lb-blog-article" style={{ padding: '40px clamp(16px, 3vw, 48px) 88px', width: '100%', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <nav aria-label="Fil d'ariane" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 12.5, color: 'var(--text-faint)' }}>
          <Link href="/blog" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Blog</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-faint)' }}>{post.title}</span>
        </nav>

        <header style={{ marginBottom: 28 }}>
          <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#04120e', background: 'var(--gold)', padding: '5px 11px', borderRadius: 999, marginBottom: 14 }}>
            {categoryLabel(post.category)}
          </span>
          <h1 className="font-display" style={{ fontSize: 'clamp(28px, 5.5vw, 46px)', lineHeight: 1.1, letterSpacing: '.01em', margin: 0, maxWidth: 900 }}>
            {post.title}
          </h1>
          <p style={{ margin: '16px 0 0', fontSize: 13.5, color: 'var(--text-muted)' }}>
            Par {post.authorName} · {publishedDisplay} · {post.readingTimeMinutes} min de lecture
          </p>
        </header>

        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/7', borderRadius: 'var(--radius-xl)', overflow: 'hidden', marginBottom: 36, background: 'var(--obsidian)' }}>
          <Image src={coverImageUrl} alt="" fill style={{ objectFit: 'cover' }} sizes="100vw" priority />
        </div>

        {/* Colonne de lecture ~720px, pattern LegalPageLayout.tsx */}
        <article
          style={{ maxWidth: 720, margin: '0 auto', fontSize: 16, lineHeight: 1.75, color: 'var(--text-muted)' }}
          // Contenu 100% interne (seed/agent éditorial), jamais saisi par un visiteur — voir lib/models/BlogPost.ts.
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {post.tags.length > 0 && (
          <div style={{ maxWidth: 720, margin: '32px auto 0', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {post.tags.map((tag) => (
              <span key={tag} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '5px 12px', borderRadius: 999 }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {related.length > 0 && (
          <section style={{ maxWidth: 1200, margin: '60px auto 0' }}>
            <h2 className="font-display" style={{ fontSize: 24, letterSpacing: '.01em', margin: '0 0 20px' }}>À lire aussi</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 20 }}>
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/blog/${r.slug}`}
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 18 }}
                >
                  <p style={{ fontSize: 15, fontWeight: 800, margin: 0, lineHeight: 1.35 }}>{r.title}</p>
                  <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '8px 0 0', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.excerpt}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
