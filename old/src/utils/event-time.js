// ─── Helpers de temps d'événement ────────────────────────────────────────────
// Centralise le calcul début/fin d'un event (logique dupliquée jusqu'ici dans
// EventDetailPage, ScannerPage, HomePage, MesEvenementsPage).
//
// Shape d'un event : date = 'YYYY-MM-DD', time = 'HH:MM' (début), endTime = 'HH:MM'
// (fin, peut être le lendemain), closingDate = ISO parsable ou null, cancelled = bool.

export function eventStartMs(ev) {
  if (!ev?.date) return 0
  try {
    const [sh, sm] = String(ev.time || '23:00').split(':').map(Number)
    const d = new Date(ev.date + 'T00:00:00')
    d.setHours(sh, sm, 0, 0)
    return d.getTime()
  } catch { return 0 }
}

export function eventEndMs(ev) {
  if (!ev?.date) return 0
  try {
    const endTime = ev.endTime || ev.time || '23:59'
    const [h, m] = String(endTime).split(':').map(Number)
    const d = new Date(ev.date + 'T00:00:00')
    d.setHours(h, m, 0, 0)
    const [sh, sm] = String(ev.time || '00:00').split(':').map(Number)
    // Fin <= début → la soirée croise minuit → +1 jour
    if (h < sh || (h === sh && m < sm)) d.setDate(d.getDate() + 1)
    return d.getTime()
  } catch { return 0 }
}

// Fin métier effective : closingDate permet à l'organisateur de publier une
// heure de clôture précise. À défaut, on retombe sur date + endTime.
export function eventEffectiveEndMs(ev) {
  if (ev?.closingDate) {
    const closing = new Date(ev.closingDate).getTime()
    if (Number.isFinite(closing)) return closing
  }
  return eventEndMs(ev)
}

// Un événement annulé est immédiatement clos. Pour un événement normal, le
// billet expire dès la fin effective ; graceMs est réservé aux outils internes
// qui ont explicitement besoin d'une marge opérationnelle.
export function isEventEnded(ev, now = Date.now(), graceMs = 0) {
  if (!ev) return false
  if (ev.cancelled) return true
  const end = eventEffectiveEndMs(ev)
  return end > 0 && now >= end + Math.max(0, Number(graceMs) || 0)
}

// « La soirée a commencé » (borne basse fiable). Un event annulé n'a jamais commencé.
export function isEventStarted(ev, now = Date.now()) {
  if (!ev || ev.cancelled) return false
  const start = eventStartMs(ev)
  return start > 0 && now >= start
}

// « La soirée est EN COURS » : commencée et pas encore terminée (grâce optionnelle).
// graceMs : marge après la fin pendant laquelle on considère encore la soirée active
// (le POS sert des consos jusqu'à ~12h après la fin théorique).
export function isEventLive(ev, now = Date.now(), graceMs = 0) {
  if (!isEventStarted(ev, now)) return false
  const end = eventEffectiveEndMs(ev)
  return end > 0 && now < end + graceMs
}
