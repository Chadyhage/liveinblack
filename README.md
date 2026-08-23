# LIVEINBLACK Web

Application web Next.js 16 pour l’écosystème LIVEINBLACK.

## Démarrage local

```bash
npm ci
npm run dev
```

Application disponible sur `http://localhost:3000`.

## Documentation

Toute la documentation fonctionnelle, architecturale et opérationnelle est regroupée dans le dossier [`docs/`](./docs/README.md) :
- **[Architecture](./docs/architecture/ARCHITECTURE_COMPLETE.md)** — Découpage Next.js, Mongoose, Auth.js.
- **[Design System](./docs/design/DESIGN_SYSTEM.md)** — Tokens de couleurs, styles TypeScript inline.
- **[Spécifications & Use Cases](./docs/specs/USE_CASES.md)** — Guides fonctionnels et cas d'utilisation par rôle.
- **[Assurance Qualité & QA](./docs/qa/QA_TEST_PLAN.md)** — Plan de recettes et statut API.
- **[Opérations & Production](./docs/ops/production-readiness-100k.md)** — Preparation production & emails.

## Qualité et tests

Le projet sépare désormais clairement trois niveaux de vérification :

```bash
npm run lint:core
npm run test:unit
npm run test:integration
npm run test:integration:optional
npm run test:e2e
```

### Tests unitaires

- lancés via `npm run test:unit`
- n’exigent pas de base Mongo
- couvrent les helpers, la logique partagée et les contrats isolés

### Tests d’intégration

- lancés via `npm run test:integration`
- exigent `MONGODB_TEST_URI`
- utilisent une base dédiée dont le nom doit contenir `test`
- échouent explicitement si la variable manque, pour éviter un faux vert local

Si tu veux seulement laisser passer localement tant qu’aucune base d’intégration
n’est branchée, utilise :

```bash
npm run test:integration:optional
```

Exemple :

```bash
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/liveinblack_test npm run test:integration
```

### Tests end-to-end

- lancés via `npm run test:e2e`
- démarrent automatiquement l’application locale
- vérifient le smoke public et l’endpoint de santé
- si tu as déjà un serveur local ouvert, `npm run test:e2e:local` s’y branche directement via `PLAYWRIGHT_BASE_URL`

## CI GitHub

Le workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) s’exécute à chaque `push` et `pull_request` avec :

1. `lint:core`
2. `test:unit`
3. `test:integration`
4. `test:e2e`

La CI démarre un service Mongo dédié aux intégrations et aux smoke tests.

## Principes de robustesse à préserver

- garder la logique métier testable dans `lib/server` et `lib/shared`
- réserver les composants UI à l’orchestration et au rendu
- ajouter un test avant ou pendant chaque refactorisation à risque
- éviter les actions sensibles sans confirmation explicite côté interface
