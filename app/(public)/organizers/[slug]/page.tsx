import type { Metadata } from 'next'
import { getOrganizerBySlug } from '@/lib/server/organizers'
import OrganizerDetailContent from './OrganizerDetailContent'

export const dynamic = 'force-dynamic'

// Le rendu proprement dit vit dans OrganizerDetailContent.tsx, partagé avec
// la route interceptée app/(public)/@modal/(.)organizers/[slug]/page.tsx qui
// affiche ce même contenu en modal glissante quand on navigue depuis une
// carte organisateur ; cette page-ci reste la cible link-based (visite
// directe, refresh, nouvel onglet).

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const organizer = await getOrganizerBySlug(slug)
  if (!organizer) return { title: 'Organisateur — LIVEINBLACK' }
  return { title: `${organizer.publicName} — LIVEINBLACK`, description: organizer.shortDescription?.slice(0, 160) }
}

export default async function PublicOrganizerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return (
    <main style={{ maxWidth: 1400, margin: '0 auto', padding: '0 clamp(14px, 3vw, 42px) 80px', width: '100%' }}>
      <OrganizerDetailContent slug={slug} />
    </main>
  )
}
