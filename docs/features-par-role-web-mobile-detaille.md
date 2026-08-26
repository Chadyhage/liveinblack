# LIVE IN BLACK - Catalogue detaille des features par role

**Objectif :** expliquer chaque grande fonctionnalite avec son acces, son role et sa valeur metier.  
**Perimetre :** Web `LIB_Web` et application mobile `LIB_Mobile`.  
**Lecture cible :** client, partenaire, equipe produit, investisseur ou nouveau membre projet.

## 1. Visiteur non connecte

### 1.1 Accueil public

**Acces :** Web `/home`, Mobile onglet `Accueil`.  
**Role concerne :** visiteur, client connecte.  
**Description :** l'accueil presente l'univers LIVE IN BLACK, les evenements mis en avant, les sorties proches ou recommandees et les principaux chemins de navigation vers les evenements, les prestataires et les organisateurs. Sur mobile, l'accueil est pense comme une porte d'entree rapide avec des rails de contenu comme Top 3, Ce soir, Pour toi ou A la une.  
**Valeur :** c'est la vitrine principale du produit. Elle donne envie de decouvrir les sorties et oriente rapidement l'utilisateur vers une action : explorer, reserver ou s'inscrire.

### 1.2 Catalogue des evenements

**Acces :** Web `/events`, Mobile onglet `Accueil` et fiche evenement via `/event/[id]`.  
**Role concerne :** visiteur, client.  
**Description :** cette feature permet de parcourir les evenements disponibles, de voir les dates, villes, images, categories, prix et informations essentielles avant d'ouvrir une fiche detaillee. Les evenements peuvent etre organises par categorie, region ou mise en avant.  
**Valeur :** elle transforme LIVE IN BLACK en agenda culturel et nightlife. C'est le premier levier de conversion vers l'achat de billets.

### 1.3 Fiche detaillee evenement

**Acces :** Web `/events/[id]`, Mobile `/event/[id]`.  
**Role concerne :** visiteur, client.  
**Description :** la fiche evenement rassemble tout ce qu'un utilisateur doit savoir : nom, description, date, ville, lieu, carte, organisateur, line-up, styles musicaux, places disponibles, tarifs, menu ou precommandes, playlist si active et bouton de reservation.  
**Valeur :** elle remplace la communication dispersee sur plusieurs canaux par une page claire et partageable. Elle aide l'utilisateur a decider et rassure avant paiement.

### 1.4 Recherche globale

**Acces :** Web header + `/search?q=...`, Mobile onglet `Explorer`.  
**Role concerne :** visiteur, client.  
**Description :** la recherche permet de retrouver des evenements, organisateurs et prestataires a partir d'un mot-cle, d'une ville, d'un style, d'un nom ou d'une categorie. Sur le web, le header affiche aussi des suggestions rapides.  
**Valeur :** elle evite que l'utilisateur se perde dans les listes. C'est une fonction cle pour trouver vite une sortie ou un professionnel precis.

### 1.5 Annuaire organisateurs

**Acces :** Web `/organizers`, Mobile `/organizers`.  
**Role concerne :** visiteur, client.  
**Description :** l'annuaire liste les organisateurs presents sur LIVE IN BLACK. Il permet de decouvrir qui cree des evenements, de consulter leur image, leur ville, leur prochaine activite et leur profil public.  
**Valeur :** il donne de la credibilite aux acteurs de la plateforme et construit une relation durable entre public et organisateurs.

### 1.6 Profil public organisateur

**Acces :** Web `/organizers/[slug]`, Mobile `/organizer/[slug]`.  
**Role concerne :** visiteur, client, organisateur.  
**Description :** le profil organisateur presente l'identite publique, la description, les reseaux sociaux, la galerie, les evenements lies et les informations de confiance. Un utilisateur peut suivre l'organisateur pour recevoir ses actualites.  
**Valeur :** c'est une page de marque pour chaque organisateur. Elle aide a construire une audience et a fideliser les personnes qui aiment ses evenements.

### 1.7 Annuaire prestataires

**Acces :** Web `/providers`, Mobile `/providers`.  
**Role concerne :** visiteur, client, organisateur.  
**Description :** l'annuaire prestataires regroupe les professionnels utiles a l'evenementiel : DJ, lieux, materiel, photo, video, traiteur, securite, decoration ou autres services. Les profils peuvent etre recherches et filtres selon les informations disponibles.  
**Valeur :** il transforme LIVE IN BLACK en reseau professionnel, pas seulement en billetterie. Les organisateurs peuvent trouver plus facilement les bons partenaires.

### 1.8 Profil public prestataire

**Acces :** Web `/providers/[id]`, Mobile `/provider/[id]`.  
**Role concerne :** visiteur, client, organisateur, prestataire.  
**Description :** le profil prestataire affiche l'identite du professionnel, son accroche, sa description, ses categories, ses zones d'intervention, son catalogue, ses medias et ses avis. Depuis ce profil, un utilisateur connecte peut engager une conversation ou laisser un avis selon le contexte.  
**Valeur :** c'est une vitrine commerciale complete. Elle permet au prestataire de prouver son serieux et a l'organisateur de comparer avant de contacter.

### 1.9 Blog et contenu editorial

**Acces :** Web `/blog`, articles `/blog/[slug]`, flux `/blog/feed.xml`.  
**Role concerne :** visiteur, client, equipe LIVE IN BLACK.  
**Description :** le blog publie des articles, guides, actualites et contenus autour de la culture, des sorties, des villes, des organisateurs et de l'evenementiel. Les articles ont des metadonnees SEO et peuvent etre classes par categorie.  
**Valeur :** il sert a attirer du trafic organique depuis Google, a renforcer la marque et a installer LIVE IN BLACK comme media de reference sur son secteur.

### 1.10 Pages legales et confiance

**Acces :** Web `/terms`, `/privacy`, `/cookies`, `/legal-notice`, Mobile `/legal/[page]`.  
**Role concerne :** tous.  
**Description :** ces pages expliquent les conditions d'utilisation, la confidentialite, les cookies, les mentions legales et les informations obligatoires. Le site inclut aussi un bandeau de consentement cookies.  
**Valeur :** elles rassurent les utilisateurs et rendent le produit plus credible juridiquement, surtout pour une plateforme qui gere comptes, paiements et donnees personnelles.

### 1.11 Contact public

**Acces :** Web `/contact`.  
**Role concerne :** visiteur, client, partenaire.  
**Description :** le formulaire de contact permet d'envoyer un message a l'equipe LIVE IN BLACK avec un nom, un email, un sujet et un message.  
**Valeur :** il donne un canal officiel pour les questions, demandes commerciales, problemes ou partenariats.

## 2. Client / utilisateur connecte

### 2.1 Inscription et connexion

**Acces :** Web `/login`, Mobile `/login`.  
**Role concerne :** visiteur, client, candidat.  
**Description :** l'utilisateur peut creer un compte, se connecter, choisir un role de depart, confirmer son email, demander un renvoi de verification ou recuperer son mot de passe.  
**Valeur :** c'est la porte d'entree vers toutes les fonctions personnelles : achat, wallet, favoris, messages, candidatures et espaces role.

### 2.2 Profil personnel

**Acces :** Web `/profile`, Mobile onglet `Profil`.  
**Role concerne :** client et tout utilisateur connecte.  
**Description :** le profil regroupe les informations personnelles, les raccourcis vers billets, parametres, messages, favoris, espaces role et actions courantes. Sur mobile, il sert aussi de hub rapide vers scanner, amis, annuaires et espaces.  
**Valeur :** il donne a l'utilisateur un centre de controle simple pour retrouver tout ce qui le concerne.

### 2.3 Parametres du compte

**Acces :** Web `/profile/parametres`, Mobile `/settings`.  
**Role concerne :** utilisateur connecte.  
**Description :** les parametres permettent de modifier le nom, le telephone, les informations demographiques, l'email, le mot de passe, la confidentialite, les preferences, l'export de donnees et la suppression de compte.  
**Valeur :** l'utilisateur garde la main sur son identite, sa securite et ses donnees, ce qui renforce la confiance.

### 2.4 Preferences et recommandations

**Acces :** Web dans `/profile/parametres`, Mobile `/preferences`.  
**Role concerne :** client.  
**Description :** l'utilisateur indique ses styles musicaux, artistes, villes, types d'evenements, budget, ambiance et frequence de sortie. Ces donnees alimentent les recommandations et la personnalisation.  
**Valeur :** la plateforme devient plus pertinente : elle ne montre pas seulement tout le catalogue, elle propose ce qui correspond le mieux a l'utilisateur.

### 2.5 Evenements interesses

**Acces :** Web `/profile/interested-events`, Mobile `/interested-events`.  
**Role concerne :** client.  
**Description :** cette feature permet de sauvegarder des evenements sans les acheter tout de suite. L'utilisateur retrouve ses evenements interesses dans un espace dedie.  
**Valeur :** elle cree une intention d'achat et permet de relancer ou rappeler des evenements importants.

### 2.6 Organisateurs suivis

**Acces :** Web `/profile/followed-organizers`, Mobile `/followed-organizers`.  
**Role concerne :** client.  
**Description :** l'utilisateur peut suivre des organisateurs et regler ses alertes pour rester informe des nouveaux evenements ou changements importants.  
**Valeur :** elle cree une relation durable entre organisateurs et public, comme un systeme d'abonnement social.

### 2.7 Achat de billet

**Acces :** Web depuis `/events/[id]`, Mobile `/checkout/[eventId]`.  
**Role concerne :** client.  
**Description :** le client choisit ses places, applique eventuellement un code promo, selectionne les quantites et lance le paiement. Les paiements peuvent passer par Stripe ou FedaPay selon le contexte.  
**Valeur :** c'est le coeur commercial de la plateforme : convertir la decouverte en revenu.

### 2.8 Reservation temporaire de place

**Acces :** Web via les flux seat-hold, Mobile `/checkout/seat-hold/[eventId]` et `/checkout/seat-hold-balance/[seatHoldId]`.  
**Role concerne :** client.  
**Description :** l'utilisateur peut bloquer temporairement une place ou une table avec un acompte, puis payer le solde plus tard avant expiration.  
**Valeur :** cette option facilite les achats plus engageants, notamment pour les tables ou reservations de groupe.

### 2.9 Wallet de billets

**Acces :** Web `/profile/billets`, Mobile onglet `Billets`.  
**Role concerne :** client.  
**Description :** le wallet liste les billets, invitations, places bloquees, billets passes et billets annules. Il affiche les QR codes, les informations d'evenement et les actions disponibles.  
**Valeur :** l'utilisateur retrouve tous ses acces au meme endroit, ce qui reduit le stress le jour de l'evenement.

### 2.10 QR code et page billet

**Acces :** Web `/ticket/[token]`, wallet web/mobile.  
**Role concerne :** client, staff scan.  
**Description :** chaque billet peut afficher un QR code securise et une page billet lisible. Le QR sert au controle d'entree, tandis que la page billet donne aussi acces a certaines actions comme commander ou rejoindre la playlist.  
**Valeur :** c'est la preuve d'acces officielle de l'utilisateur.

### 2.11 Invitations de places

**Acces :** Web wallet, Mobile onglet `Billets`.  
**Role concerne :** client.  
**Description :** un acheteur peut inviter une autre personne sur une place, annuler l'invitation, reprendre la place, ou le destinataire peut accepter/refuser.  
**Valeur :** cette feature rend les achats de groupe beaucoup plus pratiques.

### 2.12 Revente de billet

**Acces :** Web wallet + `/checkout/resale`, Mobile `/checkout/resale/[listingId]`.  
**Role concerne :** client.  
**Description :** l'utilisateur peut mettre un billet en vente, retirer cette vente ou acheter un billet remis en vente par quelqu'un d'autre.  
**Valeur :** elle reduit la frustration des personnes qui ne peuvent plus venir et augmente la disponibilite pour les autres.

### 2.13 Demande de remboursement

**Acces :** Web wallet, page billet `/ticket/[token]`, Mobile onglet `Billets`.  
**Role concerne :** client.  
**Description :** le client peut demander un remboursement depuis son billet ou un lien securise. La demande est ensuite traitee selon les regles et les outils agent.  
**Valeur :** elle donne un parcours clair au lieu de gerer les remboursements uniquement par messages ou support.

### 2.14 Commande sur place

**Acces :** Web `/order/[eventId]/[ticketCode]`, Mobile `/order/[eventId]/[ticketCode]`.  
**Role concerne :** client, staff service.  
**Description :** depuis un billet, l'utilisateur peut commander des articles ou consulter les commandes liees a son ticket. Le staff peut ensuite servir ou marquer les paiements selon les permissions.  
**Valeur :** LIVE IN BLACK couvre l'experience pendant l'evenement, pas seulement l'achat d'entree.

### 2.15 Playlist evenement

**Acces :** Web `/playlist/[eventId]`, Mobile `/playlist/[eventId]`.  
**Role concerne :** client, DJ, staff, organisateur.  
**Description :** les participants peuvent proposer des musiques, liker des titres et suivre ce qui passe. Les roles autorises peuvent moderer, ajouter en mode DJ, passer un titre en now-playing ou retirer des morceaux.  
**Valeur :** elle rend l'evenement plus interactif et cree une experience communautaire autour de la musique.

### 2.16 Messagerie

**Acces :** Web `/messages`, Mobile onglet `Messages` et `/conversation/[id]`.  
**Role concerne :** client, organisateur, prestataire, agent selon les cas.  
**Description :** la messagerie gere les conversations directes et groupes, les messages, reactions, messages favoris, transferts, sondages, messages epingles, sourdines et statuts de lecture.  
**Valeur :** elle garde les echanges dans LIVE IN BLACK au lieu de disperser les discussions sur WhatsApp, Instagram ou email.

### 2.17 Groupes de discussion

**Acces :** Web messagerie, Mobile `/new-group` et reglages conversation.  
**Role concerne :** client, groupes d'amis, equipes.  
**Description :** les utilisateurs peuvent creer un groupe, ajouter des membres, nommer des admins, renommer le groupe, changer l'avatar, mettre en sourdine ou quitter.  
**Valeur :** ideal pour organiser une sortie a plusieurs et garder les decisions au meme endroit.

### 2.18 Amis et reseau personnel

**Acces :** Mobile `/friends`, Web via services sociaux et messagerie.  
**Role concerne :** client.  
**Description :** l'utilisateur peut rechercher d'autres comptes, envoyer, accepter, refuser ou annuler des demandes d'amis, puis utiliser ce reseau dans les interactions sociales.  
**Valeur :** ajoute une couche communautaire autour des sorties.

### 2.19 Blocage et signalement

**Acces :** Web messagerie/profils, Mobile `/blocked-users`, conversation settings, signalements.  
**Role concerne :** client, agent moderation.  
**Description :** un utilisateur peut bloquer quelqu'un, debloquer, signaler un comportement ou un contenu, et consulter certains signalements ou blocages.  
**Valeur :** protege la communaute et donne des outils de securite sans attendre une intervention manuelle.

### 2.20 Notifications

**Acces :** Web `/notifications`, mobile via badges/messages et notifications systeme selon configuration.  
**Role concerne :** tous les comptes connectes.  
**Description :** les notifications in-app, emails et push informent l'utilisateur des messages, billets, roles, candidatures, suivis organisateurs, paiements, remboursements ou actions importantes.  
**Valeur :** la plateforme reste proactive et evite que l'utilisateur rate une action importante.

## 3. Candidats organisateur et prestataire

### 3.1 Candidature organisateur

**Acces :** Web `/organizer-signup`, Mobile `/apply/organizer`.  
**Role concerne :** candidat organisateur.  
**Description :** le candidat remplit un dossier pour demander le droit de creer et gerer des evenements. Le parcours peut inclure creation de compte, informations legales, documents, brouillon et soumission.  
**Valeur :** LIVE IN BLACK garde le controle sur la qualite des organisateurs avant de leur permettre de publier.

### 3.2 Candidature prestataire

**Acces :** Web `/provider-signup`, Mobile `/apply/provider`.  
**Role concerne :** candidat prestataire.  
**Description :** le professionnel fournit ses informations, categories de service, documents et elements necessaires pour etre examine par l'equipe.  
**Valeur :** la plateforme protege l'annuaire et evite d'afficher des prestataires non verifies ou incomplets.

### 3.3 Brouillon de candidature

**Acces :** Web et mobile dans les parcours de candidature.  
**Role concerne :** candidat organisateur, candidat prestataire.  
**Description :** le candidat peut sauvegarder son avancement avant de soumettre definitivement le dossier.  
**Valeur :** reduit l'abandon, surtout quand des documents ou informations administratives sont necessaires.

### 3.4 Suivi du dossier

**Acces :** Web `/my-application`, Mobile `/my-application`.  
**Role concerne :** candidat organisateur, candidat prestataire.  
**Description :** l'utilisateur consulte le statut de sa candidature : en attente, en revue, corrections demandees, approuvee ou refusee.  
**Valeur :** evite les allers-retours support et rend le processus transparent.

### 3.5 Corrections et re-soumission

**Acces :** Web/mobile via dossier de candidature.  
**Role concerne :** candidat, agent.  
**Description :** si l'agent demande des changements, le candidat peut corriger son dossier puis le renvoyer pour revue.  
**Valeur :** permet d'ameliorer un dossier sans le rejeter definitivement.

## 4. Organisateur

### 4.1 Espace organisateur

**Acces :** Web `/my-events`, Mobile `/spaces/organizer`.  
**Role concerne :** organisateur.  
**Description :** c'est le tableau de bord principal de l'organisateur. Il liste ses evenements et donne acces a la creation, edition, statistiques, staff, paiements, page publique et actions commerciales.  
**Valeur :** l'organisateur pilote son activite depuis un espace unique.

### 4.2 Creation d'evenement

**Acces :** Web `/my-events`, Mobile `/spaces/organizer/new`.  
**Role concerne :** organisateur.  
**Description :** l'organisateur cree une nouvelle fiche evenement avec les informations de base : nom, date, lieu, description, places, prix et parametres importants.  
**Valeur :** c'est la fonction qui alimente le catalogue public et lance la billetterie.

### 4.3 Edition d'evenement

**Acces :** Web `/my-events`, Mobile `/spaces/organizer/[eventId]/edit`.  
**Role concerne :** organisateur.  
**Description :** l'organisateur peut ajuster les informations, medias, places, prix, menu, artistes, styles et ambiances. Certains champs peuvent etre controles apres ventes pour eviter les erreurs.  
**Valeur :** donne de la flexibilite tout en gardant une experience fiable pour les acheteurs.

### 4.4 Gestion des places et tarifs

**Acces :** Web event wizard, Mobile edition evenement.  
**Role concerne :** organisateur.  
**Description :** l'organisateur definit les categories de billets, quantites disponibles, prix et options de places.  
**Valeur :** permet de gerer plusieurs offres commerciales pour un meme evenement.

### 4.5 Menu de precommande

**Acces :** Web edition evenement, Mobile `/spaces/organizer/[eventId]/edit`.  
**Role concerne :** organisateur, staff, client.  
**Description :** l'organisateur configure les articles commandables pendant ou avant l'evenement, avec nom, prix, categorie, image et disponibilite.  
**Valeur :** ouvre une source de revenu supplementaire et facilite la logistique sur place.

### 4.6 Artistes, DJs et ambiance

**Acces :** Web edition evenement, Mobile edition evenement.  
**Role concerne :** organisateur, client.  
**Description :** l'organisateur renseigne la programmation artistique, les styles musicaux et l'ambiance attendue.  
**Valeur :** aide les utilisateurs a choisir une soiree qui correspond a leurs gouts.

### 4.7 Annulation et report

**Acces :** Web detail evenement organisateur, Mobile `/spaces/organizer/[eventId]`.  
**Role concerne :** organisateur, client, agent.  
**Description :** l'organisateur peut annuler ou reporter un evenement avec un message ou une nouvelle date. Les utilisateurs concernes peuvent etre notifies.  
**Valeur :** fournit un processus propre pour gerer les changements importants.

### 4.8 Reservations et acheteurs

**Acces :** Web `/my-events`, Mobile `/spaces/organizer/[eventId]/bookings`.  
**Role concerne :** organisateur.  
**Description :** l'organisateur consulte les commandes, acheteurs, billets, statuts et precommandes par evenement.  
**Valeur :** donne une vision operationnelle des ventes et de la preparation.

### 4.9 Statistiques d'evenement

**Acces :** Web `/my-events/[id]/statistiques`, Mobile `/spaces/organizer/[eventId]/stats`.  
**Role concerne :** organisateur.  
**Description :** les statistiques affichent les ventes, capacites, stocks, revenus, categories, performances et donnees d'audience disponibles.  
**Valeur :** aide l'organisateur a prendre de meilleures decisions commerciales.

### 4.10 Guestlist

**Acces :** Web `/my-events`, Mobile `/spaces/organizer/[eventId]/guestlist`.  
**Role concerne :** organisateur, staff entree.  
**Description :** l'organisateur ajoute des invites sur une categorie de place, puis peut les retirer si besoin. Les invites obtiennent des acces gerables comme des billets.  
**Valeur :** remplace les listes manuelles par un systeme controle et scannable.

### 4.11 Equipe evenement

**Acces :** Web `/my-events`, Mobile `/spaces/organizer/[eventId]/staff`.  
**Role concerne :** organisateur, staff.  
**Description :** l'organisateur recherche des utilisateurs, les ajoute a l'equipe et leur attribue des roles comme scan, vente, service ou gestion selon les permissions.  
**Valeur :** permet de deleguer sans partager le compte organisateur.

### 4.12 Codes promo

**Acces :** Web `/my-events`, Mobile `/spaces/organizer/[eventId]/promo-codes`.  
**Role concerne :** organisateur, client.  
**Description :** l'organisateur cree des codes de reduction, les active/desactive, les supprime et suit leur utilisation.  
**Valeur :** donne un outil marketing simple pour partenaires, early buyers ou campagnes promotionnelles.

### 4.13 Boost evenement

**Acces :** Web via boost evenement, Mobile `/spaces/organizer/[eventId]/boost`.  
**Role concerne :** organisateur.  
**Description :** l'organisateur choisit une position et une duree de mise en avant, puis paie pour augmenter la visibilite de son evenement.  
**Valeur :** cree un levier publicitaire interne et une source de revenu plateforme.

### 4.14 Page publique organisateur

**Acces :** Web `/organizer-studio`, Mobile `/spaces/organizer/profile`.  
**Role concerne :** organisateur.  
**Description :** l'organisateur gere son nom public, slug, description, ville, contacts, reseaux sociaux, avatar, couverture et galerie.  
**Valeur :** transforme l'organisateur en marque visible et suivable.

### 4.15 Paiements organisateur

**Acces :** Web `/organizer-studio`, Mobile `/spaces/organizer/payouts`.  
**Role concerne :** organisateur, agent finance.  
**Description :** l'organisateur configure Stripe Connect ou Mobile Money, consulte son statut de paiement et demande ses versements.  
**Valeur :** donne une lecture claire de l'argent du et reduit les traitements manuels.

## 5. Prestataire

### 5.1 Espace prestataire

**Acces :** Web `/offer-services`, Mobile `/spaces/provider`.  
**Role concerne :** prestataire.  
**Description :** l'espace prestataire regroupe la gestion du profil public, des medias, du catalogue, des avis et de l'abonnement.  
**Valeur :** donne au professionnel un mini CRM de presentation et de visibilite.

### 5.2 Profil prestataire

**Acces :** Web `/offer-services`, Mobile `/spaces/provider`.  
**Role concerne :** prestataire, organisateur.  
**Description :** le prestataire renseigne son nom, accroche, description, ville, telephone, categories et zones d'intervention.  
**Valeur :** rend le profil trouvable et credible dans l'annuaire.

### 5.3 Identite visuelle prestataire

**Acces :** Web `/offer-services`, Mobile `/spaces/provider`.  
**Role concerne :** prestataire.  
**Description :** le prestataire ajoute une photo de profil, une couverture et des medias qui illustrent son travail.  
**Valeur :** les visuels augmentent la confiance et la qualite commerciale du profil.

### 5.4 Catalogue de services

**Acces :** Web `/offer-services`, Mobile `/spaces/provider`.  
**Role concerne :** prestataire, organisateur.  
**Description :** le prestataire cree des offres avec nom, prix, unite, disponibilite et medias. Il peut les modifier ou supprimer.  
**Valeur :** l'organisateur comprend rapidement ce qui est propose et a quel ordre de prix.

### 5.5 Avis prestataire

**Acces :** Web profil prestataire et espace prestataire, Mobile `/spaces/provider-reviews`.  
**Role concerne :** client, organisateur, prestataire, agent.  
**Description :** les utilisateurs peuvent consulter, laisser, signaler ou supprimer leurs avis selon les droits. Le prestataire peut repondre aux avis recus.  
**Valeur :** cree de la preuve sociale et un mecanisme de reputation.

### 5.6 Abonnement prestataire

**Acces :** Web `/offer-services`, Mobile `/spaces/provider/subscription`.  
**Role concerne :** prestataire.  
**Description :** le prestataire paie ou renouvelle son abonnement pour maintenir sa visibilite dans l'annuaire. Le systeme gere aussi le statut et l'historique de paiement.  
**Valeur :** c'est le modele de monetisation de l'annuaire prestataires.

## 6. Staff evenement

### 6.1 Mes soirees equipe

**Acces :** Web `/my-shifts`, Mobile `/my-shifts`.  
**Role concerne :** staff evenement.  
**Description :** cette page liste les evenements sur lesquels l'utilisateur a ete ajoute comme membre d'equipe.  
**Valeur :** le staff retrouve rapidement ses missions sans demander de lien a l'organisateur.

### 6.2 Scanner de billets

**Acces :** Web `/scanner/[eventId]`, Mobile `/scanner`.  
**Role concerne :** staff scan, organisateur, agent autorise.  
**Description :** le scanner lit les QR codes des billets, verifie leur validite et marque l'entree comme effectuee.  
**Valeur :** securise l'entree et evite les doubles utilisations de billets.

### 6.3 Vente sur place

**Acces :** Web `/on-site-sales/[eventId]`, Mobile `/agent-sales/[eventId]`.  
**Role concerne :** staff vente, organisateur, agent finance.  
**Description :** un vendeur autorise peut vendre des billets a l'entree, soit avec paiement direct, soit avec un mode ou l'agent regle ensuite.  
**Valeur :** couvre les ventes de derniere minute et garde une trace propre des ventes terrain.

### 6.4 Commandes et service sur place

**Acces :** Web `/order/[eventId]/[ticketCode]`, Mobile `/order/[eventId]/[ticketCode]`.  
**Role concerne :** client, staff service, organisateur.  
**Description :** les articles commandables peuvent etre ajoutes, ajustes, servis, annules ou marques comme payes selon les permissions.  
**Valeur :** digitalise une partie de l'exploitation pendant l'evenement.

## 7. Agent / administrateur LIVE IN BLACK

### 7.1 Centre de controle agent

**Acces :** Web `/agent`, Mobile `/spaces/agent`.  
**Role concerne :** agent LIVE IN BLACK.  
**Description :** le centre de controle affiche les statistiques globales, les files d'action, les candidatures en attente, les revenus, les billets vendus et les raccourcis vers les modules operationnels.  
**Valeur :** donne a l'equipe une vision immediate de ce qui se passe sur la plateforme.

### 7.2 Gestion des comptes

**Acces :** Web `/agent/comptes`, Mobile `/spaces/agent/users` et `/spaces/agent/users/[id]`.  
**Role concerne :** agent.  
**Description :** l'agent recherche les utilisateurs, consulte les details, modifie certaines informations, envoie des emails de verification ou reset mot de passe, verifie une adresse ou desactive un compte.  
**Valeur :** permet de gerer le support compte sans intervention directe en base de donnees.

### 7.3 Revue des candidatures

**Acces :** Web `/agent/dossiers`, Mobile `/spaces/agent/[id]`.  
**Role concerne :** agent, candidats.  
**Description :** l'agent consulte les dossiers organisateur/prestataire, lit les documents, ajoute une note interne, approuve, refuse ou demande des changements.  
**Valeur :** controle la qualite des professionnels autorises sur LIVE IN BLACK.

### 7.4 Moderation evenements

**Acces :** Web `/agent/evenements`, Mobile `/spaces/agent/events`.  
**Role concerne :** agent.  
**Description :** l'agent recherche et filtre les evenements, consulte leur etat et peut annuler un evenement si necessaire.  
**Valeur :** protege les utilisateurs contre les contenus ou evenements problematiques.

### 7.5 Moderation avis et signalements

**Acces :** Web `/agent/signalements` et `/agent/avis`, Mobile `/spaces/agent/moderation`.  
**Role concerne :** agent.  
**Description :** l'agent traite les signalements de la communaute, modere les avis et marque les problemes comme traites.  
**Valeur :** maintient la confiance et la qualite des interactions.

### 7.6 Remboursements

**Acces :** Web `/agent/paiements`, Mobile `/spaces/agent/payments`.  
**Role concerne :** agent finance.  
**Description :** l'agent consulte les remboursements en attente et peut marquer un remboursement manuel comme effectue lorsqu'il est traite hors plateforme.  
**Valeur :** structure le suivi financier et evite les remboursements oublies.

### 7.7 Versements et alertes de paiement

**Acces :** Web `/agent/paiements`, Mobile `/spaces/agent/payouts`.  
**Role concerne :** agent finance.  
**Description :** l'agent voit les demandes de versement, les soldes sans demande, les echecs, les alertes et peut marquer un paiement comme regle ou resoudre une alerte.  
**Valeur :** donne un controle clair sur l'argent du aux organisateurs et prestataires.

### 7.8 Demandes de suppression

**Acces :** Web `/agent/suppressions`, Mobile `/spaces/agent/deletion-requests`.  
**Role concerne :** agent.  
**Description :** certaines suppressions de compte sensibles passent par une revue agent. L'agent peut approuver ou refuser selon les contraintes du compte.  
**Valeur :** protege les operations en cours, les ventes et les obligations de suivi.

### 7.9 Configuration de l'accueil public

**Acces :** Web `/agent/actualite`, Mobile `/spaces/agent/homepage`.  
**Role concerne :** agent editorial / operations.  
**Description :** l'agent choisit les evenements mis en avant, l'accent editorial et les contenus visibles sur l'accueil.  
**Valeur :** permet de piloter la vitrine commerciale sans redeployer le site.

### 7.10 Blog agent

**Acces :** Web `/agent/blog`.  
**Role concerne :** agent editorial.  
**Description :** l'equipe peut gerer les articles de blog et importer des campagnes de contenu.  
**Valeur :** facilite la strategie SEO et la communication de marque.

### 7.11 Suivi des boosts

**Acces :** Web module finance/boosts agent, Mobile `/spaces/agent/boosts`.  
**Role concerne :** agent.  
**Description :** l'agent consulte les campagnes sponsorisees achetees par les organisateurs, leurs statuts et leur activite.  
**Valeur :** donne une vue de controle sur un produit payant de visibilite.

## 8. Fonctions transversales

### 8.1 Roles multiples

**Acces :** Web sidebar et compte, Mobile `/spaces`.  
**Role concerne :** tous les comptes avec plusieurs roles.  
**Description :** un meme utilisateur peut etre client, organisateur, prestataire ou agent, puis basculer vers l'espace correspondant.  
**Valeur :** evite de creer plusieurs comptes pour une meme personne active dans plusieurs fonctions.

### 8.2 Emails transactionnels

**Acces :** automatique selon les actions.  
**Role concerne :** tous.  
**Description :** les emails confirment les inscriptions, candidatures, messages, tickets, paiements, remboursements, roles, abonnements et actions importantes.  
**Valeur :** l'utilisateur garde une trace fiable hors application.

### 8.3 Push notifications

**Acces :** automatique apres autorisation et configuration.  
**Role concerne :** utilisateurs connectes.  
**Description :** les notifications push alertent rapidement sur messages, roles, staff, agents, billets ou operations importantes.  
**Valeur :** augmente la reactivite, surtout sur mobile ou pendant les evenements.

### 8.4 Upload medias et documents

**Acces :** profils, candidatures, evenements, catalogues.  
**Role concerne :** candidats, organisateurs, prestataires, agents.  
**Description :** la plateforme accepte images, videos et documents selon les parcours : justificatifs, avatars, couvertures, galeries, offres ou evenements.  
**Valeur :** enrichit les profils et permet la verification des dossiers.

### 8.5 Paiements multi-pays

**Acces :** checkout billets, abonnements, boosts, versements.  
**Role concerne :** clients, organisateurs, prestataires, agents.  
**Description :** LIVE IN BLACK combine Stripe, FedaPay et Mobile Money selon les usages et regions.  
**Valeur :** rend la plateforme plus adaptee au contexte local et international.

