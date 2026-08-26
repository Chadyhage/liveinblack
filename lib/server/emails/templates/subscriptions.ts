// Rappels d'abonnement prestataire (renouvellement manuel FedaPay, rail XOF).
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { scopedWrap, heading, paragraph, button } from '../layout'

const wrap = scopedWrap('provider')

const SUB_REMINDER_COPY: Record<string, { title: string; body: string }> = {
  j7: { title: 'Ton abonnement expire dans 7 jours', body: 'Renouvelle-le pour garder ton profil visible sur LIVE IN BLACK.' },
  j3: { title: 'Plus que 3 jours', body: 'Ton abonnement prestataire expire dans 3 jours. Pense à le renouveler.' },
  j1: { title: 'Ton abonnement expire demain', body: 'Renouvelle-le pour garder ton profil visible.' },
  j0: { title: 'Ton abonnement expire aujourd’hui', body: 'Renouvelle-le pour éviter que ton profil soit masqué.' },
  grace: { title: 'Abonnement expiré — période de grâce', body: 'Ton profil sera masqué bientôt si tu ne renouvelles pas.' },
  hidden: { title: 'Ton profil n’est plus visible', body: 'Renouvelle ton abonnement pour remettre ton profil en ligne.' },
}

export function subscriptionReminderEmail(reminderKey: string, renewUrl: string, site: string = DEFAULT_SITE): Email {
  const copy = SUB_REMINDER_COPY[reminderKey] || SUB_REMINDER_COPY.j7
  const inner = `
    ${heading(copy.title)}
    ${paragraph(copy.body)}
    ${button(renewUrl, 'Renouveler mon abonnement')}
  `
  return { subject: `${copy.title} — LIVE IN BLACK`, html: wrap(inner, { site, preheader: copy.body }) }
}
