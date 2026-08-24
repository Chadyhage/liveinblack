import SlideOverModal from '@/app/components/ui/SlideOverModal'
import EventDetailContent from '../../../events/[id]/EventDetailContent'

// Intercepte la navigation en clic (depuis EventListCard etc.) vers
// /events/[id] et l'affiche en modal centrée par-dessus la liste, au lieu
// de la page pleine. Visite directe / refresh / nouvel onglet continuent de
// rendre app/(public)/events/[id]/page.tsx en entier (comportement natif des
// routes interceptées, pas un cas particulier à gérer ici).
export default async function InterceptedEventModal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ paiement?: string }>
}) {
  const { id } = await params
  const { paiement } = await searchParams

  return (
    <SlideOverModal variant="event" maxWidth={720} ariaLabel="Détails de l’événement">
      <div style={{ width: '100%' }}>
        <EventDetailContent id={id} paiement={paiement} presentation="modal" />
      </div>
    </SlideOverModal>
  )
}
