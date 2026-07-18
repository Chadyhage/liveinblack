import { getDb } from '../db/mongoose'
import Boost from '../models/Boost'
import { isBoostActive } from '../shared/boosts'

// Utilisé par la rangée "À la une" d'EventsPage : un événement est mis en
// avant s'il a au moins un boost actif (peu importe la région/position — la
// page événements n'a pas de sélecteur de région, contrairement à l'accueil).
export async function getBoostedEventIds(): Promise<Set<string>> {
  await getDb()
  const now = Date.now()
  const docs = await Boost.find({ expiresAt: { $gt: new Date(now) } }).lean()
  const active = docs.filter((b) => isBoostActive(b, now))
  return new Set(active.map((b) => String(b.eventId)))
}
