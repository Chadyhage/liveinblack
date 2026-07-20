// Port TypeScript de src/utils/eventUrgency.js — helpers FOMO/urgence pour les
// cartes d'événements (liste + Top 3). Pures : prennent un event, renvoient de
// quoi afficher countdown + stock.
import type { EventLike } from './event-types'

export function getEventStartTimestamp(event: EventLike | null | undefined): number {
  if (!event?.date) return 0
  try {
    const [sh, sm] = (event.time || '23:00').split(':').map(Number)
    const d = new Date(event.date + 'T00:00:00')
    d.setHours(sh, sm, 0, 0)
    return d.getTime()
  } catch {
    return 0
  }
}

export function getEventEndTimestamp(event: EventLike | null | undefined): number {
  const start = getEventStartTimestamp(event)
  if (!start) return 0
  try {
    const [eh, em] = (event!.endTime || event!.time || '23:59').split(':').map(Number)
    const end = new Date(event!.date + 'T00:00:00')
    end.setHours(eh, em, 0, 0)
    if (end.getTime() < start) end.setDate(end.getDate() + 1)
    return end.getTime()
  } catch {
    return 0
  }
}

export function isEventOngoingOrStartingWithin(
  event: EventLike | null | undefined,
  nowTs: number = Date.now(),
  windowHours = 18
): boolean {
  const start = getEventStartTimestamp(event)
  const end = getEventEndTimestamp(event)
  if (!start || !end || event?.cancelled) return false
  if (start <= nowTs) return end >= nowTs
  return start - nowTs <= windowHours * 3600000
}

// « Ce soir » = source unique, alignée sur le badge countdown.
export function isEventTonight(event: EventLike | null | undefined, nowTs: number = Date.now()): boolean {
  const start = getEventStartTimestamp(event)
  const end = getEventEndTimestamp(event)
  if (!start || !end || event?.cancelled) return false
  if (start <= nowTs) return end >= nowTs
  const startDay = new Date(start)
  startDay.setHours(0, 0, 0, 0)
  const today = new Date(nowTs)
  today.setHours(0, 0, 0, 0)
  if (startDay.getTime() === today.getTime()) return true
  return start - nowTs <= 8 * 3600000
}

export function getEventCountdown(event: EventLike | null | undefined, nowTs: number = Date.now()): string | null {
  if (event?.cancelled) return null
  const ts = getEventStartTimestamp(event)
  if (!ts) return null
  const ms = ts - nowTs
  if (ms <= 0) return null
  const h = Math.floor(ms / 3600000)
  if (h < 1) return `DANS ${Math.max(1, Math.floor(ms / 60000))} MIN`
  if (h < 8) return `DANS ${h}H`
  const startDay = new Date(ts)
  startDay.setHours(0, 0, 0, 0)
  const today = new Date(nowTs)
  today.setHours(0, 0, 0, 0)
  const days = Math.round((startDay.getTime() - today.getTime()) / 86400000)
  if (days <= 0) return 'CE SOIR'
  if (days === 1) return 'DEMAIN'
  return `J-${days}`
}

export function isCountdownUrgent(event: EventLike | null | undefined, nowTs: number = Date.now()): boolean {
  const ts = getEventStartTimestamp(event)
  return ts > 0 && ts - nowTs > 0 && ts - nowTs < 48 * 3600000
}

export type StockBadge = { label: string; color: string }

export function getStockBadge(event: EventLike | null | undefined): StockBadge | null {
  if (event?.cancelled) return null
  const places = event?.places || []
  const totalCap = places.reduce((s, p) => s + (Number(p.total) || 0), 0)
  const avail = places.reduce((s, p) => s + (Number(p.available) || 0), 0)
  if (totalCap === 0) return null
  if (avail === 0) return { label: 'COMPLET', color: 'var(--pink)' }
  if (avail <= 5) return { label: `${avail} PLACE${avail > 1 ? 'S' : ''}`, color: 'var(--pink)' }
  const fill = Math.round(((totalCap - avail) / totalCap) * 100)
  if (fill >= 80) return { label: 'BIENTÔT COMPLET', color: 'var(--gold)' }
  return null
}
