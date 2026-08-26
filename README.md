# LIVEINBLACK Web

Application web officielle de l'ecosysteme **LIVEINBLACK** : plateforme evenementielle connectant clients, organisateurs, prestataires, agents de terrain et equipe de moderation.

Le projet couvre la decouverte d'evenements, la billetterie, les paiements, les profils organisateurs/prestataires, la messagerie, la moderation, les notifications, les ventes sur place, les sitemaps SEO et les integrations mobiles.

## Sommaire

- [Vue d'ensemble](#vue-densemble)
- [Stack technique](#stack-technique)
- [Fonctionnalites](#fonctionnalites)
- [Architecture](#architecture)
- [Installation locale](#installation-locale)
- [Variables d'environnement](#variables-denvironnement)
- [Scripts npm](#scripts-npm)
- [Base de donnees](#base-de-donnees)
- [Tests et qualite](#tests-et-qualite)
- [CI/CD](#cicd)
- [Deploiement](#deploiement)
- [SEO, routes et redirections](#seo-routes-et-redirections)
- [Securite](#securite)
- [Documentation](#documentation)
- [Workflow de contribution](#workflow-de-contribution)
- [Depannage](#depannage)

## Vue d'ensemble

LIVEINBLACK Web est une application **Next.js App Router** orientee production. Elle sert a la fois :

- le site public : accueil, recherche, evenements, organisateurs, prestataires, blog, pages legales ;
- l'espace utilisateur authentifie : profil, billets, evenements suivis, messagerie, notifications ;
- les outils organisateur : creation et gestion d'evenements, statistiques, guestlist, equipe, payouts ;
- les outils prestataire : onboarding, catalogue, medias, avis, abonnement ;
- les outils agent/moderation : comptes, dossiers, evenements, paiements, suppressions, signalements, avis, actualite ;
- les API consommees par le web, les workflows internes et les clients mobiles.

Le projet est prive (`private: true`) et utilise `npm` comme gestionnaire de reference pour l'installation, le build et la CI.

## Stack technique

| Couche | Technologie |
| --- | --- |
| Framework | Next.js 16.3.3, App Router, React 19.2 |
| Langage | TypeScript |
| UI | CSS Modules, composants React locaux, `lucide-react`, `recharts` |
| Authentification | NextAuth/Auth.js v5 beta, MongoDB adapter |
| Donnees | MongoDB, Mongoose |
| Paiements | Stripe, FedaPay |
| Medias | Cloudinary |
| Emails | Resend |
| Push Web | Web Push / VAPID |
| Validation | Zod |
| Tests | Vitest, Playwright |
| Lint | ESLint 9, config Next |
| Deploiement | Vercel |
| Observabilite web | Vercel Analytics, Speed Insights, GA4 avec consentement cookies |

## Fonctionnalites

| Domaine | Fonctionnalites principales |
| --- | --- |
| Evenements | Listing public, recherche, details, interet utilisateur, playlists, boosts, rappels |
| Billetterie | Commande, paiement Stripe/FedaPay, billets QR, invitations, assignation, revente, remboursements |
| Organisateurs | Onboarding, studio, creation d'evenements, staff, guestlist, stats, payouts, media |
| Prestataires | Profil public, catalogue, medias, avis, abonnement, zone de facturation |
| Messagerie | Conversations directes et groupes, reactions, sondages, messages epingles, roles, mute, typing |
| Notifications | Centre de notifications, lecture individuelle/globale, push web |
| Agent / moderation | Gestion comptes, dossiers, avis, signalements, suppressions RGPD, paiements, actualite |
| Ventes terrain | Scanner, caisse sur place, ventes agent, settlements |
| Blog / SEO | Blog public, campagne de contenu Benin, sitemap index, sitemaps pagines, OpenGraph |
| Mobile | Scripts de verification des contrats API, auth, CORS, parcours client/agent |

## Architecture

### Arborescence principale

```text
.
├── app/                         # Routes App Router, pages, layouts et API
│   ├── (public)/                # Pages publiques
│   ├── (app)/                   # Espaces authentifies
│   ├── api/                     # Endpoints REST et webhooks
│   ├── components/              # Composants UI transverses
│   ├── sitemap.xml/             # Sitemap index dynamique
│   └── sitemaps/                # Sitemaps pagines par collection
├── lib/
│   ├── auth/                    # Helpers auth
│   ├── client/                  # Helpers navigateur
│   ├── db/                      # Connexion Mongo/Mongoose
│   ├── models/                  # Schemas Mongoose
│   ├── server/                  # Logique metier serveur
│   └── shared/                  # Logique partagee client/serveur
├── scripts/                     # Seed, ops, audits, checks mobile, migrations
├── e2e/                         # Tests Playwright
├── docs/                        # Documentation technique et fonctionnelle
├── public/                      # Assets statiques
├── types/                       # Types globaux
├── auth.ts                      # Configuration Auth.js
├── proxy.ts                     # Middleware/Proxy Next
├── next.config.ts               # Next, headers, redirects, images
├── vitest.config.ts             # Tests unitaires et integration conditionnelle
├── vitest.integration.config.ts # Suite integration dediee
├── playwright.config.ts         # Tests e2e
├── vercel.json                  # Regions, build, crons Vercel
└── tsconfig.build.json          # Type-check production hors tests
```

### Dossiers `app/`

| Dossier | Role |
| --- | --- |
| `app/(public)/home` | Page d'accueil publique |
| `app/(public)/events` | Liste et details publics des evenements |
| `app/(public)/organizers` | Annuaire organisateurs |
| `app/(public)/providers` | Annuaire prestataires |
| `app/(public)/blog` | Blog public |
| `app/(public)/search` | Recherche globale publique |
| `app/(app)/profile` | Profil, billets, preferences, suivis |
| `app/(app)/my-events` | Espace organisateur par evenement |
| `app/(app)/organizer-studio` | Studio organisateur multi-evenements |
| `app/(app)/offer-services` | Espace prestataire |
| `app/(app)/messages` | Messagerie |
| `app/(app)/notifications` | Centre de notifications |
| `app/(app)/scanner` | Scan billets |
| `app/(app)/on-site-sales` | Caisse terrain |
| `app/(app)/agent` | Back-office agent/moderation |
| `app/api/*` | API, webhooks, cron jobs, ressources mobiles |

### Dossiers `lib/server/`

| Dossier | Role |
| --- | --- |
| `agent/` | Garde agent et logique moderation |
| `emails/` | Envoi et templates email |
| `events/` | Evenements, guestlist, stats, sitemaps |
| `messaging/` | Conversations, messages, groupes, reactions |
| `organizer/` | Profils organisateurs, payouts, medias |
| `payments/` | Stripe, FedaPay, checkout, webhooks |
| `provider/` | Profils prestataires, catalogue, avis |
| `seo/` | Generation XML sitemap |
| `users/` | Recherche, blocage, signalement, presence |

## Installation locale

### Prerequis

- Node.js 22 recommande, aligne avec GitHub Actions.
- npm, via `package-lock.json`.
- MongoDB local ou Atlas.
- Docker facultatif mais pratique pour reproduire la CI Mongo replica set.
- Playwright Chromium pour les e2e.

### Premier demarrage

```bash
cp .env.example .env.local
npm ci
npm run dev
```

L'application demarre par defaut sur :

```text
http://localhost:3000
```

Si un serveur Next tourne deja, Next peut refuser un second lancement. Arreter l'ancien processus ou changer de port.

### Installation Playwright

```bash
npx playwright install chromium
```

En CI, les dependances systeme sont installees avec :

```bash
npx playwright install --with-deps chromium
```

## Variables d'environnement

Copier `.env.example` vers `.env.local`, puis renseigner les valeurs.

### Obligatoires en production

| Variable | Usage |
| --- | --- |
| `MONGODB_URI` | Connexion applicative MongoDB |
| `AUTH_SECRET` | Secret Auth.js |
| `PUBLIC_SITE_URL` | URL canonique publique |
| `CRON_SECRET` | Protection des routes cron sensibles |
| `STRIPE_SECRET_KEY` | API Stripe |
| `STRIPE_WEBHOOK_SECRET` | Verification webhook Stripe |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Cle publique Stripe |
| `FEDAPAY_SECRET_KEY` | API FedaPay |
| `FEDAPAY_WEBHOOK_SECRET` | Verification webhook FedaPay |
| `RESEND_API_KEY` | Emails transactionnels |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary |
| `CLOUDINARY_API_KEY` | Cloudinary |
| `CLOUDINARY_API_SECRET` | Cloudinary |
| `VAPID_PUBLIC_KEY` | Push web cote serveur |
| `VAPID_PRIVATE_KEY` | Push web cote serveur |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push web cote navigateur |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics 4, charge seulement apres consentement cookies |
| `GOOGLE_SITE_VERIFICATION` | Verification Google Search Console |
| `BING_SITE_VERIFICATION` | Verification Bing Webmaster Tools |

### Tests et developpement

| Variable | Usage |
| --- | --- |
| `MONGODB_TEST_URI` | Base jetable dediee aux tests d'integration |
| `SUPER_ADMIN_EMAILS` | Allowlist temporaire super-admin |

Important : `MONGODB_TEST_URI` doit cibler une base dont le nom contient `test`. La configuration Vitest refuse les noms non conformes pour eviter de vider une base applicative.

## Scripts npm

### Developpement et build

| Commande | Description |
| --- | --- |
| `npm run dev` | Serveur Next local |
| `npm run build` | Build production avec webpack |
| `npm run build:turbopack` | Build avec Turbopack |
| `npm run start` | Serveur production apres build |
| `npm run lint` | Lint complet |
| `npm run lint:core` | Lint cible utilise en CI |

### Tests

| Commande | Description |
| --- | --- |
| `npm run test` | Tous les tests Vitest inclus par config |
| `npm run test:unit` | Tests unitaires, exclut les fichiers integration |
| `npm run test:integration` | Integration avec `MONGODB_TEST_URI` obligatoire |
| `npm run test:integration:optional` | Integration ignoree si Mongo absent |
| `npm run test:e2e` | Playwright avec serveur gere par la config |
| `npm run test:e2e:local` | Playwright contre `http://127.0.0.1:3000` |
| `npm run test:ci` | Pipeline complet CI : lint, unit, integration, build, e2e |

### Donnees et maintenance

| Commande | Description |
| --- | --- |
| `npm run seed` | Seed de developpement |
| `npm run seed:blog` | Seed blog standard |
| `npm run seed:blog:benin` | Seed campagne blog Benin |
| `npm run audit:growth` | Audit croissance : SEO, campagne blog Benin, densite UI dashboard et analytics |
| `npm run audit:growth-analytics` | Audit des evenements de conversion publics et checkout |
| `npm run audit:blog:benin` | Audit de la campagne blog Benin |
| `npm run audit:ui-density` | Audit des grilles/cartes compactes sur les pages dashboard critiques |
| `npm run seed:bulk` | Seed volumineux |
| `npm run seed:bulk:clean` | Nettoyage seed volumineux |
| `npm run cloudinary:setup` | Creation/config preset prive Cloudinary |
| `npm run migrate:private-documents` | Migration documents applicatifs prives |
| `npm run db:ensure-indexes` | Verification/creation indexes Mongo |

### Checks mobile et operations

| Commande | Description |
| --- | --- |
| `npm run check:mobile-api` | Contrat API mobile |
| `npm run check:mobile-api:runtime` | Runtime API mobile |
| `npm run check:mobile-auth` | Auth mobile |
| `npm run check:mobile-feature-coverage` | Couverture fonctionnelle mobile |
| `npm run check:mobile-readiness` | Readiness mobile globale |
| `npm run check:mobile-web-cors` | CORS web/mobile |
| `npm run check:mobile-web-cors:local` | CORS local |
| `npm run check:mobile-web-smoke` | Smoke web mobile |
| `npm run check:mobile-web-smoke:fixture` | Smoke avec fixture |
| `npm run check:mobile-config` | Configuration mobile |
| `npm run check:mobile-client-flow` | Parcours client mobile |
| `npm run check:mobile-agent-flow` | Parcours agent mobile |
| `npm run check:mobile-password-flow` | Parcours mot de passe mobile |
| `npm run check:services` | Verification services de production |
| `npm run check:seo:prod` | Verification SEO production : URL canonique HTTPS, GA4, Search Console et Bing |
| `npm run ops:readiness` | Checklist readiness ops, incluant `audit:growth` avant les smoke/load |
| `npm run ops:deploy:prod` | Script de deploiement production |
| `npm run ops:smoke` | Smoke test production |
| `npm run ops:load` | Test de charge |

## Base de donnees

Le projet utilise MongoDB via Mongoose. Certaines operations et tests ont besoin d'un replica set pour supporter les transactions.

### Mongo local simple

Pour le developpement sans transactions :

```text
MONGODB_URI=mongodb://127.0.0.1:27017/liveinblack_dev
```

### Mongo replica set local

Exemple Docker proche de la CI :

```bash
docker run -d \
  --name liveinblack-mongo \
  -p 27017:27017 \
  mongo:7 \
  --replSet rs0 \
  --bind_ip_all

docker exec liveinblack-mongo mongosh --quiet --eval \
  'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })'
```

Puis :

```text
MONGODB_URI=mongodb://127.0.0.1:27017/liveinblack_dev?replicaSet=rs0
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/liveinblack_test?replicaSet=rs0
```

## Tests et qualite

### Verification rapide avant commit

```bash
npm run lint:core
npm run test:unit
npm run audit:growth
npm run build
```

### Verification complete locale

Avec Mongo replica set disponible :

```bash
npm run test:ci
```

### Integration

```bash
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/liveinblack_test?replicaSet=rs0 npm run test:integration
```

Les tests d'integration sont executes sequentiellement (`fileParallelism: false`) pour eviter qu'un fichier vide la base pendant qu'un autre test l'utilise.

### E2E

Playwright peut demarrer son propre serveur :

```bash
npm run test:e2e
```

Ou utiliser un serveur deja lance :

```bash
npm run dev
npm run test:e2e:local
```

Les rapports Playwright sont generes dans `playwright-report/` et les resultats dans `test-results/`. Ces dossiers ne doivent pas etre commits.

## CI/CD

Le workflow GitHub Actions est dans [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

Declencheurs :

- tous les `push` ;
- toutes les `pull_request`.

Etapes :

1. checkout ;
2. demarrage MongoDB 7 en replica set `rs0` ;
3. installation Node.js 22 ;
4. `npm ci` ;
5. installation Chromium Playwright ;
6. `npm run test:ci` ;
7. avant de publier, `npm run ops:readiness` relance aussi `audit:growth` pour bloquer une regression SEO, contenu Benin ou densite UI ;
8. upload du rapport Playwright si present.

Variables CI principales :

```text
CI=true
NEXT_TELEMETRY_DISABLED=1
AUTH_SECRET=ci-auth-secret
PUBLIC_SITE_URL=http://127.0.0.1:3000
MONGODB_URI=mongodb://127.0.0.1:27017/liveinblack_ci_app?replicaSet=rs0
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/liveinblack_ci_test?replicaSet=rs0
```

Le build production utilise `tsconfig.build.json` afin d'exclure les tests du type-check Next tout en les gardant couverts par Vitest.

## Deploiement

Le projet est configure pour Vercel via [vercel.json](./vercel.json).

| Configuration | Valeur |
| --- | --- |
| Framework | `nextjs` |
| Regions | `cdg1`, `iad1` |
| Installation | `npm ci` |
| Build | `npm run build` |
| Output Next | `standalone` |

### Cron jobs Vercel

| Route | Frequence |
| --- | --- |
| `/api/cron/payouts` | Tous les jours a 08:00 |
| `/api/cron/subscriptions` | Tous les jours a 07:00 |
| `/api/cron/seat-holds` | Tous les jours a 09:00 |
| `/api/cron/seat-hold-reminders` | Toutes les 30 minutes |
| `/api/cron/event-recap` | Toutes les heures |
| `/api/cron/resale-expiry` | Toutes les 15 minutes |
| `/api/cron/cash-sale-reminders` | Tous les jours a 10:00 |
| `/api/cron/interested-event-reminders` | Tous les jours a 11:00 |

Verifier que `CRON_SECRET` est configure en production avant activation.

## SEO, routes et redirections

### Routes SEO

| Route | Role |
| --- | --- |
| `/sitemap.xml` | Index XML des collections |
| `/sitemaps/[collection]/[page]` | Sitemap pagine par collection |
| `/robots.txt` | Robots public |
| `/opengraph-image` | Image OpenGraph dynamique |
| `/manifest.webmanifest` | Manifest PWA/public |

Collections sitemap :

- blog ;
- events ;
- organizers ;
- providers.

### Redirections

Les redirections sont centralisees dans `next.config.ts`. Elles conservent les anciennes URLs francaises et les aliases historiques vers les routes anglaises actuelles.

Exemples :

| Ancienne route | Nouvelle route |
| --- | --- |
| `/` | `/home` |
| `/accueil` | `/home` |
| `/evenements/:path*` | `/events/:path*` |
| `/organisateurs/:path*` | `/organizers/:path*` |
| `/prestataires/:path*` | `/providers/:path*` |
| `/messagerie` | `/messages` |
| `/profil` | `/profile` |
| `/admin/:path*` | `/agent/:path*` |

## Securite

### Headers

`next.config.ts` applique des headers globaux :

- `Content-Security-Policy` ;
- `Referrer-Policy` ;
- `X-Content-Type-Options` ;
- `X-Frame-Options` ;
- `Permissions-Policy` ;
- `Strict-Transport-Security`.

Les assets statiques en production recoivent aussi un `Cache-Control` long et immutable.

### Principes

- Ne jamais utiliser de base reelle comme `MONGODB_TEST_URI`.
- Ne jamais committer `.env.local`.
- Ne jamais deduire `PUBLIC_SITE_URL` de l'en-tete `Host` pour les URLs sensibles de paiement.
- Garder `CRON_SECRET` obligatoire en production.
- Garder les webhooks Stripe/FedaPay verifies par secret.
- Conserver les uploads sensibles sur Cloudinary avec preset signe/prive.
- Charger GA4 uniquement apres consentement cookies.

## Documentation

| Sujet | Document |
| --- | --- |
| Index documentation | [docs/README.md](./docs/README.md) |
| Architecture complete | [docs/architecture/ARCHITECTURE_COMPLETE.md](./docs/architecture/ARCHITECTURE_COMPLETE.md) |
| Architecture composants | [docs/architecture/COMPONENT_ARCHITECTURE.md](./docs/architecture/COMPONENT_ARCHITECTURE.md) |
| Modales et SlideOver | [docs/architecture/modals.md](./docs/architecture/modals.md) |
| Design system | [docs/design/DESIGN_SYSTEM.md](./docs/design/DESIGN_SYSTEM.md) |
| Cas d'usage | [docs/specs/USE_CASES.md](./docs/specs/USE_CASES.md) |
| Audit UX | [docs/specs/UX_AUDIT.md](./docs/specs/UX_AUDIT.md) |
| Plan QA | [docs/qa/QA_TEST_PLAN.md](./docs/qa/QA_TEST_PLAN.md) |
| Statut QA mobile API | [docs/qa/mobile-api-qa-status-2026-08-18.md](./docs/qa/mobile-api-qa-status-2026-08-18.md) |
| Production readiness 100k | [docs/ops/production-readiness-100k.md](./docs/ops/production-readiness-100k.md) |
| Couverture emails | [docs/ops/EMAIL_COVERAGE_PROPOSAL.md](./docs/ops/EMAIL_COVERAGE_PROPOSAL.md) |

Documents `.docx` disponibles :

- [Guide fonctionnel par role](./docs/specs/LiveInBlack_Guide_Fonctionnel_Par_Role.docx)
- [Specification fonctionnelle](./docs/specs/LiveInBlack_Specification_Fonctionnelle.docx)
- [Livre de recette QA](./docs/qa/LIVEINBLACK_Livre_de_recette_QA_complet.docx)

## Workflow de contribution

### Avant de coder

1. Lire [AGENTS.md](./AGENTS.md), surtout les consignes Next.js.
2. Verifier les guides dans `node_modules/next/dist/docs/` avant d'utiliser une API Next nouvelle ou modifiee.
3. Identifier si le changement concerne `app/`, `lib/server/`, `lib/shared`, les modeles ou les scripts.
4. Ajouter ou adapter les tests selon le risque.

### Pendant le developpement

- Placer la logique metier testable dans `lib/server/` ou `lib/shared/`.
- Garder les composants React concentres sur l'orchestration et le rendu.
- Eviter les actions sensibles sans confirmation explicite cote interface.
- Ne pas dupliquer les regles d'acces : utiliser les guards existants.
- Respecter les redirections et aliases existants.
- Preferer des helpers centralises pour les paiements, emails, SEO, push, auth et DB.

### Avant une PR ou un push important

```bash
npm run lint:core
npm run test:unit
npm run build
npm run test:e2e:local
```

Si Mongo replica set est disponible :

```bash
npm run test:ci
```

### Branches

Recommandation :

- developper sur une branche dediee ;
- ouvrir une PR vers `main` ;
- attendre GitHub Actions et Vercel ;
- merger uniquement avec CI verte.

## Depannage

### `MONGODB_TEST_URI doit cibler une base dont le nom contient "test"`

La suite protege les donnees. Utiliser une base comme :

```text
mongodb://127.0.0.1:27017/liveinblack_test
```

ou :

```text
mongodb://127.0.0.1:27017/liveinblack_ci_test?replicaSet=rs0
```

### Les tests d'integration echouent avec des transactions Mongo

Demarrer Mongo en replica set. Voir [Base de donnees](#base-de-donnees).

### Playwright ne peut pas demarrer le serveur

Si un serveur Next existe deja :

```bash
npm run test:e2e:local
```

Sinon arreter l'ancien processus ou changer le port via `PLAYWRIGHT_PORT`.

### `Another next dev server is already running`

Next detecte un serveur actif dans le meme projet. Utiliser le serveur existant, l'arreter, ou changer le port.

### Build local avec logs Mongo non bloquants

Certaines pages publiques et sitemaps tentent de lire Mongo au prerendu. Sans Mongo local disponible, des logs de connexion peuvent apparaitre. Le build peut tout de meme reussir si les erreurs sont gerees et si les routes dynamiques restent valides.

### Avertissement Cache-Control Next

Le build peut afficher un avertissement sur `/_next/static` et `/_next/image` lorsque les headers de cache custom sont actifs. C'est attendu par la configuration production, mais a surveiller apres chaque upgrade Next.

### Variables publiques non visibles cote navigateur

Next n'expose au navigateur que les variables prefixees `NEXT_PUBLIC_`. Pour VAPID, garder `VAPID_PUBLIC_KEY` et `NEXT_PUBLIC_VAPID_PUBLIC_KEY` synchronisees.

### Webhooks paiement non recus

Verifier :

- URL publique correcte dans Stripe/FedaPay ;
- secret webhook configure ;
- `PUBLIC_SITE_URL` configure ;
- logs Vercel de la route webhook ;
- mode sandbox/live coherent avec les cles utilisees.

## Etat attendu de reference

Un etat sain du projet doit passer :

```bash
npm run lint:core
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
```

En CI, cette sequence est executee par :

```bash
npm run test:ci
```

## Licence et propriete

Ce depot est prive et destine au projet client **LIVEINBLACK**. Ne pas reutiliser le code, les assets, la documentation ou les donnees hors du cadre autorise du projet.
