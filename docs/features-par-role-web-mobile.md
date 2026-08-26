# LIVE IN BLACK - Liste des features par role

**Perimetre : plateforme web `LIB_Web` et application mobile `LIB_Mobile`**  
**Date de l'inventaire : 26 aout 2026**  
**Source : routes, menus, ecrans et services presents dans les deux repositories**

Ce document liste les fonctionnalites existantes par role utilisateur. Il est volontairement redige en langage produit, pour etre lisible par un client, un chef de projet ou une personne non technique.

## Roles couverts

LIVE IN BLACK fonctionne autour de plusieurs profils :

- **Visiteur** : personne non connectee qui decouvre la plateforme.
- **Client / utilisateur connecte** : personne qui reserve, achete, sauvegarde, discute et gere ses billets.
- **Candidat organisateur** : personne qui demande l'acces au role organisateur.
- **Candidat prestataire** : personne qui demande l'acces au role prestataire.
- **Organisateur** : personne ou structure qui cree et gere des evenements.
- **Prestataire** : professionnel qui propose des services aux organisateurs.
- **Staff evenement** : membre d'equipe ajoute a un evenement, par exemple scan, vente, service ou gestion.
- **Agent / administrateur LIVE IN BLACK** : equipe interne qui pilote, modere et controle la plateforme.

## Vue d'ensemble par plateforme

### Web

Le web couvre l'ensemble du produit : site public, compte utilisateur, billetterie, messagerie, tableaux de bord, espaces organisateur/prestataire, staff evenement, back-office agent, SEO, blog, emails et administration.

### Mobile

Le mobile couvre les parcours essentiels en mobilite : decouverte, recherche, billets, messages, profil, espaces role, creation/gestion d'evenements, prestataire, agent, scan, playlist, commandes sur place et gestion des tickets.

Le mobile reprend une grande partie des fonctions web, avec une approche plus compacte et orientee usage terrain.

## 1. Visiteur non connecte

### Web

- Acces a la page d'accueil publique.
- Consultation de la liste des evenements.
- Consultation du detail d'un evenement.
- Consultation des places disponibles, prix, ville, date, line-up, description, lieu et carte.
- Consultation des menus ou precommandes disponibles sur un evenement.
- Consultation des organisateurs publics.
- Consultation du detail d'un organisateur.
- Consultation des prestataires publics.
- Consultation du detail d'un prestataire.
- Recherche globale dans les evenements, organisateurs et prestataires.
- Recherche rapide directement depuis le header.
- Consultation du blog.
- Lecture des articles de blog.
- Filtrage du blog par categorie.
- Consultation des pages legales : conditions, confidentialite, cookies, mentions legales.
- Consultation de la page a propos.
- Contact via formulaire.
- Connexion.
- Inscription en tant que client.
- Redirection vers les parcours de candidature organisateur et prestataire.
- Verification d'email.
- Reinitialisation de mot de passe.
- Gestion du consentement cookies.
- Partage enrichi des pages via metadonnees SEO et Open Graph.
- Pages publiques indexables pour Google : evenements, organisateurs, prestataires, blog.
- Sitemap dynamique et flux RSS blog.

### Mobile

- Acces a l'accueil mobile.
- Decouverte des evenements par rails : Top 3, ce soir, pour toi, a la une, categories.
- Filtrage par categorie et region.
- Recherche globale depuis l'onglet Explorer.
- Recherche par evenement, ville, style, organisateur ou prestataire.
- Consultation des fiches evenement.
- Consultation des fiches organisateur.
- Consultation des fiches prestataire.
- Acces a l'annuaire prestataires.
- Acces a l'annuaire organisateurs.
- Connexion.
- Inscription client.
- Reinitialisation de mot de passe.
- Verification d'email.
- Acces aux pages legales.
- Ecrans d'etat pour inviter a se connecter lorsqu'une action exige un compte.

## 2. Client / utilisateur connecte

### Web - Compte et profil

- Tableau de bord personnel.
- Gestion de la photo de profil.
- Gestion du nom et prenom.
- Gestion du telephone.
- Gestion de l'annee de naissance et du genre.
- Gestion des preferences musicales, artistes, villes, types d'evenements, budget, ambiances et frequence de sortie.
- Recommandations personnalisees basees sur les preferences.
- Reglages de visibilite et confidentialite.
- Statut en ligne visible ou masque.
- Photo de profil visible ou masquee.
- Confirmations de lecture activees ou non.
- Recommandations personnalisees activees ou non.
- Export de ses donnees personnelles.
- Demande de changement d'adresse e-mail.
- Confirmation de nouvelle adresse e-mail.
- Annulation d'une demande de changement d'e-mail.
- Changement de mot de passe.
- Demande de reinitialisation de mot de passe.
- Suppression de compte ou demande de suppression avec revue agent selon le statut du compte.
- Deconnexion.
- Aide et FAQ.

### Web - Decouverte et favoris

- Sauvegarde d'evenements interessants.
- Consultation des evenements sauvegardes.
- Separation des evenements sauvegardes a venir et passes.
- Suivi d'organisateurs.
- Consultation des organisateurs suivis.
- Reglage des alertes par organisateur suivi.
- Suggestions d'organisateurs a suivre.
- Acces aux evenements recommandes.

### Web - Billets, achat et apres-achat

- Achat de billets.
- Achat de billets gratuits.
- Paiement via Stripe ou FedaPay selon le contexte.
- Utilisation de codes promo.
- Achat de places simples ou de tables.
- Reservation temporaire de places avec acompte.
- Paiement du solde d'une place bloquee.
- Consultation du wallet de billets.
- Classement des billets a venir, passes ou annules.
- Affichage du QR code billet.
- Acces a une page billet publique securisee par token.
- Export ou partage visuel du billet.
- Invitation d'une autre personne sur une place.
- Annulation d'une invitation envoyee.
- Reprise d'une place invitee.
- Acceptation ou refus d'une invitation recue.
- Sortie d'une place partagee.
- Revente d'un billet.
- Retrait d'un billet du marche de revente.
- Achat d'un billet en revente.
- Demande de remboursement.
- Demande de remboursement via lien de billet.
- Acces a la playlist d'un evenement depuis le billet.
- Commande sur place depuis un billet.

### Web - Social et messagerie

- Acces a la messagerie.
- Conversations directes.
- Conversations de groupe.
- Creation de groupes.
- Ajout et retrait de membres dans un groupe.
- Roles de groupe : admin ou membre.
- Renommage de groupe.
- Avatar de groupe.
- Quitter un groupe.
- Supprimer un groupe lorsque permis.
- Messages texte.
- Messages media selon les capacites exposees.
- Edition de message.
- Suppression de message pour soi.
- Suppression de message pour tout le monde lorsque permis.
- Reactions aux messages.
- Messages favoris.
- Liste des messages favoris.
- Transfert de message.
- Sondages.
- Vote dans les sondages.
- Message epingle dans un groupe.
- Statut de frappe.
- Presence / statut en ligne.
- Confirmations de lecture selon les preferences.
- Masquer une conversation.
- Epingler ou desepingler une conversation.
- Mettre une conversation en sourdine.
- Bloquer un utilisateur.
- Debloquer un utilisateur.
- Signaler un utilisateur ou un contenu.
- Liste des utilisateurs bloques.

### Web - Notifications

- Centre de notifications.
- Marquer une notification comme lue.
- Tout marquer comme lu.
- Notifications liees aux messages.
- Notifications liees aux billets.
- Notifications liees aux candidatures.
- Notifications liees aux roles.
- Notifications liees aux organisateurs suivis.
- Notifications in-app, email et push selon le cas.

### Mobile

- Onglet Accueil avec evenements personnalises et categorises.
- Onglet Explorer avec recherche globale.
- Onglet Billets avec wallet mobile.
- Onglet Messages avec compteur de non lus.
- Onglet Profil.
- Consultation des billets.
- Consultation des places bloquees.
- Paiement du solde d'une place bloquee.
- Invitations de place recues et envoyees.
- Acceptation/refus d'invitation.
- Invitation d'une personne sur un siege.
- Annulation d'invitation.
- Reprise d'une place.
- QR code et partage du billet.
- Commande au bar depuis un billet.
- Mise en revente d'un billet.
- Retrait d'une revente.
- Demande de remboursement.
- Messagerie mobile.
- Filtres de conversations.
- Messages favoris.
- Creation de groupe.
- Detail et reglages de conversation.
- Gestion des membres d'un groupe.
- Promotion / retrogradation admin de groupe.
- Signalement de conversation ou utilisateur.
- Blocage et deblocage utilisateurs.
- Liste d'amis.
- Demandes d'amis.
- Recherche d'utilisateurs pour amis ou groupes.
- Evenements interesses.
- Organisateurs suivis.
- Preferences.
- Parametres du compte.
- Acces aux espaces de roles.
- Deconnexion.

## 3. Candidat organisateur

### Web

- Acces au parcours "Devenir organisateur".
- Creation de compte pendant le parcours si necessaire.
- Formulaire de candidature organisateur.
- Sauvegarde de brouillon.
- Validation progressive des informations.
- Upload des documents requis.
- Soumission de candidature.
- Suivi de son dossier dans "Mon inscription".
- Reception de notifications et emails de confirmation.
- Reception d'une demande de corrections si l'agent l'exige.
- Re-soumission apres corrections.
- Activation du role organisateur apres approbation.

### Mobile

- Acces au parcours "Devenir organisateur".
- Creation ou utilisation d'un compte existant.
- Formulaire de candidature organisateur.
- Enregistrement de brouillon.
- Soumission de la candidature.
- Suivi du dossier depuis "Mon dossier" / "Mon application".
- Affichage du statut : en attente, actif ou refuse.
- Bascule vers l'espace organisateur une fois le role disponible.

## 4. Candidat prestataire

### Web

- Acces au parcours "Devenir prestataire".
- Creation de compte pendant le parcours si necessaire.
- Formulaire de candidature prestataire.
- Selection des types de prestation.
- Upload des documents requis.
- Sauvegarde de brouillon.
- Soumission de candidature.
- Suivi de son dossier dans "Mon inscription".
- Reception de notifications et emails de confirmation.
- Reception d'une demande de corrections si necessaire.
- Re-soumission apres corrections.
- Activation du role prestataire apres approbation.

### Mobile

- Acces au parcours "Devenir prestataire".
- Creation ou utilisation d'un compte existant.
- Formulaire de candidature prestataire.
- Selection de categories de services.
- Enregistrement de brouillon.
- Soumission de la candidature.
- Suivi du dossier depuis "Mon dossier" / "Mon application".
- Affichage du statut : en attente, actif ou refuse.
- Bascule vers l'espace prestataire une fois le role disponible.

## 5. Organisateur

### Web - Espace organisateur

- Acces a une sidebar dediee lorsque le role organisateur est actif.
- Liste de ses evenements.
- Creation d'evenement.
- Edition d'evenement.
- Gestion du nom, sous-titre, description, date, heure, ville et lieu.
- Gestion des categories et ambiances.
- Gestion des styles musicaux.
- Gestion des artistes et DJs.
- Gestion des images d'evenement.
- Gestion des videos d'evenement.
- Gestion des types de places.
- Prix et quantites par categorie de place.
- Gestion des tables ou places reservees selon le modele d'evenement.
- Gestion du menu de precommande.
- Ajout, edition et retrait d'articles de menu.
- Disponibilite des articles de menu.
- Annulation d'evenement.
- Report d'evenement.
- Notifications aux abonnes lors des changements importants.
- Consultation des statistiques d'evenement.
- Statistiques de ventes.
- Performance par categorie de place.
- Demographie et informations d'audience lorsque disponibles.
- Insights et indicateurs de performance.
- Export ou donnees structurables pour suivi.

### Web - Ventes, operations et staff

- Consultation des reservations.
- Consultation des acheteurs.
- Detail par billet.
- Suivi des precommandes.
- Journal des commandes.
- Gestion de la guestlist.
- Ajout d'invites.
- Retrait d'invites.
- Ajout de membres d'equipe.
- Roles staff : scan, vente, service, gestion selon les permissions.
- Retrait de membres d'equipe.
- Gestion des codes promo.
- Creation de codes promo.
- Activation / desactivation de codes promo.
- Suppression de codes promo.
- Suivi de l'utilisation des codes promo.
- Boost d'evenement.
- Verification des disponibilites de boost.
- Paiement du boost.
- Activation apres paiement.

### Web - Page publique et paiements

- Gestion de sa page publique organisateur.
- Nom public, slug, description, ville et informations de contact.
- Liens reseaux sociaux.
- Avatar et couverture.
- Galerie media.
- Visibilite des medias.
- Suppression de medias.
- Reorganisation de galerie.
- Connexion Stripe Connect lorsque disponible.
- Gestion des numeros Mobile Money.
- Demande de versement.
- Consultation du statut de versement.
- Relance de versements en attente apres ajout d'un moyen de paiement.

### Mobile

- Espace organisateur depuis le hub "Espaces".
- Liste de ses evenements.
- Creation d'evenement.
- Detail de gestion d'un evenement.
- Modification d'evenement.
- Gestion des informations principales.
- Gestion des medias.
- Gestion des places.
- Gestion du menu de precommande.
- Gestion des artistes.
- Gestion des styles musicaux et ambiances.
- Annulation d'evenement.
- Report d'evenement.
- Gestion de l'equipe.
- Recherche et ajout de staff.
- Attribution de roles staff.
- Retrait de staff.
- Gestion des codes promo.
- Creation, activation, desactivation et suppression de codes promo.
- Consultation des reservations.
- Consultation du resume par type de place.
- Consultation des precommandes.
- Detail par billet.
- Gestion de la guestlist.
- Ajout et retrait d'invites.
- Statistiques d'evenement.
- Boost d'evenement.
- Choix de position et duree de boost.
- Paiement du boost via parcours mobile.
- Gestion de la page publique organisateur.
- Avatar, couverture, galerie et medias.
- Identite publique et reseaux sociaux.
- Gestion des paiements organisateur.
- Stripe Connect.
- Numeros Mobile Money.
- Demande de virement.
- Affichage des statuts de paiement.

## 6. Prestataire

### Web

- Acces a l'espace prestataire.
- Gestion du profil public prestataire.
- Nom, accroche, description, ville et telephone.
- Photo de profil.
- Image de couverture.
- Categories de service.
- Zones d'intervention.
- Gestion de catalogue.
- Ajout d'une offre de service.
- Edition d'une offre.
- Suppression d'une offre.
- Prix et unite de facturation.
- Disponibilite d'une offre.
- Medias par item de catalogue.
- Consultation de ses avis recus.
- Reponse aux avis.
- Gestion de son abonnement.
- Paiement ou renouvellement d'abonnement.
- Visibilite dans l'annuaire selon l'etat d'abonnement.
- Reception de rappels d'abonnement.
- Reception de demandes ou contacts d'organisateurs.
- Page publique prestataire visible par les visiteurs.

### Mobile

- Espace prestataire depuis le hub "Espaces".
- Gestion du profil prestataire.
- Photo de profil.
- Couverture.
- Nom, accroche, description, ville et telephone.
- Categories de service.
- Zones d'intervention.
- Gestion du catalogue.
- Ajout d'une offre.
- Edition d'une offre.
- Suppression d'une offre.
- Activation / desactivation de disponibilite.
- Ajout de medias sur une offre.
- Retrait de medias.
- Consultation des avis recus.
- Reponse aux avis.
- Gestion de l'abonnement.
- Paiement ou renouvellement.
- Historique de paiements d'abonnement.
- Page publique prestataire consultable dans l'annuaire.

## 7. Staff evenement

Le staff evenement correspond aux personnes ajoutees par un organisateur sur un evenement. Leurs permissions dependent du role attribue.

### Web

- Acces a "Mes soirees (equipe)".
- Liste des evenements sur lesquels l'utilisateur fait partie du staff.
- Acces au scanner de billets.
- Scan de QR codes.
- Verification de validite d'un billet.
- Check-in d'un billet.
- Affichage des informations utiles a l'entree.
- Acces a la vente sur place lorsqu'autorise.
- Vente de billets par agent de vente.
- Vente immediate ou vente avec reglement agent selon le mode.
- Tableau de ventes sur place.
- Acces aux commandes de menu / precommandes selon le role.
- Ajout d'articles a une commande.
- Mise a jour des quantites.
- Marquage d'un article comme servi.
- Marquage d'une commande comme payee.
- Annulation ou retrait d'articles selon permissions.
- Acces a la playlist en mode moderation/DJ lorsque permis.

### Mobile

- Acces a "Mes soirees".
- Scanner mobile.
- Scan de billets.
- Validation a l'entree.
- Vente sur place depuis l'ecran agent-sales.
- Selection d'un evenement staffe.
- Commandes sur place depuis un billet.
- Gestion de precommandes.
- Acces a la playlist evenement.
- Ajout de musique.
- Like de titres.
- Mode DJ / moderation lorsque le role le permet.

## 8. Agent / administrateur LIVE IN BLACK

### Web - Centre de controle

- Console d'operations dediee.
- Tableau de bord global.
- Indicateurs utilisateurs.
- Indicateurs comptes en ligne.
- Dossiers en attente.
- Nouveaux comptes du mois.
- Evenements publies.
- Evenements a venir.
- Billets vendus.
- Ventes recentes.
- Revenus plateforme.
- Badges et compteurs de files a traiter.

### Web - Comptes utilisateurs

- Recherche de comptes.
- Filtre par role ou statut.
- Detail d'un compte.
- Edition des informations utilisateur selon les champs autorises.
- Modification de nom, prenom, telephone.
- Modification d'e-mail avec revocation de verification.
- Marquage e-mail comme verifie.
- Envoi d'un email de verification.
- Envoi d'un lien de reinitialisation de mot de passe.
- Activation / desactivation d'un compte.
- Consultation des roles et statuts.

### Web - Dossiers et candidatures

- Liste des candidatures organisateur et prestataire.
- Filtrage par statut ou type.
- Detail d'une candidature.
- Consultation des documents.
- Note interne agent.
- Approbation d'une candidature.
- Demande de changements.
- Refus d'une candidature.
- Activation du role apres approbation.
- Notifications et emails au candidat.

### Web - Evenements et operations

- Liste des evenements.
- Recherche et filtrage.
- Controle des publications.
- Annulation d'un evenement par agent.
- Suivi des evenements a risque.
- Acces aux donnees utiles pour moderation et operations.

### Web - Finance

- File de remboursements.
- Marquage d'un remboursement manuel comme complete.
- File de demandes de versement.
- Soldes sans demande.
- Versements en echec.
- Alertes de paiement.
- Marquage d'un versement comme paye.
- Reglement manuel d'un vendeur/organisateur/prestataire.
- Resolution d'alertes de paiement.
- Suivi des boosts sponsorises.

### Web - Moderation et confiance

- Liste des signalements.
- Traitement d'un signalement.
- Liste des avis.
- Moderation d'avis.
- Gestion des avis signales.
- Demandes de suppression de compte.
- Approbation d'une suppression.
- Refus d'une suppression.
- Protection des cas sensibles lorsque le compte a une activite active.

### Web - Publication et contenu

- Configuration de l'accueil public.
- Selection d'evenements mis en avant.
- Gestion du bandeau editorial.
- Gestion du blog.
- Creation / edition d'articles de blog.
- Import de campagnes blog.
- Gestion de l'actualite publique.
- Pilotage des contenus visibles par les visiteurs.

### Mobile

- Hub agent depuis "Espaces".
- Tableau de bord agent.
- Statistiques globales.
- Actions rapides : moderation, evenements, utilisateurs, remboursements, versements, suppressions, accueil, boosts.
- Liste des candidatures a traiter.
- Detail de candidature.
- Documents de candidature.
- Note interne.
- Approbation, demande de changements ou refus.
- Recherche et gestion des utilisateurs.
- Detail utilisateur.
- Edition nom, prenom, telephone.
- Edition email.
- Verification email.
- Envoi de verification email.
- Envoi de reset mot de passe.
- Activation / desactivation de compte.
- Liste et filtrage des evenements.
- Annulation d'evenement par agent.
- Moderation des avis et signalements.
- Marquage d'un signalement comme traite.
- Remboursements en attente.
- Marquage d'un remboursement manuel comme effectue.
- Versements, soldes, echecs et alertes paiement.
- Marquage de versements comme payes.
- Reglement manuel.
- Resolution d'alertes de paiement.
- Demandes de suppression.
- Approbation ou refus de suppression.
- Configuration du bandeau d'accueil.
- Selection et retrait d'evenements mis en avant.
- Suivi des boosts sponsorises.

## 9. Fonctions transversales communes

### Web et mobile

- Authentification par e-mail et mot de passe.
- Session utilisateur.
- Bascule d'espace actif selon les roles disponibles.
- Gestion des roles : client, organisateur, prestataire, agent.
- Etats de candidature : aucune, en attente, active, refusee.
- Recherche publique.
- Recommandations.
- Paiements.
- Billets.
- Notifications metier.
- Emails transactionnels.
- Push notifications lorsque configure.
- Uploads d'images et medias.
- Gestion des erreurs utilisateur.
- Etats vides.
- Protection des routes selon le role.
- Validation des formulaires.
- Nettoyage des saisies.
- Rate limiting sur certaines actions sensibles.
- Support multi-region / multi-pays.
- Support Mobile Money pour certaines regions.
- Support Stripe lorsque disponible.
- Support FedaPay pour les paiements XOF.

### Web principalement

- SEO avance.
- Sitemap dynamique.
- Sitemaps pagines.
- Flux RSS blog.
- Open Graph et Twitter Cards.
- Blog complet.
- Pages legales completes.
- Cookie consent.
- Centre de notifications complet.
- Back-office agent plus large.
- Documentation et scripts QA.

### Mobile principalement

- Navigation par onglets.
- Usage terrain : scanner, billets, messages, espaces rapides.
- Experience plus adaptee au controle d'entree et aux operations pendant l'evenement.
- WebView de paiement lorsque necessaire.
- Gestion compacte des espaces role.

## 10. Parite web/mobile par role

### Visiteur

- **Web** : tres complet, avec SEO, blog, pages publiques et contenu indexable.
- **Mobile** : complet pour decouverte, recherche et consultation.

### Client

- **Web** : tres complet pour compte, wallet, billets, revente, remboursement, notifications et messagerie.
- **Mobile** : tres complet pour billets, messages, decouverte, profil, favoris et actions terrain.

### Organisateur

- **Web** : complet pour creation, gestion, ventes, staff, stats, paiements, page publique et boosts.
- **Mobile** : tres avance, avec creation, edition, staff, guestlist, codes promo, stats, paiements et boosts.

### Prestataire

- **Web** : complet pour profil, catalogue, abonnement, avis et visibilite.
- **Mobile** : complet pour profil, catalogue, abonnement et avis.

### Staff evenement

- **Web** : complet pour scan, vente sur place, commandes et playlist selon permission.
- **Mobile** : adapte au terrain, avec scanner, vente, commande et playlist.

### Agent / administrateur

- **Web** : le plus complet pour pilotage global, contenu, blog, SEO, moderation, finance et dossiers.
- **Mobile** : tres avance pour operations courantes, moderation, utilisateurs, finance, suppressions, accueil et boosts.

## 11. Sources inspectees

Principales sources utilisees pour l'inventaire :

- Web : `app/(public)`, `app/(app)`, `app/api`, `app/components/features`, `lib/server`, `lib/shared`.
- Web navigation : `app/(app)/_components/dashboardNav.ts`, `app/(app)/_components/AgentWorkspaceShell.tsx`, `app/(public)/_components/PublicNav.tsx`.
- Mobile navigation : `app/(tabs)/_layout.tsx`, `app/spaces/index.tsx`.
- Mobile roles : `app/spaces/organizer`, `app/spaces/provider.tsx`, `app/spaces/provider`, `app/spaces/agent`.
- Mobile parcours client : `app/(tabs)`, `app/event/[id].tsx`, `app/provider/[id].tsx`, `app/organizer/[slug].tsx`, `app/checkout`, `app/scanner.tsx`, `app/playlist/[eventId].tsx`, `app/order/[eventId]/[ticketCode].tsx`.
- Mobile services : `lib/events.ts`, `lib/tickets.ts`, `lib/messaging.ts`, `lib/organizerEvents.ts`, `lib/providerProfile.ts`, `lib/agentApplications.ts`, `lib/agentUsers.ts`, `lib/agentPayouts.ts`, `lib/reviews.ts`, `lib/playlist.ts`.

