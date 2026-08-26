// E-mails d'équipe événement (scan, service, coordination et DJ).
// ⚠️ Pas encore branchés — voir lib/server/eventStaff.ts.
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { scopedWrap, heading, paragraph, button, escapeHtml } from '../layout'

const wrap = scopedWrap('staff')

export function staffAddedEmail(eventName: string, roleLabel: string, scannerUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Tu rejoins l’équipe de cet événement', 'accent')}
    ${paragraph(`Tu as été ajouté à l'équipe de <strong style="color:inherit;">${evName}</strong> avec le rôle <strong style="color:inherit;">${escapeHtml(roleLabel)}</strong>.`)}
    ${button(scannerUrl, "Accéder à l'app le jour J")}
  `
  return {
    subject: `Tu rejoins l’équipe de ${eventName}`,
    html: wrap(inner, { site, preheader: `Rôle : ${roleLabel}` }),
    inApp: { type: 'staff', title: 'Tu rejoins l’équipe de cet événement', body: `${eventName} — rôle : ${roleLabel}`, link: scannerUrl, push: true },
  }
}

export function staffRemovedEmail(eventName: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Tu ne fais plus partie de l’équipe')}
    ${paragraph(`Tu as été retiré de l'équipe de <strong style="color:inherit;">${evName}</strong>.`)}
  `
  return {
    subject: `Tu ne fais plus partie de l’équipe de ${eventName}`,
    html: wrap(inner, { site, preheader: 'Confirmation de retrait de l’équipe.' }),
    inApp: { type: 'staff', title: 'Accès à l’équipe retiré', body: eventName, push: true },
  }
}
