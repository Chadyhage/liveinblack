import type { Metadata } from 'next'
import EventDetailContent, { resolveEvent } from './EventDetailContent'

// Port de src/pages/EventDetailPage.jsx (2861 lignes côté legacy). La sélection
// de place + paiement (#119) est portée par
// EventCheckoutPanel. Ce que ce fichier ajoute par rapport au
// legacy : méta SEO (aucune n'existait).
//
// Le rendu proprement dit vit dans EventDetailContent.tsx, partagé avec la
// route interceptée app/(public)/@modal/(.)events/[id]/page.tsx qui affiche
// ce même contenu en modal glissante quand on navigue depuis une carte
// événement ; cette page-ci reste la cible link-based (visite directe,
// refresh, nouvel onglet).

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const result = await resolveEvent(id)
  if (result.status !== 'ok') return { title: 'Événement — LIVEINBLACK' }
  const { event } = result
  return {
    title: `${event.name} — LIVEINBLACK`,
    description: event.description?.slice(0, 160) || event.subtitle || undefined,
    openGraph: {
      title: event.name,
      description: event.subtitle || undefined,
      images: event.imageUrl ? [event.imageUrl] : undefined,
    },
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
    <main style={{ maxWidth: 1320, margin: '0 auto', padding: '12px clamp(14px, 3vw, 42px) 80px', width: '100%' }}>
      <EventDetailContent id={id} paiement={paiement} />
    </main>
  )
}
