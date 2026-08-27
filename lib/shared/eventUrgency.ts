// Port TypeScript de src/utils/eventUrgency.js — helpers FOMO/urgence pour les
// cartes d'événements (liste + Top 3). Pures : prennent un event, renvoient de
// quoi afficher countdown + stock.
import type { EventLike } from './event-types'
import { eventStartMs, eventEndMs } from './event-time'

// Ré-exports de event-time.ts (mêmes noms historiques de ce fichier, gardés
// pour ne pas toucher tous les appelants) — évite de dupliquer le calcul
// début/fin d'un événement une seconde fois : ce fichier calculait autrefois
// sa propre version, interprétée dans le fuseau de la machine qui exécute le
// code plutôt que celui de l'événement (même bug que event-time.ts, corrigé
// une seule fois là-bas).
export const getEventStartTimestamp = eventStartMs
export const getEventEndTimestamp = eventEndMs

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

// `ink` = couleur de texte lisible sur `color` — `--gold`/`--primary` est un
// vert citron clair (var(--primary)) : du texte blanc dessus est illisible (retour
// client), il faut `--primary-ink` (foncé). `--pink` reste assez sombre pour
// du texte blanc.
export type StockBadge = { label: string; color: string; ink: string }

export function getStockBadge(event: EventLike | null | undefined): StockBadge | null {
  if (event?.cancelled) return null
  const places = event?.places || []
  const totalCap = places.reduce((s, p) => s + (Number(p.total) || 0), 0)
  const avail = places.reduce((s, p) => s + (Number(p.available) || 0), 0)
  if (totalCap === 0) return null
  if (avail === 0) return { label: 'COMPLET', color: 'var(--pink)', ink: '#fff' }
  if (avail <= 5) return { label: `${avail} PLACE${avail > 1 ? 'S' : ''}`, color: 'var(--pink)', ink: '#fff' }
  const fill = Math.round(((totalCap - avail) / totalCap) * 100)
  if (fill >= 80) return { label: 'BIENTÔT COMPLET', color: 'var(--gold)', ink: 'var(--primary-ink)' }
  return null
}
