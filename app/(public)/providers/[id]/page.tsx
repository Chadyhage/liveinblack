import type { Metadata } from 'next'
import { getProviderByUserId } from '@/lib/server/provider/providers'
import ProviderDetailContent from './ProviderDetailContent'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

export const dynamic = 'force-dynamic'

// Le rendu proprement dit vit dans ProviderDetailContent.tsx, partagé avec la
// route interceptée app/(public)/@modal/(.)providers/[id]/page.tsx qui
// affiche ce même contenu en modal glissante quand on navigue depuis une
// carte prestataire ; cette page-ci reste la cible link-based (visite
// directe, refresh, nouvel onglet).

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const provider = await getProviderByUserId(id)
  if (!provider) return { title: 'Prestataire introuvable — LIVEINBLACK', robots: { index: false, follow: false } }
  const description = provider.description?.slice(0, 160) || provider.headline || `Découvrez les services de ${provider.name} sur LIVEINBLACK.`
  const canonical = `${SITE}/providers/${provider.userId}`
  const image = provider.coverUrl || provider.photoUrl || `${SITE}/opengraph-image`
  return {
    title: `${provider.name} — LIVEINBLACK`,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { type: 'website', url: canonical, siteName: 'LIVEINBLACK', locale: 'fr_BJ', title: provider.name, description, images: [{ url: image, alt: provider.name }] },
    twitter: { card: 'summary_large_image', title: provider.name, description, images: [image] },
  }
}

export default async function PublicPrestatairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <main className="lb-public-detail-page" style={{ maxWidth: 1400, margin: '0 auto', padding: '0 clamp(14px, 3vw, 42px) 88px', width: '100%' }}>
      <ProviderDetailContent id={id} />
    </main>
  )
}
