# LIVEINBLACK — Guide pour Claude

## C'est quoi ce projet ?
Marketplace événementielle / nightlife en français. Les utilisateurs peuvent acheter des billets, les organisateurs créent des événements, les prestataires proposent des services. Déployé sur **liveinblack.com** via Vercel (auto-deploy sur push GitHub).

## Stack technique
- **Frontend** : React + Vite + Tailwind CSS
- **Auth + DB** : Firebase (Auth + Firestore)
- **Hébergement** : Vercel (repo GitHub : `Chadyhage/liveinblack`)
- **Fonts** : Bebas Neue (titres), Playfair Display (logo BLACK), DM Mono (UI)

## Design system
- **Palette** : `--obsidian` (#04040b) fond, `--teal` (#4ee8c8) accent principal, `--gold` (#c8a96e) accent secondaire (logo, agent), `--pink` (#e05aaa) badges
- **Logo** : `L|VE IN` (Bebas Neue) + `BLACK` (Playfair Display italic) — le `|` est une barre blanche verticale
- **Nav labels** : DM Mono uppercase, 10px, letterSpacing 0.2em
- **Texture** : grain SVG en `body::after` (opacity 0.035) + backdrop blur sur sidebar
- **NE PAS** utiliser #d4af37 (ancien gold) — utiliser var(--gold) ou var(--teal)

## Architecture src/
```
src/
  components/
    Layout.jsx          — Sidebar desktop + header mobile + bottom nav mobile
    SideMenu.jsx        — Menu hamburger
    AuthModal.jsx       — Modal de connexion (pour routes protégées)
    AgeVerificationModal.jsx
    BoostModal.jsx
    LiquidMetalBg.jsx
    Earth3D.jsx         — Globe 3D sur HomePage
    PlaylistSystem.jsx
    RegionSelector.jsx
  pages/
    HomePage.jsx        — Accueil avec Top 3 événements
    EventsPage.jsx      — Liste tous les événements
    EventDetailPage.jsx — Détail + achat billet
    MessagingPage.jsx   — Chat (conversations + groupes)
    MesEvenementsPage.jsx — Gestion événements (organisateur)
    ProposerServicesPage.jsx — Catalogue prestataire
    ScannerPage.jsx     — Scan QR billets (agent)
    AgentPage.jsx       — Interface agent/admin
    WalletPage.jsx      — Portefeuille
    ProfilePage.jsx     — Profil utilisateur
    LoginPage.jsx       — Connexion / inscription
    TicketPage.jsx      — Billet acheté
    MonDossierPage.jsx  — Dossier candidature
    OnboardingOrganisateur.jsx
    OnboardingPrestataire.jsx
    CGUPage.jsx
    JeSuisUneBoitePage.jsx
  utils/
    firestore-sync.js   — Sync Firestore (syncDoc, syncOnLogin, pushLocalToFirestore)
    messaging.js        — Conversations, amis, groupes, polls, block/report
    wallet.js           — Portefeuille (localStorage + Firestore)
    ticket.js           — Billets, boosts
    services.js         — Catalogue prestataire, commandes
    accounts.js         — Validations agent, getTotalPendingCount
    applications.js     — Candidatures organisateur/prestataire
    permissions.js      — Rôles et permissions
    cropImage.js        — Recadrage avatar
  context/
    AuthContext.js      — useAuth(), openAuthModal()
  data/
    events.js           — Événements statiques de démo
    regions.js          — Régions disponibles
```

## Rôles utilisateurs
| Rôle | Nav items |
|------|-----------|
| (non connecté) | Accueil, Événements |
| `client` | Accueil, Événements, Messages |
| `organisateur` | Accueil, Événements, Messages, Mes Events, Services |
| `prestataire` | Accueil, Événements, Messages, Mon Espace |
| `agent` | Accueil, Événements, Messages, Services + bouton Admin |

## Firestore — architecture write-through cache
- **Principe** : localStorage pour les lectures (sync), Firestore pour la persistance cross-device
- **Écriture** : localStorage d'abord, puis `syncDoc()` fire-and-forget
- **Login** : `syncOnLogin(uid)` charge Firestore → localStorage
- **Collections** : `wallets/{uid}`, `user_bookings/{uid}`, `user_events/{uid}`, `conversations/{id}`, `conv_messages/{id}`, `user_social/{uid}`, `catalogs/{uid}`, `providers/{uid}`, `service_orders/{id}`, `group_bookings/{id}`
- **Import dans les pages** : `import('../utils/firestore-sync').then(({ syncDoc }) => { ... })` (dynamic import, pas static)

## Props Layout importants
```jsx
<Layout hideNav>        // cache la bottom nav mobile (ex: page detail)
<Layout chatMode>       // full-screen chat, cache header + bottom nav
<Layout>               // normal
```

## Points importants à ne PAS casser
- `handleProtectedNav(path)` dans Layout — redirige vers AuthModal si non connecté
- `voteOnPoll` dans messaging.js gère les types `'poll'` ET `'event_poll'`
- Le bottom nav mobile est `fixed` (pas `sticky`) dans le zip/déployé
- `openAuthModal` vient de `useAuth()` dans AuthContext

## État du projet (avril 2026)
- Design validé et déployé sur liveinblack.com
- Firestore sync implémenté sur tous les utils principaux
- Messagerie complète (groupes, polls, block/report, réactions)
- Scanner QR fonctionnel
- Portefeuille fonctionnel
- Onboarding organisateur/prestataire présent

## À faire / idées en cours
- Tester la sync Firestore cross-device en conditions réelles
- Vérification de la validation des candidatures côté agent
