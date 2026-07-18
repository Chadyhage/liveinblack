# 🌌 LIVEINBLACK — Documentation Complète du Projet

> **LIVEINBLACK** est une marketplace événementielle et nightlife en français. Elle permet aux clients d'acheter des billets, aux organisateurs de créer des soirées, aux prestataires de proposer leurs services, et à des agents de modérer la plateforme. Déployée en production sur **liveinblack.com** via Vercel.

---

## 📖 Table des matières

1. [Concept Produit](#1-concept-produit)
2. [Stack Technique — Détails complets](#2-stack-technique--détails-complets)
3. [Arborescence complète des fichiers](#3-arborescence-complète-des-fichiers)
4. [Architecture clé : le Write-Through Cache](#4-architecture-clé--le-write-through-cache)
5. [Authentification, Rôles et Guards](#5-authentification-rôles-et-guards)
6. [Toutes les Pages (Routes)](#6-toutes-les-pages-routes)
7. [Tous les Composants UI](#7-tous-les-composants-ui)
8. [Couche Utils — Logique Métier](#8-couche-utils--logique-métier)
9. [API Serverless Vercel (`/api`)](#9-api-serverless-vercel-api)
10. [Paiements — Flux Stripe & FedaPay](#10-paiements--flux-stripe--fedapay)
11. [Firestore — Collections & Structure des données](#11-firestore--collections--structure-des-données)
12. [Règles de Sécurité Firestore & Storage](#12-règles-de-sécurité-firestore--storage)
13. [Design System & Identité Visuelle](#13-design-system--identité-visuelle)
14. [Fonctionnalités Terminées](#14-fonctionnalités-terminées)
15. [Dette Technique & Ce qui Reste à Faire](#15-dette-technique--ce-qui-reste-à-faire)
16. [Installation & Développement Local](#16-installation--développement-local)
17. [Déploiement & Configuration Vercel](#17-déploiement--configuration-vercel)
18. [Variables d'Environnement — Référence Complète](#18-variables-denvironnement--référence-complète)

---

## 1. Concept Produit

LIVEINBLACK est une marketplace en trois dimensions :

- **Billetterie** : Les clients achètent des billets pour des soirées, précommandent des consommations (bouteilles, menus), réservent des tables, et participent à des playlists collaboratives.
- **Marketplace prestataires** : Les prestataires (DJ/Artistes, Salles, Matériel, Traiteurs/Food) proposent leurs services via un catalogue en ligne. Les organisateurs les contactent et commandent.
- **Réseau nightlife** : Messagerie en temps réel, gestion d'amis, sondages, partage d'événements, statuts en ligne/hors-ligne.

### Rôles utilisateurs

| Rôle | Accès clé |
|:---|:---|
| **Visiteur** (non connecté) | Accueil, liste des événements, fiches événements, annuaires publics |
| **Client** (`client`) | + Achat billets, précommandes, tables, messagerie, profil |
| **Organisateur** (`organisateur`) | + Création/gestion d'événements, statistiques, guestlist, scanner QR, boosts Top 3 |
| **Prestataire** (`prestataire`) | + Catalogue d'offres, gestion des commandes, profil public prestataire, abonnement |
| **Agent / Admin** (`agent`) | + Dashboard d'administration complet, validation dossiers, gestion des utilisateurs/événements |

> Un seul compte Firebase (uid) peut cumuler plusieurs rôles (`enabledRoles: string[]`). L'utilisateur bascule d'une interface à l'autre via `switchActiveRole()`.

### Flux de validation organisateur / prestataire

1. L'utilisateur remplit un formulaire multi-étapes (Onboarding) et dépose ses justificatifs sur Firebase Storage.
2. Le dossier passe à `status: 'submitted'` dans Firestore (`applications/{id}`).
3. Un **Agent** examine le dossier depuis son dashboard et peut :
   - **Approuver** → le rôle est accordé, les droits d'accès sont mis à jour en Firestore.
   - **Demander des corrections** → l'utilisateur reçoit un email (via Resend) et peut corriger et resoumettre.
   - **Refuser** → statut `rejected`, email de notification.
4. Le listener temps réel `users/{uid}` dans `App.jsx` propage le nouveau rôle sans rechargement de page.

---

## 2. Stack Technique — Détails complets

### Frontend
| Technologie | Version | Usage |
|:---|:---|:---|
| **React** | 19 | Bibliothèque UI principale (hooks, context, suspense) |
| **Vite** | 8 | Bundler/Dev server (ESM natif, HMR rapide) |
| **Tailwind CSS** | 3.4 | Utilitaires CSS + layer `@layer components` custom |
| **react-router-dom** | 7 | Routage SPA (BrowserRouter, Routes, Navigate) |
| **three.js** | 0.183 | Globe 3D WebGL sur la page d'accueil (Earth3D) |
| **qrcode.react** | 4.2 | Génération de QR codes pour les billets |
| **jsqr** | 1.4 | Lecture de QR codes via caméra (ScannerPage) |
| **react-easy-crop** | 5.5 | Recadrage d'avatars et d'affiches d'événements |
| **libphonenumber-js** | 1.13 | Validation internationale des numéros de téléphone |
| **clsx + tailwind-merge** | — | Composition conditionnelle de classes CSS |

### Backend / Serverless (Vercel Functions — dossier `/api`)
| Service | Usage |
|:---|:---|
| **Firebase Auth** | Inscription/connexion Email, Google, Apple. Source de vérité pour identité. |
| **Firestore** | Base de données NoSQL temps réel. ~25 collections. |
| **Firebase Storage** | Stockage des documents d'onboarding, avatars, images messages. |
| **Firebase Admin SDK** | Utilisé côté serveur dans `/api` pour bypasser les règles clients. Credentials via service account. |
| **Firebase Cloud Messaging (FCM)** | Notifications push web (service worker + clé VAPID). |
| **Stripe** | Encaissement billets (Checkout Sessions), boosts, abonnements prestataires (Billing). |
| **FedaPay** | Mobile Money pour Afrique de l'Ouest (Togo, Bénin). |
| **Resend** | Emails transactionnels (confirmation, corrections, refus, reset mot de passe). |
| **Vercel Cron** | Tâche quotidienne à 8h00 UTC pour relances abonnements (`/api/cron-subscriptions`). |

### DevDependencies
| Technologie | Usage |
|:---|:---|
| **@vitejs/plugin-react** | Plugin Vite pour le support JSX/React avec Fast Refresh |
| **autoprefixer** | Préfixes CSS automatiques (PostCSS) |
| **postcss** | Processeur CSS (requis par Tailwind) |

---

## 3. Arborescence complète des fichiers

```
liveinblack/
│
├── api/                           # Fonctions Serverless Vercel (Node.js ESM)
│   ├── admin-accounts.js          # Gestion admin des comptes utilisateurs
│   ├── admin-delete-account.js    # Suppression RGPD complète d'un compte
│   ├── checkout.js                # Création session Stripe pour achat de billet
│   ├── checkout-boost.js          # Création session Stripe pour achat boost Top 3
│   ├── connect.js                 # Stripe Connect (onboarding vendeur, compte Stripe Express)
│   ├── create-subscription.js     # Création abonnement Stripe Billing (prestataires)
│   ├── cron-subscriptions.js      # Cron Vercel quotidien : relances abonnements expirés
│   ├── event-stock.js             # Gestion du stock de places côté serveur
│   ├── fedapay.js                 # Endpoint FedaPay (initiation + webhook Mobile Money)
│   ├── provider-billing-region.js # Facturation prestataire par région
│   ├── provider-reviews.js        # Gestion des avis prestataires
│   ├── search.js                  # API de recherche globale (Firestore full-text)
│   ├── send-email.js              # Envoi d'emails transactionnels via Resend
│   ├── send-password-reset.js     # Email de réinitialisation de mot de passe
│   ├── stripe-webhook.js          # Webhook principal Stripe (869 lignes) — voir §10
│   └── tickets.js                 # Opérations sur les billets (check-in, attribution sièges)
│
├── lib/                           # Librairies partagées (serveur + scripts)
│   ├── adminGuard.js              # Guard : vérifie que le token JWT est un agent
│   ├── boosts.js                  # Logique boost (plans, slots, ids)
│   ├── eventRefunds.js            # Remboursements Stripe automatiques (event annulé/supprimé)
│   ├── fedapay.js                 # Client FedaPay (init, check config)
│   ├── fees.js                    # Centralise tous les taux (5% + 0,49€, 10% commission)
│   ├── firebaseAdmin.js           # Singleton Firebase Admin (getDb())
│   ├── promos.js                  # Codes promotionnels (registre utilisations)
│   └── providerBilling.js         # Stripe pour facturation prestataire
│
├── public/                        # Fichiers statiques servis en direct par Vite
│   └── firebase-messaging-sw.js   # Service Worker FCM — notifications push en arrière-plan
│
├── scripts/                       # Scripts de maintenance et de migration (Node.js)
│   ├── fix-video-faststart.mjs    # Optimisation MP4 (moov atom)
│   ├── migrate-user-private.mjs   # Migration PII vers user_private/{uid}
│   ├── purge-orphan-tickets.mjs   # Nettoyage billets orphelins
│   ├── reset-demo-events.mjs      # Reset événements de démo en Firestore
│   ├── seed-demo-event.mjs        # Génère un événement de démo
│   └── ticket-seatversion.test.mjs # Tests unitaires tokens billets (node --test)
│
├── src/                           # Code source React (frontend)
│   ├── App.jsx                    # Routeur principal + guards + contextes globaux
│   ├── main.jsx                   # Bootstrap React (ReactDOM.createRoot)
│   ├── firebase.js                # Initialisation Firebase (auth, db, storage, app)
│   ├── index.css                  # Tailwind + ~600 lignes CSS custom (variables, animations)
│   │
│   ├── context/
│   │   └── AuthContext.js         # createContext + hook useAuth() → { user, setUser, openAuthModal }
│   │
│   ├── data/
│   │   ├── events.js              # Tableau statique d'événements de démo (remplacé par Firestore)
│   │   ├── legal.js               # Données légales centralisées (SIRET, adresse, etc.)
│   │   └── regions.js             # Régions disponibles avec lat/lon pour le globe 3D
│   │
│   ├── lib/
│   │   └── utils.js               # Utilitaire cn() (clsx + tailwind-merge)
│   │
│   ├── components/                # Composants UI réutilisables (voir §7)
│   │   ├── Layout.jsx             # Sidebar desktop, header mobile, bottom nav — composant central
│   │   ├── SideMenu.jsx           # Tiroir hamburger (profil, nav, switch rôles)
│   │   ├── AuthModal.jsx          # Modale de connexion globale (z-index 9000)
│   │   ├── AgeVerificationModal.jsx
│   │   ├── AuctionSystem.jsx      # Système d'enchères intégré aux events
│   │   ├── BoostModal.jsx         # Bottom-sheet achat de boost Top 3
│   │   ├── Earth3D.jsx            # Globe three.js sur la page d'accueil
│   │   ├── LiquidMetalBg.jsx      # Fond WebGL métal liquide (shader FBM)
│   │   ├── PlaylistSystem.jsx     # Playlist participative par événement
│   │   ├── RegionSelector.jsx     # Sélecteur de région (bottom-sheet)
│   │   ├── MusicPlayer.jsx        # Lecteur de musique flottant
│   │   ├── PreferencesEditor.jsx  # Éditeur de goûts musicaux (recommandations)
│   │   ├── PromoCodesPanel.jsx    # Gestion des codes promo (organisateur)
│   │   ├── EventStaffModal.jsx    # Gestion de l'équipe d'un événement
│   │   ├── PayoutPanel.jsx        # Panneau de reversement vendeur
│   │   ├── MomoPayoutManager.jsx  # Gestion des reversements Mobile Money
│   │   ├── ProviderReviews.jsx    # Affichage des avis prestataires
│   │   ├── CookieConsent.jsx      # Bandeau CNIL-friendly
│   │   ├── IntroOverlay.jsx       # Splash animé du logo au premier chargement
│   │   └── icons.jsx              # Bibliothèque SVG maison (style Lucide)
│   │
│   ├── pages/                     # Pages applicatives (37 fichiers — voir §6)
│   │
│   └── utils/                     # Logique métier (voir §8)
│       ├── firestore-sync.js      # ★ Moteur de synchronisation — fichier le plus critique
│       ├── messaging.js           # Chat, groupes, amis, présence, sondages
│       ├── accounts.js            # Gestion des rôles et comptes utilisateurs
│       ├── applications.js        # Dossiers de candidature organisateur/prestataire
│       ├── ticket.js              # Tokens billets, boosts, conflits horaires
│       ├── services.js            # Catalogue prestataire, commandes
│       ├── permissions.js         # Helpers UI : canBook(), canCreateEvent(), etc.
│       ├── notifications.js       # Notifications in-app (max 50/user)
│       ├── accountDeletion.js     # Flux RGPD de suppression de compte
│       ├── recommendations.js     # Moteur de recommandations d'événements
│       ├── organizers.js          # Profils organisateurs, abonnés, notifications ventes
│       ├── reviews.js             # Avis prestataires
│       ├── eventStats.js          # Statistiques d'un événement (ventes, démographie)
│       ├── eventOrders.js         # Commandes sur place (POS) — précommandes et sur-place
│       ├── guestlist.js           # Gestion de la liste d'invités
│       ├── storyImage.js          # Traitement images (compression, upload Firebase Storage)
│       ├── stripe.js              # Façade frontend Stripe (startStripeCheckout, etc.)
│       └── cropImage.js           # Recadrage blob (react-easy-crop)
│
├── firestore.rules                # Règles de sécurité Firestore (43 000 octets)
├── storage.rules                  # Règles de sécurité Firebase Storage
├── firebase.json                  # Configuration Firebase (hosting, emulators)
├── tailwind.config.js             # Configuration Tailwind CSS + thème custom
├── vite.config.js                 # Configuration Vite (alias @ → src/)
├── vercel.json                    # Routage Vercel + cron schedule
├── package.json                   # Dépendances et scripts npm
├── .env.example                   # Modèle des variables d'environnement
├── .gitignore                     # Exclut node_modules, .env.local, dist
├── README.md                      # Ce document
├── ONBOARDING.md                  # Guide technique complet pour développeurs
├── DEPLOY.md                      # Checklist de déploiement post-session
├── LANCEMENT.md                   # Checklist de mise en production commerciale
└── AGENTS.md                      # Instructions pour les assistants IA
```

---

## 4. Architecture clé : le Write-Through Cache

C'est **le concept central** à maîtriser. Toute l'app repose dessus.

```
┌──────────────────────────────────────────────────────────────────┐
│  Action utilisateur (envoi message, achat, création event, etc.) │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
                ┌──────────────────────────┐
                │  1. Écriture localStorage │  ← Synchrone, instantané
                │  (préfixe lib_*)          │     L'UI se met à jour immédiatement
                └──────────────┬───────────┘
                               │  fire-and-forget
                               ▼
                ┌──────────────────────────┐
                │  2. syncDoc() vers        │  ← Asynchrone, en arrière-plan
                │  Firestore                │     Persistance cross-device
                └──────────────────────────┘

Au LOGIN (syncOnLogin) :
  Firestore ──────────────────────► localStorage
  (17 sources simultanées)          (merge intelligent par id)

Au FOCUS d'onglet (syncOnLogin light, throttle 5 min) :
  Firestore ──────────────────────► localStorage
  (seulement les données perso)     (rattrape les changements cross-device)
```

### Règle absolue — imports dynamiques

```js
// ✅ CORRECT — ne bloque pas le first paint
import('../utils/firestore-sync').then(({ syncDoc }) => { syncDoc(...) })

// ❌ INTERDIT — casse le chargement
import { syncDoc } from '../utils/firestore-sync'
```

### Clés localStorage utilisées

Toutes préfixées `lib_` :

| Clé | Contenu |
|:---|:---|
| `lib_user` | Session utilisateur courante (profil complet) |
| `lib_users` | Cache de tous les utilisateurs connus (pour la messagerie) |
| `lib_registered_users` | Comptes locaux (pour le mode démo `USE_REAL_FIREBASE=false`) |
| `lib_bookings` | Billets achetés par l'utilisateur |
| `lib_created_events` | Événements créés par l'organisateur |
| `lib_conversations` | Toutes les conversations (DM + groupes) |
| `lib_messages` | Messages de toutes les conversations (`{convId: msg[]}`) |
| `lib_friends` | Relations d'amitié (`{uid: uid[]}`) |
| `lib_friend_requests` | Demandes d'amis en attente |
| `lib_blocked` | Utilisateurs bloqués (`{uid: uid[]}`) |
| `lib_boosts` | Boosts actifs de l'organisateur courant |
| `lib_used_tickets` | Codes de billets scannés (scanner QR) |
| `lib_applications` | Dossiers de candidature |
| `lib_pending_validations` | File d'attente admin (legacy) |
| `lib_role_requests` | Demandes de rôle supplémentaire |
| `lib_event_interests_{uid}` | Événements marqués "Intéressé" |
| `lib_unlocked_events` | Événements privés débloqués via code d'accès |
| `lib_online` | Statuts de présence (`{uid: timestamp}`) |
| `lib_typing` | Indicateurs de frappe en cours |
| `lib_last_read` | Timestamps de dernière lecture par conversation |
| `lib_hidden_conversations` | Conversations masquées par l'utilisateur |
| `lib_muted_convs` | Conversations mises en sourdine (avec échéance) |
| `lib_pinned_convs` | Conversations épinglées |
| `lib_starred` | Messages favoris |
| `lib_new_contacts` | Nouveaux amis (badge "Nouveau") |
| `lib_provider_profiles` | Profils prestataires |
| `lib_catalog_{uid}` | Catalogue d'offres d'un prestataire |
| `lib_service_orders` | Commandes de services |
| `lib_group_bookings` | Réservations de groupe |
| `lib_notifications` | Notifications in-app |
| `lib_region` | Région sélectionnée par l'utilisateur |
| `lib_cookie_consent` | Consentement cookies (TTL 6 mois) |
| `lib_photo_cache` | Cache des photos de profil (messagerie) |
| `lib_bids` | Enchères (mode démo, pas de paiement réel) |
| `lib_pending_booking_{id}` | Booking en cours de paiement (nettoyé après `/paiement-reussi`) |
| `lib_pending_boost_{id}` | Boost en cours de paiement |
| `lib_playlist_songs_{eventId}` | Playlist collaborative d'un événement |

---

## 5. Authentification, Rôles et Guards

### Configuration Firebase (`src/firebase.js`)

```js
export const USE_REAL_FIREBASE = true  // false = mode démo local sans backend
export const app    // Firebase App
export const auth   // Firebase Auth
export const db     // Firestore (avec ignoreUndefinedProperties: true)
export const storage // Firebase Storage
```

> Les clés Firebase Web sont **hardcodées** dans `src/firebase.js` — c'est volontaire. Les clés Firebase Web ne sont pas des secrets ; la sécurité repose sur les Firestore Rules. Le Service Worker `public/firebase-messaging-sw.js` les répète également.

### Guards de routes (`App.jsx`)

| Guard | Comportement |
|:---|:---|
| `RequireAuth` | Redirige vers `/connexion?next=<path>` si non connecté |
| `RequireRole(role)` | Redirige vers `/accueil` si `user.role !== role` |
| `RequireOrganisateur` | Autorise `organisateur` ET `agent` |
| `RequireServiceAccess` | Autorise `prestataire` uniquement (sinon → `/prestataires`) |
| `OnboardingGuard` | Redirige selon `user.status` : `draft` → formulaire, `pending` → `/mon-dossier` |
| `ConnexionRoute` | Si déjà connecté et pas de `?mode=`, redirige vers `/accueil` |

### Listener temps réel sur le rôle

Dans `App.jsx`, un `onSnapshot` écoute `users/{uid}`. Si le rôle ou le statut change dans Firestore (ex : admin approuve un dossier), la session locale est mise à jour **sans rechargement de page**.

### Système multi-comptes

Un même email peut avoir plusieurs comptes avec des rôles différents. Au login, si plusieurs comptes sont trouvés, un sélecteur de rôle s'affiche. La clé `enabledRoles: string[]` liste les interfaces débloquées, `role`/`activeRole` indique l'interface active.

---

## 6. Toutes les Pages (Routes)

### Pages publiques (accessibles sans compte)

| Route | Fichier | Description |
|:---|:---|:---|
| `/accueil` | `HomePage.jsx` (80 Ko) | Globe 3D, Top 3 régional temps réel, sections marketing, détection région navigateur |
| `/evenements` | `EventsPage.jsx` (45 Ko) | Liste filtrable (région, date, prix), mode partage (`?shareWith=convId`), codes d'accès événements privés |
| `/evenements/:id` | `EventDetailPage.jsx` (158 Ko) | **Cœur business.** Achat billet, précommandes, places de table, playlist, enchères, réservation de groupe, partage |
| `/prestataires` | `PublicPrestataires.jsx` (17 Ko) | Annuaire public des prestataires (filtré par type/région) |
| `/prestataires/:providerId` | `PublicPrestatairePage.jsx` (32 Ko) | Fiche publique d'un prestataire (catalogue, avis, contact) |
| `/organisateurs` | `PublicOrganizers.jsx` (13 Ko) | Annuaire public des organisateurs |
| `/organisateurs/:slug` | `PublicOrganizerPage.jsx` (22 Ko) | Page publique d'un organisateur (événements, abonnés, profil) |
| `/recherche` | `GlobalSearchPage.jsx` (12 Ko) | Recherche globale (événements, prestataires, organisateurs) |
| `/c-est-quoi` | `PublicAbout.jsx` (17 Ko) | Page "À propos" / landing vitrine du projet |
| `/connexion` | `LoginPage.jsx` (71 Ko) | Connexion/inscription Email, Google, Apple, reset MDP, vérification email |
| `/ticket/:token` | `TicketPage.jsx` (12 Ko) | Affichage d'un billet (QR code, détails, précommandes) — page autonome sans Layout |
| `/paiement-reussi` | `PaiementReussiPage.jsx` | Retour Stripe après paiement — vérifie la session, génère les billets, points fidélité |
| `/paiement-annule` | `PaiementAnnulePage.jsx` | Retour Stripe après annulation |
| `/boost-active` | `BoostActivePage.jsx` | Retour Stripe après paiement boost — active le Top 3 |
| `/cgu` | `CGUPage.jsx` | Conditions Générales d'Utilisation/Vente |
| `/mentions-legales` | `MentionsLegalesPage.jsx` | Mentions légales RGPD |
| `/confidentialite` | `PolitiqueConfidentialitePage.jsx` | Politique de confidentialité |
| `/cookies` | `PolitiqueCookiesPage.jsx` | Politique cookies |

### Pages protégées (connexion requise)

| Route | Rôle requis | Fichier | Description |
|:---|:---|:---|:---|
| `/profil` | Tout connecté | `ProfilePage.jsx` (193 Ko) | Avatar (crop), billets, changement nom (1×/30j), MDP/email, génération PDF d'accréditation |
| `/profil/organisateurs-suivis` | Tout connecté | `FollowedOrganizersPage.jsx` | Liste des organisateurs suivis |
| `/profil/evenements-interesses` | Tout connecté | `InterestedEventsPage.jsx` | Événements marqués "Intéressé" |
| `/messagerie` | Tout connecté | `MessagingPage.jsx` (234 Ko) | Chat DM + groupes, photos, vocaux, sondages, réservations de groupe |
| `/scanner` | Tout connecté (filtré par `canScanTickets`) | `ScannerPage.jsx` (97 Ko) | Scanner QR caméra — validation billets et commandes sur place |
| `/mes-soirees` | Tout connecté | `MesSoireesPage.jsx` | Historique des soirées fréquentées |
| `/commander/:eventId/:ticketCode` | Tout connecté | `OnSiteOrderPage.jsx` | Commandes sur place (POS bar/conso) depuis son billet |
| `/mes-evenements` | `organisateur` ou `agent` | `MesEvenementsPage.jsx` (245 Ko) | Création/édition multi-étapes d'événements, stats de ventes, guestlist, boosts |
| `/mes-evenements/:id/statistiques` | `organisateur` ou `agent` | `EventStatsPage.jsx` (34 Ko) | Dashboard statistiques d'un événement (ventes, démographie, graphiques) |
| `/ma-page-organisateur` | `organisateur` | `OrganizerPublicStudio.jsx` (27 Ko) | Éditeur de la page publique de l'organisateur (bio, photos, slug) |
| `/proposer` | `prestataire` | `ProposerServicesPage.jsx` (52 Ko) | Dashboard prestataire (catalogue, commandes, profil) |
| `/mon-abonnement` | `prestataire` | `MonAbonnementPage.jsx` | Gestion de l'abonnement Stripe (plans, état, facturation) |
| `/inscription-organisateur` | Public | `OnboardingOrganisateur.jsx` (66 Ko) | Formulaire multi-étapes candidature organisateur (auto-save) |
| `/inscription-prestataire` | Public | `OnboardingPrestataire.jsx` (91 Ko) | Formulaire multi-étapes candidature prestataire (variantes par type) |
| `/mon-dossier` | Tout connecté | `MonDossierPage.jsx` (51 Ko) | Timeline, statut dossier, upload docs corrections, demande suppression RGPD |
| `/agent` | `agent` uniquement | `AgentPage.jsx` (255 Ko) | Dashboard admin complet (10 onglets : Dashboard, Validations, Dossiers, Utilisateurs, Events, Commandes, Boosts, Signalements, Reversements, Outils) |
| `/agent/organisateurs` | `agent` uniquement | `OrganizerAdminPage.jsx` | Gestion des pages organisateurs depuis l'admin |

---

## 7. Tous les Composants UI

### `Layout.jsx` (52 Ko) — Composant central de l'application

Le Layout est le squelette visuel de toute l'application. Il orchestre :
- **Sidebar desktop** : pill flottante fixe sur la gauche avec icônes de navigation.
- **Header mobile** : rétractable au scroll (seuil 80px, delta 6px), avec logo, cloche notifications et hamburger.
- **Bottom nav mobile** : `position: fixed` (jamais `sticky`) avec `pointerEvents: none` sur le `<nav>` et `pointerEvents: all` sur la pill interne. **À ne JAMAIS changer.**
- **Polling** : messages non lus (3s), notifications (5s), `pendingCount` agent (5s).

Props :
```jsx
<Layout>           // Rendu normal
<Layout hideNav>   // Cache la bottom nav mobile (ex: pages de paiement)
<Layout chatMode>  // Plein écran chat, cache header et bottom nav
```

> `handleProtectedNav(path)` dans Layout ouvre l'AuthModal si un visiteur clique sur une route protégée.

### `SideMenu.jsx` (30 Ko)
Tiroir hamburger gauche : profil, avatar, liens nav, switcher de rôles multi-comptes, cartes "Devenir organisateur/prestataire", raccourci Admin, logout. Sous-composant `RoleRequestCard` avec états `active | pending | rejected | none`.

### `AuthModal.jsx` (14 Ko)
Modale globale montée **une seule fois** dans `App.jsx`. z-index 9000. Deux chemins : Firebase Auth réel ou mode local démo. Multi-comptes par email → sélecteur de rôle.

### `Earth3D.jsx` (7 Ko)
Globe 3D `three.js` sur la HomePage. S'oriente vers la lat/lon de la région sélectionnée (données depuis `data/regions.js`). Auto-rotation 0.0006 rad/frame, slerp vers cible, recule après 4.5s d'inactivité.
> ⚠️ Les textures sont chargées depuis un CDN externe (`unpkg.com`) — point de défaillance.

### `LiquidMetalBg.jsx` (5 Ko)
Canvas WebGL `position: fixed`, `zIndex: 0`, `pointerEvents: none`. Shader FBM 8 itérations, env-mapping irisé. Atténué à `*= 0.28` pour laisser le contenu lisible. Coûteux GPU sur mobile bas de gamme.

### `PlaylistSystem.jsx` (44 Ko)
Playlist participative par événement. Recherche via **API iTunes** (`https://itunes.apple.com/search`), pré-écoute 30s, 1 song proposée par billet, max 5 likes par user. Sync `event_playlists/{eventId}` Firestore.

### `AuctionSystem.jsx` (17 Ko)
Enchères pour places "auction-enabled". Compte à rebours 15 min, anti-sniping (+1 min si bid dans les 10 dernières min). **Mode démo uniquement — aucun paiement réel.**

### `BoostModal.jsx` (14 Ko)
Bottom-sheet achat boost Top 3 via Stripe. 3 positions × 4 paliers. Vérification disponibilité du slot avant achat.

### `MusicPlayer.jsx` (23 Ko)
Lecteur de musique ambient flottant. Masqué automatiquement sur les pages vitrine publiques.

### `PreferencesEditor.jsx` (25 Ko)
Éditeur de goûts musicaux et de types d'événements. Alimente le moteur de recommandations.

### `PromoCodesPanel.jsx` (12 Ko)
Panneau de gestion des codes promo pour les organisateurs (création, quotas, suivi des utilisations).

### `EventStaffModal.jsx` (24 Ko)
Gestion de l'équipe assignée à un événement (videurs, staff, DJ).

### `PayoutPanel.jsx` + `MomoPayoutManager.jsx`
Panneau de reversement des fonds aux vendeurs. Mobile Money pour l'Afrique.

### `ProviderReviews.jsx` (21 Ko)
Système d'avis prestataires (notation étoiles, texte, modération). Lu depuis Firestore.

### `CookieConsent.jsx`
Bandeau CNIL. Clé `lib_cookie_consent`, TTL 6 mois.

### `IntroOverlay.jsx` (6 Ko)
Splash animé logo plein écran au premier chargement de la session, puis transition vers la navbar.

### `icons.jsx` (7 Ko)
Bibliothèque SVG maison style Lucide. Export : `IconBell`, `IconCalendar`, `IconBolt`, `IconCrown`, `IconTicket`, `IconChat`, `IconUsers`, `IconCheck`, `IconAlert`, `IconLock`, `IconMail`, `IconIdBadge`, `IconEdit`, `IconTrash`, `IconHourglass`, `IconPin`, `IconSettings`, `IconTent`, `IconMic`.

---

## 8. Couche Utils — Logique Métier

### `firestore-sync.js` (1067 lignes) — ★ Le fichier le plus critique

Exporte tous les helpers de synchronisation :

| Fonction | Description |
|:---|:---|
| `syncDoc(path, data)` | Écriture merge fire-and-forget |
| `syncDocAwaitable(path, data)` | Idem mais attend le résultat (retourne `{ok, error}`) |
| `syncDocOverwrite(path, data)` | Écrase entièrement le doc (pas de merge) |
| `syncDocField(path, field, value)` | Mise à jour d'un seul champ imbriqué |
| `syncDeleteField(path, fieldPath)` | Supprime un champ imbriqué (utilise `deleteField()` sentinel) |
| `syncDelete(path)` | Suppression d'un document |
| `syncIncrement(path, field, amount)` | Incrément atomique (FieldValue.increment) |
| `loadDoc(path)` | Lecture async ponctuelle (retourne null si absent) |
| `loadCollection(collPath, conditions)` | Requête async d'une collection |
| `loadCollectionStrict(...)` | Idem mais distingue "vide" de "erreur" |
| `mergeItemsById(path, options)` | Transaction Firestore — merge concurrent-safe d'un tableau d'items |
| `syncMyBookings(uid, localItems)` | Écriture sécurisée du carnet `user_bookings/{uid}` (préserve les sièges de table côté serveur) |
| `purgeGhostBookings(uid, validEventIds)` | Supprime les billets d'événements supprimés |
| `syncUserProfile(uid, userData)` | Push explicite du profil public + email vers `user_private/{uid}` |
| `saveOrganizerProfileWithSlug(profile)` | Transaction atomique slug organisateur (unicité garantie) |
| `pushLocalToFirestore(uid)` | Synchronisation inverse depuis un device existant |
| `syncOnLogin(uid, opts)` | Master sync : 17+ sources Firestore → localStorage. `opts.light` pour le sync de focus d'onglet. |
| `listenEvents(callback)` | Temps réel sur la collection `events` |
| `listenUserEvents(uid, callback)` | Temps réel sur `user_events/{uid}` |
| `listenBoosts(callback)` | Temps réel sur la collection globale `boosts` |
| `listenCatalogs(callback)` | Temps réel sur tous les catalogues prestataires |
| `listenProviders(callback)` | Temps réel sur tous les profils prestataires |
| `listenDoc(path, callback)` | Temps réel sur un document unique |
| `listenFriendRequests(toId, callback)` | Demandes d'amis entrantes |
| `listenDirectConversations(uid, callback)` | Conversations DM |
| `listenGroupConversations(uid, callback)` | Conversations de groupe |
| `listenConvMessages(convId, callback)` | Messages d'une conversation |
| `listenUserPresence(userId, callback)` | Statut en ligne d'un utilisateur |
| `listenUserSocial(uid, callback)` | Données sociales (amis, bloqués) |
| `listenTicketsForEvent(eventId, callback)` | Billets temps réel d'un événement (stats organisateur) |
| `listenOrganizerProfile(uid, callback)` | Profil organisateur en temps réel |
| `listenOrganizerProfiles(callback)` | Tous les profils publics organisateurs |
| `adjustPlaylistLike(eventId, songId, delta)` | Like/unlike transactionnel d'une chanson |
| `loadTicketsForEvents(eventIds)` | Charge tous les billets d'une liste d'events |
| `loadUsersByIds(uids)` | Charge des profils users par lots de 10 |

### `messaging.js` (1174 lignes)

Messagerie complète. Points clés :

- **Types de messages** : `text | image | voice | story | poll | event | event_poll | catalog_item | group_booking | system`
- **`voteOnPoll`** gère à la fois `type === 'poll'` ET `type === 'event_poll'` — **ne pas séparer**.
- **`syncMessagesToFirestore`** strippe les `data:` base64 avant l'envoi Firestore (limite 1 Mo/doc). Les images/vocaux restent en localStorage avec un placeholder `[image]`/`[voice]`.
- **Présence** : heartbeat 60s (`setOnline`), `setOffline` sur `visibilitychange` et `beforeunload`, `isOnline` vérifie d'abord local (90s) puis Firestore (5 min).
- **Confidentialité** : `getMyPrivacy()` → `showOnline`, `showPhoto`, `showInfo`, `readReceipts`. Chaque feature le respecte.
- **Sourdine groupe** : durée configurable, `untilAtMs` en ms (compatible Firestore Timestamp et localStorage string ISO). Un admin ne peut pas sourdiner un autre admin.

### `accounts.js` (520 lignes)

Gestion des rôles et comptes. Points clés :

- `GRANTABLE_ROLES = ['organisateur', 'prestataire']` — la sécurité empêche d'auto-promouvoir 'agent' via une demande forgée.
- `approveValidation` et `approveRoleRequest` écrivent **Firestore EN PREMIER**, puis localStorage. Si l'écriture Firestore échoue, le local n'est jamais modifié — l'admin voit l'erreur, le rôle n'est pas accordé à tort.
- `getTotalPendingCount()` : décompte les candidatures + demandes de rôle + validations legacy (évite les doublons via `Set`).

### `applications.js` (510 lignes)

Cycle de vie des dossiers de candidature :

Statuts : `draft → submitted → under_review → needs_changes → resubmitted → approved → rejected | suspended`

- `getRequiredDocs(type, prestataireType)` : liste des pièces justificatives selon le profil.
- `uploadDocument(appId, docKey, file)` → Firebase Storage (`applications/{appId}/{docKey}/{ts}_{filename}`). Limite 15 Mo, timeout 30s.
- `updateApplicationStatus` : sur `approved`, copie les permissions dans le profil user (`canSellAlcohol`, `prestataireType`, `displayName` pour artistes).

### `ticket.js` (194 lignes)

- `generateTicketToken(booking)` : encode le payload en base64url + signature hash (xorshift). Inclut `seatVersion` (anti-revente screenshot) et `entryNonce` (secret serveur aléatoire pour sièges réattribués).
- `verifyTicketToken(token)` : décode et vérifie la signature.
- ⚠️ Le `SECRET` est dans le bundle JS. La vraie défense est le registre Firestore `tickets/{code}` avec `paid: true` écrit uniquement par le webhook Admin SDK.
- `checkScheduleConflict` : détecte les chevauchements horaires (gère minuit traversé).

### `services.js` (145 lignes)

- `COMMISSION_RATE = 0.10` (10%) — taux de commission sur les commandes de services.
- Statuts commandes : `pending | confirmed | ready | done | cancelled`.
- `placeOrder` calcule `subtotal`, `commission` et `sellerReceives`.

### `recommendations.js` (18 Ko)

Moteur de recommandations basé sur les préférences musicales, types d'événements et historique de l'utilisateur. Alimenté par `PreferencesEditor`.

### `organizers.js` (16 Ko)

- Profils organisateurs publics (CRUD, slug).
- `startOrganizerNotificationBridge(uid)` : écoute les nouvelles ventes en Firestore et crée des notifications in-app pour l'organisateur.
- Gestion des abonnés (follow/unfollow).

### `eventOrders.js` (31 Ko)

POS (Point of Sale) pour les commandes sur place. Utilise `mergeItemsById` (transaction Firestore) pour éviter les conflits multi-appareils (plusieurs serveurs sur la même table).

### `eventStats.js` (19 Ko)

Dashboard statistiques : chiffre d'affaires, démographie (âge, genre), heure de pic des ventes, taux de scan.

---

## 9. API Serverless Vercel (`/api`)

Chaque fichier dans `/api/` est une Vercel Serverless Function (Node.js ESM).

| Endpoint | Méthode | Description |
|:---|:---|:---|
| `POST /api/checkout` | POST | Crée une session Stripe Checkout pour achat de billet. Réserve le stock (`event-stock`), calcule les frais (5% + 0,49€ plafonnés à 2,50€), génère un `bookingId`. Retourne l'URL de paiement. |
| `POST /api/checkout-boost` | POST | Crée une session Stripe pour un boost Top 3. Réserve le slot dans `boost_slots/{slotId}` avant le paiement. |
| `POST /api/stripe-webhook` | POST | **Le plus critique (869 lignes).** Traite : `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.*`, `account.updated`. Finalise billets/boosts via Admin SDK. Idempotent (verrou `fulfillStartedAt`, flag `settled`). Gère : anti-duplication, remboursement auto (event annulé/supprimé), crédit vendeur (ledger), notification organisateur. |
| `POST /api/tickets` | POST | Opérations sur les billets : `checkin` (scan, marque `used`, crédite 1 point fidélité), `assign` (attribution d'un siège de table), `revoke` (révocation avec incrémentation `seatVersion`), `transfer`. |
| `POST /api/fedapay` | POST | Initiation paiement Mobile Money FedaPay + gestion du webhook (approbation, mise à jour statut). Même logique de finalisation que `stripe-webhook`. |
| `GET /api/search` | GET | Recherche dans Firestore sur `events`, `providers`, `organizer_profiles`. |
| `POST /api/send-email` | POST | Envoi d'email transactionnel via Resend (confirmation, correction dossier, refus). Sécurisé par Firebase Admin SDK (vérifie le token JWT). |
| `POST /api/send-password-reset` | POST | Email de réinitialisation de mot de passe. |
| `POST /api/connect` | POST | Stripe Connect Express — initiation de l'onboarding vendeur. |
| `POST /api/create-subscription` | POST | Création d'un abonnement Stripe Billing pour prestataire. |
| `GET /api/cron-subscriptions` | GET | Tâche cron quotidienne. Vérifie les abonnements expirés et envoie des emails de relance (Resend). Sécurisé par `CRON_SECRET`. |
| `POST /api/event-stock` | POST | Gestion transactionnelle du stock de places (décrémentation, restock). |
| `GET/POST /api/provider-reviews` | GET/POST | Avis prestataires (lecture + création). |
| `POST /api/provider-billing-region` | POST | Facturation par région pour les prestataires. |
| `POST /api/admin-accounts` | POST | Opérations admin sur les comptes (sécurisé Agent). |
| `POST /api/admin-delete-account` | POST | Suppression RGPD complète d'un compte (anonymisation transactionnelle). |

---

## 10. Paiements — Flux Stripe & FedaPay

### Flux d'achat billet (Stripe)

```
1. EventDetailPage     →  "Réserver" → écrit lib_pending_booking_{id} en local
                       →  appelle /api/checkout (POST)
2. /api/checkout       →  réserve le stock (event-stock), calcule les frais
                       →  crée Stripe Checkout Session
                       →  retourne { url: "https://checkout.stripe.com/..." }
3. Navigateur          →  redirige vers Stripe Checkout
4. Paiement            →  2 chemins parallèles et indépendants :

   Chemin CLIENT :     →  Stripe redirige vers /paiement-reussi?session_id=...
                       →  PaiementReussiPage appelle /api/verify-session
                       →  Génère les billets localement, écrit user_bookings, points fidélité
                       →  Écrit tickets/{code} avec source: 'client-postpay'

   Chemin WEBHOOK :    →  Stripe envoie POST /api/stripe-webhook
                       →  Vérifie signature (STRIPE_WEBHOOK_SECRET)
                       →  Si billets client déjà créés → les adopte et confirme (paid: true)
                       →  Sinon → mint les billets (client a fermé l'onglet)
                       →  Crédite le vendeur (ledger ou Stripe Connect)
                       →  Notifie l'organisateur
                       →  Pose paid: true (marqueur d'idempotence)
```

### Flux d'achat boost (Stripe)

```
1. BoostModal          →  vérifie disponibilité slot
                       →  /api/checkout-boost → réserve boost_slots/{slotId} (hold)
2. Stripe Checkout     →  paiement
3. /boost-active       →  vérification session
4. stripe-webhook      →  active le boost dans boosts/{id} (transaction atomique)
                       →  si slot perdu → remboursement automatique Stripe
```

### Abonnements prestataires (Stripe Billing)

- Plans dans `/api/create-subscription`.
- Webhook écoute `customer.subscription.created/updated/deleted`.
- Statut écrit dans `users/{uid}.prestataireSubActive` et `providers/{uid}.subscriptionActive`.

### FedaPay (Mobile Money Afrique)

- Même structure que Stripe mais adapté aux API FedaPay.
- Webhook écoute `transaction.approved`, `transaction.updated`, `transaction.canceled`.
- Configuré pour Sandbox (test) et Live (production).

---

## 11. Firestore — Collections & Structure des données

| Collection | Description | Accès |
|:---|:---|:---|
| `users/{uid}` | Profils publics : nom, avatar, username, rôle, statut, points, isOnline, fcmToken | Lecture tout connecté, écriture propriétaire ou agent |
| `user_private/{uid}` | PII : email (séparé de `users/` depuis la migration RGPD) | Lecture propriétaire ou agent |
| `events/{id}` | Événements publiés | **Lecture publique**, écriture organisateur/agent |
| `user_events/{uid}` | `{items: Event[]}` — events créés (mirror organisateur) | Propriétaire |
| `user_bookings/{uid}` | `{items: Booking[]}` — billets achetés | Propriétaire |
| `tickets/{ticketCode}` | Registre anti-fraude (un doc par billet). `paid: true` écrit uniquement par Admin SDK. | Lecture agent/organisateur, écriture Admin uniquement |
| `bookings/{bookingId}` | Doc de booking final (créé par webhook). Source de vérité paiement. | Agent |
| `boosts/{boostId}` | Boosts Top 3 actifs (source de vérité globale, tous visiteurs) | Lecture publique |
| `boost_slots/{slotId}` | Réservation atomique d'un slot boost | Serveur |
| `user_boosts/{uid}` | `{items: Boost[]}` — mirror des boosts d'un utilisateur | Propriétaire |
| `conversations/{id}` | DM (`participants[]`) et groupes (`participantIds[]`, `memberMutes`) | Tout connecté |
| `conv_messages/{id}` | `{items: Message[]}` par conversation | Tout connecté |
| `conv_photos/{id}` | Photos lourdes (fallback si conv_messages dépasse 1Mo) | Tout connecté |
| `user_read_status/{uid}` | `{convId: timestamp}` — timestamps de lecture | Propriétaire |
| `user_social/{uid}` | Amis, bloqués, conversations cachées/sourdines/épinglées, favoris | Propriétaire |
| `friend_requests/{id}` | Demandes d'amis en attente | Connecté |
| `applications/{id}` | Dossiers organisateur/prestataire avec auditLog | Propriétaire + agent |
| `pending_validations/{id}` | File d'attente admin (legacy — `applications` prend le relais) | Agent |
| `providers/{uid}` | Profil prestataire | Lecture publique |
| `catalogs/{uid}` | `{items: CatalogItem[]}` — catalogue d'offres | Lecture tout connecté |
| `service_orders/{id}` | Commandes de services | Tout connecté (à durcir) |
| `organizer_profiles/{uid}` | Page publique d'un organisateur (bio, slug, photos) | Lecture publique |
| `organizer_slugs/{slug}` | Index d'unicité des slugs organisateurs | Serveur |
| `organizer_follows/{uid}` | `{items: uid[]}` — organisateurs suivis par l'utilisateur | Propriétaire |
| `event_playlists/{eventId}` | `{songs: Song[]}` — playlist collaborative | Lecture publique, écriture connecté |
| `group_bookings/{id}` | Réservations de groupe | Tout connecté |
| `reports/{id}` | Signalements utilisateurs | Écriture connecté, lecture agent |
| `notifications/{uid}` | `{items: Notification[]}` — max 50 notifs in-app | Propriétaire |
| `seller_balances/{uid}` | Soldes vendeurs (ledger) | Agent + serveur |
| `used_tickets/{uid}` | `{items: string[]}` — codes de billets scannés | Agent/organisateur |
| `deletion_requests/{id}` | Demandes de suppression RGPD | Propriétaire + agent |
| `deleted_accounts/{uid}` | Tombstone post-suppression (bloque les écritures billing) | Serveur |
| `payment_alerts/{id}` | Alertes manuelles (paiement sans billet, remboursement échoué) | Agent + serveur |
| `stock_releases/{sessionId}` | Idempotence du restock de places (session expirée) | Serveur |
| `user_private_access/{uid}` | Codes d'accès événements privés débloqués | Propriétaire |

---

## 12. Règles de Sécurité Firestore & Storage

### `firestore.rules` (~43 000 octets)

Helpers principaux :
- `isSignedIn()` : `request.auth != null`
- `isAgent()` : lit `users/{uid}.role == 'agent'`
- `isOwner(uid)` : `request.auth.uid == uid`

Points critiques :
- `events/` : **read public** (visiteurs sans compte peuvent voir les événements).
- `tickets/` : `paid: true` ne peut être écrit que par le Admin SDK (service account). Les règles l'interdisent aux clients → anti-fraude billets.
- `conversations/`, `conv_messages/`, `service_orders/`, `group_bookings/` : read+write pour tout `signed-in` — **la sécurité est côté app, pas Firestore**. ⚠️ À durcir.

### `storage.rules`

| Chemin | Écriture | Lecture | Limite |
|:---|:---|:---|:---|
| `applications/{appId}/{path}` | Tout connecté | Tout connecté | 15 Mo |
| `avatars/{userId}/{path}` | Propriétaire | Publique | 5 Mo |
| `messages/{convId}/{path}` | Tout connecté | Publique | 25 Mo |

---

## 13. Design System & Identité Visuelle

### Variables CSS (`src/index.css`)

```css
--obsidian:       #05060a   /* Fond principal */
--obsidian-2:     #0b0b12
--obsidian-3:     #0e0e18
--violet:         #8444ff   /* Accent primaire (gradients) */
--violet-end:     #ff4da6
--gold:           #c8a96e   /* Accent secondaire (admin, logo BLACK) */
--gold-bright:    #e0c080
--teal:           #4ee8c8   /* Accent tertiaire */
--pink:           #ff4da6
```

> ⚠️ `CLAUDE.md` documente `--teal` comme accent principal. Dans le code réel, le violet/pink est l'accent primaire. **Incohérence à résoudre.**

### Polices

| Police | Usage |
|:---|:---|
| **Bebas Neue** | Logo `L|VE IN`, titres en majuscules |
| **Playfair Display Italic** | Logo `BLACK` |
| **Cormorant Garamond** | Pages de confirmation, billets (style luxe) |
| **DM Mono** | Labels nav, prix, badges, timestamps |
| **Inter** | Corps de texte |

### Classes Tailwind custom (`@layer components`)
`.glass`, `.glass-pill`, `.card-dark`, `.btn-gold`, `.btn-outline`, `.input-dark`, `.animate-crown`, `.animate-fade-in`, `.nebula-bg`, `.nebula-blob`

### Texture grain
`body::after` avec un SVG grain en `opacity: 0.035` + backdrop blur sur la sidebar.

---

## 14. Fonctionnalités Terminées

### ✅ Billetterie & QR

- Achat de billets (places normales, tables, places numérotées) via Stripe
- Précommandes de consommations intégrées au billet
- Génération de QR codes avec token signé (`seatVersion` + `entryNonce` anti-screenshot)
- Scanner mobile caméra (`jsqr`) pour valider l'entrée en temps réel
- Registre Firestore `tickets/{code}` avec `paid: true` uniquement écrit par le webhook (anti-fraude)
- Points de fidélité (+1 par billet au scan, pas à l'achat)

### ✅ Webhook Stripe (Double sécurité)

- Endpoint `/api/stripe-webhook` finalise les billets et boosts même si le client ferme l'onglet
- Idempotent (verrou 90s, flag `settled`, adoption des billets déjà créés par le client)
- Remboursement automatique si l'événement est annulé pendant le paiement
- Notification de vente à l'organisateur

### ✅ Messagerie Complète

- Chat DM et groupes avec membres, admins, sourdine temporaire
- Photos compressées (quality 0.78, max 900px), messages vocaux, sondages
- Réactions emoji, réponses citées, transfert de message, messages éphémères
- Indicateurs de frappe, statuts en ligne, accusés de lecture
- Partage d'événements et de fiches prestataires dans le chat

### ✅ Marketplace Prestataires

- 12 types de prestataires (artiste/DJ, salle, matériel, food, photo/vidéo, décoration, sécurité, transport, staff, communication, bien-être, autre)
- Catalogue d'offres avec prix, description, médias
- Commandes avec suivi de statut
- Abonnements Stripe pour les prestataires (Basic/Pro/Premium)
- Système d'avis clients

### ✅ Espace Organisateur

- Création d'événements multi-étapes (infos, places, menus, shows, codes d'accès)
- Dashboard statistiques temps réel (ventes, CA, démographie, taux de scan)
- Guestlist avec génération de tokens sécurisés
- Gestion de l'équipe (staff)
- Annulation d'événement avec remboursement automatique de tous les acheteurs
- Boosts Top 3 par région

### ✅ Espace Admin (Agent)

- Dashboard avec métriques globales (10 onglets)
- Validation dossiers (approve/corrections/refus) avec emails transactionnels
- Gestion complète des utilisateurs, événements, commandes
- Panneau de reversement vendeurs (ledger + Stripe Connect)
- Signalements utilisateurs
- Outils de maintenance (cleanup, reset)

### ✅ Légal & RGPD

- Mentions légales, CGU/CGV, Politique de confidentialité, Cookies
- Flux de suppression de compte (audit → demande → modération → anonymisation)
- Séparation PII (`user_private/{uid}`) — l'email n'est plus dans `users/`

---

## 15. Dette Technique & Ce qui Reste à Faire

### 🔴 Sécurité — Priorité Haute

1. **Signature des billets côté serveur** : Le `SECRET` est dans le bundle JS (`src/utils/ticket.js`). Un attaquant peut le lire et forger des billets. La vraie défense est le registre Firestore, mais idéalement la signature devrait venir d'un endpoint serveur avec une clé secrète uniquement côté Vercel.

2. **Durcissement des règles Firestore** : Les collections `conversations`, `conv_messages`, `service_orders`, `group_bookings` ont des règles trop permissives (`signed-in` peut tout lire/écrire). Il faut ajouter `request.auth.uid in resource.data.participants`, `request.auth.uid in resource.data.participantIds`, etc.

3. **Super Admin résiduel** : Bien que migré vers `VITE_SUPER_ADMIN_EMAILS`, des traces de l'email en dur existent encore dans `LoginPage.jsx`. Finaliser la migration vers Firestore uniquement.

### 🟡 Bugs & Améliorations — Priorité Moyenne

4. **Images messages en Firebase Storage** : Les images dans le chat sont stockées en base64 dans `localStorage`. `syncMessagesToFirestore` les remplace par un placeholder `[image]`. Il faut uploader vers Firebase Storage et stocker l'URL dans le message (TODO commenté dans le code).

5. **Assets locaux Earth3D** : Les textures du globe sont chargées depuis `unpkg.com` (CDN externe). Si le CDN est hors ligne, plus de globe. Il faut rapatrier les textures dans `public/`.

6. **Bug BoostModal `useNavigate`** : Une variable `navigate` est appelée mais non importée (aucune conséquence visible mais génère un avertissement console).

7. **`LegalPageLayout` prop `html`** : La prop `html` est documentée mais non rendue dans le composant.

### 🟢 Évolutions — Priorité Basse / Roadmap

8. **Stripe Connect en production** : L'infrastructure est prête (`stripe.account_id`, `payouts_enabled`, etc.) mais le flux n'est pas activé en live. Activer le reversement automatique UE.

9. **Allégement du build** : `public/bg-liquid.mp4` (27 Mo) non utilisé par défaut — à supprimer.

10. **TypeScript** : Le projet fait ~31 000 lignes en JS pur. L'ajout de TypeScript sur la couche `utils/` améliorerait la maintenabilité.

11. **Tests automatisés** : Un seul fichier de test (`scripts/ticket-seatversion.test.mjs`). Ajouter des tests d'intégration sur le flux paiement et le webhook.

12. **Harmonisation du design system** : Résoudre l'incohérence `--teal` (CLAUDE.md) vs violet/pink (code réel).

13. **Code mort** : `markRead` importé mais non utilisé dans Layout. `walletError` inerte dans AuctionSystem. Le tableau `services` dans `data/events.js`.

14. **i18n** : Tout est en français dur. Ghana est déjà dans `regions.js` (Afrique anglophone). Si l'app vise l'anglophone, prévoir une lib d'i18n.

---

## 16. Installation & Développement Local

### Prérequis

- **Node.js** ≥ 18
- **pnpm** (ou npm/yarn)

### Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/Chadyhage/liveinblack.git
cd liveinblack

# 2. Installer les dépendances
pnpm install

# 3. Copier le fichier d'environnement
cp .env.example .env.local
# Puis remplir les variables (voir §18)

# 4. Lancer le serveur de développement
pnpm run dev
# → http://localhost:5173
```

### Scripts disponibles

```bash
pnpm run dev        # Serveur Vite (hot-reload)
pnpm run build      # Build de production → dist/
pnpm run preview    # Serveur local sur le build prod
pnpm run test       # Tests unitaires (node --test scripts/*.test.mjs)
```

### Mode démo sans Firebase

Pour développer sans credentials Firebase, passer `USE_REAL_FIREBASE = false` dans `src/firebase.js`. L'app fonctionnera en mode purement local (localStorage), sans persistance cross-device.

> ⚠️ Ne JAMAIS commiter `USE_REAL_FIREBASE = false` ni les fichiers `.env.local`.

---

## 17. Déploiement & Configuration Vercel

### Déploiement automatique

Chaque push sur la branche `main` déclenche un build + déploiement automatique Vercel.

```bash
git add .
git commit -m "feat: description du changement"
git push origin main
# → Vercel build automatiquement
```

### `vercel.json`

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/:path*" },
    { "source": "/((?!api/).*)", "destination": "/" }
  ],
  "crons": [
    { "path": "/api/cron-subscriptions", "schedule": "0 8 * * *" }
  ]
}
```

- Les routes `/api/*` sont servis par les Vercel Functions.
- Toutes les autres routes renvoient vers `index.html` (SPA React).
- Le cron `cron-subscriptions` s'exécute tous les jours à 8h UTC.

### Webhook Stripe — Configuration

1. Dashboard Stripe → **Developers → Webhooks → Add endpoint**.
2. URL : `https://liveinblack.com/api/stripe-webhook`
3. Events à sélectionner :
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `account.updated` (pour Stripe Connect)
4. Copier le **Signing Secret** (`whsec_...`) → Variable `STRIPE_WEBHOOK_SECRET` dans Vercel.

### Firebase Admin — Service Account

1. Firebase Console → **Project Settings → Service Accounts → Generate new private key**.
2. Ouvrir le JSON et extraire : `project_id`, `client_email`, `private_key`.
3. Dans Vercel, coller la `private_key` **avec les `\n` littéraux** (ne pas transformer en vrais sauts de ligne).

---

## 18. Variables d'Environnement — Référence Complète

### Variables **VITE_** (exposées au frontend, préfixe obligatoire pour Vite)

| Variable | Valeur exemple | Description |
|:---|:---|:---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | Clé publique Stripe (TEST ou LIVE) |
| `VITE_SUPER_ADMIN_EMAILS` | `hagechady4@gmail.com` | Emails admin (séparés par `,`) — forcent le rôle `agent` au login |
| `VITE_FIREBASE_VAPID_KEY` | `BEl62i...` | Clé VAPID Firebase Cloud Messaging (notifications push) |

### Variables serveur (non exposées au frontend)

| Variable | Valeur exemple | Description |
|:---|:---|:---|
| `STRIPE_SECRET_KEY` | `sk_test_...` | Clé secrète Stripe — utilisée par `/api` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Secret de signature du Webhook Stripe |
| `FEDAPAY_SECRET_KEY` | `sk_sandbox_...` | Clé secrète FedaPay |
| `FEDAPAY_WEBHOOK_SECRET` | `wh_sandbox_...` | Secret webhook FedaPay |
| `FEDAPAY_API_BASE` | *(optionnel)* | Base URL FedaPay (déduite automatiquement de la clé si absent) |
| `FIREBASE_PROJECT_ID` | `liveinblack-15d30` | ID du projet Firebase |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxx@...` | Email du service account Firebase |
| `FIREBASE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\n...` | Clé privée complète du service account (avec `\n` **littéraux**) |
| `RESEND_API_KEY` | `re_...` | Clé API Resend (emails transactionnels) |
| `EMAIL_FROM` | `noreply@liveinblack.com` | Adresse expéditeur des emails |
| `PUBLIC_SITE_URL` | `https://liveinblack.com` | URL du site (pour les liens dans les emails) |
| `CRON_SECRET` | `un-secret-aléatoire` | Secret pour sécuriser le endpoint cron |

> 💡 **Règle IMPORTANT** : Les variables `FIREBASE_PRIVATE_KEY` doivent contenir des `\n` **littéraux** (deux caractères : backslash + n), pas de vrais sauts de ligne. Le code serveur fait `.replace(/\\n/g, '\n')` au runtime.

---

*Document généré le 2026-07-13. Pour toute question, commencer par `ONBOARDING.md` puis les fichiers utils/*.js, les mieux documentés du projet.*
