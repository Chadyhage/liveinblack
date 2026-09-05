import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Email } from '../lib/server/emails/index'
import * as emails from '../lib/server/emails/index'

type PreviewItem = { group: string; label: string; email: Email }

const site = 'https://liveinblack.com'
const event = {
  id: 'event-demo',
  name: 'Moonlight Experience',
  dateDisplay: 'Samedi 22 août 2026',
  time: '22:00',
  location: 'Palais de Lomé',
  city: 'Lomé',
}

const items: PreviewItem[] = [
  { group: 'Compte & sécurité', label: 'Vérification de l’e-mail', email: emails.emailVerificationEmail(`${site}/verify-email?token=demo`) },
  { group: 'Compte & sécurité', label: 'Réinitialisation mot de passe', email: emails.passwordResetEmail(`${site}/reset-password?token=demo`) },
  { group: 'Compte & sécurité', label: 'Changement d’e-mail', email: emails.emailChangeVerificationEmail(`${site}/confirmer-email?token=demo`) },
  { group: 'Compte & sécurité', label: 'Nouvelle connexion', email: emails.newDeviceLoginEmail({ deviceLabel: 'Safari sur iPhone', approxLocation: 'Lomé, Togo', when: 'Aujourd’hui à 18:42' }, `${site}/profile/parametres`) },
  { group: 'Compte & sécurité', label: 'Mot de passe modifié', email: emails.passwordChangedEmail(`${site}/profile/parametres`) },
  { group: 'Compte & sécurité', label: 'Compte supprimé', email: emails.accountDeletedEmail() },
  { group: 'Compte & sécurité', label: 'Suppression demandée', email: emails.accountDeletionRequestedEmail(`${site}/profile/parametres`, '30 jours') },

  { group: 'Candidatures', label: 'Candidature reçue', email: emails.applicationReceivedEmail('amina@example.com', site, 'organisateur') },
  { group: 'Candidatures', label: 'Candidature approuvée', email: emails.applicationApprovedEmail('organisateur') },
  { group: 'Candidatures', label: 'Candidature refusée', email: emails.applicationRejectedEmail('prestataire', 'Le justificatif fourni est illisible.') },
  { group: 'Candidatures', label: 'Candidature à corriger', email: emails.applicationNeedsChangesEmail('organisateur', 'Ajoute une pièce d’identité valide et complète la présentation de ton activité.') },
  { group: 'Candidatures', label: 'Espace activé', email: emails.roleActivatedEmail('organisateur', `${site}/my-events`) },

  { group: 'Équipe & modération', label: 'Contact', email: emails.contactRequestEmail({ name: 'Amina Lawson', email: 'amina@example.com', subject: 'Question sur ma réservation', message: 'Bonjour, je souhaite modifier le nom associé à mon billet.' }) },
  { group: 'Équipe & modération', label: 'Nouvelle candidature agent', email: emails.newApplicationToReviewEmail('Amina Lawson', 'organisateur', `${site}/agent/dossiers`) },
  { group: 'Équipe & modération', label: 'Signalement agent', email: emails.newReportToReviewEmail('Message dans une conversation', `${site}/agent/signalements`) },
  { group: 'Équipe & modération', label: 'Suppression agent', email: emails.deletionRequestToReviewEmail('Amina Lawson', '30 jours', `${site}/agent/suppressions`) },
  { group: 'Équipe & modération', label: 'Vente cash en attente', email: emails.cashSalePendingSettlementEmail('Moonlight Experience', '75 000 FCFA', 3, `${site}/agent/paiements`) },
  { group: 'Équipe & modération', label: 'Ventes cash bloquées', email: emails.cashSalesBlockedEmail(6, `${site}/agent/paiements`) },
  { group: 'Équipe & modération', label: 'Signalement compte', email: emails.reportReceivedAgainstAccountEmail('Contenu inapproprié', `${site}/contact`) },

  { group: 'Billets & paiements', label: 'Achat billet', email: emails.ticketPurchaseConfirmedEmail({ eventId: event.id, eventName: event.name, eventWhen: 'Samedi 22 août · 22:00', eventWhere: 'Palais de Lomé', placeLabel: 'Pass Premium', quantity: 2, totalLabel: '30 000 FCFA', ticketUrl: `${site}/profile/billets` }) },
  { group: 'Billets & paiements', label: 'Achat groupe', email: emails.groupPurchaseConfirmedEmail({ eventId: event.id, eventName: event.name, eventWhen: 'Samedi 22 août · 22:00', eventWhere: 'Palais de Lomé', placeLabel: 'Table Gold', seatCount: 6, totalLabel: '120 000 FCFA', ticketUrl: `${site}/profile/billets` }) },
  { group: 'Billets & paiements', label: 'Paiement échoué', email: emails.paymentFailedEmail(event.name, `${site}/events/${event.id}`, 'La transaction a été refusée') },
  { group: 'Billets & paiements', label: 'Place bientôt expirée', email: emails.seatHoldExpiringEmail(event.name, `${site}/events/${event.id}`, '8 minutes') },
  { group: 'Billets & paiements', label: 'Place libérée', email: emails.seatHoldExpiredEmail(event.name, `${site}/events/${event.id}`) },
  { group: 'Billets & paiements', label: 'Versement initié', email: emails.payoutInitiatedEmail(event.name, '425 000 FCFA', '2 à 3 jours ouvrés') },
  { group: 'Billets & paiements', label: 'Versement confirmé', email: emails.payoutConfirmedEmail('425 000 FCFA', 'PAY-LIB-2026-0842') },
  { group: 'Billets & paiements', label: 'Échec du versement', email: emails.payoutFailedEmail('425 000 FCFA', 'Coordonnées bancaires invalides', `${site}/organizer-studio`) },

  { group: 'Remboursements & revente', label: 'Annulation remboursée', email: emails.eventCancelledRefundEmail(event.name, '30 000 FCFA', 'dans les meilleurs délais', 'Contraintes techniques indépendantes de l’organisateur') },
  { group: 'Remboursements & revente', label: 'Report avec remboursement', email: emails.eventPostponedTicketHolderEmail(event.name, '22 août 2026', '5 septembre 2026', `${site}/profile/billets`) },
  { group: 'Remboursements & revente', label: 'Remboursement confirmé', email: emails.refundConfirmedEmail(event.name, '30 000 FCFA', 'dans les meilleurs délais') },
  { group: 'Remboursements & revente', label: 'Remboursement en erreur', email: emails.refundFailedEmail(event.name, 'Le compte bancaire n’est plus actif', `${site}/contact`) },
  { group: 'Remboursements & revente', label: 'Billet transféré', email: emails.ticketInvalidatedByResaleEmail(event.name) },
  { group: 'Remboursements & revente', label: 'Revente créée', email: emails.resaleListingCreatedEmail(event.name, '15 000 FCFA', `${site}/profile/billets`) },
  { group: 'Remboursements & revente', label: 'Revente vendue', email: emails.resaleListingSoldEmail(event.name, '13 500 FCFA', 'dans les meilleurs délais') },
  { group: 'Remboursements & revente', label: 'Revente expirée', email: emails.resaleListingExpiredEmail(event.name) },

  { group: 'Organisateur', label: 'Événement publié', email: emails.eventPublishedEmail(event.name, `${site}/events/${event.id}`) },
  { group: 'Organisateur', label: 'Première vente', email: emails.firstSaleEmail(event.name, `${site}/my-events/${event.id}/statistiques`) },
  { group: 'Organisateur', label: 'Jalon de ventes', email: emails.salesMilestoneEmail(event.name, '100 billets vendus', `${site}/my-events/${event.id}/statistiques`) },
  { group: 'Organisateur', label: 'Récap J-2', email: emails.eventRecapBeforeEventEmail({ eventName: event.name, eventWhen: 'Samedi 22 août · 22:00', ticketsSold: 184, staffCount: 12, dashboardUrl: `${site}/my-events/${event.id}` }) },
  { group: 'Organisateur', label: 'Boost actif', email: emails.boostActivatedEmail(event.name, '7 jours', `${site}/my-events/${event.id}/statistiques`) },
  { group: 'Organisateur', label: 'Boost en conflit', email: emails.boostConflictEmail(event.name, 'Ce créneau est déjà occupé par une campagne prioritaire', `${site}/my-events/${event.id}`) },
  { group: 'Organisateur', label: 'Impact annulation', email: emails.cancellationFinancialImpactEmail(event.name, '1 240 000 FCFA', 'Le montant sera déduit du prochain versement disponible.') },
  { group: 'Organisateur', label: 'Membre ajouté à l’équipe', email: emails.staffAddedEmail(event.name, 'Responsable des accès', `${site}/scanner/${event.id}`) },
  { group: 'Organisateur', label: 'Membre retiré de l’équipe', email: emails.staffRemovedEmail(event.name) },
  { group: 'Organisateur', label: 'Nouvel avis', email: emails.newReviewReceivedEmail(event.name, 5, 'Une organisation impeccable et une ambiance incroyable.', `${site}/organizer-studio`) },

  { group: 'Communauté', label: 'Nouvel événement suivi', email: emails.organizerNewEventEmail(event, 'Black Moon Events') },
  { group: 'Communauté', label: 'Suivi annulé', email: emails.organizerScheduleChangeEmail(event, 'Black Moon Events', 'cancelled') },
  { group: 'Communauté', label: 'Suivi reporté', email: emails.organizerScheduleChangeEmail(event, 'Black Moon Events', 'postponed', { previousWhen: '22 août 2026', newWhen: '5 septembre 2026' }) },
  { group: 'Communauté', label: 'Message', email: emails.newMessageDigestEmail('Amina', 'Salut ! Est-ce que tu viens toujours samedi soir ?', `${site}/messages`) },
  { group: 'Communauté', label: 'Ajout groupe', email: emails.addedToGroupEmail('Moonlight Crew', 'Koffi', `${site}/messages`) },
  { group: 'Communauté', label: 'Intéressé demain', email: emails.interestedEventReminderEmail(event.name, 'Demain à 22:00', `${site}/events/${event.id}`, false) },
  { group: 'Communauté', label: 'Intéressé demain — billet déjà acheté', email: emails.interestedEventReminderEmail(event.name, 'Demain à 22:00', `${site}/events/${event.id}`, true) },

  { group: 'Prestataire & abonnement', label: 'Abonnement — J-7', email: emails.subscriptionReminderEmail('j7', `${site}/offer-services`) },
  { group: 'Prestataire & abonnement', label: 'Abonnement — J-3', email: emails.subscriptionReminderEmail('j3', `${site}/offer-services`) },
  { group: 'Prestataire & abonnement', label: 'Abonnement — J-1', email: emails.subscriptionReminderEmail('j1', `${site}/offer-services`) },
  { group: 'Prestataire & abonnement', label: 'Abonnement — aujourd’hui', email: emails.subscriptionReminderEmail('j0', `${site}/offer-services`) },
  { group: 'Prestataire & abonnement', label: 'Abonnement — période de grâce', email: emails.subscriptionReminderEmail('grace', `${site}/offer-services`) },
  { group: 'Prestataire & abonnement', label: 'Profil prestataire masqué', email: emails.subscriptionReminderEmail('hidden', `${site}/offer-services`) },
]

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function localizeImages(html: string): string {
  return html
    .replace(/src="https:\/\/liveinblack\.com\/images\//g, 'src="../../public/images/')
    .replace(/src="https:\/\/liveinblack\.com\/branding\//g, 'src="../../public/branding/')
}

const groups = [...new Set(items.map((item) => item.group))]
const nav = groups.map((group) => `<a href="#${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}" class="chip">${group}</a>`).join('')
const sections = groups.map((group) => {
  const id = group.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const cards = items.filter((item) => item.group === group).map((item) => {
    const html = escapeAttribute(localizeImages(item.email.html))
    return `<article class="item"><div class="meta"><span>Aperçu e-mail</span><h3>${item.label}</h3><p><strong>Sujet :</strong> ${item.email.subject}</p></div><iframe title="${item.label}" srcdoc="${html}" loading="lazy"></iframe></article>`
  }).join('')
  return `<section id="${id}"><div class="section-title"><p>Collection</p><h2>${group}</h2></div>${cards}</section>`
}).join('')

const document = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Catalogue des e-mails LIVE IN BLACK</title>
  <style>
    :root{--ink:#050505;--accent:#F53D8D;--page:#191218;--panel:#241a23;--panel-2:#1d141c;--line:rgba(255,255,255,.12);--text:#fff;--muted:rgba(255,255,255,.74)}
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;background:var(--page);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif}
    .hero{background:var(--panel-2);color:var(--text);padding:52px max(24px,calc((100vw - 1080px)/2));border-bottom:1px solid var(--line)}
    .brand{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:850;letter-spacing:.08em}.brand-mark{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:var(--accent);color:var(--ink);font-size:15px}.brand em{font-style:normal;color:var(--accent)}
    .hero h1{max-width:760px;font-size:clamp(38px,6vw,70px);line-height:.98;letter-spacing:-.045em;margin:48px 0 18px}.hero p{max-width:700px;color:var(--muted);font-size:17px;line-height:1.6;margin:0}
    .nav{display:flex;gap:8px;overflow:auto;padding:18px max(20px,calc((100vw - 1080px)/2));position:sticky;top:0;z-index:2;background:rgba(13,10,20,.94);backdrop-filter:blur(20px);border-bottom:1px solid var(--line)}
    .chip{flex:0 0 auto;padding:9px 13px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--text);font-size:13px;font-weight:650;text-decoration:none}
    main{max-width:1080px;margin:0 auto;padding:52px 20px 100px}
    section{scroll-margin-top:90px;margin:0 0 74px}.section-title p{margin:0 0 6px;color:var(--accent);font-size:12px;font-weight:750;letter-spacing:.07em;text-transform:uppercase}.section-title h2{font-size:34px;letter-spacing:-.03em;margin:0 0 22px}
    .item{background:var(--panel);border:1px solid var(--line);border-radius:20px;margin:0 0 28px;overflow:hidden;box-shadow:0 18px 44px rgba(0,0,0,.22)}
    .meta{padding:22px 24px;border-bottom:1px solid var(--line)}.meta>span{display:inline-block;padding:5px 9px;border-radius:999px;background:rgba(245,61,141,.14);color:var(--accent);font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.05em}.meta h3{font-size:22px;letter-spacing:-.02em;margin:10px 0 5px}.meta p{margin:0;color:var(--muted);font-size:14px}
    iframe{display:block;width:100%;height:720px;border:0;background:var(--panel-2)}
    @media(max-width:680px){.hero{padding-top:28px;padding-bottom:36px}.hero h1{margin-top:34px}.nav{padding-left:14px}main{padding:36px 10px 70px}.item{border-radius:18px}.meta{padding:18px}iframe{height:900px}}
  </style>
</head>
<body>
  <header class="hero"><div class="brand"><span class="brand-mark">LB</span><span>LIVE <em>IN</em> BLACK</span></div><h1>Chaque e-mail, revu et harmonisé.</h1><p>Fond des modales, surfaces sombres, accent primaire et véritables icônes métier : les ${items.length} scénarios envoyés par la plateforme sont listés et prévisualisés ici, un par un.</p></header>
  <nav class="nav" aria-label="Catégories">${nav}</nav>
  <main>${sections}</main>
</body>
</html>`

writeFileSync(resolve(process.cwd(), 'docs/design/emails-preview.html'), document)

let position = 0
const catalogSections = groups.map((group) => {
  const rows = items.filter((item) => item.group === group).map((item) => {
    position += 1
    return `| ${position} | ${item.label} | ${item.email.subject} |`
  }).join('\n')
  return `## ${group}\n\n| # | E-mail | Objet |\n|---:|---|---|\n${rows}`
}).join('\n\n')

const catalog = `# Catalogue des e-mails LIVE IN BLACK\n\nInventaire généré depuis les modèles réellement utilisés par la plateforme. **${items.length} scénarios** sont recensés dans **${groups.length} catégories**.\n\n${catalogSections}\n`
writeFileSync(resolve(process.cwd(), 'docs/design/EMAIL_CATALOG.md'), catalog)

console.log(`Aperçu et catalogue générés : ${items.length} e-mails dans ${groups.length} catégories.`)
