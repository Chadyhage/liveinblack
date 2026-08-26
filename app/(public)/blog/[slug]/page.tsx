import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCachedPostBySlug as getPostBySlug, getCachedRelatedPosts as listRelatedPosts } from '@/lib/server/publicCache'
import { regions } from '@/lib/shared/regions'
import { reliablePhotoUrl } from '@/lib/shared/placeholderImage'

export const revalidate = 300

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
  if (!post) return { title: 'Article introuvable — LIVEINBLACK', robots: { index: false, follow: false } }
  const coverImageUrl = reliablePhotoUrl(post.coverImageUrl, post.slug, 1200, 675)

  return {
    title: post.metaTitle,
    description: post.metaDescription,
    keywords: post.tags,
    authors: [{ name: post.authorName }],
    alternates: { canonical: `${SITE}/blog/${post.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title: post.metaTitle,
      description: post.metaDescription,
      type: 'article',
      url: `${SITE}/blog/${post.slug}`,
      siteName: 'LIVEINBLACK',
      locale: 'fr_BJ',
      images: [{ url: coverImageUrl, width: 1200, height: 675, alt: post.title }],
      publishedTime: new Date(post.publishedAt as unknown as string).toISOString(),
      modifiedTime: post.updatedAt ? new Date(post.updatedAt as unknown as string).toISOString() : undefined,
      authors: [post.authorName],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.metaTitle,
      description: post.metaDescription,
      images: [coverImageUrl],
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
  const modifiedIso = post.updatedAt ? new Date(post.updatedAt as unknown as string).toISOString() : publishedIso
  const publishedDisplay = new Date(post.publishedAt as unknown as string).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${SITE}/blog/${post.slug}#article`,
        headline: post.title,
        description: post.metaDescription,
        keywords: post.tags.join(', '),
        inLanguage: 'fr-BJ',
        author: { '@type': 'Person', name: post.authorName },
        publisher: { '@type': 'Organization', name: 'LIVEINBLACK', url: SITE },
        datePublished: publishedIso,
        dateModified: modifiedIso,
        image: { '@type': 'ImageObject', url: coverImageUrl, width: 1200, height: 675 },
        mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/blog/${post.slug}` },
        isPartOf: { '@type': 'Blog', '@id': `${SITE}/blog#blog`, name: 'Le journal LIVEINBLACK' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE}/home` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE}/blog/${post.slug}` },
        ],
      },
    ],
  }

  return (
    <main className="lb-blog-article" style={{ padding: '28px clamp(14px, 2.2vw, 32px) 72px', width: '100%', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <div style={{ maxWidth: 1220, margin: '0 auto' }}>
        <nav aria-label="Fil d'ariane" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12, color: 'var(--text-faint)' }}>
          <Link href="/blog" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Blog</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-faint)' }}>{post.title}</span>
        </nav>

        <header style={{ marginBottom: 22 }}>
          <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 800, color: '#04120e', background: 'var(--gold)', padding: '4px 10px', borderRadius: 999, marginBottom: 12 }}>
            {categoryLabel(post.category)}
          </span>
          <h1 className="font-display" style={{ fontSize: 'clamp(26px, 4.6vw, 40px)', lineHeight: 1.08, letterSpacing: '.01em', margin: 0, maxWidth: 860 }}>
            {post.title}
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
            Par {post.authorName} · {publishedDisplay} · {post.readingTimeMinutes} min de lecture
          </p>
        </header>

        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/8', borderRadius: 'var(--radius-xl)', overflow: 'hidden', marginBottom: 28, background: 'var(--obsidian)' }}>
          <Image src={coverImageUrl} alt="" fill style={{ objectFit: 'cover' }} sizes="100vw" priority />
        </div>

        {/* Colonne de lecture ~720px, pattern LegalPageLayout.tsx */}
        <article
          style={{ maxWidth: 780, margin: '0 auto', fontSize: 15, lineHeight: 1.68, color: 'var(--text-muted)' }}
          // Contenu 100% interne (seed/agent éditorial), jamais saisi par un visiteur — voir lib/models/BlogPost.ts.
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {post.tags.length > 0 && (
          <div style={{ maxWidth: 780, margin: '26px auto 0', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {post.tags.map((tag) => (
              <span key={tag} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 999 }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {related.length > 0 && (
          <section style={{ maxWidth: 1220, margin: '44px auto 0' }}>
            <h2 className="font-display" style={{ fontSize: 21, letterSpacing: '.01em', margin: '0 0 14px' }}>À lire aussi</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,250px),1fr))', gap: 14 }}>
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/blog/${r.slug}`}
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 14 }}
                >
                  <p style={{ fontSize: 14, fontWeight: 800, margin: 0, lineHeight: 1.32 }}>{r.title}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '6px 0 0', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.excerpt}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
