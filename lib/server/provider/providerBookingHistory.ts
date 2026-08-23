import { getDb } from '@/lib/db/mongoose'
import Event from '@/lib/models/Event'

// Historique d'événements passés où ce prestataire figure au line-up (#E7,
// confirmé en réunion live le 11/08/2026) — s'appuie directement sur
// `Event.artists[].providerId` (voir EventWizard.tsx), pas de nouveau modèle
// `ProviderBooking` : le lien existant sur l'event suffit, plus simple que
// d'introduire une table de jointure dédiée pour ce seul besoin d'affichage.

export interface PastProviderEventView {
  id: string
  name: string
  date: string
  dateDisplay: string
  city: string
  imageUrl: string | null
}

const MAX_PAST_EVENTS = 12

export async function listPastEventsForProvider(providerUserId: string): Promise<PastProviderEventView[]> {
  await getDb()
  const now = new Date().toISOString().slice(0, 10)
  const events = await Event.find({ 'artists.providerId': providerUserId, date: { $lt: now }, cancelled: { $ne: true } })
    .select('name date dateDisplay city imageUrl')
    .sort({ date: -1 })
    .limit(MAX_PAST_EVENTS)
    .lean()

  return events.map((e) => ({
    id: String(e._id),
    name: e.name || '',
    date: e.date || '',
    dateDisplay: e.dateDisplay || e.date || '',
    city: e.city || '',
    imageUrl: e.imageUrl || null,
  }))
}
