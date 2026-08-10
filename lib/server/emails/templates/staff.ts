// Emails d'équipe événement (staff : scan/serveur/manager/dj).
// ⚠️ Pas encore branchés — voir lib/server/eventStaff.ts.
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { wrap, heading, paragraph, button, escapeHtml } from '../layout'

export function staffAddedEmail(eventName: string, roleLabel: string, scannerUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Tu es staff sur cet événement', 'accent')}
    ${paragraph(`Tu as été ajouté à l'équipe de <strong style="color:#fff;">${evName}</strong> avec le rôle <strong style="color:#fff;">${escapeHtml(roleLabel)}</strong>.`)}
    ${button(scannerUrl, "Accéder à l'app le jour J")}
  `
  return { subject: `Tu es staff sur ${eventName}`, html: wrap(inner, { site, preheader: `Rôle : ${roleLabel}` }) }
}

export function staffRemovedEmail(eventName: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Tu n’es plus staff sur cet événement')}
    ${paragraph(`Tu as été retiré de l'équipe de <strong style="color:#fff;">${evName}</strong>.`)}
  `
  return { subject: `Tu n'es plus staff sur ${eventName}`, html: wrap(inner, { site, preheader: 'Confirmation de retrait de l’équipe.' }) }
}
