import type { Metadata } from 'next'
import EventDetailContent, { resolveEvent } from './EventDetailContent'
import styles from './EventDetailContent.module.css'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

// Port de src/pages/EventDetailPage.jsx (2861 lignes côté legacy). La sélection
// de place + paiement (#119) est portée par
// EventCheckoutPanel. Ce que ce fichier ajoute par rapport au
// legacy : méta SEO (aucune n'existait).
//
// La fiche reste une page dédiée : le clic, le rafraîchissement et l'ouverture
// dans un nouvel onglet produisent ainsi exactement le même rendu.

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const result = await resolveEvent(id)
  if (result.status !== 'ok') return { title: 'Événement introuvable — LIVEINBLACK', robots: { index: false, follow: false } }
  const { event } = result
  const description = event.description?.slice(0, 160) || event.subtitle || `Découvrez ${event.name} sur LIVEINBLACK.`
  const canonical = `${SITE}/events/${event.id}`
  const image = event.imageUrl || `${SITE}/opengraph-image`
  return {
    title: `${event.name} — LIVEINBLACK`,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: 'LIVEINBLACK',
      locale: 'fr_BJ',
      title: event.name,
      description,
      images: [{ url: image, alt: event.name }],
    },
    twitter: { card: 'summary_large_image', title: event.name, description, images: [image] },
  }
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ paiement?: string }>
}) {
  const { id } = await params
  const { paiement } = await searchParams

  return (
    <main className={`lb-public-detail-page ${styles.detailPage}`}>
      <EventDetailContent id={id} paiement={paiement} />
    </main>
  )
}
