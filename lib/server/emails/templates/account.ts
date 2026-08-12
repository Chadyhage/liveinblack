// Emails transverses liés au compte multi-rôles.
// ⚠️ Pas encore branché — voir app/api/account/active-role/route.ts (à créer,
// cf. plan "Dashboard unifié par rôle").
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { wrap, heading, paragraph, button, escapeHtml } from '../layout'

export function roleActivatedEmail(roleLabel: string, dashboardUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading(`Ton espace ${roleLabel} est prêt`, 'accent')}
    ${paragraph(`Tu as maintenant accès à ton espace <strong style="color:#fff;">${escapeHtml(roleLabel)}</strong> sur LIVEINBLACK.`)}
    ${button(dashboardUrl, `Accéder à mon espace ${roleLabel}`)}
  `
  return {
    subject: `Ton espace ${roleLabel} est prêt`,
    html: wrap(inner, { site, preheader: `Accès activé à ton espace ${roleLabel}.` }),
    inApp: { type: 'account', title: `Ton espace ${roleLabel} est prêt`, link: dashboardUrl },
  }
}
