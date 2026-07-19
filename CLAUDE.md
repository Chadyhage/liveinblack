@AGENTS.md

# LIVEINBLACK — Guide pour Claude

## C'est quoi ce projet ?
Marketplace événementielle / nightlife en français (billetterie, organisateurs d'événements, prestataires de services). Déployé sur **liveinblack.com**.

**Ce repo root EST l'app de production désormais.** Il a remplacé l'ancien `web/` (repo restructuré : tout le Next.js/TypeScript/MongoDB vit maintenant directement à la racine — `app/`, `lib/`, `package.json`, etc.). C'est un **port/réécriture complet** de l'ancienne stack Vite/React/Firebase vers Next.js + TypeScript + MongoDB, fait phase par phase avec un objectif de **fidélité fonctionnelle stricte** à l'app legacy (mêmes fonctionnalités, même comportement, mêmes bugs connus documentés — seule la techno change).

## `old/` — legacy, gelé, référence uniquement
`old/` contient l'ancienne app Vite + React + Firebase (`old/src`, `old/api`, `old/lib`), qui est **retirée** : elle ne tourne plus, ne se déploie plus, et **ne doit jamais être exécutée, modifiée, ou lancée**. Elle est conservée uniquement comme **source de vérité pour la fidélité** : quand il faut vérifier le comportement exact d'une feature legacy avant de la porter/corriger ici, lire le fichier source réel sous `old/src` ou `old/api` — ne jamais se fier à une description ou à `old/CLAUDE.md` (qui documente l'ancienne stack, pas celle-ci). Ne jamais écrire sous `old/`.

## Stack technique (cette app)
- **Framework** : Next.js 16 (App Router) — voir `node_modules/next/dist/docs/` pour les APIs, ce n'est **pas** le Next.js standard de l'entraînement (`middleware.ts` est déprécié → remplacé par `proxy.ts` à la racine, entre autres breaking changes). Lire `AGENTS.md` avant d'écrire du code.
- **Langage** : TypeScript
- **Base de données** : MongoDB via Mongoose (remplace Firestore) — connexion dans `lib/db/mongoose.ts` (+ `lib/db/mongodb-client.ts` pour l'adapter Auth.js)
- **Auth** : Auth.js v5 (`next-auth` beta) — config dans `auth.ts` à la racine, provider Credentials + `MongoDBAdapter`, stratégie **JWT obligatoire** (Auth.js ne persiste pas de session en base pour Credentials). Remplace Firebase Auth.
- **Images** : Cloudinary (remplace le stockage Firebase)
- **Paiements** : Stripe (rail EUR) + FedaPay (rail XOF, mobile money) — `lib/server/stripeClient.ts`, `lib/server/fedapayClient.ts`. Les clés secrètes peuvent être absentes en local/sandbox : tout appel provider doit échouer proprement, jamais inventer de credentials.
- **Temps réel** : **polling uniquement, jamais de WebSockets** — décision assumée pour cette migration (voir commentaires dans `lib/server/messaging.ts` et `lib/server/presence.ts`). Ne pas introduire d'infra websocket/SSE.
- **Tests** : Vitest (`npm test` = `vitest run`)
- **Lint/typecheck** : `npx eslint` (scope au fichier touché), `npx tsc --noEmit -p .`

## Design system — inline styles, pas de Tailwind
Tout le style des composants applicatifs est fait avec des **objets `style={{}}` inline en TypeScript**, utilisant des **CSS custom properties**. Tailwind est actuellement importé (`@import "tailwindcss"` dans `app/globals.css`) et `app/layout.tsx` l'utilise pour quelques classes utilitaires de mise en page sur `<html>`/`<body>` (`h-full`, `antialiased`, `min-h-full`, `flex`, `flex-col`) — ce n'est donc pas une devDependency totalement inerte. Mais ce n'est PAS la convention de ce port : ne pas introduire de nouvelles classes Tailwind dans les composants applicatifs, rester sur le pattern `style={{}}` + `var(--*)` ci-dessous.

Tokens définis dans `app/globals.css` (`:root`) :
- `--obsidian` (#04040b) — fond
- `--surface` (#0e0f16) — cartes
- `--surface-2` (#12131c) — modals/menus
- `--teal` (#4ee8c8) — accent principal
- `--teal-solid` (#3ed6b5) — CTA teal plein
- `--gold` (#c8a96e) — accent secondaire (agent, éléments premium)
- `--pink` (#e05aaa) — badges
- `--violet` (#8b5cf6)
- `--border` (rgba blanc 0.08) / `--border-strong` (rgba blanc 0.18)
- `--text` (blanc) / `--text-muted` (rgba blanc 0.6) / `--text-faint` (rgba blanc 0.4)

Convention observée dans le code existant (ex. `app/components/AgentDashboardClient.tsx`) : constantes de style typées `React.CSSProperties` extraites en haut de fichier pour les styles réutilisés dans un composant, `style={{ ... }}` inline pour le reste. Suivre ce pattern plutôt que d'introduire des CSS modules ou du Tailwind.

## Modèle de comptes multi-rôles
Un compte peut porter **plusieurs rôles simultanément** (décision prise en cours de migration — voir commentaire dans `lib/models/User.ts`) :
- `roles: string[]` — tout ce que le compte a le droit d'utiliser, parmi `client`, `organisateur`, `prestataire`, `agent`
- `activeRole` — l'interface actuellement affichée
- Les guards (`lib/server/permissions.ts`, `proxy.ts`) vérifient **toujours `activeRole`, jamais `roles` directement**
- Statuts d'approbation **par rôle** : `orgStatus` / `prestStatus` (`none` / `pending` / `active` / `rejected`), distincts du `status` global du compte — un organisateur déjà actif qui candidate en plus comme prestataire ne doit pas se retrouver bloqué de ses deux interfaces pendant la review du second dossier (bug legacy déjà corrigé une fois, ne pas le réintroduire)

`proxy.ts` (racine) fait la vérification d'UX rapide par préfixe de route à partir de la session JWT seule — ce n'est **pas** la frontière de sécurité ; chaque route handler qui mute des données revérifie identité + rôle + propriété de la ressource côté serveur dans `lib/server/*`.

## Règle à ne jamais casser : `voteOnPoll`
`lib/server/polls.ts` : `voteOnPoll` gère **un seul mécanisme combiné** pour les messages de type `'poll'` **ET** `'event_poll'` — un seul garde (`type !== 'poll' && type !== 'event_poll'`) couvre les deux. Ne jamais séparer cette logique en deux chemins distincts : un des deux types de sondage se retrouverait avec un vote qui no-op silencieusement.

## Où trouver les choses
- `app/(public)/` — route group des pages publiques (accueil, événements, recherche, providers/organizers directory, login, signup, legal, etc.), pas d'auth requise
- `app/(app)/` — route group des pages qui nécessitent une session (messages, profil, my-events, organizer-studio, offer-services, agent, scanner, playlist, onboarding, my-subscription, my-shifts, order, my-application) — le layout revérifie la session côté serveur (défense en profondeur derrière `proxy.ts`)
- `app/api/` — route handlers Next.js (API REST interne)
- `app/components/` — composants partagés client (ex. `AgentDashboardClient.tsx`, `AgentDossiersClient.tsx`, `AgeVerificationGate.tsx`)
- `lib/models/` — schémas Mongoose (remplace les collections Firestore)
- `lib/server/` — toute la logique métier/serveur (accès data, règles, agrégations) ; tests unitaires dans `lib/server/__tests__`
- `lib/shared/` — logique pure/isomorphe portée du legacy `src/utils/*.js` (money, fees, event-time, regions, providerCategories, etc.), testée dans `lib/shared/__tests__`
- `lib/db/` — connexions MongoDB (`mongoose.ts`) et client Auth.js adapter (`mongodb-client.ts`)
- `lib/client/` — logique côté navigateur (ex. `musicEngine.ts`)
- `auth.ts` (racine) — config Auth.js v5
- `proxy.ts` (racine) — remplace `middleware.ts` (déprécié en Next 16), guards de route par préfixe
- `scripts/seed-dev.ts` — seed de données de dev (`npm run seed`)

## Convention `useEffect` + fetch
Ne jamais appeler directement une fonction async de portée externe comme corps de `useEffect`. Définir la logique de fetch **inline**, dans une fonction async locale à l'intérieur de l'effet, avec un flag `cancelled` pour éviter les mises à jour d'état après démontage — pattern déjà utilisé dans `app/components/AgentDossiersClient.tsx` et `app/(app)/messages/MessagesClient.tsx`, à répliquer partout ailleurs.
