// Email de signalement reçu contre un organisateur/prestataire.
// ⚠️ Pas encore branché — voir lib/server/reports.ts (modération agent).
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { scopedWrap, heading, paragraph, note, escapeHtml } from '../layout'

const wrap = scopedWrap('moderation')

export function reportReceivedAgainstAccountEmail(natureLabel: string, supportUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Un signalement a été déposé', 'danger')}
    ${paragraph(`Un signalement concernant ton compte a été déposé (${escapeHtml(natureLabel)}). Notre équipe l'examine.`)}
    ${note(`Si tu penses qu'il s'agit d'une erreur, contacte-nous : ${supportUrl}`)}
  `
  return {
    subject: 'Un signalement a été déposé — action requise',
    html: wrap(inner, { site, preheader: 'Notre équipe examine un signalement te concernant.' }),
    inApp: { type: 'report', title: 'Un signalement a été déposé', body: natureLabel, link: supportUrl, push: true },
  }
}
