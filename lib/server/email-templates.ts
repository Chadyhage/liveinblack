// Port TypeScript de lib/email-templates.js — fonctions PURES (aucune
// dépendance réseau), portées à l'identique. Seuls les deux templates utilisés
// par l'auth (vérification email, reset mot de passe) sont portés pour
// l'instant ; les templates liés aux candidatures/événements (newEventEmail,
// eventCancelledEmail, buildEmail...) seront portés avec les phases qui les
// utilisent (candidatures organisateur/prestataire, annulation d'événement).
const DEFAULT_SITE = 'https://liveinblack.com'

function wrap(innerHtml: string, site: string): string {
  return `<!doctype html><html><body style="margin:0;background:#04040b;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
        <tr><td style="padding:0 8px 24px;text-align:center;">
          <span style="font-family:Georgia,serif;font-size:22px;letter-spacing:0.18em;color:#ffffff;">L|VE IN <span style="font-style:italic;color:#c8a96e;">BLACK</span></span>
        </td></tr>
        <tr><td style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.10);border-radius:14px;padding:32px 28px;">
          ${innerHtml}
        </td></tr>
        <tr><td style="padding:20px 8px 0;text-align:center;">
          <p style="font-family:monospace;font-size:10px;color:rgba(255,255,255,0.30);letter-spacing:0.08em;line-height:1.7;margin:0;">
            LIVEINBLACK — Marketplace événementielle<br/>
            Cet email t'a été envoyé suite à ta demande sur <a href="${site}" style="color:rgba(78,232,200,0.6);text-decoration:none;">liveinblack.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`
}

function btn(href: string, label: string, color = '#c8a96e'): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;"><tr><td style="border-radius:6px;background:rgba(200,169,110,0.14);border:1px solid ${color};">
    <a href="${href}" style="display:inline-block;padding:12px 28px;font-family:monospace;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:${color};text-decoration:none;">${label}</a>
  </td></tr></table>`
}
function h(title: string, color = '#ffffff'): string {
  return `<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;color:${color};margin:0 0 16px;line-height:1.2;">${title}</h1>`
}
function p(text: string): string {
  return `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,0.62);line-height:1.7;margin:0 0 14px;">${text}</p>`
}

export type Email = { subject: string; html: string }

export function passwordResetEmail(resetLink: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${h('Réinitialise ton mot de passe')}
    ${p("Tu as demandé à réinitialiser le mot de passe de ton compte LIVEINBLACK. Clique sur le bouton ci-dessous pour en choisir un nouveau.")}
    ${btn(resetLink, 'Choisir un nouveau mot de passe')}
    ${p('<span style="color:rgba(255,255,255,0.4);font-size:12px;">Ce lien est valable un temps limité. Si tu n\'es pas à l\'origine de cette demande, ignore cet email — ton mot de passe reste inchangé.</span>')}
  `
  return { subject: 'Réinitialise ton mot de passe LIVEINBLACK', html: wrap(inner, site) }
}

export function emailVerificationEmail(verifyLink: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${h('Confirme ton email')}
    ${p("Il ne reste qu'une étape pour activer ton compte LIVEINBLACK : confirme que cette adresse email est bien la tienne.")}
    ${btn(verifyLink, 'Confirmer mon email')}
    ${p('<span style="color:rgba(255,255,255,0.4);font-size:12px;">Une fois confirmé, reviens sur le site et connecte-toi. Si tu n\'es pas à l\'origine de cette inscription, ignore cet email.</span>')}
  `
  return { subject: 'Confirme ton email LIVEINBLACK', html: wrap(inner, site) }
}

// Port de la section "Adresse e-mail" de ProfilePage.jsx (#6 phase profil) :
// changer d'email exige de confirmer la NOUVELLE adresse avant que le
// changement ne prenne effet (verifyBeforeUpdateEmail côté legacy) — email
// distinct de emailVerificationEmail ci-dessus (copie différente, contexte
// "je change mon email" et non "j'active mon tout nouveau compte").
export function emailChangeVerificationEmail(verifyLink: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${h('Confirme ta nouvelle adresse')}
    ${p("Tu as demandé à changer l'adresse email de ton compte LIVEINBLACK. Confirme que cette nouvelle adresse est bien la tienne pour finaliser le changement.")}
    ${btn(verifyLink, 'Confirmer ma nouvelle adresse')}
    ${p('<span style="color:rgba(255,255,255,0.4);font-size:12px;">Tant que tu n\'as pas confirmé, ton ancienne adresse reste active. Si tu n\'es pas à l\'origine de cette demande, ignore cet email.</span>')}
  `
  return { subject: 'Confirme ta nouvelle adresse LIVEINBLACK', html: wrap(inner, site) }
}

const APPLICATION_TYPE_LABEL: Record<'organisateur' | 'prestataire', string> = { organisateur: 'organisateur', prestataire: 'prestataire' }

// Port de la notification "candidature reçue" (#7 phase organisateur) —
// envoyée juste après soumission, avant même la déconnexion en mode anonyme
// (voir lib/server/applications.ts). `type` par défaut 'organisateur' pour
// compat des appels existants ; les deux call sites (organisateur et
// prestataire) passent désormais explicitement le leur.
export function applicationReceivedEmail(email: string, site: string = DEFAULT_SITE, type: 'organisateur' | 'prestataire' = 'organisateur'): Email {
  const inner = `
    ${h('Dossier reçu')}
    ${p(`Ton dossier de candidature ${APPLICATION_TYPE_LABEL[type]} a bien été transmis à l'équipe LIVEINBLACK. Tu seras contacté à <strong style="color:#fff;">${email}</strong> une fois ton compte validé.`)}
    ${p('<span style="color:rgba(255,255,255,0.4);font-size:12px;">La validation prend généralement moins de 24 h.</span>')}
  `
  return { subject: 'Ton dossier LIVEINBLACK a bien été reçu', html: wrap(inner, site) }
}

// Port des 3 notifications de décision agent (#9 phase agent/admin) —
// envoyées par moderateApplication (lib/server/applications.ts) à
// approve/reject/request_changes. `type` détermine le libellé et, pour
// l'approbation, le lien de destination (espace organisateur vs prestataire).
export function applicationApprovedEmail(type: 'organisateur' | 'prestataire', site: string = DEFAULT_SITE): Email {
  const destination = type === 'organisateur' ? `${site}/my-events` : `${site}/offer-services`
  const inner = `
    ${h('Dossier approuvé')}
    ${p(`Bonne nouvelle : ton dossier de candidature ${APPLICATION_TYPE_LABEL[type]} a été approuvé par l'équipe LIVEINBLACK.`)}
    ${btn(destination, type === 'organisateur' ? 'Aller à mes événements' : 'Aller à mon espace prestataire', '#4ee8c8')}
  `
  return { subject: 'Ton dossier LIVEINBLACK a été approuvé', html: wrap(inner, site) }
}

export function applicationRejectedEmail(type: 'organisateur' | 'prestataire', reason: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${h('Dossier refusé', '#e05aaa')}
    ${p(`Ton dossier de candidature ${APPLICATION_TYPE_LABEL[type]} n'a pas été approuvé par l'équipe LIVEINBLACK.`)}
    ${reason ? p(`<strong style="color:#fff;">Motif :</strong> ${reason}`) : ''}
  `
  return { subject: 'Ton dossier LIVEINBLACK n’a pas été approuvé', html: wrap(inner, site) }
}

export function applicationNeedsChangesEmail(type: 'organisateur' | 'prestataire', requestedChanges: string, site: string = DEFAULT_SITE): Email {
  const inner = `
    ${h('Corrections demandées')}
    ${p(`L'équipe LIVEINBLACK a examiné ton dossier de candidature ${APPLICATION_TYPE_LABEL[type]} et te demande de le compléter avant de pouvoir l'approuver.`)}
    ${p(`<strong style="color:#fff;">À corriger :</strong> ${requestedChanges}`)}
    ${btn(`${site}/my-application`, 'Corriger mon dossier')}
  `
  return { subject: 'Corrections demandées sur ton dossier LIVEINBLACK', html: wrap(inner, site) }
}

// Port de la partie email de api/cron-subscriptions.js (REMINDER + sendSubEmail)
// — rappels d'abonnement prestataire XOF (renouvellement manuel FedaPay).
// Seuls 4 des 6 jalons sont envoyés par email (EMAIL_MILESTONES côté legacy) ;
// voir lib/server/providerSubscriptions.ts pour le filtrage.
const SUB_REMINDER_COPY: Record<string, { title: string; body: string }> = {
  j7: { title: 'Ton abonnement expire dans 7 jours', body: 'Renouvelle-le pour garder ton profil visible sur LIVEINBLACK.' },
  j3: { title: 'Plus que 3 jours', body: 'Ton abonnement prestataire expire dans 3 jours. Pense à le renouveler.' },
  j1: { title: 'Ton abonnement expire demain', body: 'Renouvelle-le pour garder ton profil visible.' },
  j0: { title: "Ton abonnement expire aujourd'hui", body: 'Renouvelle-le pour éviter que ton profil soit masqué.' },
  grace: { title: 'Abonnement expiré — période de grâce', body: 'Ton profil sera masqué bientôt si tu ne renouvelles pas.' },
  hidden: { title: "Ton profil n'est plus visible", body: 'Renouvelle ton abonnement pour remettre ton profil en ligne.' },
}

export function subscriptionReminderEmail(reminderKey: string, renewUrl: string, site: string = DEFAULT_SITE): Email {
  const copy = SUB_REMINDER_COPY[reminderKey] || SUB_REMINDER_COPY.j7
  const inner = `
    ${h(copy.title)}
    ${p(copy.body)}
    ${btn(renewUrl, 'Renouveler mon abonnement', '#e05aaa')}
  `
  return { subject: `${copy.title} — LIVEINBLACK`, html: wrap(inner, site) }
}
