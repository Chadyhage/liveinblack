// Emails côté acheteur pour annulation/report d'événement et remboursement.
// Distincts des emails "abonnés" de templates/followers.ts — ici on
// s'adresse aux gens qui ont VRAIMENT un billet payé.
//
// ⚠️ Pas encore branchés — voir lib/server/organizerEventLifecycle.ts (annulation
// /report), lib/server/eventRefunds.ts + fedapayRefunds.ts (remboursement).
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { wrap, heading, paragraph, note, button, escapeHtml } from '../layout'

export function eventCancelledRefundEmail(eventName: string, amountLabel: string, delayLabel: string, reason: string | null, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading(`${eventName} est annulé`, 'danger')}
    ${paragraph(`<strong style="color:#fff;">${evName}</strong> a été annulé. Tu es automatiquement remboursé de <strong style="color:#fff;">${amountLabel}</strong>.`)}
    ${reason ? paragraph(`<strong style="color:#fff;">Motif :</strong> ${escapeHtml(reason)}`) : ''}
    ${note(`Le remboursement apparaîtra sur ton moyen de paiement sous ${delayLabel}.`)}
    ${button(`${site}/events`, "Découvrir d'autres événements", 'outline')}
  `
  return {
    subject: `${eventName} est annulé — tu es remboursé`,
    html: wrap(inner, { site, preheader: `Remboursement automatique de ${amountLabel}.` }),
    inApp: { type: 'refund', title: `${eventName} est annulé`, body: `Tu es remboursé de ${amountLabel}.`, link: `${site}/events`, push: true },
  }
}

export function eventPostponedTicketHolderEmail(eventName: string, previousWhen: string, newWhen: string, refundUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading(`${eventName} est reporté`, 'accent')}
    ${paragraph(`<strong style="color:#fff;">${evName}</strong> a été reporté à une nouvelle date. Ton billet reste valable.`)}
    ${paragraph(`<span style="color:rgba(255,255,255,0.5);text-decoration:line-through;">${escapeHtml(previousWhen)}</span><br/><strong style="color:#b8f34a;">Nouvelle date : ${escapeHtml(newWhen)}</strong>`)}
    ${button(refundUrl, 'Je ne peux pas venir — demander un remboursement', 'outline')}
  `
  return {
    subject: `${eventName} est reporté au ${newWhen}`,
    html: wrap(inner, { site, preheader: 'Ton billet reste valable à la nouvelle date.' }),
    inApp: { type: 'refund', title: `${eventName} est reporté`, body: `Nouvelle date : ${newWhen}. Ton billet reste valable.`, link: refundUrl, push: true },
  }
}

export function refundConfirmedEmail(eventName: string, amountLabel: string, delayLabel: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton remboursement est confirmé', 'accent')}
    ${paragraph(`Ton remboursement de <strong style="color:#fff;">${amountLabel}</strong> pour <strong style="color:#fff;">${evName}</strong> a été traité.`)}
    ${note(`Le montant apparaîtra sur ton moyen de paiement sous ${delayLabel}.`)}
  `
  return {
    subject: `Ton remboursement pour ${eventName} est confirmé`,
    html: wrap(inner, { site, preheader: `Remboursement de ${amountLabel} confirmé.` }),
    inApp: { type: 'refund', title: 'Remboursement confirmé', body: `${amountLabel} pour ${eventName}.`, push: true },
  }
}

export function refundFailedEmail(eventName: string, reason: string | null, supportUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Un problème est survenu avec ton remboursement', 'danger')}
    ${paragraph(`Le remboursement de ton billet pour <strong style="color:#fff;">${evName}</strong> n'a pas pu être traité${reason ? ` (${escapeHtml(reason)})` : ''}.`)}
    ${button(supportUrl, 'Contacter le support', 'danger')}
  `
  return {
    subject: `Ton remboursement pour ${eventName} a rencontré un problème`,
    html: wrap(inner, { site, preheader: 'Une action est nécessaire de ta part.' }),
    inApp: { type: 'refund', title: 'Problème avec ton remboursement', body: `${eventName} — action requise.`, link: supportUrl, push: true },
  }
}

export function ticketInvalidatedByResaleEmail(eventName: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton billet a été transféré')}
    ${paragraph(`Ton billet pour <strong style="color:#fff;">${evName}</strong> a été vendu et n'est plus valable sur ton compte.`)}
  `
  return {
    subject: `Ton billet pour ${eventName} a été transféré`,
    html: wrap(inner, { site, preheader: 'Confirmation de vente de ton billet.' }),
    inApp: { type: 'resale', title: 'Ton billet a été transféré', body: eventName, link: `${site}/profile/billets`, push: true },
  }
}
