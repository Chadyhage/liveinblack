// Port TypeScript de src/utils/event-time.js — centralise le calcul début/fin
// d'un event (logique dupliquée jusqu'ici dans plusieurs pages legacy).
import type { EventLike } from './event-types'

export function eventStartMs(ev: EventLike | null | undefined): number {
  if (!ev?.date) return 0
  try {
    const [sh, sm] = String(ev.time || '23:00').split(':').map(Number)
    const d = new Date(ev.date + 'T00:00:00')
    d.setHours(sh, sm, 0, 0)
    return d.getTime()
  } catch {
    return 0
  }
}

export function eventEndMs(ev: EventLike | null | undefined): number {
  if (!ev?.date) return 0
  try {
    const endTime = ev.endTime || ev.time || '23:59'
    const [h, m] = String(endTime).split(':').map(Number)
    const d = new Date(ev.date + 'T00:00:00')
    d.setHours(h, m, 0, 0)
    const [sh, sm] = String(ev.time || '00:00').split(':').map(Number)
    if (h < sh || (h === sh && m < sm)) d.setDate(d.getDate() + 1)
    return d.getTime()
  } catch {
    return 0
  }
}

// Fin métier effective : closingDate permet à l'organisateur de publier une
// heure de clôture précise. À défaut, on retombe sur date + endTime.
export function eventEffectiveEndMs(ev: EventLike | null | undefined): number {
  if (ev?.closingDate) {
    const closing = new Date(ev.closingDate).getTime()
    if (Number.isFinite(closing)) return closing
  }
  return eventEndMs(ev)
}

export function isEventEnded(ev: EventLike | null | undefined, now: number = Date.now(), graceMs = 0): boolean {
  if (!ev) return false
  if (ev.cancelled) return true
  const end = eventEffectiveEndMs(ev)
  return end > 0 && now >= end + Math.max(0, Number(graceMs) || 0)
}

export function isEventStarted(ev: EventLike | null | undefined, now: number = Date.now()): boolean {
  if (!ev || ev.cancelled) return false
  const start = eventStartMs(ev)
  return start > 0 && now >= start
}

export function isEventLive(ev: EventLike | null | undefined, now: number = Date.now(), graceMs = 0): boolean {
  if (!isEventStarted(ev, now)) return false
  const end = eventEffectiveEndMs(ev)
  return end > 0 && now < end + graceMs
}
