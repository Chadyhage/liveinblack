import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Email } from '../lib/server/emails'
import * as emails from '../lib/server/emails'

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
  { group: 'Compte & sécurité', label: 'Vérification email', email: emails.emailVerificationEmail(`${site}/verify-email?token=demo`) },
  { group: 'Compte & sécurité', label: 'Réinitialisation mot de passe', email: emails.passwordResetEmail(`${site}/reset-password?token=demo`) },
  { group: 'Compte & sécurité', label: 'Changement email', email: emails.emailChangeVerificationEmail(`${site}/confirmer-email?token=demo`) },
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
  { group: 'Billets & paiements', label: 'Payout initié', email: emails.payoutInitiatedEmail(event.name, '425 000 FCFA', '2 à 3 jours ouvrés') },
  { group: 'Billets & paiements', label: 'Payout confirmé', email: emails.payoutConfirmedEmail('425 000 FCFA', 'PAY-LIB-2026-0842') },
  { group: 'Billets & paiements', label: 'Payout échoué', email: emails.payoutFailedEmail('425 000 FCFA', 'Coordonnées bancaires invalides', `${site}/organizer-studio`) },

  { group: 'Remboursements & revente', label: 'Annulation remboursée', email: emails.eventCancelledRefundEmail(event.name, '30 000 FCFA', '5 à 10 jours ouvrés', 'Contraintes techniques indépendantes de l’organisateur') },
  { group: 'Remboursements & revente', label: 'Report avec remboursement', email: emails.eventPostponedTicketHolderEmail(event.name, '22 août 2026', '5 septembre 2026', `${site}/profile/billets`) },
  { group: 'Remboursements & revente', label: 'Remboursement confirmé', email: emails.refundConfirmedEmail(event.name, '30 000 FCFA', '5 à 10 jours ouvrés') },
  { group: 'Remboursements & revente', label: 'Remboursement en erreur', email: emails.refundFailedEmail(event.name, 'Le compte bancaire n’est plus actif', `${site}/contact`) },
  { group: 'Remboursements & revente', label: 'Billet transféré', email: emails.ticketInvalidatedByResaleEmail(event.name) },
  { group: 'Remboursements & revente', label: 'Revente créée', email: emails.resaleListingCreatedEmail(event.name, '15 000 FCFA', `${site}/profile/billets`) },
  { group: 'Remboursements & revente', label: 'Revente vendue', email: emails.resaleListingSoldEmail(event.name, '13 500 FCFA', '3 à 5 jours ouvrés') },
  { group: 'Remboursements & revente', label: 'Revente expirée', email: emails.resaleListingExpiredEmail(event.name) },

  { group: 'Organisateur', label: 'Événement publié', email: emails.eventPublishedEmail(event.name, `${site}/events/${event.id}`) },
  { group: 'Organisateur', label: 'Première vente', email: emails.firstSaleEmail(event.name, `${site}/my-events/${event.id}/statistiques`) },
  { group: 'Organisateur', label: 'Jalon de ventes', email: emails.salesMilestoneEmail(event.name, '100 billets vendus', `${site}/my-events/${event.id}/statistiques`) },
  { group: 'Organisateur', label: 'Récap J-2', email: emails.eventRecapBeforeEventEmail({ eventName: event.name, eventWhen: 'Samedi 22 août · 22:00', ticketsSold: 184, staffCount: 12, dashboardUrl: `${site}/my-events/${event.id}` }) },
  { group: 'Organisateur', label: 'Boost actif', email: emails.boostActivatedEmail(event.name, '7 jours', `${site}/my-events/${event.id}/statistiques`) },
  { group: 'Organisateur', label: 'Boost en conflit', email: emails.boostConflictEmail(event.name, 'Ce créneau est déjà occupé par une campagne prioritaire', `${site}/my-events/${event.id}`) },
  { group: 'Organisateur', label: 'Impact annulation', email: emails.cancellationFinancialImpactEmail(event.name, '1 240 000 FCFA', 'Le montant sera déduit du prochain versement disponible.') },
  { group: 'Organisateur', label: 'Staff ajouté', email: emails.staffAddedEmail(event.name, 'Manager accès', `${site}/scanner/${event.id}`) },
  { group: 'Organisateur', label: 'Staff retiré', email: emails.staffRemovedEmail(event.name) },
  { group: 'Organisateur', label: 'Nouvel avis', email: emails.newReviewReceivedEmail(event.name, 5, 'Une organisation impeccable et une ambiance incroyable.', `${site}/organizer-studio`) },

  { group: 'Communauté', label: 'Nouvel événement suivi', email: emails.organizerNewEventEmail(event, 'Black Moon Events') },
  { group: 'Communauté', label: 'Suivi annulé', email: emails.organizerScheduleChangeEmail(event, 'Black Moon Events', 'cancelled') },
  { group: 'Communauté', label: 'Suivi reporté', email: emails.organizerScheduleChangeEmail(event, 'Black Moon Events', 'postponed', { previousWhen: '22 août 2026', newWhen: '5 septembre 2026' }) },
  { group: 'Communauté', label: 'Message', email: emails.newMessageDigestEmail('Amina', 'Salut ! Est-ce que tu viens toujours samedi soir ?', `${site}/messages`) },
  { group: 'Communauté', label: 'Ajout groupe', email: emails.addedToGroupEmail('Moonlight Crew', 'Koffi', `${site}/messages`) },
  { group: 'Communauté', label: 'Intéressé demain', email: emails.interestedEventReminderEmail(event.name, 'Demain à 22:00', `${site}/events/${event.id}`, false) },
  { group: 'Communauté', label: 'Rappel abonnement', email: emails.subscriptionReminderEmail('j3', `${site}/offer-services`) },
]

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function localizeImages(html: string): string {
  return html.replace(/src="https:\/\/liveinblack\.com\/images\//g, 'src="public/images/')
}

const groups = [...new Set(items.map((item) => item.group))]
const nav = groups.map((group) => `<a href="#${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}" class="chip">${group}</a>`).join('')
const sections = groups.map((group) => {
  const id = group.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const cards = items.filter((item) => item.group === group).map((item) => {
    const html = escapeAttribute(localizeImages(item.email.html))
    return `<article class="item"><div class="meta"><span>Aperçu email</span><h3>${item.label}</h3><p><strong>Sujet :</strong> ${item.email.subject}</p></div><iframe title="${item.label}" srcdoc="${html}" loading="lazy"></iframe></article>`
  }).join('')
  return `<section id="${id}"><div class="section-title"><p>Collection</p><h2>${group}</h2></div>${cards}</section>`
}).join('')

const document = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Aperçu emails LIVEINBLACK</title>
  <style>
    :root{--ink:#0a0810;--lime:#b8f34a;--page:#f5f5f7;--line:#dedee3;--text:#161617;--muted:#5f6368}
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;background:var(--page);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif}
    .hero{background:#f1ffda;color:var(--text);padding:52px max(24px,calc((100vw - 1080px)/2));border-bottom:1px solid var(--line)}
    .brand{display:flex;align-items:center;gap:12px;font-size:24px;font-weight:850;letter-spacing:-.035em}.brand-mark{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:var(--lime);color:#10210a;font-size:15px}.brand em{font-style:normal;color:#4b6f00}
    .hero h1{max-width:760px;font-size:clamp(38px,6vw,70px);line-height:.98;letter-spacing:-.045em;margin:48px 0 18px}.hero p{max-width:700px;color:var(--muted);font-size:17px;line-height:1.6;margin:0}
    .nav{display:flex;gap:8px;overflow:auto;padding:18px max(20px,calc((100vw - 1080px)/2));position:sticky;top:0;z-index:2;background:rgba(245,245,247,.94);backdrop-filter:blur(20px);border-bottom:1px solid var(--line)}
    .chip{flex:0 0 auto;padding:9px 13px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--text);font-size:13px;font-weight:650;text-decoration:none}
    main{max-width:1080px;margin:0 auto;padding:52px 20px 100px}
    section{scroll-margin-top:90px;margin:0 0 74px}.section-title p{margin:0 0 6px;color:#67910f;font-size:12px;font-weight:750;letter-spacing:.07em;text-transform:uppercase}.section-title h2{font-size:34px;letter-spacing:-.03em;margin:0 0 22px}
    .item{background:#fff;border:1px solid var(--line);border-radius:24px;margin:0 0 28px;overflow:hidden;box-shadow:0 12px 34px rgba(10,8,16,.06)}
    .meta{padding:22px 24px;border-bottom:1px solid var(--line)}.meta>span{display:inline-block;padding:5px 9px;border-radius:999px;background:#efffd3;color:#395500;font-size:11px;font-weight:750;text-transform:uppercase;letter-spacing:.05em}.meta h3{font-size:22px;letter-spacing:-.02em;margin:10px 0 5px}.meta p{margin:0;color:var(--muted);font-size:14px}
    iframe{display:block;width:100%;height:850px;border:0;background:var(--page)}
    @media(max-width:680px){.hero{padding-top:28px;padding-bottom:36px}.hero h1{margin-top:34px}.nav{padding-left:14px}main{padding:36px 10px 70px}.item{border-radius:18px}.meta{padding:18px}iframe{height:900px}}
  </style>
</head>
<body>
  <header class="hero"><div class="brand"><span class="brand-mark">LB</span><span>LIVE<em>IN</em>BLACK</span></div><h1>Des emails clairs, visuels et immédiatement reconnaissables.</h1><p>Une composition éditoriale inspirée d’Apple, construite avec la palette LIVEINBLACK : blanc, noir et vert lime. ${items.length} scénarios sont réunis ici.</p></header>
  <nav class="nav" aria-label="Catégories">${nav}</nav>
  <main>${sections}</main>
</body>
</html>`

writeFileSync(resolve(process.cwd(), 'emails-preview.html'), document)
console.log(`Aperçu généré : ${items.length} emails dans ${groups.length} catégories.`)
