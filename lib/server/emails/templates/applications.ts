// Emails du cycle de candidature organisateur/prestataire — inchangés dans
// leur contenu par rapport à l'ancien lib/server/email-templates.ts, juste
// reskinnés avec le système de composants ../layout.ts.
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { scopedWrap, heading, paragraph, note, button } from '../layout'

const wrap = scopedWrap('application')

export type ApplicationType = 'organisateur' | 'prestataire'

const TYPE_LABEL: Record<ApplicationType, string> = { organisateur: 'organisateur', prestataire: 'prestataire' }

export function applicationReceivedEmail(email: string, site: string = DEFAULT_SITE, type: ApplicationType = 'organisateur'): Email {
  const inner = `
    ${heading('Dossier reçu')}
    ${paragraph(`Ton dossier de candidature ${TYPE_LABEL[type]} a bien été transmis à l'équipe LIVE IN BLACK. Tu recevras la réponse à l'adresse <strong style="color:inherit;">${email}</strong>.`)}
    ${note('La validation prend généralement moins de 24 h.')}
  `
  return {
    subject: 'Ton dossier LIVE IN BLACK a bien été reçu',
    html: wrap(inner, { site, preheader: 'Ton dossier est en cours de traitement.' }),
    inApp: { type: 'application_status', title: 'Dossier reçu', body: `Ton dossier ${TYPE_LABEL[type]} est en cours de traitement.`, link: '/my-application', push: true },
  }
}

export function applicationApprovedEmail(type: ApplicationType, site: string = DEFAULT_SITE): Email {
  const destination = type === 'organisateur' ? `${site}/my-events` : `${site}/offer-services`
  const inner = `
    ${heading('Dossier approuvé', 'accent')}
    ${paragraph(`Bonne nouvelle : ton dossier de candidature ${TYPE_LABEL[type]} a été approuvé par l'équipe LIVE IN BLACK.`)}
    ${button(destination, type === 'organisateur' ? 'Aller à mes événements' : 'Aller à mon espace prestataire')}
  `
  return { subject: 'Ton dossier LIVE IN BLACK a été approuvé', html: wrap(inner, { site, preheader: 'Ton dossier a été approuvé — bienvenue !' }) }
}

export function applicationRejectedEmail(type: ApplicationType, reason: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Dossier refusé', 'danger')}
    ${paragraph(`Ton dossier de candidature ${TYPE_LABEL[type]} n'a pas été approuvé par l'équipe LIVE IN BLACK.`)}
    ${reason ? paragraph(`<strong style="color:inherit;">Motif :</strong> ${reason}`) : ''}
  `
  return { subject: 'Ton dossier LIVE IN BLACK n’a pas été approuvé', html: wrap(inner, { site, preheader: 'Réponse à ta candidature.' }) }
}

export function applicationNeedsChangesEmail(type: ApplicationType, requestedChanges: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Corrections demandées')}
    ${paragraph(`L'équipe LIVE IN BLACK a examiné ton dossier de candidature ${TYPE_LABEL[type]} et te demande de le compléter avant de pouvoir l'approuver.`)}
    ${paragraph(`<strong style="color:inherit;">À corriger :</strong> ${requestedChanges}`)}
    ${button(`${site}/my-application`, 'Corriger mon dossier')}
  `
  return { subject: 'Corrections demandées sur ton dossier LIVE IN BLACK', html: wrap(inner, { site, preheader: 'Ton dossier nécessite quelques corrections.' }) }
}
