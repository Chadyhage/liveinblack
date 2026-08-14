import SlideOverModal from '@/app/components/ui/SlideOverModal'
import ProviderDetailContent from '../../../providers/[id]/ProviderDetailContent'

// Intercepte la navigation en clic vers /providers/[id] et l'affiche en
// modal glissante par-dessus l'annuaire prestataires. Visite directe /
// refresh / nouvel onglet continuent de rendre
// app/(public)/providers/[id]/page.tsx en entier.
export default async function InterceptedProviderModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <SlideOverModal ariaLabel="Détails du prestataire">
      <div style={{ padding: '0 0 60px', width: '100%' }}>
        <ProviderDetailContent id={id} />
      </div>
    </SlideOverModal>
  )
}
