# Audit live Vercel — 2026-09-01

Projet lie:

- `prj_X6bYRp4uhDdQYQnHIzU2aw6cWZhg`
- `team_h4mKccT2DjY86oK09CGLnWaa`

Resultat du dernier audit live avec acces reseau autorise:

- APIs Vercel accessibles: 6/6.
- Configuration live actuelle: 5/6.
- Variables production visibles: 29.
- Deployments recents visibles: 5.
- Domaines projet visibles: 3.
- Regles Firewall stagees en brouillon: 5.
- Edge Config visible: 1 (`liveinblack-ops`, 5 items).
- Edge Config consommee par le runtime: oui.
- `EDGE_CONFIG` activee dans Vercel: production et development. Preview attend une branche precise.
- Spend Management webhook prepare cote site: `/api/ops/vercel-spend`.
- Webhook Vercel plateforme prepare cote site: `/api/ops/vercel-events`.
- Page agent des evenements Vercel preparee: `/agent/vercel`, APIs `/api/agent/vercel/ops-events` et `/api/agent/vercel/ops-config`.
- Drains observabilite: 0.

Regles Firewall stagees:

- `LIB Log exploit probes`
- `LIB Log checkout pressure`
- `LIB Log auth pressure`
- `LIB Log search pressure`
- `LIB Log webhook pressure`

Etat important:

- Ces regles sont en brouillon Vercel.
- Elles ne sont pas publiees en production.
- Elles journalisent/observent d'abord le trafic; elles ne doivent etre durcies qu'apres revue des hits reels.

Manquant cote Vercel Dashboard:

- Variables d'environnement visibles: 29.
- Variables obligatoires: OK apres retrait du faux pre-requis `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` non consomme par le site.
- Variables optionnelles encore absentes: `VERCEL_EDGE_CONFIG_READ_TOKEN`, `SUPER_ADMIN_EMAILS`, `BING_SITE_VERIFICATION`, `YANDEX_SITE_VERIFICATION`, `PINTEREST_SITE_VERIFICATION`, `DRAIN_SECRET`, `VERCEL_DRAIN_URL`, `ERROR_WEBHOOK_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- Pilotage Edge Config agent: lecture active; ecriture active seulement apres ajout de `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID` et `VERCEL_EDGE_CONFIG_ID`; changements historises dans `VercelOpsConfigChange`.
- Drains observabilite: 0.

Prochaine action:

1. Lier `liveinblack-ops` au projet Vercel pour injecter `EDGE_CONFIG` avec `npm run ops:vercel:edge-config:activate -- --apply`; pour Preview, ajouter `VERCEL_PREVIEW_GIT_BRANCH=nom-de-branche`.
2. Ajouter `DRAIN_SECRET` en production Vercel des que le secret du drain est connu.
3. Activer Spend Management dans Vercel Billing, pointer le webhook vers `/api/ops/vercel-spend`, puis ajouter `VERCEL_SPEND_WEBHOOK_SECRET`.
4. Creer un webhook Vercel Account vers `/api/ops/vercel-events`, puis ajouter `VERCEL_ACCOUNT_WEBHOOK_SECRET`.
5. Creer un drain observabilite avec `VERCEL_DRAIN_URL=https://ton-domaine.com/api/ops/vercel-drain npm run ops:vercel:drain:setup -- --apply`, ou brancher une integration type Sentry/Datadog/Honeycomb.
6. Publier les regles Firewall uniquement apres revue dashboard.
7. Relancer `npm run audit:vercel-env`.
8. Relancer `npm run audit:vercel-live`.

Note de securite:

- Un Log Drain exporte les logs runtime Vercel vers un endpoint persistant.
- Meme avec signature HMAC et retention courte, il peut transporter des traces techniques sensibles selon ce que l'application journalise.
- L'activation live doit donc etre explicitement approuvee avant creation.
