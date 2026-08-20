# LIVEINBLACK Web

Application web Next.js 16 pour l’écosystème LIVEINBLACK.

## Démarrage local

```bash
npm ci
npm run dev
```

Application disponible sur `http://localhost:3000`.

## Qualité et tests

Le projet sépare désormais clairement trois niveaux de vérification :

```bash
npm run lint:core
npm run test:unit
npm run test:integration
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
