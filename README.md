# LIVEINBLACK Web

Application web de l'écosystème **LIVEINBLACK** — plateforme d'événements festifs connectant clients, organisateurs et prestataires.

**Stack :** Next.js 16 · MongoDB · NextAuth v5 · Stripe · FedaPay · Resend · Cloudinary · Vercel

---

## Démarrage local

```bash
cp .env.example .env.local   # renseigner les variables d'environnement
npm ci
npm run dev                  # → http://localhost:3000
```

---

## Fonctionnalités principales

| Domaine | Détail |
|---|---|
| 🎟 **Billetterie** | Achat Stripe & FedaPay, code promo, protection annulation, QR code, revente |
| 🎪 **Organisateurs** | Création d'événements (wizard), guestlist, stats, équipe, payout |
| 🛎 **Prestataires** | Catalogue services, portfolio, avis, onboarding |
| 💬 **Messagerie** | Conversations directes & groupes, médias, sondages, réactions |
| 🔔 **Notifications** | Push Web (VAPID), centre de notifications in-app |
| 📱 **Ventes sur place** | Scanner QR, caisse mobile |
| 🛡 **Modération** | Back-office agent — dossiers, signalements, suppressions RGPD |

---

## Architecture

```
app/
├── (public)/     → Pages publiques (home, events, providers, organizers, blog…)
├── (app)/        → Espace privé authentifié (dashboard par rôle)
│   ├── profile/          Profil & portefeuille billets
│   ├── my-events/        Gestion événements organisateur
│   ├── organizer-studio/ Studio multi-événements
│   ├── offer-services/   Profil prestataire
│   ├── messages/         Messagerie temps réel
│   ├── scanner/          Scanner QR à l'entrée
│   ├── on-site-sales/    Caisse sur place
│   └── agent/            Back-office modération
└── api/          → 35 groupes d'endpoints REST

lib/
├── server/       → Logique métier serveur (messaging, events, organizer, provider…)
├── shared/       → Utilitaires partagés client/serveur
└── models/       → Schémas Mongoose

docs/             → Documentation (architecture, design system, specs, QA, ops)
```

---

## Tests

```bash
npm run lint:core                  # Lint ESLint
npm run test:unit                  # Tests unitaires (Vitest, sans Mongo)
npm run test:integration           # Tests d'intégration (nécessite MONGODB_TEST_URI)
npm run test:integration:optional  # Intégration optionnelle (passe si Mongo absent)
npm run test:e2e                   # Tests end-to-end (Playwright)
```

**Tests d'intégration** — nécessitent une base dédiée dont le nom contient `test` :

```bash
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/liveinblack_test npm run test:integration
```

**Tests e2e** — si un serveur tourne déjà :

```bash
npm run test:e2e:local
```

---

## CI / GitHub Actions

Le workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) s'exécute sur chaque `push` et `pull_request` :

1. `lint:core`
2. `test:unit`
3. `test:integration` (avec service Mongo dédié)
4. `test:e2e`

---

## Documentation

| Catégorie | Fichier |
|---|---|
| Architecture | [`docs/architecture/ARCHITECTURE_COMPLETE.md`](./docs/architecture/ARCHITECTURE_COMPLETE.md) |
| Design System | [`docs/design/DESIGN_SYSTEM.md`](./docs/design/DESIGN_SYSTEM.md) |
| Spécifications | [`docs/specs/USE_CASES.md`](./docs/specs/USE_CASES.md) |
| QA & Recette | [`docs/qa/QA_TEST_PLAN.md`](./docs/qa/QA_TEST_PLAN.md) |
| Production | [`docs/ops/production-readiness-100k.md`](./docs/ops/production-readiness-100k.md) |
| Index complet | [`docs/README.md`](./docs/README.md) |

---

## Principes de développement

- Logique métier testable dans `lib/server/` et `lib/shared/`
- Composants UI réservés à l'orchestration et au rendu
- Un test par refactorisation à risque
- Aucune action sensible sans confirmation explicite côté interface
