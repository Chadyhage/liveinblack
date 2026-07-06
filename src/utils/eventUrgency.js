// Helpers FOMO/urgence pour les cartes d'événements (liste + Top 3).
// Pures : prennent un event, renvoient de quoi afficher countdown + stock.

export function getEventStartTimestamp(event) {
  if (!event?.date) return 0
  try {
    const [sh, sm] = (event.time || '23:00').split(':').map(Number)
    const d = new Date(event.date + 'T00:00:00'); d.setHours(sh, sm, 0, 0)
    return d.getTime()
  } catch { return 0 }
}

export function getEventEndTimestamp(event) {
  const start = getEventStartTimestamp(event)
  if (!start) return 0
  try {
    const [eh, em] = (event.endTime || event.time || '23:59').split(':').map(Number)
    const end = new Date(event.date + 'T00:00:00')
    end.setHours(eh, em, 0, 0)
    if (end.getTime() < start) end.setDate(end.getDate() + 1)
    return end.getTime()
  } catch { return 0 }
}

// Un événement appartient au rail « ce soir » s'il commence bientôt OU s'il
// est réellement encore en cours. Une soirée qui traverse minuit ne disparaît
// donc pas après une durée arbitraire depuis son heure de début.
export function isEventOngoingOrStartingWithin(event, nowTs = Date.now(), windowHours = 18) {
  const start = getEventStartTimestamp(event)
  const end = getEventEndTimestamp(event)
  if (!start || !end || event?.cancelled) return false
  if (start <= nowTs) return end >= nowTs
  return start - nowTs <= windowHours * 3600000
}

// Libellé court avant la soirée : CE SOIR / DEMAIN / J-3 / DANS 4H… ou null.
export function getEventCountdown(event, nowTs = Date.now()) {
  if (event?.cancelled) return null
  const ts = getEventStartTimestamp(event)
  if (!ts) return null
  const ms = ts - nowTs
  if (ms <= 0) return null
  const h = Math.floor(ms / 3600000)
  if (h < 1) return `DANS ${Math.max(1, Math.floor(ms / 60000))} MIN`
  if (h < 8) return `DANS ${h}H`
  const startDay = new Date(ts); startDay.setHours(0, 0, 0, 0)
  const today = new Date(nowTs); today.setHours(0, 0, 0, 0)
  const days = Math.round((startDay.getTime() - today.getTime()) / 86400000)
  if (days <= 0) return 'CE SOIR'
  if (days === 1) return 'DEMAIN'
  return `J-${days}`
}

// true si la soirée est dans moins de 48h (countdown à styliser en urgent).
export function isCountdownUrgent(event, nowTs = Date.now()) {
  const ts = getEventStartTimestamp(event)
  return ts > 0 && (ts - nowTs) > 0 && (ts - nowTs) < 48 * 3600000
}

// Badge de stock : { label, color } ou null.
export function getStockBadge(event) {
  if (event?.cancelled) return null
  const places = event?.places || []
  const totalCap = places.reduce((s, p) => s + (Number(p.total) || 0), 0)
  const avail = places.reduce((s, p) => s + (Number(p.available) || 0), 0)
  if (totalCap === 0) return null
  if (avail === 0) return { label: 'COMPLET', color: '#e05aaa' }
  if (avail <= 5) return { label: `${avail} PLACE${avail > 1 ? 'S' : ''}`, color: '#e05aaa' }
  const fill = Math.round((totalCap - avail) / totalCap * 100)
  if (fill >= 80) return { label: 'BIENTÔT COMPLET', color: '#c8a96e' }
  return null
}
