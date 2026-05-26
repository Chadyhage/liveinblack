# ONBOARDING — LIVEINBLACK

> Document de prise en main du projet **LIVEINBLACK** — marketplace événementielle nightlife (France + Afrique de l'Ouest + Amérique). Lecture cible : un développeur web qui débarque sur le code, ou Chady (fondateur) qui veut une carte complète du projet.
>
> Dernière mise à jour : mai 2026 (post-session de fixes critiques).
>
> **État des fixes critiques** (voir `DEPLOY.md` pour la procédure de déploiement) :
> - ✅ Super admin externalisé en variable d'env (`VITE_SUPER_ADMIN_EMAILS`)
> - ✅ VAPID key FCM externalisée (`VITE_FIREBASE_VAPID_KEY`)
> - ✅ Bug `app` non exporté de `firebase.js` (qui faisait planter FCM silencieusement) corrigé
> - ✅ Bug `useNavigate` orphelin de BoostModal nettoyé
> - ✅ **Webhook Stripe** opérationnel (`api/stripe-webhook.js`) — finalise paiements côté serveur, idempotent
> - ⏳ Signature billets côté serveur : à faire (fix #10)
> - ⏳ Durcissement règles Firestore : à faire (fix #11, prérequis : Firebase Emulator local)

---

## 1. Le produit en deux phrases

LIVEINBLACK est une marketplace en français autour de l'événementiel nightlife. Trois types d'acteurs principaux : les **clients** achètent des billets et précommandent leurs consos, les **organisateurs** créent et gèrent des soirées, les **prestataires** (salles, artistes/DJ, matériel, traiteurs) proposent leurs services au catalogue. Un quatrième rôle, **agent**, modère la plateforme (validation des dossiers, dashboard métriques, scan des billets).

Le site est en production sur **liveinblack.com**, déployé sur Vercel avec auto-deploy à chaque push sur `main`.

## 2. Stack technique

| Couche            | Choix                                                                |
| ----------------- | -------------------------------------------------------------------- |
| Front             | **React 19** + **Vite 8** + **Tailwind 3.4** + styles inline JS      |
| Routing           | `react-router-dom` v7                                                |
| Auth / DB         | **Firebase** v12 (Auth + Firestore + Storage + Cloud Messaging)      |
| Paiements         | **Stripe Checkout** côté client + endpoints Vercel serverless        |
| Hébergement       | **Vercel** (`vercel.json`, repo GitHub `Chadyhage/liveinblack`)      |
| 3D / Visuel       | `three` (globe terrestre HomePage), WebGL shader maison (fond)       |
| QR codes          | `qrcode.react` (génération) + `jsqr` (lecture caméra)                |
| Recadrage avatar  | `react-easy-crop`                                                    |
| Polices           | Inter + DM Mono (UI) + Bebas Neue + Playfair Display (logo) + Cormorant Garamond (display) |

Toutes les dépendances sont déclarées dans `package.json` — pas de monorepo, pas de TypeScript, ESM (`"type": "module"`).

## 3. Démarrage rapide

```bash
# 1. Cloner et installer
git clone <repo> && cd liveinblack
npm install

# 2. Créer un fichier .env.local à la racine
#    (la version commitée dans le repo s'appelle .env.local — elle est aussi listée dans .gitignore)
cp .env.example .env.local
# puis remplir :
#   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
#   STRIPE_SECRET_KEY=sk_test_...

# 3. Lancer le dev server
npm run dev          # Vite, par défaut sur http://localhost:5173

# 4. Build de prod (ce que Vercel exécute)
npm run build        # → dist/
npm run preview      # sert le build localement
```

Le projet Firebase (`liveinblack-15d30`) et ses clés publiques sont **hardcodées dans `src/firebase.js`** — c'est volontaire (les clés Firebase Web ne sont pas des secrets, la sécurité repose sur les rules). Le service worker `public/firebase-messaging-sw.js` les répète à la main, attention si vous changez de projet Firebase.

✅ **Stripe webhook désormais en place** : `/api/stripe-webhook` écoute `checkout.session.completed` et finalise les bookings/boosts côté serveur via Firebase Admin SDK. Voir §11 et `DEPLOY.md`.

## 4. Arborescence des sources

```
src/
├── App.jsx              ─ Router + AuthContext provider + Guards (RequireAuth, RequireRole, OnboardingGuard, …)
├── main.jsx             ─ Bootstrap React
├── firebase.js          ─ initializeApp + exports (auth, db, storage, USE_REAL_FIREBASE)
├── index.css            ─ Tailwind + ~600 lignes de CSS custom (variables, animations, .glass, .glass-pill, .card-dark, .btn-gold, .input-dark, .nebula-bg, scrollbar, fonts)
├── context/
│   └── AuthContext.js   ─ createContext + hook useAuth() → { user, setUser, openAuthModal }
├── data/
│   ├── events.js        ─ events = [] (la BDD est Firestore — ce tableau reste pour la démo)
│   ├── regions.js       ─ Côte d'Ivoire, Ghana, Togo, Bénin, France, Amérique (avec lat/lon pour Earth3D)
│   └── legal.js         ─ LEGAL (mentions légales centralisées — à compléter dès immatriculation)
├── lib/
│   └── utils.js         ─ cn() utilitaire clsx + tailwind-merge
├── utils/               ─ TOUTE la logique métier — voir §7
├── components/          ─ UI réutilisable — voir §8
└── pages/               ─ 23 pages — voir §9
api/                     ─ Fonctions serverless Vercel (Stripe) — voir §11
public/
├── bg-liquid.mp4        ─ Fond vidéo 26 Mo (optionnel, pas servi par défaut)
└── firebase-messaging-sw.js  ─ Service Worker FCM (notifications push)
firestore.rules          ─ Règles Firestore — voir §12
storage.rules            ─ Règles Storage — voir §13
```

## 5. Architecture clé — le « write-through cache »

C'est **le concept central** à comprendre pour ne rien casser.

> **localStorage = lecture instantanée. Firestore = persistance cross-device.**
> Chaque écriture touche localStorage d'abord (sync), puis tire un `syncDoc(path, data)` vers Firestore en **fire-and-forget**.

Conséquences pratiques :

- Toutes les clés localStorage sont préfixées **`lib_`** (lib pour LIVEINBLACK). Exemples : `lib_user`, `lib_bookings`, `lib_conversations`, `lib_messages`, `lib_friends`, `lib_blocked`, `lib_boosts`, `lib_used_tickets`, `lib_created_events`, `lib_applications`, `lib_pending_validations`, `lib_role_requests`, `lib_service_orders`, `lib_provider_profiles`, `lib_catalog_<uid>`, `lib_friend_requests`, `lib_typing`, `lib_online`, `lib_last_read`, `lib_notifications_<uid>`, `lib_pending_booking_<id>`, `lib_pending_boost_<id>`, `lib_event_codes`, `lib_unlocked_events`, `lib_region`, `lib_cookie_consent`, `lib_photo_cache`, `lib_bids`, `lib_group_bookings`, `lib_new_contacts`, `lib_playlist_songs_<eventId>`, etc.
- Les imports de `utils/firestore-sync.js` sont **TOUJOURS dynamiques** (`import('../utils/firestore-sync').then(...)`) pour ne pas bloquer le first paint sur les pages publiques. **Ne jamais** convertir en import statique.
- Au login : `syncOnLogin(uid)` (dans `firestore-sync.js`) tire **17 sources Firestore** (bookings, events, conversations, messages, friends, catalogs, providers, boosts, used tickets, reports, pending validations, role requests, read status, public events, service orders, group bookings, users) et merge dans localStorage. Émet ensuite `window.dispatchEvent('lib:sync-complete')` — plusieurs composants écoutent cet event pour re-render.
- Au retour de visibilité d'onglet : nouveau `syncOnLogin` (`App.jsx` ligne 115-127) pour rattraper les changements faits sur un autre device.
- Listener temps réel sur `users/{uid}` (`App.jsx` ligne 132-164) : si le rôle ou le statut change côté Firestore (ex. admin approuve), la session locale est mise à jour sans reload.

### Helpers `firestore-sync.js` à connaître

| Helper                                | Quand l'utiliser                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `syncDoc(path, data)`                 | Écriture merge fire-and-forget (99 % des cas)                                 |
| `syncDocAwaitable(path, data)`        | Quand on a besoin du résultat (ex. publication d'event, gestion d'erreur UI)  |
| `syncDocOverwrite(path, data)`        | Écrase entièrement le doc (pas de merge)                                      |
| `syncDelete(path)`                    | Suppression                                                                   |
| `loadDoc(path)` / `loadCollection(p)` | Lecture async ponctuelle                                                      |
| `listenEvents(cb)`                    | Temps réel sur `events` (utilisé sur HomePage / EventsPage / AgentPage)       |
| `listenUserEvents(uid, cb)`           | Temps réel sur `user_events/{uid}` (MesEvenementsPage)                        |
| `listenDoc(path, cb)`                 | Temps réel sur un doc unique                                                  |
| `listenFriendRequests`, `listenDirectConversations`, `listenGroupConversations`, `listenConvMessages`, `listenUserPresence`, `listenUserSocial` | Hooks Messagerie / présence |
| `syncUserProfile(uid, userData)`      | Push explicite du profil — appelé à login/register/profile-update             |
| `pushLocalToFirestore(uid)`           | Synchronisation inverse (first sync depuis un device existant)                |

## 6. Authentification, rôles et flux d'inscription

### Flag global

`src/firebase.js` exporte `USE_REAL_FIREBASE = true`. Tous les chemins critiques (LoginPage, AuthModal, applications, accounts) testent ce flag pour basculer entre **Firebase réel** et **mode local démo** (mot de passe en clair, comparaison directe). Garder à `true` en prod.

### Le super admin (hard-codé !)

**`src/pages/LoginPage.jsx`, ligne 12 :**

```js
const SUPER_ADMIN_EMAIL = 'hagechady4@gmail.com'
```

Cet email est testé dans `doEmailLogin`, `doEmailRegister`, `doGoogleLogin`, `doAppleLogin`. Conséquences :

- À l'inscription, force `role: 'agent'` peu importe ce qui est demandé.
- À la connexion, override `role: 'agent'` même si Firestore contient autre chose (lignes 58-79 de LoginPage).
- Skip la vérification d'email obligatoire (ligne 51, 191).
- Si l'email tape le formulaire de login alors que le compte n'existe pas, switch automatique vers register (ligne 525-527).

**À faire en priorité** : externaliser dans Firestore (champ `isSuperAdmin: true` ou collection `admins/{uid}`) + variable d'env, et virer ce hard-code. Couplage projet ↔ personne = bombe à retardement.

### Les rôles

| Rôle           | Définition                                                                  | Nav items                                                       |
| -------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| (non connecté) | Visiteur                                                                    | Accueil, Événements                                             |
| `client`/`user`| Achète des billets                                                          | + Messages                                                      |
| `organisateur` | Crée et gère des événements                                                 | + Mes Events, Services                                          |
| `prestataire`  | Catalogue de services (salle/artiste/matériel/food)                         | + Mon Espace                                                    |
| `agent`        | Modération / admin                                                          | + bouton Admin séparé                                           |

### Architecture multi-rôles

Un même UID Firebase peut cumuler plusieurs rôles. Champs clés sur le user (`utils/accounts.js`) :

- `role` / `activeRole` : l'interface actuellement affichée
- `enabledRoles: string[]` : tous les rôles débloqués
- `orgStatus`, `prestStatus` : `'none' | 'pending' | 'active' | 'rejected'`
- `getEnabledRoles(user)` : fallback rétrocompatible pour les anciens comptes mono-rôle
- `requestAdditionalRole(user, role, prestataireType?)` : crée une demande dans `pending_validations` + `lib_role_requests`
- `approveRoleRequest(id)` / `rejectRoleRequest(id, reason)` : actions admin (AgentPage)
- `switchActiveRole(user, newRole)` : bascule l'UI (utilisé par SideMenu)

### Flux d'onboarding organisateur / prestataire

1. **Page publique d'inscription** : `/inscription-organisateur` ou `/inscription-prestataire` (accessibles sans compte). Géré par `OnboardingOrganisateur.jsx` / `OnboardingPrestataire.jsx` (~1100 lignes chacun, formulaire multi-étapes avec auto-save brouillon).
2. **Documents** uploadés via `uploadDocument(appId, docKey, file)` dans `utils/applications.js` → Firebase Storage à `applications/{appId}/{docKey}/{ts}_{filename}` (limite 15 Mo, timeout 30 s). Si Storage indisponible, le doc reste « draft » localement.
3. **Soumission** : `submitApplication(id, formData, candidateNote)` passe le statut à `submitted` (ou `resubmitted` si correction), met le user en `status: 'pending'`, sync Firestore.
4. **Modération** dans `AgentPage` (onglet « Validations » et « Dossiers ») → `updateApplicationStatus(id, status, adminUid, adminName, note)` avec statuts `under_review | needs_changes | approved | rejected | suspended`. Sur approbation, recopie les permissions dans le profil (`role`, `prestataireType`, `canSellAlcohol`, `emailVerified: true`).
5. **Suivi candidat** : `/mon-dossier` (`MonDossierPage.jsx`) affiche timeline (`AuditLog`), upload de docs en correction, score de complétude (`getCompleteness`), demande de suppression de compte RGPD (`accountDeletion.js`).
6. **OnboardingGuard** dans `App.jsx` (ligne 190-224) : redirige selon `status` (`draft` → formulaire, `pending` → mon-dossier, `onboarding` → form approprié).

### `useAuth()` et la `AuthModal` globale

`AuthContext.js` est minimal — `createContext(null)` + hook. La valeur est fournie par `App.jsx` via `usePersistedUser()` :

```js
const { user, setUser, openAuthModal } = useAuth()
// openAuthModal(reason, onSuccess) → ouvre la modale globale (montée 1× dans App)
```

C'est la fonction `handleProtectedNav` (dans `Layout.jsx`) qui appelle `openAuthModal` quand un visiteur clique sur une route protégée. Le `onSuccess` reçoit l'utilisateur, classique navigate.

## 7. Couche `utils/` — la logique métier

Tous les utils suivent le pattern write-through. Chaque module est commenté et autonome.

### `firestore-sync.js` (~480 lignes) — **fichier le plus critique**
Voir §5. Contient : `syncDoc`, `syncDocAwaitable`, `syncDocOverwrite`, `syncDelete`, `loadDoc`, `loadCollection`, tous les `listen*`, `syncOnLogin`, `pushLocalToFirestore`, `syncUserProfile`. Le helper interne `mergeById` est aussi exporté pour usage manuel dans MessagingPage.

### `messaging.js` (~800 lignes)
Messagerie complète + amis + groupes + sondages. À retenir :
- Conversations : `createDirectConversation`, `createGroup`, `leaveGroup`, `deleteGroup`, `updateGroupInfo`, `pinMessage`/`unpinMessage`.
- Messages : `sendMessage(convId, senderId, senderName, type, content, extra)` — types : `text | image | voice | story | poll | event | event_poll | group_booking | system`. Avec `replyTo`, `forwardedFrom`, `viewOnce`. Réactions, deliveredTo, readBy, deletedForSelf/All.
- **`voteOnPoll`** gère à la fois `type === 'poll'` ET `type === 'event_poll'` — ne pas séparer.
- Présence : `setOnline` / `setOffline` heartbeat 60s (lancé dans `App.jsx`), `isOnline(uid)` regarde local (90 s) puis Firestore (5 min).
- Amis : `sendFriendRequest`, `acceptFriendRequest`, `declineFriendRequest`, `getNewContacts`, `clearNewContact`.
- Block/Report : `blockUser`, `unblockUser`, `reportUser` (sync Firestore `reports/{id}`).
- Group bookings : `validateGroupBooking` (étape 1, juste l'accord), `payGroupBookingShare` (étape 2, après paiement Stripe), `addSongToGroupBooking`.
- `markMessagesRead` **ne sync pas Firestore** (volontaire — évite d'écraser des messages plus récents).
- `syncMessagesToFirestore(convId, msgs)` strippe les `data:` base64 (images/vocaux) pour ne pas dépasser la limite Firestore 1 Mo/doc — placeholders `[image]` / `[voice]` + flag `_hasLocalImage`. Vraie solution à venir : Firebase Storage pour les images.

### `applications.js` (~510 lignes)
- Statuts : `draft | submitted | under_review | needs_changes | resubmitted | approved | rejected | suspended` — chacun avec libellé + couleur dans `APPLICATION_STATUSES`.
- Documents requis variables par type (`getRequiredDocs(type, prestataireType)`) — voir le mapping détaillé pour artiste/salle/matériel/food.
- `uploadDocument` → Firebase Storage (timeout 30 s).
- `submitApplication` migre `submitted` → `resubmitted` si l'audit log contient un `needs_changes`.
- `updateApplicationStatus` : sur `approved`, copie les perms (`canSellAlcohol`, `prestataireType`, `displayName` pour artistes) dans le profil user.

### `accounts.js` (~445 lignes)
- CRUD comptes (`saveAccount`, `getAccountByEmail`, `getAccountById`, `getAccountByPhone` — vérif anti-doublon de numéro).
- Validations : `addPendingValidation`, `approveValidation`, `rejectValidation`.
- Multi-rôles : `getEnabledRoles`, `requestAdditionalRole`, `approveRoleRequest`, `rejectRoleRequest`, `cancelRoleRequest`, `switchActiveRole`.
- `getTotalPendingCount()` : utilisé par Layout pour le badge agent.
- Mot de passe : `checkPasswordStrength`, `validatePassword`.

### `ticket.js` (~165 lignes)
- **Signature anti-fraude des billets** : `generateTicketToken(booking)` et `verifyTicketToken(token)`. Hash maison (xorshift × `SECRET = 'LIB_S3CR3T_K3Y_2026_PRIV'`) + base64url. ⚠️ Le secret est hard-codé côté front. Pour vraiment sécuriser, il faudrait signer côté serveur. En l'état, n'importe quel utilisateur peut décompiler le bundle et forger des billets.
- Boosts : `saveBoost`, `getActiveBoosts`, `getActiveBoostsByRegion`, `isBoostSlotTaken`, `getBoostSlotOccupant`.
- `checkScheduleConflict(userId, dateISO, start, end, excludeEventId)` : détecte le chevauchement horaire (gère minuit traversé).

### `services.js` (~145 lignes)
Catalogue prestataire + commandes :
- `addCatalogItem` / `updateCatalogItem` / `deleteCatalogItem` (catalogue par UID).
- `placeOrder({buyer, seller, items})` calcule `subtotal`, `commission` (**10 %** `COMMISSION_RATE`), `sellerReceives`. Statuts `pending | confirmed | ready | done | cancelled`.
- `CATALOG_CATEGORIES` : supermarche, salle, prestation, materiel.
- Profils prestataires : `getProviderProfile(uid)`, `saveProviderProfile`.

### `permissions.js` (~110 lignes)
Helpers UI : `canBook(user)`, `canCreateEvent(user)`, `canProposeServices(user)`, `canOrderServices(user)`, `canAdminister(user)`, `canScanTickets(user)`, `getRoleLabel(role)`. Plus des messages d'erreur prêts-à-afficher (`getBookingBlockedReason`, `getCreateEventBlockedReason`).

### `stripe.js` (~80 lignes)
Façade frontend : `startStripeCheckout(params)`, `startStripeBoostCheckout(params)`, `verifyStripeSession(sessionId)`. Tous redirigent vers Stripe ou renvoient `{ok, error}`.

### `notifications.js` (~90 lignes)
Notifications in-app par user (max 50 gardées). Types : `application_approved | application_rejected | application_needs_changes | new_order | message`. `NOTIF_CONFIG` mappe type → emoji + couleur + label. `createNotification`, `getUnreadCount`, `markRead`, `markAllRead`, `syncNotificationsFromFirestore`.

### `accountDeletion.js` (~275 lignes)
Flux RGPD : audit (bloquants/avertissements) → demande → modération admin → anonymisation (`_anonymizeAccount`). Conserve les données transactionnelles anonymisées (Art. 17(3)(b) RGPD).

### `cropImage.js`
Petit helper qui retourne un blob recadré pour `react-easy-crop` (utilisé sur avatars + photo d'événement).

## 8. Composants

### `Layout.jsx` (~625 lignes) — composant central
Sidebar desktop (pill flottante), header mobile rétractable au scroll, bottom nav mobile, hamburger, cloche notif, footer légal.

**Props** :
- `children`
- `hideNav` : masque bottom nav mobile + footer global (pages paiement, ticket scanné).
- `chatMode` : full-screen — masque header desktop/mobile, footer, bottom nav. Applique `flex flex-col flex-1` au `<main>`.

**Points sensibles** :
- Bottom nav mobile = **`fixed`** (pas `sticky`) avec `pointerEvents:none` sur le `<nav>` et `pointerEvents:all` sur la pill interne. Ne pas changer.
- `handleProtectedNav(path)` ouvre l'AuthModal si non connecté avec callback de redirection — à utiliser sur tout lien vers route protégée (en pratique les pills appellent `navigate` direct, c'est plutôt les CTA HomePage qui s'en servent).
- Polling régulier : messages non lus (3 s), notifs (5 s), `pendingCount` agent (5 s). Si vous changez ces intervalles, attention à la charge Firestore.
- Effet scroll : cache le header mobile (seuil 80 px, delta 6 px), réinitialise au changement de route.

### `SideMenu.jsx` (~330 lignes)
Drawer hamburger gauche : profil, avatar, liens nav, switcher de rôles multi-comptes, cartes « devenir organisateur/prestataire », raccourci Admin, logout. Sous-composant `RoleRequestCard` gère les états `active | pending | rejected | none` avec actions Modifier / Annuler / Voir le dossier.

### `AuthModal.jsx` (~285 lignes)
Modale globale (montée 1× dans App). Two paths : Firebase réel (`signInWithEmailAndPassword` + lecture `users/{uid}`) ou mode local (compare mot de passe en clair sur `lib_registered_users`). Multi-comptes par email → sélecteur de rôle. z-index 9000.

### `Earth3D.jsx` (~195 lignes)
Globe 3D `three.js` sur HomePage, s'oriente vers lat/lon de la région choisie (depuis `regions.js`). Auto-rotation 0.0006 rad/frame, slerp vers cible, recule après 4,5 s d'inactivité. **Textures externes depuis `unpkg.com/three-globe/...`** — point de défaillance si CDN tombe ou hors-ligne.

### `LiquidMetalBg.jsx` (~195 lignes)
Fond plein écran « métal liquide » via shader WebGL maison (FBM 8 itérations, env-mapping irisé). Canvas `fixed`, `zIndex: 0`, `pointerEvents:none`. Atténué à `*= 0.28` pour laisser le contenu lisible. Coûteux GPU sur mobile bas de gamme.

### `PlaylistSystem.jsx` (~635 lignes)
Playlist participative par événement (réservée aux ayants-billet). Recherche **API iTunes** (`https://itunes.apple.com/search`), pré-écoute 30 s, propose 1 son par billet, max 5 likes par user. Sync `event_playlists/{eventId}` Firestore. Les likes ne sont **pas** sync (volontaire).

### `AuctionSystem.jsx` (~390 lignes)
Système d'enchères pour places « auction-enabled ». Compte à rebours 15 min, anti-sniping (+1 à 5 min si bid dans les 10 dernières min). Solo ou via groupe (`saveGroupAuctionBid` + message `group_auction_bid`). ⚠️ **Mode démo — aucun débit, aucun vrai paiement**. Stocké dans `lib_bids` localStorage uniquement.

### `BoostModal.jsx` (~420 lignes)
Bottom-sheet d'achat de boost Top 3 régional via Stripe. 3 positions × 4 paliers (jours/prix) dans `BOOST_PLANS`. ⚠️ Bug mineur : `useNavigate` appelé mais non importé (la variable `navigate` n'est jamais utilisée — à nettoyer).

### Autres composants
- **`AgeVerificationModal.jsx`** : confirmation pré-achat pour events 18+ (aucune donnée collectée, juste un avertissement).
- **`CookieConsent.jsx`** : bandeau CNIL-friendly, clé `lib_cookie_consent`, TTL 6 mois.
- **`LegalPageLayout.jsx`** : layout réutilisable pour mentions légales / confidentialité / cookies. Prop `html` documentée mais **non implémentée** dans le rendu.
- **`RegionSelector.jsx`** : bottom-sheet de sélection région, alimenté par `data/regions.js`.
- **`icons.jsx`** : bibliothèque SVG maison style Lucide (`IconBell`, `IconCalendar`, `IconBolt`, `IconCrown`, `IconTicket`, `IconChat`, `IconUsers`, `IconCheck`, `IconAlert`, `IconLock`, `IconMail`, `IconIdBadge`, `IconEdit`, `IconTrash`, `IconHourglass`, `IconPin`, `IconSettings`, `IconTent`, `IconMic`).
- **`ui/gooey-text-morphing.jsx`** : effet de texte morphing (HomePage hero). Seul fichier utilisant l'alias `@/lib/utils` — si l'alias casse, ce composant casse.

## 9. Pages (`src/pages/`)

### Pages publiques (sans compte)

| Route                    | Fichier                       | Rôle                                                                   |
| ------------------------ | ----------------------------- | ---------------------------------------------------------------------- |
| `/accueil`               | `HomePage.jsx`                | Globe 3D, Top 3 régional, sections « Comment ça marche » et CTA inscription. `listenEvents` temps réel. Détecte la région du navigateur au premier visit. |
| `/evenements`            | `EventsPage.jsx`              | Liste filtrable, gère le mode partage (`?shareWith=convId`), déverrouille via codes (`lib_event_codes` / `lib_unlocked_events`). |
| `/evenements/:id`        | `EventDetailPage.jsx`         | **2250 lignes**. Achat de billet + précommandes + playlist + enchères + réservation de groupe. Cœur business. |
| `/cgu`, `/mentions-legales`, `/confidentialite`, `/cookies` | `CGUPage`, `MentionsLegalesPage`, … | Pages légales (utilisent `LegalPageLayout`). |
| `/ticket/:token`         | `TicketPage.jsx`              | Page vue par l'agent au scan QR — affiche billet + vérifie la signature. Pas de Layout (page autonome). |
| `/paiement-reussi`       | `PaiementReussiPage.jsx`      | Retour Stripe — `verifyStripeSession` puis génère les tokens billets, persiste, ajoute des points fidélité (1 point par billet). Cleanup `lib_pending_booking_<id>`. |
| `/paiement-annule`       | `PaiementAnnulePage.jsx`      | Retour Stripe annulation. |
| `/boost-active`          | `BoostActivePage.jsx`         | Retour Stripe après paiement boost — vérifie session puis `saveBoost(...)` avec metadata Stripe comme source de vérité. |
| `/connexion`             | `LoginPage.jsx`               | **1420 lignes** — login + register + Google + Apple + reset + email verification resend. Super admin hard-codé. |

### Pages protégées

| Route                         | Rôle requis                | Fichier                       | Notes                                                                                       |
| ----------------------------- | -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `/profil`                     | tout connecté              | `ProfilePage.jsx` (2310 l.)   | Avatar (`react-easy-crop`), billets groupés par event, changement nom (1×/30j), changement mdp/email, suppression compte, **génération PDF d'accréditation** pour orgs/prestas approuvés (`openCredentialPDF`). |
| `/messagerie`                 | tout connecté              | `MessagingPage.jsx` (2730 l.) | Conversations + groupes + photos compressées (qualité 0,78 / max 900px) + vocaux + sondages + réservations de groupe + photo cache (`lib_photo_cache`). |
| `/scanner`                    | tout connecté (filtré par `canScanTickets`) | `ScannerPage.jsx` (825 l.)    | Caméra (`navigator.mediaDevices.getUserMedia`) + `jsqr` ; mode billet ou commande ; marque les billets utilisés dans `lib_used_tickets` + sync `used_tickets/{uid}`. |
| `/boite`                      | tout connecté              | `JeSuisUneBoitePage.jsx`      | Formulaire « inscription boîte/club » → `boite_registrations/{id}` Firestore. |
| `/mes-evenements`             | `organisateur` ou `agent`  | `MesEvenementsPage.jsx` (2490 l.) | Création/édition d'event multi-étapes (`Cropper` photo, génération codes, places, menus, shows), publication via `syncDocAwaitable` avec bandeau d'erreur, annulation avec message aux acheteurs, panneau réservations et stats par event, modal Boost. |
| `/proposer`                   | prestataire/org/agent      | `ProposerServicesPage.jsx` (1610 l.) | Dashboard prestataire (Aperçu, Catalogue, Commandes, Profil) + vue publique catalogue (commande avec panier, contact via messagerie). Demande de rôle prestataire pour les non-prestas. |
| `/inscription-organisateur`   | public                     | `OnboardingOrganisateur.jsx` (1050 l.) | Formulaire multi-étapes (identité, contact, entreprise, docs). Auto-save Firestore. |
| `/inscription-prestataire`    | public                     | `OnboardingPrestataire.jsx` (1260 l.)  | Idem + variantes selon `prestataireType` (artiste, salle, materiel, food). |
| `/mon-dossier`                | tout connecté              | `MonDossierPage.jsx` (1090 l.) | Timeline, statut, complétude, upload docs en correction, demande de suppression compte. |
| `/agent`                      | `agent` uniquement         | `AgentPage.jsx` (2770 l.)     | Onglets : Dashboard (métriques + graphique), Validations, Dossiers, Utilisateurs, Events, Commandes, Boosts, Signalements, Suppression de comptes, Outils (cleanup expirés, doublons, reset DB). |

## 10. Routing et guards (`App.jsx`)

```
RequireAuth(user, to)      → /connexion?next=<to> si !user
RequireRole(user, role)    → /accueil si user.role !== role
RequireOrganisateur(user)  → /accueil si pas organisateur ni agent
RequireServiceAccess(user) → /accueil si user.role est client/user (services interdits aux clients)
OnboardingGuard(user)      → redirige selon user.status :
   draft       → /inscription-{org,prest}
   onboarding  → /onboarding-{org,prest}
   pending     → /mon-dossier (sauf /accueil, /evenements, /ticket, /cgu)
ConnexionRoute(user)       → si user connecté et pas ?mode=, redirige /accueil
```

## 11. Paiements Stripe

### Endpoints serverless (`api/`)

| Endpoint                | Méthode | Rôle                                                                            |
| ----------------------- | ------- | ------------------------------------------------------------------------------- |
| `/api/checkout`         | POST    | Crée une session Stripe pour achat de billet (place + préco). Retour `/paiement-reussi?session_id=...&booking_id=...` |
| `/api/checkout-boost`   | POST    | Crée une session pour acheter un boost Top N. Retour `/boost-active?session_id=...&boost_id=...`                       |
| `/api/verify-session`   | GET     | Vérifie une session côté serveur (utilise `stripe.checkout.sessions.retrieve`). Retourne `{ paid, paymentStatus, amountTotal, currency, customerEmail, customerName, metadata, receiptUrl }`. |
| `/api/stripe-webhook`   | POST    | **Filet de sécurité** Stripe. Écoute `checkout.session.completed` et finalise booking/boost en Firestore (collections `bookings/{id}` et `boosts/{id}`) + mirror dans `user_bookings/{uid}.items` et `user_boosts/{uid}.items`. Idempotent. Utilise Firebase Admin SDK avec service account. Requiert `STRIPE_WEBHOOK_SECRET` + `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`. |

Tous utilisent `process.env.STRIPE_SECRET_KEY` côté server, locale `fr`, devise EUR. Les metadata Stripe portent `eventId`, `bookingId` / `boostId`, `userId`, etc. — c'est la **source de vérité** pour `BoostActivePage` qui n'a même pas besoin du pending local.

### Flux d'un achat de billet

1. EventDetailPage → bouton « Réserver » → écrit `lib_pending_booking_<id>` en local, appelle `startStripeCheckout(...)`.
2. Redirection vers Stripe Checkout (hébergé par Stripe).
3. Stripe redirige vers `/paiement-reussi?session_id=...&booking_id=...`.
4. `PaiementReussiPage` appelle `/api/verify-session`. Si `paid:true` :
   - Récupère le pending local.
   - Génère les billets (1 par qty), token signé via `generateTicketToken`.
   - Persiste `lib_bookings`, sync `user_bookings/{uid}`.
   - Si réservation de groupe : `payGroupBookingShare`.
   - Ajoute 1 point fidélité par billet → `users/{uid}.points`.
   - Cleanup `lib_pending_booking_<id>`.

### ✅ Webhook Stripe en place (mai 2026)

`/api/stripe-webhook` écoute `checkout.session.completed` côté serveur et crée le booking/boost en Firestore via Firebase Admin SDK, indépendamment de ce qui se passe côté navigateur. Si le client ferme l'onglet entre Stripe et `/paiement-reussi`, le booking est quand même créé.

**Comportement actuel** :
- Le webhook crée le doc dans `bookings/{bookingId}` (collection plate, idempotent)
- Et mirror dans `user_bookings/{uid}.items` (pour `syncOnLogin`)
- Le flow `PaiementReussiPage` n'a pas été modifié — il continue à créer en local ET en Firestore comme avant. Le webhook agit en double-protection.
- Risque résiduel : double-création possible si client ET webhook tournent. Comme le `bookingId` est identique et que la collection plate `bookings/{bookingId}` dédoublonne, ce n'est pas critique. À surveiller en prod et à raffiner si nécessaire (le client pourrait poll `bookings/{bookingId}` au lieu de tout regénérer).

## 12. Firestore — collections et règles

### Collections utilisées

| Collection                   | Contenu                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `users/{uid}`                | Profils (nom, email, avatar, role, enabledRoles, status, points, lastSeen, isOnline, fcmToken, etc.) |
| `events/{id}`                | Événements publics (lecture publique, écriture = organisateur ou agent) |
| `user_events/{uid}`          | `{items: Event[]}` — events créés par cet user (mirror)                 |
| `user_bookings/{uid}`        | `{items: Booking[]}` — billets achetés                                  |
| `user_social/{uid}`          | `{friends, blocked}`                                                    |
| `friend_requests/{id}`       | Demandes d'amis                                                         |
| `conversations/{id}`         | Direct + groupes (`participants[]` pour DM, `participantIds[]` pour groupes) |
| `conv_messages/{id}`         | `{items: Message[]}` par conversation                                   |
| `conv_photos/{id}`           | Photos lourdes (fallback base64 pour ne pas saturer `conv_messages`)    |
| `user_read_status/{uid}`     | `{convId: timestamp}`                                                   |
| `group_bookings/{id}`        | Réservations de groupe                                                  |
| `service_orders/{id}`        | Commandes prestataires                                                  |
| `providers/{uid}`            | Profil prestataire                                                      |
| `catalogs/{uid}`             | `{items: CatalogItem[]}`                                                |
| `applications/{id}`          | Dossiers organisateur/prestataire (avec auditLog)                       |
| `pending_validations/{id}`   | File d'attente admin (legacy — `applications` la remplace progressivement) |
| `event_playlists/{id}`       | Playlists d'événement                                                   |
| `user_boosts/{uid}`          | `{items: Boost[]}`                                                      |
| `used_tickets/{uid}`         | `{items: string[]}` — billets scannés                                   |
| `reports/{id}`               | Signalements                                                            |
| `deletion_requests/{id}`     | Demandes de suppression RGPD                                            |
| `boite_registrations/{id}`   | Soumissions « Je suis une boîte »                                       |
| `notifications/{uid}`        | `{items: Notification[]}`                                               |

### Règles (`firestore.rules`)

Les règles utilisent les helpers `isSignedIn()`, `isAgent()` (lit `users/{uid}.role == 'agent'`), `isOwner(uid)`.

À retenir :
- `users/*` : read pour tout signed-in (nécessaire au sync contacts), write réservé au propriétaire ou agent.
- `events/*` : **read public** (visiteurs non connectés peuvent voir), write réservé à `createdBy`/`organizerId`/agent.
- `conversations`, `conv_messages`, `friend_requests`, `group_bookings`, `service_orders`, `conv_photos` : read+write pour tout signed-in (les access controls sont côté app, **pas** Firestore — exposition potentielle à durcir).
- `boite_registrations` : **create public** (anonymes possibles) + read agent uniquement.
- `reports` : write public signed-in, read agent uniquement.
- `event_playlists` : read public, write signed-in.

⚠️ Les règles sont **permissives sur les collections de messagerie et de services**. En l'état, n'importe quel utilisateur connecté peut lire toutes les conversations / commandes. Pour la prod, durcir via `request.auth.uid in resource.data.participants` etc.

## 13. Storage — règles

Trois espaces dans `storage.rules` :
- `applications/{appId}/{path}` : écriture signed-in, fichiers < **15 Mo**. Lecture signed-in.
- `avatars/{userId}/{path}` : lecture publique, écriture par le propriétaire, < **5 Mo**.
- `messages/{convId}/{path}` : lecture publique, écriture signed-in, < **25 Mo** (vocaux / images / pièces jointes).

## 14. Design system & conventions visuelles

### Source de vérité : `src/index.css`

Variables CSS principales (≠ de ce que dit `CLAUDE.md`) :

```
--obsidian       #05060a   (fond principal)
--obsidian-2     #0b0b12
--obsidian-3     #0e0e18
--violet         #8444ff   ← accent primaire actuel (gradient violet→pink)
--violet-end     #ff4da6
--gold           #c8a96e   (accent secondaire)
--gold-bright    #e0c080
--teal           #4ee8c8
--pink           #ff4da6
```

Classes Tailwind custom (définies dans `@layer components`) : `.glass`, `.glass-pill`, `.card-dark`, `.btn-gold`, `.btn-outline`, `.input-dark`, `.animate-crown`, `.animate-fade-in`, `.nebula-bg` + `.nebula-blob`.

Polices :
- **Bebas Neue** : « L|VE IN » du logo, headings caps
- **Playfair Display italic** : « BLACK » du logo
- **Cormorant Garamond** : titres display (TicketPage, BoostActivePage, PaiementReussiPage…)
- **DM Mono** : labels nav, eyebrows, prix, badges
- **Inter** : corps de texte

### ⚠️ Écart avec `CLAUDE.md`

`CLAUDE.md` documente un design system « `--teal` accent principal + `--gold` accent secondaire » et proscrit `#d4af37`. Dans la pratique, **le CSS et plusieurs composants utilisent encore le violet/pink** (`#8444ff`/`#ff4da6`) comme accent primaire (scrollbar, nebula, AuthModal `ROLE_COLORS`, Layout `var(--violet)`). `#d4af37` apparaît encore dans `tailwind.config.js` (`gold-400`), dans AuthModal et AuctionSystem (couleurs en dur). Il y a une transition incomplète à terminer — décider qui est source de vérité (charte CLAUDE.md ou code actuel) et harmoniser.

## 15. Points à ne PAS casser

1. **Imports `firestore-sync` toujours dynamiques** (`import('../utils/firestore-sync').then(...)`). Static = boucle de chargement bloquée.
2. **`handleProtectedNav` dans Layout.jsx** : protège les routes premium quand un visiteur clique sur un CTA.
3. **`voteOnPoll` dans messaging.js** gère `'poll'` ET `'event_poll'` ensemble — ne pas dupliquer ni séparer.
4. **Bottom nav mobile = `fixed`** (pas `sticky`) dans Layout.jsx. `pointerEvents:none` sur le `<nav>`, `pointerEvents:all` sur la pill.
5. **`syncMessagesToFirestore` strippe les `data:` base64** des images/vocaux — sinon les docs dépassent 1 Mo.
6. **`syncOnLogin` ne touche jamais l'email ni le nom** du `lib_user` (Firebase Auth = source de vérité — bug historique).
7. **Le listener temps réel `users/{uid}` dans App.jsx** propage les changements de rôle/statut sans reload — ne pas le supprimer.
8. **L'OnboardingGuard** doit garder les bypass paths à jour (`/inscription-...`, `/onboarding-...`, `/connexion`, `/cgu`, `/mon-dossier`) sinon comptes pending bouclent.
9. **`USE_REAL_FIREBASE`** : garder à `true` en prod ; en local démo possible à `false` pour tester sans backend.
10. **Les keys localStorage `lib_*`** sont la cache locale. Modifier leur forme casse les anciens utilisateurs qui ont des données existantes — toujours prévoir une migration.

## 16. Problèmes connus / dette technique

Priorité haute :

1. **Webhooks Stripe absents** — si le client ferme l'onglet entre Stripe et `/paiement-reussi`, le billet n'est jamais généré malgré le paiement. Ajouter un endpoint `/api/stripe-webhook` qui écoute `checkout.session.completed` et écrit `bookings`/`boosts` côté serveur.
2. **Super admin hard-codé** (`SUPER_ADMIN_EMAIL` dans LoginPage.jsx). À migrer vers un champ Firestore + variable d'env.
3. **Sync Firestore cross-device non testée à grande échelle** en prod — il y a eu plusieurs commits récents (`Fix critique : sync Firestore awaité`, `event qui apparaît puis disparaît cross-device`, `event invisible dans /evenements`). À surveiller.
4. **Signature billets côté client** (`SECRET` en dur dans le bundle JS). N'importe qui peut forger des tokens en lisant le source. Pour de vrais billets payants, signer côté serveur.
5. **Règles Firestore permissives** sur `conversations`, `conv_messages`, `service_orders`, `group_bookings`. Tout signed-in peut tout lire/écrire — durcir.
6. **VAPID key FCM placeholder** dans `App.jsx` ligne 75 : `'BEl62iUYgUivxIkv69yViEuiBIa40HI80NM1x6CrHOg3FfvbOgbNHwX0HFmIxAT6Gz0LI0E3sEX9RVjIHaH'`. Remplacer par la vraie clé du projet Firebase quand FCM sera vraiment utilisé.

Priorité moyenne :

7. **Bug mineur BoostModal** : `useNavigate` appelé mais non importé. La variable `navigate` n'est jamais utilisée → à supprimer.
8. **`LegalPageLayout` prop `html`** documentée mais non rendue.
9. **Dépendance CDN externe Earth3D** (textures `unpkg.com`) — si unpkg tombe, plus de globe. Servir les textures depuis `public/`.
10. **Dépendance API iTunes** dans PlaylistSystem — pas de clé requise mais pas de garantie de service.
11. **Données démo** dans `src/data/events.js` (le tableau `services`) — toujours là alors que la BDD est Firestore. À supprimer ou clarifier.
12. **`USE_REAL_FIREBASE`** : code de fallback localStorage encore présent partout (`isOnline`, comparaisons mdp en clair, etc.). Si on garde Firebase, on peut nettoyer ces branches.

Priorité basse :

13. **Écart design system** entre `CLAUDE.md` (teal+gold) et le CSS réel (violet+pink). Décider et harmoniser.
14. **Code mort** : `markRead` importé dans Layout mais non utilisé. `getActiveBoostsByRegion` importé dans BoostModal mais non utilisé. `walletError` dans AuctionSystem (inerte depuis suppression du wallet). `BookingsPanel`/`StatsPanel` dans `MesEvenementsPage` (présence à vérifier).
15. **Fichier `bg-liquid.mp4` de 27 Mo** dans `public/` — pas servi par défaut, à virer si vraiment inutile (gain temps de déploiement Vercel).

## 17. Roadmap probable / pistes

D'après le code et l'historique git (commits récents) :

- **Stripe Connect** pour reverser aux organisateurs / prestataires. La structure est prête côté code (`stripe.account_id`, `payouts_enabled`, `charges_enabled` dans `applications.js` `stripeDefaults()`) mais l'intégration manque.
- **Webhooks Stripe** (cf. dette technique #1).
- **TypeScript** : non utilisé, mais le projet a grossi (~31k lignes) — typer au moins la couche `utils/` rendrait service.
- **Tests** : aucun test automatisé actuellement. Vu la criticité (paiements, billets, candidatures), prioriser au minimum quelques tests d'intégration sur le flux paiement et la signature billet.
- **Code splitting** : pages monolithiques (EventDetailPage 2250 l., AgentPage 2770 l., MessagingPage 2730 l.) — extraire des composants dans `src/components/` au fil de l'eau.
- **i18n** : tout est en français en dur. Si le projet vise l'Afrique de l'Ouest francophone uniquement, OK. Si on vise l'Afrique anglophone (Ghana est déjà dans `regions.js`), prévoir une lib d'i18n.

## 18. Cheat sheet

```
# Lancer le projet
npm install && npm run dev

# Déployer
git push origin main          # Vercel auto-déploie

# Se connecter en super admin (dev)
email: hagechady4@gmail.com
→ Force role 'agent', skip email verification, override Firestore

# Comprendre une donnée locale
localStorage → DevTools → tout est sous `lib_*`

# Forcer un re-sync depuis Firestore
window.dispatchEvent(new Event('lib:sync-complete'))  # ou re-login

# Voir les clés Firestore réelles
src/firebase.js → projectId "liveinblack-15d30"
```

---

> Pour toute question, commencer par lire le fichier de l'utilitaire concerné dans `src/utils/` — ce sont les mieux commentés. `firestore-sync.js`, `messaging.js`, `applications.js`, `accounts.js` couvrent ~80 % de la logique métier.
