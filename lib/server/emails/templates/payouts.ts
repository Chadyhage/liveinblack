// Emails de versement (payout) — organisateurs et prestataires.
// ⚠️ Pas encore branchés — voir lib/server/eventPayouts.ts.
import type { Email } from '../types'
import { DEFAULT_SITE, EMAIL_COLORS as C } from '../theme'
import { wrap, heading, paragraph, note, escapeHtml } from '../layout'

export function payoutInitiatedEmail(context: string, amountLabel: string, delayLabel: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Ton versement est en cours')}
    ${paragraph(`Ton versement de <strong style="color:${C.text};">${amountLabel}</strong> pour <strong style="color:${C.text};">${escapeHtml(context)}</strong> est en cours de traitement.`)}
    ${note(`Il devrait arriver sous ${delayLabel}.`)}
  `
  return {
    subject: `Ton versement pour ${context} est en cours`,
    html: wrap(inner, { site, preheader: `Versement de ${amountLabel} initié.` }),
    inApp: { type: 'payout', title: 'Versement en cours', body: `${amountLabel} pour ${context}.` },
  }
}

export function payoutConfirmedEmail(amountLabel: string, reference: string | null, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Versement effectué', 'accent')}
    ${paragraph(`Ton versement de <strong style="color:${C.text};">${amountLabel}</strong> a bien été effectué.`)}
    ${reference ? note(`Référence : ${escapeHtml(reference)}`) : ''}
  `
  return {
    subject: `Versement de ${amountLabel} effectué`,
    html: wrap(inner, { site, preheader: 'Confirmation de versement.' }),
    inApp: { type: 'payout', title: 'Versement effectué', body: amountLabel, push: true },
  }
}

export function payoutFailedEmail(amountLabel: string, reason: string | null, updateInfoUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Un problème est survenu avec ton versement', 'danger')}
    ${paragraph(`Ton versement de <strong style="color:${C.text};">${amountLabel}</strong> n'a pas pu être effectué${reason ? ` (${escapeHtml(reason)})` : ''}.`)}
    ${note(`Mets à jour tes informations de versement : ${updateInfoUrl}`)}
  `
  return {
    subject: 'Un problème est survenu avec ton versement',
    html: wrap(inner, { site, preheader: 'Action requise de ta part.' }),
    inApp: { type: 'payout', title: 'Problème avec ton versement', body: amountLabel, link: updateInfoUrl, push: true },
  }
}
