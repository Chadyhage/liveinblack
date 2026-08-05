// Port TypeScript de src/utils/event-time.js — centralise le calcul début/fin
// d'un event (logique dupliquée jusqu'ici dans plusieurs pages legacy).
import type { EventLike } from './event-types'
import { getRegionByName } from './regions'

// UTC+0 toute l'année (aucune des régions XOF n'a de changement d'heure) —
// repère par défaut si `region` est absent/inconnu, ex. anciens events sans
// région ou fixtures de test.
const DEFAULT_TIMEZONE = 'Africa/Lome'

function eventTimezone(ev: EventLike | null | undefined): string {
  const region = ev?.region ? getRegionByName(ev.region) : null
  return region?.timezone || DEFAULT_TIMEZONE
}

// Décalage réel (en minutes, positif = à l'est de UTC) d'un fuseau IANA à un
// instant donné — API Intl native (aucune dépendance ajoutée), gère les
// changements d'heure automatiquement pour les fuseaux qui en ont (Europe/Paris).
function getUtcOffsetMinutes(timeZone: string, atMs: number): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(atMs))
    const map: Record<string, string> = {}
    for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value
    const asIfUtc = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second))
    return Math.round((asIfUtc - atMs) / 60000)
  } catch {
    return 0
  }
}

// Convertit une date+heure "horloge murale" dans le fuseau d'un événement en
// timestamp UTC réel — remplace `new Date(date+'T00:00:00')` + `setHours()`,
// qui s'interprétaient dans le fuseau de la MACHINE qui exécute le code
// (toujours UTC côté serveur Vercel, celui du visiteur côté client) plutôt
// que dans celui de l'événement réel (bug confirmé par audit : un event
// Paris à 23h se terminait, du point de vue du serveur, 1-2h plus tard que
// dans la vraie vie — seat-hold/boost vendables sur un event déjà terminé).
// Approximation assumée : le décalage est calculé sur l'instant "horloge
// murale interprétée comme UTC" plutôt qu'une résolution itérative exacte —
// à moins d'un événement démarrant PENDANT la bascule DST elle-même (2h-3h du
// matin, jamais une heure de programmation d'événement), l'écart est nul.
function localWallClockToUtcMs(dateStr: string, timeStr: string, timeZone: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  if (!y || !mo || !d) return 0
  const naiveUtcMs = Date.UTC(y, mo - 1, d, h || 0, mi || 0, 0, 0)
  const offsetMin = getUtcOffsetMinutes(timeZone, naiveUtcMs)
  return naiveUtcMs - offsetMin * 60000
}

export function eventStartMs(ev: EventLike | null | undefined): number {
  if (!ev?.date) return 0
  try {
    return localWallClockToUtcMs(ev.date, String(ev.time || '23:00'), eventTimezone(ev))
  } catch {
    return 0
  }
}

export function eventEndMs(ev: EventLike | null | undefined): number {
  if (!ev?.date) return 0
  try {
    const timeZone = eventTimezone(ev)
    const startMs = localWallClockToUtcMs(ev.date, String(ev.time || '00:00'), timeZone)
    let endMs = localWallClockToUtcMs(ev.date, String(ev.endTime || ev.time || '23:59'), timeZone)
    // endTime plus tôt que time = la soirée traverse minuit (ex. 21:00→06:00).
    if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000
    return endMs
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
