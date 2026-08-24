import SlideOverModal from '@/app/components/ui/SlideOverModal'
import OrganizerDetailContent from '../../../organizers/[slug]/OrganizerDetailContent'

// Intercepte la navigation en clic vers /organizers/[slug] et l'affiche en
// modal centrée par-dessus l'annuaire organisateurs. Visite directe /
// refresh / nouvel onglet continuent de rendre
// app/(public)/organizers/[slug]/page.tsx en entier.
export default async function InterceptedOrganizerModal({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  return (
    <SlideOverModal ariaLabel="Détails de l’organisateur">
      <div style={{ padding: '0 0 60px', width: '100%' }}>
        <OrganizerDetailContent slug={slug} />
      </div>
    </SlideOverModal>
  )
}
