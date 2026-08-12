// Point d'entrée UNIQUE du système d'emails LIVEINBLACK. Tout le reste de
// l'app (routes API, lib/server/*) importe depuis ici, jamais directement
// depuis un fichier de ../templates/ ou ../layout.ts.
//
// Pour changer le DESIGN de tous les emails d'un coup : voir theme.ts (couleurs
// /polices) et layout.ts (composants). Pour ajouter/modifier un email
// précis : voir le fichier de templates/ correspondant à son domaine.
//
// Organisation :
//   theme.ts               tokens couleur/police (design system email)
//   layout.ts               composants HTML partagés (wrap/heading/button/...)
//   types.ts                 type Email = { subject, html }
//   templates/
//     auth.ts                 vérification email, reset mdp, changement email, sécurité compte
//     applications.ts          candidature organisateur/prestataire (reçue/approuvée/refusée/corrections)
//     subscriptions.ts          rappels abonnement prestataire
//     followers.ts               notifications aux abonnés d'un organisateur
//     contact.ts                  formulaire de contact public
//     tickets.ts                   achat billet, paiement échoué, seat hold, billet reçu
//     refunds.ts                    annulation/report événement, remboursement
//     resale.ts                      bourse de revente de billets
//     organizerEvents.ts              cycle de vie événement côté organisateur
//     payouts.ts                       versements organisateur/prestataire
//     staff.ts                          équipe événement (staff)
//     reviews.ts                         avis reçus
//     moderation.ts                       signalement reçu
//     agent.ts                             alertes vers l'équipe agent/plateforme
//     account.ts                           changement de rôle actif
//     messaging.ts                          digest messagerie, ajout à un groupe
//     interest.ts                            rappel événement "intéressé"
export type { Email } from './types'

export * from './templates/auth'
export * from './templates/applications'
export * from './templates/subscriptions'
export * from './templates/followers'
export * from './templates/contact'
export * from './templates/tickets'
export * from './templates/refunds'
export * from './templates/resale'
export * from './templates/organizerEvents'
export * from './templates/payouts'
export * from './templates/staff'
export * from './templates/reviews'
export * from './templates/moderation'
export * from './templates/agent'
export * from './templates/account'
export * from './templates/messaging'
export * from './templates/interest'
