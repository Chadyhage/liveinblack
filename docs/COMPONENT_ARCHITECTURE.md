# Architecture des composants

## Principes

- `app/components/ui` contient uniquement des primitives réutilisables et accessibles.
- `app/components/layout` contient les coquilles de page, navigation et structures communes.
- `app/components/features/<domaine>` expose les composants métier d’un domaine via un point d’entrée stable.
- Les pages orchestrent les données et la composition ; elles ne recréent pas les primitives UI.
- Les appels API et règles métier restent dans `lib/server` ou `lib/shared`.
- Les composants client gardent leur état local ; les fetchs suivent le pattern `useEffect` documenté.

## Domaines

- `events` : découverte, intérêt, checkout, revente et cartes événement.
- `profiles` : profils publics, suivi d’organisateurs et avis prestataires.
- `account` : profil privé, billets, préférences et notifications.
- `organizer` : événements, studio, staff, guestlist, promotions et statistiques.
- `provider` : catalogue, médias, demandes et abonnement.
- `agent` : modération, dossiers, paiements, boosts et rapports.
- `messaging` : conversations, réactions, sondages et pièces jointes.

## Conventions visuelles

- Utiliser les tokens de `app/globals.css`, jamais une nouvelle couleur arbitraire.
- Utiliser `Button`, `IconButton`, `Input`, `Select`, `Modal`, `Card`, `Badge` et `EmptyState` avant de créer un équivalent local.
- Utiliser Lucide pour les actions et la navigation ; les emojis restent réservés au contenu utilisateur ou aux produits événementiels.
- Chaque écran doit gérer ses états chargement, erreur, vide, succès et désactivé.
- Les actions icon-only portent toujours un nom accessible via `aria-label` et `title`.
- Les pages doivent conserver une largeur de lecture contrôlée et un espacement responsive.

## Refactorisation des gros écrans

Pour `MessagesClient`, `EventWizard`, `PlaylistClient`, `ProposerServicesClient`, `ProfilClient` et `ScannerClient`, extraire dans cet ordre :

1. types et constantes de présentation ;
2. sections visuelles sans état ;
3. contrôles interactifs ;
4. hooks et orchestration réseau ;
5. logique métier vers `lib/server` ou `lib/shared` si elle est réutilisable.

Les imports de domaine doivent passer par `app/components/features/<domaine>` afin de réduire les dépendances directes entre pages et composants.
