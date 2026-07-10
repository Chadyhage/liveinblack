// Templates d'emails transactionnels LIVEINBLACK — fonctions PURES (aucune
// dépendance Firebase/réseau) pour rester testables isolément.
// Importé par api/send-email.js.

const DEFAULT_SITE = 'https://liveinblack.com'

function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Nom d'affichage depuis le formData (même logique que l'onboarding)
export function displayName(app) {
  const f = app.formData || {}
  if (f.prestataireType === 'artiste' && f.nomScene) return f.nomScene
  if (f.nomCommercial) return f.nomCommercial
  return [f.prenom, f.nom].filter(Boolean).join(' ') || app.name || 'toi'
}

function wrap(innerHtml, site) {
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

function btn(href, label, color = '#c8a96e') {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;"><tr><td style="border-radius:6px;background:rgba(200,169,110,0.14);border:1px solid ${color};">
    <a href="${href}" style="display:inline-block;padding:12px 28px;font-family:monospace;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:${color};text-decoration:none;">${label}</a>
  </td></tr></table>`
}
function h(title, color = '#ffffff') {
  return `<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;color:${color};margin:0 0 16px;line-height:1.2;">${title}</h1>`
}
function p(text) {
  return `<p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;color:rgba(255,255,255,0.62);line-height:1.7;margin:0 0 14px;">${text}</p>`
}
function quote(text) {
  return `<div style="background:rgba(245,158,11,0.06);border-left:3px solid #f59e0b;border-radius:4px;padding:12px 16px;margin:0 0 18px;">
    <p style="font-family:monospace;font-size:13px;color:rgba(255,255,255,0.82);line-height:1.6;margin:0;white-space:pre-wrap;">${escapeHtml(text)}</p>
  </div>`
}

// Email de réinitialisation de mot de passe (indépendant d'un dossier candidat).
// `resetLink` = lien généré par l'Admin SDK (getAuth().generatePasswordResetLink).
export function passwordResetEmail(resetLink, site = DEFAULT_SITE) {
  const inner = `
    ${h('Réinitialise ton mot de passe')}
    ${p('Tu as demandé à réinitialiser le mot de passe de ton compte LIVEINBLACK. Clique sur le bouton ci-dessous pour en choisir un nouveau.')}
    ${btn(resetLink, 'Choisir un nouveau mot de passe')}
    ${p('<span style="color:rgba(255,255,255,0.4);font-size:12px;">Ce lien est valable un temps limité. Si tu n\'es pas à l\'origine de cette demande, ignore cet email — ton mot de passe reste inchangé.</span>')}
  `
  return { subject: 'Réinitialise ton mot de passe LIVEINBLACK', html: wrap(inner, site) }
}

// Construit { subject, html } selon le type, ou null si type inconnu.
export function buildEmail(type, app, site = DEFAULT_SITE) {
  const name = escapeHtml(displayName(app))
  const isOrga = app.type === 'organisateur'
  const space = isOrga ? 'organisateur' : 'prestataire'

  switch (type) {
    case 'application_received':
      return {
        subject: 'Ta demande LIVEINBLACK est bien reçue',
        html: wrap(
          h('Demande bien reçue') +
          p(`Bonjour ${name},`) +
          p(`Ton dossier ${space} a bien été transmis à l'équipe LIVEINBLACK. Nous l'examinons généralement sous <strong style="color:#c8a96e;">48h</strong>.`) +
          p(`Tu recevras un email dès qu'une décision est prise. Aucune action de ta part n'est nécessaire pour l'instant.`),
          site
        ),
      }
    case 'application_approved':
      return {
        subject: 'Ton dossier LIVEINBLACK est validé',
        html: wrap(
          h('Bienvenue à bord', '#4ee8c8') +
          p(`Bonjour ${name},`) +
          p(`Bonne nouvelle : ton dossier ${space} a été <strong style="color:#4ee8c8;">validé</strong>. Ton espace est désormais actif.`) +
          p(isOrga
            ? `Tu peux maintenant créer tes événements, vendre des billets et suivre tes ventes.`
            : `Ton profil est désormais visible dans l'annuaire : les organisateurs peuvent te trouver et te contacter directement.`) +
          btn(`${site}/connexion`, 'Accéder à mon espace', '#4ee8c8'),
          site
        ),
      }
    case 'application_needs_changes':
      return {
        subject: 'Ton dossier LIVEINBLACK demande une correction',
        html: wrap(
          h('Une correction est nécessaire', '#f59e0b') +
          p(`Bonjour ${name},`) +
          p(`Avant de valider ton dossier ${space}, l'équipe a besoin que tu apportes une modification :`) +
          (app.requestedChanges ? quote(app.requestedChanges) : '') +
          p(`Ouvre ton dossier, apporte la correction demandée et renvoie-le — c'est rapide.`) +
          btn(`${site}/mon-dossier`, 'Corriger mon dossier', '#f59e0b'),
          site
        ),
      }
    case 'application_rejected':
      return {
        subject: 'Suite à ta demande LIVEINBLACK',
        html: wrap(
          h('Dossier non retenu') +
          p(`Bonjour ${name},`) +
          p(`Après examen, ton dossier ${space} n'a pas pu être retenu pour le moment.`) +
          (app.rejectionReason ? quote(app.rejectionReason) : '') +
          p(`Si tu penses qu'il s'agit d'une erreur ou que ta situation a changé, réponds à cet email — on regardera avec toi.`),
          site
        ),
      }
    default:
      return null
  }
}
