// Emails liés à l'authentification et au compte — vérification email, reset
// mot de passe, changement d'adresse, sécurité (nouvelle connexion, mot de
// passe modifié, suppression de compte).
import type { Email } from '../types'
import { DEFAULT_SITE } from '../theme'
import { wrap, heading, paragraph, note, button } from '../layout'

export function emailVerificationEmail(verifyLink: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Confirme ton email')}
    ${paragraph("Il ne reste qu'une étape pour activer ton compte LIVEINBLACK : confirme que cette adresse email est bien la tienne.")}
    ${button(verifyLink, 'Confirmer mon email')}
    ${note("Une fois confirmé, reviens sur le site et connecte-toi. Si tu n'es pas à l'origine de cette inscription, ignore cet email.")}
  `
  return { subject: 'Confirme ton email LIVEINBLACK', html: wrap(inner, { site, preheader: 'Confirme ton adresse pour activer ton compte.' }) }
}

export function passwordResetEmail(resetLink: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Réinitialise ton mot de passe')}
    ${paragraph('Tu as demandé à réinitialiser le mot de passe de ton compte LIVEINBLACK. Clique sur le bouton ci-dessous pour en choisir un nouveau.')}
    ${button(resetLink, 'Choisir un nouveau mot de passe')}
    ${note("Ce lien est valable un temps limité. Si tu n'es pas à l'origine de cette demande, ignore cet email — ton mot de passe reste inchangé.")}
  `
  return { subject: 'Réinitialise ton mot de passe LIVEINBLACK', html: wrap(inner, { site, preheader: 'Choisis un nouveau mot de passe.' }) }
}

// Port de la section "Adresse e-mail" du profil : changer d'email exige de
// confirmer la NOUVELLE adresse avant que le changement ne prenne effet —
// copie distincte de emailVerificationEmail (contexte "je change" et non
// "j'active mon tout nouveau compte").
export function emailChangeVerificationEmail(verifyLink: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Confirme ta nouvelle adresse')}
    ${paragraph("Tu as demandé à changer l'adresse email de ton compte LIVEINBLACK. Confirme que cette nouvelle adresse est bien la tienne pour finaliser le changement.")}
    ${button(verifyLink, 'Confirmer ma nouvelle adresse')}
    ${note("Tant que tu n'as pas confirmé, ton ancienne adresse reste active. Si tu n'es pas à l'origine de cette demande, ignore cet email.")}
  `
  return { subject: 'Confirme ta nouvelle adresse LIVEINBLACK', html: wrap(inner, { site, preheader: 'Confirme ta nouvelle adresse pour finaliser le changement.' }) }
}

// --- Nouveaux : sécurité du compte -----------------------------------------

export interface DeviceContext {
  deviceLabel?: string | null // ex. "Safari sur iPhone"
  approxLocation?: string | null // ex. "Lomé, Togo" — best-effort, jamais garanti précis
  when?: string | null
}

export function newDeviceLoginEmail(ctx: DeviceContext, secureAccountUrl: string, site: string = DEFAULT_SITE): Email {
  const details = [ctx.deviceLabel, ctx.approxLocation, ctx.when].filter(Boolean).join(' · ')
  const inner = `
    ${heading('Nouvelle connexion à ton compte')}
    ${paragraph(`Une connexion vient d'avoir lieu sur ton compte LIVEINBLACK${details ? ` (${details})` : ''}.`)}
    ${paragraph('Si c\'était bien toi, tu peux ignorer cet email.')}
    ${button(secureAccountUrl, "Ce n'était pas moi — sécuriser mon compte", 'danger')}
  `
  return {
    subject: 'Nouvelle connexion à ton compte LIVEINBLACK',
    html: wrap(inner, { site, preheader: 'Une nouvelle connexion vient d’avoir lieu sur ton compte.' }),
    inApp: { type: 'account', title: 'Nouvelle connexion à ton compte', body: details || undefined, link: secureAccountUrl, push: true },
  }
}

export function passwordChangedEmail(secureAccountUrl: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Ton mot de passe a été modifié')}
    ${paragraph('Le mot de passe de ton compte LIVEINBLACK vient d\'être changé avec succès.')}
    ${note("Si tu n'es pas à l'origine de ce changement, sécurise ton compte immédiatement.")}
    ${button(secureAccountUrl, 'Ce n’était pas moi', 'danger')}
  `
  return {
    subject: 'Ton mot de passe a été modifié',
    html: wrap(inner, { site, preheader: 'Confirmation de changement de mot de passe.' }),
    inApp: { type: 'account', title: 'Mot de passe modifié', link: secureAccountUrl, push: true },
  }
}

export function accountDeletedEmail(site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Ton compte a été supprimé')}
    ${paragraph('Ton compte LIVEINBLACK et tes données personnelles ont été supprimés conformément à ta demande.')}
    ${note('Certaines informations de facturation peuvent être conservées pour une durée limitée, conformément à nos obligations légales — voir nos mentions légales.')}
  `
  return { subject: 'Ton compte LIVEINBLACK a été supprimé', html: wrap(inner, { site, preheader: 'Confirmation de suppression de compte.' }) }
}

export function accountDeletionRequestedEmail(cancelUrl: string, delayLabel: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${heading('Ta demande de suppression est prise en compte')}
    ${paragraph(`Ta demande de suppression de compte a bien été enregistrée. Elle sera traitée sous ${delayLabel}.`)}
    ${button(cancelUrl, 'Annuler la demande', 'outline')}
  `
  return {
    subject: 'Ta demande de suppression de compte est prise en compte',
    html: wrap(inner, { site, preheader: 'Ta demande de suppression sera traitée bientôt.' }),
    inApp: { type: 'account', title: 'Demande de suppression prise en compte', body: `Traitée sous ${delayLabel}.`, link: cancelUrl },
  }
}
