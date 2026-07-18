import { eventStartMs, isEventEnded } from './event-time.js'

export function isPlaceholderEvent(event) {
  const name = String(event?.name || event?.title || '').trim()
  const description = String(event?.description || '').trim()
  return /^filler\b/i.test(name) || /remplisseur\s+top\s*3/i.test(description)
}

export function isClientDiscoverableEvent(event, now = Date.now()) {
  if (!event?.id || event.cancelled === true) return false
  if (event.visibility === 'private' || event.isPrivate) return false
  if (event.isDemo === true || event.demoLabel) return false
  if (isPlaceholderEvent(event)) return false
  if (event.publishAt && new Date(event.publishAt).getTime() > now) return false
  if (isEventEnded(event, now)) return false
  return eventStartMs(event) > 0
}
