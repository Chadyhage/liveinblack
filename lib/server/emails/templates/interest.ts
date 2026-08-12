// Rappel pour les événements marqués "intéressé" par un client.
// ⚠️ Pas encore branché — nécessite un cron quotidien (aucun cron équivalent
// n'existe encore, à créer sur le modèle de
// lib/server/providerSubscriptions.ts::runSubscriptionReminderCron).
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { wrap, heading, paragraph, button, escapeHtml } from '../layout'

export function interestedEventReminderEmail(eventName: string, eventWhen: string, eventUrl: string, alreadyBought: boolean, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading(`${eventName} c'est demain !`, 'accent')}
    ${paragraph(`Tu avais marqué <strong style="color:#fff;">${evName}</strong> (${escapeHtml(eventWhen)}) comme intéressant.`)}
    ${button(eventUrl, alreadyBought ? 'Voir mon billet' : 'Réserver maintenant', alreadyBought ? 'outline' : 'primary')}
  `
  return {
    subject: `${eventName} c'est demain !`,
    html: wrap(inner, { site, preheader: eventWhen }),
    inApp: { type: 'reminder', title: `${eventName} c'est demain !`, body: eventWhen, link: eventUrl },
  }
}
