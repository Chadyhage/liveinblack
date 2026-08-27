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

const articleGrowthLinks = [
  { href: '/events', title: 'Trouver un événement', text: 'Découvre les sorties, concerts et expériences disponibles au Bénin.', target: 'events' },
  { href: '/providers', title: 'Comparer les prestataires', text: 'Repère DJ, photographes, lieux, traiteurs et équipes terrain.', target: 'providers' },
  { href: '/organizers', title: 'Voir les organisateurs', text: 'Suis les acteurs qui publient les événements près de toi.', target: 'organizers' },
  { href: '/blog/benin', title: 'Explorer le hub Bénin', text: 'Lis les guides locaux pour sortir, réserver et organiser mieux.', target: 'blog_benin' },
  { href: '/organizer-signup', title: 'Publier un événement', text: 'Crée ton espace organisateur et mets ta billetterie en ligne.', target: 'organizer_signup' },
  { href: '/provider-signup', title: 'Proposer un service', text: 'Présente ton activité et gagne en visibilité auprès des organisateurs.', target: 'provider_signup' },
]

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

  const related = await listRelatedPosts(post, 6)
  const coverImageUrl = reliablePhotoUrl(post.coverImageUrl, post.slug, 1200, 675)
  const publishedIso = new Date(post.publishedAt as unknown as string).toISOString()
  const modifiedIso = post.updatedAt ? new Date(post.updatedAt as unknown as string).toISOString() : publishedIso
  const publishedDisplay = new Date(post.publishedAt as unknown as string).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const articleSection = categoryLabel(post.category)
  const articleText = post.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const wordCount = articleText ? articleText.split(' ').length : undefined
  const aboutTopics = Array.from(new Set(['événements au Bénin', 'culture au Bénin', 'sorties au Bénin', ...post.tags]))

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${SITE}/blog/${post.slug}#article`,
        url: `${SITE}/blog/${post.slug}`,
        headline: post.title,
        description: post.metaDescription,
        articleSection,
        wordCount,
        keywords: post.tags.join(', '),
        inLanguage: 'fr-BJ',
        about: aboutTopics.map((name) => ({ '@type': 'Thing', name })),
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
      {
        '@type': 'ItemList',
        '@id': `${SITE}/blog/${post.slug}#growth-links`,
        name: 'Continuer sur LIVEINBLACK',
        itemListElement: articleGrowthLinks.map((link, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: link.title,
          url: `${SITE}${link.href}`,
        })),
      },
    ],
  }

  return (
    <main className="lb-blog-article" style={{ padding: '18px clamp(10px, 1.6vw, 24px) 44px', width: '100%', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <nav aria-label="Fil d'ariane" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 10.5, color: 'var(--text-faint)' }}>
          <Link href="/blog" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Blog</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-faint)' }}>{post.title}</span>
        </nav>

        <header style={{ marginBottom: 14 }}>
          <span style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 800, color: '#04120e', background: 'var(--gold)', padding: '3px 8px', borderRadius: 999, marginBottom: 8 }}>
            {articleSection}
          </span>
          <h1 className="font-display" style={{ fontSize: 'clamp(23px, 3.4vw, 34px)', lineHeight: 1.02, letterSpacing: '.01em', margin: 0, maxWidth: 820 }}>
            {post.title}
          </h1>
          <p style={{ margin: '7px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
            Par {post.authorName} · {publishedDisplay} · {post.readingTimeMinutes} min de lecture
          </p>
        </header>

        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/6.8', borderRadius: 14, overflow: 'hidden', marginBottom: 18, background: 'var(--obsidian)' }}>
          <Image src={coverImageUrl} alt="" fill style={{ objectFit: 'cover' }} sizes="100vw" priority />
        </div>

        {/* Colonne de lecture ~720px, pattern LegalPageLayout.tsx */}
        <article
          style={{ maxWidth: 740, margin: '0 auto', fontSize: 13.75, lineHeight: 1.56, color: 'var(--text-muted)' }}
          // Contenu 100% interne (seed/agent éditorial), jamais saisi par un visiteur — voir lib/models/BlogPost.ts.
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {post.tags.length > 0 && (
          <div style={{ maxWidth: 740, margin: '16px auto 0', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {post.tags.map((tag) => (
              <span key={tag} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: 999 }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        <section style={{ maxWidth: 1160, margin: '22px auto 0' }} aria-labelledby="blog-growth-links-title">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginBottom: 9 }}>
            <div>
              <p style={{ margin: 0, color: '#b8f34a', fontSize: 10.5, fontWeight: 850, letterSpacing: '.12em', textTransform: 'uppercase' }}>Passer à l’action</p>
              <h2 id="blog-growth-links-title" className="font-display" style={{ fontSize: 16, letterSpacing: '.01em', margin: '3px 0 0' }}>Continuer sur LIVEINBLACK</h2>
            </div>
            <Link href="/blog/benin" style={{ minHeight: 30, display: 'inline-flex', alignItems: 'center', padding: '0 9px', borderRadius: 999, border: '1px solid rgba(184,243,74,.32)', color: '#b8f34a', fontSize: 10.5, fontWeight: 800, textDecoration: 'none' }}>
              Hub Bénin →
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,190px),1fr))', gap: 7 }}>
            {articleGrowthLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                data-growth-event="cta_click"
                data-growth-surface="blog_article_growth_links"
                data-growth-target={link.target}
                style={{ minHeight: 92, display: 'flex', flexDirection: 'column', gap: 5, padding: 10, borderRadius: 12, border: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(184,243,74,.08),rgba(255,255,255,.035))', color: 'inherit', textDecoration: 'none' }}
              >
                <strong style={{ color: '#fff', fontSize: 12.5, lineHeight: 1.15 }}>{link.title}</strong>
                <span style={{ color: 'var(--text-faint)', fontSize: 10.75, lineHeight: 1.35 }}>{link.text}</span>
                <span style={{ marginTop: 'auto', color: '#b8f34a', fontSize: 10.5, fontWeight: 800 }}>Ouvrir →</span>
              </Link>
            ))}
          </div>
        </section>

        {related.length > 0 && (
          <section style={{ maxWidth: 1160, margin: '28px auto 0' }}>
            <h2 className="font-display" style={{ fontSize: 15, letterSpacing: '.01em', margin: '0 0 10px' }}>À lire aussi</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 8 }}>
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/blog/${r.slug}`}
                  data-growth-event="cta_click"
                  data-growth-surface="blog_article_related"
                  data-growth-target="related_post"
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}
                >
                  <p style={{ fontSize: 12.5, fontWeight: 800, margin: 0, lineHeight: 1.28 }}>{r.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '5px 0 0', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.excerpt}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
