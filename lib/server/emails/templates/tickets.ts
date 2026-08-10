// Emails côté acheteur — achat confirmé, échec de paiement, blocage de place
// (seat hold) sur le point d'expirer/expiré, billet reçu (transfert/revente).
//
// ⚠️ Templates créés mais PAS ENCORE branchés à un déclencheur métier — voir
// EMAIL_COVERAGE_PROPOSAL.md pour le plan de câblage (lib/server/orders.ts,
// lib/server/seatHolds.ts). Le contenu/design est prêt, l'appel sendEmail()
// reste à ajouter au bon endroit.
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { wrap, heading, paragraph, note, button, infoCard, infoRow, escapeHtml } from '../layout'

export interface TicketPurchaseSummary {
  eventId: string
  eventName: string
  eventWhen?: string | null
  eventWhere?: string | null
  placeLabel: string
  quantity: number
  totalLabel: string // déjà formaté (ex. "15 000 FCFA")
  ticketUrl: string // lien vers le billet/QR dans l'app
}

export function ticketPurchaseConfirmedEmail(t: TicketPurchaseSummary, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(t.eventName)
  const rows = [
    infoRow('Événement', evName),
    t.eventWhen ? infoRow('Quand', escapeHtml(t.eventWhen)) : '',
    t.eventWhere ? infoRow('Où', escapeHtml(t.eventWhere)) : '',
    infoRow('Place', escapeHtml(t.placeLabel)),
    infoRow('Quantité', String(t.quantity)),
    infoRow('Total payé', t.totalLabel),
  ].join('')
  const inner = `
    ${heading('Ton billet est prêt 🎟️', 'accent')}
    ${paragraph(`Ton paiement pour <strong style="color:#fff;">${evName}</strong> a bien été confirmé.`)}
    ${infoCard(rows)}
    ${button(t.ticketUrl, 'Voir mon billet et mon QR code')}
    ${note("Garde ce billet à portée de main le jour J — présente le QR code à l'entrée.")}
  `
  return { subject: `Ton billet pour ${t.eventName} est prêt 🎟️`, html: wrap(inner, { site, preheader: `Paiement confirmé pour ${t.eventName}.` }) }
}

export interface GroupPurchaseSummary extends Omit<TicketPurchaseSummary, 'quantity'> {
  seatCount: number
}

export function groupPurchaseConfirmedEmail(t: GroupPurchaseSummary, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(t.eventName)
  const rows = [
    infoRow('Événement', evName),
    t.eventWhen ? infoRow('Quand', escapeHtml(t.eventWhen)) : '',
    t.eventWhere ? infoRow('Où', escapeHtml(t.eventWhere)) : '',
    infoRow('Places', `${t.seatCount}`),
    infoRow('Total payé', t.totalLabel),
  ].join('')
  const inner = `
    ${heading(`Vos ${t.seatCount} billets sont prêts`, 'accent')}
    ${paragraph(`Ta réservation groupe pour <strong style="color:#fff;">${evName}</strong> est confirmée.`)}
    ${infoCard(rows)}
    ${button(t.ticketUrl, 'Voir les billets du groupe')}
    ${note("En tant qu'hôte du groupe, c'est à toi de redistribuer les billets à tes invités depuis l'app.")}
  `
  return { subject: `Vos ${t.seatCount} billets pour ${t.eventName}`, html: wrap(inner, { site, preheader: `Réservation groupe confirmée pour ${t.eventName}.` }) }
}

export function paymentFailedEmail(eventName: string, retryUrl: string, reason: string | null, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton paiement n’a pas abouti', 'danger')}
    ${paragraph(`Ton paiement pour <strong style="color:#fff;">${evName}</strong> n'a pas pu être finalisé${reason ? ` (${escapeHtml(reason)})` : ''}.`)}
    ${paragraph('Ta place n\'est pas garantie tant que le paiement n\'est pas confirmé.')}
    ${button(retryUrl, 'Réessayer le paiement', 'danger')}
  `
  return { subject: `Ton paiement pour ${eventName} n'a pas abouti`, html: wrap(inner, { site, preheader: 'Réessaie ton paiement pour garder ta place.' }) }
}

export function seatHoldExpiringEmail(eventName: string, completeUrl: string, expiresInLabel: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ta place expire bientôt')}
    ${paragraph(`Ta place bloquée pour <strong style="color:#fff;">${evName}</strong> expire dans ${escapeHtml(expiresInLabel)}.`)}
    ${button(completeUrl, 'Finaliser mon paiement')}
  `
  return { subject: `Ta place pour ${eventName} expire bientôt`, html: wrap(inner, { site, preheader: `Encore ${expiresInLabel} pour finaliser ton paiement.` }) }
}

export function seatHoldExpiredEmail(eventName: string, retryUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ta place a été libérée')}
    ${paragraph(`Le blocage de ta place pour <strong style="color:#fff;">${evName}</strong> a expiré sans paiement — elle a été remise en vente.`)}
    ${button(retryUrl, 'Retenter ma réservation', 'outline')}
  `
  return { subject: `Ta place pour ${eventName} a été libérée`, html: wrap(inner, { site, preheader: 'Le blocage de ta place a expiré.' }) }
}

export function ticketReceivedEmail(eventName: string, ticketUrl: string, fromLabel: string | null, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Tu as reçu un billet 🎟️', 'accent')}
    ${paragraph(`Un billet pour <strong style="color:#fff;">${evName}</strong> vient d'être transféré sur ton compte${fromLabel ? ` par ${escapeHtml(fromLabel)}` : ''}.`)}
    ${button(ticketUrl, 'Voir mon billet et mon QR code')}
  `
  return { subject: `Tu as reçu un billet pour ${eventName}`, html: wrap(inner, { site, preheader: 'Un nouveau billet est disponible sur ton compte.' }) }
}
