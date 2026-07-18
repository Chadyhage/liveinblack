// Partage externe + export calendrier — 100 % côté client, AUCUNE fonction serveur.
//
// - shareOrCopy() : Web Share API (feuille de partage native sur mobile : WhatsApp,
//   Messages, Instagram…) avec repli automatique sur « copier le lien » sur desktop.
// - downloadICS() : génère un fichier .ics (data-URI) que l'utilisateur ajoute à
//   Apple Calendar / Google Agenda / Outlook. Pas de dépendance externe.

// Partage un lien. Renvoie { ok, method } où method ∈ 'share' | 'copy' | 'cancel' | 'none'.
export async function shareOrCopy({ title, text, url } = {}) {
  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '')
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url: shareUrl })
      return { ok: true, method: 'share' }
    } catch (e) {
      // L'utilisateur a fermé la feuille de partage → ne pas retomber sur le copier.
      if (e?.name === 'AbortError') return { ok: false, method: 'cancel' }
    }
  }
  try {
    await navigator.clipboard.writeText(shareUrl)
    return { ok: true, method: 'copy' }
  } catch {
    return { ok: false, method: 'none' }
  }
}

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Combine une date ISO (YYYY-MM-DD) + une heure (HH:MM) en objet Date local.
// Tolère une Date déjà construite ou une chaîne ISO complète.
export function combineDateTime(dateISO, time) {
  if (dateISO instanceof Date) return dateISO
  if (!dateISO) return null
  const iso = String(dateISO)
  if (iso.includes('T')) return new Date(iso)
  const t = /^\d{1,2}:\d{2}/.test(String(time || '')) ? time : '22:00'
  const d = new Date(`${iso}T${t}`)
  return isNaN(d.getTime()) ? null : d
}

function icsStamp(d) {
  // YYYYMMDDTHHMMSSZ (UTC)
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function buildICS({ title, description, location, start, end } = {}) {
  const dtStart = start instanceof Date ? start : new Date(start)
  if (!dtStart || isNaN(dtStart.getTime())) return null
  const dtEnd = end instanceof Date ? end
    : end ? new Date(end)
    : new Date(dtStart.getTime() + 3 * 3600 * 1000) // défaut : +3 h
  const esc = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n')
  const uid = `${dtStart.getTime()}-${hashStr(title || 'liveinblack')}@liveinblack.com`
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LIVEINBLACK//FR//', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(dtStart)}`,
    `DTSTART:${icsStamp(dtStart)}`,
    `DTEND:${icsStamp(dtEnd)}`,
    `SUMMARY:${esc(title)}`,
    description ? `DESCRIPTION:${esc(description)}` : '',
    location ? `LOCATION:${esc(location)}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
}

// Déclenche le téléchargement d'un .ics. Renvoie true si généré, false sinon.
export function downloadICS(opts = {}) {
  const ics = buildICS(opts)
  if (!ics) return false
  try {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${String(opts.title || 'evenement').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch {
    return false
  }
}
