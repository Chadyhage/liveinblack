// Emails transverses liés au compte multi-rôles.
// Branché depuis app/api/account/active-role/route.ts.
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { scopedWrap, heading, paragraph, button, escapeHtml } from '../layout'

const wrap = scopedWrap('account')

export function roleActivatedEmail(roleLabel: string, dashboardUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading(`Ton espace ${roleLabel} est prêt`, 'accent')}
    ${paragraph(`Tu as maintenant accès à ton espace <strong style="color:inherit;">${escapeHtml(roleLabel)}</strong> sur LIVE IN BLACK.`)}
    ${button(dashboardUrl, `Accéder à mon espace ${roleLabel}`)}
  `
  return {
    subject: `Ton espace ${roleLabel} est prêt`,
    html: wrap(inner, { site, preheader: `Accès activé à ton espace ${roleLabel}.` }),
    inApp: { type: 'account', title: `Ton espace ${roleLabel} est prêt`, link: dashboardUrl, push: true },
  }
}
