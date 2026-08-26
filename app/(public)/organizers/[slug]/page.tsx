import type { Metadata } from 'next'
import { getOrganizerBySlug } from '@/lib/server/organizer/organizers'
import OrganizerDetailContent from './OrganizerDetailContent'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

export const dynamic = 'force-dynamic'

// Le rendu proprement dit vit dans OrganizerDetailContent.tsx, partagé avec
// la route interceptée app/(public)/@modal/(.)organizers/[slug]/page.tsx qui
// affiche ce même contenu en modal glissante quand on navigue depuis une
// carte organisateur ; cette page-ci reste la cible link-based (visite
// directe, refresh, nouvel onglet).

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const organizer = await getOrganizerBySlug(slug)
  if (!organizer) return { title: 'Organisateur introuvable — LIVEINBLACK', robots: { index: false, follow: false } }
  const description = organizer.shortDescription?.slice(0, 160) || `Découvrez les événements de ${organizer.publicName} sur LIVEINBLACK.`
  const canonical = `${SITE}/organizers/${organizer.slug}`
  const image = organizer.bannerUrl || organizer.avatarUrl || `${SITE}/opengraph-image`
  return {
    title: `${organizer.publicName} — LIVEINBLACK`,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { type: 'website', url: canonical, siteName: 'LIVEINBLACK', locale: 'fr_BJ', title: organizer.publicName, description, images: [{ url: image, alt: organizer.publicName }] },
    twitter: { card: 'summary_large_image', title: organizer.publicName, description, images: [image] },
  }
}

export default async function PublicOrganizerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return (
    <main className="lb-public-detail-page" style={{ maxWidth: 1400, margin: '0 auto', padding: '0 clamp(14px, 3vw, 42px) 80px', width: '100%' }}>
      <OrganizerDetailContent slug={slug} />
    </main>
  )
}
