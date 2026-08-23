import { NextResponse } from 'next/server'
import { getEventById } from '@/lib/server/events/events'
import { getPublicOrganizerByUserId } from '@/lib/server/organizer/organizers'

// Détail d'un événement en JSON — miroir de resolveEvent() dans
// app/(public)/events/[id]/page.tsx.
export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const result = await getEventById(eventId)

  if (result.status === 'not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Pass-through pur (aucune logique recalculée) : miroir de la section
  // "Organisateur" de app/(public)/events/[id]/page.tsx, qui résout le slug/
  // avatar public de l'organisateur via getPublicOrganizerByUserId. Le mobile
  // n'a pas accès aux composants serveur — ces 2 champs lui permettent de
  // construire le même lien `/organizer/[slug]` que le web sans dupliquer la
  // résolution slug<->userId.
  const organizerProfile = await getPublicOrganizerByUserId(result.event.organizerId)

  return NextResponse.json({
    ok: true,
    event: result.event,
    organizerSlug: organizerProfile?.slug ?? null,
    organizerAvatarUrl: organizerProfile?.avatarUrl ?? null,
  })
}
