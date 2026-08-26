// Emails aux abonnés d'un organisateur — nouvel événement, changement de
// programmation (annulation/report). Adressés aux ABONNÉS (information),
// jamais aux acheteurs (qui ont leur propre flux, voir templates/refunds.ts
// et templates/tickets.ts).
import type { Email } from '../types'
import { DEFAULT_SITE, EMAIL_COLORS as C } from '../theme'
import { scopedWrap, heading, paragraph, note, button, escapeHtml } from '../layout'

const wrap = scopedWrap('event')

export interface FollowedEventSummary {
  id: string
  name: string
  dateDisplay?: string | null
  date?: string | null
  time?: string | null
  location?: string | null
  city?: string | null
}

export function organizerNewEventEmail(event: FollowedEventSummary, organizerName: string, site: string = DEFAULT_SITE): Email {
  const name = escapeHtml(organizerName || 'Un organisateur que tu suis')
  const evName = escapeHtml(event.name || 'Nouvel événement')
  const when = [event.dateDisplay || event.date, event.time].filter(Boolean).map((v) => escapeHtml(String(v))).join(' · ')
  const where = [event.location, event.city].filter(Boolean).map((v) => escapeHtml(String(v))).join(', ')
  const inner = `
    ${heading(evName, 'accent')}
    ${paragraph(`<strong style="color:${C.text};">${name}</strong> vient d'annoncer un nouvel événement sur LIVE IN BLACK.`)}
    ${when ? paragraph(`<strong style="color:${C.text};">Quand :</strong> ${when}`) : ''}
    ${where ? paragraph(`<strong style="color:${C.text};">Où :</strong> ${where}`) : ''}
    ${button(`${site}/events/${encodeURIComponent(event.id)}`, "Voir l'événement et réserver")}
    ${note(`Tu reçois cet e-mail parce que tu suis ${name} sur LIVE IN BLACK. Tu peux te désabonner ou régler tes alertes depuis <a href="${site}/profile/followed-organizers" style="color:${C.primaryText};">tes organisateurs suivis</a>.`)}
  `
  return { subject: `${organizerName || 'LIVE IN BLACK'} annonce : ${event.name || 'nouvel événement'}`, html: wrap(inner, { site, preheader: `${organizerName} vient d'annoncer un nouvel événement.` }) }
}

export function organizerScheduleChangeEmail(
  event: FollowedEventSummary,
  organizerName: string,
  kind: 'cancelled' | 'postponed',
  extra: { previousWhen?: string; newWhen?: string } = {},
  site: string = DEFAULT_SITE
): Email {
  const name = escapeHtml(organizerName || 'Un organisateur que tu suis')
  const evName = escapeHtml(event.name || 'un événement')
  if (kind === 'cancelled') {
    const when = [event.dateDisplay || event.date, event.time].filter(Boolean).map((v) => escapeHtml(String(v))).join(' · ')
    const inner = `
      ${heading('Événement annulé', 'danger')}
      ${paragraph(`<strong style="color:${C.text};">${name}</strong> a annulé « ${evName} »${when ? ` (${when})` : ''}.`)}
      ${button(`${site}/events`, "Découvrir d'autres événements")}
      ${note(`Tu reçois cet e-mail parce que tu suis ${name} sur LIVE IN BLACK. Règle tes alertes depuis <a href="${site}/profile/followed-organizers" style="color:${C.primaryText};">tes organisateurs suivis</a>.`)}
    `
    return { subject: `Annulé : ${event.name || 'un événement'}`, html: wrap(inner, { site, preheader: `${organizerName} a annulé ${event.name}.` }) }
  }
  const oldW = escapeHtml(extra.previousWhen || '')
  const newW = escapeHtml(extra.newWhen || '')
  const inner = `
    ${heading('Événement reporté', 'accent')}
    ${paragraph(`<strong style="color:${C.text};">${name}</strong> a reporté « ${evName} » à une nouvelle date.`)}
    ${oldW ? paragraph(`<span style="color:${C.textMuted};text-decoration:line-through;">${oldW}</span>`) : ''}
    ${newW ? paragraph(`<strong style="color:${C.primaryText};">Nouvelle date : ${newW}</strong>`) : ''}
    ${button(`${site}/events/${encodeURIComponent(event.id)}`, "Voir l'événement")}
    ${note(`Tu reçois cet e-mail parce que tu suis ${name} sur LIVE IN BLACK. Règle tes alertes depuis <a href="${site}/profile/followed-organizers" style="color:${C.primaryText};">tes organisateurs suivis</a>.`)}
  `
  return { subject: `Reporté : ${event.name || 'un événement'}`, html: wrap(inner, { site, preheader: `${organizerName} a reporté ${event.name}.` }) }
}
