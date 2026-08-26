// Emails de la bourse de revente officielle de billets.
// Branchés depuis lib/server/resale.ts (via notifyUserById).
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { scopedWrap, heading, paragraph, note, button, escapeHtml } from '../layout'

const wrap = scopedWrap('resale')

export function resaleListingCreatedEmail(eventName: string, priceLabel: string, manageUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton billet est en vente')}
    ${paragraph(`Ton billet pour <strong style="color:inherit;">${evName}</strong> est maintenant proposé à la revente pour <strong style="color:inherit;">${priceLabel}</strong>.`)}
    ${button(manageUrl, 'Gérer mon annonce', 'outline')}
  `
  return {
    subject: `Ton billet pour ${eventName} est en vente`,
    html: wrap(inner, { site, preheader: `Annonce active à ${priceLabel}.` }),
    inApp: { type: 'resale', title: 'Ton billet est en vente', body: `${eventName} — ${priceLabel}.`, link: manageUrl, push: true },
  }
}

export function resaleListingSoldEmail(eventName: string, netAmountLabel: string, payoutDelayLabel: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton billet a trouvé preneur 💸', 'accent')}
    ${paragraph(`Ton billet pour <strong style="color:inherit;">${evName}</strong> a été vendu ! Tu recevras <strong style="color:inherit;">${netAmountLabel}</strong> (net de commission).`)}
    ${note(`Le versement arrive généralement sous ${payoutDelayLabel} après l'événement.`)}
  `
  return {
    subject: `Ton billet pour ${eventName} a trouvé preneur 💸`,
    html: wrap(inner, { site, preheader: `Vente confirmée — ${netAmountLabel} à venir.` }),
    inApp: { type: 'resale', title: 'Ton billet a trouvé preneur 💸', body: `${eventName} — ${netAmountLabel} net à venir.`, push: true },
  }
}

export function resaleListingExpiredEmail(eventName: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton annonce a expiré')}
    ${paragraph(`Ton annonce de revente pour <strong style="color:inherit;">${evName}</strong> a expiré sans trouver d'acheteur (la revente ferme automatiquement peu avant l'ouverture des portes).`)}
  `
  return {
    subject: `Ton annonce pour ${eventName} a expiré`,
    html: wrap(inner, { site, preheader: 'La fenêtre de revente est fermée pour cet événement.' }),
    inApp: { type: 'resale', title: 'Ton annonce a expiré', body: eventName, link: `${site}/profile/billets`, push: true },
  }
}
