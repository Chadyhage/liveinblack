// Emails de la bourse de revente officielle de billets.
// ⚠️ Pas encore branchés — voir lib/server/resale.ts (à créer, cf. plan de
// migration LIVEINBLACK — Bourse de revente officielle).
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { wrap, heading, paragraph, note, button, escapeHtml } from '../layout'

export function resaleListingCreatedEmail(eventName: string, priceLabel: string, manageUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton billet est en vente')}
    ${paragraph(`Ton billet pour <strong style="color:#fff;">${evName}</strong> est maintenant proposé à la revente pour <strong style="color:#fff;">${priceLabel}</strong>.`)}
    ${button(manageUrl, 'Gérer mon annonce', 'outline')}
  `
  return { subject: `Ton billet pour ${eventName} est en vente`, html: wrap(inner, { site, preheader: `Annonce active à ${priceLabel}.` }) }
}

export function resaleListingSoldEmail(eventName: string, netAmountLabel: string, payoutDelayLabel: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton billet a trouvé preneur 💸', 'accent')}
    ${paragraph(`Ton billet pour <strong style="color:#fff;">${evName}</strong> a été vendu ! Tu recevras <strong style="color:#fff;">${netAmountLabel}</strong> (net de commission).`)}
    ${note(`Le versement arrive généralement sous ${payoutDelayLabel} après l'événement.`)}
  `
  return { subject: `Ton billet pour ${eventName} a trouvé preneur 💸`, html: wrap(inner, { site, preheader: `Vente confirmée — ${netAmountLabel} à venir.` }) }
}

export function resaleListingExpiredEmail(eventName: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton annonce a expiré')}
    ${paragraph(`Ton annonce de revente pour <strong style="color:#fff;">${evName}</strong> a expiré sans trouver d'acheteur (la revente ferme automatiquement peu avant l'ouverture des portes).`)}
  `
  return { subject: `Ton annonce pour ${eventName} a expiré`, html: wrap(inner, { site, preheader: 'La fenêtre de revente est fermée pour cet événement.' }) }
}
