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
