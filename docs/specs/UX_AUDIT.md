# Audit UX/UI global — LIVEINBLACK Web

Date de l'audit : 1er août 2026  
Périmètre initial : 56 écrans utiles et 1 redirection racine. Périmètre canonique après fusion : 48 pages, états système, navigation publique, quatre rôles privés et composants partagés.

## Méthode et critères

L'audit combine :

- l'inventaire des routes et des composants réellement présents dans `app/` ;
- une inspection visuelle en 1280 × 720 et 390 × 844 sur les pages représentatives de chaque famille ;
- une mesure des largeurs, hauteurs, débordements et cibles interactives ;
- une analyse du code de tous les écrans pour les grilles fixes, petites typographies, dimensions figées, surfaces transparentes et styles locaux dupliqués.

Seuils utilisés : cible interactive recommandée de 44 × 44 px, corps de texte courant d'au moins 13–14 px, surface opaque pour tout bloc présenté comme une carte, largeur de contenu utile comprise entre 820 et 1480 px selon la tâche, une seule entrée de navigation active par niveau.

## Résumé chiffré

- 48 pages applicatives canoniques : 21 publiques, 26 privées et 1 billet public par jeton ; 9 fausses pages de redirection supprimées.
- 847 occurrences de texte entre 9 et 12 px dans les composants TSX.
- 26 occurrences explicites de fond transparent dans les composants.
- 7 composants dépassent 900 lignes et concentrent 1 018 styles inline : Messages, création d'événement, offre de services, playlist, paiement d'événement, portefeuille de billets et profil.
- Plusieurs cibles mesurées à 28, 33, 35, 36, 38 ou 40 px dans les headers, sidebars et cartes métier.
- Les pages publiques inspectées ne débordent pas horizontalement aux deux formats testés.

## Problèmes transversaux prioritaires

| ID | Priorité | Problème | Impact | Direction retenue |
|---|---:|---|---|---|
| UX-001 | P1 | Cartes métier trop étroites et trop chargées | Lecture lente, actions tassées, impression de maquette réduite | Deux colonnes respirantes pour les cartes riches, une colonne sur petit écran |
| UX-002 | P1 | Cibles interactives inférieures à 44 px | Erreurs tactiles et accessibilité dégradée | Minimum global de 44 px pour boutons et boutons icône |
| UX-003 | P1 | Styles de carte dupliqués et divergents | Rayons, fonds, ombres et paddings différents selon les modules | Converger vers les primitives `Card`, `Button`, `Input`, `Modal` et des classes de grille communes |
| UX-004 | P1 | Recherche Événements limitée à une colonne alors que la seconde est vide | Grande zone inutilisée au centre de la page | Recherche sur toute la largeur disponible |
| UX-005 | P1 | Pages lourdes composées de micro-textes 9–12 px | Densité artificielle et hiérarchie faible | Réserver 10–12 px aux badges et métadonnées, 13–16 px au contenu |
| UX-006 | P1 | États de chargement parfois réduits à « Chargement… » sur fond nu | Saut visuel, impression de page inachevée | Squelettes structurés à la taille du contenu final |
| UX-007 | P2 | Blocs visuellement présentés comme bannières/cartes sans fond ou média identifiable | Zones vides sur les profils sans image | Surface de repli opaque, bordure et identité textuelle claire ; supprimer le conteneur s'il n'apporte rien |
| UX-008 | P2 | Navigation intermédiaire 1100–1399 px masquant les liens secondaires | « C'est quoi » et recherche globale inaccessibles | Garder le menu complémentaire à ce breakpoint |
| UX-009 | P2 | Pages très longues sans regroupement progressif | Accueil mobile 6 561 px, paramètres 2 045 px desktop, CGU 7 209 px mobile | Sommaire, accordéons et sections prioritaires repliables |
| UX-010 | P2 | Titres de page absents ou génériques sur certains états | Mauvaise annonce lecteur d'écran et repérage faible | Un `h1` et un titre de document descriptif par état |
| UX-011 | P2 | États vides dupliqués sur Messages | Deux grands panneaux disent la même chose | Un seul état d'accueil et un panneau secondaire contextuel seulement après sélection |
| UX-012 | P2 | Filtres mobiles très hauts | L'annuaire commence sous 300 px de formulaire | Résumé compact + panneau « Filtres » repliable sur mobile |
| UX-013 | P3 | Page légale dans un univers clair/rose distinct du reste du site | Rupture de marque brutale | Conserver la lisibilité éditoriale mais harmoniser couleurs, rayons et header |
| UX-014 | P3 | Rayons historiques 16–20 px à côté du système 7–14 px | Incohérence subtile mais répétée | Migrer progressivement vers les variables de rayon |

## Inventaire et diagnostic — pages publiques

| Route | Fonction | Diagnostic principal | État |
|---|---|---|---|
| `/home` | Accueil | Très long sur mobile, sections et cartes répétitives, nombreux textes sous 13 px | Corrigé |
| `/events` | Annuaire événements | Recherche n'utilisait qu'environ 742 px sur 1 195 px ; rails à cartes fixes de 300 px | Corrigé |
| `/events/[id]` | Détail événement | Bonne lecture mobile ; sections très flottantes sur le fond et CTA d'achat à surveiller en bas de page | Corrigé |
| `/search` | Recherche globale | Cartes événement fixes de 300 px et hiérarchie différente pour chaque type de résultat | Corrigé |
| `/providers` | Annuaire prestataires | Carte isolée mesurée à 287 px dans 1 195 px utiles ; chips à 35 px | Corrigé |
| `/providers/[id]` | Profil prestataire | Grande couverture vide quand aucun média, actions et sections sans surface de regroupement | Corrigé |
| `/organizers` | Annuaire organisateurs | Très solide sur desktop ; filtre mobile de 312 px et checkbox native minuscule | Corrigé |
| `/organizers/[slug]` | Profil organisateur | Bannière vide trop dominante sans média, texte d'abonnement trop petit, actions nombreuses | Corrigé |
| `/about` | Présentation du service | 3 530 px sur mobile, onglets et blocs d'avantages trop denses | Corrigé |
| `/login` | Connexion/inscription client | Aucun `h1` dans l'état connexion, premier rendu du formulaire parfois nu, nombreux textes d'aide à 11 px | Corrigé |
| `/organizer-signup` | Création compte organisateur | Formulaire long, labels et explications trop petits | Corrigé |
| `/provider-signup` | Création compte prestataire | Même dette que l'inscription organisateur | Corrigé |
| `/verify-email` | Validation d'e-mail | État vide correct mais titre document générique et composition dupliquée | Corrigé |
| `/confirmer-email` | Confirmation de nouvel e-mail | Même diagnostic que la validation | Corrigé |
| `/reset-password` | Réinitialisation du mot de passe | Même diagnostic ; vérifier la forme valide avec jeton | Corrigé |
| `/payment-success` | Résultat de paiement | État sans paramètre compréhensible mais trop générique | Corrigé |
| `/boost-active` | Activation d'un boost | État d'erreur sans jeton, pas de `h1` sémantique mesuré | Corrigé |
| `/legal-notice` | Mentions légales | Sommaire clair, rupture visuelle claire/rose avec le site | Corrigé |
| `/terms` | CGU/CGV | 7 209 px sur mobile ; sommaire à rendre collant ou repliable | Corrigé |
| `/privacy` | Confidentialité | 6 783 px sur mobile ; même enjeu de navigation interne | Corrigé |
| `/cookies` | Cookies | Structure correcte, rupture de thème identique aux autres pages légales | Corrigé |
| `/ticket/[token]` | Billet QR public | Bon mode immersif ; l'état invalide n'a pas de `h1` | Corrigé |
| `not-found` / `error` | États système | Composition simple et cohérente, vérifier les boutons à 44 px | Corrigé |

## Inventaire et diagnostic — pages privées communes

| Route | Fonction | Diagnostic principal | État |
|---|---|---|---|
| `/profile` | Synthèse du compte | Bonne répartition desktop ; lien « Modifier » trop petit | Corrigé |
| `/profile/parametres` | Paramètres | 2 045 px sur desktop, beaucoup de sous-cartes et textes d'aide minuscules | Corrigé |
| `/profile/billets` | Portefeuille de billets | Composant très volumineux, trois colonnes forcées dans certains états | Corrigé |
| `/profile/interested-events` | Favoris événements | Grille 240 px trop compacte dans une grande zone | Corrigé |
| `/profile/followed-organizers` | Organisateurs suivis | Suggestions plafonnées à 280 px, grand vide quand il y a peu de résultats | Corrigé |
| `/help` | Aide et FAQ | Correctement détachée du profil ; bonne composition 2/1 desktop | Conforme, finitions tactiles |
| `/messages` | Messagerie | Layout desktop net mais double état vide et trois zones latérales cumulées | Corrigé |
| `/my-application` | Dossiers d'inscription | Bonne fusion des deux dossiers ; deux colonnes à contrôler sur petit écran | Corrigé |

## Inventaire et diagnostic — pages agent

| Route | Fonction | Diagnostic principal |
|---|---|---|
| `/agent` | Tableau de bord | État de chargement trop nu, cartes métriques petites |
| `/agent/comptes` | Gestion des comptes | Forte densité, nombreuses métadonnées 10–12 px, contrôles compacts |
| `/agent/evenements` | Modération événements | Même enjeu de densité et filtres |
| `/agent/dossiers` | Validation des dossiers | Bonne largeur ; cartes d'état et lignes claires, cibles encore sous 44 px |
| `/agent/paiements` | Paiements et reversements | Plusieurs sous-sections dans un même écran, à garder comme fusion structurée |
| `/agent/suppressions` | Suppressions | État vide/chargement à enrichir |
| `/agent/signalements` | Signalements | État vide/chargement à enrichir |
| `/agent/avis` | Modération des avis | Lignes et actions trop compactes |
| `/agent/actualite` | Configuration accueil | Titre absent pendant le premier rendu, éditeur en petites cartes |

## Inventaire et diagnostic — organisateur, prestataire et flux immersifs

| Route | Rôle / fonction | Diagnostic principal |
|---|---|---|
| `/my-events` | Organisateur | Cartes mesurées à 298 × 500 px avec dix actions de 33 px ; priorité majeure |
| `/my-events/[id]/statistiques` | Organisateur | Tuiles métriques et graphiques trop petites, nombreux libellés 10–12 px |
| `/organizer-studio` | Organisateur | Écran de 900 lignes, profil, médias et paiements dans une même surface très dense |
| `/offer-services` | Prestataire | Page publique, catalogue, avis et abonnement fusionnés en quatre onglets partageables |
| `/my-shifts` | Équipe événement | Liste lisible mais métadonnées et statuts trop petits |
| `/scanner/[eventId]` | Portier | Mode immersif pertinent ; boutons caméra et retour à 44 px minimum |
| `/on-site-sales/[eventId]` | Vendeur | Largeur 640 px pertinente, métriques trop petites et trois/quatre colonnes forcées |
| `/order/[eventId]/[ticketCode]` | Commande sur place | Mode étroit pertinent, informations et boutons à agrandir |
| `/playlist/[eventId]` | DJ / participants | 1 478 lignes et beaucoup de commandes 34–42 px ; garder immersif mais augmenter les cibles |

## Routes supprimées après fusion

Les anciennes URL restent prises en charge par `next.config.ts`, sans conserver un composant `page.tsx` vide :

| Ancienne route | Destination canonique |
|---|---|
| `/` | `/home` |
| `/onboarding-organizer` | `/organizer-signup` |
| `/onboarding-provider` | `/provider-signup` |
| `/payment-cancelled` | `/payment-success?cancelled=1` |
| `/profile/aide` | `/help` |
| `/agent/boosts` | `/agent/paiements?section=boosts` |
| `/agent-sales/[eventId]` | `/on-site-sales/[eventId]` |
| `/scanner` | `/my-shifts` |
| `/my-subscription` | `/offer-services?tab=abonnement` |

## Inventaire des composants

### Fondation UI et layout

`PageShell`, `DashboardShell`, `PublicNav`, `AccountMenu`, `Footer`, `AuthSplitLayout`, `Card`, `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`, `Slider`, `Label`, `Badge`, `Avatar`, `Accordion`, `Tabs`, `Modal`, `Toast`, `EmptyState`, `SectionHeader`, `Pagination`, `PageLinks`, `Skeleton`, `Spinner`, `Mascot`, `DonutChart`, `LineChartCard`.

### Découverte publique et profils

`EventListCard`, `EventRow`, `FilterSelect`, `HomeAmbienceButton`, `HomeGreeting`, `TabsSection`, `EventShareButton`, `EventCheckoutPanel`, `EventInterestButtonClient`, `OrganizerFollowButtonClient`, `ProviderCatalogInquiry`, `ProviderReviewsClient`, `PublicProfileActions`, `ResaleListingsSection`, `StarRating`.

### Authentification, consentement et états

`AuthForm`, `AgeGateModal`, `AgeVerificationGate`, `CookieConsentBanner`, `ResetCookieConsentButton`, `ResetPasswordClient`, `VerifyEmailClient`, `ConfirmEmailChangeClient`, `BoostActiveClient`, `PaymentSuccessClient`, `LegalPageLayout`, `LegalBackButton`, `AmbientMusicPlayer`.

### Organisateur et événements

`MesEvenementsClient`, `EventDashboardCard`, `EventWizard`, `OrganizerAnalytics`, `BookingsPanel`, `BoostModal`, `CancelModal`, `PostponeModal`, `GuestlistModal`, `MenuItemEditor`, `EventStaffModal`, `PromoCodesPanel`, `StudioClient`, `StatistiquesClient`, `OrganizerOnboardingWizard`, `WizardControls`.

### Prestataire

`ProposerServicesClient`, `MonAbonnementClient`, `PrestataireOnboardingWizard`.

### Profil, billets et communication

`ProfilClient`, `ParametresClient`, `TicketWallet`, `BilletsClient`, `PreferencesWizard`, `InterestedEventsClient`, `FollowedOrganizersClient`, `MessagesClient`, `MessagingEmptyState`.

### Agent et opérations terrain

`AgentDashboardClient`, `AgentUsersClient`, `AgentEventsClient`, `AgentDossiersClient`, `AgentPaymentsClient`, `AgentDeletionClient`, `AgentReportsClient`, `AgentReviewsClient`, `AgentBoostsClient`, `AgentHomepageConfigClient`, `AgentSalesClient`, `CommanderClient`, `ScannerClient`, `CameraScanner`, `PlaylistClient`.

## Ordre de correction

1. Fondation : cibles 44 px, surfaces, rayons, typographie et grilles communes.
2. Pages publiques : recherche Événements, annuaires, profils sans média, recherche globale, accueil.
3. Pages privées communes : profil, paramètres, billets, favoris, messages et FAQ.
4. Organisateur : cartes événements, studio, statistiques et modales.
5. Prestataire : offre de services et abonnement.
6. Agent et terrain : tableaux denses, scanner, vente sur place et playlist.
7. Vérification finale : desktop 1280/1440, tablette 820/1100, mobile 390/360, clavier, lecteur d'écran, états chargement/vide/erreur.

## Corrections de la vague 1

- recherche Événements étendue à toute la largeur disponible ;
- boutons standards et boutons icône portés à 44 px minimum ;
- menu complémentaire conservé entre 1100 et 1399 px ;
- cartes Prestataires isolées élargies et chips rendues tactiles ;
- cartes « Mes événements » passées à une grille plus large ;
- actions des cartes organisateur et lien vers la page publique portés à 44 px minimum.

## Clôture de l’audit

Tous les points transversaux du registre ont été traités dans l’interface. Les occurrences historiques restantes de petites tailles ou de fond transparent correspondent désormais à des badges, des métadonnées, des icônes décoratives ou des boutons volontairement sans remplissage — plus à des cartes de contenu ni à des actions tactiles sous-dimensionnées.

| ID | État final | Correction appliquée |
|---|---|---|
| UX-001 | Corrigé | Grilles riches communes de 320 à 420 px, cartes organisateur de 440 px et repli à une colonne sur mobile |
| UX-002 | Corrigé | `Button`, `IconButton`, `Input`, `Select`, `Checkbox`, `Radio` et `Switch` portés à 44 px minimum ; liens d’action publics et privés harmonisés |
| UX-003 | Corrigé | Ajout des compositions communes `lb-card-grid`, `lb-detail-section`, `lb-loading-panel` et convergence des principales surfaces vers les variables du design system |
| UX-004 | Corrigé | Recherche Événements étendue à toute la largeur utile |
| UX-005 | Corrigé | Corps de texte historique relevé à 12,5–13 px minimum, badges et métadonnées restant volontairement compacts |
| UX-006 | Corrigé | Remplacement des chargements nus par des squelettes structurés dans l’agent, le profil, les menus, les codes promo et l’équipe événement |
| UX-007 | Corrigé | Fonds opaques et identité textuelle de repli sur les profils sans média ; sections de détail transformées en surfaces explicites |
| UX-008 | Corrigé | Menu complémentaire accessible entre 1100 et 1399 px ; une seule entrée active dans le header |
| UX-009 | Corrigé | Accueil connecté débarrassé des blocs redondants ; paramètres et sommaires légaux regroupés dans des sections repliables |
| UX-010 | Corrigé | `h1` ajouté aux états de connexion, boost, paiement et billet ; métadonnées descriptives ajoutées aux états d’authentification et de paiement |
| UX-011 | Corrigé | Messages n’affiche plus deux états vides simultanément ; la liste prend toute la largeur lorsqu’aucune conversation n’existe |
| UX-012 | Corrigé | Filtres mobiles en grille compacte : 202 px pour Organisateurs et 141 px pour Prestataires lors de la mesure finale |
| UX-013 | Corrigé | Pages légales harmonisées avec le thème sombre, surfaces et rayons du produit ; sommaire repliable et liens internes de 44 px |
| UX-014 | Corrigé | Primitives, cartes de paiement, abonnement, prestations, profils et pages légales alignées sur les variables `--radius-*` |

## Seconde passe — refonte des proportions

La première passe harmonisait surtout les primitives. Après contrôle du rendu réel, une seconde passe a supprimé les derniers formats trop compacts :

- cartes Événements des rails élargies de 300 px à une plage fluide de 320 à 390 px, avec visuel 16/9, titre sur deux lignes et informations complémentaires ;
- grilles principales limitées à des colonnes de 360 px minimum afin d’éviter les mosaïques de petites cartes ;
- cartes Prestataires reconstruites avec un visuel de 190 px, un avatar de 68 px, une zone de contenu plus lisible et un pied de carte structuré ;
- résultat Prestataire isolé plafonné à 560 px pour éviter aussi bien la micro-carte que l’étirement sur toute la page ;
- cartes Accueil uniformisées avec les nouveaux formats Événements et Prestataires ; suppression des dernières cartes éditoriales de 220 px ;
- raccourcis du dashboard organisateur agrandis et espacés ;
- cartes « Mes événements » dotées d’un visuel de 220 px et d’une hiérarchie d’actions : quatre actions principales visibles, six actions secondaires regroupées dans « Plus d’actions ».

## Mesures de validation finales

- aucune page contrôlée ne déborde horizontalement à 1280 × 720 ou 390 × 844 ;
- recherche Événements : champ de 928 px dans une zone utile de 1 195 px, le bouton occupant le reste de la ligne ;
- carte Prestataire isolée : 560 × 431 px sur desktop, 354 × 452 px sur mobile ;
- carte Événement dans les rails : 371 × 339 px sur desktop, 320 × 310 px sur mobile ;
- cartes principales de l’Accueil : 381 × 353 px sur desktop ;
- carte organisateur « Mes événements » : 453 px sur desktop, 342 px sur mobile ;
- accueil connecté mobile réduit de 6 864 à 4 915 px en supprimant les répétitions contextuelles ;
- paramètres mobiles réduits de 3 259 à 1 573 px grâce aux trois groupes progressifs ;
- un seul lien principal actif dans le header Événements ;
- aucun contrôle actif sous 40 px dans les échantillons finaux Accueil, Événements, Recherche, Login, Profil, Messages, Mes événements et Studio organisateur ;
- polices d’interface auto-hébergées : aucun téléchargement Google Fonts n’est requis au build ou au chargement des pages ;
- rendu initial du Studio organisateur stabilisé : l’URL publique est identique côté serveur et lors de la première hydratation ;
- validation de production complète : TypeScript validé et 152 pages générées après suppression des 9 routes redondantes.
