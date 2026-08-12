// Emails destinés aux agents (équipe plateforme LIVEINBLACK) — alertes de
// modération/back-office, envoyées via notifyAllAgents()/notifyUserById()
// (voir lib/server/emails/notify.ts) en plus de la notif in-app.
// Branchés depuis lib/server/applications.ts (soumission de candidature),
// lib/server/messaging.ts (signalement), lib/server/agentDeletion.ts
// (demande de suppression), lib/server/agentSales.ts (ventes cash en retard
// / bloquées).
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { wrap, heading, paragraph, note, button, escapeHtml } from '../layout'

export function newApplicationToReviewEmail(candidateName: string, type: 'organisateur' | 'prestataire', backofficeUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Nouvelle candidature à examiner')}
    ${paragraph(`<strong style="color:#fff;">${escapeHtml(candidateName)}</strong> a soumis un dossier de candidature ${type}.`)}
    ${button(backofficeUrl, 'Examiner le dossier', 'outline')}
  `
  return {
    subject: 'Nouvelle candidature à examiner',
    html: wrap(inner, { site, preheader: `${candidateName} — candidature ${type}` }),
    inApp: { type: 'agent_queue', title: 'Nouvelle candidature à examiner', body: `${candidateName} — ${type}`, link: backofficeUrl, push: true },
  }
}

export function newReportToReviewEmail(contentTypeLabel: string, backofficeUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Nouveau signalement à modérer')}
    ${paragraph(`Un signalement a été déposé concernant : <strong style="color:#fff;">${escapeHtml(contentTypeLabel)}</strong>.`)}
    ${button(backofficeUrl, 'Voir le signalement', 'outline')}
  `
  return {
    subject: 'Nouveau signalement à modérer',
    html: wrap(inner, { site, preheader: contentTypeLabel }),
    inApp: { type: 'agent_queue', title: 'Nouveau signalement à modérer', body: contentTypeLabel, link: backofficeUrl, push: true },
  }
}

export function deletionRequestToReviewEmail(userLabel: string, legalDelayLabel: string, backofficeUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Demande de suppression à traiter')}
    ${paragraph(`<strong style="color:#fff;">${escapeHtml(userLabel)}</strong> a demandé la suppression de son compte.`)}
    ${note(`Délai légal de traitement : ${legalDelayLabel}.`)}
    ${button(backofficeUrl, 'Traiter la demande', 'outline')}
  `
  return {
    subject: 'Demande de suppression à traiter',
    html: wrap(inner, { site, preheader: userLabel }),
    inApp: { type: 'agent_queue', title: 'Demande de suppression à traiter', body: userLabel, link: backofficeUrl, push: true },
  }
}

export function cashSalePendingSettlementEmail(eventName: string, amountLabel: string, daysOverdue: number, backofficeUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Règlement en attente')}
    ${paragraph(`Une vente cash de <strong style="color:#fff;">${amountLabel}</strong> pour <strong style="color:#fff;">${escapeHtml(eventName)}</strong> est en attente de règlement depuis ${daysOverdue} jour(s).`)}
    ${button(backofficeUrl, 'Voir le règlement', 'outline')}
  `
  return {
    subject: `Règlement en attente pour ${eventName}`,
    html: wrap(inner, { site, preheader: `${amountLabel} en attente.` }),
    inApp: { type: 'agent_queue', title: 'Règlement en attente', body: `${eventName} — ${amountLabel}, ${daysOverdue}j`, link: backofficeUrl, push: true },
  }
}

export function cashSalesBlockedEmail(pendingCount: number, backofficeUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Tes ventes cash sont bloquées', 'danger')}
    ${paragraph(`Tu as ${pendingCount} ventes cash non réglées — le seuil de blocage (5) est atteint. Tes nouvelles ventes cash sont suspendues jusqu'à régularisation.`)}
    ${button(backofficeUrl, 'Régulariser mes ventes', 'danger')}
  `
  return {
    subject: 'Tes ventes cash sont bloquées',
    html: wrap(inner, { site, preheader: `${pendingCount} ventes non réglées.` }),
    inApp: { type: 'agent_queue', title: 'Tes ventes cash sont bloquées', body: `${pendingCount} ventes non réglées.`, link: backofficeUrl, push: true },
  }
}
