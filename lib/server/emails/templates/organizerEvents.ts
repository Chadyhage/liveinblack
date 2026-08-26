// Emails côté organisateur — cycle de vie de son propre événement (publié,
// première vente, jalon, récap J-2, boost, impact d'une annulation).
// Branchés depuis lib/server/organizerEvents.ts, lib/server/finalizeBoost.ts,
// lib/server/organizerEventLifecycle.ts (via notifyUserById).
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { scopedWrap, heading, paragraph, note, button, infoCard, infoRow, escapeHtml } from '../layout'

const wrap = scopedWrap('event')

export function eventPublishedEmail(eventName: string, publicUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton événement est en ligne 🎉', 'accent')}
    ${paragraph(`<strong style="color:inherit;">${evName}</strong> est maintenant visible sur LIVE IN BLACK.`)}
    ${button(publicUrl, "Voir la page de l'événement")}
    ${note('Pense à ajouter ton équipe et tes codes promo depuis ton espace organisateur.')}
  `
  return {
    subject: `${eventName} est en ligne 🎉`,
    html: wrap(inner, { site, preheader: 'Ton événement est publié.' }),
    inApp: { type: 'organizer_activity', title: 'Ton événement est en ligne 🎉', body: eventName, link: publicUrl, push: true },
  }
}

export function firstSaleEmail(eventName: string, dashboardUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Première vente ! 🎟️', 'accent')}
    ${paragraph(`Le premier billet pour <strong style="color:inherit;">${evName}</strong> vient d'être vendu.`)}
    ${button(dashboardUrl, 'Voir mes statistiques', 'outline')}
  `
  return {
    subject: `Première vente pour ${eventName} !`,
    html: wrap(inner, { site, preheader: 'Ta billetterie a commencé.' }),
    inApp: { type: 'organizer_activity', title: 'Première vente ! 🎟️', body: eventName, link: dashboardUrl, push: true },
  }
}

export function salesMilestoneEmail(eventName: string, milestoneLabel: string, dashboardUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading(milestoneLabel, 'accent')}
    ${paragraph(`<strong style="color:inherit;">${evName}</strong> vient d'atteindre ce jalon de ventes.`)}
    ${button(dashboardUrl, 'Voir mes statistiques', 'outline')}
  `
  return {
    subject: `${evName} — ${milestoneLabel}`,
    html: wrap(inner, { site, preheader: milestoneLabel }),
    inApp: { type: 'organizer_activity', title: milestoneLabel, body: eventName, link: dashboardUrl, push: true },
  }
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
    infoRow('Membres de l’équipe', String(r.staffCount)),
  ].join('')
  const inner = `
    ${heading(`${r.eventName} c'est dans 2 jours`)}
    ${infoCard(rows)}
    ${button(r.dashboardUrl, 'Voir le tableau de bord événement', 'outline')}
    ${note("Vérifie que chaque membre de l'équipe a bien accès au scanner avant le jour J.")}
  `
  return {
    subject: `${r.eventName}, c’est dans 2 jours`,
    html: wrap(inner, { site, preheader: `${r.ticketsSold} billets vendus, équipe assignée.` }),
    inApp: { type: 'organizer_activity', title: `${r.eventName}, c’est dans 2 jours`, body: `${r.ticketsSold} billets vendus, ${r.staffCount} membre(s) dans l’équipe.`, link: r.dashboardUrl, push: true },
  }
}

export function boostActivatedEmail(eventName: string, durationLabel: string, dashboardUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton boost est actif', 'accent')}
    ${paragraph(`Le boost de <strong style="color:inherit;">${evName}</strong> est actif pour ${durationLabel}.`)}
    ${button(dashboardUrl, 'Voir mes statistiques', 'outline')}
  `
  return {
    subject: `Ton boost pour ${eventName} est actif`,
    html: wrap(inner, { site, preheader: `Boost actif pour ${durationLabel}.` }),
    inApp: { type: 'boost', title: 'Ton boost est actif', body: `${eventName} — ${durationLabel}.`, link: dashboardUrl, push: true },
  }
}

export function boostConflictEmail(eventName: string, reason: string, alternativeUrl: string, site: string = DEFAULT_SITE): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Ton boost n’a pas pu être activé', 'danger')}
    ${paragraph(`Le boost pour <strong style="color:inherit;">${evName}</strong> n'a pas pu être activé : ${escapeHtml(reason)}.`)}
    ${button(alternativeUrl, 'Choisir un autre créneau', 'danger')}
  `
  return {
    subject: `Ton boost pour ${eventName} n’a pas pu être activé`,
    html: wrap(inner, { site, preheader: reason }),
    inApp: { type: 'boost', title: 'Boost non activé', body: `${eventName} — ${reason}`, link: alternativeUrl, push: true },
  }
}

export function cancellationFinancialImpactEmail(eventName: string, totalRefundedLabel: string, payoutImpactLabel: string, site: string = DEFAULT_SITE, dashboardUrl?: string): Email {
  const evName = escapeHtml(eventName)
  const inner = `
    ${heading('Impact financier de l’annulation')}
    ${paragraph(`Suite à l'annulation de <strong style="color:inherit;">${evName}</strong>, un total de <strong style="color:inherit;">${totalRefundedLabel}</strong> a été remboursé aux acheteurs.`)}
    ${note(payoutImpactLabel)}
  `
  return {
    subject: `Impact financier de l’annulation de ${eventName}`,
    html: wrap(inner, { site, preheader: `${totalRefundedLabel} remboursés.` }),
    inApp: { type: 'refund', title: "Impact financier de l'annulation", body: `${eventName} — ${totalRefundedLabel} remboursés.`, link: dashboardUrl ?? `${site}/my-events`, push: true },
  }
}
