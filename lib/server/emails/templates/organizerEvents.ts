// Emails côté organisateur — cycle de vie de son propre événement (publié,
// première vente, jalon, récap J-2, boost, impact d'une annulation).
// ⚠️ Pas encore branchés — voir lib/server/organizerEvents.ts,
// lib/server/finalizeBoost.ts, lib/server/organizerEventLifecycle.ts.
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { wrap, heading, paragraph, note, button, infoCard, infoRow, escapeHtml } from '../layout'

export function eventPublishedEmail(eventName: string, publicUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton événement est en ligne 🎉', 'accent')}
    ${paragraph(`<strong style="color:#fff;">${evName}</strong> est maintenant visible sur LIVEINBLACK.`)}
    ${button(publicUrl, "Voir la page de l'événement")}
    ${note('Pense à ajouter ton équipe et tes codes promo depuis ton espace organisateur.')}
  `
  return { subject: `${eventName} est en ligne 🎉`, html: wrap(inner, { site, preheader: 'Ton événement est publié.' }) }
}

export function firstSaleEmail(eventName: string, dashboardUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Première vente ! 🎟️', 'accent')}
    ${paragraph(`Le premier billet pour <strong style="color:#fff;">${evName}</strong> vient d'être vendu.`)}
    ${button(dashboardUrl, 'Voir mes statistiques', 'outline')}
  `
  return { subject: `Première vente pour ${eventName} !`, html: wrap(inner, { site, preheader: 'Ta billetterie a commencé.' }) }
}

export function salesMilestoneEmail(eventName: string, milestoneLabel: string, dashboardUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading(milestoneLabel, 'accent')}
    ${paragraph(`<strong style="color:#fff;">${evName}</strong> vient d'atteindre ce jalon de ventes.`)}
    ${button(dashboardUrl, 'Voir mes statistiques', 'outline')}
  `
  return { subject: `${evName} — ${milestoneLabel}`, html: wrap(inner, { site, preheader: milestoneLabel }) }
}

export interface EventRecapSummary {
  eventName: string
  eventWhen: string
  ticketsSold: number
  staffCount: number
  dashboardUrl: string
}

export function eventRecapBeforeEventEmail(r: EventRecapSummary, site: string = DEFAULT_SITE): Email {
  const rows = [
    infoRow('Quand', escapeHtml(r.eventWhen)),
    infoRow('Billets vendus', String(r.ticketsSold)),
    infoRow('Staff assigné', String(r.staffCount)),
  ].join('')
  const inner = `
    ${heading(`${r.eventName} c'est dans 2 jours`)}
    ${infoCard(rows)}
    ${button(r.dashboardUrl, 'Voir le tableau de bord événement', 'outline')}
    ${note("Vérifie que ton staff a bien accès à l'app scanner avant le jour J.")}
  `
  return { subject: `${r.eventName} c'est dans 2 jours`, html: wrap(inner, { site, preheader: `${r.ticketsSold} billets vendus, staff assigné.` }) }
}

export function boostActivatedEmail(eventName: string, durationLabel: string, dashboardUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton boost est actif', 'accent')}
    ${paragraph(`Le boost de <strong style="color:#fff;">${evName}</strong> est actif pour ${durationLabel}.`)}
    ${button(dashboardUrl, 'Voir mes statistiques', 'outline')}
  `
  return { subject: `Ton boost pour ${eventName} est actif`, html: wrap(inner, { site, preheader: `Boost actif pour ${durationLabel}.` }) }
}

export function boostConflictEmail(eventName: string, reason: string, alternativeUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton boost n’a pas pu être activé', 'danger')}
    ${paragraph(`Le boost pour <strong style="color:#fff;">${evName}</strong> n'a pas pu être activé : ${escapeHtml(reason)}.`)}
    ${button(alternativeUrl, 'Choisir un autre créneau', 'danger')}
  `
  return { subject: `Ton boost pour ${eventName} n'a pas pu être activé`, html: wrap(inner, { site, preheader: reason }) }
}

export function cancellationFinancialImpactEmail(eventName: string, totalRefundedLabel: string, payoutImpactLabel: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Impact financier de l’annulation')}
    ${paragraph(`Suite à l'annulation de <strong style="color:#fff;">${evName}</strong>, un total de <strong style="color:#fff;">${totalRefundedLabel}</strong> a été remboursé aux acheteurs.`)}
    ${note(payoutImpactLabel)}
  `
  return { subject: `Impact financier de l'annulation de ${eventName}`, html: wrap(inner, { site, preheader: `${totalRefundedLabel} remboursés.` }) }
}
