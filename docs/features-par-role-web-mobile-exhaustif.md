# LIVE IN BLACK - Catalogue exhaustif des fonctionnalites Web et Mobile

Periode de lecture du produit: etat du code inspecte le 26 aout 2026.  
Objectif du document: presenter au client, sans vocabulaire technique, toutes les fonctionnalites visibles et metiers reperees dans les applications Web et Mobile LIVE IN BLACK.

## 1. Accueil, decouverte et pages publiques

**Accueil public.** Lien: Web `/home`, Mobile onglet Accueil. Cette page sert de porte d'entree a LIVE IN BLACK: elle met en avant les evenements, les organisateurs, les prestataires et les contenus importants. Elle permet a un visiteur de comprendre rapidement ce qu'il peut faire sur la plateforme, puis de partir vers la recherche, un evenement, un organisateur ou une inscription.

**Liste des evenements.** Lien: Web `/events`, Mobile onglet Recherche et ecran detail evenement. Cette fonctionnalite affiche les evenements disponibles, avec une logique de consultation publique. Elle permet aux utilisateurs de trouver des sorties, comparer les propositions, puis ouvrir la fiche complete d'un evenement.

**Fiche detaillee d'evenement.** Lien: Web `/events/[id]`, Mobile `/event/[id]`. La fiche evenement regroupe les informations essentielles: nom, date, lieu, organisateur, description, medias, billets et actions possibles. C'est le point central de conversion: l'utilisateur peut s'informer, montrer son interet, acheter, reserver ou partager.

**Affichage en modal des evenements.** Lien: Web `/(public)/@modal/(.)events/[id]`. Cette experience ouvre le detail d'un evenement sans casser la navigation en cours. Elle rend la consultation plus fluide, surtout depuis une liste de resultats ou une page de recherche.

**Recherche principale.** Lien: Web `/search`, API `/api/search`, `/api/search/quick`, Mobile onglet Recherche. La recherche permet de trouver rapidement des evenements, organisateurs, prestataires ou contenus. La version rapide sert aux suggestions immediates, tandis que la recherche complete sert a explorer plus largement.

**Recherche dediee aux evenements.** Lien: API `/api/events/search`. Cette fonctionnalite alimente les resultats d'evenements avec des criteres adaptes au contexte de sortie: lieu, date, categorie ou mots-cles. Elle aide l'utilisateur a passer d'une envie generale a une decision concrete.

**Annuaire des organisateurs.** Lien: Web `/organizers`, Mobile `/organizers`. Cette page presente les organisateurs actifs sur la plateforme. Elle donne de la visibilite aux marques d'evenements et permet au public de decouvrir qui produit les soirees et activations.

**Fiche organisateur publique.** Lien: Web `/organizers/[slug]`, Mobile `/organizer/[slug]`, API `/api/organizers/by-slug/[slug]`. La fiche organisateur rassemble son profil, ses medias et ses evenements. Elle construit la confiance autour de l'organisateur et facilite le suivi de ses prochaines dates.

**Affichage en modal des organisateurs.** Lien: Web `/(public)/@modal/(.)organizers/[slug]`. Cette fonctionnalite permet de consulter un organisateur depuis une autre page sans perdre le fil de navigation. Elle rend l'exploration plus naturelle.

**Annuaire des prestataires.** Lien: Web `/providers`, Mobile `/providers`, API `/api/providers`. Cette fonctionnalite liste les prestataires disponibles: artistes, services, intervenants ou partenaires utiles aux evenements. Elle transforme LIVE IN BLACK en place de marche, pas seulement en billetterie.

**Fiche prestataire publique.** Lien: Web `/providers/[id]`, Mobile `/provider/[id]`, API `/api/providers/[providerId]/reviews`. La fiche prestataire presente son profil, son catalogue, ses medias et ses avis. Elle aide un organisateur ou un utilisateur a evaluer un prestataire avant de le contacter ou le reserver.

**Affichage en modal des prestataires.** Lien: Web `/(public)/@modal/(.)providers/[id]`. La consultation en modal evite de quitter la page courante. C'est utile quand on compare plusieurs prestataires depuis une liste.

**Page organisateurs.** Lien: Web `/organizers`. Cette page est la vitrine globale des organisateurs. Elle met en avant les profils et sert de point d'entree vers leurs pages publiques et leurs evenements.

**Page prestataires.** Lien: Web `/providers`. Cette page permet au public et aux organisateurs de parcourir l'offre de prestataires. Elle soutient la dimension reseau professionnel de la plateforme.

**Blog public.** Lien: Web `/blog`, `/blog/[slug]`, API flux `/blog/feed.xml` et `/blog/feed.json`. Le blog permet de publier des articles, campagnes ou contenus editoriaux. Il soutient la communication, le referencement et la creation d'une image de marque autour de LIVE IN BLACK.

**Flux RSS et JSON du blog.** Lien: Web `/blog/feed.xml`, `/blog/feed.json`. Ces flux permettent aux lecteurs, moteurs et outils externes de suivre les publications. C'est utile pour la visibilite et la diffusion automatique du contenu.

**Page "A propos".** Lien: Web `/about`. Cette page explique l'identite, la mission et la proposition de valeur de LIVE IN BLACK. Elle rassure les nouveaux visiteurs et donne un cadre clair au projet.

**Page contact.** Lien: Web `/contact`, API `/api/contact`. Le formulaire de contact permet a un utilisateur, organisateur, prestataire ou partenaire d'envoyer une demande. C'est le canal direct pour les questions commerciales, support ou partenariat.

**Page aide.** Lien: Web `/help`. Cette page rassemble l'assistance et les informations pratiques pour les utilisateurs connectes. Elle reduit les frictions quand quelqu'un cherche comment utiliser son compte, ses billets ou ses espaces.

**Pages legales.** Lien: Web `/terms`, `/privacy`, `/cookies`, `/legal-notice`, Mobile `/legal/[page]`. Ces pages couvrent les conditions d'utilisation, la confidentialite, les cookies et les mentions legales. Elles donnent au produit une base de confiance et de conformite.

**Sitemap public.** Lien: Web `/sitemap.xml`, `/sitemaps/[collection]/[page]`. Le sitemap aide les moteurs de recherche a trouver les pages publiques. Il participe au referencement des evenements, organisateurs, prestataires et contenus.

**OpenSearch.** Lien: Web `/opensearch.xml`. Cette fonctionnalite permet a certains navigateurs ou outils d'ajouter LIVE IN BLACK comme moteur de recherche. Elle renforce l'accessibilite de la recherche.

**Fichier llms.txt.** Lien: Web `/llms.txt`. Ce fichier donne une presentation lisible par les assistants IA et moteurs modernes. Il prepare la plateforme a etre mieux comprise par les nouveaux outils de recherche.

## 2. Authentification, compte et securite personnelle

**Connexion.** Lien: Web `/login`, Mobile `/login`, API `/api/auth/[...nextauth]`. La connexion permet a chaque utilisateur d'acceder a son espace personnel. Elle gere l'entree securisee dans les fonctionnalites de billets, messages, profil, organisateur, prestataire ou agent.

**Inscription utilisateur.** Lien: API `/api/auth/register`. L'inscription cree un compte utilisateur. Elle ouvre l'acces aux achats, messages, favoris, demandes d'organisation et autres services connectes.

**Verification d'email.** Lien: Web `/verify-email`, Mobile `/verify-email`, API `/api/auth/verify-email`, `/api/auth/resend-verification`. Cette fonctionnalite confirme que l'adresse email appartient bien a l'utilisateur. Elle protege les comptes et ameliore la fiabilite des communications.

**Confirmation de changement d'email.** Lien: Web `/confirmer-email`, Mobile `/confirm-email-change`, API `/api/profil/confirmer-email`. Quand un utilisateur change d'email, cette fonctionnalite valide la nouvelle adresse. Elle evite les erreurs et les changements non voulus.

**Mot de passe oublie.** Lien: Web `/reset-password`, Mobile `/reset-password`, API `/api/auth/request-password-reset`, `/api/auth/reset-password`. L'utilisateur peut demander un lien de reinitialisation, puis choisir un nouveau mot de passe. Cela reduit les blocages support et garde le compte accessible.

**Politique de mot de passe.** Lien: Mobile `lib/passwordPolicy.ts`, API profil mot de passe. Cette fonctionnalite encadre la qualite du mot de passe. Elle aide a eviter les mots de passe trop faibles et protege mieux les comptes.

**Role actif du compte.** Lien: API `/api/account/active-role`, Mobile espaces. LIVE IN BLACK gere plusieurs roles: client, organisateur, prestataire, agent ou equipe. Le role actif permet d'afficher le bon espace et les bonnes actions selon le contexte de la personne connectee.

**Profil personnel.** Lien: Web `/profile`, Mobile onglet Profil, API `/api/profil`. Le profil centralise les informations de l'utilisateur. Il permet de gerer son identite, ses coordonnees, ses preferences et ses acces.

**Avatar.** Lien: API `/api/profil/avatar`. L'utilisateur peut ajouter ou modifier sa photo de profil. Cela rend les interactions sociales, les messages et les espaces communautaires plus humains.

**Nom public.** Lien: API `/api/profil/nom`. Cette fonctionnalite permet de modifier le nom affiche. Elle garde le profil a jour sans intervention support.

**Email du profil.** Lien: API `/api/profil/email`. L'utilisateur peut demander le changement de son email. La verification associee limite les erreurs et les abus.

**Telephone.** Lien: API `/api/profil/telephone`. Le telephone peut etre ajoute ou modifie pour les besoins de contact, de verification ou de suivi operationnel. C'est important pour les evenements ou interventions terrain.

**Demographie.** Lien: API `/api/profil/demographie`. Cette partie collecte des informations de profil utiles a la personnalisation et aux statistiques. Elle doit permettre de mieux comprendre l'audience sans compliquer l'experience.

**Preferences personnelles.** Lien: Web `/profile/parametres`, Mobile `/preferences`, API `/api/profil/preferences`, `/api/preferences/search`. Les preferences permettent d'adapter l'experience: notifications, interets, recherche et recommandations. Elles rendent le produit plus pertinent pour chaque utilisateur.

**Confidentialite.** Lien: API `/api/profil/confidentialite`. L'utilisateur peut controler certains aspects de visibilite ou de confidentialite. Cette fonctionnalite renforce la confiance et donne plus de maitrise sur les donnees personnelles.

**Entrees de recommandation.** Lien: API `/api/profile/recommendation-inputs`, Mobile recommandations. Cette fonctionnalite alimente la personnalisation des suggestions. Elle permet de recommander des evenements ou contenus plus proches des gouts de l'utilisateur.

**Export des donnees.** Lien: API `/api/profil/export`, Mobile `lib/dataExport.ts`. L'utilisateur peut demander une copie de ses donnees. C'est une fonctionnalite importante pour la transparence et la conformite.

**Suppression de compte.** Lien: API `/api/profil/supprimer-compte`, agent suppressions. L'utilisateur peut demander la suppression de son compte, puis l'equipe peut traiter la demande. Cela couvre un besoin de conformite et de confiance.

**Parametres mobile.** Lien: Mobile `/settings`. L'ecran de parametres regroupe les actions de compte et de configuration sur mobile. Il donne une entree simple aux reglages importants.

**Stockage de session mobile.** Lien: Mobile `lib/storage.ts`, `lib/api.ts`. L'application mobile conserve les elements necessaires a la session et aux appels securises. Cela permet une experience stable sans reconnecter l'utilisateur a chaque ouverture.

## 3. Notifications, emails et communication automatique

**Centre de notifications.** Lien: Web `/notifications`, API `/api/notifications`, Mobile via les espaces connectes. Cette fonctionnalite affiche les alertes importantes: billets, messages, evenements, paiements, demandes ou rappels. Elle evite que l'utilisateur rate une action importante.

**Marquer une notification comme lue.** Lien: API `/api/notifications/[id]/read`. L'utilisateur peut traiter ses notifications au fur et a mesure. Cela rend le centre de notifications plus propre et plus utile.

**Tout marquer comme lu.** Lien: API `/api/notifications/read-all`. Cette action permet de repartir d'une boite de notifications propre. Elle est utile pour les utilisateurs actifs qui recoivent beaucoup d'alertes.

**Notifications push.** Lien: API `/api/push/public-key`, `/api/push/subscribe`, `/api/push/unsubscribe`. Les utilisateurs peuvent s'abonner ou se desabonner des notifications push. Cela permet d'alerter rapidement sur un message, un billet, un rappel ou un changement d'evenement.

**Emails de compte.** Lien: serveur emails `templates/account.ts`, `templates/auth.ts`. Les emails accompagnent les moments importants: verification, reinitialisation, securite et changements de compte. Ils rendent les parcours autonomes.

**Emails de billetterie.** Lien: serveur emails `templates/tickets.ts`, `templates/resale.ts`, `templates/refunds.ts`. Ces emails confirment les billets, les transferts, les reventes et les remboursements. Ils securisent l'apres-achat.

**Emails organisateur et staff.** Lien: serveur emails `templates/organizerEvents.ts`, `templates/staff.ts`, `templates/payouts.ts`. Ces emails accompagnent les organisateurs et equipes terrain. Ils rappellent les actions a faire et les informations operationnelles.

**Emails moderation et agent.** Lien: serveur emails `templates/moderation.ts`, `templates/agent.ts`, `templates/applications.ts`. Ces emails soutiennent les workflows internes: dossiers, validation, signalements et suivi administratif.

## 4. Billetterie, achat et parcours client

**Achat standard de billet.** Lien: API `/api/checkout`, `/api/checkout/fedapay`, Mobile `/checkout/[eventId]`. L'utilisateur peut acheter un billet pour un evenement. Le parcours connecte l'evenement, le paiement et la generation du billet final.

**Achat gratuit.** Lien: API `/api/checkout/free`. Cette fonctionnalite gere les evenements ou billets gratuits. Elle permet de produire un billet sans paiement tout en gardant un suivi propre des participants.

**Paiement FedaPay.** Lien: API `/api/checkout/fedapay`, `/api/webhooks/fedapay`, serveur `fedapayClient.ts`. FedaPay permet de traiter les paiements adaptes au marche local. Les webhooks confirment automatiquement les paiements pour finaliser les billets ou commandes.

**Paiement Stripe.** Lien: API `/api/stripe-webhook`, `/api/webhooks/stripe`, serveur `stripeClient.ts`. Stripe sert aux paiements et abonnements selon les cas. Les confirmations automatiques permettent d'eviter les validations manuelles.

**Page succes paiement.** Lien: Web `/payment-success`. Apres un paiement, l'utilisateur arrive sur une page claire de confirmation. Cela rassure et le guide vers ses billets ou la suite du parcours.

**Billets de l'utilisateur.** Lien: Web `/profile/billets`, Mobile onglet Billets, API `/api/tickets/mine`. L'utilisateur retrouve tous ses billets dans son espace. C'est le coffre-fort de ses acces aux evenements.

**Page billet par token.** Lien: Web `/ticket/[token]`. Cette page permet d'ouvrir un billet directement via un lien securise. Elle est utile depuis un email, un partage ou une invitation.

**Commande associee a un billet.** Lien: Web `/order/[eventId]/[ticketCode]`, Mobile `/order/[eventId]/[ticketCode]`. Cette page affiche une commande ou un billet lie a un evenement et a un code. Elle sert a verifier les details d'achat ou d'acces.

**Assignation de billet.** Lien: API `/api/tickets/assign`, `/api/tickets/assign/cancel`. L'utilisateur peut attribuer un billet a quelqu'un d'autre puis annuler cette attribution si besoin. Cela couvre les achats pour amis ou groupes.

**Invitations de billets.** Lien: API `/api/tickets/invitations`, `/accept`, `/decline`, `/outgoing`. Les invitations permettent d'envoyer un billet a une personne et de suivre si elle l'accepte ou le refuse. C'est un vrai parcours social autour de la billetterie.

**Quitter un billet.** Lien: API `/api/tickets/leave`. Une personne peut se retirer d'un billet ou d'une attribution quand le cas est prevu. Cela evite les situations bloquees dans les groupes.

**Revocation de billet.** Lien: API `/api/tickets/revoke`. Cette action permet d'invalider un billet dans certains cas. Elle est essentielle pour corriger une erreur, gerer une fraude ou appliquer une decision administrative.

**Check-in de billet.** Lien: API `/api/tickets/checkin`, Web `/scanner/[eventId]`, Mobile `/scanner`. Le billet peut etre scanne et marque comme utilise a l'entree. Cela permet le controle terrain et evite les doubles entrees.

**Scanner evenement.** Lien: Web `/scanner/[eventId]`, Mobile `/scanner`. L'equipe peut scanner les billets depuis le web ou le mobile. C'est la fonctionnalite cle pour l'accueil et le controle sur place.

**Demande de remboursement.** Lien: API `/api/orders/[orderId]/refund-request`, `/api/refund-link/[token]`. Le client peut initier une demande de remboursement et suivre un lien de traitement. Cela structure un sujet sensible et evite les echanges disperses.

**Traitement des remboursements client.** Lien: serveur `clientRefunds.ts`, agent paiements. Le systeme suit les demandes, les statuts et le traitement des remboursements. Cela donne a l'equipe une vue claire pour agir proprement.

**Revente de billet.** Lien: API `/api/tickets/resell`, `/api/resale-listings/[listingId]`, Mobile `/checkout/resale/[listingId]`. Un utilisateur peut proposer un billet a la revente, et un autre peut l'acheter. Cela cree un marche secondaire controle par la plateforme.

**Liste de revente par evenement.** Lien: API `/api/events/[eventId]/resale-listings`. La fiche evenement peut afficher les billets disponibles a la revente. Cela evite les reventes sauvages et garde la transaction dans LIVE IN BLACK.

**Expiration des reventes.** Lien: API `/api/cron/resale-expiry`. Les annonces de revente peuvent expirer automatiquement. Cela garde le marche propre et evite les offres obsoletes.

**Reservation de place ou blocage temporaire.** Lien: API `/api/seat-holds`, Mobile `/checkout/seat-hold/[eventId]`. L'utilisateur peut bloquer une place temporairement avant finalisation. C'est utile pour les paiements en plusieurs etapes ou les decisions de groupe.

**Paiement d'une reservation de place.** Lien: API `/api/seat-holds/fedapay`, `/api/checkout/seat-hold`, `/api/checkout/seat-hold/fedapay`, Mobile `/checkout/seat-hold-balance/[seatHoldId]`. Cette fonctionnalite finalise ou complete le paiement d'une reservation. Elle reduit les pertes de places et clarifie le solde restant.

**Rappels de reservation.** Lien: API `/api/cron/seat-hold-reminders`, `/api/cron/seat-holds`. Les reservations non finalisees peuvent declencher des rappels ou etre nettoyees automatiquement. Cela protege l'inventaire de billets.

**Placement et attribution des sieges.** Lien: serveur `seatAssignment.ts`, Mobile `lib/seatAssignment.ts`. Cette fonctionnalite gere l'affectation de places quand un evenement le demande. Elle rend possible une billetterie plus precise que le simple billet general.

**Code billet.** Lien: serveur `ticketCode.ts`. Chaque billet dispose d'un code de controle. Ce code permet de retrouver, verifier et scanner le billet.

**Token de billet.** Lien: serveur `ticketToken.ts`. Le token permet d'ouvrir un billet via un lien securise. Il rend le partage plus simple sans exposer directement des informations sensibles.

## 5. Evenements suivis, recommandations et relation avec le public

**Marquer son interet pour un evenement.** Lien: Web `/profile/interested-events`, Mobile `/interested-events`, API `/api/events/[eventId]/interest`, `/api/profil/evenements-interesses`. L'utilisateur peut sauvegarder un evenement qui l'interesse. Cela l'aide a retrouver ses sorties potentielles et alimente les rappels.

**Liste des evenements interesses.** Lien: Web `/profile/interested-events`, Mobile `/interested-events`. Cette page rassemble les evenements mis de cote par l'utilisateur. Elle transforme une simple navigation en intention suivie.

**Rappels aux personnes interessees.** Lien: API `/api/cron/interested-event-reminders`. Le systeme peut rappeler automatiquement un evenement aux personnes qui ont montre leur interet. Cela augmente les chances de conversion sans action manuelle.

**Suivre un organisateur.** Lien: Web `/profile/followed-organizers`, Mobile `/followed-organizers`, API `/api/organizers/[organizerId]/follow`. L'utilisateur peut suivre un organisateur pour retrouver ses prochains evenements. C'est la base d'une relation directe entre marques et audience.

**Alertes d'organisateur suivi.** Lien: API `/api/organizers/[organizerId]/follow/alerts`. L'utilisateur peut regler les alertes liees a un organisateur. Cela permet de recevoir les bonnes nouvelles sans surcharge.

**Liste des organisateurs suivis.** Lien: Web `/profile/followed-organizers`, API `/api/organizers/followed`. Cette page donne un tableau personnel des organisateurs suivis. Elle facilite la fidelisation.

**Suggestions et recommandations.** Lien: Mobile `lib/recommendations.ts`, `lib/recommendationsApi.ts`. L'application mobile peut proposer des contenus selon les signaux de l'utilisateur. Le produit devient plus personnel et plus engageant.

**Categories d'evenements.** Lien: Mobile `lib/eventCategories.ts`. Les categories servent a classer et filtrer les evenements. Elles rendent la decouverte plus rapide pour le public.

**Regions.** Lien: Mobile `lib/regions.ts`. Les regions aident a adapter les listes et formulaires a la localisation. Cela rend le produit plus pertinent geographiquement.

## 6. Messagerie, groupes et interactions sociales

**Boite de messages.** Lien: Web `/messages`, Mobile onglet Messages, API `/api/conversations`. La messagerie centralise les conversations entre utilisateurs, organisateurs, prestataires et groupes. Elle evite de sortir de la plateforme pour coordonner une sortie ou un service.

**Conversation individuelle.** Lien: Mobile `/conversation/[id]`, API `/api/conversations/[conversationId]`. L'utilisateur peut ouvrir une discussion detaillee, lire l'historique et continuer l'echange. C'est le coeur de la communication privee.

**Envoi de messages.** Lien: API `/api/conversations/[conversationId]/messages`. Les participants peuvent envoyer des messages dans une conversation. Le systeme gere le contenu, la livraison et les regles de participation.

**Edition de message.** Lien: API `/api/messages/[messageId]/edit`. Un message peut etre corrige apres envoi. Cela reduit les erreurs de communication.

**Suppression de message.** Lien: API `/api/messages/[messageId]/delete`. L'utilisateur peut supprimer un message quand la regle le permet. Cela donne un minimum de controle sur ses echanges.

**Reactions aux messages.** Lien: API `/api/messages/[messageId]/react`. Les participants peuvent reagir rapidement a un message. Cela rend les conversations plus vivantes et moins lourdes.

**Messages favoris.** Lien: Mobile `/starred-messages`, API `/api/messages/[messageId]/star`, `/api/messages/starred`. L'utilisateur peut mettre en favori des messages importants et les retrouver ensuite. C'est utile pour garder une adresse, une consigne ou un point d'organisation.

**Transfert de message.** Lien: API `/api/messages/[messageId]/forward`. Un message peut etre transfere vers une autre conversation. Cela facilite la circulation d'une information utile.

**Sondages dans les conversations.** Lien: API `/api/conversations/[conversationId]/polls`, `/api/messages/[messageId]/vote`. Les groupes peuvent voter sur une option, par exemple une heure, un choix ou une decision. Cela transforme la messagerie en outil d'organisation.

**Accuses de lecture.** Lien: API `/api/conversations/[conversationId]/read`. Les conversations peuvent suivre ce qui a ete lu. Cela aide a comprendre si une information a bien ete vue.

**Indicateur de saisie.** Lien: API `/api/conversations/[conversationId]/typing`. Les participants peuvent voir qu'une personne est en train d'ecrire. Cela rend l'echange plus naturel.

**Presence utilisateur.** Lien: API `/api/users/presence`. Le systeme peut indiquer la presence ou l'activite recente. Cela ameliore la sensation de conversation en temps reel.

**Creation de groupe.** Lien: Mobile `/new-group`, API `/api/conversations/groups`. Les utilisateurs peuvent creer un groupe de discussion. C'est utile pour organiser une sortie, un staff ou une communaute autour d'un evenement.

**Parametres de conversation.** Lien: Mobile `/conversation/[id]/settings`. Cet ecran permet de gerer une conversation: membres, notifications, nom, image ou actions de moderation selon les droits. Il rend les groupes administrables.

**Renommer une conversation.** Lien: API `/api/conversations/[conversationId]/rename`. Un groupe peut recevoir un nom clair. Cela facilite le suivi quand l'utilisateur a plusieurs discussions.

**Avatar de conversation.** Lien: API `/api/conversations/[conversationId]/avatar`. Le groupe peut avoir une image. Cela rend la messagerie plus identifiable.

**Ajouter des membres.** Lien: API `/api/conversations/[conversationId]/members`. Les administrateurs peuvent ajouter des participants. Cela permet au groupe d'evoluer naturellement.

**Retirer un membre.** Lien: API `/api/conversations/[conversationId]/members/[targetUserId]`. Un administrateur peut retirer une personne si necessaire. C'est indispensable pour garder un groupe sain.

**Changer le role d'un membre.** Lien: API `/api/conversations/[conversationId]/members/[targetUserId]/role`. Les groupes peuvent distinguer les administrateurs et les membres. Cela donne un cadre aux responsabilites.

**Mettre un membre en sourdine.** Lien: API `/api/conversations/[conversationId]/members/[targetUserId]/mute`. Cette action limite temporairement une personne dans un groupe. Elle sert a gerer les abus sans supprimer tout le groupe.

**Quitter une conversation.** Lien: API `/api/conversations/[conversationId]/leave`. Un participant peut sortir d'un groupe. Cela respecte son controle sur ses conversations.

**Masquer une conversation.** Lien: API `/api/conversations/[conversationId]/hide`. L'utilisateur peut cacher une conversation de sa liste. Cela garde la messagerie lisible.

**Vider une conversation.** Lien: API `/api/conversations/[conversationId]/clear`. L'utilisateur peut nettoyer son historique local ou sa vue de conversation. Cela repond aux besoins d'organisation personnelle.

**Epingler une conversation.** Lien: API `/api/conversations/[conversationId]/pin`. Les conversations importantes peuvent rester en haut. C'est utile pour les groupes actifs ou les sujets urgents.

**Message epingle.** Lien: API `/api/conversations/[conversationId]/pinned-message`. Un groupe peut garder une consigne importante visible. Cela evite de repeter les memes informations.

**Mettre une conversation en sourdine.** Lien: API `/api/conversations/[conversationId]/mute`. L'utilisateur peut couper les notifications d'une conversation. Cela protege l'attention sans quitter le groupe.

**Contact telephone dans une conversation.** Lien: API `/api/conversations/[conversationId]/contact-phone`. Cette fonctionnalite permet de gerer ou consulter un numero de contact lie a une conversation. Elle est utile pour les coordinations evenementielles ou prestataires.

**Amis.** Lien: Mobile `/friends`, API `/api/friends`. L'utilisateur peut gerer son reseau d'amis. Cela soutient les sorties de groupe et les invitations de billets.

**Demandes d'amis.** Lien: API `/api/friends/requests`, `/accept`, `/decline`, `/cancel`. Les demandes d'amis couvrent l'envoi, l'acceptation, le refus et l'annulation. Le reseau social reste controle par consentement.

**Retirer un ami.** Lien: API `/api/friends/remove`. L'utilisateur peut enlever quelqu'un de son reseau. Cela garde le controle personnel.

**Bloquer un utilisateur.** Lien: Mobile `/blocked-users`, API `/api/users/block`, `/api/users/unblock`, `/api/users/blocked`. Le blocage limite les interactions indesirables. La liste des utilisateurs bloques permet de revenir sur une decision.

**Signaler un utilisateur.** Lien: API `/api/users/report`. L'utilisateur peut signaler un comportement problematique. Cela alimente la moderation et protege la communaute.

**Recherche d'utilisateurs.** Lien: API `/api/users/search`, `/api/users/lookup`. Cette fonctionnalite permet de trouver une personne pour l'ajouter, l'inviter ou la contacter. Elle rend les interactions sociales possibles sans connaitre tous les details d'avance.

## 7. Playlist, ambiance et experience en evenement

**Playlist evenement.** Lien: Web `/playlist/[eventId]`, Mobile `/playlist/[eventId]`, API `/api/events/[eventId]/playlist`. Chaque evenement peut avoir une playlist collaborative ou controlee. Cela ajoute une dimension d'ambiance et d'engagement avant ou pendant la soiree.

**Recherche de morceaux.** Lien: API `/api/events/[eventId]/playlist/search`. Les utilisateurs peuvent chercher des titres a proposer. Cela rend la contribution simple et rapide.

**Ajouter un morceau.** Lien: API `/api/events/[eventId]/playlist/songs`. Les participants peuvent proposer un morceau selon les regles de l'evenement. L'organisateur ou le DJ garde ensuite la maitrise.

**Like sur un morceau.** Lien: API `/api/events/[eventId]/playlist/songs/[songId]/like`. Les utilisateurs peuvent soutenir les morceaux qu'ils veulent entendre. Cela cree un signal collectif d'ambiance.

**Statut d'un morceau.** Lien: API `/api/events/[eventId]/playlist/songs/[songId]/status`. Un morceau peut etre accepte, refuse, joue ou mis a jour selon le flux choisi. Cela donne un outil de pilotage au DJ ou a l'organisateur.

**Mes morceaux proposes.** Lien: API `/api/events/[eventId]/playlist/songs/[songId]/mine`. L'utilisateur peut savoir si un morceau lui appartient ou suivre ses propositions. Cela rend l'experience plus transparente.

**File DJ.** Lien: API `/api/events/[eventId]/playlist/songs/dj`. Le DJ dispose d'une vue adaptee pour gerer les propositions. Cela transforme les suggestions du public en outil operationnel.

**Titre en cours.** Lien: API `/api/events/[eventId]/playlist/now-playing`. Le systeme peut afficher le morceau actuellement joue. Cela connecte l'application a l'ambiance de la salle.

**Musique d'ambiance mobile.** Lien: Mobile `lib/ambientMusic.ts`. L'application mobile prevoit une logique d'ambiance sonore. Cette brique soutient les experiences immersives ou les fonds musicaux controles.

## 8. Commandes sur evenement et vente sur place

**Commandes evenementielles.** Lien: API `/api/event-orders/[eventId]`. Cette fonctionnalite gere les commandes associees a un evenement, par exemple consommations, services ou elements vendus sur place. Elle etend LIVE IN BLACK au-dela du billet.

**Ajouter un article a une commande.** Lien: API `/api/event-orders/add`. Un article peut etre ajoute a une commande en cours. Cela sert aux paniers et ventes pendant l'evenement.

**Modifier une quantite.** Lien: API `/api/event-orders/update-quantity`. Les quantites peuvent etre corrigees avant paiement ou service. Cela reduit les erreurs de caisse.

**Retirer un article.** Lien: API `/api/event-orders/remove`. Un article peut etre supprime d'une commande. C'est essentiel pour un flux de vente flexible.

**Annuler une commande ou un item.** Lien: API `/api/event-orders/cancel`. Une commande peut etre annulee selon les regles. Cela permet de corriger les erreurs ou cas particuliers.

**Paiement de commande evenementielle.** Lien: API `/api/event-orders/pay`. Une commande peut etre payee separement du billet. Cela ouvre la porte a des ventes additionnelles sur place.

**Servir une commande.** Lien: API `/api/event-orders/serve`. Le staff peut marquer une commande comme servie. Cela separe le paiement de l'execution terrain.

**Materialiser une commande.** Lien: API `/api/event-orders/materialize`. Cette etape transforme une intention ou un panier en commande concrete. Elle aide a stabiliser les donnees de vente.

**Journal de commande.** Lien: API `/api/event-orders/[eventId]/log`. Le journal garde la trace des actions sur les commandes. Il aide a controler les operations et a resoudre les litiges.

**Vente sur place web.** Lien: Web `/on-site-sales/[eventId]`, API agent sales. L'equipe peut vendre des billets ou articles directement a l'entree ou au comptoir. Cela donne a LIVE IN BLACK un usage terrain complet.

**Vente agent mobile.** Lien: Mobile `/agent-sales/[eventId]`, API `/api/agent-sales/[eventId]/sell`, `/sell-at-door`. Les agents peuvent vendre depuis un telephone. C'est pratique pour les evenements sans poste fixe.

**Dashboard de vente agent.** Lien: API `/api/agent-sales/[eventId]/dashboard`. L'agent peut suivre ses ventes et son activite. Cela facilite le controle en temps reel.

**Encaissement porte.** Lien: API `/api/agent-sales/[eventId]/sell-at-door`. Cette fonction couvre les ventes a l'entree, souvent en contexte rapide. Elle rend le produit utilisable dans la realite d'une soiree.

**Reglement des ventes agent.** Lien: API `/api/agent-sales/settlements/[settlementId]/settle`. Les ventes realisees par agents peuvent etre cloturees et reglees. Cela apporte une logique de reconciliation financiere.

**Rappels ventes cash.** Lien: API `/api/cron/cash-sale-reminders`. Le systeme peut rappeler les operations liees aux ventes cash. Cela limite les oublis dans les reglements.

## 9. Candidatures et onboarding organisateur/prestataire

**Inscription organisateur.** Lien: Web `/organizer-signup`, Mobile `/apply/organizer`, API `/api/applications/organisateur/register`. Un candidat organisateur peut demarrer son inscription. Cette fonctionnalite transforme un visiteur en partenaire potentiel.

**Brouillon de dossier organisateur.** Lien: API `/api/applications/organisateur/draft`. Le candidat peut sauvegarder son dossier avant de le soumettre. Cela evite de perdre son travail et reduit l'abandon.

**Soumission de dossier organisateur.** Lien: API `/api/applications/organisateur/submit`. Une fois pret, le dossier organisateur est envoye a l'equipe pour analyse. Cela structure le processus de validation.

**Lecture du dossier organisateur.** Lien: API `/api/applications/organisateur`. Le candidat ou l'equipe peut recuperer l'etat du dossier. Cela rend le suivi transparent.

**Inscription prestataire.** Lien: Web `/provider-signup`, Mobile `/apply/provider`, API `/api/applications/prestataire/register`. Un prestataire peut demarrer son entree dans l'ecosysteme. Cela permet d'elargir l'offre de services.

**Brouillon de dossier prestataire.** Lien: API `/api/applications/prestataire/draft`. Le prestataire peut preparer son dossier progressivement. C'est utile pour les documents, descriptions et medias.

**Soumission de dossier prestataire.** Lien: API `/api/applications/prestataire/submit`. Le dossier est transmis pour validation. L'equipe peut ensuite accepter, refuser ou demander des corrections.

**Lecture du dossier prestataire.** Lien: API `/api/applications/prestataire`. Cette fonctionnalite permet de consulter l'etat d'une candidature prestataire. Elle evite les demandes de statut manuelles.

**Documents de candidature.** Lien: API `/api/applications/documents/sign`, `/api/applications/[id]/documents/[documentKey]/[index]`. Les dossiers peuvent inclure des documents signes ou recuperables. Cela donne une base serieuse a la validation.

**Validation des formulaires mobile.** Lien: Mobile `lib/applicationValidation.ts`. L'application mobile controle les informations avant envoi. Cela evite les dossiers incomplets.

**Ma candidature.** Lien: Web `/my-application`, Mobile `/my-application`. L'utilisateur peut suivre son dossier depuis son espace. Il sait ou il en est sans appeler l'equipe.

## 10. Espace organisateur

**Espace organisateur.** Lien: Web `/organizer-studio`, Mobile `/spaces/organizer`. Cet espace regroupe les outils de pilotage pour les organisateurs. Il donne acces aux evenements, statistiques, staff, paiements, profil et actions commerciales.

**Creation d'evenement.** Lien: Mobile `/spaces/organizer/new`, API `/api/organizer-events`. L'organisateur peut creer un nouvel evenement. Il renseigne les informations qui alimenteront la page publique et la vente.

**Gestion des evenements organisateur.** Lien: Web `/my-events`, Mobile `/spaces/organizer/[eventId]`, API `/api/organizer-events/[eventId]`. L'organisateur retrouve et gere ses evenements. C'est son tableau de bord de production.

**Edition d'evenement.** Lien: Mobile `/spaces/organizer/[eventId]/edit`, API `/api/organizer-events/[eventId]`. L'organisateur peut modifier les informations de son evenement. Cela permet de corriger une description, ajuster un horaire ou mettre a jour les details.

**Media d'evenement.** Lien: API `/api/organizer-events/media`, uploads media. Les images et videos d'evenement peuvent etre ajoutees. Elles ameliorent la presentation publique et la conversion.

**Annulation d'evenement.** Lien: API `/api/organizer-events/[eventId]/cancel`. Un organisateur peut annuler un evenement selon les regles. Le systeme peut ensuite gerer les impacts clients et paiements.

**Report d'evenement.** Lien: API `/api/organizer-events/[eventId]/postpone`. L'organisateur peut reporter une date. Cela garde l'historique et permet de communiquer un changement structure.

**Cycle de vie evenement.** Lien: serveur `organizerEventLifecycle.ts`. Cette brique encadre les etats d'un evenement: brouillon, publie, annule, reporte ou cloture. Elle evite les incoherences dans le produit.

**Statistiques evenement.** Lien: Web `/my-events/[id]/statistiques`, Mobile `/spaces/organizer/[eventId]/stats`, API `/api/organizer-events/[eventId]/stats`. L'organisateur peut suivre les ventes, l'interet, les reservations et l'activite. Cela transforme les donnees en decisions.

**Reservations et bookings.** Lien: Mobile `/spaces/organizer/[eventId]/bookings`, API `/api/organizer-events/[eventId]/bookings`. L'organisateur suit les bookings lies a l'evenement. Cela aide a gerer les inscriptions, prestataires ou demandes selon le contexte.

**Liste invitee.** Lien: Mobile `/spaces/organizer/[eventId]/guestlist`, API `/api/organizer-events/[eventId]/guestlist`. L'organisateur peut gerer une guestlist. C'est indispensable pour les invitations, VIP, presse ou partenaires.

**Codes promo.** Lien: Mobile `/spaces/organizer/[eventId]/promo-codes`, API `/api/organizer-events/[eventId]/promo-codes`, `/api/events/[eventId]/promo`. L'organisateur peut creer et gerer des codes promotionnels. Le public peut les appliquer lors de l'achat.

**Disponibilite de boost.** Lien: Mobile `/spaces/organizer/[eventId]/boost`, API `/api/organizer-events/[eventId]/boost-availability`. L'organisateur peut voir les possibilites de mise en avant. Cela soutient la monetisation et la promotion des evenements.

**Achat de boost.** Lien: Web `/boost-active`, API `/api/checkout/boost`, serveur `finalizeBoost.ts`. Le boost permet de mettre en avant un evenement. Le systeme gere le paiement, la disponibilite et l'activation.

**Staff d'evenement.** Lien: Mobile `/spaces/organizer/[eventId]/staff`, API `/api/organizer-events/[eventId]/staff`. L'organisateur ajoute ou retire les personnes qui travaillent sur l'evenement. Cela controle les acces terrain comme scanner ou ventes.

**Mes missions staff.** Lien: Web `/my-shifts`, Mobile `/my-shifts`, API `/api/my-staffed-events`. Une personne affectee a un evenement retrouve ses missions. Cela clarifie son role et ses acces.

**Profil organisateur.** Lien: Mobile `/spaces/organizer/profile`, API `/api/organizers/me`. L'organisateur gere sa presentation publique. Un bon profil augmente la confiance et la conversion.

**Medias organisateur.** Lien: API `/api/organizers/me/media`, `/api/organizers/me/media/[mediaId]`. L'organisateur peut ajouter ou supprimer des images de profil ou de galerie. Cela enrichit sa vitrine.

**Paiements organisateur.** Lien: Mobile `/spaces/organizer/payouts`, API `/api/organizers/me/payouts`, `/request`, `/connect`. L'organisateur suit et demande ses reversements. Cette fonctionnalite est centrale pour la confiance financiere.

**Moyens de paiement Mobile Money organisateur.** Lien: API `/api/organizers/me/payout-momos`. L'organisateur peut gerer ses coordonnees de paiement mobile. Cela adapte les reversements aux usages locaux.

**Vitrine publique organisateur.** Lien: API `/api/organizers`, `/api/organizers/[organizerId]/follow`. Les donnees organisateur alimentent la page publique, les listes et les suivis. Cela connecte l'espace professionnel a la visibilite publique.

## 11. Espace prestataire

**Espace prestataire.** Lien: Mobile `/spaces/provider`, Web `/offer-services`. Le prestataire dispose d'un espace pour gerer son profil, son offre et ses avis. Cela transforme la plateforme en reseau de services pour les evenements.

**Profil prestataire.** Lien: API `/api/providers/me`. Le prestataire modifie sa presentation, ses informations et sa visibilite. C'est la base de sa presence commerciale.

**Catalogue prestataire.** Lien: API `/api/providers/me/catalog`, `/api/providers/me/catalog/[itemId]`. Le prestataire peut creer et gerer ses offres. Cela permet de presenter clairement ce qu'il vend ou propose.

**Medias de catalogue.** Lien: API `/api/providers/me/catalog/[itemId]/media`. Chaque offre peut avoir des medias. Cela aide a vendre le service avec du concret.

**Medias prestataire.** Lien: API `/api/providers/me/media`. Le prestataire peut enrichir sa galerie ou son profil. Les images renforcent la credibilite.

**Avis prestataire cote public.** Lien: API `/api/providers/[providerId]/reviews`, Web fiche prestataire. Les visiteurs peuvent consulter les avis. Cela aide a choisir un prestataire.

**Avis recus prestataire.** Lien: Mobile `/spaces/provider-reviews`, API `/api/providers/me/reviews`. Le prestataire peut suivre les avis lies a son activite. Cela lui permet d'ameliorer son offre et de repondre si necessaire.

**Repondre a un avis.** Lien: API `/api/reviews/[reviewId]/reply`. Une reponse officielle peut etre ajoutee a un avis. Cela donne au prestataire ou a l'organisateur un droit de reponse public.

**Signaler un avis.** Lien: API `/api/reviews/[reviewId]/report`. Les avis abusifs peuvent etre signales. Cela protege la qualite de la plateforme.

**Moderation ou suppression d'avis.** Lien: API `/api/reviews/[reviewId]`, agent avis. Les avis peuvent etre moderes ou supprimes selon les droits. Cela garde un espace sain.

**Abonnement prestataire.** Lien: Mobile `/spaces/provider/subscription`, API `/api/subscriptions`, `/api/subscriptions/checkout`, `/api/subscriptions/checkout/fedapay`. Le prestataire peut gerer son abonnement ou payer son acces. Cela soutient un modele economique recurrent.

**Region de facturation prestataire.** Lien: API `/api/providers/me/billing-region`. Le prestataire peut indiquer sa region de facturation. Cela aide a adapter les paiements, taxes ou methodes locales.

**Categories prestataire.** Lien: Mobile `lib/providerCategories.ts`. Les prestataires sont classes par type de service. Cela rend l'annuaire plus lisible.

## 12. Espace agent et administration

**Tableau de bord agent.** Lien: Web `/agent`, Mobile `/spaces/agent`, API `/api/agent/dashboard`. L'agent a une vue d'ensemble des activites importantes: comptes, dossiers, evenements, paiements, signalements et alertes. C'est le poste de pilotage interne.

**Gestion des comptes.** Lien: Web `/agent/comptes`, Mobile `/spaces/agent/users`, `/spaces/agent/users/[id]`, API `/api/agent/users`. Les agents peuvent consulter et administrer les utilisateurs. Cela permet de resoudre les problemes de compte et de support.

**Detail utilisateur agent.** Lien: API `/api/agent/users/[id]`. L'agent peut consulter un compte precis. C'est utile pour verifier l'etat, les informations et les actions disponibles.

**Desactivation utilisateur.** Lien: API `/api/agent/users/[id]/disable`. L'equipe peut desactiver un compte si necessaire. Cela protege la plateforme contre les abus.

**Envoyer une verification email.** Lien: API `/api/agent/users/[id]/send-verification`, `/verify-email`. L'agent peut aider un utilisateur bloque par la verification. Cela reduit les frictions support.

**Forcer ou renvoyer une reinitialisation de mot de passe.** Lien: API `/api/agent/users/[id]/send-password-reset`. L'agent peut assister un utilisateur qui n'arrive plus a se connecter. C'est un outil de support rapide.

**Dossiers de candidature agent.** Lien: Web `/agent/dossiers`, API `/api/agent/applications`. Les agents voient les candidatures organisateur et prestataire. Ils peuvent suivre le pipeline de validation.

**Detail de dossier.** Lien: API `/api/agent/applications/[id]`. L'agent ouvre un dossier complet. Cela permet une decision fondee.

**Note sur dossier.** Lien: API `/api/agent/applications/[id]/note`. L'equipe peut ajouter des notes internes a un dossier. Cela garde l'historique de traitement.

**Moderation de dossier.** Lien: API `/api/agent/applications/[id]/moderate`. L'agent peut accepter, refuser ou demander une action sur une candidature. Cela transforme l'onboarding en workflow controle.

**Gestion des evenements agent.** Lien: Web `/agent/evenements`, Mobile `/spaces/agent/events`, API `/api/agent/events`. L'equipe peut surveiller les evenements de la plateforme. Elle voit ce qui est publie et peut intervenir.

**Annulation agent d'un evenement.** Lien: API `/api/agent/events/[id]/cancel`. L'equipe peut annuler un evenement si une decision interne l'exige. Cela donne un filet de securite operationnel.

**Gestion des paiements agent.** Lien: Web `/agent/paiements`, Mobile `/spaces/agent/payments`, API `/api/agent/payments/*`. L'equipe suit les remboursements, alertes et reversements. C'est la console finance de la plateforme.

**Alertes paiement.** Lien: API `/api/agent/payments/alerts`, `/alerts/[id]/resolve`. Les anomalies ou points a traiter remontent aux agents. Ils peuvent les marquer resolus apres action.

**Remboursements agent.** Lien: API `/api/agent/payments/refunds`, `/refunds/[id]/complete`. L'equipe peut piloter les remboursements. Cela donne un cadre clair a une operation sensible.

**Reversements agent.** Lien: API `/api/agent/payments/payouts`, `/mark-paid`, `/settle`. Les agents peuvent suivre, marquer paye ou solder des reversements. Cela evite une comptabilite floue.

**Payouts agent mobile.** Lien: Mobile `/spaces/agent/payouts`. Les agents peuvent suivre les reversements depuis le mobile. C'est utile pour les operations en mouvement.

**Signalements.** Lien: Web `/agent/signalements`, Mobile `/spaces/agent/moderation`, API `/api/agent/reports`, `/api/agent/reports/[id]/handle`. Les signalements utilisateurs sont centralises. L'equipe peut traiter les problemes de comportement, contenu ou securite.

**Moderation des avis.** Lien: Web `/agent/avis`, API `/api/agent/reviews`, `/api/agent/reviews/[id]/moderate`. Les agents peuvent verifier les avis signales ou sensibles. Cela maintient la qualite et la confiance.

**Demandes de suppression.** Lien: Web `/agent/suppressions`, Mobile `/spaces/agent/deletion-requests`, API `/api/agent/deletion-requests`. Les demandes de suppression de compte sont listees pour traitement. Cela soutient la conformite.

**Approuver une suppression.** Lien: API `/api/agent/deletion-requests/[id]/approve`. L'equipe peut valider une suppression de compte. Le systeme peut ensuite lancer la purge controlee.

**Refuser une suppression.** Lien: API `/api/agent/deletion-requests/[id]/reject`. Une demande peut etre refusee si elle ne remplit pas les conditions. Cela garde une trace de decision.

**Gestion homepage.** Lien: Mobile `/spaces/agent/homepage`, API `/api/agent/homepage-config`. Les agents peuvent configurer les mises en avant de la page d'accueil. Cela permet de piloter la vitrine sans redeploiement.

**Gestion des boosts agent.** Lien: Mobile `/spaces/agent/boosts`, API `/api/agent/boosts`. Les agents peuvent consulter ou administrer les boosts. Cela securise la partie promotionnelle.

**Actualite agent.** Lien: Web `/agent/actualite`. Cette page regroupe les contenus ou actualites internes/publics geres par l'equipe. Elle soutient la communication editee.

**Blog agent.** Lien: Web `/agent/blog`, API `/api/agent/blog`, `/api/agent/blog/[id]`, `/api/agent/blog/import-campaign`. L'equipe peut gerer les articles de blog et importer des campagnes. Cela donne un outil de contenu integre.

## 13. Paiements, reversements et automatisations financieres

**Finalisation de commande payee.** Lien: serveur `fulfillOrder.ts`. Quand un paiement est confirme, le systeme transforme la commande en billet ou droit d'acces. C'est la jonction critique entre argent encaisse et service livre.

**Finalisation de boost.** Lien: serveur `finalizeBoost.ts`. Quand un boost est paye, il est active selon les regles. Cela assure que la visibilite achetee devient effective.

**Mode de reglement vendeur.** Lien: serveur `sellerSettlementMode.ts`. Cette logique determine comment un vendeur ou agent doit etre regle. Elle rend les flux financiers plus fiables.

**Remboursements FedaPay.** Lien: serveur `fedapayRefunds.ts`. Le systeme peut gerer les remboursements via FedaPay. C'est important pour automatiser ou cadrer les retours d'argent.

**Cron reversements.** Lien: API `/api/cron/payouts`. Les reversements peuvent etre prepares ou verifies automatiquement. Cela reduit la charge manuelle de l'equipe finance.

**Cron abonnements.** Lien: API `/api/cron/subscriptions`. Les abonnements prestataires ou autres statuts recurrents peuvent etre controles automatiquement. Cela evite les droits actifs alors que le paiement ne suit plus.

**Webhooks paiement.** Lien: API `/api/webhooks/fedapay`, `/api/webhooks/stripe`. Les plateformes de paiement informent LIVE IN BLACK des changements de statut. Cela evite de dependre d'une validation manuelle.

**Controle de sante.** Lien: API `/api/health`. Cette route permet de verifier que le service repond. Elle est utile pour l'exploitation et la surveillance.

## 14. Contenus, medias et fichiers

**Signature d'upload media.** Lien: API `/api/uploads/media/sign`. Avant d'envoyer un media, le systeme genere les informations necessaires. Cela securise l'envoi d'images ou videos.

**Upload media public.** Lien: serveur `publicMediaUpload.ts`, Mobile `lib/publicMediaUpload.ts`. Les medias publics sont envoyes et geres de maniere controlee. Ils alimentent evenements, profils, catalogues et contenus.

**Cloudinary.** Lien: serveur `cloudinary.ts`, `cloudinaryLegacyUrl.ts`. Les images et medias sont relies a un service de stockage et transformation. Cela permet des visuels plus fiables et optimises.

**Livraison de fichiers mobile.** Lien: Mobile `lib/fileDelivery.ts`. L'application mobile peut telecharger ou ouvrir certains fichiers lies au compte ou aux dossiers. C'est utile pour les documents et preuves.

**Cache public.** Lien: serveur `publicCache.ts`, `cacheHeaders.ts`. Les pages publiques peuvent etre servies plus rapidement. Cela ameliore la performance pour les visiteurs.

**Limitation de frequence.** Lien: serveur `rateLimit.ts`. Certaines actions sont limitees pour eviter les abus. Cela protege les formulaires, connexions et endpoints sensibles.

**Permissions.** Lien: serveur `permissions.ts`. Les actions sont controlees selon le role et les droits. Cela evite qu'un utilisateur accede a des fonctionnalites qui ne lui appartiennent pas.

## 15. Mobile: navigation et espaces dedies

**Navigation mobile par onglets.** Lien: Mobile `/(tabs)/_layout`, `index`, `search`, `tickets`, `messages`, `profile`. L'application mobile organise l'experience autour de cinq entrees simples: accueil, recherche, billets, messages et profil. Cela rend l'usage quotidien tres direct.

**Ecran espaces.** Lien: Mobile `/spaces/index`. L'utilisateur peut choisir l'espace adapte a son role: organisateur, prestataire ou agent. C'est la passerelle entre usage client et usage professionnel.

**Espace agent mobile.** Lien: Mobile `/spaces/agent`, `/spaces/agent/[id]`. Les agents disposent d'un espace mobile pour consulter les modules internes. Cela rend l'administration accessible sans ordinateur.

**Espace organisateur mobile.** Lien: Mobile `/spaces/organizer`. L'organisateur gere ses evenements et son profil depuis son telephone. C'est essentiel pour des acteurs terrain.

**Espace prestataire mobile.** Lien: Mobile `/spaces/provider`. Le prestataire gere son offre depuis mobile. Cela reduit la barriere d'entree pour les professionnels.

**Ecran introuvable.** Lien: Mobile `/+not-found`. L'application gere les liens invalides avec un ecran dedie. Cela evite les blocages quand un lien est casse ou ancien.

**Layout global mobile.** Lien: Mobile `/_layout`. Le layout global organise les providers, la session et les transitions de l'app. Pour le client, cela se traduit par une experience coherente d'un ecran a l'autre.

## 16. Couverture des routes inspectees

Ce document couvre les pages publiques Web: accueil, a propos, contact, evenements, organisateurs, prestataires, blog, recherche, connexion, verification email, reinitialisation mot de passe, inscription organisateur, inscription prestataire, paiement reussi, pages legales, billet public, sitemap, opensearch et llms.txt.

Il couvre les pages connectees Web: profil, parametres, billets, evenements interesses, organisateurs suivis, notifications, messages, candidature, missions staff, evenements organisateur, statistiques, studio organisateur, playlist, scanner, ventes sur place, aide et tous les espaces agent visibles.

Il couvre les modules API: compte, authentification, profil, preferences, notifications, push, recherche, evenements, checkout, paiements Stripe et FedaPay, billets, invitations, revente, reservations de places, remboursements, commandes evenementielles, playlist, amis, utilisateurs, conversations, groupes, sondages, organisateurs, prestataires, candidatures, uploads, avis, abonnements, webhooks, cron jobs, agent, ventes agent et sante du service.

Il couvre les ecrans Mobile: accueil, recherche, billets, messages, profil, connexion, verification email, changement email, mot de passe oublie, pages legales, evenement, organisateur, prestataire, checkout standard, checkout revente, reservation de place, solde de reservation, billet/commande, conversations, parametres de conversation, amis, groupes, evenements interesses, organisateurs suivis, messages favoris, utilisateurs bloques, preferences, candidature, missions, scanner, vente agent, playlist, espaces organisateur, prestataire et agent.

## 17. Lecture simple pour le client

LIVE IN BLACK n'est pas seulement une application de billetterie. Le produit couvre la decouverte d'evenements, l'achat, le controle a l'entree, la revente, les remboursements, les messages, les groupes, les playlists, les commandes sur place, les espaces organisateurs, les espaces prestataires, l'administration interne, les paiements, les reversements, les candidatures, la moderation, les notifications et les automatisations. Le travail realise pose donc une plateforme complete: experience public, operations terrain, back-office, finance, contenu et mobile.
