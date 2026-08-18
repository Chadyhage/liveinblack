// Notification interne à l'équipe LIVEINBLACK lors d'une soumission du
// formulaire public /contact.
import type { Email } from '../types'
import { DEFAULT_SITE, EMAIL_COLORS as C } from '../theme'
import { wrap, heading, paragraph, note, escapeHtml } from '../layout'

export function contactRequestEmail(
  data: { name: string; email: string; subject: string; message: string },
  site: string = DEFAULT_SITE
): Email {
  const name = escapeHtml(data.name)
  const email = escapeHtml(data.email)
  const subjectLine = escapeHtml(data.subject)
  const messageHtml = escapeHtml(data.message).replace(/\n/g, '<br/>')
  const inner = `
    ${heading('Nouveau message de contact')}
    ${paragraph(`<strong style="color:${C.text};">De :</strong> ${name} (<a href="mailto:${email}" style="color:${C.primaryText};">${email}</a>)`)}
    ${paragraph(`<strong style="color:${C.text};">Sujet :</strong> ${subjectLine}`)}
    ${paragraph(messageHtml)}
    ${note(`Envoyé depuis le formulaire de contact sur ${site}/contact.`)}
  `
  return { subject: `[Contact] ${data.subject}`, html: wrap(inner, { site, preheader: `Nouveau message de ${data.name}` }) }
}
