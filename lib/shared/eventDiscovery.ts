// Port TypeScript de src/utils/eventDiscovery.js
import { eventStartMs, isEventEnded } from './event-time'
import type { EventLike } from './event-types'

export function isPlaceholderEvent(event: EventLike | null | undefined): boolean {
  const name = String(event?.name || event?.title || '').trim()
  const description = String(event?.description || '').trim()
  return /^filler\b/i.test(name) || /remplisseur\s+top\s*3/i.test(description)
}

// NOTE sécurité (audit C01) : cette fonction filtre par event.isPrivate côté
// AFFICHAGE, mais ne doit jamais être le SEUL garde-fou. L'API/le serveur ne
// doit de toute façon jamais inclure les événements privés dans une réponse
// de liste publique (voir lib/server/events.ts) — cette fonction reste utile
// pour les cas où un event privé transite déjà (ex: page organisateur listant
// ses propres events, filtrée avant affichage public).
export function isClientDiscoverableEvent(event: EventLike | null | undefined, now: number = Date.now()): boolean {
  if (!event?.id || event.cancelled === true) return false
  if (event.visibility === 'private' || event.isPrivate) return false
  if (event.isDemo === true || event.demoLabel) return false
  if (isPlaceholderEvent(event)) return false
  if (event.publishAt && new Date(event.publishAt).getTime() > now) return false
  if (isEventEnded(event, now)) return false
  return eventStartMs(event) > 0
}
