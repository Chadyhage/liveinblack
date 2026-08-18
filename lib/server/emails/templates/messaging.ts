// Emails liés à la messagerie — digest de messages non lus (throttlé, jamais
// un email par message), ajout à un groupe.
// ⚠️ Pas encore branchés — voir lib/server/messaging.ts. Nécessite un
// mécanisme de throttle/debounce (ex. "au plus 1 digest par conversation par
// heure") avant d'être activé, pour ne pas spammer.
import type { Email } from '../types'
import { DEFAULT_SITE, EMAIL_COLORS as C } from '../theme'
import { wrap, heading, paragraph, button, escapeHtml } from '../layout'

export function newMessageDigestEmail(senderName: string, preview: string, conversationUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Nouveau message')}
    ${paragraph(`<strong style="color:${C.text};">${escapeHtml(senderName)}</strong> t'a envoyé un message :`)}
    ${paragraph(`<em style="color:${C.textMuted};">"${escapeHtml(preview)}"</em>`)}
    ${button(conversationUrl, 'Répondre')}
  `
  return { subject: `${senderName} t'a envoyé un message`, html: wrap(inner, { site, preheader: preview }) }
}

export function addedToGroupEmail(groupName: string, addedByName: string, groupUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Tu as été ajouté à un groupe')}
    ${paragraph(`<strong style="color:${C.text};">${escapeHtml(addedByName)}</strong> t'a ajouté au groupe <strong style="color:${C.text};">${escapeHtml(groupName)}</strong>.`)}
    ${button(groupUrl, 'Voir le groupe')}
  `
  return {
    subject: `Tu as été ajouté au groupe ${groupName}`,
    html: wrap(inner, { site, preheader: `Ajouté par ${addedByName}` }),
    inApp: { type: 'group', title: 'Tu as été ajouté à un groupe', body: `${groupName} — ajouté par ${addedByName}`, link: groupUrl, push: true },
  }
}
