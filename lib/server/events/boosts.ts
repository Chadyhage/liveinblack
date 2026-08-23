import { getDb } from '@/lib/db/mongoose'
import Boost from '@/lib/models/Boost'

// Utilisé par la rangée "À la une" d'EventsPage : un événement est mis en
// avant s'il a au moins un boost actif (peu importe la région/position — la
// page événements n'a pas de sélecteur de région, contrairement à l'accueil).
export async function getBoostedEventIds(): Promise<Set<string>> {
  await getDb()
  const now = Date.now()
  const docs = await Boost.find(
    { status: 'active', conflict: { $ne: true }, expiresAt: { $gt: new Date(now) } },
    { _id: 0, eventId: 1 },
  ).lean()
  return new Set(docs.map((b) => String(b.eventId)))
}
