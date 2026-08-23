# LIVEINBLACK — Plan de test QA complet

> Document de test QA manuel couvrant l'intégralité des fonctionnalités de la plateforme LIVEINBLACK (LIB_Web), organisé par domaine fonctionnel. Chaque cas de test a été extrait de l'état réel du code (`app/`, `lib/server/`), croisé avec les 77 fichiers de tests automatisés existants (`lib/server/__tests__/`, `lib/shared/__tests__/`) pour éviter toute redondance — les cas ci-dessous couvrent en priorité **ce que les tests automatisés ne peuvent pas vérifier** : les vrais parcours UI de bout en bout, l'intégration réelle avec Stripe/FedaPay, le rendu visuel, la navigation, et les cas limites non encore couverts par la suite Vitest.
>
> **Convention des priorités** : Critique (bloquant business/sécurité/argent réel) · Haute · Moyenne · Basse.
>
> **Findings notables signalés dans ce document** (gaps produit/code identifiés en cours de rédaction, pas de simples suppositions) :
> - Remboursement d'un billet gratuit : aucun garde-fou dédié identifié (TICK-047).
> - "Remboursement acheteur invité via lien sécurisé" : aucune preuve de ce flux trouvée dans le code actuel (TICK-050) — à confirmer avec le produit.
> - Double appel d'annulation d'événement : la non-duplication de remboursement repose sur un contrat implicite entre fonctions, pas une vérification explicite (ORG-053).
> - Asymétrie `canCreateEvent` (bloque `pending`+`rejected`) vs `canProposeServices` (ne bloque que `rejected`) — à faire confirmer par le produit (ORG-123).
> - Absence de confirmation avant suppression complète d'un groupe de messagerie (section 3, MSG).
> - `prestStatus` non vérifié sur les routes réelles de création de catalogue prestataire (section 5).
> - Suppression d'événement en cascade ne nettoie pas les `Boost`/`BoostSlot`/médias liés (ORG-059).

---

## 1. Visiteur non connecté (public) + Authentification + Onboarding organisateur/prestataire

> **Périmètre couvert** : nav publique et état de session (`PublicNav.tsx`, `AccountMenu.tsx`), authentification (`AuthForm.tsx`, `/verify-email`, `/reset-password`, `/confirmer-email`), annuaires publics (`/events`, `/search`, `/organizers`, `/providers`), code d'accès événement privé (`AccessCodeForm.tsx`, `UnlockForm.tsx`), onboarding organisateur/prestataire (`OrganizerOnboardingWizard.tsx`, `PrestataireOnboardingWizard.tsx`), pages légales, bandeau cookies (`CookieConsentBanner.tsx`), guards de route (`proxy.ts`, `lib/server/permissions.ts`).
>
> **Note de méthode** : `lib/server/__tests__/permissions.test.ts` couvre déjà exhaustivement la logique pure de `canBook`/`canCreateEvent`/`canProposeServices`/`canAdminister` (y compris les cas `orgStatus`/`prestStatus` prioritaires sur le statut de compte global, et le cas organisateur-rejeté-ou-suspendu). `applications.integration.test.ts` / `applicationsAgent.integration.test.ts` / `applicationsPrestataire.integration.test.ts` couvrent déjà la validation de formulaire (SIRET/Luhn, alcool, champs requis), l'autosave de brouillon, le refus sans document d'identité, l'anti-doublon email, et le workflow de resoumission après rejet (`needs_changes` → `resubmitted`) côté serveur. **Les cas de test ci-dessous ne re-testent PAS cette logique métier** (déjà verte en CI) — ils valident le **parcours UI de bout en bout** : rendu des bons champs/étapes, appels réseau déclenchés par les bons boutons, affichage correct des erreurs retournées par l'API, et comportement visuel (spinners, bannières, drawer mobile) qu'aucun test Vitest ne peut vérifier.

### 1.1 Navigation publique & état de session

| ID | PUB-001 |
|---|---|
| **Titre** | Visiteur non connecté voit Connexion/Créer un compte, jamais de flash d'état connecté |
| **Priorité** | Critique |
| **Préconditions** | Aucune session (navigation privée ou cookies effacés) |
| **Étapes** | 1. Ouvrir `/home` en navigation privée. 2. Observer la nav pendant le chargement initial (avant hydratation) et juste après. 3. Recharger la page 3 fois de suite. |
| **Résultat attendu** | À aucun moment les boutons "Connexion" / "Créer un compte" ne sont remplacés par l'avatar/AccountMenu, même une fraction de seconde (`useSession()` status passe par `loading` → PublicNav n'affiche les boutons qu'à `status === 'unauthenticated'`, donc pas de flash de mauvais état, mais il faut vérifier qu'il n'y a pas non plus de flash vide anormalement long). |
| **Couverture auto existante** | Aucune — vérification manuelle uniquement (comportement `next-auth/react` côté client). |

| ID | PUB-002 |
|---|---|
| **Titre** | Sur `/login`, le bouton "Connexion" desktop n'est pas dupliqué |
| **Priorité** | Basse |
| **Préconditions** | Non connecté |
| **Étapes** | 1. Aller sur `/login`. 2. Observer la nav en haut. |
| **Résultat attendu** | `onLoginPage` (pathname === '/login') masque les boutons Connexion/Créer un compte desktop **et** le bouton mobile "Connexion" (`status === 'unauthenticated' && !onLoginPage`) — pas de bouton redondant avec le formulaire de la page. |
| **Couverture auto existante** | Aucune. |

| ID | PUB-003 |
|---|---|
| **Titre** | Utilisateur connecté voit AccountMenu (messages + compte), plus les boutons d'auth |
| **Priorité** | Critique |
| **Préconditions** | Compte client actif |
| **Étapes** | 1. Se connecter. 2. Revenir sur `/home`. 3. Observer la nav. |
| **Résultat attendu** | Les boutons Connexion/Créer un compte disparaissent, remplacés par l'icône messages (`MessageCircle`) + l'avatar (initiale ou photo). Aucun des deux jeux de boutons n'est visible simultanément. |
| **Couverture auto existante** | Aucune. |

| ID | PUB-004 |
|---|---|
| **Titre** | Badge de messages non lus s'affiche et se met à jour |
| **Priorité** | Moyenne |
| **Préconditions** | Compte avec au moins une conversation ayant des messages non lus |
| **Étapes** | 1. Se connecter avec un compte ayant ≥1 message non lu. 2. Observer le badge sur l'icône messages (coin haut-droit du bouton). 3. Cliquer sur l'icône. 4. Vérifier le nombre affiché (`9+` si >9). 5. Cliquer sur une conversation, revenir à `/home`. |
| **Résultat attendu** | Le badge affiche `totalUnread` (somme `unreadCount` de `/api/conversations`), plafonné à l'affichage `9+`. Le dropdown liste jusqu'à 5 conversations (nom = autre membre pour direct, `conv.name` pour groupe), triées par l'API. "Voir tout" mène à `/messages`. |
| **Couverture auto existante** | Aucune — logique d'agrégation `unreadCount` non testée ici (composant client pur). |

| ID | PUB-005 |
|---|---|
| **Titre** | Dropdown Messages / Compte : fermeture au clic extérieur et à Échap, un seul ouvert à la fois |
| **Priorité** | Moyenne |
| **Préconditions** | Connecté |
| **Étapes** | 1. Ouvrir le dropdown Messages. 2. Sans le fermer, cliquer sur l'icône Compte. 3. Vérifier qu'un seul dropdown est ouvert. 4. Cliquer en dehors des deux dropdowns. 5. Rouvrir Compte, presser Échap. |
| **Résultat attendu** | Ouvrir Compte ferme automatiquement Messages (et vice-versa, gérés par les `setX(false)` croisés). Clic extérieur (`mousedown` hors `rootRef`) ferme les deux. Échap ferme les deux. |
| **Couverture auto existante** | Aucune. |

| ID | PUB-006 |
|---|---|
| **Titre** | Lien "Espace organisateur/prestataire/agent" dans AccountMenu correspond au rôle actif |
| **Priorité** | Haute |
| **Préconditions** | Comptes de test avec `activeRole` = organisateur, prestataire, agent, et client |
| **Étapes** | 1. Se connecter successivement avec un compte de chaque rôle actif. 2. Ouvrir le menu Compte. 3. Vérifier la présence/absence et le libellé du lien dashboard. |
| **Résultat attendu** | `organisateur` → "Espace organisateur" (`/organizer-studio`) ; `prestataire` → "Espace prestataire" (`/offer-services`) ; `agent` → "Espace agent" (`/agent`) ; `client` → aucun lien dashboard supplémentaire (seulement Mon profil / Mes billets / Déconnexion). |
| **Couverture auto existante** | Aucune (le routage vers ces pages est protégé côté serveur par `proxy.ts`, testé indirectement ; le rendu conditionnel du lien ne l'est pas). |

| ID | PUB-007 |
|---|---|
| **Titre** | Déconnexion ramène à `/home` et restaure l'état visiteur |
| **Priorité** | Haute |
| **Préconditions** | Connecté |
| **Étapes** | 1. Ouvrir le menu Compte. 2. Cliquer "Déconnexion". |
| **Résultat attendu** | `signOut({ callbackUrl: '/home' })` redirige vers `/home`, la nav réaffiche Connexion/Créer un compte, aucune donnée de session résiduelle (retenter d'accéder à `/profile` doit rediriger vers `/login?next=/profile`). |
| **Couverture auto existante** | Aucune pour le flux UI ; le guard `/profile` post-déconnexion est couvert indirectement par la logique `proxy.ts` (pas de test dédié trouvé, mais logique triviale `!session`). |

| ID | PUB-008 |
|---|---|
| **Titre** | Tiroir mobile (hamburger) : ouverture, liens, fermeture à Échap et au resize |
| **Priorité** | Haute |
| **Préconditions** | Viewport < 1100px |
| **Étapes** | 1. Redimensionner à 375×812 (mobile). 2. Cliquer le bouton hamburger (icône devient croix, `aria-expanded="true"`). 3. Vérifier que les 7 liens (`Accueil, Événements, Prestataires, Organisateurs, C'est quoi, J'ai un code, Recherche`) sont listés dans le tiroir. 4. Cliquer un lien → le tiroir se ferme et navigue. 5. Rouvrir, presser Échap → se ferme. 6. Rouvrir, agrandir la fenêtre à >1100px sans interaction → le tiroir se ferme automatiquement (listener `matchMedia`). |
| **Résultat attendu** | Tous les comportements ci-dessus se produisent exactement comme décrits ; sous 720px, sans hamburger, on ne pourrait pas naviguer vers Prestataires/Organisateurs (`.lb-navlink { display:none }`), c'est justement le rôle du tiroir de pallier ça. |
| **Couverture auto existante** | Aucune. |

| ID | PUB-009 |
|---|---|
| **Titre** | Nav responsive : bouton "Connexion" mobile compact visible sous 1100px pour visiteur non connecté |
| **Priorité** | Moyenne |
| **Préconditions** | Non connecté, viewport < 1100px, hors `/login` |
| **Étapes** | 1. Redimensionner sous 1100px. 2. Vérifier la présence du bouton "Connexion" compact (`.lb-navlink-mobile`) à côté du hamburger. |
| **Résultat attendu** | Le bouton mobile "Connexion" est visible (accès direct sans devoir ouvrir le tiroir), le hamburger reste aussi accessible pour les autres liens. |
| **Couverture auto existante** | Aucune. |

### 1.2 Annuaires publics et recherche

| ID | PUB-010 |
|---|---|
| **Titre** | `/events` — rangées par catégorie, "À la une" (boost), "Ce soir" |
| **Priorité** | Haute |
| **Préconditions** | Au moins un événement boosté, un événement se déroulant ce soir, et des événements dans plusieurs des `KNOWN_CATEGORIES` (`Afrobeat, Amapiano, Zouk / Kompa, Hip-Hop, House, Live`) |
| **Étapes** | 1. Ouvrir `/events` sans requête. 2. Vérifier la rangée "À la une" (événements boostés). 3. Vérifier la rangée "Ce soir" (`isEventTonight`). 4. Vérifier une rangée par catégorie connue. 5. Vérifier "Plus d'événements" (catégorie non reconnue et non ce soir). |
| **Résultat attendu** | Chaque événement apparaît dans la/les rangée(s) pertinente(s) selon les règles de `CategoryRails` ; un événement boosté ET ce soir apparaît dans les deux rangées (pas de déduplication voulue entre "À la une" et "Ce soir"). |
| **Couverture auto existante** | Aucune — logique de tri/filtre pure exécutée côté serveur dans la page, pas testée unitairement ici. |

| ID | PUB-011 |
|---|---|
| **Titre** | Recherche texte sur `/events` (nom, ville, style, tags, artistes) |
| **Priorité** | Haute |
| **Préconditions** | Un événement avec un tag ou un artiste spécifique connu |
| **Étapes** | 1. Sur `/events`, saisir dans le champ de recherche une ville d'un événement connu, soumettre (GET). 2. Répéter avec un nom d'artiste. 3. Répéter avec une chaîne ne correspondant à rien. |
| **Résultat attendu** | Résultats filtrés correctement (accent/casse normalisés via `normalizeGeoText`) ; requête sans résultat affiche "Aucun résultat pour « … »" + lien "Voir tous les événements". |
| **Couverture auto existante** | Aucune. |

| ID | PUB-012 |
|---|---|
| **Titre** | Recommandations personnalisées visibles uniquement si connecté et préférences activées |
| **Priorité** | Moyenne |
| **Préconditions** | Compte client avec préférences de recommandation renseignées et `privacy.personalizedRecommendations !== false` |
| **Étapes** | 1. Visiter `/events` en anonyme → pas de rangée "Recommandé pour toi". 2. Se connecter avec un compte sans préférences → pas de rangée. 3. Se connecter avec un compte avec préférences/historique d'intérêt → rangée visible. 4. Désactiver `personalizedRecommendations` dans le profil et revisiter `/events` → rangée disparaît. |
| **Résultat attendu** | La rangée "Recommandé pour toi" apparaît seulement dans le cas 3, jamais en anonyme, jamais si `personalizedRecommendations === false`. |
| **Couverture auto existante** | Aucune. |

| ID | PUB-013 |
|---|---|
| **Titre** | Annuaire organisateurs `/organizers` — filtres région, "événement à venir", tri |
| **Priorité** | Haute |
| **Préconditions** | Plusieurs organisateurs publics dans différentes régions, certains avec un `nextEvent`, certains sans |
| **Étapes** | 1. Ouvrir `/organizers` sans filtre → vérifier tri "Plus populaires" par défaut. 2. Cocher "Événement à venir" → seuls les organisateurs avec `nextEvent` restent. 3. Choisir une région → seuls les organisateurs correspondants restent. 4. Changer le tri en "Plus récents". 5. Combiner recherche texte + région + upcoming. 6. Chercher un terme ne correspondant à rien → message d'absence de résultat + lien "Effacer les filtres". |
| **Résultat attendu** | Chaque filtre/tri se comporte comme décrit ; les filtres combinés sont cumulatifs (ET logique). |
| **Couverture auto existante** | Aucune. |

| ID | PUB-014 |
|---|---|
| **Titre** | Bouton "Suivre" organisateur — visiteur non connecté vs connecté |
| **Priorité** | Haute |
| **Préconditions** | Visiteur anonyme et compte client connecté, organisateur non-self |
| **Étapes** | 1. En anonyme, sur `/organizers`, cliquer "Suivre" sur une carte organisateur. 2. Se connecter, réessayer sur le même organisateur. 3. Vérifier qu'un organisateur ne voit pas son propre bouton "Suivre" sur sa propre carte (`isSelf`). |
| **Résultat attendu** | Anonyme : invitation à se connecter (pas d'action serveur silencieuse). Connecté : le suivi bascule et persiste. Un organisateur connecté ne voit pas le bouton Suivre sur sa propre carte. |
| **Couverture auto existante** | Aucune. |

| ID | PUB-015 |
|---|---|
| **Titre** | Annuaire prestataires `/providers` — filtres catégorie + région + recherche, compteurs |
| **Priorité** | Haute |
| **Préconditions** | Prestataires avec catégories variées, certains multi-catégories |
| **Étapes** | 1. Ouvrir `/providers` → vérifier le chip "Tous (N)" actif par défaut et les chips par catégorie avec compteur correct. 2. Cliquer un chip de catégorie → filtrage + URL mise à jour. 3. Combiner avec `q` et `region`. 4. Vérifier badge `+N` pour un prestataire multi-catégories. |
| **Résultat attendu** | Compteurs exacts, filtrage cumulatif correct, badge `+N` = `categories.length - 1`. |
| **Couverture auto existante** | Aucune. |

| ID | PUB-016 |
|---|---|
| **Titre** | CTA "Devenir prestataire" en bas de `/providers` mène au bon wizard |
| **Priorité** | Basse |
| **Étapes** | 1. Scroller en bas de `/providers`. 2. Cliquer "Devenir prestataire". |
| **Résultat attendu** | Redirection vers `/provider-signup`. |
| **Couverture auto existante** | Aucune. |

| ID | PUB-017 |
|---|---|
| **Titre** | Recherche globale `/search` — sans requête, avec résultats, sans résultat |
| **Priorité** | Haute |
| **Étapes** | 1. Ouvrir `/search` sans `q` → message d'invite. 2. Chercher un mot-clé présent dans un événement, un organisateur et un prestataire → 3 sections apparaissent, chacune limitée à 8 résultats. 3. Chercher un mot-clé sans correspondance → message d'absence + lien "Parcourir les événements". |
| **Résultat attendu** | Sections affichées uniquement si ≥1 résultat ; cap à 8 respecté. |
| **Couverture auto existante** | Aucune. |

### 1.3 Code d'accès événement privé

| ID | PUB-018 |
|---|---|
| **Titre** | Code d'accès valide sur `/events#access-code` déverrouille et redirige |
| **Priorité** | Critique |
| **Préconditions** | Un événement privé avec un code d'accès valide connu |
| **Étapes** | 1. Aller sur `/events`, cliquer "J'ai un code". 2. Saisir le code valide (auto-uppercase). 3. Cliquer "Ouvrir". |
| **Résultat attendu** | POST `/api/events/unlock` répond `ok`, redirection vers `/events/{eventId}`. |
| **Couverture auto existante** | Aucune. |

| ID | PUB-019 |
|---|---|
| **Titre** | Code d'accès invalide affiche une erreur claire |
| **Priorité** | Haute |
| **Étapes** | 1. Saisir un code aléatoire inexistant. 2. Soumettre. |
| **Résultat attendu** | Message "Code invalide ou déjà utilisé." affiché, champ passe en bordure invalide, pas de redirection. |
| **Couverture auto existante** | Aucune. |

| ID | PUB-020 |
|---|---|
| **Titre** | Rate limiting sur tentatives de code répétées (429) |
| **Priorité** | Haute |
| **Étapes** | 1. Soumettre rapidement de nombreux codes invalides successifs. |
| **Résultat attendu** | Après dépassement du seuil, "Trop de tentatives. Réessaie dans quelques minutes." |
| **Couverture auto existante** | Aucune pour le comportement UI. |

| ID | PUB-021 |
|---|---|
| **Titre** | Formulaire de déverrouillage sur la page détail d'un événement privé (`UnlockForm`) |
| **Priorité** | Haute |
| **Étapes** | 1. Accéder directement à `/events/[id]` d'un événement privé sans code. 2. Vérifier qu'`UnlockForm` s'affiche au lieu du contenu complet. 3. Code invalide → message d'erreur. 4. Code valide → `router.refresh()`, contenu débloqué. |
| **Résultat attendu** | Le contenu de l'événement privé n'est jamais visible avant déverrouillage réussi. |
| **Couverture auto existante** | Aucune. |

### 1.4 Connexion / Inscription (`AuthForm.tsx`)

| ID | AUTH-001 |
|---|---|
| **Titre** | Connexion réussie redirige vers `/profile` ou `?next=` |
| **Priorité** | Critique |
| **Étapes** | 1. Se connecter normalement. 2. Répéter en arrivant via `/login?next=/messages`. |
| **Résultat attendu** | Cas 1 : redirection vers `/profile`. Cas 2 : redirection vers `/messages` (`safeInternalPath` valide le paramètre, empêche un open-redirect externe). |
| **Couverture auto existante** | Aucune. |

| ID | AUTH-002 |
|---|---|
| **Titre** | Connexion échouée — mot de passe incorrect / email inconnu |
| **Priorité** | Critique |
| **Étapes** | 1. Email valide + mauvais mot de passe. 2. Email totalement inconnu. |
| **Résultat attendu** | Message générique unique "Email ou mot de passe incorrect." dans les deux cas (anti-énumération). |
| **Couverture auto existante** | Aucune. |

| ID | AUTH-003 |
|---|---|
| **Titre** | Connexion — validation champ vide / email malformé (avant appel réseau) |
| **Priorité** | Moyenne |
| **Étapes** | 1. Champs vides. 2. Email sans "@". |
| **Résultat attendu** | Messages client sans appel réseau. |
| **Couverture auto existante** | Aucune. |

| ID | AUTH-004 |
|---|---|
| **Titre** | Connexion — compte `pending` ou `rejected` (statut de compte) |
| **Priorité** | Haute |
| **Étapes** | 1. Se connecter avec un compte `pending`. 2. Se connecter avec un compte `rejected`. |
| **Résultat attendu** | Vérifier le comportement exact d'Auth.js Credentials configuré — connexion réussie mais accès bloqué ensuite par `proxy.ts`/`permissions.ts`, ou échec direct du login. Documenter le comportement observé s'il diffère de l'attendu. |
| **Couverture auto existante** | Le blocage post-connexion des actions est couvert par `permissions.test.ts`. |

| ID | AUTH-005 |
|---|---|
| **Titre** | Basculer entre onglets Connexion/Inscription réinitialise l'état |
| **Priorité** | Basse |
| **Étapes** | 1. Erreur de connexion. 2. Onglet "Inscription". 3. Retour "Connexion". |
| **Résultat attendu** | Aucune bannière d'erreur résiduelle après changement d'onglet. |
| **Couverture auto existante** | Aucune. |

| ID | AUTH-006 |
|---|---|
| **Titre** | Inscription — choix de rôle redirige organisateur/prestataire vers leur propre wizard |
| **Priorité** | Haute |
| **Étapes** | 1. Choisir "Organisateur". 2. Choisir "Prestataire". 3. Choisir "Client". |
| **Résultat attendu** | Organisateur → `/organizer-signup`. Prestataire → `/provider-signup`. Client → reste sur `AuthForm`, étape 2. |
| **Couverture auto existante** | Aucune. |

| ID | AUTH-007 |
|---|---|
| **Titre** | Inscription client — validations champ par champ |
| **Priorité** | Haute |
| **Étapes** | Tester prénom vide, nom vide, email invalide, téléphone mal formé, mot de passe faible, confirmation différente. |
| **Résultat attendu** | Message d'erreur exact par champ. |
| **Couverture auto existante** | Aucune pour le rendu. |

| ID | AUTH-008 |
|---|---|
| **Titre** | Inscription client — indicateur de force du mot de passe en temps réel |
| **Priorité** | Basse |
| **Étapes** | Taper des mots de passe de force croissante. |
| **Résultat attendu** | Barre de force et coches cohérentes. |
| **Couverture auto existante** | Aucune. |

| ID | AUTH-009 |
|---|---|
| **Titre** | Inscription — email déjà utilisé (409) et téléphone déjà utilisé |
| **Priorité** | Haute |
| **Étapes** | Utiliser un email/téléphone déjà associé à un compte actif. |
| **Résultat attendu** | Messages distincts "email déjà utilisé" / "téléphone déjà utilisé". |
| **Couverture auto existante** | Aucune pour l'UI. |

| ID | AUTH-010 |
|---|---|
| **Titre** | Inscription réussie — écran "Confirme ton inscription" + renvoi d'email |
| **Priorité** | Critique |
| **Étapes** | 1. Inscription réussie. 2. Renvoyer l'email de vérification. 3. Retenter immédiatement (cooldown 30s). 4. "Aller à la connexion". |
| **Résultat attendu** | Message générique constant (anti-énumération), cooldown 30s respecté, bascule en mode login avec email pré-rempli. |
| **Couverture auto existante** | Aucune. |

| ID | AUTH-011 |
|---|---|
| **Titre** | Mot de passe oublié — modale, validation, message anti-énumération |
| **Priorité** | Haute |
| **Étapes** | 1. Ouvrir la modale. 2. Email invalide. 3. Email valide (existant ou non). 4. Fermeture (3 méthodes). |
| **Résultat attendu** | Comportement identique que le compte existe ou non. |
| **Couverture auto existante** | Aucune. |

| ID | AUTH-012 |
|---|---|
| **Titre** | Réinitialisation de mot de passe — lien valide, expiré, absent |
| **Priorité** | Critique |
| **Étapes** | 1. Sans paramètres. 2. Token invalide/expiré. 3. Mot de passe non conforme. 4. Confirmation différente. 5. Mot de passe valide. |
| **Résultat attendu** | États `missing`/`invalid`/erreurs client/`success` conformes. |
| **Couverture auto existante** | Aucune. |

| ID | AUTH-013 |
|---|---|
| **Titre** | Vérification d'email — lien valide, expiré/invalide, absent |
| **Priorité** | Critique |
| **Étapes** | Reproduire les 4 combinaisons de paramètres. |
| **Résultat attendu** | États `missing`/`error`/`success` conformes. |
| **Couverture auto existante** | Aucune. |

| ID | AUTH-014 |
|---|---|
| **Titre** | Confirmation de changement d'email (`/confirmer-email`) — lien valide/expiré/absent |
| **Priorité** | Moyenne |
| **Étapes** | Reproduire les scénarios d'AUTH-013 pour ce flux. |
| **Résultat attendu** | Comportement structurellement identique, libellés adaptés. |
| **Couverture auto existante** | Aucune. |

### 1.5 Onboarding Organisateur (`/organizer-signup`, wizard 4 étapes)

| ID | ORG-001-onb |
|---|---|
| **Titre** | Wizard organisateur anonyme — navigation entre les 4 étapes et barre de progression |
| **Priorité** | Haute |
| **Étapes** | Naviguer entre "Établissement/Activité/Revenus/Documents" via Continuer/Retour. |
| **Résultat attendu** | Progression 25/50/75/100%, données persistées entre étapes. |
| **Couverture auto existante** | Validation de contenu couverte par `applications.integration.test.ts` ; navigation UI non couverte. |

| ID | ORG-002-onb |
|---|---|
| **Titre** | Étape 1 — case "Pas de lieu fixe" masque le champ adresse |
| **Priorité** | Moyenne |
| **Résultat attendu** | Champ adresse visible seulement si `noFixedAddress === false`. |
| **Couverture auto existante** | Aucune pour le rendu conditionnel. |

| ID | ORG-003-onb |
|---|---|
| **Titre** | Étape 1 (mode anonyme) — validation email/mot de passe du compte à créer |
| **Priorité** | Haute |
| **Résultat attendu** | Chaque erreur bloque le passage à l'étape 2. |
| **Couverture auto existante** | Aucune. |

| ID | ORG-004-onb |
|---|---|
| **Titre** | Étape 2 — bascule "Itinérant" (ville/pays/capacité vs zones d'activité) |
| **Priorité** | Moyenne |
| **Résultat attendu** | Bascule cohérente, attestation alcool visible seulement si coché. |
| **Couverture auto existante** | Règle "attestation obligatoire si alcool" testée côté serveur. |

| ID | ORG-005-onb |
|---|---|
| **Titre** | Étape 3 "Revenus" — écran informatif, aucune saisie bancaire demandée |
| **Priorité** | Basse |
| **Couverture auto existante** | Aucune. |

| ID | ORG-006-onb |
|---|---|
| **Titre** | Étape 4 — upload de documents, limites de fichiers, pièce d'identité obligatoire |
| **Priorité** | Critique |
| **Résultat attendu** | Limites 5/catégorie et 10/dossier respectées ; soumission bloquée sans pièce d'identité. |
| **Couverture auto existante** | Refus serveur "sans document d'identité" testé côté intégration. |

| ID | ORG-007-onb |
|---|---|
| **Titre** | Soumission anonyme réussie — écran de confirmation |
| **Priorité** | Critique |
| **Résultat attendu** | Écran "Demande envoyée", compte+candidature créés en un appel. |
| **Couverture auto existante** | Testé côté serveur. |

| ID | ORG-008-onb |
|---|---|
| **Titre** | Soumission anonyme — email déjà associé à un compte |
| **Priorité** | Haute |
| **Résultat attendu** | Message avec lien inline "se connecter". |
| **Couverture auto existante** | Testé côté serveur. |

| ID | ORG-009-onb |
|---|---|
| **Titre** | Wizard organisateur connecté — autosave de brouillon entre étapes |
| **Priorité** | Haute |
| **Résultat attendu** | Autosave à chaque étape, échec réseau non bloquant, brouillon restauré au rechargement. |
| **Couverture auto existante** | `getMyApplication`/`saveApplicationDraft` testés côté serveur. |

| ID | ORG-010-onb |
|---|---|
| **Titre** | Resoumission après rejet (`needs_changes`) — dossier organisateur |
| **Priorité** | Haute |
| **Résultat attendu** | Formulaire pré-rempli, statut → `resubmitted`. |
| **Couverture auto existante** | Testé côté serveur. |

| ID | ORG-011-onb |
|---|---|
| **Titre** | Un organisateur déjà actif candidatant comme prestataire ne perd pas son accès organisateur pendant la review |
| **Priorité** | Critique |
| **Résultat attendu** | Accès organisateur pleinement fonctionnel pendant la review du dossier prestataire. |
| **Couverture auto existante** | Testé directement côté serveur — régression documentée à ne jamais réintroduire. |

### 1.6 Onboarding Prestataire (`/provider-signup`, wizard 6 étapes)

| ID | PREST-001 |
|---|---|
| **Titre** | Wizard prestataire anonyme — 6 étapes, progression, libellés |
| **Priorité** | Haute |
| **Couverture auto existante** | Aucune pour la navigation UI. |

| ID | PREST-002 |
|---|---|
| **Titre** | Étape "Activités" — sélection multi-catégories fait apparaître/disparaître les sections spécifiques à l'étape "Détails" |
| **Priorité** | Haute |
| **Couverture auto existante** | Aucune (rendu conditionnel UI). |

| ID | PREST-003 |
|---|---|
| **Titre** | Champ "Nom de scène" conditionnel à la sélection "Artiste" |
| **Priorité** | Basse |
| **Couverture auto existante** | Aucune. |

| ID | PREST-004 |
|---|---|
| **Titre** | Étape "Détails" — tarification (devis uniquement vs tarif min/max/type) |
| **Priorité** | Moyenne |
| **Couverture auto existante** | `validatePrestataireStep2` testé en partie côté serveur. |

| ID | PREST-005 |
|---|---|
| **Titre** | Documents obligatoires dynamiques selon les catégories sélectionnées |
| **Priorité** | Critique |
| **Résultat attendu** | Liste dynamique conforme à `getRequiredDocs`, bouton bloqué tant que documents manquants. |
| **Couverture auto existante** | Aucune identifiée. |

| ID | PREST-006 |
|---|---|
| **Titre** | Étape "Finaliser" — prix d'abonnement affiché selon devise du pays (EUR vs XOF) |
| **Priorité** | Moyenne |
| **Couverture auto existante** | Aucune pour ce rendu. |

| ID | PREST-007 |
|---|---|
| **Titre** | Soumission anonyme réussie et cas email déjà utilisé |
| **Priorité** | Haute |
| **Couverture auto existante** | Couvert côté serveur par `applicationsPrestataire.integration.test.ts`. |

| ID | PREST-008 |
|---|---|
| **Titre** | Wizard prestataire connecté — autosave et resoumission après rejet |
| **Priorité** | Haute |
| **Couverture auto existante** | Logique serveur couverte. |

| ID | PREST-009 |
|---|---|
| **Titre** | Limites d'upload de documents (5/catégorie, 10/total) identiques au wizard organisateur |
| **Priorité** | Moyenne |
| **Couverture auto existante** | Aucune. |

### 1.7 Pages légales et bandeau cookies

| ID | LEGAL-001 |
|---|---|
| **Titre** | Pages `/about`, `/terms`, `/privacy`, `/cookies`, `/legal-notice` se rendent sans erreur |
| **Priorité** | Basse |
| **Couverture auto existante** | Aucune. |

| ID | LEGAL-002 |
|---|---|
| **Titre** | Bandeau cookies — apparition différée, choix "Tout accepter" persistant 6 mois |
| **Priorité** | Haute |
| **Résultat attendu** | Apparition après 800ms, ne recouvre pas les CTA du hero, persistance ~6 mois. |
| **Couverture auto existante** | Aucune pour le comportement visuel/timing. |

| ID | LEGAL-003 |
|---|---|
| **Titre** | Bandeau cookies — "Tout refuser" a un poids visuel égal à "Tout accepter" |
| **Priorité** | Moyenne |
| **Résultat attendu** | Boutons de poids équivalent, aucune fonctionnalité essentielle bloquée par le refus. |
| **Couverture auto existante** | Aucune. |

| ID | LEGAL-004 |
|---|---|
| **Titre** | Bandeau cookies — lien "En savoir plus" mène à `/cookies`, fermeture met à jour le layout |
| **Priorité** | Basse |
| **Couverture auto existante** | Aucune. |

### 1.8 Guards de route (défense en profondeur, vérification UX)

| ID | GUARD-001 |
|---|---|
| **Titre** | Accès direct à une route protégée sans session redirige vers `/login?next=...` |
| **Priorité** | Critique |
| **Étapes** | Tenter d'accéder sans session à `/profile`, `/messages`, `/my-shifts`, `/order`, `/my-application`, `/playlist`, `/my-events`, `/organizer-studio`, `/offer-services`, `/scanner/[eventId]` et `/agent`. |
| **Résultat attendu** | Chaque route redirige vers `/login?next={pathname}`. |
| **Couverture auto existante** | Aucune. |

| ID | GUARD-002 |
|---|---|
| **Titre** | `/my-events` — organisateur avec `orgStatus: 'pending'` redirigé vers `/my-application` |
| **Priorité** | Haute |
| **Couverture auto existante** | Aucune. |

| ID | GUARD-003 |
|---|---|
| **Titre** | Rôle actif incorrect redirige vers `/home` (pas d'accès croisé entre interfaces) |
| **Priorité** | Haute |
| **Résultat attendu** | Aucun accès croisé possible entre interfaces via navigation directe. |
| **Couverture auto existante** | Aucune pour `proxy.ts` lui-même. |


---

# 2. Compte Client — Billetterie, Portefeuille, Seat-Hold, Protection Annulation, Revente, Remboursements

## 2.1 Réservation simple (place unique)

### TICK-001 — Achat place simple par carte (Stripe/EUR), succès
**Priorité** : Critique
**Préconditions** : Compte client connecté, événement public actif non complet, devise EUR, au moins une place disponible avec prix > 0.
**Étapes** :
1. Ouvrir la page événement (`/events/[id]`), vérifier que le panneau de réservation (`EventCheckoutPanel`) s'affiche pour un utilisateur connecté.
2. Sélectionner une place non-groupe avec quantité 1.
3. Ajouter éventuellement un preorder (menu) proposé par l'organisateur.
4. Lancer le paiement — vérifier le libellé "Sécurisé · Stripe".
5. Compléter le paiement Stripe avec une carte de test valide.
6. Être redirigé vers la page de succès (`success_url` contenant `session_id`/`order_id`).
7. Ouvrir le portefeuille (`/profile` → wallet) et vérifier l'apparition du billet.
**Résultat attendu** : Commande passe à `paid`, un ticket est émis avec QR valide, le prix affiché = prix place + preorders + frais de service, l'assurance-annulation n'apparaît pas si non cochée.
**Couverture auto existante** : `orders.integration.test.ts` couvre la création/atomicité de la commande, le calcul des frais et le fulfillment ; ne couvre PAS l'UI ni le vrai round-trip Stripe Checkout.

### TICK-002 — Paiement Stripe échoué / abandonné
**Priorité** : Haute
**Étapes** : 1. Lancer une réservation et arriver sur Stripe Checkout. 2. Utiliser une carte de test refusée OU fermer l'onglet avant paiement. 3. Retourner via `cancel_url`. 4. Revérifier le stock et l'absence de ticket.
**Résultat attendu** : La commande n'est jamais marquée `paid` ; le stock décrémenté est restitué après expiration du TTL panier (30 min) ; aucun ticket créé.
**Couverture auto existante** : `orders.integration.test.ts` teste `releaseOrder` en logique ; le comportement réel Stripe non testé.

### TICK-003 — Achat place simple par Mobile Money (FedaPay/XOF), succès
**Priorité** : Critique
**Étapes** : 1. Vérifier bascule "Sécurisé · Mobile Money (FedaPay)". 2. Sélectionner place + quantité, lancer paiement. 3. Compléter paiement FedaPay. 4. Vérifier ticket après confirmation webhook.
**Résultat attendu** : Montant exact (entier XOF) demandé ; ticket émis uniquement après confirmation webhook ; désaccord de montant → rejet (`amount_mismatch`).
**Couverture auto existante** : `orders.integration.test.ts` teste le rejet FedaPay en cas de montant non respecté (mock).

### TICK-004 — Paiement FedaPay échoué
**Priorité** : Haute
**Étapes** : Simuler un échec (solde insuffisant / annulation opérateur).
**Résultat attendu** : Aucun ticket créé, place restituée, message d'erreur clair.
**Couverture auto existante** : Aucune (webhook réel non simulable en automatisé).

### TICK-005 — Tentative de paiement à 0 sans passer par le flux gratuit
**Priorité** : Moyenne
**Étapes** : Forcer un appel à `/api/checkout` avec un panier de total 0 hors flux `/free`.
**Résultat attendu** : 400 `nothing_to_pay`, commande libérée.
**Couverture auto existante** : Non testé à ce niveau route ; logique de fond couverte par `orders.integration.test.ts`.

## 2.2 Réservation groupe / table

### TICK-006 — Réservation d'une table/groupe (groupType='group')
**Priorité** : Critique
**Étapes** : 1. Sélectionner une place groupe — quantité verrouillée à 1. 2. Vérifier absence des boutons seat-hold pour cette place. 3. Compléter le paiement. 4. Vérifier dans le portefeuille que l'hôte voit tous les sièges.
**Résultat attendu** : Une commande unique crée N tickets liés, l'acheteur est `hostUid` de tous les sièges ; aucun bouton de blocage temporaire visible.
**Couverture auto existante** : `orders.integration.test.ts` (attribution preorder→ticket), `tickets.integration.test.ts` (visibilité hôte).

### TICK-007 — Invitation d'un membre du groupe et attribution de son propre QR
**Priorité** : Haute
**Étapes** : 1. Inviter un siège via email d'un ami. 2. L'invité accepte. 3. Vérifier que l'invité reçoit son propre QR. 4. Vérifier que l'ancien QR de l'hôte pour ce siège est invalidé.
**Résultat attendu** : Rotation `seatVersion`/`entryNonce` à l'acceptation — ancien lien QR de l'hôte invalide (`/ticket/[token]` → "Signature invalide"), nouveau token pour l'invité.
**Couverture auto existante** : `seatAssignment.integration.test.ts` couvre tout le flux invite/accept/decline/cancel/revoke.

### TICK-008 — Refus / révocation d'invitation de siège
**Priorité** : Moyenne
**Étapes** : 1. Refuser l'invitation. 2. Vérifier que le siège redevient disponible. 3. Révoquer un siège accepté et vérifier le retrait immédiat.
**Résultat attendu** : Refus/révocation restaure le siège avec rotation de QR.
**Couverture auto existante** : `seatAssignment.integration.test.ts`.

## 2.3 Billet gratuit

### TICK-009 — Réservation d'un billet gratuit (place unique, prix 0)
**Priorité** : Critique
**Étapes** : 1. Sélectionner la place gratuite — quantité verrouillée à 1. 2. Vérifier absence de la case "protection annulation". 3. Confirmer.
**Résultat attendu** : Ticket émis immédiatement sans redirection paiement, visible instantanément dans le portefeuille.
**Couverture auto existante** : `orders.integration.test.ts`/tests dédiés `freeCheckout`.

### TICK-010 — Tentative d'un 2e billet gratuit sur le même événement
**Priorité** : Haute
**Étapes** : Retenter une réservation gratuite sur le même événement.
**Résultat attendu** : Rejet `already_free` (409), même si `maxPerAccount` autoriserait plusieurs achats payants.
**Couverture auto existante** : Couvert par les tests serveur free-checkout.

### TICK-011 — Tentative de réservation d'une table gratuite
**Priorité** : Moyenne
**Résultat attendu** : Rejet explicite `free_table_not_supported`.
**Couverture auto existante** : Couvert par `freeCheckout.ts`.

## 2.4 Seat-Hold (blocage temporaire de place avec acompte)

### TICK-012 — Blocage court 24h (5%) en EUR — dépôt et complément
**Priorité** : Critique
**Étapes** : 1. "Bloquer 24h · +5%" (bornes 2€/20€). 2. Payer l'acompte Stripe. 3. Vérifier état "bloquée" avec compte à rebours ~24h. 4. Payer le solde avant expiration. 5. Vérifier ticket final = prix figé.
**Résultat attendu** : Acompte non remboursable en cas d'échec ultérieur ; prix figé au moment du blocage ; solde correctement calculé.
**Couverture auto existante** : `seatHolds.integration.test.ts` couvre le calcul exact du dépôt, activation, complétion, gel de prix.

### TICK-013 — Blocage long 72h (10%) en EUR, plafond à 40€
**Priorité** : Haute
**Étapes** : Sur une place à 500€, vérifier que le dépôt est plafonné à 40€ (pas 50€).
**Résultat attendu** : Dépôt = 40€, fenêtre 72h démarrée à l'activation.
**Couverture auto existante** : `seatHolds.integration.test.ts`.

### TICK-014 — Blocage temporaire en XOF (FedaPay)
**Priorité** : Haute
**Résultat attendu** : Montants entiers XOF, bornes 200/2000 (court) et 400/4000 (long) ; solde résiduel < 100 XOF → `amount_below_minimum`.
**Couverture auto existante** : Bornes couvertes par `seatHolds.integration.test.ts` ; seuil `MIN_XOF=100` à vérifier manuellement.

### TICK-015 — Expiration automatique d'un blocage non complété
**Priorité** : Critique
**Étapes** : 1. Ne pas payer le solde. 2. Attendre/déclencher le cron `releaseExpiredSeatHolds`. 3. Vérifier restock. 4. Vérifier statut "expiré". 5. Vérifier absence de remboursement de l'acompte.
**Résultat attendu** : Place restockée, statut `expired`, acompte acquis définitivement.
**Couverture auto existante** : `seatHolds.integration.test.ts`.

### TICK-016 — Tentative de paiement du solde après expiration ou par un autre compte
**Priorité** : Haute
**Résultat attendu** : Rejet `seat_hold_expired` (409) et `forbidden` (403) respectivement.
**Couverture auto existante** : `seatHolds.integration.test.ts`.

### TICK-017 — Blocage sur place groupe/table ou place gratuite (doit être impossible)
**Priorité** : Moyenne
**Résultat attendu** : Boutons absents dans l'UI ; rejet serveur explicite si contourné.
**Couverture auto existante** : `seatHolds.integration.test.ts`.

### TICK-018 — Blocage temporaire sur événement privé
**Priorité** : Basse
**Résultat attendu** : Rejet `private_event_not_supported`.
**Couverture auto existante** : Couvert côté logique.

## 2.5 Protection annulation (assurance-annulation)

### TICK-019 — Achat avec protection annulation activée
**Priorité** : Haute
**Étapes** : 1. Cocher la protection (aperçu 10%). 2. Payer. 3. Vérifier `cancellationProtectionPurchased = true`.
**Résultat attendu** : Frais recalculé et vérifié côté serveur (jamais fait confiance au calcul client).
**Couverture auto existante** : `orders.integration.test.ts`.

### TICK-020 — Effet de la protection : remboursement hors fenêtre / sans report d'événement
**Priorité** : Critique
**Résultat attendu** : Avec protection, remboursement accepté (bypass `not_eligible`) ; sans protection, rejet `not_eligible`.
**Couverture auto existante** : `clientRefunds.integration.test.ts`.

### TICK-021 — Protection annulation ne couvre PAS un billet déjà scanné
**Priorité** : Critique
**Résultat attendu** : Rejet `ticket_already_checked_in` malgré la protection.
**Couverture auto existante** : `clientRefunds.integration.test.ts`.

### TICK-022 — Protection annulation non proposée sur billet gratuit
**Priorité** : Basse
**Couverture auto existante** : Couvert côté logique serveur.

## 2.6 Portefeuille (wallet) — affichage et actions

### TICK-023 — Affichage du QR code d'un billet standard
**Priorité** : Critique
**Résultat attendu** : QR pointe vers `/ticket/[token]` signé, jamais le `ticketCode` brut en clair dans l'URL.
**Couverture auto existante** : Rendu visuel non testé automatiquement.

### TICK-024 — Affichage des billets de groupe/table dans le portefeuille (vue hôte)
**Priorité** : Haute
**Résultat attendu** : Vue complète de tous les sièges pour l'hôte, distincte de la vue membre invité.
**Couverture auto existante** : `tickets.integration.test.ts`, `groupTicketGuard.test.ts`.

### TICK-025 — Bouton "Demander un remboursement" — absence de confirmation
**Priorité** : Moyenne
**Résultat attendu** : Requête part immédiatement au clic sans modale de confirmation — point d'attention UX pour un parcours irréversible.
**Couverture auto existante** : Aucune.

### TICK-026 — Messages d'erreur de remboursement affichés dans le wallet
**Priorité** : Haute
**Résultat attendu** : Chaque code d'erreur (`refund_window_closed`, `ticket_already_checked_in`, `already_requested`, `not_eligible`) a un message localisé cohérent.
**Couverture auto existante** : Logique testée ; mapping copy UI non testé.

### TICK-027 — Billet sur événement annulé : QR désactivé visuellement
**Priorité** : Haute
**Résultat attendu** : QR grisé/désactivé, aucune action manuelle proposée (déjà traité automatiquement).
**Couverture auto existante** : Rendu visuel non couvert.

### TICK-028 — Partage "story" exclut le QR
**Priorité** : Basse
**Résultat attendu** : Image de partage sans QR (anti-fraude).
**Couverture auto existante** : Aucune.

## 2.7 Revente de billets

### TICK-029 — Mise en vente d'un billet payé (dans le plafond de prix)
**Priorité** : Critique
**Étapes** : 1. Saisir un prix ≤ prix d'achat. 2. Confirmer. 3. Vérifier invalidation immédiate de l'ancien QR. 4. Vérifier listing public sans identité vendeur.
**Résultat attendu** : QR invalidé instantanément à la mise en vente ; listing ne révèle jamais l'identité vendeur.
**Couverture auto existante** : `resale.integration.test.ts`.

### TICK-030 — Tentative de revente au-dessus du prix original (plafond)
**Priorité** : Haute
**Résultat attendu** : Rejet `price_above_original` (400), QR original reste valide.
**Couverture auto existante** : `resale.integration.test.ts`.

### TICK-031 — Tentative de revente d'un billet gratuit/guestlist/agent
**Priorité** : Haute
**Résultat attendu** : Bouton absent, ou rejet `not_resellable_source` (409) si tenté via API.
**Couverture auto existante** : `resale.integration.test.ts`.

### TICK-032 — Tentative de revente d'un billet déjà scanné
**Priorité** : Haute
**Couverture auto existante** : `resale.integration.test.ts`.

### TICK-033 — Revente au-delà de la limite de 2 reventes (resaleCount)
**Priorité** : Moyenne
**Résultat attendu** : Rejet `resale_limit_reached` (409).
**Couverture auto existante** : `resale.integration.test.ts`.

### TICK-034 — Fenêtre de revente fermée (moins de 2h avant les portes)
**Priorité** : Haute
**Résultat attendu** : Rejet `resale_window_closed`.
**Couverture auto existante** : `resale.integration.test.ts`.

### TICK-035 — Retrait d'une annonce de revente
**Priorité** : Haute
**Étapes** : 1. Retirer une annonce active. 2. Vérifier émission instantanée d'un nouveau QR. 3. Vérifier que l'ancien QR reste définitivement invalide.
**Résultat attendu** : Rotation de QR au retrait, ancien QR jamais réactivé.
**Couverture auto existante** : `resale.integration.test.ts`.

### TICK-036 — Retrait par un tiers (non-vendeur)
**Priorité** : Moyenne
**Résultat attendu** : Rejet, seul le vendeur peut retirer son annonce.
**Couverture auto existante** : `resale.integration.test.ts`.

### TICK-037 — Achat d'un billet revendu par un autre utilisateur
**Priorité** : Critique
**Étapes** : 1. Consulter les annonces (aucune identité vendeur affichée). 2. Acheter (Stripe/FedaPay selon devise). 3. Vérifier le billet dans le portefeuille acheteur. 4. Vérifier commande d'origine du vendeur = `superseded`. 5. Check-in avec le nouveau QR.
**Résultat attendu** : Aucune fuite d'identité vendeur ; réattribution du ticket (pas de nouveau ticket créé) ; QR tourné pour l'acheteur.
**Couverture auto existante** : `resale.integration.test.ts`.

### TICK-038 — Tentative d'achat de sa propre annonce de revente
**Priorité** : Basse
**Résultat attendu** : Rejet `cannot_buy_own_listing` (409).
**Couverture auto existante** : `resale.integration.test.ts`.

### TICK-039 — Revente de table/groupe (tous les sièges détenus par l'hôte)
**Priorité** : Moyenne
**Résultat attendu** : Revente atomique de tous les sièges ensemble.
**Couverture auto existante** : `resale.integration.test.ts`.

### TICK-040 — Revente de table refusée si un siège est déjà attribué à un invité
**Priorité** : Moyenne
**Résultat attendu** : Rejet `group_not_fully_held_by_host` (409).
**Couverture auto existante** : `resale.integration.test.ts`.

## 2.8 Remboursements

### TICK-041 — Remboursement automatique sur événement annulé (vérification post-fait)
**Priorité** : Critique
**Résultat attendu** : Remboursement déjà déclenché automatiquement ; tentative manuelle → `event_cancelled_auto_refunded` (409).
**Couverture auto existante** : `clientRefunds.integration.test.ts`.

### TICK-042 — Remboursement suite à report d'événement, demande dans la fenêtre
**Priorité** : Critique
**Résultat attendu** : Demande acceptée ; montant = prix place × sièges + preorders (hors frais de service et protection) ; FedaPay → `pending_manual`.
**Couverture auto existante** : `clientRefunds.integration.test.ts`/`eventRefunds.integration.test.ts`.

### TICK-043 — Demande de remboursement hors fenêtre de report
**Priorité** : Haute
**Résultat attendu** : Rejet `refund_window_closed` (409).
**Couverture auto existante** : `clientRefunds.integration.test.ts`.

### TICK-044 — Demande de remboursement sans report ni annulation ("pas de motif")
**Priorité** : Haute
**Résultat attendu** : Rejet `not_eligible` (409). **Point d'attention** : le code ne distingue pas actuellement "modification importante" vs "report" — à signaler au produit.
**Couverture auto existante** : `clientRefunds.integration.test.ts`.

### TICK-045 — Demande de remboursement sur billet déjà scanné (sans protection)
**Priorité** : Critique
**Résultat attendu** : Rejet `ticket_already_checked_in`, bloque tout le groupe.
**Couverture auto existante** : `clientRefunds.integration.test.ts`.

### TICK-046 — Double demande de remboursement (idempotence)
**Priorité** : Moyenne
**Résultat attendu** : Rejet `already_requested` (409) sauf échec technique transitoire.
**Couverture auto existante** : `clientRefunds.integration.test.ts`.

### TICK-047 — Demande de remboursement sur billet gratuit
**Priorité** : Haute
**Résultat attendu** : **Gap identifié** — aucun garde-fou dédié ; risque d'erreur technique brute affichée plutôt qu'un message métier clair. À tester en priorité.
**Couverture auto existante** : Aucune — lacune confirmée.

### TICK-048 — Demande de remboursement d'ordre non payé
**Priorité** : Basse
**Résultat attendu** : Rejet `order_not_paid` (409).
**Couverture auto existante** : `clientRefunds.integration.test.ts`.

### TICK-049 — Remboursement d'une commande payée par un autre utilisateur (ownership)
**Priorité** : Haute
**Résultat attendu** : Rejet `forbidden` (403).
**Couverture auto existante** : `clientRefunds.integration.test.ts`.

### TICK-050 — Remboursement d'un acheteur invité/sans compte via lien sécurisé
**Priorité** : Haute
**Résultat attendu** : **Aucune preuve de l'existence de ce flux trouvée dans le code exploré** (`clientRefunds.ts` exige une session authentifiée ; `/ticket/[token]/page.tsx` public en lecture mais sans action de remboursement). **Action requise avant test** : confirmer auprès de l'équipe produit si ce flux existe réellement et où.
**Couverture auto existante** : Aucune trouvée.

## 2.9 Événements privés — déverrouillage avant réservation

### TICK-051 — Déverrouillage d'un événement privé avec code d'accès valide
**Priorité** : Haute
**Résultat attendu** : Contenu totalement gated tant que non déverrouillé ; token vérifié côté serveur à chaque chargement et re-vérifié avant paiement.
**Couverture auto existante** : Aucune identifiée pour `eventUnlock.ts`.

### TICK-052 — Code d'accès invalide ou expiré
**Priorité** : Moyenne
**Résultat attendu** : Contenu masqué, message clair, pas de fuite d'information sur l'événement.
**Couverture auto existante** : Aucune.

### TICK-053 — Contournement du déverrouillage via appel direct à /api/checkout
**Priorité** : Critique
**Résultat attendu** : Rejet serveur — aucun achat possible sans déverrouillage valide, même en contournant l'UI.
**Couverture auto existante** : Logique H07/C01 mentionnée dans `orders.integration.test.ts`.


---

## 3. Compte Client — profil, préférences, messagerie, réseau social (follow/friends/avis)

Périmètre couvert par cette section : `app/(app)/profile/ProfilClient.tsx`, `PreferencesWizard.tsx`, `TicketWallet.tsx`, `app/(app)/profile/interested-events/InterestedEventsClient.tsx`, `app/(app)/profile/followed-organizers`, `app/components/OrganizerFollowButtonClient.tsx`, `ProviderCatalogInquiry.tsx`, `ProviderReviewsClient.tsx`, `lib/server/organizerFollows.ts`, `organizerFollowNotifications.ts`, `providerReviews.ts`, `friends.ts`, `app/(app)/messages/MessagesClient.tsx`, `app/(public)/_components/AccountMenu.tsx`, `lib/server/messaging.ts`, `polls.ts`, `groups.ts`.

Convention des IDs : `PRF-xxx` (profil/identité), `PRV-xxx` (préférences), `SOC-xxx` (follow/friends/avis), `MSG-xxx` (messagerie).

---

### 3.1 Profil — identité, avatar, démographie

#### PRF-001 — Changement de prénom/nom respecte le cooldown de 14 jours
**Priorité** : Critique
**Préconditions** : Compte client connecté, `nameChangedAt` du profil vieux de plus de 14 jours (ou `null`).
**Étapes** :
1. Aller sur `/profile` → « Paramètres du compte » → carte « Informations personnelles ».
2. Modifier le prénom et/ou le nom, cliquer « Enregistrer le nom ».
3. Revenir sur la carte immédiatement après succès.
4. Tenter de modifier à nouveau le prénom.
**Résultat attendu** : Étape 2 réussit, toast « Nom mis à jour », les deux champs deviennent grisés/désactivés (`disabled`), un message « Prochain changement possible le [date +14j] » s'affiche, et le bouton « Enregistrer le nom » reste désactivé même si on force la saisie (les `onChange` ignorent la frappe pendant `onCooldown`). Le nom affiché en haut de la page principale (`MainView`) reflète la mise à jour.
**Couverture auto existante** : `lib/server/__tests__/profile.integration.test.ts` (règle serveur `name_cooldown_active` / `nextChangeAllowedAt`).

#### PRF-002 — Tentative de renommage pendant le cooldown est bloquée serveur ET UI
**Priorité** : Haute
**Préconditions** : Compte avec `nameChangedAt` < 14 jours.
**Étapes** :
1. Charger `/profile?panel=settings`.
2. Observer les champs Prénom/Nom.
3. Appeler directement `POST /api/profil/nom` (ex. via devtools) en contournant l'UI désactivée.
**Résultat attendu** : UI — champs disabled dès le chargement (calculé via `useState` paresseux sur `Date.now() - nameChangedAt`), bouton désactivé, message de date affiché. Appel API direct — réponse `name_cooldown_active` avec `nextChangeAllowedAt`, message localisé en français avec la date formatée (`errorMessage()`), pas de mutation en base.
**Couverture auto existante** : `profile.integration.test.ts`.

#### PRF-003 — Recadrage et upload d'avatar (drag, zoom, boutons directionnels)
**Priorité** : Haute
**Préconditions** : Compte client connecté, avatar actuel absent ou présent.
**Étapes** :
1. Cliquer sur l'avatar rond (80×80) en haut de `/profile`.
2. Choisir une image (JPEG > 1000px).
3. Dans la modale de recadrage : glisser l'image (pointer down/move/up), utiliser les 4 flèches de repositionnement, ajuster le slider de zoom (1×–3×).
4. Cliquer « Valider ».
**Résultat attendu** : L'aperçu circulaire (192px) suit le drag et les flèches en temps réel. Après « Valider » : un canvas 300×300 circulaire est généré côté client (`toDataURL('image/jpeg', 0.88)`), l'avatar local est mis à jour de façon optimiste avec ce data-URI, puis `POST /api/profil/avatar` est appelé ; en cas de succès la véritable URL Cloudinary remplace le data-URI. Bouton passe en « Enregistrement… » pendant l'upload.
**Couverture auto existante** : aucune (logique 100% client canvas — pas de test d'intégration serveur ciblé identifié pour l'upload avatar spécifiquement ; vérifier `profile.integration.test.ts` pour la route seulement).

#### PRF-004 — Upload avatar avec image invalide / trop volumineuse
**Priorité** : Moyenne
**Préconditions** : Accès à un fichier non-image ou une image dépassant la taille max serveur.
**Étapes** :
1. Sélectionner un fichier via l'input `accept="image/*"` (si contournable) ou un data-URI corrompu.
2. Confirmer le crop.
**Résultat attendu** : Le serveur renvoie `invalid_data_uri` ou `file_too_large` ; l'UI doit afficher « Image invalide » / « Image trop volumineuse » (voir `ERROR_MESSAGES`). L'avatar affiché ne doit PAS rester bloqué sur le data-URI optimiste local si le serveur a rejeté — vérifier qu'un message d'erreur est bien remonté à l'utilisateur (actuellement `saveAvatar()` ne gère pas explicitement l'échec — `res.ok` false ne restaure pas l'avatar précédent : à vérifier comme régression potentielle, pas seulement documentation).
**Couverture auto existante** : aucune côté client identifiée ; vérifier `profile.integration.test.ts` pour la validation serveur des codes `invalid_data_uri`/`file_too_large`/`upload_failed`.

#### PRF-005 — Validation téléphone par indicatif pays
**Priorité** : Haute
**Préconditions** : Compte client, `regions` chargé (`lib/shared/regions`).
**Étapes** :
1. Dans « Informations personnelles », choisir un indicatif (ex. +228 Togo).
2. Saisir un numéro invalide pour ce pays (trop court / caractères non numériques).
3. Cliquer « Enregistrer le téléphone ».
4. Recommencer avec un numéro valide.
**Résultat attendu** : Numéro invalide → `invalid_phone` → message « Numéro de téléphone invalide pour ce pays ». Numéro valide → succès, le champ se resynchronise sur le numéro normalisé renvoyé par le serveur (`splitPhone(data.phone)` — le 0 initial est retiré côté serveur) et le bouton redevient désactivé (`phoneChanged` recalculé à `false`).
**Couverture auto existante** : `profile.integration.test.ts` (validation E.164/région côté `updatePhone`).

#### PRF-006 — Téléphone déjà utilisé par un autre compte actif
**Priorité** : Haute
**Préconditions** : Deux comptes clients actifs, numéro X déjà enregistré sur le compte A.
**Étapes** :
1. Depuis le compte B, saisir le même numéro X (même indicatif) et sauvegarder.
**Résultat attendu** : `phone_taken` → « Ce numéro de téléphone est déjà utilisé par un compte actif ». Le numéro du compte B n'est pas modifié.
**Couverture auto existante** : `profile.integration.test.ts`.

#### PRF-007 — Bug de faux-positif "modifié" sur le téléphone au chargement
**Priorité** : Moyenne (régression déjà corrigée à surveiller)
**Préconditions** : Compte dont le téléphone stocké contient un espace juste après l'indicatif (ex. `"+228 90 11 22 33"`).
**Étapes** :
1. Charger la carte Identité.
2. Ne rien modifier.
**Résultat attendu** : Le bouton « Enregistrer le téléphone » reste DÉSACTIVÉ au chargement (le `.trim()` de `splitPhone` doit annuler le faux diff dû à l'espace résiduel). Si le bouton est actif sans aucune saisie utilisateur, c'est une régression du correctif documenté en commentaire dans `ProfilClient.tsx` (`splitPhone`).
**Couverture auto existante** : aucune (comportement purement client, non couvert par les tests serveur).

#### PRF-008 — Année de naissance / genre optionnels, jamais utilisés comme contrôle d'âge
**Priorité** : Moyenne
**Préconditions** : Compte client sans `birthYear`/`gender` renseignés.
**Étapes** :
1. Renseigner une année de naissance (liste déroulante bornée `currentYear-13` à `currentYear-80`) et un genre.
2. Enregistrer.
3. Vérifier qu'aucun contrôle d'accès (âge minimum, gate 18+) n'est influencé par cette valeur ailleurs dans l'app.
**Résultat attendu** : Sauvegarde réussie, toast « Infos enregistrées ». Le texte d'aide confirme explicitement « jamais affiché sur ton profil, jamais utilisé comme contrôle d'âge » — vérifier qu'aucune fonctionnalité (AgeVerificationGate, etc.) ne lit ce champ.
**Couverture auto existante** : `profile.integration.test.ts` (validation `invalid_birth_year`/`invalid_gender`).

---

### 3.2 Confidentialité, export de données, suppression de compte

#### PRF-009 — Toggles de confidentialité (statut en ligne, avatar visible, confirmations de lecture, recommandations)
**Priorité** : Haute
**Préconditions** : Compte client connecté.
**Étapes** :
1. Ouvrir la carte « Confidentialité ».
2. Basculer chacun des 4 toggles un par un (`showOnline`, `showAvatar`, `readReceipts`, `personalizedRecommendations`).
**Résultat attendu** : Chaque toggle bascule visuellement de façon optimiste immédiatement, `POST /api/profil/confidentialite` est appelé avec `{ [key]: value }`. Désactiver `personalizedRecommendations` supprime également la clé `localStorage` `lib_reco_views_${user.id}` (best-effort, ne doit jamais planter en navigation privée). Aucun rollback UI en cas d'échec réseau (comportement volontaire, à ne pas rapporter comme bug).
**Résultat attendu (effet secondaire)** : `readReceipts` désactivé → vérifier dans une conversation active que les confirmations de lecture ne sont plus émises ET ne sont plus reçues des autres (symétrique, décrit dans le hint UI).
**Couverture auto existante** : aucune identifiée pour l'effet de bord des toggles sur la messagerie — vérifier manuellement en priorité.

#### PRF-010 — Export de mes données (RGPD art. 15/20)
**Priorité** : Haute
**Préconditions** : Compte client avec historique (billets, messages envoyés, amis, avis, événements suivis).
**Étapes** :
1. Carte « Mes données » → « Télécharger mes données ».
2. Observer le téléchargement.
**Résultat attendu** : `GET /api/profil/export` renvoie un blob JSON téléchargé automatiquement, nom de fichier dérivé de l'en-tête `Content-Disposition` (fallback `liveinblack-mes-donnees.json`). Toast « Téléchargement lancé. » puis disparition après 3s. Le contenu JSON doit inclure profil, billets, commandes, messages ENVOYÉS par l'utilisateur, amis, avis, événements suivis (vérifier avec `lib/server/dataExport.ts`, hors périmètre fichier mais référencé).
**Couverture auto existante** : non listée dans les fichiers de test fournis — à vérifier séparément (`app/api/profil/export/route.ts` + `lib/server/dataExport.ts`).

#### PRF-011 — Demande de suppression de compte (client simple vs organisateur/prestataire avec dossier validé)
**Priorité** : Critique
**Préconditions** : Deux profils — (a) client simple, (b) organisateur/prestataire avec dossier approuvé (`orgStatus`/`prestStatus` = active).
**Étapes** :
1. Zone de danger → « Supprimer mon compte » → confirmer avec mot de passe.
2. Cas (a) : observer le résultat.
3. Cas (b) : observer le résultat.
**Résultat attendu** : Cas (a) — suppression effective, `signOut({ redirect: false })` puis redirection `/home`. Cas (b) — réponse `{ pending: true }` : le compte RESTE actif et connecté, message « Demande de suppression envoyée… ta demande a été transmise à l'équipe LIVEINBLACK », PAS de déconnexion. Mot de passe incorrect → `invalid_password`, bouton confirmé reste actionnable après correction.
**Couverture auto existante** : `profile.integration.test.ts` (vérifier la branche `pending` pour comptes avec rôle approuvé).

#### PRF-012 — Suppression de compte : bouton de confirmation désactivé sans mot de passe
**Priorité** : Moyenne
**Étapes** : Ouvrir la modale de suppression, ne rien saisir dans le champ mot de passe.
**Résultat attendu** : Bouton « Supprimer » désactivé (`confirmDisabled={deleting || !password}`) tant qu'aucun mot de passe n'est saisi.
**Couverture auto existante** : aucune (UI pure).

#### PRF-013 — Changement d'e-mail : double confirmation (mot de passe + lien de vérification)
**Priorité** : Haute
**Étapes** :
1. Carte e-mail → saisir une nouvelle adresse identique à l'actuelle → soumettre.
2. Saisir une nouvelle adresse valide mais sans mot de passe → soumettre.
3. Saisir adresse + mot de passe corrects → soumettre.
4. Avec une demande en attente, cliquer « Annuler la demande ».
**Résultat attendu** : (1) `same_email` bloqué côté client avant tout appel réseau. (2) bloqué côté client (« Saisis ton mot de passe actuel »). (3) `pendingEmail` mis à jour, message avec l'adresse en attente affiché, formulaire remplacé par le bloc « Vérification en attente ». (4) `DELETE /api/profil/email` remet `pendingEmail` à `null`, formulaire de saisie réapparaît.
**Couverture auto existante** : `profile.integration.test.ts`.

---

### 3.3 Préférences (PreferencesWizard) — goûts musicaux et recommandations

#### PRV-001 — Parcours complet des 8 étapes du wizard
**Priorité** : Haute
**Préconditions** : Compte client sans préférences (`user.preferences` vide/null).
**Étapes** :
1. Depuis « Mes goûts — recommandations », cliquer « Renseigner mes goûts ».
2. Étape 1 (styles musicaux, multi) : sélectionner 2-3 chips.
3. Étape 2 (artistes, recherche) : voir ci-dessous PRV-002.
4. Étape 3 (types de soirées, multi).
5. Étape 4 (villes, recherche).
6. Étape 5 (budget, single) : sélectionner une option.
7. Étape 6 (ambiances, multi).
8. Étape 7 (fréquence, single).
9. Étape 8 (avec qui, single) → dernière étape.
**Résultat attendu** : La barre de progression avance (`(step+1)/8 * 100%`). Pour les étapes `single`, sélectionner une option déclenche automatiquement `persist()` + avance auto après 260ms (`goNext`/`setStep`) si ce n'est pas la dernière étape, sinon `setDone(true)`. Écran final « C'est noté ! » avec coche, préférences enregistrées et reflétées dans `summarizePreferences()` sur la page profil.
**Couverture auto existante** : aucune côté client (logique wizard pure) ; vérifier route `/api/profil/preferences` séparément.

#### PRV-002 — Recherche d'artiste via proxy Deezer avec repli local et ajout libre
**Priorité** : Haute
**Préconditions** : Connexion réseau disponible pour le proxy `/api/preferences/search?type=artists`.
**Étapes** :
1. À l'étape « Tes artistes & DJs », taper 2+ caractères d'un artiste connu (ex. « Burna »).
2. Observer les résultats distants (avec photo) fusionnés aux suggestions locales (`ARTIST_SUGGESTIONS`).
3. Sélectionner un résultat.
4. Taper un nom qui ne matche AUCUNE suggestion locale ni résultat distant, appuyer sur Entrée ou cliquer « + Ajouter « … » ».
5. Couper la connexion réseau (ou simuler une erreur du proxy) et refaire une recherche.
6. Atteindre la limite de 15 artistes (`max=15`).
**Résultat attendu** : Étape 2 — debounce de 300ms (0ms si <2 caractères), résultats distants et locaux dédupliqués par nom normalisé (NFD, minuscule), max 8 affichés. Étape 3 — chip ajoutée avec sa photo (si dispo) au tableau de tags au-dessus du champ ; `artistPhotos` mis à jour. Étape 4 — ajout libre autorisé si `canAddCustom` (2+ caractères, pas de match exact, sous la limite). Étape 5 — en cas d'échec réseau, `remote` retombe à `[]` silencieusement (catch), les correspondances LOCALES restent utilisables (repli). Étape 6 — input désactivé (`disabled={value.length >= max}`) au-delà de 15.
**Couverture auto existante** : aucune identifiée (dépend d'un proxy externe Deezer/Photon, non testé en intégration ici).

#### PRV-003 — Résumé des préférences tronqué avec compteur "+N"
**Priorité** : Basse
**Préconditions** : Compte avec plus de 10 tags cumulés (styles + artistes + types + villes + budget + ambiances).
**Étapes** : Retourner sur la carte « Mes goûts » après avoir sauvegardé plus de 10 éléments cumulés.
**Résultat attendu** : Seuls les 10 premiers tags (`shown = tags.slice(0, 10)`) sont affichés, un badge `+N` (overflow) apparaît pour le reste. `frequency` et `groupPref` ne sont volontairement PAS inclus dans `summarizePreferences()` — vérifier que ce n'est pas une régression (ils ne devraient jamais apparaître dans les tags résumés).
**Couverture auto existante** : aucune.

#### PRV-004 — Modifier des préférences existantes préremplit le wizard
**Priorité** : Moyenne
**Préconditions** : Compte avec préférences déjà enregistrées.
**Étapes** : Cliquer « Modifier mes goûts », naviguer en arrière/avant entre les étapes.
**Résultat attendu** : Chaque étape est préremplie avec les valeurs existantes (`{ ...EMPTY_PREFERENCES, ...initialPreferences }`). Le bouton précédent (‹) fonctionne sans perte de sélection sur les étapes déjà visitées dans la session en cours.
**Couverture auto existante** : aucune.

---

### 3.4 Suivi d'organisateurs (follow), événements intéressés

#### SOC-001 — S'abonner à un organisateur connecté
**Priorité** : Haute
**Préconditions** : Compte client connecté, profil organisateur public (status `public`), pas déjà abonné.
**Étapes** :
1. Sur une page publique organisateur, cliquer « S'abonner ».
**Résultat attendu** : `POST /api/organizers/:id/follow` → bouton bascule en « Abonné(e) » (pastille verte), `alreadyFollowing` géré côté serveur comme idempotent (double-clic rapide ne crée pas 2 abonnements — index unique {userId, organizerId}). `OrganizerProfile.followersCount` incrémenté de 1 exactement une fois même en cas de double appel concurrent.
**Couverture auto existante** : `organizerFollows.integration.test.ts`.

#### SOC-002 — Se désabonner via le menu contextuel
**Priorité** : Haute
**Étapes** :
1. Sur un organisateur déjà suivi, cliquer le bouton « Abonné(e) » pour ouvrir le menu.
2. Cliquer « Se désabonner ».
3. Cliquer en dehors du menu ou Échap pour vérifier la fermeture sans action.
**Résultat attendu** : `DELETE /api/organizers/:id/follow`, bouton repasse à « S'abonner », `followersCount` décrémenté sans jamais passer sous 0 (clampé serveur via pipeline `$max`). Clic extérieur/Échap ferme le menu sans appel réseau.
**Couverture auto existante** : `organizerFollows.integration.test.ts`.

#### SOC-003 — Tentative de follow non authentifié redirige vers /login
**Priorité** : Moyenne
**Préconditions** : Utilisateur non connecté sur une page organisateur publique.
**Étapes** : Cliquer « S'abonner ».
**Résultat attendu** : Redirection `/login?next=<pathname_actuel>`, aucun appel `/follow` déclenché.
**Couverture auto existante** : aucune (comportement client pur).

#### SOC-004 — Impossible de se suivre soi-même / suivre un profil non-public
**Priorité** : Haute
**Préconditions** : Compte organisateur A essayant de se suivre lui-même ; profil organisateur B en statut `draft`/`pending_review`/`hidden`/`suspended`.
**Étapes** : Appeler `followOrganizer` (ou via UI si exposé) sur son propre `organizerId` ; puis sur un organizerId non-public.
**Résultat attendu** : `cannot_follow_self` (400) pour le premier cas. `organizer_not_found` (404, générique — pas de distinction avec "n'existe pas du tout", pour ne pas fuiter le statut de modération) pour le second cas.
**Couverture auto existante** : `organizerFollows.integration.test.ts`.

#### SOC-005 — Réglages d'alertes par organisateur suivi (page « Organisateurs suivis »)
**Priorité** : Moyenne
**Préconditions** : Au moins un organisateur suivi.
**Étapes** :
1. Aller sur `/profile/followed-organizers`.
2. Désactiver la bascule maîtresse `notificationsEnabled`.
3. Réactiver, puis désactiver spécifiquement une alerte fine (ex. `newEvent`) en laissant la maîtresse active.
**Résultat attendu** : `PATCH` (route sous-jacente d'`updateFollowAlerts`) — les DEUX conditions (`notificationsEnabled` ET `alerts.<type>`) doivent être vraies pour qu'un e-mail parte (voir `organizerFollowNotifications.ts:fanOutToFollowers`). Couper la maîtresse doit couper TOUTES les alertes même si les alertes fines individuelles restent à `true` en base.
**Couverture auto existante** : `organizerFollows.integration.test.ts`.

#### SOC-006 — E-mail de notification "nouvel événement" envoyé aux abonnés avec l'alerte active
**Priorité** : Haute
**Préconditions** : Organisateur avec 2 abonnés — l'un avec `alerts.newEvent=true` + `notificationsEnabled=true`, l'autre avec `alerts.newEvent=false`.
**Étapes** : L'organisateur publie un nouvel événement public (déclenchement supposé géré par `organizerEvents.ts`, hors périmètre fichier direct mais appelant `notifyNewEvent`).
**Résultat attendu** : Seul le premier abonné reçoit l'e-mail (`organizerNewEventEmail`). Le second, avec l'alerte désactivée, n'en reçoit aucun. `matched`/`sent` reflètent ce sous-ensemble.
**Couverture auto existante** : à vérifier — non listé explicitement dans les fichiers fournis, mais `organizerFollows.integration.test.ts` peut couvrir des scénarios adjacents ; tester en E2E manuel si aucun test d'intégration email dédié n'existe.

#### SOC-007 — Alertes `ticketing`, `almostFull`, `newMedia`, `importantAnnouncements` : non câblées (documentation à valider, pas un bug)
**Priorité** : Basse
**Étapes** : Activer chacune de ces 4 préférences puis déclencher l'événement correspondant côté organisateur (ouverture billetterie, franchissement 85% de remplissage, upload media, annonce).
**Résultat attendu** : Aucun e-mail n'est envoyé pour ces 4 types — comportement DOCUMENTÉ et volontaire dans `organizerFollowNotifications.ts` (gap explicitement noté, hors périmètre de la phase actuelle). Ne pas remonter comme bug sans confirmer d'abord qu'aucun ticket de suivi n'existe déjà pour ces alertes.
**Couverture auto existante** : sans objet (comportement non implémenté par design).

#### SOC-008 — Toggle "Intéressé" sur un événement et retrait de la liste
**Priorité** : Haute
**Préconditions** : Compte client, au moins un événement marqué intéressé.
**Étapes** :
1. Sur `/profile/interested-events`, repérer un événement de la section « À venir ».
2. Cliquer le bouton flottant d'intérêt (compact) en haut à droite de la carte pour désactiver l'intérêt.
**Résultat attendu** : `EventInterestButtonClient` bascule, `onChange(false)` appelle `remove(eventId)` local, la carte disparaît immédiatement de la grille sans re-fetch complet de la page. Le compteur de section (« À venir N ») se met à jour.
**Couverture auto existante** : non listé explicitement — vérifier tests d'intégration liés à `EventInterestButtonClient`/interest.

#### SOC-009 — Événements intéressés passés/indisponibles affichés dans une section distincte
**Priorité** : Moyenne
**Préconditions** : Un événement intéressé déjà terminé (`isEventEnded`) et un autre supprimé/introuvable (`item.event === null`).
**Étapes** : Charger `/profile/interested-events`.
**Résultat attendu** : Les deux cas apparaissent dans la section « Passés ou indisponibles », opacité réduite (0.72), badge « Indisponible » visible uniquement si `inactive` est vrai côté carte avec événement encore présent (badge posé sur la partie image). Cliquer une carte sans `event` (supprimé) ne doit PAS naviguer (pas de `<Link>`, `cursor: default`).
**Couverture auto existante** : aucune identifiée.

---

### 3.5 Avis prestataires (reviews) et demande de service (catalogue → messagerie)

#### SOC-010 — Laisser un premier avis sur un prestataire
**Priorité** : Critique
**Préconditions** : Compte client connecté, jamais laissé d'avis sur ce prestataire, `isSelf=false`.
**Étapes** :
1. Sur la page publique prestataire, cliquer « Laisser un avis ».
2. Sans sélectionner de note, cliquer « Publier mon avis ».
3. Sélectionner 4 étoiles, saisir un commentaire de moins de `REVIEW_COMMENT_MIN` caractères, publier.
4. Sélectionner 4 étoiles, saisir un commentaire valide, publier.
**Résultat attendu** : (2) erreur « Choisis une note de 1 à 5 étoiles. », pas d'appel réseau. (3) erreur « Ton commentaire doit faire au moins N caractères. ». (4) `POST /api/reviews` réussit, l'avis apparaît en tête de liste (`[review, ...current]`), moyenne et distribution des notes recalculées, formulaire fermé.
**Couverture auto existante** : `providerReviews.integration.test.ts` (validation rating/longueur, calcul moyenne).

#### SOC-011 — Impossible de laisser un avis sur soi-même
**Priorité** : Haute
**Préconditions** : Compte prestataire consultant sa PROPRE page publique.
**Étapes** : Vérifier la présence/absence du bouton « Laisser un avis ».
**Résultat attendu** : `isSelf=true` masque le bouton côté UI. Si contourné (appel direct API), serveur renvoie `cannot_review_self` (403).
**Couverture auto existante** : `providerReviews.integration.test.ts`.

#### SOC-012 — Modifier son propre avis existant (pas de duplication)
**Priorité** : Haute
**Préconditions** : Un avis publié existe déjà pour ce couple (auteur, prestataire).
**Étapes** :
1. Cliquer « Modifier mon avis », changer la note et le texte.
2. Publier.
**Résultat attendu** : Même document `Review` mis à jour (`existing.edited = true` si c'était déjà publié), pas de second avis créé dans la liste, badge « · modifié » affiché à côté de la date. `ratingAvg`/`ratingCount` du prestataire recalculés.
**Couverture auto existante** : `providerReviews.integration.test.ts`.

#### SOC-013 — Un avis masqué par la modération ne peut pas être "réédité proprement"
**Priorité** : Haute
**Préconditions** : Un avis de l'utilisateur a été masqué (`status: 'hidden'`, ex. via auto-hide à 3 signalements ou modération agent).
**Étapes** : Tenter de rouvrir « Modifier mon avis » et publier une nouvelle version.
**Résultat attendu** : `review_hidden` (403) — l'auteur ne peut PAS réutiliser l'édition pour faire disparaître le masquage. Le bouton « Modifier »/« Laisser un avis » ne doit pas donner l'illusion que republier lève le masquage.
**Couverture auto existante** : `providerReviews.integration.test.ts`.

#### SOC-014 — Retirer son propre avis
**Priorité** : Moyenne
**Étapes** : Cliquer « Retirer » sur son propre avis → confirmer dans la feuille de confirmation.
**Résultat attendu** : `DELETE /api/reviews/:id` → avis retiré de la liste affichée, `myReview` remis à `null`, moyenne recalculée en excluant cet avis (`status: 'deleted'`, jamais un hard-delete Mongo).
**Couverture auto existante** : `providerReviews.integration.test.ts`.

#### SOC-015 — Signaler un avis (auto-masquage au 3e signalement)
**Priorité** : Haute
**Préconditions** : Un avis publié d'un autre auteur, déjà signalé 2 fois par 2 comptes différents.
**Étapes** :
1. Depuis un 3e compte, cliquer « Signaler » sur cet avis.
2. Choisir un motif (`REVIEW_REPORT_REASONS`), ajouter une précision facultative (max 500), envoyer.
3. Recharger la page prestataire.
**Résultat attendu** : Confirmation « Merci » affichée après envoi. `reportCount` atteint 3 → l'avis passe automatiquement `status: 'hidden'`, `hiddenBy: 'auto'` ; il disparaît de la liste publique (`getPublishedReviews` ne renvoie que `status: 'published'`) et la moyenne du prestataire est recalculée sans lui.
**Couverture auto existante** : `providerReviews.integration.test.ts` (seuil `AUTO_HIDE_REPORTS = 3`).

#### SOC-016 — Signalement en double par le même utilisateur, et auto-signalement interdit
**Priorité** : Moyenne
**Étapes** :
1. Signaler un avis, puis re-signaler le MÊME avis avec le même compte.
2. Tenter de signaler son propre avis.
**Résultat attendu** : (1) `already_reported` (409) — l'UI le traite comme un succès silencieux côté `handleReport` (`reportDone` = true également sur `already_reported`, pas d'erreur affichée à l'utilisateur). (2) `cannot_report_own_review` (400) — bouton « Signaler » n'est de toute façon jamais affiché sur `isMine`.
**Couverture auto existante** : `providerReviews.integration.test.ts`.

#### SOC-017 — Réponse du prestataire à un avis
**Priorité** : Moyenne
**Préconditions** : Compte prestataire consultant les avis reçus sur son propre dashboard.
**Étapes** : Répondre à un avis client (texte ≤ 1000 caractères), une seule réponse modifiable.
**Résultat attendu** : `replyToReview` — seul le prestataire propriétaire (`review.providerId === caller.id`) peut répondre (`forbidden` sinon), réponse affichée publiquement sous l'avis avec libellé « Réponse de {providerName} », modifiable (`updatedAt` change, `createdAt` conservé de la 1ère réponse).
**Couverture auto existante** : `providerReviews.integration.test.ts`.

#### SOC-018 — Demande de service (catalogue) crée une conversation directe + message structuré + message texte
**Priorité** : Critique
**Préconditions** : Compte client connecté, page publique prestataire avec au moins un item de catalogue disponible (`available !== false`).
**Étapes** :
1. Cliquer « Demander ce service » sur un item.
2. Vérifier le message pré-rempli automatiquement (« Bonjour {provider}, je suis intéressé par « {item} »… »).
3. Modifier ou vider le texte, cliquer « Envoyer la demande ».
**Résultat attendu** : Séquence exacte : (a) `POST /api/conversations` avec `otherUserId=providerId` (crée ou retrouve la conversation directe) ; (b) `POST .../messages` avec `type: 'catalog_item', catalogItemId` (le serveur reconstruit tout le contenu depuis le VRAI catalogue Mongo — nom/prix/description/image — jamais depuis le client) ; (c) si le texte n'est pas vide après trim, un second message `type: 'text'` est envoyé. Redirection finale vers `/messages?conversationId=...`. Si le texte est vidé avant envoi, seul le message catalogue part (pas de message texte vide).
**Couverture auto existante** : `messaging.integration.test.ts` / `messagingActions.integration.test.ts` pour la route messages ; pas de test end-to-end du flux catalogue → conversation identifié explicitement — à couvrir en priorité, notamment la reconstruction serveur du contenu catalogue.

#### SOC-019 — Impossible de forger un item de catalogue d'un AUTRE prestataire
**Priorité** : Haute
**Préconditions** : Deux prestataires A (avec conversation ouverte) et B (item catalogue existant).
**Étapes** : Depuis la conversation avec A, appeler l'API messages avec `type: 'catalog_item', catalogItemId: <id d'un item de B>`.
**Résultat attendu** : `catalog_item_not_found` (404) — le serveur dérive le prestataire de L'AUTRE PARTICIPANT DE LA CONVERSATION, jamais d'un `providerId` fourni par le client ; un item de B ne peut jamais matcher dans le catalogue de A.
**Couverture auto existante** : à vérifier dans `messaging.integration.test.ts` (sendMessage catalog_item guard).

#### SOC-020 — Demande de service : item retiré/masqué du catalogue entre l'affichage et l'envoi
**Priorité** : Moyenne
**Étapes** : Ouvrir la feuille « Demander ce service », pendant ce temps le prestataire retire l'item (`available: false`) côté back-office, puis cliquer « Envoyer la demande ».
**Résultat attendu** : `catalog_item_not_found` renvoyé, message « Cette offre n'est plus disponible — actualise la page. » affiché dans la feuille, pas de redirection vers `/messages`.
**Couverture auto existante** : à vérifier dans `messaging.integration.test.ts`.

#### SOC-021 — Demande de service à un prestataire qui a bloqué l'utilisateur (ou l'inverse)
**Priorité** : Haute
**Préconditions** : Blocage existant entre le client et le prestataire.
**Étapes** : Cliquer « Demander ce service » et tenter l'envoi.
**Résultat attendu** : `blocked` renvoyé par `POST /api/conversations` (ou par le message si la conversation existait déjà avant le blocage), message « Impossible de contacter ce prestataire. » affiché.
**Couverture auto existante** : `messaging.integration.test.ts` (blocage direct).

---

### 3.6 Amis (friend requests) et blocage

#### SOC-022 — Envoyer une demande d'ami par e-mail depuis la messagerie
**Priorité** : Haute
**Préconditions** : Compte client connecté avec panneau « Amis » accessible depuis `/messages`.
**Étapes** :
1. Ouvrir le panneau Amis, saisir l'e-mail d'un utilisateur existant, envoyer.
2. Réessayer d'envoyer une 2e demande à la même personne pendant que la 1ère est encore `pending`.
**Résultat attendu** : (1) `sendFriendRequest` crée une demande `status: 'pending'`. (2) `request_already_pending` (409) — index unique partiel {fromId,toId,status:'pending'} empêche le doublon exact.
**Couverture auto existante** : `friends.integration.test.ts`.

#### SOC-023 — Auto-acceptation en cas de demandes mutuelles simultanées
**Priorité** : Haute
**Préconditions** : X a déjà une demande `pending` vers Y. Y envoie à son tour une demande vers X (avant que X n'ait répondu).
**Étapes** : Depuis le compte Y, envoyer une demande d'ami à X.
**Résultat attendu** : Les deux comptes deviennent amis IMMÉDIATEMENT (`status: 'friends'` retourné à Y), la demande originelle de X est marquée `accepted`, une `Friendship` unique est créée (paire normalisée), AUCUNE demande "forward" fantôme ne reste en attente. Comportement amélioré par rapport au legacy (documenté explicitement dans `friends.ts`) — à valider comme comportement voulu, pas une régression.
**Couverture auto existante** : `friends.integration.test.ts`.

#### SOC-024 — Accepter / refuser une demande d'ami reçue
**Priorité** : Haute
**Étapes** :
1. Recevoir une demande, cliquer « Accepter ».
2. Sur une autre demande reçue, cliquer « Refuser ».
**Résultat attendu** : Accepter → `Friendship` créée, ami visible dans la liste de contacts pour démarrer une conversation. Refuser → `status: 'declined'`, la demande disparaît de la liste des demandes en attente, aucune amitié créée. Double-accept concurrent sur la même demande → le second appel renvoie `request_not_pending` (409), pas de doublon de Friendship (dupliqué géré par catch idempotent).
**Couverture auto existante** : `friends.integration.test.ts`.

#### SOC-025 — Annuler sa propre demande d'ami envoyée (amélioration vs legacy)
**Priorité** : Moyenne
**Préconditions** : Une demande envoyée par l'utilisateur, encore `pending`.
**Étapes** : Depuis l'onglet "Envoyées", cliquer « Annuler ».
**Résultat attendu** : `status: 'cancelled'`. Un tiers (y compris le destinataire lui-même essayant d'utiliser cette route) ne peut PAS annuler la demande de quelqu'un d'autre — seul `fromId === caller.id` est autorisé (404 générique sinon).
**Couverture auto existante** : `friends.integration.test.ts`.

#### SOC-026 — Retirer un ami existant
**Priorité** : Moyenne
**Étapes** : Depuis la liste de contacts, retirer un ami.
**Résultat attendu** : `Friendship` supprimée (paire normalisée), retrait réciproque (les deux comptes ne se voient plus comme amis). Retirer un ami déjà retiré (course/double-clic) → `not_friends` (400), pas de crash.
**Couverture auto existante** : `friends.integration.test.ts`.

#### SOC-027 — Demande d'ami vers un compte bloqué (dans un sens ou dans l'autre)
**Priorité** : Haute
**Préconditions** : X a bloqué Y (ou inversement).
**Étapes** : Y tente d'envoyer une demande d'ami à X.
**Résultat attendu** : `blocked` (403) — vérifié dans les deux sens (`blockedByMe` OU `blockedByTarget`).
**Couverture auto existante** : `friends.integration.test.ts` (si `User.blockedUserIds` est bien câblé au moment du test — le code introspecte dynamiquement le schéma, voir `hasBlockList()`).

#### SOC-028 — Bloquer un utilisateur depuis une conversation directe
**Priorité** : Critique
**Préconditions** : Conversation directe active avec l'utilisateur cible.
**Étapes** :
1. Ouvrir le menu contact/options de la conversation, choisir « Bloquer ».
2. Confirmer.
3. Depuis le compte BLOQUÉ, tenter d'envoyer un nouveau message dans cette même conversation.
4. Depuis le compte bloqueur, tenter également d'envoyer un message.
**Résultat attendu** : Étape 2 — `blockUser` ajoute la cible à `blockedUserIds` (idempotent via `$addToSet`), un message système persistant `SYS::{"kind":"block",...}` est inséré dans la conversation directe existante, visible des deux côtés avec un texte différent selon le lecteur (« Tu as bloqué X » / « X t'a bloqué »). Étape 3 — `assertCanSendInConversation` renvoie `blocked` (403) pour LE BLOQUÉ. Étape 4 — le bloqueur lui-même ne peut PAS non plus envoyer de message dans cette conversation tant que le blocage est actif (blocage symétrique pour l'ENVOI, vérifié dans les deux sens par `blockedByMe || blockedByTarget`). L'historique existant reste visible pour les deux (pas de purge).
**Couverture auto existante** : `messaging.integration.test.ts` (`assertCanSendInConversation` + `blockUser`/`unblockUser`).

#### SOC-029 — Débloquer un utilisateur restaure l'envoi de messages
**Priorité** : Haute
**Préconditions** : Blocage actif de SOC-028.
**Étapes** : Depuis « Bloqués & signalés », débloquer l'utilisateur ; renvoyer un message dans la conversation.
**Résultat attendu** : `unblockUser` retire l'ID de `blockedUserIds` (`$pull`, normalisation de casse gérée), message système `SYS::{"kind":"unblock",...}` inséré. Envoi de message redevient possible immédiatement pour les deux parties.
**Couverture auto existante** : `messaging.integration.test.ts`.

#### SOC-030 — Signaler un utilisateur (indépendant du blocage)
**Priorité** : Moyenne
**Étapes** : Depuis le menu contact, « Signaler » avec un motif, sans bloquer.
**Résultat attendu** : `reportUser` crée un signalement indépendant, n'affecte PAS la capacité d'envoi de messages (contrairement au blocage) — vérifier que les deux actions restent bien découplées dans l'UI (bloquer ET/OU signaler, pas liés).
**Couverture auto existante** : `messaging.integration.test.ts`.

---

### 3.7 Messagerie — conversations, pin/mute/hide, groupes

#### MSG-001 — AccountMenu : aperçu des messages avec nom correct pour une conversation directe (régression corrigée)
**Priorité** : Critique — régression connue déjà corrigée, à surveiller à chaque changement de `AccountMenu.tsx` ou du DTO `ConversationPreview`
**Préconditions** : Au moins une conversation directe ET une conversation de groupe dans les 5 dernières conversations de l'utilisateur.
**Étapes** :
1. Cliquer l'icône messages (cloche `MessageCircle`) dans la nav publique/`AccountMenu`.
2. Observer le nom affiché pour chaque conversation dans le dropdown.
**Résultat attendu** : Pour une conversation `type: 'direct'`, `conversation.name` est `null` en base (réservé aux groupes) — le nom affiché DOIT être résolu depuis `members.find(m => m.userId !== currentUserId)`, jamais depuis `conv.name` brut (qui afficherait un espace vide ou "null"). Pour une conversation `type: 'group'`, le nom vient de `conv.name || 'Groupe'`. Le badge de compteur non-lu (total, plafonné à « 9+ ») doit correspondre à la somme de `unreadCount` de TOUTES les conversations, pas seulement les 5 affichées dans l'aperçu — vérifier que le total n'est pas tronqué par le `slice(0,5)` de l'API.
**Couverture auto existante** : aucune identifiée pour ce composant précisément (`AccountMenu.tsx` est un composant client sans test unitaire listé) — À AJOUTER EN PRIORITÉ, un test de non-régression ciblé sur `conversationDisplay()` avec un jeu de données `type:'direct', name:null`.

#### MSG-002 — Épingler / désépingler une conversation
**Priorité** : Moyenne
**Étapes** : Depuis la liste de conversations, épingler une conversation ; vérifier son tri ; la désépingler.
**Résultat attendu** : `POST/DELETE /api/conversations/:id/pin` — icône `Pin` visible sur les conversations épinglées, tri qui les remonte (à vérifier dans le rendu de liste). Personnalisation strictement PROPRE À L'APPELANT (`pinned` sur `ConversationListView`, jamais partagé entre participants).
**Couverture auto existante** : `messagingActions.integration.test.ts` (`pinConversationForMe`/`unpinConversationForMe`).

#### MSG-003 — Couper les notifications d'une conversation (mute) puis réactiver
**Priorité** : Moyenne
**Étapes** : Mute une conversation ; vérifier l'icône `BellOff` ; unmute.
**Résultat attendu** : `POST/DELETE /api/conversations/:id/mute` — `mutedForMe` propre à l'appelant, aucun impact sur la capacité de RECEVOIR/ENVOYER des messages (uniquement les notifications/badges).
**Couverture auto existante** : `messagingActions.integration.test.ts`.

#### MSG-004 — Masquer (hide) une conversation de la liste
**Priorité** : Moyenne
**Étapes** : Masquer une conversation directe ; envoyer un nouveau message dans cette conversation depuis l'autre participant.
**Résultat attendu** : `POST /api/conversations/:id/hide` — la conversation disparaît de la liste de l'appelant. Si l'AUTRE participant envoie un nouveau message, vérifier le comportement attendu (réapparition ou non — à confirmer avec `hideConversationForMe` dans `messaging.ts`, comportement documenté comme fidèle au legacy).
**Couverture auto existante** : `messagingActions.integration.test.ts`.

#### MSG-005 — Vider l'historique d'une conversation (clear history)
**Priorité** : Moyenne
**Étapes** : Depuis les réglages de conversation, « Vider l'historique ».
**Résultat attendu** : `clearHistoryForMe` — l'historique disparaît CÔTÉ APPELANT uniquement (pas de suppression pour l'autre participant), à re-confirmer via la modale de confirmation avant action irréversible pour l'appelant.
**Couverture auto existante** : `messagingActions.integration.test.ts`.

#### MSG-006 — Réactions emoji sur un message
**Priorité** : Basse
**Étapes** : Ouvrir le sélecteur de réaction sur un message, choisir un emoji ; re-cliquer le même emoji pour le retirer.
**Résultat attendu** : `POST /api/messages/:id/react` — `reactions: Record<emoji, userId[]>` mis à jour immédiatement dans `messages` local. Re-cliquer bascule (ajoute/retire) la même réaction pour l'utilisateur courant.
**Couverture auto existante** : `messaging.integration.test.ts` (`reactToMessage`).

---

### 3.8 Sondages — RÈGLE CRITIQUE `voteOnPoll` (poll ET event_poll)

#### MSG-007 — Créer et voter sur un sondage texte simple (`poll`)
**Priorité** : Critique
**Préconditions** : Conversation (directe ou groupe) active, appelant participant non-muet.
**Étapes** :
1. Créer un sondage avec une question et 2 à 6 options.
2. Voter pour une option A.
3. Voter pour une option B différente (dans le même sondage).
4. Re-cliquer sur B pour retirer son vote.
**Résultat attendu** : Étape 2 — `voterIds` de A contient l'utilisateur. Étape 3 — vote single-select : l'utilisateur est automatiquement retiré de A et ajouté à B, DANS LA MÊME opération atomique (pipeline d'agrégation, pas de read-modify-write) — jamais présent dans deux options à la fois. Étape 4 — l'utilisateur est retiré de B, plus aucun vote actif pour lui sur ce sondage.
**Couverture auto existante** : `polls.integration.test.ts`.

#### MSG-008 — Créer et voter sur un sondage événement (`event_poll`) — MÊME mécanisme de vote que `poll`
**Priorité** : Critique — c'est la règle explicitement documentée dans `CLAUDE.md` et `lib/server/polls.ts` : ne jamais scinder la logique `voteOnPoll` entre les deux types.
**Préconditions** : Conversation active, un événement publié existant à référencer.
**Étapes** :
1. Depuis la conversation, créer un sondage événement (« On y va ? ») en choisissant un événement — options fixes Oui/Non, snapshot event (nom/date/prix/devise/image) figé à l'envoi.
2. Voter « Oui ».
3. Voter « Non » (bascule).
4. Re-cliquer « Non » pour retirer son vote.
**Résultat attendu** : Comportement de vote IDENTIQUE bit-à-bit à MSG-007 (même fonction `voteOnPoll`, même garde combiné `type !== 'poll' && type !== 'event_poll'`). Le prix affiché dans le snapshot est la place LA MOINS CHÈRE de l'événement au moment de la création (0 si aucune place définie) — vérifier qu'il ne varie PAS si le prix de l'événement change après coup côté organisateur (snapshot figé, jamais relu dynamiquement).
**Couverture auto existante** : `polls.integration.test.ts` — **vérifier explicitement que ce fichier de test exerce le vote sur LES DEUX types `poll` ET `event_poll` séparément**, pas seulement l'un des deux, car c'est précisément le scénario de régression documenté (un futur refactor qui séparerait le garde en deux chemins ferait échouer silencieusement le vote sur l'un des deux types sans lever d'erreur).

#### MSG-009 — Voter sur un sondage avec une option invalide/inexistante
**Priorité** : Haute
**Étapes** : Appeler `voteOnPoll` avec un `optionId` qui n'existe pas dans les options du message.
**Résultat attendu** : `invalid_option` (400) — la vérification `optionExists` a lieu AVANT le pipeline d'update Mongo, jamais un no-op silencieux qui retirerait l'utilisateur de toutes ses options sans l'ajouter nulle part (documenté explicitement comme le bug à éviter).
**Couverture auto existante** : `polls.integration.test.ts`.

#### MSG-010 — Voter sur un sondage dans une conversation où l'appelant est mute (groupe) ou bloqué (direct)
**Priorité** : Haute
**Préconditions** : Utilisateur mute dans un groupe, OU bloqué dans une conversation directe.
**Étapes** : Tenter de voter sur un sondage existant dans cette conversation.
**Résultat attendu** : `assertCanSendInConversation` renvoie `muted` (403) ou `blocked` (403) — MÊME garde partagé que l'envoi de message normal, pas de vérification locale à `polls.ts` qui pourrait diverger (c'était le bug corrigé documenté en commentaire : un compte bloqué pouvait auparavant voter malgré le blocage).
**Couverture auto existante** : `polls.integration.test.ts`.

#### MSG-011 — Deux votes concurrents sur le même sondage ne s'écrasent jamais (pas de last-write-wins)
**Priorité** : Haute
**Préconditions** : Sondage avec 3+ options, 2 utilisateurs distincts.
**Étapes** : Simuler deux requêtes de vote quasi-simultanées de deux utilisateurs différents sur des options différentes du même sondage.
**Résultat attendu** : Les deux votes sont conservés (chacun dans la bonne option) — la mise à jour par pipeline d'agrégation Mongo garantit l'absence de fenêtre de course, contrairement au bug legacy documenté (read-modify-write sur le document entier).
**Couverture auto existante** : `polls.integration.test.ts` (si un test de concurrence explicite existe — sinon signaler comme gap de test important vu la criticité documentée).

---

### 3.9 Groupes — création, administration, membres

#### MSG-012 — Créer un groupe avec membres et avatar
**Priorité** : Haute
**Préconditions** : Au moins 2 amis/contacts disponibles.
**Étapes** : Ouvrir « Nouveau groupe », nommer le groupe, sélectionner des membres, ajouter un avatar (compressé côté client, `compressImage(dataUrl, 500, 0.85)`), créer.
**Résultat attendu** : `createGroup` — le créateur devient `admin` par défaut, tous les membres sélectionnés sont ajoutés en `member`, conversation `type: 'group'` créée avec le nom et l'avatar fournis.
**Couverture auto existante** : `groups.integration.test.ts`.

#### MSG-013 — Renommer un groupe / changer son avatar (admin uniquement ?)
**Priorité** : Moyenne
**Préconditions** : Groupe existant avec au moins un admin et un membre simple.
**Étapes** :
1. En tant qu'admin, renommer le groupe et changer l'avatar.
2. En tant que membre simple, tenter la même action (si l'UI l'expose ou via appel direct).
**Résultat attendu** : `renameGroup`/`setGroupAvatar` — vérifier les droits requis exacts (admin vs tout membre) dans `groupsAdmin.integration.test.ts`. Si restreint aux admins, un membre simple doit recevoir `forbidden`/403.
**Couverture auto existante** : `groupsAdmin.integration.test.ts`.

#### MSG-014 — Ajouter un membre à un groupe existant
**Priorité** : Haute
**Étapes** : Depuis les réglages du groupe, ajouter un nouveau membre (recherche par nom/email via `searchUsers`).
**Résultat attendu** : `addMember` — le nouveau membre apparaît dans la liste, rôle `member` par défaut, reçoit accès à l'historique existant (ou pas, selon fidélité legacy — à vérifier).
**Couverture auto existante** : `groups.integration.test.ts` / `groupsAdmin.integration.test.ts`.

#### MSG-015 — Retirer un membre du groupe (admin)
**Priorité** : Haute
**Étapes** : Un admin retire un membre du groupe.
**Résultat attendu** : `removeMember` — le membre retiré n'apparaît plus dans `members`/`participantIds`, ne peut plus envoyer/recevoir de nouveaux messages dans ce groupe. Un membre non-admin ne doit PAS pouvoir retirer un autre membre (403 attendu).
**Couverture auto existante** : `groupsAdmin.integration.test.ts`.

#### MSG-016 — Changer le rôle d'un membre (member ↔ admin)
**Priorité** : Haute
**Étapes** : Un admin promeut un membre en admin ; un admin rétrograde un autre admin en membre simple.
**Résultat attendu** : `setMemberRole` — vérifier le cas limite du DERNIER admin d'un groupe (un groupe doit-il toujours garder au moins un admin ? à confirmer avec le test d'intégration — sinon signaler comme cas à couvrir).
**Couverture auto existante** : `groupsAdmin.integration.test.ts`.

#### MSG-017 — Mettre un membre en sourdine dans un groupe (durée limitée ou indéfinie)
**Priorité** : Haute
**Préconditions** : Groupe avec un admin et un membre cible.
**Étapes** :
1. Admin choisit « Rendre muet » sur un membre avec une durée (ex. 1h, 24h) via `muteMemberDialog`.
2. Le membre muté tente d'envoyer un message texte ET de voter sur un sondage dans ce groupe pendant la sourdine.
3. Attendre l'expiration (ou tester avec une sourdine indéfinie, `untilAt: null`) puis retirer manuellement la sourdine (« Réactiver »).
**Résultat attendu** : Étape 2 — `assertCanSendInConversation` renvoie `muted` (403) pour L'ENVOI DE MESSAGE ET pour LE VOTE (même garde partagé, voir MSG-010). Message d'erreur UI : « Tu es en sourdine dans ce groupe. ». Étape 3 — après expiration naturelle OU `unmuteMember` explicite, l'envoi redevient possible sans reconnexion nécessaire (revérifié à chaque requête, pas mis en cache côté session).
**Couverture auto existante** : `groups.integration.test.ts` (`muteMember`/`unmuteMember`), `polls.integration.test.ts` pour le lien avec le vote.

#### MSG-018 — Quitter un groupe / supprimer un groupe
**Priorité** : Haute
**Étapes** :
1. Membre simple quitte le groupe volontairement.
2. Admin (seul admin restant) tente de quitter — vérifier le comportement (transfert auto d'admin à un autre membre ? blocage ?).
3. Admin supprime le groupe entièrement.
**Résultat attendu** : (1) `leaveGroup` réussit, ancien membre retiré, ne voit plus la conversation. (2) comportement à confirmer avec `groups.integration.test.ts` — cas limite fréquent de bug (groupe sans admin). (3) `deleteGroup` — conversation et messages supprimés/archivés pour TOUS les participants (vérifier la portée exacte — suppression physique ou simple statut).
**Couverture auto existante** : `groups.integration.test.ts`.

---

### 3.10 Messages riches — voix, photo, transfert, épinglage, favoris

#### MSG-019 — Enregistrer et envoyer un message vocal (tap vs appui long)
**Priorité** : Haute
**Préconditions** : Permission microphone accordée par le navigateur.
**Étapes** :
1. Appui COURT (tap, <250ms) sur le micro → démarre l'enregistrement.
2. Re-tap pour arrêter et envoyer.
3. Nouvel essai : appui LONG (maintenu >250ms) sur le micro puis relâcher → enregistrement démarré au maintien, envoyé au relâchement.
4. Pendant un enregistrement en cours, cliquer le bouton d'annulation (icône corbeille/croix) au lieu du bouton d'envoi.
**Résultat attendu** : Étape 1-2 — mode "tap-to-toggle" : `startRecording()` puis un second tap appelle `stopRecording(true)` (envoi). Étape 3 — mode "hold-to-record" (`holdTimerRef` à 250ms) : relâchement après un vrai maintien envoie automatiquement (`stopRecording(true)`). Étape 4 — `stopRecording(false)` : `shouldSendRef.current = false`, le flux micro est arrêté (`stream.getTracks().forEach(t => t.stop())`) mais AUCUN message n'est envoyé, `audioChunksRef` jeté. Dans tous les cas d'envoi réussi : `POST /messages` avec `type: 'voice', mediaDataUri` (base64), le message vocal apparaît dans le fil avec un lecteur audio, `replyToMessageId` respecté si une réponse était en cours.
**Couverture auto existante** : aucune côté client (logique `MediaRecorder` non testable en intégration serveur) ; le endpoint d'upload voix est couvert par `messaging.integration.test.ts` (validation `AUDIO_MIME_TYPES`, taille).

#### MSG-020 — Micro refusé par le navigateur
**Priorité** : Moyenne
**Étapes** : Refuser la permission microphone puis tenter d'enregistrer.
**Résultat attendu** : `getUserMedia` rejette → catch → toast « Impossible d'accéder au micro. », pas de crash, `isRecording` reste `false`.
**Couverture auto existante** : aucune.

#### MSG-021 — Envoyer une photo depuis la galerie ou l'appareil photo, avec compression
**Priorité** : Haute
**Étapes** :
1. Utiliser le bouton « Envoyer une photo » (input file) OU « Appareil photo » (capture live via `openCamera`/`capturePhoto`).
2. Prévisualiser l'image avant envoi (`photoPreview`).
3. Confirmer l'envoi.
**Résultat attendu** : L'image est compressée côté client (`compressImage(dataUrl, 1000, 0.8)`) avant upload pour limiter la taille, puis envoyée en `type: 'image', mediaDataUri`. Si la photo est prise depuis le bouton caméra du header (sans conversation active choisie au préalable), l'utilisateur doit d'abord CHOISIR une conversation cible (`photoPreviewPickedConv`) avant que `handleSendPhoto` puisse s'exécuter.
**Couverture auto existante** : endpoint d'upload couvert par `messaging.integration.test.ts` (`IMAGE_MIME_TYPES`) ; logique de compression/preview 100% client non testée en intégration.

#### MSG-022 — Visualisation zoomée d'un message photo
**Priorité** : Basse
**Étapes** : Cliquer sur une vignette photo dans le fil de conversation.
**Résultat attendu** : Ouverture d'une vue plein écran/zoomée de l'image (lightbox), fermeture au clic extérieur ou Échap, aucune dégradation de qualité par rapport à l'URL Cloudinary d'origine.
**Couverture auto existante** : aucune identifiée.

#### MSG-023 — Transférer un message vers une ou plusieurs conversations
**Priorité** : Haute
**Préconditions** : Au moins 2 conversations cibles disponibles, un message source (texte, photo ou vocal).
**Étapes** :
1. Sur un message, choisir « Transférer ».
2. Sélectionner PLUSIEURS conversations cibles (`forwardTargetPick`, un `Set`).
3. Confirmer le transfert.
4. Répéter en sélectionnant AUCUNE conversation puis en tentant de confirmer.
**Résultat attendu** : Étape 3 — `POST /api/messages/:id/forward` avec `toConversationIds: [...pick]` — le message apparaît dans TOUTES les conversations sélectionnées avec un bandeau « Transféré » (`forwardedFrom: { senderName, convName }` pointant vers l'ORIGINE, pas vers l'expéditeur du transfert). Si la conversation active fait partie des cibles, le fil se rafraîchit immédiatement (`fetchMessages(activeId)`). Le transfert respecte les mêmes gardes d'envoi (`assertCanSendInConversation`) PAR CIBLE — si l'appelant est mute/bloqué dans UNE des cibles, ce transfert précis échoue (`forward_failed` partiel possible) sans bloquer les autres cibles valides. Étape 4 — bouton de confirmation désactivé/no-op si `forwardTargetPick.size === 0`.
**Couverture auto existante** : `messagingActions.integration.test.ts` (`forwardMessage`).

#### MSG-024 — Épingler un message dans une conversation (un seul à la fois)
**Priorité** : Moyenne
**Étapes** :
1. Épingler un message A dans une conversation.
2. Épingler un message B différent dans la MÊME conversation.
3. Désépingler.
**Résultat attendu** : Étape 1 — `pinnedMessageId` de la conversation = A, bandeau du message épinglé visible en haut du fil, `pinned: true` uniquement sur A. Étape 2 — épingler B REMPLACE A comme message épinglé unique (`m.id === msg.id` — un seul message épinglé par conversation à la fois, jamais un tableau/liste). Étape 3 — `pinnedMessageId` repasse à `null`, plus aucun message marqué `pinned`.
**Couverture auto existante** : `messagingActions.integration.test.ts` (`pinMessage`/`unpinMessage` dans `groups.ts`, `pinned-message` dans `messaging.ts` — vérifier qu'il n'existe bien qu'UN SEUL mécanisme d'épinglage de message actif, pas une divergence entre deux implémentations parallèles `groups.ts:pinMessage` vs la route `/pinned-message`).

#### MSG-025 — Marquer un message comme important (star) et le retrouver dans "Importants"
**Priorité** : Moyenne
**Étapes** :
1. Étoiler un message dans n'importe quelle conversation.
2. Ouvrir le panneau « Importants » depuis le menu de la messagerie.
3. Retirer l'étoile depuis ce panneau.
**Résultat attendu** : Étape 1 — `POST /api/messages/:id/star`, `starredByMe: true` sur le message. Étape 2 — le message apparaît dans la liste `starred` globale (toutes conversations confondues), triée par date. Étape 3 — `DELETE .../star`, le message disparaît du panneau ET son état `starredByMe` repasse à `false` dans le fil d'origine s'il est encore affiché.
**Couverture auto existante** : `messagingActions.integration.test.ts` (`starMessage`/`unstarMessage`/`listStarredMessages`).

#### MSG-026 — Suppression d'un message : pour moi vs pour tout le monde
**Priorité** : Haute
**Préconditions** : Un message envoyé par l'utilisateur courant, un message reçu d'un autre participant.
**Étapes** :
1. Sur son propre message, choisir « Supprimer pour tout le monde ».
2. Sur un message REÇU (d'un autre), tenter la même option (si exposée) ou seulement « Supprimer pour moi ».
3. Sur son propre message, « Supprimer pour moi » depuis un autre appareil/session.
**Résultat attendu** : (1) `deleteMessageForAll` — le message devient `deletedForAll: true` pour TOUS les participants (contenu remplacé par un indicateur "message supprimé"), action réservée à l'expéditeur original. (2) un utilisateur ne doit pouvoir supprimer "pour tout le monde" QUE ses propres messages — sinon `forbidden`. (3) `deleteMessageForMe` — masque uniquement côté appelant, le message reste visible et intact pour les autres participants.
**Couverture auto existante** : `messaging.integration.test.ts` (`deleteMessageForMe`/`deleteMessageForAll`).

#### MSG-027 — Édition d'un message texte envoyé
**Priorité** : Moyenne
**Étapes** : Éditer un message texte déjà envoyé, sauvegarder.
**Résultat attendu** : `editMessage` — `editedAt` renseigné, badge « modifié » visible, contenu mis à jour dans le fil pour tous les participants. Un utilisateur ne peut éditer que SES PROPRES messages de type `text` (pas de sens d'éditer une photo/vocal/sondage/system).
**Couverture auto existante** : `messaging.integration.test.ts`.

#### MSG-028 — Indicateur "en train d'écrire" (typing)
**Priorité** : Basse
**Étapes** : Taper dans le champ de saisie d'une conversation ; arrêter de taper.
**Résultat attendu** : `PATCH /api/conversations/:id/typing` avec `typing: true`, débounce/timeout ramène à `typing: false` après une pause (voir `typingTimeoutRef`). Les autres participants voient l'indicateur via polling (jamais de websocket, cf. `AGENTS.md`).
**Couverture auto existante** : `messagingActions.integration.test.ts` (`setTyping`/`getTypingUsers`).

---

### Notes transverses pour les testeurs

- **Règle à ne jamais valider comme "à moitié corrigée"** : `voteOnPoll` (`lib/server/polls.ts`) doit être testé sur `poll` ET `event_poll` À CHAQUE campagne de régression touchant la messagerie — un seul garde combiné couvre les deux ; si un futur correctif scinde ce garde en deux chemins, l'un des deux types de sondage se mettra à accepter les clics de vote sans jamais rien persister, sans lever d'erreur visible (voir MSG-008, MSG-011).
- **AccountMenu / conversations directes** : le nom affiché pour une conversation `direct` doit TOUJOURS être résolu via `members.find(...)`, jamais lu directement sur `conversation.name` (qui est `null` pour les DMs) — un bug réel de ce type a déjà été corrigé dans `AccountMenu.tsx` (voir MSG-001) ; ce point mérite un test de non-régression automatisé dédié, actuellement absent.
- **Blocage** : toujours vérifié dans les DEUX sens (bloqueur → bloqué ET bloqué → bloqueur) pour l'envoi de message, le vote sur sondage, et l'envoi de demande d'ami — ne jamais tester un seul sens.
- **Confidentialité `readReceipts` / `showOnline` / `showAvatar`** : ces toggles n'ont aucune couverture automatisée identifiée pour leur EFFET dans la messagerie (uniquement la persistance du toggle lui-même) — prioriser des tests manuels d'effet de bord réel (l'autre participant ne voit plus le statut en ligne / les confirmations de lecture / l'avatar).


---

## 4. Compte Organisateur — candidature, page publique, gestion d'événements, staff, encaissement

### 4.1 Candidature organisateur (OrganizerOnboardingWizard)

**ORG-001** — Candidature complète en mode anonyme (non connecté) avec dossier valide. Priorité Critique. Étapes : compléter les 4 étapes (Établissement/Activité/Revenus/Documents) avec un dossier valide et 1 pièce d'identité, soumettre. Résultat : compte + dossier créés atomiquement. Couverture auto : `applications.integration.test.ts`.

**ORG-002** — Blocage soumission si pièce d'identité absente. Priorité Critique. Résultat : blocage client "La pièce d'identité est obligatoire." sans appel réseau. Couverture auto : `applications.integration.test.ts` (côté serveur).

**ORG-003** — Attestation alcool obligatoire si vente d'alcool cochée. Priorité Haute. Couverture auto : `applications.integration.test.ts`.

**ORG-004** — Champ `typeEtablissementCustom` requis quand type = "Autre". Priorité Moyenne. Couverture auto : aucune identifiée.

**ORG-005** — Bascule `itinerant` ne laisse pas de données obsolètes (vérifier absence de données stales si va-et-vient). Priorité Moyenne. Couverture auto : aucune.

**ORG-006** — Limite de fichiers par catégorie (max 5) et par dossier (max 10). Priorité Haute. Couverture auto : aucune (validation purement client).

**ORG-007** — Type de fichier / taille de document rejetés par `uploadApplicationDocument`. Priorité Haute. Couverture auto : à vérifier séparément.

**ORG-008** — Email déjà utilisé en mode anonyme. Priorité Haute. Couverture auto : `applications.integration.test.ts`.

**ORG-009** — Autosave en mode connecté ne bloque jamais la progression (échec réseau silencieux). Priorité Basse. Couverture auto : aucune.

**ORG-010** — Autosave rejeté une fois le dossier soumis (verrouillage). Priorité Haute. Couverture auto : `applications.integration.test.ts`.

### 4.2 Page "Mon dossier" (my-application)

**ORG-011** — Affichage double dossier (organisateur + prestataire) en parallèle, aucun masqué. Priorité Haute. Couverture auto : logique serveur couverte, rendu double carte non testé.

**ORG-012** — Motif de rejet affiché et CTA de resoumission. Priorité Critique. Couverture auto : `applications.integration.test.ts` (resoumission needs_changes→resubmitted).

**ORG-013** — Statut `needs_changes` affiche `requestedChanges`. Priorité Haute. Couverture auto : aucune.

**ORG-014** — Dossier verrouillé pendant l'examen (submitted/under_review/resubmitted). Priorité Moyenne. Couverture auto : couvert indirectement (autosave rejeté).

**ORG-015** — Compte déjà actif sans dossier (activation manuelle). Priorité Moyenne. Couverture auto : aucune.

**ORG-016** — Statut d'application inconnu/non mappé ne casse pas la page — **gap de code confirmé** : `ApplicationCard` n'a pas de branche `default`. Priorité Basse. Couverture auto : aucune.

### 4.3 Page publique organisateur (organizer-studio / StudioClient)

**ORG-017** — Enregistrement profil sans `publicName` bloqué. Priorité Haute. Couverture auto : `organizerProfile.integration.test.ts`.

**ORG-018** — Slug déjà pris (`slug_taken`). Priorité Haute. Couverture auto : `organizerProfile.integration.test.ts`.

**ORG-019** — Zones d'intervention : sélection `'international'` exclusive des autres zones. Priorité Moyenne. Couverture auto : `organizerProfile.integration.test.ts`.

**ORG-020** — Modification `shortDescription` efface `longDescription` (quirk hérité — à confirmer intentionnel, pas une régression). Priorité Moyenne. Couverture auto : `organizerProfile.integration.test.ts`.

**ORG-021** — Upload avatar — validation MIME et taille (5 Mo), crop 1:1 sortie 640px. Priorité Haute. Couverture auto : persistance testée, rejets MIME/taille client à vérifier manuellement.

**ORG-022** — Upload bannière — aspect 16:7, sortie 1280px. Priorité Moyenne. Couverture auto : `organizerProfile.integration.test.ts`.

**ORG-023** — Galerie — cap image 10 Mo distinct du cap avatar/bannière (5 Mo) — vérifier que ce n'est pas "corrigé" par erreur. Priorité Moyenne. Couverture auto : aucune pour les seuils exacts.

**ORG-024** — Galerie — upload vidéo MP4/WEBM/MOV, cap 30 Mo. Priorité Moyenne. Couverture auto : aucune.

**ORG-025** — Réorganisation invalide de la galerie rejetée (`invalid_order`). Priorité Basse. Couverture auto : `organizerProfile.integration.test.ts`.

**ORG-026** — Suppression média galerie avec confirmation (`window.confirm`). Priorité Basse. Couverture auto : `organizerProfile.integration.test.ts`.

**ORG-027** — Type de média incompatible avec le rôle (vidéo en avatar/bannière) → `invalid_media_type`. Priorité Moyenne. Couverture auto : à vérifier.

**ORG-028** — Connexion Stripe Connect (pays éligible), réutilisation du compte existant. Priorité Haute. Couverture auto : `organizerPayouts.integration.test.ts`.

**ORG-029** — Connexion Stripe — pays non éligible bascule en mode manuel, jamais d'écriture `chargesEnabled` hors webhook. Priorité Haute. Couverture auto : `organizerPayouts.integration.test.ts`.

**ORG-030** — Demande de virement manuel — rien à verser (`nothing_due`). Priorité Moyenne. Couverture auto : `organizerPayouts.integration.test.ts`.

**ORG-031** — Demande de virement — requête déjà en attente (`request_already_pending`). Priorité Moyenne. Couverture auto : `organizerPayouts.integration.test.ts`.

**ORG-032** — Mobile money — numéro invalide bloque toute la sauvegarde (pas de sauvegarde partielle). Priorité Haute. Couverture auto : `organizerPayoutMomos.integration.test.ts`.

**ORG-033** — Suppression d'un pays momo — remplacement complet de la map (full-replace). Priorité Moyenne. Couverture auto : `organizerPayoutMomos.integration.test.ts`.

**ORG-034** — Ajout d'un numéro momo réarme automatiquement un payout en échec `no_momo_number`. Priorité Haute. Couverture auto : `organizerPayoutMomos.integration.test.ts`.

**ORG-035** — Pas de réarmement automatique pour événement annulé ou fail code non éligible. Priorité Moyenne. Couverture auto : `organizerPayoutMomos.integration.test.ts`.

### 4.4 Création/édition d'événement (EventWizard)

**ORG-036** — Création événement — champs obligatoires (name/date/city/region). Priorité Critique. Couverture auto : `organizerEvents.integration.test.ts`.

**ORG-037** — Place de type "groupe" sans prix rejetée (`group_place_requires_price`). Priorité Haute. Couverture auto : `organizerEvents.integration.test.ts`.

**ORG-038** — Devise dérivée une seule fois à la création, jamais recalculée à l'édition. Priorité Haute. Couverture auto : `organizerEvents.integration.test.ts`.

**ORG-039** — Code privé jamais stocké en clair (seul `privateCodeHash`, API expose `hasPrivateCode` uniquement). Priorité Critique. Couverture auto : `organizerEvents.integration.test.ts`.

**ORG-040** — Notification de nouvel événement non envoyée pour événement privé ou programmé. Priorité Basse. Couverture auto : aucune.

**ORG-041** — Édition événement après ventes — champs verrouillés (date/heure/lieu/ville/région/âge min/privé/type/publishAt/preorder) silencieusement ignorés ; description/image/vidéo/artistes/dj restent éditables. Priorité Critique. Couverture auto : `organizerEvents.integration.test.ts`.

**ORG-042** — Édition bloquée entièrement si événement annulé (`event_cancelled`). Priorité Haute. Couverture auto : `organizerEvents.integration.test.ts`.

**ORG-043** — Réduction du stock total en dessous du nombre déjà vendu — plafonné au vendu. Priorité Haute. Couverture auto : `organizerEvents.integration.test.ts`.

**ORG-044** — Suppression d'une place ayant des ventes — conservée malgré l'omission du payload. Priorité Haute. Couverture auto : `organizerEvents.integration.test.ts`.

**ORG-045** — Menu — verrouillage aligné sur le verrou global de l'événement (grossier, pas item par item) — limitation à documenter. Priorité Moyenne. Couverture auto : aucune.

**ORG-046** — Éditeur de menu — prix jamais négatif/NaN (clampé). Priorité Basse. Couverture auto : aucune.

**ORG-047** — Éditeur de menu — limite de 20 options de show par item. Priorité Basse. Couverture auto : aucune.

**ORG-048** — Désactivation `hasShow` efface toutes les options, réactivation en recrée une par défaut. Priorité Basse. Couverture auto : aucune.

**ORG-049** — Duplication d'événement réinitialise les places (place.id vidés). Priorité Moyenne. Couverture auto : aucune.

### 4.5 Annulation d'événement (cancelOrganizerEvent) — CRITIQUE

**ORG-050** — Annulation rembourse toutes les commandes payées Stripe et FedaPay, `refundedCount`/`refundFailedCount` reflètent le résultat exact. Priorité Critique. Couverture auto : `organizerEventLifecycle.integration.test.ts`.

**ORG-051** — Billet revendu : seul le dernier acheteur (détenteur actuel) est remboursé, jamais l'acheteur d'origine (`superseded` jamais retouché). Priorité Critique. Couverture auto : `organizerEventLifecycle.integration.test.ts` (test nommé exactement pour ce cas).

**ORG-052** — Annulation idempotente — pas de double envoi de notification ni réécriture du message/date au second appel. Priorité Haute. Couverture auto : `organizerEventLifecycle.integration.test.ts`.

**ORG-053** — Second appel d'annulation ne rembourse pas deux fois une commande déjà remboursée — **gap identifié** : ce n'est PAS garanti par une relecture explicite dans `cancelOrganizerEvent`, mais par le contrat implicite de `refundStripeOrder`/`recordFedapayRefund` (le statut doit sortir de `'paid'`). Priorité Critique — à tester en priorité. Couverture auto : aucune trouvée explicitement pour l'appel répété.

**ORG-054** — Échec d'un remboursement individuel ne bloque pas l'annulation ni les autres remboursements (`refundFailedCount` s'incrémente, `PaymentAlert` journalisée). Priorité Haute. Couverture auto : `organizerEventLifecycle.integration.test.ts`.

**ORG-055** — Commandes non `'paid'` (pending) exclues du remboursement. Priorité Moyenne. Couverture auto : à vérifier dans la suite.

**ORG-056** — Annulation par un non-propriétaire (y compris staff "manager") refusée (403) — aucun rôle `EventStaff` n'a ce pouvoir. Priorité Critique. Couverture auto : `organizerEventLifecycle.integration.test.ts`.

**ORG-057** — Message d'annulation tronqué à 500 caractères (client + serveur). Priorité Basse. Couverture auto : aucune pour la limite exacte.

**ORG-058** — Suppression (hard delete) bloquée si des commandes payées existent (`409 has_bookings`, `bookingCount` = somme des qty) — bascule vers annulation. Priorité Critique. Couverture auto : `organizerEventLifecycle.integration.test.ts`.

**ORG-059** — Suppression réelle en cascade quand aucune réservation (Event/EventStaff/PromoCode/EventAccessCode) — **gap possible** : Boost/BoostSlot et médias `OrganizerProfile.media` liés non nettoyés, risque de références orphelines. Priorité Haute. Couverture auto : `organizerEventLifecycle.integration.test.ts` (cascade de base couverte, orphelins non couverts).

### 4.6 Report d'événement (PostponeModal / postponeOrganizerEvent)

**ORG-060** — Report bloqué si l'événement est déjà annulé (`event_cancelled`). Priorité Haute. Couverture auto : `organizerEventLifecycle.integration.test.ts`.

**ORG-061** — Validation client : nouvelle date obligatoire, future, différente de l'actuelle. Priorité Haute. Couverture auto : aucune trouvée explicitement.

**ORG-062** — Premier report enregistre `postponedFrom`, un second report ne l'écrase jamais. Priorité Critique. Couverture auto : `organizerEventLifecycle.integration.test.ts`.

**ORG-063** — Report suspend les annonces de revente active (`ResaleListing` → `suspended`), contrairement à l'annulation qui ne les touche pas explicitement ; aucune réactivation auto après report (limitation v1 documentée). Priorité Critique. Couverture auto : `organizerEventLifecycle.integration.test.ts`.

**ORG-064** — Fenêtre de remboursement client après report (`refundWindowDays`, défaut 7 jours, valeur ≤0 ignorée). Priorité Haute. Couverture auto : aucune identifiée pour la valeur par défaut.

**ORG-065** — Report — notification envoyée à chaque fois (non idempotente comme l'annulation). Priorité Moyenne. Couverture auto : aucune.

**ORG-066** — Billets existants non modifiés/remboursés automatiquement par le report ; check-in s'aligne sur la nouvelle date en lisant Event en direct. Priorité Haute. Couverture auto : aucune.

### 4.7 Codes d'accès privé (AccessCodesModal / eventAccessCodes.ts)

**ORG-067** — Génération de codes uniquement pour événement privé (`event_not_private`). Priorité Haute. Couverture auto : `eventAccessCodes.integration.test.ts`.

**ORG-068** — Génération — quantité invalide retombe à 10 par défaut, plafond à 100. Priorité Moyenne. Couverture auto : `eventAccessCodes.integration.test.ts`.

**ORG-069** — Génération répétée est additive, jamais un remplacement. Priorité Haute. Couverture auto : à confirmer dans la suite.

**ORG-070** — Consommation d'un code — usage unique garanti atomiquement (`findOneAndUpdate` avec `usedBy:null` en filtre). Priorité Critique. Couverture auto : `eventAccessCodes.integration.test.ts`.

**ORG-071** — Code inconnu ou mal formaté rejeté (normalisation trim+uppercase). Priorité Moyenne. Couverture auto : `eventAccessCodes.integration.test.ts`.

**ORG-072** — Consommation anonyme (`usedBy=null`) stockée comme `'anonymous'`, jamais réutilisable après. Priorité Basse. Couverture auto : `eventAccessCodes.integration.test.ts`.

**ORG-073** — Accès non-propriétaire refusé pour la génération de codes (403). Priorité Haute. Couverture auto : `eventAccessCodes.integration.test.ts`.

### 4.8 Guestlist (GuestlistModal / guestlist.ts)

**ORG-074** — Ajout d'un invité sans achat — décrémente le même pool de stock que les ventes payantes (ticket réel créé, `source:'guestlist'`). Priorité Critique. Couverture auto : `guestlist.integration.test.ts`.

**ORG-075** — Ajout d'invité refusé si place complète (`sold_out`). Priorité Haute. Couverture auto : `guestlist.integration.test.ts`.

**ORG-076** — Ajout d'invité refusé sur événement annulé. Priorité Haute. Couverture auto : à confirmer.

**ORG-077** — Nom d'invité obligatoire (`guest_name_required`). Priorité Moyenne. Couverture auto : à confirmer.

**ORG-078** — Retrait d'un invité déjà arrivé (checked-in) bloqué (`already_checked_in`), même via appel direct. Priorité Haute. Couverture auto : `guestlist.integration.test.ts`.

**ORG-079** — Retrait d'un invité non arrivé recrédite le stock, plafonné au total, ticket marqué `revoked`. Priorité Haute. Couverture auto : `guestlist.integration.test.ts`.

**ORG-080** — Retrait idempotent d'un invité déjà retiré. Priorité Basse. Couverture auto : à confirmer.

**ORG-081** — Invité en guestlist peut être check-iné normalement malgré `source≠paid`. Priorité Moyenne. Couverture auto : `guestlist.integration.test.ts`.

### 4.9 Staff (eventStaff.ts) — rôles scan/serveur/manager/dj/vendeur

**ORG-082** — Rôle "manager" non assignable via l'invitation staff (`invalid_role`) — réservé au propriétaire, jamais une entrée `EventStaff`. Priorité Critique. Couverture auto : `eventStaff.integration.test.ts`.

**ORG-083** — Assignation de chaque rôle invitable (scan, serveur, dj, vendeur). Priorité Haute. Couverture auto : `eventStaff.integration.test.ts`.

**ORG-084** — Invitation d'un DJ active automatiquement la playlist (`event.playlist=true`). Priorité Moyenne. Couverture auto : `eventStaff.integration.test.ts`.

**ORG-085** — Auto-invitation refusée (`cannot_invite_self`). Priorité Moyenne. Couverture auto : `eventStaff.integration.test.ts`.

**ORG-086** — Invitation en double du même utilisateur refusée (`already_staff`). Priorité Moyenne. Couverture auto : `eventStaff.integration.test.ts`.

**ORG-087** — Invitation d'un utilisateur inexistant refusée (`user_not_found`). Priorité Basse. Couverture auto : à confirmer.

**ORG-088** — Retrait d'un membre du staff sans commandes actives en cours. Priorité Moyenne. Couverture auto : `eventStaff.integration.test.ts`.

**ORG-089** — Retrait d'un membre du staff réassigne ses lignes de commande actives au propriétaire (transactionnel, tout ou rien). Priorité Haute. Couverture auto : `eventStaff.integration.test.ts`.

**ORG-090** — Retrait d'un membre non présent sur le roster (`not_staff`). Priorité Basse. Couverture auto : à confirmer.

**ORG-091** — Gestion staff refusée à un non-propriétaire (403 pour ajout et retrait). Priorité Critique. Couverture auto : `eventStaff.integration.test.ts`.

**ORG-092** — Absence de lien "vendeur ↔ vente par code promo" — **à documenter** : aucune association automatique n'existe dans le code actuel entre le rôle `vendeur` et les `PromoCode`. Priorité Basse. Couverture auto : aucune (confirmé absent par lecture directe).

### 4.10 Boost d'événement (BoostModal / boosts.ts / boostSlots.ts)

**ORG-093** — Paiement d'un boost — position disponible, slot en `'held'` 24h avant confirmation. Priorité Haute. Couverture auto : `boostSlots.integration.test.ts` couvre la réservation, pas le paiement bout-en-bout.

**ORG-094** — Enforcement du plafond de slots — position déjà occupée (active ou held), sauf réservation identique idempotente (même boostId). Priorité Critique. Couverture auto : `boostSlots.integration.test.ts`.

**ORG-095** — Toutes les positions occupées — aucune file d'attente, juste blocage. Priorité Moyenne. Couverture auto : aucune trouvée explicitement.

**ORG-096** — Durée de boost dépassant la date de fin de l'événement refusée (`boost_outlasts_event`). Priorité Moyenne. Couverture auto : aucune trouvée.

**ORG-097** — Boost sur événement annulé refusé (`event_cancelled`). Priorité Moyenne. Couverture auto : aucune trouvée.

**ORG-098** — Prix de boost toujours affiché en EUR quel que soit la devise de l'événement (rail Stripe uniquement). Priorité Basse. Couverture auto : aucune.

**ORG-099** — Réservation de slot expirée automatiquement libérée si jamais confirmée, uniquement si toujours `'pending'` avec le bon boostId (protection anti-race) — **gap possible** : `releaseBoostSlotIfPending` non couvert explicitement dans les 3 tests listés de `boostSlots.integration.test.ts`. Priorité Moyenne. Couverture auto : gap à signaler.

### 4.11 Codes promo (organizerPromoCodes.ts)

**ORG-100** — Création code promo — code trop court refusé (`code_too_short`). Priorité Moyenne. Couverture auto : `organizerPromoCodes.integration.test.ts`.

**ORG-101** — Code promo pourcentage ≥100% refusé (`percent_too_high`). Priorité Haute. Couverture auto : `organizerPromoCodes.integration.test.ts`.

**ORG-102** — Code promo fixe qui couvrirait entièrement le billet le moins cher refusé (`fixed_covers_cheapest_ticket`). Priorité Haute. Couverture auto : `organizerPromoCodes.integration.test.ts`.

**ORG-103** — Code promo fixe inférieur au prix le plus bas accepté. Priorité Moyenne. Couverture auto : `organizerPromoCodes.integration.test.ts`.

**ORG-104** — Code promo dupliqué sur le même événement refusé (`code_taken`, index unique). Priorité Moyenne. Couverture auto : `organizerPromoCodes.integration.test.ts`.

**ORG-105** — Valeur non finie ou ≤0 refusée (`invalid_value`). Priorité Basse. Couverture auto : à confirmer.

**ORG-106** — Date d'expiration interprétée en fin de journée (23:59:59), pas minuit. Priorité Basse. Couverture auto : aucune trouvée explicitement.

**ORG-107** — Activation/désactivation et suppression d'un code promo — suppression immédiate sans confirmation serveur (contraste avec le retrait de staff, transactionnel). Priorité Basse. Couverture auto : `organizerPromoCodes.integration.test.ts`.

**ORG-108** — Gestion des codes promo refusée à un non-propriétaire (403 sur create/toggle/delete). Priorité Haute. Couverture auto : `organizerPromoCodes.integration.test.ts`.

### 4.12 Réservations et statistiques (BookingsPanel / OrganizerAnalytics / StatistiquesClient)

**ORG-109** — Panneau réservations — agrégation exclut les billets révoqués. Priorité Moyenne. Couverture auto : `organizerBookings.integration.test.ts`.

**ORG-110** — Panneau réservations résilient à un `userId` malformé (pas de CastError, repli sur guestName). Priorité Basse. Couverture auto : à confirmer.

**ORG-111** — Analytics organisateur — agrégation multi-devises correcte, jamais additionnées entre devises différentes. Priorité Moyenne. Couverture auto : aucune trouvée explicitement.

**ORG-112** — Formule de frais affichée correctement selon devise (EUR : 5%+0,49€ plafond 2,50€ ; XOF : 5%+300 FCFA plafond 1500 FCFA). Priorité Basse. Couverture auto : aucune (composant client).

**ORG-113** — Statistiques par événement — export CSV désactivé si aucun billet assigné. Priorité Basse. Couverture auto : aucune.

**ORG-114** — Export CSV — nom de fichier translittéré (accents supprimés). Priorité Basse. Couverture auto : aucune.

**ORG-115** — Filtres statistiques (période/place) déclenchent un nouveau fetch sans rechargement de page. Priorité Moyenne. Couverture auto : aucune.

**ORG-116** — Section revente — visible seulement si activité de revente >0, identité vendeur/acheteur jamais communiquée à l'organisateur. Priorité Moyenne. Couverture auto : aucune.

**ORG-117** — Section démographie masquée si aucune donnée d'âge/genre connue. Priorité Basse. Couverture auto : aucune.

### 4.13 Garde-fous transverses (permissions.ts) — accès selon statut de dossier

**ORG-118** — `canCreateEvent` refuse un organisateur avec `orgStatus='pending'` (message : "Ton compte organisateur est en cours de validation."). Priorité Critique. Couverture auto : logique documentée dans `permissions.ts`, pas de test unitaire dédié identifié explicitement.

**ORG-119** — `canCreateEvent` refuse un organisateur avec `orgStatus='rejected'`. Priorité Critique. Couverture auto : aucune identifiée explicitement pour ce cas précis.

**ORG-120** — `canCreateEvent` autorise toujours un `activeRole='agent'`, quel que soit `orgStatus`. Priorité Moyenne. Couverture auto : aucune.

**ORG-121** — `canCreateEvent` refuse tout `activeRole` différent de `'organisateur'`/`'agent'`, même si `roles[]` contient `'organisateur'` — la garde vérifie exclusivement `activeRole`, jamais `roles[]`. Priorité Critique. Couverture auto : aucune identifiée pour ce scénario précis de bascule de rôle actif — **test prioritaire recommandé**.

**ORG-122 — RÉGRESSION À NE JAMAIS RÉINTRODUIRE** — Compte double rôle organisateur+prestataire : un dossier prestataire `pending` ne doit jamais dégrader l'accès organisateur déjà actif (`orgStatus` et `prestStatus` sont indépendants, aucun statut global de compte ne doit écraser l'un des deux rôles). Priorité Critique. Couverture auto : `applications.integration.test.ts` (test nommé explicitement pour cette régression).

**ORG-123** — Asymétrie `canCreateEvent` vs `canProposeServices` sur le statut `pending` — **finding de review de code, pas un bug à corriger silencieusement** : `canProposeServices` ne bloque actuellement que sur `'rejected'`, pas sur `'pending'`, contrairement à `canCreateEvent` qui bloque les deux. À faire confirmer par le produit avant toute correction. Priorité Haute. Couverture auto : aucune trouvée pour ce cas précis — gap à combler en priorité.

**ORG-124** — Garde de réservation client (`getBookingBlockedReason`) interdit aux organisateurs/prestataires/agents d'acheter en tant que client. Priorité Basse. Couverture auto : aucune identifiée explicitement dans le périmètre listé.


---

## 5. Compte Prestataire — candidature, page publique, catalogue, abonnement, avis

### 5.0 Périmètre et fichiers couverts

Cette section couvre le parcours complet du compte Prestataire : `app/components/PrestataireOnboardingWizard.tsx` (candidature en 6 étapes), `app/(app)/offer-services/{page.tsx,ProposerServicesClient.tsx,SubscriptionPanel.tsx}` (« Mon espace prestataire » — profil public, catalogue, avis et abonnement fusionnés), `app/(public)/providers/[id]/page.tsx` + `app/components/ProviderCatalogInquiry.tsx` (page publique + demande de devis), `app/components/ProviderReviewsClient.tsx` (avis), et la logique serveur `lib/server/{providerProfile,providerSubscriptions,providerBilling,providerReviews,providers,permissions,messaging,applications}.ts` + `lib/shared/providerCategories.ts`.

**Constat de code notable :** `app/(app)/offer-services/page.tsx` applique `canProposeServices` avant de charger l'espace. Un dossier rejeté est bloqué, tandis qu'un dossier en attente conserve volontairement l'accès à la préparation de son espace.

---

### 5.1 Candidature prestataire (onboarding)

**PROV-001 — Candidature anonyme complète, tous documents fournis, soumission réussie**
Priorité : Critique
Préconditions : Aucun compte existant avec l'email utilisé ; accès à `/inscription-prestataire` (mode `anonymous`).
Étapes :
1. Étape « Compte » : renseigner prénom, nom, indicatif + téléphone, ville, pays (ex. France), email valide, mot de passe conforme à la politique (`getPasswordPolicyErrors`), confirmation identique. Cliquer Continuer.
2. Étape « Activités » : sélectionner au moins une catégorie parmi `PROVIDER_CATEGORIES` (ex. « Artistes, DJ & animation »), remplir nom commercial, description, au moins une zone d'intervention. Continuer.
3. Étape « Détails » : remplir les champs spécifiques à la catégorie choisie (ex. type d'artiste, tarif min/max, type de tarif) ou cocher « Sur devis uniquement ». Continuer (validation `validatePrestataireStep2`).
4. Étape « Fonctionnement » : lire, Continuer.
5. Étape « Documents » : uploader tous les documents requis retournés par `getRequiredDocs('prestataire', prestataireTypes)` pour la/les catégorie(s) choisie(s) (ex. pour « artiste » seul : `identity` + `billing_proof`). Continuer.
6. Étape « Finaliser » : vérifier le message « Tous les documents obligatoires sont fournis » ; saisir une note optionnelle ; cliquer « Envoyer ma demande ».
Résultat attendu : POST `/api/applications/prestataire/register` avec `{email, password, formData, documents, candidateNote}` ; écran de confirmation « Demande envoyée » affichant l'email ; aucun compte n'existait avant cette soumission finale (pas de compte fantôme créé à l'étape « Compte », conformément au commentaire de tête du wizard). Le prix affiché à l'étape 5 dépend du pays (XOF via `PROVIDER_SUB` vs « 9,99 € / mois ») mais n'active **aucun** abonnement.
Couverture auto existante : `lib/server/__tests__/applicationsPrestataire.integration.test.ts` → `registerAndSubmitPrestataireApplication` (« crée le compte ET la candidature en un seul appel »).

**PROV-002 — Candidature bloquée : documents obligatoires manquants**
Priorité : Critique
Préconditions : Wizard rempli jusqu'à l'étape Documents, catégorie « salle » sélectionnée (exige `business_doc` + `insurance` + `exploitation_proof` en plus d'`identity`).
Étapes : Ne fournir que la pièce d'identité, tenter de passer à l'étape Finaliser puis cliquer « Envoyer ma demande ».
Résultat attendu : Message « Documents manquants : … » listant les clés absentes ; bouton de soumission désactivé (`disabled={... || missingDocs.length > 0}`) ; aucun appel réseau de soumission déclenché.
Couverture auto existante : `applicationsPrestataire.integration.test.ts` → « refuse une catégorie "salle" sans business_doc/insurance/exploitation_proof même avec identity fourni » et « getRequiredDocs cumule pour un prestataire multi-catégories ».

**PROV-003 — Email déjà utilisé (mode anonyme)**
Priorité : Haute
Préconditions : Un compte existe déjà avec l'email cible.
Étapes : Compléter tout le wizard anonyme jusqu'à la soumission avec cet email.
Résultat attendu : Réponse serveur `email_taken` ; message affiché : « Cet email est déjà associé à un compte. Connecte-toi à ce compte, puis débloque l'interface prestataire depuis ton profil. » ; aucun doublon de compte créé.
Couverture auto existante : `applicationsPrestataire.integration.test.ts` → « refuse un email déjà utilisé ».

**PROV-004 — Mot de passe trop court / formulaire invalide (mode anonyme)**
Priorité : Moyenne
Étapes : À l'étape Compte, saisir un mot de passe de 4 caractères puis Continuer.
Résultat attendu : Blocage côté client avant tout appel réseau (`getPasswordPolicyErrors`), message d'erreur du premier problème détecté. Idem si `validatePrestataireStep0`/`validatePrestataireStep2` échoue (ex. champ obligatoire vide) : aucun accès à l'étape suivante.
Couverture auto existante : `applicationsPrestataire.integration.test.ts` → « refuse un mot de passe trop court », « refuse un formulaire invalide », « ne crée aucun compte si le formulaire est invalide », « ne crée aucun compte si les documents requis manquent ».

**PROV-005 — Upload de document : limites de quantité**
Priorité : Moyenne
Préconditions : Étape Documents du wizard.
Étapes : 1) Tenter d'ajouter 6 fichiers d'un coup dans une même catégorie de document. 2) Après avoir déjà 8 fichiers répartis sur plusieurs catégories, tenter d'en ajouter 3 de plus.
Résultat attendu : (1) message « Maximum 5 fichiers par catégorie. » sans appel d'upload. (2) message « Maximum 10 fichiers pour le dossier complet. » (limite globale, `totalCount + files.length > 10`). Le compteur `categoryCount`/`totalCount` doit refléter l'état réel avant blocage.
Couverture auto existante : aucune (logique purement client dans `PrestataireOnboardingWizard.tsx::handleFileChange`) — à tester manuellement.

**PROV-006 — Upload de document échoué (réseau / format)**
Priorité : Moyenne
Étapes : Sélectionner un fichier non supporté ou couper la connexion pendant l'upload (`uploadApplicationDocument`).
Résultat attendu : Message d'erreur (`uploadError.message` ou fallback « Impossible d'envoyer le document. ») ; `uploadingDocs` repasse à `false` ; possibilité de retenter sans recharger la page ; le document non uploadé n'apparaît pas dans la liste, donc reste compté comme manquant en étape Finaliser.
Couverture auto existante : aucune identifiée côté intégration (upload Cloudinary mocké dans les tests serveur, pas testé côté composant).

**PROV-007 — Candidature en mode connecté (`loggedIn`) : autosauvegarde de brouillon**
Priorité : Haute
Préconditions : Utilisateur connecté sans dossier prestataire, accès à `/onboarding-prestataire`.
Étapes : Remplir l'étape « Compte », cliquer Continuer.
Résultat attendu : POST `/api/applications/prestataire/draft` déclenché avec le `formData` courant ; indicateur "Sauvegarde du brouillon…" puis "Brouillon sauvegardé." (ou message d'erreur si `res.ok` est faux) ; en cas de rafraîchissement de page, le formulaire est réhydraté via `initialFormData`/`initialCandidateNote`.
Couverture auto existante : `applicationsPrestataire.integration.test.ts` → « getMyApplication / saveApplicationDraft » (« crée un brouillon et le relit »).

**PROV-008 — Soumission finale en mode connecté**
Priorité : Critique
Étapes : Compléter le wizard jusqu'à Finaliser en mode `loggedIn`, cliquer « Soumettre mon dossier ».
Résultat attendu : POST `/api/applications/prestataire/submit` ; redirection vers `/my-application` ; côté serveur, le rôle actif bascule et `prestStatus` passe à `pending`.
Couverture auto existante : `applicationsPrestataire.integration.test.ts` → « soumet avec succès : bascule le rôle actif et pose prestStatus=pending ».

**PROV-009 — Candidature prestataire d'un organisateur déjà actif (garde-fou multi-rôle)**
Priorité : Critique
Préconditions : Compte avec `activeRole=organisateur`, `orgStatus=active`, qui soumet une candidature prestataire.
Étapes : Depuis un compte organisateur actif, compléter et soumettre le dossier prestataire.
Résultat attendu : `orgStatus` reste `active` (l'interface organisateur reste accessible) pendant que `prestStatus` passe à `pending` — jamais de régression sur l'interface déjà validée. Confirme la garantie documentée dans `CLAUDE.md` (« un organisateur déjà actif qui candidate en plus comme prestataire ne doit pas se retrouver bloqué de ses deux interfaces »).
Couverture auto existante : `applicationsPrestataire.integration.test.ts` → « un organisateur déjà actif qui candidate en prestataire ne perd pas orgStatus=active ».

**PROV-010 — Rejet puis resoumission (`needs_changes` → `resubmitted`)**
Priorité : Haute
Préconditions : Dossier prestataire existant avec statut `needs_changes` (renvoyé par un agent).
Étapes : Rouvrir le wizard en mode connecté, modifier les champs demandés, soumettre à nouveau.
Résultat attendu : Le statut de la candidature passe à `resubmitted` (pas un nouveau dossier créé) ; les documents précédemment fournis restent visibles/réutilisables sauf ceux explicitement retirés.
Couverture auto existante : `applicationsPrestataire.integration.test.ts` → « resoumission après needs_changes passe le statut à resubmitted ».

**PROV-011 — Candidature réellement rejetée (`prestStatus=rejected`) : accès à l'espace prestataire**
Priorité : Critique
Préconditions : Compte avec `roles` incluant `prestataire` mais `prestStatus='rejected'`.
Étapes : Se connecter, naviguer vers `/offer-services`.
Résultat attendu attendu par le produit : l'accès devrait être bloqué ou l'utilisateur redirigé/informé du rejet (parallèle à `canCreateEvent`/`getCreateEventBlockedReason` côté organisateur qui gère explicitement 'rejected'). **Constat de code** : `app/(app)/offer-services/page.tsx::requireProviderRole` ne vérifie que `roles.includes('prestataire')`, sans lire `prestStatus` — à vérifier manuellement si un compte rejeté peut malgré tout accéder à la page et modifier son profil/catalogue. Documenter l'écart s'il est confirmé.
Couverture auto existante : aucune couverture directe de ce chemin (seule la fonction pure `canProposeServices` est testée unitairement, jamais son branchement réel sur cette route).

---

### 5.2 Page publique prestataire (profil) et catalogue

**PROV-012 — Édition du profil : nom, description, ville/pays, zones d'intervention**
Priorité : Haute
Préconditions : Compte prestataire actif sur `/offer-services`.
Étapes : Modifier nom, headline (≤140 car.), description (≤1000 car.), ville, « Pays de base » (`regionId`), cocher/décocher des zones d'intervention (y compris « International »). Enregistrer.
Résultat attendu : `updateProviderProfile` : le nom vide est rejeté (`name_required`) ; la description/headline sont tronquées aux limites indiquées sans erreur ; changer `regionId` ne modifie **jamais** la devise de facturation (`providerBillingRegionId` reste séparé, voir commentaire dans `providerProfile.ts`) ; si « International » est coché, `zonesIntervention` devient `['international']` exclusivement (toute autre zone est écrasée) ; sinon le `regionId` courant est toujours implicitement inclus dans `zonesIntervention` même s'il n'a pas été coché explicitement.
Couverture auto existante : `providerProfile.integration.test.ts` → section `updateProviderProfile` (garanties zonesIntervention/regionId à vérifier précisément dans ce fichier — mêmes règles que `organizerProfile.ts`).

**PROV-013 — Édition du profil : réseaux sociaux et site web (double écriture legacy)**
Priorité : Moyenne
Étapes : Renseigner un lien Instagram et un site web, enregistrer, recharger la page.
Résultat attendu : `website` est écrit à la fois en top-level (`profile.website`) et dans `socialLinks.website` (toujours synchronisés, compat lecture ancienne) ; une URL invalide est neutralisée (`socialUrl` renvoie `''`) sans faire planter la sauvegarde.
Couverture auto existante : à confirmer dans `providerProfile.integration.test.ts` (probable, non lu en détail ici) — sinon test manuel requis.

**PROV-014 — Upload photo de profil (avatar) et couverture**
Priorité : Haute
Étapes : Sur `/offer-services`, uploader une image comme avatar (recadrage via `ImageCropperModal`), puis une couverture.
Résultat attendu : `uploadProviderProfileMedia(caller, 'avatar'|'cover', dataUri)` : seuls les MIME types image autorisés (`IMAGE_MIME_TYPES`) sont acceptés ; en cas de type non supporté, erreur propre sans upload partiel ; `photoUrl`/`coverUrl` mis à jour et immédiatement visibles sur la page publique (`app/(public)/providers/[id]/page.tsx`, cover en `background` dégradé si absente, avatar remplacé par l'initiale du nom si absent).
Couverture auto existante : à vérifier dans `providerProfile.integration.test.ts` (fonction `uploadProviderProfileMedia`) — sinon manuel.

**PROV-015 — Catégories d'activité (`prestataireTypes`) : ajout/retrait post-candidature**
Priorité : Haute
Étapes : Depuis `/offer-services`, ajouter une deuxième catégorie parmi `PROVIDER_CATEGORIES` (ex. ajouter « Food & boissons » à un profil « Artiste »), enregistrer.
Résultat attendu : `normalizeProviderTypes` déduplique et ne garde que des ids valides (alias legacy comme `'dj'`→`'artiste'`, `'traiteur'`→`'food'` normalisés via `LEGACY_TYPE_ALIASES`) ; `prestataireType` (primaire) recalculé via `getPrimaryProviderType` = premier type normalisé ; les badges de catégories sur la page publique (`getProviderCategories`) reflètent immédiatement le nouvel ensemble ; les libellés de catégories de catalogue proposés (`CATALOG_CATEGORIES`) s'enrichissent en conséquence pour un nouvel item.
Couverture auto existante : `lib/server/__tests__/providerCategories.test.ts` (couvre `normalizeProviderType(s)`, alias legacy, `getPrimaryProviderType`) + volet update dans `providerProfile.integration.test.ts`.

**PROV-016 — Ajout d'un item de catalogue (nom, prix, unité, catégorie)**
Priorité : Critique
Préconditions : Profil prestataire existant, devise dérivée du pays de facturation (ex. EUR).
Étapes : Ajouter un item « DJ set », prix 250, unité « soirée », catégorie « DJ set ». Enregistrer.
Résultat attendu : `addCatalogItem` : `name` obligatoire (rejet `name_required` si vide/espaces) ; item créé avec `id` généré (`item-<hex>`), `available:true` par défaut, `media:[]`, `createdAt` posé. La devise de l'item suit `resolveCatalogCurrency` : seule une sélection **explicite** de `'XOF'` est conservée telle quelle ; toute autre valeur (y compris `'EUR'` explicitement choisi alors que le compte facture en XOF) retombe systématiquement sur `profile.catalogCurrency` — comportement legacy volontaire à ne pas « corriger ».
Étapes de test additionnelles pour vérifier ce quirk : créer un item en explicitant `currency: 'EUR'` sur un profil dont `catalogCurrency` est `XOF` → l'item doit être enregistré en XOF (pas EUR).
Couverture auto existante : `providerProfile.integration.test.ts` (section Catalogue — `addCatalogItem`), quirk devise à confirmer par lecture complète du fichier de test.

**PROV-017 — Modification d'un item de catalogue (patch partiel)**
Priorité : Haute
Étapes : Modifier uniquement le prix d'un item existant (laisser nom/description/unité intacts). Enregistrer.
Résultat attendu : `updateCatalogItem` applique un patch champ par champ (seuls les champs `!== undefined` sont modifiés) ; `item_not_found` si l'id ne correspond à aucun item du **propre** catalogue de l'appelant ; `name` vide rejeté avec `name_required` si fourni vide.
Couverture auto existante : `providerProfile.integration.test.ts` (Catalogue — `updateCatalogItem`).

**PROV-018 — Bascule disponibilité d'un item (`available`)**
Priorité : Haute
Étapes : Désactiver un item disponible (toggle « Disponible » → off). Enregistrer. Visiter la page publique du prestataire dans un autre onglet.
Résultat attendu : L'item n'apparaît plus dans `visibleCatalog` de la page publique (`item.available !== false`) ; le bouton « Demander ce service » n'est plus proposé pour cet item. Un `catalogItemId` correspondant à un item désactivé doit être rejeté côté serveur si soumis quand même via l'API messagerie (`catalog_item_not_found` — voir PROV-024).
Couverture auto existante : `providerProfile.integration.test.ts` (Catalogue) pour la mutation ; le filtrage page publique est couvert indirectement par `providers.ts::isNonGhost`/tests associés le cas échéant.

**PROV-019 — Suppression d'un item de catalogue**
Priorité : Haute
Étapes : Supprimer un item existant.
Résultat attendu : `deleteCatalogItem` retire l'item de `profile.catalog` ; `item_not_found` (404) si l'id n'existe pas ou appartient à un autre prestataire ; l'item disparaît immédiatement de la page publique et ne peut plus être référencé pour une demande de devis.
Couverture auto existante : `providerProfile.integration.test.ts` (Catalogue — `deleteCatalogItem`).

**PROV-020 — Ajout de médias à un item de catalogue (limite 4, image/vidéo)**
Priorité : Haute
Préconditions : Item de catalogue existant avec 0 média.
Étapes : Ajouter successivement 4 médias (mix image/vidéo) via `addCatalogItemMedia`, puis tenter d'en ajouter un 5ᵉ.
Résultat attendu : Les 4 premiers ajouts réussissent (`type` déduit : `'video'` si `resourceType==='video'` ou `dataUri` commence par `data:video`, sinon `'image'`) ; le 5ᵉ ajout est rejeté avec `media_limit_reached` (409) sans muter `profile.catalog`. Les deux chemins d'upload (`{dataUri}` legacy et `{upload: PublicMediaUploadReference}` vérifié côté serveur) doivent être couverts : un upload de référence invalide/forgée renvoie `invalid_media_upload` (400) via `verifyPublicMediaUploadReference`.
Couverture auto existante : à confirmer dans `providerProfile.integration.test.ts` (fonction `addCatalogItemMedia`) — sinon manuel, notamment le cas `MAX_CATALOG_ITEM_MEDIA`.

**PROV-021 — Suppression d'un média d'item de catalogue (index invalide)**
Priorité : Moyenne
Étapes : Sur un item à 2 médias, appeler suppression avec `mediaIndex=5`.
Résultat attendu : `invalid_media_index` (400), aucun média supprimé ; suppression avec un index valide retire bien le média ciblé (`splice`), les index des médias restants se décalent (attention UI si plusieurs suppressions rapides sans re-fetch).
Couverture auto existante : à confirmer dans `providerProfile.integration.test.ts`.

**PROV-022 — Vignette d'aperçu d'un item avec vidéo en premier média**
Priorité : Basse
Préconditions : Item de catalogue dont `media[0].type === 'video'`.
Étapes : Consulter la page publique du prestataire.
Résultat attendu : Le premier bloc média de la carte catalogue affiche bien le lecteur vidéo (`<video controls preload="metadata">`), mais l'image utilisée dans la modale « Demander ce service » (`inquiryImage`) privilégie une image si l'item en a une (`item.media?.find(m => m.type !== 'video')?.url`), sinon retombe sur le premier média quel qu'il soit — donc peut aussi être une vidéo dans la modale si aucune image n'existe.
Couverture auto existante : aucune identifiée (logique de présentation pure, non testée en unitaire).

**PROV-023 — Visibilité annuaire : profil « fantôme » exclu**
Priorité : Haute
Préconditions : Profil prestataire avec `subscriptionActive:true` mais sans `name`/`photoUrl`/`description`/`city`/`location`/`regionId`/`zonesIntervention` ET sans item de catalogue disponible.
Étapes : Consulter `/providers` (annuaire public).
Résultat attendu : Ce profil est exclu de la liste (`isNonGhost` retourne `false` : ni `hasBasics` ni `hasVisibleCatalog`) même si l'abonnement est actif — un profil vide n'encombre pas l'annuaire.
Couverture auto existante : aucun test unitaire identifié pour `isNonGhost`/`listPublicProviders` dans `lib/server/providers.ts` (pas de fichier `providers.test.ts` repéré) — écrire un test manuel ciblé.

---

### 5.3 Demande de devis depuis un item de catalogue (`ProviderCatalogInquiry`)

**PROV-024 — Demande de devis : conversation créée/réutilisée + payload reconstruit côté serveur**
Priorité : Critique
Préconditions : Utilisateur connecté (rôle client ou organisateur), page publique d'un prestataire avec au moins un item de catalogue disponible.
Étapes :
1. Cliquer « Demander ce service » sur un item → vérifier le texte pré-rempli (« Bonjour {providerName}, je suis intéressé par « {item.name} ». Peux-tu me donner plus d'informations ? »).
2. Ajouter un complément de texte, cliquer « Envoyer la demande ».
Résultat attendu : POST `/api/conversations` `{otherUserId: providerId}` crée ou récupère une conversation **directe** existante avec ce prestataire (pas de doublon si une conversation existait déjà) ; POST `/api/conversations/{id}/messages` avec `{type:'catalog_item', content:'', catalogItemId: item.id}` — le `content` réel du message est **entièrement reconstruit côté serveur** par `sendMessage` (`lib/server/messaging.ts`) à partir du **vrai catalogue Mongo** du destinataire de la conversation (`otherId` = l'autre participant), jamais depuis une valeur envoyée par le client. Le message texte complémentaire est envoyé ensuite en `type:'text'` séparé. Redirection finale vers `/messages?conversationId=...`.
3. Vérifier dans la conversation que le message catalogue affiche bien le nom/prix/unité/catégorie/image RÉELS de l'item (pas des valeurs modifiables côté client).
Couverture auto existante : `lib/server/__tests__` — aucun fichier dédié `messaging` listé dans la consigne, mais le comportement est documenté en commentaire dans `messaging.ts` (ligne ~538+) ; vérifier l'existence d'un test de `sendMessage` type `catalog_item` (hors périmètre des fichiers listés — à confirmer, sinon combler le gap).

**PROV-025 — Tentative de forger un `catalogItemId` d'un AUTRE prestataire**
Priorité : Critique (sécurité)
Préconditions : Deux prestataires A et B, chacun avec un catalogue. Une conversation directe ouverte avec A.
Étapes : Dans la conversation avec A, appeler directement l'API (ou via un outil réseau) `POST /api/conversations/{convWithA}/messages` avec `{type:'catalog_item', catalogItemId: <id d'un item du catalogue de B>}`.
Résultat attendu : `catalog_item_not_found` (404) — le serveur dérive `provider` de l'**autre participant de la conversation ciblée** (A), jamais d'un `providerId` fourni par le client ; un item de B ne peut jamais matcher dans le catalogue de A, quel que soit l'id soumis. Aucun message n'est créé.
Couverture auto existante : commentaire explicite dans le code (`messaging.ts` ligne ~635-639) mais pas de test automatisé identifié dans les fichiers listés pour cette tâche — **gap à combler**, priorité haute pour un test automatisé de non-régression.

**PROV-026 — Demande de devis sur un item retiré/masqué (`available:false`)**
Priorité : Haute
Préconditions : Item de catalogue avec `available:false` (désactivé par le prestataire après affichage initial côté client, ou race condition).
Étapes : Soumettre un `catalogItemId` pointant vers cet item désactivé (le bouton ne devrait normalement plus être visible en UI, donc ce test simule un payload direct/rejoué).
Résultat attendu : `catalog_item_not_found` — le filtre `i.id === catalogItemId && i.available !== false` exclut les items masqués ; un item retiré ne redevient jamais référençable via un id capturé avant sa désactivation.
Couverture auto existante : voir commentaire ligne ~629-633 de `messaging.ts` — à confirmer par test automatisé dédié (gap probable).

**PROV-027 — Demande de devis non connecté**
Priorité : Moyenne
Étapes : Sur la page publique d'un prestataire, non connecté, cliquer « Demander ce service ».
Résultat attendu : Redirection vers `/login?next=<pathname encodé>`, aucun appel à `/api/conversations` déclenché.
Couverture auto existante : aucune (comportement purement client dans `ProviderCatalogInquiry.tsx::openSheet`).

**PROV-028 — Demande de devis vers un prestataire qui a bloqué l'utilisateur (ou inversement)**
Priorité : Haute
Préconditions : L'un des deux comptes a bloqué l'autre (`blockedUserIds`).
Étapes : Tenter d'envoyer une demande de devis.
Résultat attendu : Erreur `blocked` retournée par `/api/conversations`, message affiché « Impossible de contacter ce prestataire. » ; aucune conversation créée.
Couverture auto existante : logique générique de blocage dans `messaging.ts` (`loadParticipantConversation`/garde blocage) — probablement couverte par les tests génériques de messagerie (hors périmètre des fichiers listés ici).

**PROV-029 — Prestataire consultant sa propre page : pas de bouton « Demander ce service »**
Priorité : Basse
Préconditions : Prestataire connecté visitant `/providers/{son-propre-id}`.
Étapes : Observer la section Catalogue.
Résultat attendu : `isSelf` est vrai → aucun composant `ProviderCatalogInquiry` rendu pour ses propres items (`{!isSelf && (...)}` dans `page.tsx`).
Couverture auto existante : aucune (rendu conditionnel simple, à vérifier visuellement).

---

### 5.4 Abonnement prestataire (visibilité, EUR/Stripe vs XOF/FedaPay)

**PROV-030 — Achat abonnement rail EUR (Stripe) : checkout puis activation**
Priorité : Critique
Préconditions : `providerBillingRegionId` dérivant une devise EUR, aucun abonnement actif.
Étapes : Depuis `/offer-services?tab=abonnement`, cliquer « Activer mon abonnement ». Compléter le paiement Stripe test.
Résultat attendu : `createStripeSubscriptionCheckout` crée une session Stripe (`mode:'subscription'`, `plan=SUBSCRIPTION.PRESTATAIRE`) ; `prestataireSubActive` reste `false` tant que le paiement n'est pas confirmé (ni au moment de la création de session) ; au retour réussi, `confirmStripeSubscriptionCheckout` ou le webhook `checkout.session.completed` active immédiatement (`mirrorStripeStatus` avec `active:true`) et rend le profil visible dans l'annuaire (`subscriptionActive:true` sur `ProviderProfile`).
Couverture auto existante : `providerSubscriptions.integration.test.ts` → « crée une session Checkout et ne mute pas prestataireSubActive avant paiement », « webhook Stripe — checkout.session.completed — active immédiatement au retour de checkout, avant customer.subscription.* ».

**PROV-031 — Rail EUR : refus si le pays de facturation est XOF, et inversement**
Priorité : Haute
Étapes : (a) Compte facturant en XOF appelant l'endpoint Stripe. (b) Compte facturant en EUR appelant l'endpoint FedaPay.
Résultat attendu : (a) `wrong_rail_use_fedapay` (409). (b) `wrong_rail_use_stripe` (409). Les deux rails sont strictement cloisonnés, jamais mélangés.
Couverture auto existante : `providerSubscriptions.integration.test.ts` → « refuse si le pays de facturation est XOF » (Stripe) et « refuse si le pays de facturation est EUR » (FedaPay).

**PROV-032 — Achat déjà actif : `alreadyActive`**
Priorité : Moyenne
Préconditions : Abonnement Stripe déjà actif.
Étapes : Cliquer à nouveau sur « Activer mon abonnement » (ou double-clic rapide).
Résultat attendu : Réponse `{ok:true, alreadyActive:true, status}` sans créer de deuxième session Checkout ; message côté UI « Ton abonnement est déjà actif. » ; le verrou anti-double-clic (`CronLock` 25s, `sub_checkout_<uid>`) empêche une double session concurrente même si l'utilisateur re-clique très vite avant la réponse.
Couverture auto existante : `providerSubscriptions.integration.test.ts` → « renvoie alreadyActive si déjà abonné », « mirror actif si un stripeSubscriptionId existant est toujours actif côté Stripe ».

**PROV-033 — Achat abonnement rail XOF (FedaPay) et renouvellement manuel**
Priorité : Critique
Préconditions : Compte facturant en XOF, aucun abonnement actif.
Étapes : Depuis `/offer-services?tab=abonnement`, cliquer le CTA XOF (`handleFedapaySubscribe`), compléter le paiement Mobile Money simulé, revenir sur le site.
Résultat attendu : `createFedapaySubscriptionCheckout` crée une transaction FedaPay pour `PROVIDER_SUB.price` et pose `pendingFedapaySubTxnId` ; le webhook `handleFedapaySubscriptionPayment` vérifie que le montant payé correspond exactement (`transactionAmountMatches`) — en cas de non-correspondance, crée une `PaymentAlert` (`sub_amount_mismatch`) et **ne prolonge rien** ; en cas de correspondance, prolonge de `PROVIDER_SUB.periodDays` jours à partir de l'expiration précédente (jamais depuis « maintenant » si l'abonnement est renouvelé en avance) et active `subscriptionActive` sur le profil.
Couverture auto existante : `providerSubscriptions.integration.test.ts` → « crée une transaction FedaPay et pose le registre pendingFedapaySubTxnId », « crée une PaymentAlert et ne mirrore rien si le montant ne correspond pas », « prolonge l'abonnement de PROVIDER_SUB.periodDays jours pour un premier paiement », « prolonge depuis l'expiration actuelle (pas depuis maintenant) pour un renouvellement anticipé ».

**PROV-034 (P0 sécurité/produit) — Effet de l'abonnement sur la visibilité annuaire (activation)**
Priorité : Critique
Préconditions : Profil prestataire complet (non-fantôme) mais `subscriptionActive:false`.
Étapes : 1) Vérifier que le profil n'apparaît pas dans `/providers` ni n'est trouvable en recherche/annuaire. 2) Vérifier que le propriétaire peut néanmoins consulter sa propre page publique (`isProviderVisible` : `viewer.id === ownerUserId`). 3) Activer l'abonnement (Stripe ou FedaPay selon le pays). 4) Revérifier l'annuaire.
Résultat attendu : Avant activation : invisible pour tout visiteur tiers (client/organisateur), visible pour le propriétaire et pour un `activeRole==='agent'` (`isProviderVisible`). Après activation réussie : apparaît dans `listPublicProviders()` (triée par `updatedAt` décroissant — pas de « ranking » qualitatif au-delà de la fraîcheur de mise à jour, à documenter si le produit attend un tri différent). `listPublicProviders` filtre en base sur `subscriptionActive:true` — impossible pour un profil non abonné d'apparaître même en modifiant le tri/la recherche côté client.
Couverture auto existante : logique pure `isProviderVisible`/`isNonGhost` non testée en unitaire dans les fichiers fournis (pas de `providers.test.ts` identifié) — gap à combler ; le côté « mise à jour de `subscriptionActive`» est bien couvert par les tests d'intégration ci-dessus, mais pas le filtrage de l'annuaire lui-même.

**PROV-035 — Résiliation Stripe et effet immédiat sur la visibilité**
Priorité : Haute
Préconditions : Abonnement Stripe actif et visible dans l'annuaire.
Étapes : Simuler un webhook `customer.subscription.deleted`.
Résultat attendu : `handleStripeSubscriptionEvent(sub, deleted=true)` → `active:false`, `status:'canceled'` ; mirroring sur `User` ET sur `ProviderProfile` (si celui-ci existe) → `subscriptionActive:false`, `subscriptionStatus:'expired'` ; le profil disparaît immédiatement de l'annuaire au prochain chargement (pas besoin d'attendre le cron).
Couverture auto existante : `providerSubscriptions.integration.test.ts` → « customer.subscription.deleted désactive et mirrore ProviderProfile si présent ».

**PROV-036 — Cron de rappels XOF : expiration automatique et non-double-envoi**
Priorité : Haute
Préconditions : Profils XOF à différents jalons (`dueReminders`) dont un déjà expiré (`subscriptionExpiresAt` dépassé), certains avec des rappels déjà envoyés pour le cycle courant.
Étapes : Exécuter `runSubscriptionReminderCron` deux fois de suite (même cycle).
Résultat attendu : Premier passage : envoie les emails dus, masque (`subscriptionActive:false`, `subscriptionStatus:'expired'`) les profils dont le statut dérivé est `expired`, incrémente le compteur `hidden`. Deuxième passage immédiat : aucun email renvoyé pour un jalon déjà marqué comme envoyé dans `subReminders.sent` pour le même `cycleKey` ; verrou `CronLock` empêche une exécution concurrente du même cron (`SUB_REMINDER_LOCK_ID`).
Couverture auto existante : `providerSubscriptions.integration.test.ts` → « envoie les rappels dus, masque les profils expirés et ne renvoie pas deux fois le même jalon ».

**PROV-037 — Changement de pays de facturation : interdit une fois abonné**
Priorité : Haute
Préconditions : Abonnement actif (`prestataireSubActive:true`).
Étapes : Tenter de changer le pays de facturation vers une région d'une autre devise (ex. France → Togo) via l'endpoint dédié.
Résultat attendu : `setProviderBillingRegion` renvoie `subscription_active` (409) si le nouveau `regionId` diffère de l'actuel et que `canChange` est faux (`user.prestataireSubActive === true`) — protège contre un changement de rail de paiement à abonnement actif (incohérence Stripe récurrent ↔ FedaPay ponctuel). Un changement vers la **même** devise mais un pays différent au sein d'une devise identique... (vérifier si `canChange` bloque même les régions de même devise — actuellement le check est sur `nextRegionId !== current.billingRegionId`, indépendant de la devise : à tester explicitement, ex. passer de France à Belgique si les deux sont EUR, avec abonnement actif → devrait aussi être bloqué selon le code actuel, à confirmer).
Couverture auto existante : `lib/server/__tests__/providerBillingRegion.test.ts` (normalisation/devise) + `providerBilling.integration.test.ts` (contexte facturation) — le cas précis du blocage à abonnement actif à confirmer dans ces fichiers.

**PROV-038 — Défaut de pays de facturation dérivé du dossier de candidature**
Priorité : Basse
Préconditions : Compte prestataire sans `providerBillingRegionId` explicite, ayant un dossier de candidature avec `pays` renseigné (ex. Togo).
Étapes : Premier accès à l'onglet `/offer-services?tab=abonnement`.
Résultat attendu : `deriveDefaultBillingRegion` dérive le pays depuis le dernier dossier prestataire (`Application.findOne({type:'prestataire'}).sort({updatedAt:-1})`) plutôt que de forcer `'france'` par défaut ; la valeur est persistée sur `User.providerBillingRegionId` dès ce premier appel (pas seulement en mémoire).
Couverture auto existante : `providerBillingRegion.test.ts` / `providerBilling.integration.test.ts` — à confirmer précisément.

**PROV-039 — Historique des paiements affiché**
Priorité : Basse
Étapes : Sur `/offer-services?tab=abonnement`, consulter la section « Historique des paiements » après plusieurs cycles de paiement (Stripe et/ou FedaPay).
Résultat attendu : Chaque paiement confirmé (`invoice.paid` Stripe ou webhook FedaPay approuvé) apparaît une seule fois (clé d'idempotence `${rail}:${externalId}` avec `$setOnInsert`) — un replay du même événement webhook ne duplique pas la ligne ; lien « Voir le reçu » présent pour Stripe (`invoice_pdf`/`hosted_invoice_url`) si disponible, badge « PAYÉ » sinon (cas FedaPay, pas de reçu hébergé).
Couverture auto existante : `providerSubscriptions.integration.test.ts` → « historique Stripe — enregistre invoice.paid une seule fois et l'expose au propriétaire ».

---

### 5.5 Avis reçus et signalement

**PROV-040 — Publier un premier avis sur un prestataire**
Priorité : Haute
Préconditions : Client ou organisateur connecté, différent du prestataire, sur la page publique de celui-ci.
Étapes : Choisir une note (1 à 5), rédiger un commentaire respectant `REVIEW_COMMENT_MIN`/`REVIEW_COMMENT_MAX`, publier.
Résultat attendu : `createReview` : rejet si `providerId === caller.id` (`cannot_review_self`), si note non entière hors [1,5] (`invalid_rating`), si commentaire trop court (`comment_too_short`). Sur succès : review créée `status:'published'`, `verified:false` (toujours faux dans cette migration, aucun système de commande réelle), `ratingAvg`/`ratingCount` du profil recalculés immédiatement (`recomputeProviderRating`, moyenne arrondie à 1 décimale sur les avis `published` uniquement).
Couverture auto existante : `lib/server/__tests__/providerReviews.integration.test.ts` (à confirmer contenu détaillé, non lu intégralement — probable couverture directe de `createReview`).

**PROV-041 — Modifier son propre avis publié**
Priorité : Moyenne
Préconditions : Avis déjà publié par le même auteur sur ce prestataire.
Étapes : Revenir sur la page, modifier note et/ou commentaire, republier.
Résultat attendu : Même document mis à jour (pas de doublon — un seul avis par `(providerId, authorId)`) ; `edited:true` posé ; `reply`/`reportCount` conservés tels quels (pas réinitialisés puisque `isEdit` est vrai) ; `ratingAvg` recalculé.
Couverture auto existante : `providerReviews.integration.test.ts` (à confirmer).

**PROV-042 — Impossible de « réécrire propre » un avis masqué par la modération**
Priorité : Haute
Préconditions : Avis de cet auteur sur ce prestataire déjà `status:'hidden'` (masqué automatiquement ou par un agent).
Étapes : Tenter de soumettre un nouvel avis / une modification pour ce même prestataire.
Résultat attendu : `review_hidden` (403) — un avis masqué ne peut pas être blanchi par une simple réédition ; l'auteur devrait être informé (UI) que son avis a été masqué, sans pouvoir contourner la modération en le republiant.
Couverture auto existante : logique explicite dans `createReview` (commentaire dédié) — à confirmer présence d'un test correspondant dans `providerReviews.integration.test.ts`.

**PROV-043 — Signaler un avis abusif**
Priorité : Haute
Préconditions : Avis `published` d'un autre auteur que le signalant.
Étapes : Depuis `ProviderReviewsClient`, signaler l'avis avec une raison (`REVIEW_REPORT_REASONS`) et des détails optionnels.
Résultat attendu : `reportReview` : rejet `cannot_report_own_review` si l'auteur tente de signaler son propre avis ; rejet `review_not_published` si l'avis n'est pas publié ; rejet `already_reported` (409, contrainte unique) si le même signalant re-signale le même avis ; sinon un `ReviewReport` est créé (`status:'open'`) et `reportCount` incrémenté.
Couverture auto existante : `providerReviews.integration.test.ts` (probable couverture de `reportReview`, y compris cas doublon) — à confirmer par lecture complète.

**PROV-044 — Auto-masquage après seuil de signalements (`AUTO_HIDE_REPORTS = 3`)**
Priorité : Critique
Préconditions : Un avis publié ayant déjà 2 signalements.
Étapes : Un 3ᵉ utilisateur distinct signale le même avis.
Résultat attendu : `reportCount` atteint 3 → l'avis bascule automatiquement `status:'hidden'`, `hiddenAt` posé, `hiddenBy:'auto'` ; `ratingAvg`/`ratingCount` du prestataire recalculés en excluant cet avis désormais masqué ; sur la page publique, l'avis disparaît immédiatement de `getPublishedReviews`.
Résultat attendu (concurrence) : deux signalements concurrents au moment du seuil comptent tous les deux (jamais perdus grâce à `$inc` + relecture), au pire le masquage se déclenche un cran plus tard que l'idéal théorique mais jamais un avis qui reste visible alors qu'il aurait dû être masqué.
Couverture auto existante : à confirmer dans `providerReviews.integration.test.ts` — comportement documenté explicitement en commentaire de code, scénario de seuil à tester si absent du fichier.

**PROV-045 — Le prestataire répond à un avis reçu**
Priorité : Haute
Préconditions : Avis publié reçu par le prestataire connecté.
Étapes : Depuis `/offer-services` (onglet avis), rédiger une réponse (≤1000 caractères), publier.
Résultat attendu : `replyToReview` : rejet `forbidden` (403) si l'appelant n'est pas le `providerId` de l'avis (ne peut répondre qu'à SES PROPRES avis reçus) ; rejet `reply_empty` si texte vide après nettoyage ; rejet `review_deleted` (409) si l'avis a été retiré par son auteur entre-temps ; une seule réponse par avis, modifiable (pas d'historique de versions, `createdAt` conservé au premier envoi, `updatedAt` rafraîchi).
Couverture auto existante : `providerReviews.integration.test.ts` (probable couverture de `replyToReview`) — à confirmer.

**PROV-046 — L'auteur retire son propre avis**
Priorité : Moyenne
Étapes : En tant qu'auteur d'un avis publié, le supprimer depuis son historique.
Résultat attendu : `deleteOwnReview` : `forbidden` si l'appelant n'est pas l'auteur ; sinon `status:'deleted'`, `deletedAt` posé, `ratingAvg` recalculé (l'avis supprimé n'est plus compté) ; l'avis disparaît de `getPublishedReviews` ET de `getMyProviderReviews` du prestataire (qui exclut explicitement `status:'deleted'`).
Couverture auto existante : `providerReviews.integration.test.ts` (probable) — à confirmer.

**PROV-047 — Tableau de bord des avis reçus (prestataire) : avis masqués visibles au propriétaire**
Priorité : Moyenne
Préconditions : Le prestataire a reçu à la fois des avis publiés et un avis auto-masqué.
Étapes : Consulter la liste des avis dans `/offer-services`.
Résultat attendu : `getMyProviderReviews` retourne les avis `published` ET `hidden` (mais jamais `deleted`) — le prestataire voit qu'un avis a été masqué (utile pour comprendre l'impact sur sa note), contrairement à `getPublishedReviews` (page publique) qui ne montre que `published`.
Couverture auto existante : différenciation testée en principe dans `providerReviews.integration.test.ts` — à confirmer.

**PROV-048 — Modération agent d'un avis (hors périmètre direct mais impact prestataire)**
Priorité : Basse (rattaché à la phase agent, testé ici pour l'effet côté prestataire)
Étapes : Un agent masque (`hide`), republie (`publish`), supprime (`delete`) ou annote (`note`) un avis contesté.
Résultat attendu : `hide`/`delete`/`publish` referment automatiquement tout `ReviewReport` `open` associé (`action_taken` pour hide/delete, `dismissed` pour publish) et recalculent `ratingAvg` ; `note` seul ne touche ni au statut ni aux signalements ouverts, sert uniquement de mémo interne agent (`adminNote`).
Couverture auto existante : `lib/server/__tests__/providerReviewsAgent.integration.test.ts` (couverture complète : hide/publish/delete/note, tri des signalés en tête, cas 404).

---

### 5.6 Garde-fous transverses (rôles, statuts, multi-compte)

**PROV-049 — Un prestataire ne peut pas commander de services (`canOrderServices`)**
Priorité : Critique
Préconditions : Compte avec `activeRole='prestataire'`.
Étapes : Naviguer vers la page publique d'un autre prestataire, tenter d'utiliser toute action de type « commande »/réservation de service si une telle action existe pour d'autres rôles (comparer avec un compte `client`/`organisateur`/`agent` sur le même écran).
Résultat attendu : `canOrderServices(user)` retourne `false` pour `activeRole==='prestataire'` — seuls `client`, `organisateur` et `agent` peuvent commander/réserver des services. Noter que la modale « Demander ce service » (`ProviderCatalogInquiry`) n'implémente **aucune** vérification explicite de `canOrderServices` côté client ni dans `sendMessage`/`/api/conversations` d'après le code lu : un prestataire connecté (rôle actif prestataire) semble pouvoir techniquement ouvrir la modale et envoyer une demande de devis à un autre prestataire, car le blocage n'apparaît que dans la fonction pure `permissions.ts::canOrderServices`, dont l'appel réel dans ce flux n'a pas été localisé dans les fichiers fournis. **Vérifier manuellement** si un compte prestataire peut effectivement contacter un autre prestataire via ce bouton — si oui, gap à documenter (le garde-fou métier existe en théorie mais n'est peut-être pas branché sur ce point d'entrée précis).
Couverture auto existante : `lib/server/__tests__/permissions.test.ts` (probable, fonction pure `canOrderServices`) — mais pas de test d'intégration bout-en-bout localisé pour ce chemin précis (page publique → modale → API messagerie).

**PROV-050 — Statut `prestStatus` et accès à l'interface prestataire (pending)**
Priorité : Critique
Préconditions : Compte avec `roles` incluant `prestataire`, `prestStatus='pending'` (dossier en cours de review), `activeRole='prestataire'`.
Étapes : Se connecter, accéder à `/offer-services`, tenter d'ajouter un item de catalogue.
Résultat attendu (comportement produit visé, à confronter au code) : selon `canProposeServices`, un statut `pending` **n'est pas explicitement bloqué** (seul `'rejected'` l'est — `effective !== 'rejected'` laisse passer `'pending'` et `'none'`) ; combiné au fait que la route réelle `POST /api/providers/me/catalog` ne vérifie que `roles.includes('prestataire')` sans lire `prestStatus` du tout, il faut vérifier concrètement si un dossier encore en attente de validation permet déjà de publier un catalogue public. Si la page `/offer-services` (`page.tsx::requireProviderRole`) n'est elle non plus gardée que par `roles`, un compte `pending` accède intégralement à l'espace prestataire (édition profil + catalogue) avant toute validation par un agent — **à confirmer comme comportement voulu ou gap**, car cela contredirait l'esprit de « candidature en attente de validation ».
Couverture auto existante : `lib/server/__tests__/permissions.test.ts` (fonction pure uniquement) — aucune couverture d'intégration bout-en-bout de ce branchement réel identifiée dans les fichiers listés.

**PROV-051 — `prestStatus=rejected` ne bloque PAS une interface organisateur déjà active sur le même compte**
Priorité : Critique
Préconditions : Compte multi-rôle avec `orgStatus='active'` et `prestStatus='rejected'` (candidature prestataire rejetée après coup).
Étapes : Basculer `activeRole` vers `organisateur`, vérifier l'accès complet à `/organizer-studio`, création d'événement, etc. Puis basculer `activeRole` vers `prestataire`, vérifier le blocage attendu.
Résultat attendu : Le rejet du dossier prestataire n'affecte en rien l'interface organisateur (`orgStatus` est un champ totalement distinct, lu séparément par `canCreateEvent`) — cohérent avec la garantie documentée dans `CLAUDE.md` et testée côté candidature (PROV-009). Côté interface prestataire, `canProposeServices` renvoie `false` (bloqué, car `'rejected'` est explicitement exclu).
Couverture auto existante : `lib/server/__tests__/permissions.test.ts` pour la fonction pure ; la non-régression croisée orgStatus/prestStatus est testée côté candidature dans `applicationsPrestataire.integration.test.ts` (PROV-009) mais pas explicitement revérifiée du point de vue des gardes de PAGE (`requireProviderRole`/`requireOrganizerRole` réels) dans les fichiers fournis.

**PROV-052 — Cohérence devise catalogue vs devise de facturation après changement de pays**
Priorité : Moyenne
Préconditions : Profil dont `catalogCurrency` a été fixé à la création (`billing.currency` au moment du premier accès à `/offer-services`, voir `getOrCreateMyProviderProfile`).
Étapes : Changer le pays de facturation (avant tout abonnement actif, donc autorisé) vers une région d'une autre devise, puis créer un nouvel item de catalogue.
Résultat attendu : `catalogCurrency` du profil (`ProviderProfile.catalogCurrency`) n'est **pas** recalculé automatiquement par `setProviderBillingRegion` (qui ne touche que `User.providerBillingRegionId`) — un nouvel item créé après ce changement utilisera toujours l'ancien `profile.catalogCurrency` tant qu'aucune autre mutation ne le met à jour. Vérifier si c'est le comportement réel voulu ou si l'UI recalcule `catalogCurrency` ailleurs (non localisé dans les fichiers fournis) — sinon un décalage EUR/XOF entre facturation et catalogue affiché pourrait subsister après un changement de pays tardif.
Couverture auto existante : aucune identifiée pour ce cas croisé précis — gap probable, à tester manuellement puis combler par un test d'intégration si confirmé comme un vrai problème.


---

## 6. Compte Agent — administration plateforme, modération, finance, vente sur place

### 6.0 Périmètre et grounding

Le compte Agent (`activeRole === 'agent'`, distinct du rôle `EventStaff` "vendeur" utilisé pour la vente sur place) est protégé à deux niveaux :
- **Page** : `app/(app)/agent/page.tsx` + `proxy.ts` gate `/agent/:path*` côté serveur sur `activeRole === 'agent'`.
- **Route Handler** : `lib/server/agentGuard.ts::requireAgent()`, appelé par chaque route `/api/agent/*` — port de l'ancien `adminGuard.js`, **sans** l'échappatoire "email super-admin" du legacy. Chaque fonction serveur mutante revérifie en plus `caller.id` (ex. `setUserDisabled` refuse `userId === agent.id`).

Le shell `AgentShell.tsx` distribue les onglets vers `AgentDashboardClient`, `AgentUsersClient`, `AgentDossiersClient`, `AgentDeletionClient`, `AgentReviewsClient`, `AgentEventsClient`, `AgentPaymentsClient`, `AgentReportsClient`, `AgentBoostsClient` (lecture seule), `AgentHomepageConfigClient`.

La vente sur place (`lib/server/agentSales.ts`) est le module le plus complexe du domaine : vente cash ou Mobile Money, groupe à prix fixe, vente à l'entrée fast-path, blocage anti-impayés, jamais de contournement de la commission LIB (`lib/shared/fees.ts` — identique à un achat in-app). Couverture automatisée existante : **`lib/server/__tests__/agentSales.integration.test.ts` — 15/15 tests passants**, cités individuellement ci-dessous.

---

### 6.1 Garde d'accès `/agent`

**AGT-001 — Un compte non-agent est bloqué sur toutes les routes `/agent`**
- Priorité : Critique
- Préconditions : compte de test avec `activeRole` = `client`, `organisateur` ou `prestataire`, actif.
- Étapes :
  1. Se connecter avec ce compte.
  2. Naviguer directement vers `/agent` (URL directe, pas de lien depuis l'UI).
  3. Répéter en visant un sous-onglet, ex. `/agent?tab=users` ou l'équivalent routé.
  4. Appeler une route API agent en direct (ex. `POST /api/agent/users/:id/disable`) via devtools/curl avec le cookie de session de ce compte.
- Résultat attendu : la page redirige/bloque (gate serveur `proxy.ts` + page), aucun contenu agent n'est rendu même brièvement (pas de flash de contenu) ; l'appel API direct renvoie 401/403 (`requireAgent` → `false`), aucune donnée sensible n'est renvoyée dans le corps de la réponse.
- Couverture auto existante : `lib/server/__tests__/agentGuard.test.ts` (3 tests) — vérifie `requireAgent()` pour `activeRole` variés et statut de compte ; ne couvre pas le comportement de la page Next elle-même (à vérifier manuellement).

**AGT-002 — Un compte agent suspendu (`disabled`) perd l'accès agent**
- Priorité : Haute
- Préconditions : compte agent existant, un autre agent va le désactiver (voir AGT-010).
- Étapes :
  1. Agent A désactive le compte de l'agent B (AGT-010).
  2. Se connecter en tant qu'agent B (si la session n'a pas déjà été invalidée) ou tenter une reconnexion.
  3. Tenter d'accéder à `/agent`.
- Résultat attendu : connexion refusée (`disabled: true` bloque `authorize`) ou, si une session JWT était déjà active, elle est invalidée dès le prochain appel car `sessionVersion` a été incrémenté (voir `auth.ts:jwt`) — l'accès agent est immédiatement coupé, pas seulement après expiration naturelle du token.
- Couverture auto existante : logique de `sessionVersion`/`disabled` couverte indirectement par les tests d'auth générale (hors périmètre de ce document) ; le lien "agent désactivé perd l'accès agent" n'est pas testé explicitly par les suites agent.

**AGT-003 — Un agent ne peut pas s'auto-suspendre ni se retirer lui-même**
- Priorité : Moyenne
- Préconditions : connecté en agent.
- Étapes :
  1. Dans l'onglet Comptes, chercher son propre compte.
  2. Tenter l'action "Suspendre" sur soi-même.
- Résultat attendu : `setUserDisabled` renvoie `self_action` (400) ; l'UI affiche une erreur, le compte reste actif.
- Couverture auto existante : `agentUsers.integration.test.ts` couvre `userId === agent.id → self_action` (parmi ses 18 tests).

---

### 6.2 Gestion des comptes (`AgentUsersClient` / `agentUsers.ts`)

**AGT-010 — Suspendre un compte utilisateur**
- Priorité : Critique
- Préconditions : agent connecté ; compte cible actif, non super-admin, différent de l'agent connecté.
- Étapes :
  1. Onglet Comptes → rechercher l'utilisateur cible (recherche par nom/email/téléphone, `escapeRegex` insensible à la casse).
  2. Ouvrir le panneau de détail slide-up.
  3. Cliquer "Suspendre" (toggle `disabled`).
  4. Recharger la liste et filtrer par statut "Désactivé".
- Résultat attendu : `user.disabled = true`, `sessionVersion` incrémenté (toute session JWT déjà émise est invalidée au prochain refresh) ; l'utilisateur suspendu ne peut plus se reconnecter ; le compte apparaît dans le filtre "Désactivé".
- Couverture auto existante : `agentUsers.integration.test.ts` (18 tests) couvre `setUserDisabled` true/false, incrément de `sessionVersion`, refus sur `self_action` et `protected_account` (super-admin).

**AGT-011 — Réactiver un compte suspendu**
- Priorité : Haute
- Préconditions : compte préalablement suspendu (AGT-010).
- Étapes : rouvrir le panneau, cliquer "Réactiver" (`disabled: false`).
- Résultat attendu : `disabled` repasse à `false`, l'utilisateur peut se reconnecter normalement (nouvelle session avec le `sessionVersion` courant).
- Couverture auto existante : idem AGT-010.

**AGT-012 — Un compte super-admin ne peut pas être suspendu ni voir son email changé par un agent**
- Priorité : Critique
- Préconditions : un compte marqué `superAdmin: true` existe.
- Étapes : tenter Suspendre puis tenter de modifier l'email depuis le panneau détail.
- Résultat attendu : les deux actions renvoient `protected_account` (403) ; aucune modification n'est persistée.
- Couverture auto existante : `agentUsers.integration.test.ts` (`setUserDisabled` et `updateUserEmail` sur compte `superAdmin`).

**AGT-013 — Changement de rôle via approbation de candidature (pas de sélecteur de rôle direct)**
- Priorité : Haute
- Préconditions : candidature organisateur ou prestataire `submitted`/`under_review` pour un client.
- Étapes :
  1. Vérifier qu'il n'existe **aucun** contrôle "changer le rôle" direct dans `AgentUsersClient` (volontairement absent — voir commentaire d'en-tête du composant : tout octroi de rôle passe par un dossier réel).
  2. Approuver le dossier correspondant (AGT-030).
  3. Revenir dans l'onglet Comptes et rouvrir le compte de l'utilisateur.
- Résultat attendu : `user.activeRole` est passé à `organisateur` (`lib/server/applications.ts:245`) ou `prestataire` (`:371`) uniquement suite à l'approbation du dossier, jamais via une action isolée de l'onglet Comptes ; le filtre par rôle de l'onglet Comptes reflète le nouveau rôle.
- Couverture auto existante : `applicationsAgent.integration.test.ts` (14 tests, transition d'état + `activeRole`) ; absence du raccourci UI vérifiable seulement manuellement (test de non-régression UI).

**AGT-014 — Renvoyer l'email de vérification / réinitialisation de mot de passe**
- Priorité : Moyenne
- Préconditions : utilisateur avec email non vérifié.
- Étapes : depuis le panneau détail, cliquer "Renvoyer vérification" puis "Envoyer réinitialisation".
- Résultat attendu : un jeton à usage unique est émis (`issueVerificationToken`), les anciens jetons invalidés, un email est envoyé au vrai email de l'utilisateur (jamais de mot de passe visible/choisi par l'agent) ; si `already_verified`, l'action "vérification" est refusée (409).
- Couverture auto existante : `agentUsers.integration.test.ts` couvre `sendUserVerificationEmail`/`sendUserPasswordResetEmail` (succès + cas `already_verified` + échec d'envoi → jetons ré-invalidés).

**AGT-015 — Modifier l'email d'un compte : unicité et invalidation des jetons**
- Priorité : Haute
- Étapes : changer l'email d'un compte vers une adresse déjà utilisée par un autre compte, puis vers une adresse libre.
- Résultat attendu : cas 1 → `email_taken` (409), rien de modifié ; cas 2 → email mis à jour, `emailVerifiedAt` remis à `null`, `sessionVersion` incrémenté (déconnexion forcée), anciens jetons de vérif invalidés pour l'ancien ET le nouvel email.
- Couverture auto existante : `agentUsers.integration.test.ts` (conflit d'unicité, code Mongo 11000, effets de bord sur jetons/session).

**AGT-016 — Recherche et filtres (rôle / statut / en ligne)**
- Priorité : Basse
- Étapes : combiner recherche texte + filtre rôle "Organisateurs" + filtre statut "Actif" + "En ligne uniquement".
- Résultat attendu : liste cohérente avec la fenêtre "en ligne" de 5 minutes (`ONLINE_WINDOW_MS`), tri par date de création décroissante.
- Couverture auto existante : `agentUsers.integration.test.ts` couvre `listUsersForAgent` avec chaque filtre isolément.

---

### 6.3 Dossiers de candidature (`AgentDossiersClient` / `applications.ts`)

**AGT-020 — File des dossiers organisateur/prestataire**
- Priorité : Haute
- Étapes : ouvrir l'onglet Dossiers, vérifier la liste (statuts `submitted`, `under_review`, `needs_changes`, `resubmitted`, `approved`, `rejected`, `suspended`), ouvrir le panneau de détail d'un dossier (documents, complétude via `getApplicationCompleteness`, journal d'audit).
- Résultat attendu : chaque dossier affiche son statut réel, ses documents uploadés, l'historique d'actions (`AuditLogEntry`: action/par/date/note).
- Couverture auto existante : `applicationsAgent.integration.test.ts` (14 tests) sur la machine à états `moderateApplication`.

**AGT-021 — Approuver un dossier organisateur avec note interne**
- Priorité : Critique
- Préconditions : dossier `submitted` ou `resubmitted`.
- Étapes : ouvrir le dossier, saisir une note interne (`adminNote`, champ texte unique), cliquer "Approuver".
- Résultat attendu : statut → `approved`, `user.activeRole` bascule à `organisateur`, une entrée d'audit "approve" horodatée est ajoutée avec l'auteur agent, la note est persistée.
- Couverture auto existante : `applicationsAgent.integration.test.ts`.

**AGT-022 — Rejeter un dossier avec motif obligatoire**
- Priorité : Critique
- Étapes : ouvrir un dossier `submitted`, cliquer "Rejeter" sans motif, puis avec motif.
- Résultat attendu : sans motif → l'action est bloquée côté UI/serveur (motif requis pour traçabilité) ; avec motif → statut `rejected`, `activeRole` inchangé (reste `client`), motif visible dans le journal.
- Couverture auto existante : `applicationsAgent.integration.test.ts` (transition `reject`).

**AGT-023 — Demander des modifications (`request_changes`) puis resoumission**
- Priorité : Moyenne
- Étapes : action "Demander des modifications" avec message, puis simuler la resoumission utilisateur (`resubmitted`).
- Résultat attendu : statut `needs_changes` → `resubmitted` → redisponible dans la file agent pour nouvelle revue ; `requestedChanges` affiché dans le résumé.
- Couverture auto existante : `applicationsAgent.integration.test.ts`.

**AGT-024 — Suspendre / réactiver un dossier déjà approuvé**
- Priorité : Moyenne
- Étapes : sur un dossier `approved`, action "Suspendre", puis "Réactiver".
- Résultat attendu : statut `suspended` bloque les capacités associées au rôle (à vérifier côté organisateur : ne peut plus créer d'événement) ; "Réactiver" restaure `approved`.
- Couverture auto existante : `applicationsAgent.integration.test.ts` (transitions `suspend`/`reactivate`).

**AGT-025 — Absence du raccourci "demande de rôle" legacy**
- Priorité : Basse
- Étapes : vérifier qu'aucun bloc "Demandes de rôle" (roleRequests) n'existe dans l'UI.
- Résultat attendu : conforme au commentaire de `AgentDossiersClient.tsx` — ce flux mort du legacy Firestore n'a pas été porté, tout octroi de rôle passe par un `Application` réel.

---

### 6.4 Demandes de suppression de compte (`AgentDeletionClient` / `agentDeletion.ts`)

**AGT-030 — Audit bloquant : événement à venir avec billets vendus**
- Priorité : Critique
- Préconditions : organisateur avec un événement à venir non annulé et au moins un billet payé non révoqué vendu à un tiers.
- Étapes : ouvrir la demande de suppression de ce compte dans l'onglet Suppressions.
- Résultat attendu : `computeDeletionAudit` renvoie un **blocker** `future_event_with_bookings` avec libellé explicite ; le bouton d'approbation est désactivé/masqué tant que le blocker existe.
- Couverture auto existante : `agentDeletion.integration.test.ts` (19 tests) — vérifie explicitement ce blocker (billets du compte lui-même exclus du calcul).

**AGT-031 — Audit bloquant : solde dû ou demande de virement en attente**
- Priorité : Critique
- Préconditions : `SellerBalance.amountDueCents/XOF > 0` ou `PayoutRequest` en statut `pending` pour ce compte.
- Étapes : ouvrir la demande de suppression.
- Résultat attendu : blocker `pending_settlement` et/ou `pending_payout_request` avec montants formatés (EUR/XOF jamais additionnés) ; approbation bloquée.
- Couverture auto existante : `agentDeletion.integration.test.ts`.

**AGT-032 — Approbation d'une demande sans blocker : anonymisation, jamais suppression dure**
- Priorité : Critique
- Préconditions : compte sans blocker (aucun événement à venir avec vente, solde à zéro).
- Étapes : approuver la demande avec une note de revue.
- Résultat attendu : le document `User` n'est PAS supprimé — il est anonymisé (email → `deleted-<id>@liveinblack.invalid`, hash de mot de passe irrécupérable, nom/téléphone/avatar vidés, `disabled: true`, `sessionVersion` incrémenté, `roles: ['client']`, `activeRole: 'client'`, `orgStatus`/`prestStatus: 'none'`, Stripe désassocié) ; les événements à venir sans réservation sont supprimés en dur ; les événements passés/annulés sont conservés avec `organizerName`/`organizer` anonymisés ; les enregistrements financiers/d'audit (Order, EventPayout, SellerBalance, PayoutRequest, Boost, Review, Report) ne sont **jamais** supprimés, seule leur identité affichée est anonymisée si dénormalisée. Le tout dans une transaction Mongo atomique.
- Couverture auto existante : `agentDeletion.integration.test.ts` couvre la purge transactionnelle complète, y compris la distinction événement à venir sans vente (supprimé) vs passé/annulé (conservé/anonymisé).

**AGT-033 — Abonnement prestataire actif : résiliation automatique à l'approbation**
- Priorité : Haute
- Préconditions : `user.prestataireSubActive === true`.
- Étapes : ouvrir la demande (vérifier le warning "Abonnement actif — sera résilié automatiquement"), approuver.
- Résultat attendu : `cancelProviderSubscriptionForDeletion` est appelée, l'abonnement (Stripe ou FedaPay selon `prestataireSubRail`) est résilié dans le même flux d'approbation.
- Couverture auto existante : `agentDeletion.integration.test.ts`.

**AGT-034 — Rejet d'une demande de suppression**
- Priorité : Moyenne
- Étapes : rejeter une demande avec note.
- Résultat attendu : statut de la `DeletionRequest` mis à jour sans toucher au compte utilisateur, note et auteur tracés.
- Couverture auto existante : `agentDeletion.integration.test.ts`.

---

### 6.5 Modération des avis (`AgentReviewsClient`)

**AGT-040 — Masquer un avis (hide)**
- Priorité : Haute
- Préconditions : avis `published`, au moins un avec `reportCount > 0` (trié en tête de liste).
- Étapes : depuis la liste triée (signalés d'abord), choisir un avis, action "Masquer".
- Résultat attendu : `status` → `hidden`, message de confirmation "Avis masqué." ; l'avis masqué n'apparaît plus publiquement mais reste visible dans le panneau agent (filtre "Masqués").
- Couverture auto existante : `providerReviewsAgent.integration.test.ts` (9 tests) — couvre `hide`.

**AGT-041 — Republier un avis masqué (publish)**
- Priorité : Moyenne
- Préconditions : avis en statut `hidden`.
- Étapes : action "Republier".
- Résultat attendu : `status` → `published`, redevient visible publiquement.
- Couverture auto existante : `providerReviewsAgent.integration.test.ts`.

**AGT-042 — Supprimer définitivement un avis (delete)**
- Priorité : Haute
- Étapes : action "Supprimer" sur un avis, confirmer.
- Résultat attendu : `status` → `deleted`, `deletedBy` renseigné avec l'id de l'agent ; l'avis ne réapparaît plus dans le filtre "Signalés" même s'il avait des signalements (exclusion explicite `status !== 'deleted'` dans le calcul du compteur) ; une fois `deleted`, aucune action de republication n'est proposée (irréversible côté UI).
- Couverture auto existante : `providerReviewsAgent.integration.test.ts` couvre `delete` et l'irréversibilité.

**AGT-043 — Ajouter une note interne (note) sans changer le statut public**
- Priorité : Basse
- Étapes : ouvrir un avis, saisir une note interne, valider ("Note enregistrée.").
- Résultat attendu : la note est persistée sans changer `status` ; visible uniquement côté agent, jamais exposée publiquement.
- Couverture auto existante : `providerReviewsAgent.integration.test.ts` couvre l'opération `note`.

**AGT-044 — Filtre "Signalés" exclut les avis déjà supprimés**
- Priorité : Basse
- Étapes : supprimer un avis fortement signalé, vérifier le compteur/filtre "Signalés".
- Résultat attendu : le compteur `reportedCount` et le filtre `statusFilter === 'reported'` excluent tout avis `status === 'deleted'`, cohérent avec le code (`r.reportCount > 0 && r.status !== 'deleted'`).
- Couverture auto existante : logique unitaire côté client non couverte par les tests serveur listés — à vérifier manuellement (test de composant/E2E recommandé).

---

### 6.6 Gestion des événements côté agent (`AgentEventsClient` / `agentEvents.ts`)

**AGT-050 — Vue de tous les événements publiés avec filtres**
- Priorité : Moyenne
- Étapes : ouvrir l'onglet Événements, filtrer "À venir" / "Passés" / "Annulés", rechercher par nom/ville/organisateur.
- Résultat attendu : liste exhaustive tous organisateurs confondus, badges de statut cohérents (`upcoming`/`past`/`cancelled`) avec la date/heure effective de l'événement.
- Couverture auto existante : `agentEvents.integration.test.ts` (8 tests) sur `listEventsForAgent`.

**AGT-051 — Annulation admin d'un événement (réutilise le flux organisateur autoritaire)**
- Priorité : Critique
- Préconditions : événement à venir non annulé, avec billets vendus.
- Étapes : ouvrir l'événement, "Annuler" avec message aux participants, confirmer.
- Résultat attendu : `adminCancelEvent` appelle le **même** flux que l'annulation organisateur (`cancelOrganizerEvent`) — remboursements déclenchés une seule fois, jamais de double logique ; `cancelledAt`/`cancellationMessage` renseignés ; l'événement passe en statut `cancelled` et les recettes ne sont plus versées à l'organisateur (cf. AGT-062).
- Couverture auto existante : `agentEvents.integration.test.ts` couvre `adminCancelEvent` et la réutilisation du flux organisateur.

**AGT-052 — Annulation sans message aux participants**
- Priorité : Basse
- Étapes : annuler sans saisir de message.
- Résultat attendu : l'UI affiche "aucun message aux participants" à la place, l'annulation aboutit quand même.
- Couverture auto existante : `agentEvents.integration.test.ts`.

**AGT-053 — Pas de rafraîchissement temps réel — recharge manuelle**
- Priorité : Basse
- Étapes : annuler un événement dans un autre onglet/session pendant que la liste est affichée dans la session courante.
- Résultat attendu : la liste ne se met PAS à jour automatiquement (pas d'équivalent `listenEvents` temps réel) ; le bouton "Recharger" et le rafraîchissement post-action couvrent le besoin — comportement attendu, pas un bug.

---

### 6.7 File des paiements (`AgentPaymentsClient` / `agentPayments.ts`)

**AGT-060 — Versement auto XOF en échec : marquer payé après envoi manuel**
- Priorité : Critique
- Préconditions : un `EventPayout` en échec de versement automatique Mobile Money (XOF).
- Étapes : section Reversements → sous-section "Versements auto en échec", envoyer l'argent à la main depuis FedaPay (hors app), puis "Marquer payé (montant)".
- Résultat attendu : confirmation modale avec montant/bénéficiaire, décrément atomique du ledger (`amountDueXOF`), l'événement disparaît de la liste ; si l'action échoue côté serveur, aucun décrément n'a lieu (message "rien n'a été décrémenté") et l'événement reste dans la liste ; si entre-temps le versement est reparti en automatique (`not_failed`), la ligne est retirée sans marquage.
- Couverture auto existante : `agentPayments.integration.test.ts` (16 tests) — couvre `mark-paid`, cas `not_failed`, atomicité du décrément.

**AGT-061 — Événement annulé : ne jamais proposer de versement à l'organisateur**
- Priorité : Critique
- Préconditions : `EventPayout` en échec pour un événement `cancelled`.
- Étapes : ouvrir la file des versements en échec pour cet événement.
- Résultat attendu : aucun bouton "Marquer payé" n'est affiché ; un bandeau explique que la recette sert aux remboursements des acheteurs (section Remboursements), jamais versée à l'organisateur.
- Couverture auto existante : `agentPayments.integration.test.ts` couvre la branche `eventCancelled`.

**AGT-062 — Demande de virement EUR : régler avec mismatch de montant demandé vs solde réel**
- Priorité : Haute
- Préconditions : `PayoutRequest` dont le montant demandé dépasse le solde ledger réel (`mismatch: true`).
- Étapes : ouvrir la demande, cliquer "Marquer payé (solde réel)".
- Résultat attendu : seul le solde réel (`payCents`) est marqué payé, jamais le montant demandé en trop ; avertissement affiché avant confirmation.
- Couverture auto existante : `agentPayments.integration.test.ts` couvre le calcul `payCents`/`mismatch`.

**AGT-063 — Clore une demande de virement dont le solde est déjà à zéro**
- Priorité : Moyenne
- Étapes : sur une `PayoutRequest` avec solde ledger à 0, cliquer "Solde à zéro — clore la demande".
- Résultat attendu : la demande est close sans mouvement d'argent, retirée de la liste, message "Demande close (solde déjà à zéro)".
- Couverture auto existante : `agentPayments.integration.test.ts`.

**AGT-064 — Remboursement Mobile Money manuel (FedaPay, pas d'API refund)**
- Priorité : Haute
- Étapes : section Remboursements, exécuter le refund dans le dashboard FedaPay (hors app), puis "Marquer remboursé".
- Résultat attendu : l'alerte de remboursement disparaît de la file après confirmation explicite ; aucun remboursement n'est déclenché automatiquement par l'app pour ce rail (contrairement à Stripe, remboursé automatiquement).
- Couverture auto existante : `agentPayments.integration.test.ts` couvre `refunds/:id/complete`.

**AGT-065 — Résoudre une alerte de paiement (anomalie)**
- Priorité : Moyenne
- Préconditions : `PaymentAlert` présente (ex. `amount_mismatch`, `boost_slot_lost`, `stripe_refund_failed`).
- Étapes : vérifier le paiement dans Stripe/FedaPay (hors app), cliquer "Marquer comme examiné".
- Résultat attendu : l'alerte est retirée de la liste après confirmation ; le libellé humain correspond bien à `ALERT_REASON_LABEL[reason]`, les détails bruts (`details`) sont lisibles (clé humanisée, valeur brute) même pour des clés inconnues.
- Couverture auto existante : `agentPayments.integration.test.ts` couvre `alerts/:id/resolve`.

**AGT-066 — Échec réseau au chargement : aucune action de règlement proposée**
- Priorité : Haute
- Étapes : simuler un échec de `GET /api/agent/payments/*` (une des 3 requêtes en échec).
- Résultat attendu : bandeau d'erreur explicite ("aucune action de règlement n'est proposée tant que les montants réels ne sont pas connus"), bouton "Recharger" ; aucune donnée partielle ni bouton d'action n'est affiché tant que la recharge n'a pas réussi.

---

### 6.8 Signalements (`AgentReportsClient` / `agentReports.ts`)

**AGT-070 — Traiter un signalement avec note**
- Priorité : Haute
- Préconditions : `Report` non traité (`handled: false`).
- Étapes : ouvrir la file (par défaut : signalements ouverts, plus récents en premier), traiter avec une note.
- Résultat attendu : `handled: true`, `handledAt`/`handledBy` (nom ou id de l'agent) renseignés, `handledNote` persistée ; le signalement passe dans l'historique "traités".
- Couverture auto existante : `agentReports.integration.test.ts` (6 tests).

**AGT-071 — Impossible de traiter deux fois le même signalement**
- Priorité : Moyenne
- Étapes : traiter un signalement déjà `handled`.
- Résultat attendu : `already_handled` (409), aucune modification.
- Couverture auto existante : `agentReports.integration.test.ts`.

---

### 6.9 Boosts (lecture seule) (`AgentBoostsClient` / `agentBoosts.ts`)

**AGT-080 — Aucune action de mutation disponible**
- Priorité : Basse
- Étapes : ouvrir l'onglet Boosts, vérifier actifs/conflits/expirés et le revenu total.
- Résultat attendu : panneau strictement lecture seule (aucun bouton d'action), conforme à l'en-tête du composant — les remboursements de conflit de créneau sont automatiques côté webhook (`finalizeBoost.ts`), jamais déclenchés depuis ce panneau.
- Couverture auto existante : `agentBoosts.integration.test.ts` (4 tests) sur l'agrégation serveur (`active`/`conflicts`/`expired`/`totalRevenue`).

**AGT-081 — Un boost en conflit apparaît dans la bonne section**
- Priorité : Moyenne
- Préconditions : deux boosts sur la même position/région se chevauchant.
- Étapes : consulter la section "conflits".
- Résultat attendu : le boost perdant apparaît marqué `conflict: true` dans la liste dédiée, cohérent avec le remboursement automatique déjà effectué côté webhook.
- Couverture auto existante : `agentBoosts.integration.test.ts`.

---

### 6.10 Configuration homepage publique (`AgentHomepageConfigClient` / `agentHomepageConfig.ts`)

**AGT-090 — Activer le carrousel "Actualité" et le voir en direct sur la homepage publique**
- Priorité : Critique
- Préconditions : au moins 1 événement publiable disponible.
- Étapes :
  1. Onglet Actualité : activer le toggle, saisir titre/sous-titre, choisir un accent (teal/or/rose), sélectionner 1 à `MAX_EVENTS` (12) événements dans un ordre précis (flèches haut/bas).
  2. Enregistrer.
  3. Ouvrir la page d'accueil publique (autre onglet, session déconnectée si possible).
- Résultat attendu : le carrousel public reflète exactement la config enregistrée (actif, titre/sous-titre normalisés côté serveur, accent, événements dans l'ordre choisi, plafonné à 12) ; le brouillon local n'écrase jamais le formulaire avant le premier chargement terminé (pas de `dirtyRef`, un seul GET au montage).
- Couverture auto existante : `agentHomepageConfig.integration.test.ts` (11 tests) — couvre la persistance de la config singleton et sa normalisation serveur ; la vérification "reflet en direct sur la homepage publique" nécessite un test manuel/E2E cross-page (non couvert par les tests serveur seuls).

**AGT-091 — Désactiver le carrousel**
- Priorité : Haute
- Étapes : désactiver le toggle "actif", enregistrer, recharger la homepage publique.
- Résultat attendu : le carrousel ne s'affiche plus publiquement, la config reste enregistrée pour réactivation ultérieure.
- Couverture auto existante : `agentHomepageConfig.integration.test.ts`.

**AGT-092 — Titre/sous-titre : troncature et valeurs par défaut**
- Priorité : Basse
- Étapes : saisir un titre > 80 caractères et un sous-titre > 140 caractères, enregistrer.
- Résultat attendu : troncature serveur à 80/140 caractères (`normalizeForPreview` reproduit la normalisation serveur) ; un titre vide retombe sur `DEFAULT_TITLE`.
- Couverture auto existante : `agentHomepageConfig.integration.test.ts` couvre la normalisation serveur.

**AGT-093 — Sélection au-delà de 12 événements refusée**
- Priorité : Moyenne
- Étapes : tenter de sélectionner un 13e événement.
- Résultat attendu : bloqué côté UI (`MAX_EVENTS`) et/ou tronqué côté serveur si contourné par appel API direct.
- Couverture auto existante : `agentHomepageConfig.integration.test.ts` couvre la limite serveur.

---

### 6.11 Vente sur place (`agentSales.ts`) — le module le plus critique du domaine

Contexte : rôle `EventStaff` "vendeur" (jamais confondu avec `User.roles: 'agent'`) ou propriétaire de l'événement (`organizerId`/`createdBy`). Commission LIB systématiquement calculée via `lib/shared/fees.ts`, identique à un achat in-app — règle non négociable de la spec. Deux rails : `cash` (réglé plus tard) et `momo` (Mobile Money via push FedaPay direct, réglé immédiatement). Couverture globale : **`agentSales.integration.test.ts`, 15/15 tests passants.**

**AGT-100 — Autorisation : refus d'un appelant hors staff/propriétaire**
- Priorité : Critique
- Préconditions : compte quelconque n'ayant ni `organizerId`/`createdBy` sur l'événement, ni entrée `EventStaff.roster[uid].role === 'vendeur'`.
- Étapes : appeler `sellTicketOnSite`/route `sell` avec ce compte.
- Résultat attendu : `403 forbidden`, aucune commande créée, aucun stock décrémenté.
- Couverture auto existante : test "refuse un appelant qui n'est ni propriétaire ni agent de vente désigné".

**AGT-101 — Autorisation : le rôle `EventStaff` "vendeur" peut vendre**
- Priorité : Critique
- Étapes : staff avec `roster[uid].role === 'vendeur'` (pas propriétaire) vend un billet.
- Résultat attendu : autorisé, vente traitée normalement.
- Couverture auto existante : test "autorise un membre du staff avec le rôle 'vendeur'".

**AGT-102 — Autorisation : le rôle `scan` seul ne suffit pas à vendre**
- Priorité : Haute
- Préconditions : staff avec uniquement `role: 'scan'` (contrôle d'accès aux entrées, pas vente).
- Étapes : tenter une vente avec ce compte.
- Résultat attendu : `403 forbidden` — le rôle scan n'inclut pas le droit de vente.
- Couverture auto existante : test "un rôle 'scan' seul ne suffit pas à vendre".

**AGT-103 — Vente cash, mode `agent_settles` : billet immédiat, aucun prélèvement**
- Priorité : Critique
- Préconditions : place disponible, événement actif (non annulé, non terminé).
- Étapes : vendre 1 place en espèces, `settlementMode: 'agent_settles'`.
- Résultat attendu : `status: 'paid'` immédiatement, `ticketCodes` généré tout de suite (l'agent règle la part LIB par déclaration, aucun mouvement de solde organisateur) ; un `CashSaleSettlement` est créé avec `status: 'settled'`, `settledVia` = l'agent ; `libShareMinor` = la commission exacte de `lib/shared/fees.ts`.
- Couverture auto existante : test "mode 'agent_settles' : génère le billet immédiatement (aucun prélèvement requis)".

**AGT-104 — Vente cash, mode `instant_debit` : solde organisateur insuffisant → reste en attente**
- Priorité : Critique
- Préconditions : `SellerBalance` de l'organisateur avec un solde disponible < `libShareMinor` requis.
- Étapes : vendre en espèces avec `settlementMode: 'instant_debit'`.
- Résultat attendu : `status: 'pending_cash_settlement'`, aucun billet émis, un `PaymentAlert` `cash_sale_insufficient_organizer_balance` est levé (clé `cash_sale_low_balance_<organizerId>`) avec le montant nécessaire et disponible ; la vente reste réglable plus tard via `settleCashSale`.
- Couverture auto existante : test "mode 'instant_debit' : reste en attente si le solde organisateur est insuffisant".

**AGT-105 — Vente cash, mode `instant_debit` : solde suffisant → débit auto de la commission LIB**
- Priorité : Critique
- Préconditions : `SellerBalance` organisateur ≥ `libShareMinor`.
- Étapes : vendre en espèces avec `instant_debit`.
- Résultat attendu : le solde organisateur est débité EXACTEMENT du montant de la commission LIB (`libShareMinor`), jamais du montant total de la vente ; le billet est généré immédiatement, `settlement.status: 'settled'` ; la part organisateur (`organizerShareMinor`) est ensuite créditée au solde (le net correspond bien au prix place moins commission).
- Couverture auto existante : test "mode 'instant_debit' : règle et génère le billet dès que le solde organisateur est suffisant".

**AGT-106 — Régler manuellement une vente cash en attente (`settleCashSale`)**
- Priorité : Haute
- Préconditions : `CashSaleSettlement` en statut `pending` (mode `agent_settles`).
- Étapes : action explicite "Régler la vente" depuis l'UI agent/organisateur.
- Résultat attendu : billet généré, `settlement.status: 'settled'`, `settledVia` = l'appelant ; l'organisateur lui-même peut aussi déclencher ce règlement (guard : `caller.id === settlement.organizerId` autorisé même sans rôle vendeur).
- Couverture auto existante : test "settleCashSale confirme une vente en attente (agent_settles) et génère le billet".

**AGT-107 — Le stock est décrémenté une seule fois à la création, jamais en double**
- Priorité : Critique
- Étapes : créer une vente cash, vérifier `place.available` immédiatement après création (avant tout règlement), puis après règlement.
- Résultat attendu : le décrément a lieu une seule fois, à la création de la commande (transaction Mongo), jamais une seconde fois au moment du règlement.
- Couverture auto existante : test "le stock est décrémenté à la création, jamais deux fois pour la même vente".

**AGT-108 — Blocage après 5 ventes cash non réglées pour un même agent**
- Priorité : Critique
- Préconditions : agent avec déjà `MAX_PENDING_CASH_SETTLEMENTS_PER_AGENT` (5) `CashSaleSettlement` en statut `pending`, tous événements confondus.
- Étapes : tenter une 6e vente en espèces avec cet agent (sur le même événement ou un autre).
- Résultat attendu : `409 too_many_unpaid_cash_sales`, la commande est immédiatement relâchée (`releaseAgentSaleOrder` restaure le stock), un `PaymentAlert` `cash_sale_too_many_unpaid` est levé (clé `cash_sale_agent_blocked_<agentId>`) avec le compteur ; **le Mobile Money n'est jamais concerné par ce blocage** (réglé immédiatement via FedaPay) — vérifier qu'une vente `momo` reste possible pour ce même agent au même moment.
- Couverture auto existante : test "bloque un agent avec trop de ventes cash impayées et restitue le stock".

**AGT-109 — Vente Mobile Money : push FedaPay direct, aucun OTP côté agent**
- Priorité : Critique
- Préconditions : événement en devise XOF (`momo_requires_xof_event` sinon), numéro Mobile Money valide (`momoMode` + `momoPhone`).
- Étapes : vendre en Mobile Money, saisir le numéro du client, déclencher l'envoi.
- Résultat attendu : `createTransaction` + `createToken` + `sendPaymentToUser` sont appelés côté serveur ; **aucun champ OTP n'est jamais affiché ni saisi dans l'UI agent** — la confirmation se fait exclusivement sur le téléphone du client final ; réponse immédiate `status: 'pending_momo_confirmation'`, `ticketCodes: []` (rien n'est émis tant que le webhook FedaPay ne confirme pas).
- Couverture auto existante : test "reste en attente tant que la confirmation FedaPay n'est pas reçue, puis génère le billet" (describe "vente Mobile Money (async, webhook)") — vérifie l'absence de tickets avant confirmation et la génération après ; l'absence de champ OTP dans l'UI est un test manuel (revue d'écran), non testable côté serveur.

**AGT-110 — Webhook Mobile Money : rejet si le montant payé ne correspond pas**
- Priorité : Critique
- Étapes : simuler `fulfillAgentSaleOrder` avec `paidAmountMinor` différent du montant attendu (prix + précommandes + commission).
- Résultat attendu : `status: 'amount_mismatch'`, aucun billet émis, l'ordre reste `pending`.
- Couverture auto existante : test "rejette un montant qui ne correspond pas au total attendu".

**AGT-111 — Mobile Money : échec/expiration du paiement → relâche du stock**
- Priorité : Haute
- Étapes : simuler l'expiration/échec d'une commande `momo` en attente, appeler `releaseAgentSaleOrder`.
- Résultat attendu : le stock réservé est restitué (`place.available` incrémenté du montant réservé, plafonné à `place.total`), `order.status: 'cancelled'`, le `CashSaleSettlement` associé (s'il existe) passe à `cancelled`.
- Couverture auto existante : test "releaseAgentSaleOrder restitue le stock si le paiement échoue/expire".

**AGT-112 — Vente de groupe (table à prix forfaitaire) : un billet par participant, hôte technique = l'agent**
- Priorité : Critique
- Préconditions : une place `groupType: 'group'` avec `groupMax >= 2` (ex. table de 8).
- Étapes : vendre `isTable: true` sur cette place en espèces (`agent_settles`).
- Résultat attendu : **un seul** décrément de stock (`available` -1, l'unité étant la table entière, pas le nombre de sièges) ; `ticketCodes.length === groupMax` (ex. 8) ; tous les billets partagent le même `tableId` (`tbl_agent_<orderId>`) ; `hostUid` de chaque billet = l'agent vendeur (`order.agentUid`), **pas** un participant nommé — il n'existe qu'un seul champ `guestName` global appliqué à la vente, aucune saisie de nom par siège dans ce flux ; tous les billets ont `source: 'agent_cash'` (ou `agent_momo` selon le rail).
- Résultat attendu (limite documentée) : puisque les participants du groupe n'ont pas de compte, et que `hostUid` est techniquement l'agent (pas un participant), **aucun participant sans compte ne peut lui-même révoquer un billet déjà envoyé** — seul l'agent (ou l'organisateur, via `settleCashSale`/gestion staff) a la capacité technique de `hostUid`. Documenter ce comportement comme limitation acceptée v1, pas comme bug, sauf si le produit exige désormais un vrai hôte nommé.
- Couverture auto existante : test "vend la table entière à prix fixe et mint un billet par participant" (describe "vente de groupe (forfait à prix fixe)") — couvre le nombre de billets, le `tableId` partagé, le `source`, le décrément unique de stock. Ne couvre PAS explicitement l'assertion `hostUid === agentUid` ni l'absence de révocation par un participant sans compte — à ajouter en test manuel/exploratoire ou en complément unitaire.

**AGT-113 — Vente à l'entrée (fast-path) : 1 place, check-in immédiat, aucune précommande**
- Priorité : Critique
- Préconditions : place simple disponible (non groupe).
- Étapes : utiliser le flux "Vente à l'entrée" (`sellTicketAtDoor`) plutôt que "Vente sur place" standard, régler en espèces.
- Résultat attendu : `qty` forcé à 1, `isTable` forcé à `false` (une tentative de vente de table à l'entrée est rejetée : `no_group_at_door`), aucune précommande acceptée même si transmise ; le billet généré a `checkedInAt` renseigné immédiatement (`checkInImmediately: order.qty === 1 && !order.isTable && order.preorders.length === 0`) — le client entre directement sans scan de QR code, conformément à la spec §1.3 ("évite d'attendre l'envoi/scan d'un QR alors que le client est déjà à l'entrée").
- Couverture auto existante : test "force qty=1, aucune précommande, et check-in immédiat" — vérifie `ticketCodes.length === 1` et `ticket.checkedInAt` renseigné.

**AGT-114 — Un billet vendu par l'agent n'est jamais revendable**
- Priorité : Critique
- Préconditions : billet émis via `agent_cash` ou `agent_momo` (n'importe lequel des scénarios ci-dessus).
- Étapes : depuis le compte destinataire (si un compte existe et que le billet lui a été rattaché) ou via l'API de revente, tenter de mettre ce billet en revente.
- Résultat attendu : `lib/server/resale.ts` refuse avec `not_resellable_source` (409) — la garde vérifie que `ticket.source === 'paid'` OU commence par `'stripe'`/`'fedapay'` ; `'agent_cash'` et `'agent_momo'` ne remplissent aucune de ces conditions et sont donc systématiquement exclus de la revente.
- Couverture auto existante : la garde de revente est testée dans la suite `resale` générale (hors périmètre agent listé) ; le lien direct "billet `agent_sale` → source `agent_cash`/`agent_momo` → non revendable" n'est pas testé explicitement dans `agentSales.integration.test.ts` — recommandé d'ajouter un test croisé `agentSales` + `resale`, ou de le couvrir manuellement.

**AGT-115 — Dashboard des ventes agent pour un événement**
- Priorité : Basse
- Étapes : consulter `getAgentSalesDashboard` pour un événement avec un mélange de ventes cash réglées/en attente et Mobile Money payées.
- Résultat attendu : `totalSales` = commandes `agent_sale` payées ; `cashPending`/`cashSettled` = comptage des `CashSaleSettlement` par statut ; `momoSales` = commandes `rail: 'fedapay'` payées ; l'agrégation est bien filtrée sur `agentUid: caller.id` (un agent ne voit que ses propres ventes sur ce tableau, pas celles des autres vendeurs de l'événement).
- Couverture auto existante : test "agrège les ventes de l'agent appelant" (describe "getAgentSalesDashboard").

**AGT-116 — Événement annulé ou terminé : vente sur place bloquée**
- Priorité : Haute
- Préconditions : événement `cancelled: true` ou dont `isEventEnded(event)` est vrai.
- Étapes : tenter une vente cash ou momo sur cet événement.
- Résultat attendu : `409 event_cancelled` ou `409 event_ended`, aucune commande créée.
- Couverture auto existante : non listé explicitement parmi les 15 tests cités (vérifier lors de l'exécution de la suite si un cas dédié existe) — recommandé comme test manuel/complément si absent.

**AGT-117 — Contact obligatoire (email ou téléphone) pour toute vente sur place**
- Priorité : Moyenne
- Étapes : tenter une vente sans email ni téléphone renseignés.
- Résultat attendu : `400 contact_required`, aucune commande créée — cohérent avec le fait que le titulaire réel n'a pas de compte et doit être joignable pour recevoir son billet.
- Couverture auto existante : à vérifier dans la suite `agentSales.integration.test.ts` (non cité explicitement dans la liste des 15 `it()` observés — recommandé comme test manuel de complément si la couverture automatisée s'avère absente).

**AGT-118 — Précommandes de menu invalides**
- Priorité : Basse
- Étapes : vendre avec une précommande référencant un item de menu inexistant ou marqué indisponible (`available: false`).
- Résultat attendu : `400 unknown_menu_item:<name>`, aucune commande créée.
- Couverture auto existante : non cité explicitement parmi les 15 tests listés — recommandé comme complément de couverture ou test manuel.


---

## 7. Scan / contrôle d'accès, Paiements transverses

### 7.1 Scan / contrôle d'accès (`app/(app)/scanner/**`, `lib/server/ticketCheckin.ts`, `lib/server/ticketToken.ts`)

Toute la logique de verdict d'entrée vit **uniquement côté serveur** dans `checkinTicket()` (`lib/server/ticketCheckin.ts`) — le client (`ScannerClient.tsx`) ne fait qu'appeler `POST /api/tickets/checkin` et afficher le message associé au code d'erreur retourné (voir `CHECKIN_ERROR_MESSAGES`). Les jetons QR sont signés en HMAC-SHA256 (`lib/server/ticketToken.ts`) avec `AUTH_SECRET`, jamais côté client, et la signature porte sur l'état **courant** du billet (`seatVersion`, `entryNonce`) plutôt que sur des données figées à l'émission — donc un jeton devient automatiquement caduc dès que le billet est réattribué/révoqué, sans champ de péremption séparé à vérifier.

---

**SCAN-001 — Scan réussi d'un billet valide payé**
Priorité : Critique
Préconditions : Compte organisateur/agent/staff avec accès à l'événement ; un billet payé (`paid: true`), non scanné, non révoqué, événement non terminé.
Étapes :
1. Ouvrir `/scanner`, sélectionner l'événement du jour.
2. Activer la caméra (ou saisir le code manuellement) et scanner le QR du billet (URL `https://liveinblack.com/ticket/{token}` — voir `resolveScanInput`/`TICKET_URL_TOKEN_RE`).
3. Observer le résultat affiché.
Résultat attendu : Statut 200, carte verte « Billet valide », `alreadyCheckedIn: false`. Si le billet est payé et a un `userId`, un point de fidélité est crédité (`pointAwarded: true`, message « Point de fidélité crédité au titulaire »). Le mode passe automatiquement en « Service sur place ».
Couverture auto existante : `lib/server/__tests__/ticketCheckin.integration.test.ts` — « accorde le point de fidélité au titulaire courant pour un billet payé ».

**SCAN-002 — Billet déjà scanné : refus/avertissement au second scan (idempotence)**
Priorité : Critique
Préconditions : Billet SCAN-001 déjà check-iné une première fois.
Étapes :
1. Rescanner le même QR (ou ressaisir le même code) une seconde fois.
2. Observer le résultat.
Résultat attendu : Réponse `ok: true, alreadyCheckedIn: true` (pas une erreur HTTP — l'entrée est refusée visuellement via la carte dorée « Déjà entré », pas techniquement bloquée par un code d'erreur) ; **aucun** second point de fidélité crédité, `checkedInAt`/`checkedInBy` non réécrits (transaction Mongo lit avant d'écrire, cf. `ticketCheckin.ts` L109-142).
Couverture auto existante : `ticketCheckin.integration.test.ts` — « est idempotent : un second check-in ne recrédite jamais de point ».

**SCAN-003 — Billet non payé (place payante) refusé — `not_entitled`**
Priorité : Critique
Préconditions : Billet avec `paid: false`, `source` ≠ `guestlist`, sur une place dont le prix catalogue > 0, sans `stripeSessionId`/`fedapayTransactionId` en cours.
Étapes :
1. Scanner/saisir le code de ce billet.
Résultat attendu : 403, message « Ce billet n'ouvre pas droit à l'entrée. » (`not_entitled`). Aucun check-in enregistré.
Couverture auto existante : `ticketCheckin.integration.test.ts` — « refuse un billet non payé pour une place payante (not_entitled) ».

**SCAN-004 — Paiement en attente (session Stripe/FedaPay ouverte) — `payment_pending`**
Priorité : Haute
Préconditions : Billet non payé mais avec `stripeSessionId` ou `fedapayTransactionId` renseigné (paiement initié, pas encore confirmé par webhook).
Étapes :
1. Scanner ce billet avant confirmation du paiement.
Résultat attendu : 403, message distinct « Paiement non confirmé — entrée refusée. » (`payment_pending`), différencié de `not_entitled` pour que le staff sache qu'un paiement est en cours plutôt que jamais initié.
Couverture auto existante : `ticketCheckin.integration.test.ts` — « signale un paiement en attente distinctement (payment_pending) ».

**SCAN-005 — Billet gratuit refusé sans crédit de point (anti-farming #75)**
Priorité : Haute
Préconditions : Place à prix catalogue 0€, billet non marqué payé, `source` ≠ `guestlist`.
Étapes :
1. Scanner ce billet.
Résultat attendu : Selon le prix réel de la place (`isFreePlace`), l'entrée est accordée SANS crédit de point de fidélité même si `paid` finit vrai — vérifier qu'un organisateur ne peut pas se rescanner à volonté sur un événement gratuit pour accumuler des points.
Couverture auto existante : `ticketCheckin.integration.test.ts` — « refuse un billet gratuit (place à 0) sans crediter de point (anti-farming #75) ».

**SCAN-006 — Billet révoqué toujours refusé**
Priorité : Critique
Préconditions : `ticket.revoked = true` (ex. remboursé/annulé côté organisateur).
Étapes :
1. Scanner ou saisir manuellement le code du billet révoqué.
Résultat attendu : 409, « Ce billet a été révoqué — entrée refusée. » (`revoked`), vérifié **avant** toute vérification de token/autorisation (`ticketCheckin.ts` L54).
Couverture auto existante : `ticketCheckin.integration.test.ts` — « refuse un billet révoqué ».

**SCAN-007 — QR périmé après revente : ancien token du vendeur rejeté, nouveau token de l'acheteur accepté**
Priorité : Critique
Préconditions : Billet vendu à un premier titulaire (QR A généré, `seatVersion` = v0), puis revendu officiellement → `seatVersion` incrémenté et/ou `entryNonce` régénéré côté billet, nouveau QR B émis à l'acheteur.
Étapes :
1. Tenter de scanner l'ancien QR A (celui du vendeur, encodant l'ancien `seatVersion`/`entryNonce`).
2. Vérifier le refus.
3. Scanner le nouveau QR B (acheteur actuel).
4. Vérifier l'acceptation.
Résultat attendu : Étape 1 → 403 `stale_or_invalid_token` (« QR périmé ou invalide — redemande un billet à jour au titulaire. ») car la signature HMAC ne correspond plus à l'état courant. Étape 3 → check-in accepté normalement (SCAN-001). La vérification de signature EST la vérification de fraîcheur (pas de champ de péremption séparé) — voir commentaire `ticketToken.ts` L9-18 et `ticketCheckin.ts` L74-88.
Couverture auto existante : `ticketCheckin.integration.test.ts` — « accepte un jeton QR à jour et le rejette une fois périmé (siège réattribué, #79) » ; unitaire pur dans `ticketToken.test.ts` — « goes stale automatically once seatVersion changes » et « … once entryNonce rotates ».

**SCAN-008 — Saisie manuelle refusée pour un siège réattribué (pas de contournement du QR)**
Priorité : Haute
Préconditions : Billet de table (`tableId` renseigné) avec `entryNonce` actif (siège déjà réattribué au moins une fois).
Étapes :
1. En mode « Saisie manuelle », taper le `ticketCode` brut (sans passer par un QR) d'un siège réattribué.
Résultat attendu : 403 `manual_entry_not_allowed_for_reassigned_seat` (« Ce siège a été réattribué — la saisie manuelle n'est pas acceptée ici, scanne le QR à jour. ») — seul le QR à jour prouve la possession de l'`entryNonce` courant ; empêche un ancien titulaire connaissant encore le code brut d'entrer après revente.
Couverture auto existante : `ticketCheckin.integration.test.ts` — « refuse une saisie manuelle (sans jeton) pour un siège déjà réattribué ». Contre-cas positif couvert par « accepte une saisie manuelle pour un billet solo jamais réattribué ».

**SCAN-009 — Accès scanner restreint : agent / organisateur / staff roster uniquement, DJ exclu**
Priorité : Critique
Préconditions : (a) compte `agent` sans lien avec l'événement, (b) compte organisateur propriétaire de l'événement (`organizerId`/`createdBy`), (c) compte staff roster avec rôle `serveur`/`manager`/`scan`, (d) compte staff roster avec rôle `dj`, (e) compte client lambda sans aucun rôle sur l'événement.
Étapes :
1. Pour chaque profil (a)-(e), se connecter et tenter un check-in sur le même billet du même événement.
Résultat attendu : (a) autorisé quel que soit l'événement (`caller.roles.includes('agent')`) ; (b) autorisé (propriétaire) ; (c) autorisé (roster, rôle ≠ dj) ; (d) **403 forbidden** — le DJ a accès à la playlist, pas au contrôle d'entrée (#75) ; (e) 403 forbidden. La sélection de mission se fait depuis `/my-shifts`, puis le contrôle s'ouvre sur `/scanner/[eventId]`.
Couverture auto existante : `ticketCheckin.integration.test.ts` — « refuse un scan par quelqu'un qui n'est ni agent, ni organisateur de l'event, ni staff », « autorise un membre du staff (serveur) mais refuse un DJ (#75) », « un agent peut toujours scanner, quel que soit l'événement ».

**SCAN-010 — Événement terminé : entrée refusée même avec billet valide**
Priorité : Moyenne
Préconditions : Événement dont `isEventEnded(event)` est vrai (date/heure de fin dépassée).
Étapes :
1. Scanner un billet par ailleurs valide et payé sur cet événement.
Résultat attendu : 409 `event_ended` (« Cet événement est terminé — entrée refusée. »). Contraste documenté avec le legacy qui ne bloquait cela que côté client (le serveur est désormais l'autorité complète).
Couverture auto existante : `ticketCheckin.integration.test.ts` — « refuse le check-in pour un événement déjà terminé ».

**SCAN-011 — Billet introuvable / code invalide**
Priorité : Moyenne
Préconditions : Aucune.
Étapes :
1. Saisir manuellement un code inexistant ou une chaîne vide/mal formée.
2. Scanner un QR corrompu (URL sans motif `/ticket/{token}` reconnu).
Résultat attendu : `invalid_code` (400) si code vide après trim ; `ticket_not_found` (404) si code bien formé mais absent en base. Messages distincts affichés à l'écran.
Couverture auto existante : implicite via les gardes en tête de `checkinTicket` — pas de test dédié identifié ; à couvrir manuellement.

**SCAN-012 — Reprise de session en plein mode service après rechargement accidentel**
Priorité : Basse
Préconditions : Un billet est en mode « Service sur place » (déjà check-iné).
Étapes :
1. Recharger la page navigateur en plein mode service (F5).
Résultat attendu : Le mode service se rouvre automatiquement sur le même billet via `sessionStorage` (`serviceSessionKey`), sans repasser par un nouveau check-in ni perdre le contexte de commande.
Couverture auto existante : aucune (comportement purement client, UX de confort) — test manuel uniquement.

**SCAN-013 — Session expirée pendant le scan**
Priorité : Moyenne
Préconditions : Session JWT expirée ou révoquée entre l'ouverture de `/scanner/[eventId]` et l'appel `/api/tickets/checkin`.
Étapes :
1. Simuler une session expirée (cookie supprimé) puis tenter un scan.
Résultat attendu : `auth_required`, message « Ta session a expiré — reconnecte-toi pour scanner. » avec lien direct vers `/login`.
Couverture auto existante : non identifiée dans les tests d'intégration listés — vérifier manuellement le rendu du lien de reconnexion.

---

### 7.2 Paiements transverses (Stripe / FedaPay / frais / devises)

Deux rails de paiement cohabitent : **Stripe** (EUR, carte bancaire, `lib/server/stripeClient.ts`, client construit paresseusement via `Proxy` pour ne jamais exiger `STRIPE_SECRET_KEY` sur un chemin qui ne l'utilise pas) et **FedaPay** (XOF, mobile money, `lib/server/fedapayClient.ts`, appels REST `fetch` bruts signés HMAC pour les webhooks). Les frais de service billet sont calculés **exclusivement côté serveur** (`lib/shared/fees.ts`), jamais reçus/fiés du client.

**PAY-001 — Checkout Stripe réussi → redirection succès**
Priorité : Critique
Préconditions : Événement en EUR, place disponible, `STRIPE_SECRET_KEY` configurée.
Étapes :
1. Sélectionner une place payante sur un événement EUR, aller au paiement.
2. Compléter le paiement avec une carte de test Stripe valide.
3. Observer la redirection.
Résultat attendu : Redirection vers `/payment-success` (ancienne route FR `/paiement-reussi` redirigée en 308 permanent — voir `next.config.ts`). Le billet passe `paid: true` après traitement du webhook/fulfillment (`fulfillOrder.ts`).
Couverture auto existante : logique de frais couverte unitairement (`fees.test.ts`), mais le flux Stripe Checkout bout-en-bout (webhook, fulfillment) n'a pas de test d'intégration identifié dans le périmètre listé — à couvrir manuellement / E2E.

**PAY-002 — Checkout Stripe échoué (carte refusée)**
Priorité : Haute
Étapes :
1. Utiliser une carte de test Stripe « refusée » (ex. `4000000000000002`).
2. Observer le comportement.
Résultat attendu : Aucun billet créé/marqué payé, message d'erreur Stripe affiché sur la page de paiement hébergée par Stripe, retour possible vers le panier sans perte de sélection de place.
Couverture auto existante : non identifiée — manuel.

**PAY-003 — Checkout Stripe annulé par l'utilisateur → redirection annulation**
Priorité : Haute
Étapes :
1. Démarrer un checkout Stripe puis cliquer « Retour » / fermer la page de paiement Stripe sans payer.
Résultat attendu : Redirection vers `/payment-success?cancelled=1` ; les anciennes URL `/payment-cancelled` et `/paiement-annule` répondent par une redirection permanente vers cet état canonique. Aucune place ne reste bloquée durablement.
Couverture auto existante : non identifiée — manuel.

**PAY-004 — Checkout FedaPay réussi (mobile money) → webhook `transaction.approved`**
Priorité : Critique
Préconditions : Événement en XOF, `FEDAPAY_SECRET_KEY` configurée (sandbox ou prod selon `apiBase()`).
Étapes :
1. Sélectionner une place payante sur un événement XOF.
2. Compléter le paiement Mobile Money (ou simuler via sandbox FedaPay).
3. Vérifier réception du webhook et fulfillment.
Résultat attendu : Le webhook est accepté seulement si `isApprovedTransactionEvent()` retourne vrai (soit `transaction.approved` direct, soit `transaction.updated` avec `status: 'approved'`) ET si `transactionAmountMatches()` confirme que le montant payé correspond exactement au montant attendu (comparaison en entiers arrondis — pas de tolérance de centimes). Redirection vers `/payment-success`.
Couverture auto existante : `lib/server/__tests__/fedapayClient.test.ts` — « approved direct ou via transaction.updated » et « aucun billet si le montant ne correspond pas exactement ».

**PAY-005 — Webhook FedaPay avec signature invalide ou rejouée (anti-replay)**
Priorité : Critique
Étapes :
1. Envoyer un webhook FedaPay avec une signature HMAC falsifiée.
2. Envoyer un webhook valide mais dont l'horodatage (`t=`) dépasse la tolérance de 300 s.
Résultat attendu : Les deux requêtes sont rejetées par `verifyWebhookSignature()` — aucun billet marqué payé, aucun état modifié en base.
Couverture auto existante : `fedapayClient.test.ts` — « acceptée quand valide (string ou Buffer) », « rejetée si secret/corps/entête falsifiés », « rejetée au-delà de la tolérance anti-replay (5 min) ».

**PAY-006 — Checkout FedaPay échoué/refusé**
Priorité : Haute
Étapes :
1. Simuler un refus de paiement Mobile Money (solde insuffisant, code erroné).
Résultat attendu : Transaction FedaPay au statut ≠ approved, pas de fulfillment déclenché, message d'échec affiché à l'utilisateur.
Couverture auto existante : non identifiée — manuel.

**PAY-007 — Checkout FedaPay annulé par l'utilisateur**
Priorité : Moyenne
Étapes :
1. Démarrer un paiement FedaPay puis quitter avant confirmation.
Résultat attendu : Redirection cohérente (page annulation), pas de billet créé.
Couverture auto existante : non identifiée — manuel.

**PAY-008 — Calcul des frais de service billet affiché conforme à la formule (EUR)**
Priorité : Critique
Préconditions : Aucune (test pur, isomorphe).
Étapes :
1. Pour un billet à prix unitaire connu (ex. 20,00 €, qty 1), lire le frais affiché à l'utilisateur avant paiement.
2. Comparer à `computeTicketFeeCents(2000, 1)` = `min(round(2000×0.05)+49, 250)` = `min(149, 250)` = 149 centimes (1,49 €).
3. Répéter avec un prix élevé pour vérifier le plafond (`capCents = 250`, soit 2,50 €/billet) et avec qty > 1 pour vérifier la multiplication linéaire par billet.
4. Vérifier prix nul ou qty nulle → frais 0 (billet gratuit).
Résultat attendu : Le montant affiché à l'écran de paiement correspond exactement à `computeTicketFeeCents`, jamais recalculé/arrondi différemment côté UI.
Couverture auto existante : `lib/shared/__tests__/fees.test.ts` — « 5% + 0,49€ par billet, exemple simple », « plafonne à 2,50€/billet », « multiplie par la quantité », « gratuit si prix ou quantité nulle ».

**PAY-009 — Calcul des frais de service billet conforme à la formule (XOF)**
Priorité : Critique
Étapes :
1. Pour un billet XOF (ex. 5000 FCFA), comparer le frais affiché à `computeTicketFeeXOF(5000, 1)` = `min(round(5000×0.05)+300, 1500)` = `min(550, 1500)` = 550 FCFA.
2. Vérifier le plafond à 1500 FCFA/billet sur un prix élevé.
3. Vérifier que le montant affiché n'a **aucune décimale** (XOF entier).
Résultat attendu : Frais exacts, entiers, plafonnés à 1500 FCFA/billet.
Couverture auto existante : `fees.test.ts` — « 5% + 300 FCFA par billet », « plafonne à 1500 FCFA/billet », « montants entiers (pas de décimales XOF) ».

**PAY-010 — Formatage monétaire affiché : EUR vs XOF**
Priorité : Haute
Étapes :
1. Afficher un prix EUR avec centimes non nuls (ex. 12,50 €) → vérifier séparateur français et 2 décimales.
2. Afficher un prix EUR rond (ex. 20 €) → vérifier absence de décimales inutiles (`,00` non affiché).
3. Afficher un prix XOF (ex. 5000) → vérifier suffixe « FCFA », séparateur de milliers `fr-FR`, aucune décimale même si le calcul interne produisait une valeur non entière.
Résultat attendu : `fmtMoney()` respecte ces trois règles ; comportement identique partout où `fmtMoney` est utilisé (ScannerClient, tickets, order).
Couverture auto existante : `lib/shared/__tests__/money.test.ts` — « XOF entier avec suffixe FCFA, EUR avec décimales seulement si utiles ».

**PAY-011 — Devise résolue depuis `event.currency`, jamais déduite de la région**
Priorité : Moyenne
Préconditions : Événement historique créé au Togo/Bénin mais dont les prix ont été saisis en euros (cas documenté dans `money.ts`).
Étapes :
1. Vérifier l'affichage des prix d'un tel événement.
Résultat attendu : La devise affichée suit `event.currency` explicite, pas une déduction depuis la région de l'événement — sinon régression du cas documenté en commentaire (`lib/shared/money.ts` L4-6).
Couverture auto existante : `money.test.ts` — « champ currency EXPLICITE uniquement — jamais de fallback région ».

**PAY-012 — Remboursement Stripe : idempotence sur relance**
Priorité : Critique
Préconditions : Commande payée par Stripe, événement annulé par l'organisateur déclenchant `refundStripeOrder()`.
Étapes :
1. Déclencher le remboursement une première fois (ex. annulation d'événement).
2. Déclencher à nouveau la même opération de remboursement pour la même commande (ex. double clic organisateur, retry après timeout réseau, re-livraison d'un webhook).
Résultat attendu : Le second appel détecte `EventRefund` existant avec `status: 'refunded'` (clé `eventId + paymentRef`) et retourne `{ ok: true }` **sans** rappeler `stripe.refunds.create` une seconde fois — aucun double remboursement réel côté Stripe.
Couverture auto existante : logique visible dans `lib/server/eventRefunds.ts` (L12-16, `if (existing?.status === 'refunded') return { ok: true }`) — pas de test unitaire/intégration dédié identifié dans le périmètre listé ; à ajouter/vérifier manuellement (mock Stripe + double appel).

**PAY-013 — Remboursement FedaPay : enregistrement manuel idempotent**
Priorité : Haute
Préconditions : Commande payée par FedaPay (aucune API de remboursement automatique côté FedaPay — voir commentaire `fedapayRefunds.ts` L6-8), événement annulé.
Étapes :
1. Déclencher `recordFedapayRefund()` une première fois.
2. Le redéclencher pour la même commande.
Résultat attendu : Premier appel crée une entrée `EventRefund` `status: 'pending_manual'` et, si `order.settled`, décrémente le solde vendeur (clampé à 0, jamais négatif). Second appel : `existing` trouvé → retourne `{ ok: true }` sans recréer d'entrée ni re-décrémenter le solde vendeur une seconde fois.
Couverture auto existante : non identifiée dans les tests listés — logique lisible dans `lib/server/fedapayRefunds.ts`, à couvrir par un test dédié (absent) ou manuellement.

**PAY-014 — Éligibilité Stripe Connect par pays (payout organisateur)**
Priorité : Moyenne
Étapes :
1. Vérifier qu'un organisateur basé en France (FR) est éligible Stripe Connect.
2. Vérifier qu'un organisateur basé en zone UEMOA (ex. Togo, Bénin — hors liste blanche) est orienté vers le rail FedaPay au lieu de Stripe Connect.
3. Vérifier le cas d'une valeur pays vide/absente.
Résultat attendu : `isStripeConnectCountry()` retourne vrai pour FR et les pays listés, faux pour les pays UEMOA hors liste et pour une valeur vide.
Couverture auto existante : `fees.test.ts` — « accepte les pays Connect (France) », « refuse les pays UEMOA (hors Connect, route FedaPay) », « refuse une valeur vide ».

---

## 8. Non-fonctionnel (design, performance, SEO, sécurité, accessibilité)

### 8.1 Sécurité — CSP et en-têtes (`next.config.ts`)

**NF-001 — CSP n'obstrue aucun chargement légitime (script/image/police)**
Priorité : Critique
Préconditions : Build de production ou `next dev`, DevTools ouvert (onglet Console + Network).
Étapes :
1. Naviguer sur la page d'accueil publique (`/home`), une page événement, la recherche, le login/signup.
2. Naviguer sur au moins un dashboard authentifié de chaque rôle (client `/profile`, organisateur `/organizer-studio`, prestataire `/offer-services`, agent `/agent`, scanner `/scanner/[eventId]`).
3. Sur chaque page, inspecter la console pour toute ligne « Refused to load/execute... violates the following Content Security Policy directive ».
Résultat attendu : Zéro violation CSP. Vérifier en particulier : images Cloudinary (`res.cloudinary.com`), pochettes iTunes (`*.mzstatic.com`), audio iTunes (`audio-ssl.itunes.apple.com`), images Unsplash du hero (`images.unsplash.com`) et police Geist auto-hébergée via `next/font/local`. `script-src 'self' 'unsafe-inline'` doit couvrir les scripts Next.js + Vercel Analytics/Speed Insights.
Couverture auto existante : aucune — pas de test automatisé de CSP identifié ; vérification manuelle console obligatoire à chaque déploiement touchant `next.config.ts` ou ajoutant une ressource externe.

**NF-002 — En-têtes de sécurité présents sur toutes les réponses**
Priorité : Haute
Étapes :
1. `curl -I` (ou onglet Network) sur `/home`, `/api/tickets/checkin` (401 attendu sans session, mais en-têtes doivent quand même être présents), et une page statique (`/terms`).
2. Vérifier la présence de chaque en-tête défini dans `securityHeaders` : `Content-Security-Policy`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(self), microphone=(self), geolocation=(), browsing-topics=()`, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
3. Vérifier l'absence de l'en-tête `X-Powered-By` (`poweredByHeader: false`).
Résultat attendu : Tous présents sur toutes les routes (`headers()` s'applique à `/(.*)`, sans exclusion). `Permissions-Policy` doit particulièrement être vérifié sur `/scanner/[eventId]` : `camera=(self)` doit laisser la caméra fonctionner en self (CameraScanner.tsx) mais la bloquer en iframe cross-origin.
Couverture auto existante : aucune — vérification manuelle (`curl -I` ou onglet Network).

**NF-003 — Redirections d'anciennes URLs françaises fonctionnelles (308 permanent)**
Priorité : Moyenne
Étapes :
1. Visiter chacune des anciennes routes FR listées dans `redirects()` (ex. `/accueil`, `/connexion`, `/evenements/123`, `/commander/abc`, `/profil`, `/profil/evenements-interesses`, `/profil/organisateurs-suivis`, `/paiement-reussi`, `/paiement-annule`).
2. Vérifier le code de statut et la destination.
Résultat attendu : Code 308 (permanent), destination exacte vers la nouvelle route EN (ex. `/evenements/123` → `/events/123`, wildcard `:path*` préservé). Cas particulier `/profil` : seules 3 entrées explicites existent (`/profil`, `/profil/evenements-interesses`, `/profil/organisateurs-suivis`) — pas de wildcard générique, donc `/profil/xyz-inconnu` ne doit PAS être redirigé silencieusement vers une route EN inexistante ; vérifier qu'il retombe en 404 propre plutôt qu'une redirection cassée.
Couverture auto existante : aucune — manuel.

### 8.2 SEO (`app/sitemap.ts`, `app/robots.ts`)

**NF-004 — `sitemap.xml` accessible et bien formé**
Priorité : Haute
Étapes :
1. GET `https://liveinblack.com/sitemap.xml` (ou `/sitemap.xml` en local).
2. Vérifier le XML : présence des routes statiques (`/home`, `/events`, `/providers`, `/organizers`, `/about`, `/search`, `/organizer-signup`, `/provider-signup`, `/terms`, `/privacy`, `/legal-notice`, `/cookies`), des entrées dynamiques `/events/{id}`, `/organizers/{slug}`, `/providers/{userId}`.
3. Vérifier qu'aucune route authentifiée (`/profile`, `/messages`, `/scanner`, etc.) n'apparaît dans le sitemap.
4. Vérifier que la génération ne casse pas si une des trois sources de données échoue (`listPublicEvents().catch(() => [])` etc. — chaque source est indépendante).
Résultat attendu : XML valide, `SITE` basé sur `PUBLIC_SITE_URL` (jamais déduit de `Host`), aucune fuite de route privée.
Couverture auto existante : aucune — manuel/smoke test à ajouter.

**NF-005 — `robots.txt` accessible, bloque bien les zones authentifiées**
Priorité : Haute
Étapes :
1. GET `/robots.txt`.
2. Vérifier `Disallow` pour `/api/`, `/profile`, `/messages`, `/scanner`, `/my-shifts`, `/my-events`, `/my-application`, `/organizer-studio`, `/offer-services`, `/agent`, `/order` et `/playlist`.
3. Vérifier `Allow: /` pour le reste et la ligne `Sitemap: {SITE}/sitemap.xml`.
Résultat attendu : Fichier conforme, cohérent avec les `robots: { index: false, follow: false }` déjà posés en metadata des pages authentifiées (double barrière documentée).
Couverture auto existante : aucune — manuel.

### 8.3 Performance / monitoring

**NF-006 — Vercel Analytics et Speed Insights présents dans le HTML servi**
Priorité : Moyenne
Étapes :
1. Charger n'importe quelle page en production (ou build de prod local) et inspecter le HTML source / Network pour les scripts `@vercel/analytics` et `@vercel/speed-insights`.
2. Vérifier dans `app/layout.tsx` que `<Analytics />` et `<SpeedInsights />` sont bien montés dans `<body>`, après `<Providers>` et `<CookieConsentBanner />`.
Résultat attendu : Les deux composants injectent leur script (généralement via `<script>` async injecté au montage) sans provoquer de violation CSP (voir NF-001) ni de blocage par un adblocker impactant le reste du rendu.
Couverture auto existante : aucune — vérification manuelle Network + Console.

**NF-007 — Polices self-hébergées : zéro requête réseau externe vers Google Fonts**
Priorité : Haute
Étapes :
1. Onglet Network, filtrer par domaine, charger n'importe quelle page.
2. Rechercher toute requête vers `fonts.googleapis.com` ou `fonts.gstatic.com`.
Résultat attendu : Aucune requête vers ces domaines — la police d'interface Geist est auto-hébergée via `next/font/local` et les titres utilisent la pile condensée locale définie par `--font-display`.
Couverture auto existante : aucune — manuel (Network tab).

### 8.4 Images / `next/image`

**NF-008 — Toutes les images converties en `next/image` s'affichent sans erreur « unconfigured host »**
Priorité : Haute
Préconditions : `next.config.ts` `images.remotePatterns` inclut `res.cloudinary.com`, `firebasestorage.googleapis.com`, `images.unsplash.com`, `*.mzstatic.com`, `picsum.photos`.
Étapes :
1. Naviguer sur des pages utilisant chacune de ces sources : galerie événement/profil (Cloudinary), anciennes photos pré-migration (Firebase Storage, si présentes en base), hero public (Unsplash), pochette morceau lecteur ambiant (mzstatic), menu scanner avec image d'article (`ScannerClient.tsx` L991, Cloudinary).
2. Vérifier la console pour toute erreur `Invalid src prop ... hostname ... is not configured under images` ou 400 sur `/_next/image`.
Résultat attendu : Aucune erreur — c'est le bug réel corrigé cette session (picsum.photos utilisé par `scripts/seed-bulk.ts` en dev, maintenant dans `remotePatterns`). Vérifier spécifiquement une page qui affiche des données de seed contenant des URLs `picsum.photos` en environnement de dev/staging.
Couverture auto existante : aucune — manuel, régression à surveiller à chaque ajout de nouvelle source d'image (Cloudinary transformations, nouveaux CDN).

**NF-009 — `ImageCropperModal.tsx` : crop/zoom en direct fonctionne toujours avec un `<img>` brut**
Priorité : Moyenne
Préconditions : Composant volontairement non converti en `next/image` (commentaire `eslint-disable-next-line @next/next/no-img-element` en L58).
Étapes :
1. Ouvrir un flux d'upload de photo de profil / bannière (organisateur ou prestataire) déclenchant `ImageCropperModal`.
2. Faire glisser l'image (offset), zoomer (slider/molette selon l'UI), confirmer le crop.
Résultat attendu : Le rendu live (`transform: translate(...) scale(...)`) reste fluide en temps réel — un `next/image` aurait cassé cette manipulation dynamique de transform sur une image non optimisée à la volée. Le crop final produit un data URI conforme à `outputWidth`/`aspect`/`circular`.
Couverture auto existante : aucune — manuel, régression à surveiller si quelqu'un tente de « moderniser » ce composant vers `next/image` par erreur.

### 8.5 Design / navigation / accessibilité

**NF-010 — Nav mobile flottante et `AccountMenu` reflètent le bon état d'authentification**
Priorité : Critique (bug réel corrigé cette session)
Préconditions : Compte connecté avec au moins un rôle actif.
Étapes :
1. Sur mobile (375px de large), se connecter puis observer la barre de navigation flottante en bas / le menu compte.
2. Vérifier qu'un utilisateur connecté voit un bouton profil/compte (avatar, initiales, ou équivalent), PAS « Connexion » / « Créer un compte ».
3. Se déconnecter, recharger, vérifier le retour à « Connexion » / « Créer un compte ».
4. Tester à la largeur desktop (`AccountMenu.tsx` dans `PublicNav.tsx`).
Résultat attendu : Aucune régression du bug legacy documenté (utilisateurs connectés voyant Connexion/Créer un compte au lieu d'un bouton profil) — corrigé dans `app/(public)/_components/PublicNav.tsx` et `AccountMenu.tsx` cette session.
Couverture auto existante : aucune identifiée — manuel, forte priorité de non-régression.

**NF-011 — Pas de flash visuel de mauvais état d'authentification au chargement**
Priorité : Haute
Étapes :
1. Recharger une page publique en étant connecté (F5, cache navigateur non vidé).
2. Observer les 200-500 premières millisecondes de rendu avant hydratation complète.
Résultat attendu : Pas de flash « Connexion / Créer un compte » suivi d'un remplacement soudain par le menu compte (FOUC d'état auth) — l'état de session doit être résolu côté serveur (session JWT) avant le premier rendu significatif, pas seulement après hydratation client.
Couverture auto existante : aucune — manuel, sensible au réseau lent (throttle 3G recommandé pour le test).

**NF-012 — Nav responsive jusqu'à 375px de large**
Priorité : Haute
Étapes :
1. Redimensionner à 375px (iPhone SE/mini) sur les pages publiques ET sur au moins un dashboard (organisateur, agent).
2. Vérifier que la barre de nav flottante / le menu hamburger ne chevauche pas le contenu, que tous les liens restent cliquables (cible tactile ≥ 44px), qu'aucun élément ne déborde horizontalement.
3. Vérifier spécifiquement `ScannerClient.tsx` à cette largeur (formulaire caméra + saisie manuelle + barre fixe « À encaisser » en bas — zone de recouvrement potentiel avec la nav mobile, cf. `bottom: mode === 'service' ... ? 74 : 16` pour les toasts).
Résultat attendu : Aucun chevauchement, aucun scroll horizontal parasite, toasts et barre de paiement fixe restent visibles et non masqués par la nav.
Couverture auto existante : aucune — manuel.

**NF-013 — Contraste et navigabilité clavier des CTA rectangulaires et des en-têtes teal**
Priorité : Haute
Étapes :
1. Sur une page publique et un dashboard utilisant le nouveau pattern CTA rectangulaire majuscule + eyebrow teal (ex. `/scanner` : `p` teal « Staff », `h1.font-display` « Scanner »), vérifier le contraste texte/fond (WCAG AA, ratio ≥ 4.5:1 pour texte normal, 3:1 pour grand texte) pour le teal `--teal` (#4ee8c8) sur fond `--obsidian`/`--surface`.
2. Naviguer entièrement au clavier (Tab/Shift+Tab/Entrée/Espace) à travers les CTA rectangulaires (boutons `primaryButtonStyle`, `dangerButtonStyle`, etc. dans `ScannerClient.tsx` et équivalents ailleurs) : vérifier un focus visible (outline ou équivalent) sur chaque bouton/lien.
3. Vérifier les champs de saisie avec `<label>` visuellement masqué (`SR_ONLY_STYLE`) — confirmer avec un lecteur d'écran (VoiceOver/NVDA) que le label est bien annoncé (ex. « Code du billet », « Motif de l'annulation »).
Résultat attendu : Contraste conforme AA sur fond sombre pour teal/gold/pink sur `--obsidian`/`--surface`/`--surface-2` ; focus clavier visible sur tous les CTA ; labels masqués visuellement mais lus par lecteurs d'écran.
Couverture auto existante : aucune — audit manuel (outil de contraste + test clavier + lecteur d'écran), à faire en priorité sur les composants les plus récemment redesignés.

**NF-014 — Emojis de contenu utilisateur non transformés en icônes (chat, drapeaux région)**
Priorité : Moyenne
Étapes :
1. Ouvrir `Messages`, réagir à un message via le picker rapide (`QUICK_REACT`, 8 premiers emojis de `EMOJIS`) puis via le picker complet (`FullReactionPicker`, tous les `EMOJIS` : ❤️ 😂 😮 😢 😡 👍 👎 🔥 🎉 💀 🤣 😍 😭 🙏 💯 ✅).
2. Vérifier que chaque réaction s'affiche comme un vrai caractère emoji (pas une icône `lucide-react` de substitution) dans la bulle de message et dans le résumé des réactions groupées.
3. Si l'app comporte un sélecteur de région/pays avec drapeaux emoji, vérifier de même qu'ils restent des emojis natifs.
Résultat attendu : Le picker de réactions (`app/(app)/messages/MessagesClient.tsx`, tableau `EMOJIS` L148) doit rester intact — ce sont de vrais emojis représentant le choix de l'utilisateur (contenu, pas iconographie décorative) et ne doivent PAS avoir été remplacés par des icônes lucide-react lors de la migration de design de cette session. Toute icône lucide-react trouvée à la place d'un emoji dans ce picker est une régression à signaler.
Couverture auto existante : aucune — vérification visuelle manuelle ciblée, priorité car c'est un point de vigilance explicite de cette session (risque de sur-correction du remplacement emoji→icône).

**NF-015 — Icônes lucide-react décoratives correctement en place ailleurs**
Priorité : Basse
Étapes :
1. Parcourir les pages où des emojis décoratifs ont été remplacés par `lucide-react` (dashboards, badges de statut, boutons d'action) et vérifier visuellement la cohérence (taille, couleur héritée de `currentColor`/tokens CSS, alignement avec le texte).
Résultat attendu : Rendu cohérent avec la charte (tokens `--teal`/`--gold`/`--pink`/`--violet`), pas d'icône orpheline ou mal alignée verticalement avec le texte adjacent.
Couverture auto existante : aucune — manuel, priorité basse (esthétique).


---
